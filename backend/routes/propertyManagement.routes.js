const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { pool } = require('../config/database');
const { verificarToken, requireDepartment } = require('../middleware/auth.middleware');

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 75 * 1024 * 1024 }
});
const access = [verificarToken, requireDepartment('property-management')];
const VALID_DOCUMENT_TYPES = new Set([
    'general_ledger',
    'dimension_balances',
    'schedule_export',
    'supporting_file'
]);

function parseJson(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'object' && !Buffer.isBuffer(value)) return value;

    try {
        return JSON.parse(String(value));
    } catch {
        return fallback;
    }
}

function normalizeYear(value) {
    const year = Number(value || 2026);
    return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : 2026;
}

function normalizeMonth(value) {
    if (value === undefined || value === null || value === '') return null;
    const month = Number(value);
    return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}

function getUserId(req) {
    return Number(req.usuario?.id || req.usuario?.usuario_id || 0) || null;
}

function getDepartmentId(req) {
    return Number(req.departamento?.id || req.usuario?.departamento_id || 0) || null;
}

function tableSetupMessage(error, res) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) {
        res.status(503).json({
            success: false,
            code: 'PROPERTY_MANAGEMENT_TABLES_MISSING',
            message: 'Run the Property Management schedule SQL migration first.'
        });
        return true;
    }

    return false;
}

function normalizeDocumentType(value) {
    const type = String(value || 'supporting_file').trim().toLowerCase();
    return VALID_DOCUMENT_TYPES.has(type) ? type : 'supporting_file';
}

function documentLabel(type) {
    const labels = {
        general_ledger: 'General Ledger report',
        dimension_balances: 'Dimension balances report',
        schedule_export: 'Schedule export',
        supporting_file: 'Supporting file'
    };
    return labels[type] || labels.supporting_file;
}

function parseSchedulePayload(body = {}) {
    const data = parseJson(body.datos_json, body.datos || body.data || {});
    const rows = Array.isArray(body.rows)
        ? body.rows
        : Array.isArray(data?.rows)
            ? data.rows
            : [];
    const headers = Array.isArray(body.headers)
        ? body.headers
        : Array.isArray(data?.headers)
            ? data.headers
            : [];

    return {
        headers,
        rows,
        source: data?.source || 'property-management',
        savedAt: new Date().toISOString()
    };
}

async function syncScheduleDocuments(scheduleId, documentIds) {
    const ids = Array.isArray(documentIds)
        ? documentIds.map(id => Number(id)).filter(Number.isInteger)
        : [];

    await pool.query(
        'DELETE FROM property_management_schedule_documentos WHERE schedule_id = ?',
        [scheduleId]
    );

    if (!ids.length) return;

    await pool.query(
        `INSERT IGNORE INTO property_management_schedule_documentos
         (schedule_id, documento_id)
         VALUES ?`,
        [ids.map(id => [scheduleId, id])]
    );
}

router.get('/documents', ...access, async (req, res) => {
    try {
        const params = [];
        let where = '';

        if (req.usuario?.rol !== 'admin' && getDepartmentId(req)) {
            where = 'WHERE departamento_id = ? OR departamento_id IS NULL';
            params.push(getDepartmentId(req));
        }

        const [rows] = await pool.query(
            `SELECT id,
                    usuario_id,
                    departamento_id,
                    tipo_documento,
                    nombre_original,
                    tamano_bytes,
                    tipo_mime,
                    hash_archivo,
                    periodo_anio,
                    periodo_mes,
                    estado,
                    metadata_json,
                    fecha_carga,
                    fecha_actualizacion,
                    archivo_blob IS NOT NULL AS tiene_archivo
             FROM property_management_documentos
             ${where}
             ORDER BY fecha_carga DESC, id DESC`,
            params
        );

        res.json({
            success: true,
            documents: rows.map(row => ({
                ...row,
                tipo_label: documentLabel(row.tipo_documento),
                metadata_json: parseJson(row.metadata_json, {})
            }))
        });
    } catch (error) {
        console.error('Property Management documents could not be loaded:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Documents could not be loaded' });
    }
});

router.post('/documents', ...access, upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No document was received' });
        }

        const type = normalizeDocumentType(req.body.tipo_documento);
        const year = normalizeYear(req.body.periodo_anio);
        const month = normalizeMonth(req.body.periodo_mes);
        const metadata = parseJson(req.body.metadata_json, {});
        const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

        const [existing] = await pool.query(
            `SELECT id
             FROM property_management_documentos
             WHERE tipo_documento = ?
               AND hash_archivo = ?
               AND periodo_anio = ?
               AND periodo_mes <=> ?
             LIMIT 1`,
            [type, hash, year, month]
        );

        if (existing.length) {
            await pool.query(
                `UPDATE property_management_documentos
                 SET usuario_id = ?,
                     departamento_id = ?,
                     metadata_json = ?,
                     estado = 'loaded'
                 WHERE id = ?`,
                [
                    getUserId(req),
                    getDepartmentId(req),
                    JSON.stringify(metadata),
                    existing[0].id
                ]
            );

            return res.json({
                success: true,
                reused: true,
                document: { id: existing[0].id }
            });
        }

        const [result] = await pool.query(
            `INSERT INTO property_management_documentos
             (usuario_id, departamento_id, tipo_documento, nombre_original,
              nombre_servidor, tamano_bytes, tipo_mime, archivo_blob, hash_archivo,
              periodo_anio, periodo_mes, estado, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'loaded', ?)`,
            [
                getUserId(req),
                getDepartmentId(req),
                type,
                req.file.originalname,
                `${Date.now()}-${req.file.originalname}`,
                req.file.size,
                req.file.mimetype,
                req.file.buffer,
                hash,
                year,
                month,
                JSON.stringify(metadata)
            ]
        );

        res.status(201).json({
            success: true,
            document: { id: result.insertId }
        });
    } catch (error) {
        console.error('Property Management document could not be saved:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Document could not be saved' });
    }
});

router.get('/documents/:id/download', ...access, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT nombre_original,
                    tipo_mime,
                    archivo_blob
             FROM property_management_documentos
             WHERE id = ?
             LIMIT 1`,
            [req.params.id]
        );

        if (!rows.length || !rows[0].archivo_blob) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        const file = rows[0];
        const content = Buffer.isBuffer(file.archivo_blob)
            ? file.archivo_blob
            : Buffer.from(file.archivo_blob);

        res.setHeader('Content-Type', file.tipo_mime || 'application/octet-stream');
        res.setHeader('Content-Length', content.length);
        res.setHeader(
            'Content-Disposition',
            `attachment; filename*=UTF-8''${encodeURIComponent(file.nombre_original)}`
        );
        res.send(content);
    } catch (error) {
        console.error('Property Management document could not be downloaded:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Document could not be downloaded' });
    }
});

router.delete('/documents/:id', ...access, async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        await connection.query(
            `DELETE FROM property_management_schedule_documentos
             WHERE documento_id = ?`,
            [req.params.id]
        );

        const [result] = await connection.query(
            `DELETE FROM property_management_documentos
             WHERE id = ?`,
            [req.params.id]
        );

        if (!result.affectedRows) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        await connection.commit();
        res.json({ success: true, message: 'Document deleted successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Property Management document could not be deleted:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Document could not be deleted' });
    } finally {
        connection.release();
    }
});

router.get('/schedules', ...access, async (req, res) => {
    try {
        const params = [];
        let where = '';

        if (req.usuario?.rol !== 'admin' && getDepartmentId(req)) {
            where = 'WHERE s.departamento_id = ? OR s.departamento_id IS NULL';
            params.push(getDepartmentId(req));
        }

        const [rows] = await pool.query(
            `SELECT s.id,
                    s.usuario_id,
                    s.departamento_id,
                    s.nombre,
                    s.periodo_anio,
                    s.periodo_mes,
                    s.total_tiendas,
                    s.total_filas,
                    s.balance_total,
                    s.estado,
                    s.fecha_creacion,
                    s.fecha_actualizacion,
                    u.nombre_completo AS usuario_nombre
             FROM property_management_schedules s
             LEFT JOIN usuarios u ON u.id = s.usuario_id
             ${where}
             ORDER BY s.fecha_actualizacion DESC, s.id DESC`,
            params
        );

        res.json({ success: true, schedules: rows });
    } catch (error) {
        console.error('Property Management schedules could not be loaded:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Schedules could not be loaded' });
    }
});

router.get('/schedules/:id', ...access, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT *
             FROM property_management_schedules
             WHERE id = ?
             LIMIT 1`,
            [req.params.id]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Schedule not found' });
        }

        const [documents] = await pool.query(
            `SELECT documento_id
             FROM property_management_schedule_documentos
             WHERE schedule_id = ?`,
            [req.params.id]
        );
        const schedule = rows[0];

        schedule.datos_json = parseJson(schedule.datos_json, {});

        res.json({
            success: true,
            schedule,
            documentIds: documents.map(row => row.documento_id)
        });
    } catch (error) {
        console.error('Property Management schedule could not be loaded:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Schedule could not be loaded' });
    }
});

router.post('/schedules', ...access, async (req, res) => {
    try {
        const scheduleData = parseSchedulePayload(req.body);
        const rows = scheduleData.rows;
        const storeCount = Number(req.body.total_tiendas || 0);
        const totalRows = Number(req.body.total_filas || rows.length || 0);
        const totalBalance = Number(req.body.balance_total || 0);
        const name = String(req.body.nombre || 'Schedule 2026').trim().slice(0, 180);
        const year = normalizeYear(req.body.periodo_anio);
        const month = normalizeMonth(req.body.periodo_mes);

        if (!rows.length) {
            return res.status(400).json({ success: false, message: 'The schedule does not have rows to save' });
        }

        const [result] = await pool.query(
            `INSERT INTO property_management_schedules
             (usuario_id, departamento_id, nombre, periodo_anio, periodo_mes,
              datos_json, total_tiendas, total_filas, balance_total, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                getUserId(req),
                getDepartmentId(req),
                name,
                year,
                month,
                JSON.stringify(scheduleData),
                storeCount,
                totalRows,
                totalBalance,
                req.body.estado || 'draft'
            ]
        );

        await syncScheduleDocuments(result.insertId, req.body.documentIds);

        res.status(201).json({
            success: true,
            schedule: { id: result.insertId }
        });
    } catch (error) {
        console.error('Property Management schedule could not be saved:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Schedule could not be saved' });
    }
});

router.put('/schedules/:id', ...access, async (req, res) => {
    try {
        const scheduleData = parseSchedulePayload(req.body);
        const rows = scheduleData.rows;
        const storeCount = Number(req.body.total_tiendas || 0);
        const totalRows = Number(req.body.total_filas || rows.length || 0);
        const totalBalance = Number(req.body.balance_total || 0);
        const name = String(req.body.nombre || 'Schedule 2026').trim().slice(0, 180);
        const year = normalizeYear(req.body.periodo_anio);
        const month = normalizeMonth(req.body.periodo_mes);

        if (!rows.length) {
            return res.status(400).json({ success: false, message: 'The schedule does not have rows to save' });
        }

        const [result] = await pool.query(
            `UPDATE property_management_schedules
             SET nombre = ?,
                 periodo_anio = ?,
                 periodo_mes = ?,
                 datos_json = ?,
                 total_tiendas = ?,
                 total_filas = ?,
                 balance_total = ?,
                 estado = ?
             WHERE id = ?`,
            [
                name,
                year,
                month,
                JSON.stringify(scheduleData),
                storeCount,
                totalRows,
                totalBalance,
                req.body.estado || 'draft',
                req.params.id
            ]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'Schedule not found' });
        }

        await syncScheduleDocuments(req.params.id, req.body.documentIds);

        res.json({
            success: true,
            schedule: { id: Number(req.params.id) }
        });
    } catch (error) {
        console.error('Property Management schedule could not be updated:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Schedule could not be updated' });
    }
});

router.delete('/schedules/:id', ...access, async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        await connection.query(
            `DELETE FROM property_management_schedule_documentos
             WHERE schedule_id = ?`,
            [req.params.id]
        );

        const [result] = await connection.query(
            `DELETE FROM property_management_schedules
             WHERE id = ?`,
            [req.params.id]
        );

        if (!result.affectedRows) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Schedule not found' });
        }

        await connection.commit();
        res.json({ success: true, message: 'Schedule deleted successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Property Management schedule could not be deleted:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Schedule could not be deleted' });
    } finally {
        connection.release();
    }
});

module.exports = router;
