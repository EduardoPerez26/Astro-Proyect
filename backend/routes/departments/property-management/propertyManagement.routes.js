const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const XLSX = require('xlsx');
const { pool } = require('../../../config/database');
const {
    getScheduleExportPath,
    savePropertyManagementScheduleWorkbook,
    deleteSavedPropertyManagementScheduleWorkbook
} = require('../../../services/departments/property-management/propertyManagementScheduleWorkbook');
const {
    verificarToken,
    checkPermission,
    requireDepartment,
    esAdmin
} = require('../../../middleware/auth.middleware');
const {
    getIntacctConfigStatus
} = require('../../../services/intacct/intacctConfig.service');
const { createNotificationsForUsers } = require('../../../services/notifications.service');

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Number(process.env.PROPERTY_MANAGEMENT_FILE_SIZE_MB || process.env.MAX_FILE_SIZE_MB || 75) * 1024 * 1024 }
});
const access = (module, action) => [
    verificarToken,
    checkPermission(module, action),
    requireDepartment('property-management')
];
const VALID_DOCUMENT_TYPES = new Set([
    'general_ledger',
    'dimension_balances',
    'schedule_export',
    'supporting_file'
]);

router.get('/intacct/status', ...access('propertyManagement', 'ver'), (req, res) => {
    const status = getIntacctConfigStatus();

    res.json({
        success: true,
        intacct: status,
        next_step: status.ready
            ? 'Install the Sage Intacct SDK and run a connection test.'
            : 'Add the missing INTACCT_* values to the backend environment.'
    });
});

function parseJson(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'object' && !Buffer.isBuffer(value)) return value;

    try {
        return JSON.parse(String(value));
    } catch {
        return fallback;
    }
}

function sendWorkbookDownload(res, workbook, downloadName) {
    if (workbook?.buffer) {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName || workbook.filename || 'property-management-schedule.xlsx'}"`);
        res.setHeader('Content-Length', workbook.buffer.length);
        res.send(workbook.buffer);
        return;
    }

    res.download(workbook.path, downloadName || workbook.filename, error => {
        if (!error || res.headersSent) return;
        console.error('Property Management schedule could not be downloaded:', error);
        res.status(500).json({ success: false, message: 'Schedule could not be downloaded' });
    });
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

async function getAdminUserIds(excludeUserId = null) {
    const [rows] = await pool.query(`
        SELECT id
        FROM usuarios
        WHERE activo = TRUE
          AND rol IN ('superadmin', 'admin')
    `);
    return rows
        .map(row => row.id)
        .filter(id => Number(id) !== Number(excludeUserId));
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

router.get('/documents', ...access('propertyManagementDocuments', 'ver'), async (req, res) => {
    try {
        const params = [];
        let where = '';

        if (req.usuario?.rol !== 'superadmin' && getDepartmentId(req)) {
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

router.post('/documents', ...access('propertyManagementDocuments', 'crear'), upload.single('document'), async (req, res) => {
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

router.get('/documents/:id/download', ...access('propertyManagementDocuments', 'exportar'), async (req, res) => {
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

router.delete('/documents/:id', ...access('propertyManagementDocuments', 'eliminar'), async (req, res) => {
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

async function persistPropertyManagementScheduleWorkbook(scheduleId) {
    const [[schedule]] = await pool.query(
        `SELECT * FROM property_management_schedules WHERE id = ? LIMIT 1`,
        [scheduleId]
    );
    if (!schedule) throw new Error('Schedule not found');

    const data = parseJson(schedule.datos_json, {});
    return savePropertyManagementScheduleWorkbook({ schedule, data });
}

router.get('/schedules', ...access('propertyManagement', 'ver'), async (req, res) => {
    try {
        const params = [];
        let where = '';

        if (req.usuario?.rol !== 'superadmin' && getDepartmentId(req)) {
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
                    s.submitted_by,
                    s.submitted_at,
                    s.reviewed_by,
                    s.reviewed_at,
                    s.review_notes,
                    s.fecha_creacion,
                    s.fecha_actualizacion,
                    u.nombre_completo AS usuario_nombre,
                    sub.nombre_completo AS submitted_by_nombre,
                    rev.nombre_completo AS reviewed_by_nombre
             FROM property_management_schedules s
             LEFT JOIN usuarios u ON u.id = s.usuario_id
             LEFT JOIN usuarios sub ON sub.id = s.submitted_by
             LEFT JOIN usuarios rev ON rev.id = s.reviewed_by
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

router.get('/schedules/:id', ...access('propertyManagement', 'ver'), async (req, res) => {
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

router.post('/schedules', ...access('propertyManagement', 'crear'), async (req, res) => {
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
        const savedWorkbook = await persistPropertyManagementScheduleWorkbook(result.insertId);

        res.status(201).json({
            success: true,
            schedule: {
                id: result.insertId,
                export_file: savedWorkbook.filename
            }
        });
    } catch (error) {
        console.error('Property Management schedule could not be saved:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Schedule could not be saved' });
    }
});

router.put('/schedules/:id', ...access('propertyManagement', 'editar'), async (req, res) => {
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
        const savedWorkbook = await persistPropertyManagementScheduleWorkbook(req.params.id);

        res.json({
            success: true,
            schedule: {
                id: Number(req.params.id),
                export_file: savedWorkbook.filename
            }
        });
    } catch (error) {
        console.error('Property Management schedule could not be updated:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Schedule could not be updated' });
    }
});

// Submit a draft (or a schedule sent back with changes requested) for review.
router.post('/schedules/:id/submit', ...access('propertyManagement', 'editar'), async (req, res) => {
    try {
        const [[schedule]] = await pool.query(
            'SELECT id, nombre, estado FROM property_management_schedules WHERE id = ? LIMIT 1',
            [req.params.id]
        );
        if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });
        if (!['draft', 'changes_requested'].includes(schedule.estado)) {
            return res.status(409).json({
                success: false,
                message: `Only draft or changes-requested schedules can be submitted for review (current status: ${schedule.estado}).`
            });
        }

        await pool.query(
            `UPDATE property_management_schedules
             SET estado = 'submitted', submitted_by = ?, submitted_at = NOW(),
                 reviewed_by = NULL, reviewed_at = NULL, review_notes = NULL
             WHERE id = ?`,
            [getUserId(req), req.params.id]
        );

        const adminIds = await getAdminUserIds(getUserId(req));
        if (adminIds.length) {
            await createNotificationsForUsers(adminIds, {
                tipo: 'property_management_review',
                titulo: 'Property Management schedule pending review',
                mensaje: `${req.usuario?.nombre_completo || 'A preparer'} submitted "${schedule.nombre}" for review.`,
                urlAccion: '/views/departments/property-management-documents',
                prioridad: 'normal',
                creadoPor: getUserId(req)
            }).catch(error => console.error('Property Management submit notification error:', error));
        }

        res.json({ success: true, estado: 'submitted' });
    } catch (error) {
        console.error('Property Management schedule could not be submitted:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Schedule could not be submitted for review' });
    }
});

// Approve or send back a schedule that is pending review. Requires an
// administrator and enforces separation of duties (preparer != reviewer).
router.post('/schedules/:id/review', ...access('propertyManagement', 'editar'), esAdmin, async (req, res) => {
    try {
        const decision = String(req.body.decision || '').trim();
        if (!['approved', 'changes_requested'].includes(decision)) {
            return res.status(400).json({ success: false, message: 'Decision must be "approved" or "changes_requested"' });
        }

        const [[schedule]] = await pool.query(
            'SELECT id, nombre, estado, usuario_id FROM property_management_schedules WHERE id = ? LIMIT 1',
            [req.params.id]
        );
        if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });
        if (schedule.estado !== 'submitted') {
            return res.status(409).json({
                success: false,
                message: `Only schedules pending review can be approved or sent back (current status: ${schedule.estado}).`
            });
        }
        if (Number(schedule.usuario_id) === Number(getUserId(req))) {
            return res.status(403).json({ success: false, message: 'The preparer of a schedule cannot also review it.' });
        }

        const notes = String(req.body.notes || '').trim().slice(0, 1000);
        if (decision === 'changes_requested' && !notes) {
            return res.status(400).json({ success: false, message: 'Notes are required when requesting changes.' });
        }

        await pool.query(
            `UPDATE property_management_schedules
             SET estado = ?, reviewed_by = ?, reviewed_at = NOW(), review_notes = ?
             WHERE id = ?`,
            [decision, getUserId(req), notes || null, req.params.id]
        );

        if (schedule.usuario_id) {
            await createNotificationsForUsers([schedule.usuario_id], {
                tipo: 'property_management_review',
                titulo: decision === 'approved'
                    ? 'Property Management schedule approved'
                    : 'Property Management schedule sent back for changes',
                mensaje: decision === 'approved'
                    ? `"${schedule.nombre}" was approved by ${req.usuario?.nombre_completo || 'a reviewer'}.`
                    : `"${schedule.nombre}" needs changes: ${notes}`,
                urlAccion: '/views/departments/property-management-documents',
                prioridad: decision === 'approved' ? 'normal' : 'high',
                creadoPor: getUserId(req)
            }).catch(error => console.error('Property Management review notification error:', error));
        }

        res.json({ success: true, estado: decision });
    } catch (error) {
        console.error('Property Management schedule review could not be recorded:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Review could not be recorded' });
    }
});

router.get('/schedules/:id/export', ...access('propertyManagement', 'exportar'), async (req, res) => {
    try {
        const [[schedule]] = await pool.query(
            `SELECT * FROM property_management_schedules WHERE id = ? LIMIT 1`,
            [req.params.id]
        );

        if (!schedule) {
            return res.status(404).json({ success: false, message: 'Schedule not found' });
        }

        const downloadName = `${String(schedule.nombre || 'property-management-schedule')
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 90) || 'property-management-schedule'}.xlsx`;

        const exportPath = getScheduleExportPath(schedule);
        if (fs.existsSync(exportPath)) {
            return sendWorkbookDownload(res, { path: exportPath, filename: downloadName }, downloadName);
        }

        const savedWorkbook = await persistPropertyManagementScheduleWorkbook(schedule.id);
        return sendWorkbookDownload(res, savedWorkbook, downloadName);
    } catch (error) {
        console.error('Property Management schedule export could not be created:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: error.message || 'Schedule export could not be created' });
    }
});

router.delete('/schedules/:id', ...access('propertyManagement', 'eliminar'), async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const [[schedule]] = await connection.query(
            `SELECT id, nombre FROM property_management_schedules WHERE id = ? LIMIT 1`,
            [req.params.id]
        );

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

        if (schedule) {
            try {
                deleteSavedPropertyManagementScheduleWorkbook(schedule);
            } catch (fileError) {
                console.warn('Saved Property Management workbook could not be removed:', fileError.message);
            }
        }

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

function normalizeEntityText(value) {
    return String(value ?? '').trim();
}

function normalizeEntityCodeValue(value) {
    return String(value ?? '').trim().toUpperCase();
}

function normalizeLocationValue(value) {
    return String(value ?? '').trim();
}

function parseOrgChartWorkbook(buffer) {
    const workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellDates: true,
        raw: true
    });

    const sheetName = workbook.SheetNames.find(name =>
        String(name || '').trim().toUpperCase() === 'STORES'
    ) || workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
        throw new Error('The ORG CHART does not contain a readable STORES sheet.');
    }

    const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        raw: true
    });

    const entities = [];

    rows.forEach((row, index) => {
        if (index < 2) return;

        const brand = normalizeEntityText(row[0]);
        const entityLegalName = normalizeEntityText(row[1]);
        const entityShortName = normalizeEntityText(row[2]);
        const entityCode = normalizeEntityCodeValue(row[3]);
        const otherId = normalizeEntityText(row[4]);
        const location = normalizeLocationValue(row[5]);

        if (!location || !entityCode) return;
        if (/location|store/i.test(location)) return;
        if (/entity|ent/i.test(entityCode)) return;

        entities.push({
            brand,
            entity_legal_name: entityLegalName,
            entity_short_name: entityShortName,
            entity_code: entityCode,
            other_id: otherId,
            location
        });
    });

    return entities;
}

router.get('/entities', ...access('propertyManagement', 'ver'), async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id,
                    brand,
                    entity_legal_name,
                    entity_short_name,
                    entity_code,
                    other_id,
                    location,
                    is_active,
                    created_at,
                    updated_at
             FROM property_management_entities
             WHERE is_active = 1
             ORDER BY location + 0, location`
        );

        res.json({
            success: true,
            entities: rows
        });
    } catch (error) {
        console.error('Property Management entities could not be loaded:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Entities could not be loaded' });
    }
});

router.post('/entities/import', ...access('propertyManagement', 'crear'), upload.single('orgChart'), async (req, res) => {
    const connection = await pool.getConnection();

    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No ORG CHART file was received' });
        }

        const entities = parseOrgChartWorkbook(req.file.buffer);

        if (!entities.length) {
            return res.status(400).json({
                success: false,
                message: 'No Location / Entity rows were found in the ORG CHART file'
            });
        }

        await connection.beginTransaction();

        for (const item of entities) {
            await connection.query(
                `INSERT INTO property_management_entities
                 (brand, entity_legal_name, entity_short_name, entity_code, other_id, location, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE
                    brand = VALUES(brand),
                    entity_legal_name = VALUES(entity_legal_name),
                    entity_short_name = VALUES(entity_short_name),
                    entity_code = VALUES(entity_code),
                    other_id = VALUES(other_id),
                    is_active = 1`,
                [
                    item.brand,
                    item.entity_legal_name,
                    item.entity_short_name,
                    item.entity_code,
                    item.other_id,
                    item.location
                ]
            );
        }

        await connection.commit();

        res.json({
            success: true,
            imported: entities.length,
            message: `${entities.length} entities imported successfully`
        });
    } catch (error) {
        await connection.rollback();
        console.error('Property Management entities import failed:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: error.message || 'Entities could not be imported' });
    } finally {
        connection.release();
    }
});

router.post('/entities', ...access('propertyManagement', 'crear'), async (req, res) => {
    try {
        const location = normalizeLocationValue(req.body.location);
        const entityCode = normalizeEntityCodeValue(req.body.entity_code);

        if (!location || !entityCode) {
            return res.status(400).json({
                success: false,
                message: 'Location and Entity are required'
            });
        }

        const [result] = await pool.query(
            `INSERT INTO property_management_entities
             (brand, entity_legal_name, entity_short_name, entity_code, other_id, location, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [
                normalizeEntityText(req.body.brand),
                normalizeEntityText(req.body.entity_legal_name),
                normalizeEntityText(req.body.entity_short_name),
                entityCode,
                normalizeEntityText(req.body.other_id),
                location
            ]
        );

        res.status(201).json({
            success: true,
            entity: { id: result.insertId }
        });
    } catch (error) {
        console.error('Property Management entity could not be created:', error);

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'That Location already exists'
            });
        }

        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Entity could not be created' });
    }
});

router.put('/entities/:id', ...access('propertyManagement', 'editar'), async (req, res) => {
    try {
        const location = normalizeLocationValue(req.body.location);
        const entityCode = normalizeEntityCodeValue(req.body.entity_code);

        if (!location || !entityCode) {
            return res.status(400).json({
                success: false,
                message: 'Location and Entity are required'
            });
        }

        const [result] = await pool.query(
            `UPDATE property_management_entities
             SET brand = ?,
                 entity_legal_name = ?,
                 entity_short_name = ?,
                 entity_code = ?,
                 other_id = ?,
                 location = ?
             WHERE id = ?`,
            [
                normalizeEntityText(req.body.brand),
                normalizeEntityText(req.body.entity_legal_name),
                normalizeEntityText(req.body.entity_short_name),
                entityCode,
                normalizeEntityText(req.body.other_id),
                location,
                req.params.id
            ]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'Entity not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Property Management entity could not be updated:', error);

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'That Location already exists'
            });
        }

        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Entity could not be updated' });
    }
});

router.delete('/entities/:id', ...access('propertyManagement', 'eliminar'), async (req, res) => {
    try {
        const [result] = await pool.query(
            `UPDATE property_management_entities
             SET is_active = 0
             WHERE id = ?`,
            [req.params.id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'Entity not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Property Management entity could not be deleted:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Entity could not be deleted' });
    }
});

module.exports = router;
