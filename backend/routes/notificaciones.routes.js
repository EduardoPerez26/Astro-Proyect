const express = require('express');
const router = express.Router();

const { pool } = require('../config/database');
const { verificarToken, esAdmin } = require('../middleware/auth.middleware');
const { createNotificationsForUsers } = require('../services/notifications.service');

router.use(verificarToken);

function getUsuarioId(req) {
    return req.usuario?.id || req.user?.id || req.usuario?.userId || null;
}

function getUsuarioLabelFromRequest(req) {
    return (
        req.usuario?.nombre_completo ||
        req.usuario?.nombre ||
        req.usuario?.username ||
        req.usuario?.email ||
        req.user?.nombre_completo ||
        req.user?.nombre ||
        req.user?.username ||
        req.user?.email ||
        null
    );
}

function parseLimit(value, fallback = 15, max = 50) {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
}

function parseOffset(value) {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < 0) return 0;
    return parsed;
}

function parseJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;

    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}


function getErrorSeverity(statusCode) {
    const status = Number(statusCode || 0);

    if (status >= 500) return 'critical';
    if (status === 413) return 'upload';
    if (status >= 400) return 'client';
    return 'server';
}

function buildSystemErrorFilters(query = {}) {
    const where = [];
    const params = [];
    const status = String(query.status || (query.include_resolved === '1' ? 'all' : 'open')).trim().toLowerCase();
    const severity = String(query.severity || 'all').trim().toLowerCase();
    const method = String(query.method || '').trim().toUpperCase();
    const search = String(query.q || query.search || '').trim();

    if (status === 'open') {
        where.push('e.resolved_at IS NULL');
    } else if (status === 'resolved') {
        where.push('e.resolved_at IS NOT NULL');
    }

    if (severity === 'critical') {
        where.push('e.status_code >= 500');
    } else if (severity === 'server') {
        where.push('(e.status_code >= 500 OR e.status_code IS NULL)');
    } else if (severity === 'upload') {
        where.push('e.status_code = 413');
    } else if (severity === 'client') {
        where.push('e.status_code >= 400 AND e.status_code < 500 AND e.status_code <> 413');
    }

    if (method) {
        where.push('e.method = ?');
        params.push(method);
    }

    if (search) {
        const like = `%${search}%`;
        where.push(`(
            e.request_path LIKE ? OR
            e.normalized_path LIKE ? OR
            e.error_message LIKE ? OR
            e.error_name LIKE ? OR
            e.error_code LIKE ? OR
            e.user_label LIKE ? OR
            e.ip_address LIKE ? OR
            e.error_hash LIKE ?
        )`);
        params.push(like, like, like, like, like, like, like, like);
    }

    return {
        whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
        params
    };
}


function normalizeErrorLog(row) {
    return {
        id: row.id,
        error_hash: row.error_hash,
        status_code: row.status_code,
        severity: getErrorSeverity(row.status_code),
        method: row.method,
        request_path: row.request_path,
        normalized_path: row.normalized_path,
        user_id: row.user_id,
        user_label: row.user_label,
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        error_name: row.error_name,
        error_code: row.error_code,
        error_message: row.error_message,
        stack_trace: row.stack_trace,
        query_params: parseJson(row.query_params),
        body_snapshot: parseJson(row.body_snapshot),
        response_snapshot: parseJson(row.response_snapshot),
        metadata: parseJson(row.metadata),
        occurrences: Number(row.occurrences || 0),
        first_seen_at: row.first_seen_at,
        last_seen_at: row.last_seen_at,
        resolved_at: row.resolved_at,
        resolved_by: row.resolved_by,
        resolved_by_nombre: row.resolved_by_nombre || null,
        resolution_notes: row.resolution_notes || null
    };
}

async function getSystemErrorLogById(errorId) {
    const [rows] = await pool.query(`
        SELECT
            e.*,
            COALESCE(u.nombre_completo, u.username, u.email) AS resolved_by_nombre
        FROM system_error_logs e
        LEFT JOIN usuarios u ON u.id = e.resolved_by
        WHERE e.id = ?
        LIMIT 1
    `, [errorId]);

    return rows.length ? normalizeErrorLog(rows[0]) : null;
}

function normalizeNotification(row) {
    return {
        id: row.id,
        tipo: row.tipo,
        titulo: row.titulo,
        mensaje: row.mensaje,
        url_accion: row.url_accion,
        prioridad: row.prioridad,
        leida: Boolean(row.leida),
        fecha_leida: row.fecha_leida,
        fecha_creacion: row.fecha_creacion,
        creado_por_nombre: row.creado_por_nombre || null,
        metadata: parseJson(row.metadata)
    };
}

async function countUnread(usuarioId) {
    const [[row]] = await pool.query(`
        SELECT COUNT(*) AS total
        FROM notificaciones
        WHERE usuario_id = ?
          AND leida = FALSE
          AND archivada = FALSE
    `, [usuarioId]);

    return Number(row?.total || 0);
}

router.get('/', async (req, res) => {
    try {
        const usuarioId = getUsuarioId(req);

        if (!usuarioId) {
            return res.status(401).json({
                success: false,
                message: 'User is not authenticated'
            });
        }

        const limit = parseLimit(req.query.limit, 15, 50);
        const includeRead = req.query.include_read !== '0';
        const params = [usuarioId];
        let readFilter = '';

        if (!includeRead) {
            readFilter = 'AND n.leida = FALSE';
        }

        params.push(limit);

        const [rows] = await pool.query(`
            SELECT
                n.id,
                n.tipo,
                n.titulo,
                n.mensaje,
                n.url_accion,
                n.prioridad,
                n.leida,
                n.fecha_leida,
                n.fecha_creacion,
                n.metadata,
                COALESCE(u.nombre_completo, u.username, u.email) AS creado_por_nombre
            FROM notificaciones n
            LEFT JOIN usuarios u ON u.id = n.creado_por
            WHERE n.usuario_id = ?
              AND n.archivada = FALSE
              ${readFilter}
            ORDER BY n.fecha_creacion DESC, n.id DESC
            LIMIT ?
        `, params);

        res.json({
            success: true,
            total_no_leidas: await countUnread(usuarioId),
            notificaciones: rows.map(normalizeNotification)
        });
    } catch (error) {
        console.error('Notification list error:', error);
        res.status(500).json({
            success: false,
            message: 'Notifications could not be loaded'
        });
    }
});

router.get('/no-leidas', async (req, res) => {
    try {
        const usuarioId = getUsuarioId(req);

        if (!usuarioId) {
            return res.status(401).json({
                success: false,
                message: 'User is not authenticated'
            });
        }

        res.json({
            success: true,
            total: await countUnread(usuarioId)
        });
    } catch (error) {
        console.error('Notification count error:', error);
        res.status(500).json({
            success: false,
            message: 'Unread notifications could not be counted'
        });
    }
});


router.get('/system-errors', esAdmin, async (req, res) => {
    try {
        const limit = parseLimit(req.query.limit, 25, 100);
        const offset = parseOffset(req.query.offset);
        const { whereSql, params } = buildSystemErrorFilters(req.query);
        const filteredParams = [...params];

        params.push(limit, offset);

        const [rows] = await pool.query(`
            SELECT
                e.id,
                e.error_hash,
                e.status_code,
                e.method,
                e.request_path,
                e.normalized_path,
                e.user_id,
                e.user_label,
                e.ip_address,
                e.user_agent,
                e.error_name,
                e.error_code,
                e.error_message,
                e.stack_trace,
                e.query_params,
                e.body_snapshot,
                e.response_snapshot,
                e.metadata,
                e.occurrences,
                e.first_seen_at,
                e.last_seen_at,
                e.resolved_at,
                e.resolved_by,
                e.resolution_notes,
                COALESCE(u.nombre_completo, u.username, u.email) AS resolved_by_nombre
            FROM system_error_logs e
            LEFT JOIN usuarios u ON u.id = e.resolved_by
            ${whereSql}
            ORDER BY e.last_seen_at DESC, e.id DESC
            LIMIT ? OFFSET ?
        `, params);

        const [[summary]] = await pool.query(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) AS abiertos,
                SUM(CASE WHEN status_code >= 500 AND resolved_at IS NULL THEN 1 ELSE 0 END) AS criticos_abiertos,
                SUM(CASE WHEN resolved_at IS NOT NULL THEN 1 ELSE 0 END) AS resueltos
            FROM system_error_logs
        `);

        const [[filteredSummary]] = await pool.query(`
            SELECT COUNT(*) AS total_filtrado
            FROM system_error_logs e
            ${whereSql}
        `, filteredParams);

        res.json({
            success: true,
            summary: {
                total: Number(summary?.total || 0),
                abiertos: Number(summary?.abiertos || 0),
                criticos_abiertos: Number(summary?.criticos_abiertos || 0),
                resueltos: Number(summary?.resueltos || 0),
                total_filtrado: Number(filteredSummary?.total_filtrado || 0),
                limit,
                offset
            },
            errores: rows.map(normalizeErrorLog)
        });
    } catch (error) {
        console.error('System error log list error:', error);
        res.status(500).json({
            success: false,
            message: 'System error logs could not be loaded'
        });
    }
});

router.get('/system-errors/:id', esAdmin, async (req, res) => {
    try {
        const errorId = Number(req.params.id);

        if (!errorId) {
            return res.status(400).json({
                success: false,
                message: 'Error id is required'
            });
        }

        const errorLog = await getSystemErrorLogById(errorId);

        if (!errorLog) {
            return res.status(404).json({
                success: false,
                message: 'System error log was not found'
            });
        }

        res.json({
            success: true,
            error: errorLog
        });
    } catch (error) {
        console.error('System error log detail error:', error);
        res.status(500).json({
            success: false,
            message: 'System error log could not be loaded'
        });
    }
});

router.put('/system-errors/:id/resolved', esAdmin, async (req, res) => {
    try {
        const usuarioId = getUsuarioId(req);
        const fallbackResolvedBy = getUsuarioLabelFromRequest(req);
        const errorId = Number(req.params.id);
        const notes = String(req.body.notes || req.body.notas || '').trim().slice(0, 500) || null;

        if (!usuarioId) {
            return res.status(401).json({
                success: false,
                message: 'User is not authenticated'
            });
        }

        if (!errorId) {
            return res.status(400).json({
                success: false,
                message: 'Error id is required'
            });
        }

        const [result] = await pool.query(`
            UPDATE system_error_logs
            SET resolved_at = NOW(),
                resolved_by = ?,
                resolution_notes = ?
            WHERE id = ?
        `, [usuarioId, notes, errorId]);

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: 'System error log was not found'
            });
        }

        const errorLog = await getSystemErrorLogById(errorId);
        const resolvedByName = errorLog?.resolved_by_nombre || fallbackResolvedBy || `User #${usuarioId}`;

        res.json({
            success: true,
            resolved_by: usuarioId,
            resolved_by_nombre: resolvedByName,
            resolved_at: errorLog?.resolved_at || new Date().toISOString(),
            resolution_notes: notes,
            error: errorLog ? {
                ...errorLog,
                resolved_by_nombre: resolvedByName
            } : null
        });
    } catch (error) {
        console.error('Resolve system error log error:', error);
        res.status(500).json({
            success: false,
            message: 'System error log could not be resolved'
        });
    }
});

router.put('/system-errors/:id/reopen', esAdmin, async (req, res) => {
    try {
        const errorId = Number(req.params.id);

        if (!errorId) {
            return res.status(400).json({
                success: false,
                message: 'Error id is required'
            });
        }

        const [result] = await pool.query(`
            UPDATE system_error_logs
            SET resolved_at = NULL,
                resolved_by = NULL,
                resolution_notes = NULL
            WHERE id = ?
        `, [errorId]);

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: 'System error log was not found'
            });
        }

        res.json({
            success: true,
            reopened_by: getUsuarioId(req),
            error_id: errorId
        });
    } catch (error) {
        console.error('Reopen system error log error:', error);
        res.status(500).json({
            success: false,
            message: 'System error log could not be reopened'
        });
    }
});

router.put('/leidas', async (req, res) => {
    try {
        const usuarioId = getUsuarioId(req);

        if (!usuarioId) {
            return res.status(401).json({
                success: false,
                message: 'User is not authenticated'
            });
        }

        const [result] = await pool.query(`
            UPDATE notificaciones
            SET leida = TRUE,
                fecha_leida = COALESCE(fecha_leida, NOW())
            WHERE usuario_id = ?
              AND leida = FALSE
              AND archivada = FALSE
        `, [usuarioId]);

        res.json({
            success: true,
            updated: result.affectedRows || 0
        });
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({
            success: false,
            message: 'Notifications could not be marked as read'
        });
    }
});

router.put('/:id/leida', async (req, res) => {
    try {
        const usuarioId = getUsuarioId(req);
        const notificationId = Number(req.params.id);

        if (!usuarioId) {
            return res.status(401).json({
                success: false,
                message: 'User is not authenticated'
            });
        }

        if (!notificationId) {
            return res.status(400).json({
                success: false,
                message: 'Notification id is required'
            });
        }

        const [result] = await pool.query(`
            UPDATE notificaciones
            SET leida = TRUE,
                fecha_leida = COALESCE(fecha_leida, NOW())
            WHERE id = ?
              AND usuario_id = ?
              AND archivada = FALSE
        `, [notificationId, usuarioId]);

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: 'Notification was not found'
            });
        }

        res.json({
            success: true
        });
    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({
            success: false,
            message: 'Notification could not be marked as read'
        });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const usuarioId = getUsuarioId(req);
        const notificationId = Number(req.params.id);

        if (!usuarioId) {
            return res.status(401).json({
                success: false,
                message: 'User is not authenticated'
            });
        }

        if (!notificationId) {
            return res.status(400).json({
                success: false,
                message: 'Notification id is required'
            });
        }

        const [result] = await pool.query(`
            UPDATE notificaciones
            SET archivada = TRUE,
                fecha_archivada = NOW()
            WHERE id = ?
              AND usuario_id = ?
              AND archivada = FALSE
        `, [notificationId, usuarioId]);

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: 'Notification was not found'
            });
        }

        res.json({
            success: true
        });
    } catch (error) {
        console.error('Archive notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Notification could not be archived'
        });
    }
});

router.post('/', esAdmin, async (req, res) => {
    try {
        const creadorId = getUsuarioId(req);
        const titulo = String(req.body.titulo || req.body.title || '').trim();
        const mensaje = String(req.body.mensaje || req.body.message || '').trim();
        const tipo = String(req.body.tipo || req.body.type || 'system').trim();
        const prioridad = String(req.body.prioridad || req.body.priority || 'normal').trim();
        const urlAccion = req.body.url_accion || req.body.urlAccion || req.body.actionUrl || null;

        if (!titulo || !mensaje) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }

        const directIds = [];

        if (Array.isArray(req.body.usuario_ids)) {
            directIds.push(...req.body.usuario_ids);
        }

        if (req.body.usuario_id) {
            directIds.push(req.body.usuario_id);
        }

        let usuarios = [];

        if (req.body.broadcast === true || req.body.broadcast === 'true') {
            const [rows] = await pool.query(`
                SELECT id
                FROM usuarios
                WHERE activo = TRUE
            `);
            usuarios = rows.map(row => row.id);
        } else if (req.body.rol) {
            const [rows] = await pool.query(`
                SELECT id
                FROM usuarios
                WHERE activo = TRUE
                  AND rol = ?
            `, [req.body.rol]);
            usuarios = rows.map(row => row.id);
        } else if (req.body.departamento_id) {
            const [rows] = await pool.query(`
                SELECT id
                FROM usuarios
                WHERE activo = TRUE
                  AND departamento_id = ?
            `, [req.body.departamento_id]);
            usuarios = rows.map(row => row.id);
        } else {
            usuarios = directIds;
        }

        const result = await createNotificationsForUsers(usuarios, {
            creadoPor: creadorId,
            titulo,
            mensaje,
            tipo,
            prioridad,
            urlAccion,
            metadata: req.body.metadata && typeof req.body.metadata === 'object'
                ? req.body.metadata
                : null
        });

        res.status(201).json({
            success: true,
            inserted: result.inserted,
            usuarios: result.userIds
        });
    } catch (error) {
        console.error('Create notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Notification could not be created'
        });
    }
});

module.exports = router;
