const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verificarToken, esAdmin, checkPermission } = require('../middleware/auth.middleware');
const { tokenHash, isSchemaError } = require('../services/securityAudit.service');
const { createNotificationsForUsers } = require('../services/notifications.service');
const { getConfigurationStatus } = require('../config/env.validation');

const PERIODOS = {
    '30d': 30,
    '12m': 365,
    all: null
};

const TABLAS_ADMIN_BASE_DATOS = [
    {
        nombre: 'auditoria_seguridad',
        titulo: 'Security audit',
        descripcion: 'Sensitive user and session events.',
        icono: 'fa-user-shield',
        orden: 'fecha_creacion',
        columnas: [
            'id',
            'usuario_id',
            'departamento_id',
            'evento',
            'ip_address',
            'detalle',
            'fecha_creacion'
        ]
    }
];

function debeFiltrarPorDepartment(req) {
    return req.usuario?.rol !== 'superadmin' && Boolean(req.departamento?.id);
}

function obtenerFechaDesde(periodo) {
    const dias = PERIODOS[periodo];

    if (!dias) {
        return null;
    }

    const fecha = new Date();
    fecha.setHours(0, 0, 0, 0);
    fecha.setDate(fecha.getDate() - dias);
    return fecha;
}

function numero(valor) {
    return Number(valor || 0);
}

async function consultaSegura(sql, params = [], fallback = []) {
    try {
        const [rows] = await pool.query(sql, params);
        return rows;
    } catch (error) {
        if (isSchemaError(error)) {
            return fallback;
        }

        throw error;
    }
}

function escaparIdentificador(nombre) {
    return `\`${String(nombre).replace(/`/g, '``')}\``;
}

function normalizarValorTabla(valor) {
    if (valor instanceof Date) {
        return valor.toISOString();
    }

    if (Buffer.isBuffer(valor)) {
        return `[binary ${valor.length} bytes]`;
    }

    return valor;
}

function normalizarFilaTabla(row) {
    return Object.fromEntries(
        Object.entries(row || {}).map(([clave, valor]) => [
            clave,
            normalizarValorTabla(valor)
        ])
    );
}

async function ensureApprovalWorkflowTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS approval_task_decisions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            task_id VARCHAR(160) NOT NULL,
            task_type VARCHAR(60) NOT NULL,
            task_title VARCHAR(255) NOT NULL,
            task_context VARCHAR(255) NULL,
            source_url VARCHAR(500) NULL,
            decision_status ENUM(
                'pending_review',
                'in_review',
                'approved',
                'rejected',
                'changes_requested',
                'resolved'
            ) NOT NULL DEFAULT 'pending_review',
            priority VARCHAR(40) NOT NULL DEFAULT 'normal',
            notes TEXT NULL,
            decided_by INT NULL,
            decided_at TIMESTAMP NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_approval_task_decisions_task (task_id),
            INDEX idx_approval_task_decisions_status (decision_status),
            INDEX idx_approval_task_decisions_type (task_type),
            INDEX idx_approval_task_decisions_decider (decided_by)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS approval_task_events (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            task_id VARCHAR(160) NOT NULL,
            task_type VARCHAR(60) NOT NULL,
            event_type VARCHAR(60) NOT NULL DEFAULT 'decision',
            previous_status VARCHAR(60) NULL,
            new_status VARCHAR(60) NOT NULL,
            comment TEXT NULL,
            actor_id INT NULL,
            actor_name VARCHAR(255) NULL,
            metadata JSON NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_approval_task_events_task (task_id, created_at),
            INDEX idx_approval_task_events_actor (actor_id),
            INDEX idx_approval_task_events_status (new_status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

async function obtenerApprovalEvents(taskIds = []) {
    try {
        await ensureApprovalWorkflowTable();

        const ids = [...new Set(taskIds.filter(Boolean))].slice(0, 500);
        if (!ids.length) return [];

        const [rows] = await pool.query(
            `SELECT e.*
             FROM approval_task_events e
             WHERE e.task_id IN (?)
             ORDER BY e.created_at DESC, e.id DESC`,
            [ids]
        );

        return rows;
    } catch (error) {
        if (isSchemaError(error)) return [];
        throw error;
    }
}

async function obtenerApprovalEventsPorTask(taskId) {
    try {
        await ensureApprovalWorkflowTable();

        const [rows] = await pool.query(
            `SELECT e.*
             FROM approval_task_events e
             WHERE e.task_id = ?
             ORDER BY e.created_at DESC, e.id DESC
             LIMIT 100`,
            [taskId]
        );

        return rows;
    } catch (error) {
        if (isSchemaError(error)) return [];
        throw error;
    }
}

async function obtenerApprovalDecisions() {
    try {
        await ensureApprovalWorkflowTable();

        const [rows] = await pool.query(`
            SELECT a.*,
                   COALESCE(u.nombre_completo, u.username, u.email) AS decided_by_nombre
            FROM approval_task_decisions a
            LEFT JOIN usuarios u ON u.id = a.decided_by
            ORDER BY a.updated_at DESC, a.id DESC
            LIMIT 500
        `);

        return rows;
    } catch (error) {
        if (isSchemaError(error)) return [];
        throw error;
    }
}

function normalizarDecisionStatus(value) {
    const status = String(value || '').trim().toLowerCase();
    const allowed = new Set([
        'pending_review',
        'in_review',
        'approved',
        'rejected',
        'changes_requested',
        'resolved'
    ]);

    return allowed.has(status) ? status : null;
}

function formatDocumentApprovalStatus(value) {
    const labels = {
        pendiente: 'Pending review',
        validado: 'Validated',
        con_errores: 'With issues',
        fallido: 'Failed',
        procesado: 'Processed',
        registrado: 'Registered'
    };

    return labels[String(value || '').toLowerCase()] || String(value || 'Review');
}

function estadoDocumentoPorDecision(status) {
    return {
        pending_review: 'pendiente',
        in_review: 'pendiente',
        approved: 'validado',
        rejected: 'fallido',
        changes_requested: 'con_errores',
        resolved: 'procesado'
    }[status] || null;
}

function formatApprovalDecisionLabel(status) {
    return {
        pending_review: 'Submitted',
        in_review: 'In review',
        approved: 'Approved',
        rejected: 'Rejected',
        changes_requested: 'Changes requested',
        resolved: 'Resolved'
    }[status] || 'Approval update';
}

function calcularApprovalDueAt(dateValue, priority = 'normal') {
    const base = dateValue ? new Date(dateValue) : new Date();
    if (Number.isNaN(base.getTime())) return null;

    const days = priority === 'critical' ? 1 : priority === 'high' ? 2 : 4;
    base.setDate(base.getDate() + days);
    return base.toISOString();
}

function calcularApprovalSla(dateValue, priority = 'normal', workflowStatus = 'pending_review') {
    const dueAt = calcularApprovalDueAt(dateValue, priority);
    if (!dueAt) {
        return { due_at: null, sla_status: 'unknown', sla_days_remaining: null };
    }

    if (['approved', 'rejected', 'resolved'].includes(workflowStatus)) {
        return { due_at: dueAt, sla_status: 'closed', sla_days_remaining: null };
    }

    const diffMs = new Date(dueAt).getTime() - Date.now();
    const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

    return {
        due_at: dueAt,
        sla_status: diffMs < 0 ? 'overdue' : daysRemaining <= 1 ? 'due_soon' : 'on_track',
        sla_days_remaining: daysRemaining
    };
}

function prioridadNotificacionApproval(status, priority) {
    if (['rejected', 'changes_requested'].includes(status)) return 'high';
    if (priority === 'critical' || priority === 'high') return 'high';
    return 'normal';
}

function extraerArchivoIdDesdeTask(taskId) {
    const match = String(taskId || '').match(/^file-(\d+)$/);
    return match ? Number(match[1]) : null;
}

async function actualizarEstadoDocumentoPorApproval(taskId, status) {
    const archivoId = extraerArchivoIdDesdeTask(taskId);
    const estado = estadoDocumentoPorDecision(status);

    if (!archivoId || !estado) {
        return null;
    }

    const [result] = await pool.query(
        `UPDATE archivos_excel
         SET estado = ?,
             fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [estado, archivoId]
    );

    return {
        archivo_id: archivoId,
        estado,
        updated: result.affectedRows || 0
    };
}

async function obtenerDuenoApprovalTask(taskId, taskType) {
    const archivoId = extraerArchivoIdDesdeTask(taskId);

    if (taskType === 'document' && archivoId) {
        const [rows] = await pool.query(
            `SELECT a.usuario_id,
                    a.nombre_original AS titulo,
                    '/views/documentos' AS url_accion
             FROM archivos_excel a
             WHERE a.id = ?
             LIMIT 1`,
            [archivoId]
        );
        return rows[0] || null;
    }

    const prepaidMatch = String(taskId || '').match(/^prepaid-(\d+)$/);
    if (taskType === 'prepaid' && prepaidMatch) {
        const scheduleId = Number(prepaidMatch[1]);
        const selectPrepaidOwner = userColumn => pool.query(
            `SELECT ps.${userColumn} AS usuario_id,
                    ps.title AS titulo,
                    CONCAT('/views/departments/prepaid-amortization?schedule=', ps.id) AS url_accion
             FROM prepaid_schedules ps
             WHERE ps.id = ?
             LIMIT 1`,
            [scheduleId]
        );

        try {
            const [rows] = await selectPrepaidOwner('created_by');
            return rows[0] || null;
        } catch (error) {
            if (!isSchemaError(error)) throw error;
            const [rows] = await selectPrepaidOwner('usuario_id');
            return rows[0] || null;
        }
    }

    const scheduleMatch = String(taskId || '').match(/^schedule-(\d+)$/);
    if (taskType === 'schedule' && scheduleMatch) {
        const scheduleId = Number(scheduleMatch[1]);
        const [rows] = await pool.query(
            `SELECT s.usuario_id,
                    s.nombre AS titulo,
                    CONCAT('/views/departments/property-management?schedule=', s.id) AS url_accion
             FROM property_management_schedules s
             WHERE s.id = ?
             LIMIT 1`,
            [scheduleId]
        );
        return rows[0] || null;
    }

    return null;
}

async function notificarComentarioApproval({ taskId, taskType, taskTitle, status, priority, notes, actorId }) {
    if (!notes) return { inserted: 0, userIds: [] };

    const owner = await obtenerDuenoApprovalTask(taskId, taskType);
    const ownerId = Number(owner?.usuario_id || 0);

    if (!ownerId || ownerId === Number(actorId || 0)) {
        return { inserted: 0, userIds: [] };
    }

    const statusLabel = formatApprovalDecisionLabel(status);
    const title = owner?.titulo || taskTitle || 'Approval item';
    const preview = notes.length > 220 ? `${notes.slice(0, 217)}...` : notes;

    return createNotificationsForUsers([ownerId], {
        creadoPor: actorId,
        tipo: 'approval',
        prioridad: prioridadNotificacionApproval(status, priority),
        titulo: `Approval Center: ${statusLabel}`,
        mensaje: `${title}: ${preview}`,
        urlAccion: owner?.url_accion || '/views/approval-center',
        metadata: {
            task_id: taskId,
            task_type: taskType,
            decision_status: status,
            comment: notes
        }
    });
}

function tablaPendiente(config) {
    return {
        nombre: config.nombre,
        titulo: config.titulo,
        descripcion: config.descripcion,
        icono: config.icono,
        existe: false,
        total: 0,
        columnas: [],
        columnas_muestra: [],
        registros: []
    };
}

async function obtenerMovimientosSistema(limit = 200) {
    const [
        sesiones,
        archivos,
        validaciones,
        prepaidSchedules,
        propertySchedules
    ] = await Promise.all([
        consultaSegura(
            `SELECT CONCAT('sesion-', s.id) AS id,
                    'sesion' AS tipo,
                    'Sign-in' AS accion,
                    COALESCE(u.nombre_completo, u.username, 'System') AS usuario_nombre,
                    COALESCE(u.username, 'system') AS username,
                    d.nombre AS departamento_nombre,
                    s.ip_address AS ip_address,
                    s.fecha_creacion AS fecha,
                    CONCAT_WS(' | ', s.ip_address, LEFT(s.user_agent, 90)) AS detalle,
                    IF(s.activa = TRUE AND s.fecha_expiracion > NOW(), 'activo', 'cerrado') AS estado
             FROM sesiones s
             LEFT JOIN usuarios u ON u.id = s.usuario_id
             LEFT JOIN departamentos d ON d.id = u.departamento_id
             ORDER BY s.fecha_creacion DESC, s.id DESC
             LIMIT ?`,
            [limit],
            []
        ),
        consultaSegura(
            `SELECT CONCAT('archivo-', a.id) AS id,
                    'archivo' AS tipo,
                    'File saved' AS accion,
                    COALESCE(u.nombre_completo, u.username, 'System') AS usuario_nombre,
                    COALESCE(u.username, 'system') AS username,
                    d.nombre AS departamento_nombre,
                    NULL AS ip_address,
                    a.fecha_subida AS fecha,
                    CONCAT_WS(' | ', a.nombre_original, r.nombre) AS detalle,
                    a.estado AS estado
             FROM archivos_excel a
             LEFT JOIN usuarios u ON u.id = a.usuario_id
             LEFT JOIN departamentos d ON d.id = a.departamento_id
             LEFT JOIN restaurantes r ON r.id = a.restaurante_id
             ORDER BY a.fecha_subida DESC, a.id DESC
             LIMIT ?`,
            [limit],
            []
        ),
        consultaSegura(
            `SELECT CONCAT('validacion-', hv.id) AS id,
                    'validacion' AS tipo,
                    'Validation executed' AS accion,
                    COALESCE(u.nombre_completo, u.username, 'System') AS usuario_nombre,
                    COALESCE(u.username, 'system') AS username,
                    d.nombre AS departamento_nombre,
                    NULL AS ip_address,
                    hv.fecha_validacion AS fecha,
                    CONCAT(hv.tipo_validacion, ' | ', hv.total_errores, ' error(s)') AS detalle,
                    hv.resultado AS estado
             FROM historial_validaciones hv
             LEFT JOIN usuarios u ON u.id = hv.usuario_id
             LEFT JOIN departamentos d ON d.id = u.departamento_id
             ORDER BY hv.fecha_validacion DESC, hv.id DESC
             LIMIT ?`,
            [limit],
            []
        ),
        obtenerMovimientosPrepaid(limit),
        consultaSegura(
            `SELECT CONCAT('pm-schedule-', s.id) AS id,
                    'property_management' AS tipo,
                    'Property Management schedule updated' AS accion,
                    COALESCE(u.nombre_completo, u.username, 'Property Management') AS usuario_nombre,
                    COALESCE(u.username, 'pm') AS username,
                    COALESCE(d.nombre, 'Property Management') AS departamento_nombre,
                    NULL AS ip_address,
                    COALESCE(s.fecha_actualizacion, s.fecha_creacion) AS fecha,
                    CONCAT_WS(' | ', s.nombre, s.periodo_anio, s.periodo_mes) AS detalle,
                    s.estado AS estado
             FROM property_management_schedules s
             LEFT JOIN usuarios u ON u.id = s.usuario_id
             LEFT JOIN departamentos d ON d.id = COALESCE(s.departamento_id, u.departamento_id)
             ORDER BY COALESCE(s.fecha_actualizacion, s.fecha_creacion) DESC, s.id DESC
             LIMIT ?`,
            [limit],
            []
        )
    ]);

    return [
        ...sesiones,
        ...archivos,
        ...validaciones,
        ...prepaidSchedules,
        ...propertySchedules
    ]
        .filter(row => row.fecha)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
        .slice(0, limit);
}

async function obtenerMovimientosPrepaid(limit = 200) {
    const buildQuery = userColumn => `
        SELECT CONCAT('prepaid-', ps.id) AS id,
                'prepaid' AS tipo,
                CASE
                    WHEN UPPER(ps.status) = 'SOURCE_LOADED' THEN 'Prepaid source uploaded'
                    WHEN UPPER(ps.status) = 'GENERATED' THEN 'Prepaid schedule generated'
                    WHEN UPPER(ps.status) = 'VALIDATED' THEN 'Prepaid schedule validated'
                    WHEN UPPER(ps.status) = 'DIFFERENCE' THEN 'Prepaid GL difference detected'
                    ELSE 'Prepaid schedule updated'
                END AS accion,
                COALESCE(u.nombre_completo, u.username, 'Property Management') AS usuario_nombre,
                COALESCE(u.username, 'pm') AS username,
                COALESCE(d.nombre, 'Property Management') AS departamento_nombre,
                NULL AS ip_address,
                COALESCE(ps.updated_at, ps.created_at) AS fecha,
                CONCAT_WS(' | ', ps.title, ps.brand, ps.schedule_year) AS detalle,
                ps.status AS estado
         FROM prepaid_schedules ps
         LEFT JOIN usuarios u ON u.id = ps.${userColumn}
         LEFT JOIN departamentos d ON d.id = COALESCE(ps.departamento_id, u.departamento_id)
         ORDER BY COALESCE(ps.updated_at, ps.created_at) DESC, ps.id DESC
         LIMIT ?`;

    try {
        const [rows] = await pool.query(buildQuery('created_by'), [limit]);
        return rows;
    } catch (error) {
        if (!isSchemaError(error)) throw error;

        try {
            const [rows] = await pool.query(buildQuery('usuario_id'), [limit]);
            return rows;
        } catch (fallbackError) {
            if (isSchemaError(fallbackError)) return [];
            throw fallbackError;
        }
    }
}


function expresionColumnaAuditoria(nombresColumnas, columna) {
    return nombresColumnas.has(columna)
        ? `a.${escaparIdentificador(columna)}`
        : 'NULL';
}

async function obtenerRegistrosAuditoriaSeguridad(nombresColumnas) {
    const usuarioId = expresionColumnaAuditoria(nombresColumnas, 'usuario_id');
    const departamentoId = expresionColumnaAuditoria(nombresColumnas, 'departamento_id');
    const evento = expresionColumnaAuditoria(nombresColumnas, 'evento');
    const ipAddress = expresionColumnaAuditoria(nombresColumnas, 'ip_address');
    const detalle = expresionColumnaAuditoria(nombresColumnas, 'detalle');
    const fechaCreacion = expresionColumnaAuditoria(nombresColumnas, 'fecha_creacion');
    const columnaOrden = nombresColumnas.has('fecha_creacion')
        ? 'a.`fecha_creacion` DESC'
        : (nombresColumnas.has('id') ? 'a.`id` DESC' : '1');

    return consultaSegura(
        `SELECT COALESCE(
                    NULLIF(u.nombre_completo, ''),
                    CASE WHEN ${usuarioId} IS NULL THEN NULL ELSE CONCAT('User #', ${usuarioId}) END,
                    'System'
                ) AS usuario_nombre,
                COALESCE(
                    NULLIF(u.username, ''),
                    CASE WHEN ${usuarioId} IS NULL THEN 'system' ELSE CONCAT('user', ${usuarioId}) END,
                    'system'
                ) AS username,
                COALESCE(
                    NULLIF(d.nombre, ''),
                    NULLIF(
                        CASE
                            WHEN JSON_VALID(${detalle})
                            THEN JSON_UNQUOTE(JSON_EXTRACT(${detalle}, '$.departamento'))
                            ELSE NULL
                        END,
                        ''
                    ),
                    CASE
                        WHEN ${departamentoId} IS NULL THEN 'No department'
                        ELSE CONCAT('Dept. ', ${departamentoId})
                    END
                ) AS departamento_nombre,
                COALESCE(NULLIF(${evento}, ''), 'system_event') AS evento,
                COALESCE(NULLIF(${ipAddress}, ''), '-') AS ip_address,
                ${detalle} AS detalle,
                CASE
                    WHEN LOWER(COALESCE(${evento}, '')) IN ('user_logout', 'logout', 'sign_out')
                      OR LOWER(COALESCE(${evento}, '')) LIKE '%logout%'
                    THEN 'cerrado'
                    WHEN LOWER(COALESCE(${evento}, '')) IN ('login_success', 'sign_in', 'signin')
                      AND EXISTS (
                            SELECT 1
                            FROM sesiones s2
                            WHERE s2.usuario_id = ${usuarioId}
                              AND s2.activa = TRUE
                              AND s2.fecha_expiracion > NOW()
                              AND (${ipAddress} IS NULL OR s2.ip_address = ${ipAddress})
                              AND ABS(TIMESTAMPDIFF(SECOND, s2.fecha_creacion, ${fechaCreacion})) <= 10
                            LIMIT 1
                        )
                    THEN 'activo'
                    WHEN LOWER(COALESCE(${evento}, '')) LIKE '%login%'
                      OR LOWER(COALESCE(${evento}, '')) LIKE '%sign_in%'
                    THEN 'cerrado'
                    ELSE 'registrado'
                END AS estado,
                ${fechaCreacion} AS fecha_creacion
         FROM ${escaparIdentificador('auditoria_seguridad')} a
         LEFT JOIN usuarios u ON u.id = ${usuarioId}
         LEFT JOIN departamentos d ON d.id = COALESCE(${departamentoId}, u.departamento_id)
         ORDER BY ${columnaOrden}
         LIMIT 200`,
        [],
        []
    );
}

async function obtenerTablasBaseDatosAdmin() {
    const nombres = TABLAS_ADMIN_BASE_DATOS.map(tabla => tabla.nombre);

    try {
        const [tablasRows] = await pool.query(
            `SELECT TABLE_NAME AS nombre,
                    TABLE_ROWS AS filas_estimadas,
                    CREATE_TIME AS fecha_creacion,
                    UPDATE_TIME AS fecha_actualizacion
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN (?)`,
            [nombres]
        );

        const [columnasRows] = await pool.query(
            `SELECT TABLE_NAME AS tabla,
                    COLUMN_NAME AS nombre,
                    DATA_TYPE AS tipo,
                    COLUMN_KEY AS llave,
                    IS_NULLABLE AS nullable
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN (?)
             ORDER BY TABLE_NAME, ORDINAL_POSITION`,
            [nombres]
        );

        const tablasPorNombre = new Map(
            tablasRows.map(tabla => [tabla.nombre, tabla])
        );
        const columnasPorTabla = columnasRows.reduce((mapa, columna) => {
            if (!mapa.has(columna.tabla)) {
                mapa.set(columna.tabla, []);
            }

            mapa.get(columna.tabla).push(columna);
            return mapa;
        }, new Map());

        return Promise.all(TABLAS_ADMIN_BASE_DATOS.map(async config => {
            const metadata = tablasPorNombre.get(config.nombre);

            if (!metadata) {
                return tablaPendiente(config);
            }

            const columnas = columnasPorTabla.get(config.nombre) || [];
            const nombresColumnas = new Set(columnas.map(columna => columna.nombre));
            const columnasMuestra = config.columnas.filter(columna =>
                nombresColumnas.has(columna)
            );
            const tablaSql = escaparIdentificador(config.nombre);
            const columnaOrden = nombresColumnas.has(config.orden)
                ? config.orden
                : (nombresColumnas.has('id') ? 'id' : columnasMuestra[0]);
            const selectMuestra = columnasMuestra.length
                ? columnasMuestra.map(escaparIdentificador).join(', ')
                : null;

            const conteoRows = await consultaSegura(
                `SELECT COUNT(*) AS total FROM ${tablaSql}`,
                [],
                [{ total: 0 }]
            );
            const columnasMetadata = columnas.map(columna => ({
                nombre: columna.nombre,
                tipo: columna.tipo,
                llave: columna.llave,
                nullable: columna.nullable === 'YES'
            }));

            if (config.nombre === 'auditoria_seguridad') {
                const registrosAuditoria = await obtenerRegistrosAuditoriaSeguridad(nombresColumnas);

                return {
                    nombre: config.nombre,
                    titulo: config.titulo,
                    descripcion: config.descripcion,
                    icono: config.icono,
                    existe: true,
                    total: numero(conteoRows[0]?.total),
                    filas_estimadas: numero(metadata.filas_estimadas),
                    fecha_creacion: normalizarValorTabla(metadata.fecha_creacion),
                    fecha_actualizacion: normalizarValorTabla(metadata.fecha_actualizacion),
                    columnas: columnasMetadata,
                    columnas_muestra: [
                        'usuario_nombre',
                        'username',
                        'departamento_nombre',
                        'evento',
                        'ip_address',
                        'detalle',
                        'estado',
                        'fecha_creacion'
                    ],
                    registros: registrosAuditoria.map(normalizarFilaTabla)
                };
            }

            const registros = selectMuestra
                ? await consultaSegura(
                    `SELECT ${selectMuestra}
                     FROM ${tablaSql}
                     ${columnaOrden ? `ORDER BY ${escaparIdentificador(columnaOrden)} DESC` : ''}
                     LIMIT 10`,
                    [],
                    []
                )
                : [];

            return {
                nombre: config.nombre,
                titulo: config.titulo,
                descripcion: config.descripcion,
                icono: config.icono,
                existe: true,
                total: numero(conteoRows[0]?.total),
                filas_estimadas: numero(metadata.filas_estimadas),
                fecha_creacion: normalizarValorTabla(metadata.fecha_creacion),
                fecha_actualizacion: normalizarValorTabla(metadata.fecha_actualizacion),
                columnas: columnasMetadata,
                columnas_muestra: columnasMuestra,
                registros: registros.map(normalizarFilaTabla)
            };
        }));
    } catch (error) {
        console.warn(
            'The admin dashboard table inventory could not be loaded:',
            error.code || error.message
        );

        return TABLAS_ADMIN_BASE_DATOS.map(tablaPendiente);
    }
}

async function obtenerDashboardAdminBasico(tokenActual) {
    const [
        usuariosRows,
        sesionesRows,
        archivosRows,
        validacionesRows,
        sesionesRecientes,
        movimientos,
        actividadUsers
    ] = await Promise.all([
        consultaSegura(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(activo = TRUE), 0) AS activos,
                    COALESCE(SUM(rol IN ('superadmin', 'admin')), 0) AS administradores
             FROM usuarios`,
            [],
            [{ total: 0, activos: 0, administradores: 0 }]
        ),
        consultaSegura(
            `SELECT COALESCE(SUM(activa = TRUE AND fecha_expiracion > NOW()), 0) AS activas,
                    COALESCE(SUM(DATE(fecha_creacion) = CURDATE()), 0) AS inicios_hoy,
                    COALESCE(SUM(fecha_creacion >= DATE_SUB(NOW(), INTERVAL 7 DAY)), 0) AS inicios_7_dias
             FROM sesiones`,
            [],
            [{ activas: 0, inicios_hoy: 0, inicios_7_dias: 0 }]
        ),
        consultaSegura(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(DATE(fecha_subida) = CURDATE()), 0) AS hoy,
                    COALESCE(SUM(fecha_subida >= DATE_SUB(NOW(), INTERVAL 7 DAY)), 0) AS ultimos_7_dias
             FROM archivos_excel`,
            [],
            [{ total: 0, hoy: 0, ultimos_7_dias: 0 }]
        ),
        consultaSegura(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(DATE(fecha_validacion) = CURDATE()), 0) AS hoy,
                    COALESCE(SUM(resultado IN ('con_errores', 'fallido')), 0) AS con_incidencias
             FROM historial_validaciones`,
            [],
            [{ total: 0, hoy: 0, con_incidencias: 0 }]
        ),
        consultaSegura(
            `SELECT s.id,
                    s.ip_address,
                    s.user_agent,
                    s.fecha_creacion,
                    s.fecha_expiracion,
                    (s.activa = TRUE AND s.fecha_expiracion > NOW()) AS activa,
                    (s.token = ?) AS sesion_actual,
                    u.id AS usuario_id,
                    u.nombre_completo AS usuario_nombre,
                    u.username,
                    u.rol,
                    NULL AS departamento_nombre
             FROM sesiones s
             JOIN usuarios u ON u.id = s.usuario_id
             ORDER BY s.fecha_creacion DESC, s.id DESC
             LIMIT 20`,
            [tokenActual],
            []
        ),
        obtenerMovimientosSistema(200),
        consultaSegura(
            `SELECT u.id,
                    u.nombre_completo AS nombre,
                    u.username,
                    u.rol,
                    u.activo,
                    NULL AS departamento_nombre,
                    COUNT(DISTINCT s.id) AS total_sesiones,
                    COUNT(DISTINCT a.id) AS total_archivos,
                    MAX(s.fecha_creacion) AS ultimo_acceso
             FROM usuarios u
             LEFT JOIN sesiones s ON s.usuario_id = u.id
             LEFT JOIN archivos_excel a ON a.usuario_id = u.id
             GROUP BY u.id, u.nombre_completo, u.username, u.rol, u.activo
             ORDER BY ultimo_acceso DESC, u.nombre_completo ASC
             LIMIT 12`,
            [],
            []
        )
    ]);

    const usuarios = usuariosRows[0] || {};
    const sesiones = sesionesRows[0] || {};
    const archivos = archivosRows[0] || {};
    const validaciones = validacionesRows[0] || {};
    const tablasBaseDatos = await obtenerTablasBaseDatosAdmin();

    return {
        success: true,
        modo_compatibilidad: true,
        generado_en: new Date().toISOString(),
        resumen: {
            usuarios_total: numero(usuarios.total),
            usuarios_activos: numero(usuarios.activos),
            administradores: numero(usuarios.administradores),
            sesiones_activas: numero(sesiones.activas),
            inicios_hoy: numero(sesiones.inicios_hoy),
            inicios_7_dias: numero(sesiones.inicios_7_dias),
            archivos_total: numero(archivos.total),
            archivos_hoy: numero(archivos.hoy),
            archivos_7_dias: numero(archivos.ultimos_7_dias),
            validaciones_total: numero(validaciones.total),
            validaciones_hoy: numero(validaciones.hoy),
            validaciones_con_incidencias: numero(validaciones.con_incidencias),
            departamentos_total: 0,
            departamentos_activos: 0
        },
        sesiones_recientes: sesionesRecientes.map(row => ({
            ...row,
            activa: Boolean(row.activa),
            sesion_actual: Boolean(row.sesion_actual)
        })),
        movimientos,
        actividad_usuarios: actividadUsers.map(row => ({
            ...row,
            total_sesiones: numero(row.total_sesiones),
            total_archivos: numero(row.total_archivos)
        })),
        tablas_base_datos: tablasBaseDatos
    };
}

router.get('/resumen', verificarToken, checkPermission('view_dashboard'), async (req, res) => {
    try {
        const periodo = Object.hasOwn(PERIODOS, req.query.periodo)
            ? req.query.periodo
            : '12m';
        const fechaDesde = obtenerFechaDesde(periodo);
        const filtroFiles = fechaDesde
            ? 'WHERE a.fecha_subida >= ?'
            : '';
        const condicionRestaurant = fechaDesde
            ? 'AND a.fecha_subida >= ?'
            : '';
        const filtroValidaciones = fechaDesde
            ? 'WHERE hv.fecha_validacion >= ?'
            : '';
        const formatoTendencia = periodo === '30d'
            ? '%Y-%m-%d'
            : '%Y-%m';
        const parametros = fechaDesde ? [fechaDesde] : [];

        const [
            [resumenRows],
            [restaurantesActivosRows],
            [tendenciaRows],
            [restaurantesRows],
            [actividadRows],
            [validacionesRows]
        ] = await Promise.all([
            pool.query(
                `SELECT
                    COUNT(*) AS total_archivos,
                    COALESCE(SUM(a.estado = 'validado'), 0) AS validados,
                    COALESCE(SUM(a.estado = 'con_errores'), 0) AS con_errores,
                    COALESCE(SUM(a.estado = 'pendiente'), 0) AS pendientes,
                    COALESCE(SUM(a.estado = 'procesado'), 0) AS procesados,
                    COUNT(DISTINCT a.restaurante_id) AS restaurantes_con_actividad,
                    COALESCE(SUM(a.tamano_bytes), 0) AS total_bytes
                 FROM archivos_excel a
                 ${filtroFiles}`,
                parametros
            ),
            pool.query(
                `SELECT COUNT(*) AS total
                 FROM restaurantes
                 WHERE activo = TRUE`
            ),
            pool.query(
                `SELECT
                    DATE_FORMAT(a.fecha_subida, '${formatoTendencia}') AS periodo,
                    COUNT(*) AS total,
                    COALESCE(SUM(a.estado = 'validado'), 0) AS validados,
                    COALESCE(SUM(a.estado = 'con_errores'), 0) AS con_errores
                 FROM archivos_excel a
                 ${filtroFiles}
                 GROUP BY periodo
                 ORDER BY periodo ASC`,
                parametros
            ),
            pool.query(
                `SELECT
                    r.id,
                    r.nombre,
                    r.codigo,
                    r.icono,
                    COUNT(a.id) AS total_archivos,
                    COALESCE(SUM(a.estado = 'validado'), 0) AS validados,
                    COALESCE(SUM(a.estado = 'con_errores'), 0) AS con_errores,
                    COALESCE(SUM(a.estado = 'pendiente'), 0) AS pendientes,
                    MAX(a.fecha_subida) AS ultima_actividad
                 FROM restaurantes r
                 LEFT JOIN archivos_excel a
                    ON a.restaurante_id = r.id
                    ${condicionRestaurant}
                 WHERE r.activo = TRUE
                 GROUP BY r.id, r.nombre, r.codigo, r.icono
                 ORDER BY total_archivos DESC, r.nombre ASC`,
                parametros
            ),
            pool.query(
                `SELECT
                    a.id,
                    a.nombre_original,
                    a.estado,
                    a.tamano_bytes,
                    a.fecha_subida,
                    r.nombre AS restaurante_nombre,
                    r.codigo AS restaurante_codigo,
                    u.nombre_completo AS usuario_nombre
                 FROM archivos_excel a
                 LEFT JOIN restaurantes r ON r.id = a.restaurante_id
                 LEFT JOIN usuarios u ON u.id = a.usuario_id
                 ${filtroFiles}
                 ORDER BY a.fecha_subida DESC, a.id DESC
                 LIMIT 8`,
                parametros
            ),
            pool.query(
                `SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(hv.resultado = 'exitoso'), 0) AS exitosas,
                    COALESCE(SUM(hv.resultado = 'con_errores'), 0) AS con_errores,
                    COALESCE(SUM(hv.resultado = 'fallido'), 0) AS fallidas,
                    COALESCE(SUM(hv.total_errores), 0) AS total_errores,
                    AVG(hv.duracion_segundos) AS tiempo_promedio
                 FROM historial_validaciones hv
                 ${filtroValidaciones}`,
                parametros
            )
        ]);

        const resumen = resumenRows[0] || {};
        const validaciones = validacionesRows[0] || {};
        const totalFiles = numero(resumen.total_archivos);
        const validados = numero(resumen.validados);

        res.json({
            success: true,
            periodo,
            generado_en: new Date().toISOString(),
            resumen: {
                total_archivos: totalFiles,
                validados,
                con_errores: numero(resumen.con_errores),
                pendientes: numero(resumen.pendientes),
                procesados: numero(resumen.procesados),
                restaurantes_activos: numero(
                    restaurantesActivosRows[0]?.total
                ),
                restaurantes_con_actividad: numero(
                    resumen.restaurantes_con_actividad
                ),
                total_bytes: numero(resumen.total_bytes),
                tasa_validacion: totalFiles
                    ? Math.round((validados / totalFiles) * 1000) / 10
                    : 0,
                total_validaciones: numero(validaciones.total),
                errores_detectados: numero(validaciones.total_errores),
                tiempo_promedio_validacion: validaciones.tiempo_promedio === null
                    ? null
                    : numero(validaciones.tiempo_promedio)
            },
            tendencia: tendenciaRows.map(row => ({
                periodo: row.periodo,
                total: numero(row.total),
                validados: numero(row.validados),
                con_errores: numero(row.con_errores)
            })),
            restaurantes: restaurantesRows.map(row => ({
                ...row,
                total_archivos: numero(row.total_archivos),
                validados: numero(row.validados),
                con_errores: numero(row.con_errores),
                pendientes: numero(row.pendientes)
            })),
            actividad_reciente: actividadRows
        });
    } catch (error) {
        console.error('Error loading dashboard summary:', error);
        res.status(500).json({
            success: false,
            message: 'Dashboard summary could not be loaded'
        });
    }
});

router.get('/admin', verificarToken, esAdmin, checkPermission('view_dashboard'), async (req, res) => {
    const tokenActual =
        req.authToken ||
        req.headers.authorization?.split(' ')[1] ||
        '';

    try {
        const [
            [usuariosRows],
            [sesionesRows],
            [archivosRows],
            [validacionesRows],
            [departamentosRows],
            [sesionesRecientes],
            movimientos,
            [actividadUsers],
            tablasBaseDatos
        ] = await Promise.all([
            pool.query(
                `SELECT COUNT(*) AS total,
                        COALESCE(SUM(activo = TRUE), 0) AS activos,
                        COALESCE(SUM(rol IN ('superadmin', 'admin')), 0) AS administradores
                 FROM usuarios`
            ),
            pool.query(
                `SELECT COALESCE(SUM(activa = TRUE AND fecha_expiracion > NOW()), 0) AS activas,
                        COALESCE(SUM(DATE(fecha_creacion) = CURDATE()), 0) AS inicios_hoy,
                        COALESCE(SUM(fecha_creacion >= DATE_SUB(NOW(), INTERVAL 7 DAY)), 0) AS inicios_7_dias
                 FROM sesiones`
            ),
            pool.query(
                `SELECT COUNT(*) AS total,
                        COALESCE(SUM(DATE(fecha_subida) = CURDATE()), 0) AS hoy,
                        COALESCE(SUM(fecha_subida >= DATE_SUB(NOW(), INTERVAL 7 DAY)), 0) AS ultimos_7_dias
                 FROM archivos_excel`
            ),
            pool.query(
                `SELECT COUNT(*) AS total,
                        COALESCE(SUM(DATE(fecha_validacion) = CURDATE()), 0) AS hoy,
                        COALESCE(SUM(resultado IN ('con_errores', 'fallido')), 0) AS con_incidencias
                 FROM historial_validaciones`
            ),
            pool.query(
                `SELECT COUNT(*) AS total,
                        COALESCE(SUM(activo = TRUE), 0) AS activos
                 FROM departamentos`
            ),
            pool.query(
                `SELECT s.id,
                        s.ip_address,
                        s.user_agent,
                        s.fecha_creacion,
                        s.fecha_expiracion,
                        (s.activa = TRUE AND s.fecha_expiracion > NOW()) AS activa,
                        (s.token = ?) AS sesion_actual,
                        u.id AS usuario_id,
                        u.nombre_completo AS usuario_nombre,
                        u.username,
                        u.rol,
                        d.nombre AS departamento_nombre
                 FROM sesiones s
                 JOIN usuarios u ON u.id = s.usuario_id
                 LEFT JOIN departamentos d ON d.id = u.departamento_id
                 ORDER BY s.fecha_creacion DESC, s.id DESC
                 LIMIT 20`,
                [tokenActual]
            ),
            obtenerMovimientosSistema(200),
            pool.query(
                `SELECT u.id,
                        u.nombre_completo AS nombre,
                        u.username,
                        u.rol,
                        u.activo,
                        d.nombre AS departamento_nombre,
                        COUNT(DISTINCT s.id) AS total_sesiones,
                        COUNT(DISTINCT a.id) AS total_archivos,
                        MAX(s.fecha_creacion) AS ultimo_acceso
                 FROM usuarios u
                 LEFT JOIN departamentos d ON d.id = u.departamento_id
                 LEFT JOIN sesiones s ON s.usuario_id = u.id
                 LEFT JOIN archivos_excel a ON a.usuario_id = u.id
                 GROUP BY u.id, u.nombre_completo, u.username, u.rol, u.activo, d.nombre
                 ORDER BY ultimo_acceso DESC, u.nombre_completo ASC
                 LIMIT 12`
            ),
            obtenerTablasBaseDatosAdmin()
        ]);

        const usuarios = usuariosRows[0] || {};
        const sesiones = sesionesRows[0] || {};
        const archivos = archivosRows[0] || {};
        const validaciones = validacionesRows[0] || {};
        const departamentos = departamentosRows[0] || {};

        res.json({
            success: true,
            generado_en: new Date().toISOString(),
            resumen: {
                usuarios_total: numero(usuarios.total),
                usuarios_activos: numero(usuarios.activos),
                administradores: numero(usuarios.administradores),
                sesiones_activas: numero(sesiones.activas),
                inicios_hoy: numero(sesiones.inicios_hoy),
                inicios_7_dias: numero(sesiones.inicios_7_dias),
                archivos_total: numero(archivos.total),
                archivos_hoy: numero(archivos.hoy),
                archivos_7_dias: numero(archivos.ultimos_7_dias),
                validaciones_total: numero(validaciones.total),
                validaciones_hoy: numero(validaciones.hoy),
                validaciones_con_incidencias: numero(validaciones.con_incidencias),
                departamentos_total: numero(departamentos.total),
                departamentos_activos: numero(departamentos.activos)
            },
            sesiones_recientes: sesionesRecientes.map(row => ({
                ...row,
                activa: Boolean(row.activa),
                sesion_actual: Boolean(row.sesion_actual)
            })),
            movimientos,
            actividad_usuarios: actividadUsers.map(row => ({
                ...row,
                total_sesiones: numero(row.total_sesiones),
                total_archivos: numero(row.total_archivos)
            })),
            tablas_base_datos: tablasBaseDatos
        });
    } catch (error) {
        console.error('Error loading admin dashboard:', error);

        if (isSchemaError(error)) {
            try {
                return res.json(await obtenerDashboardAdminBasico(tokenActual));
            } catch (fallbackError) {
                console.error('Error loading basic admin dashboard:', fallbackError);
            }
        }

        res.status(500).json({
            success: false,
            message: 'Admin dashboard could not be loaded',
            code: error.code
        });
    }
});

router.patch('/admin/sessions/:sessionId/logout', verificarToken, esAdmin, checkPermission('manage_sessions'), async (req, res) => {
    try {
        const sessionId = Number(req.params.sessionId);
        const tokenActual =
            req.authToken ||
            req.headers.authorization?.split(' ')[1] ||
            '';
        const hashActual = tokenHash(tokenActual);

        if (!Number.isInteger(sessionId) || sessionId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid session'
            });
        }

        let sesiones;

        try {
            [sesiones] = await pool.query(
                `SELECT s.id, s.token, s.token_hash, s.activa, u.nombre_completo AS usuario_nombre
                 FROM sesiones s
                 JOIN usuarios u ON u.id = s.usuario_id
                 WHERE s.id = ?
                 LIMIT 1`,
                [sessionId]
            );
        } catch (error) {
            if (error.code !== 'ER_BAD_FIELD_ERROR') throw error;

            [sesiones] = await pool.query(
                `SELECT s.id, s.token, NULL AS token_hash, s.activa, u.nombre_completo AS usuario_nombre
                 FROM sesiones s
                 JOIN usuarios u ON u.id = s.usuario_id
                 WHERE s.id = ?
                 LIMIT 1`,
                [sessionId]
            );
        }

        const sesion = sesiones[0];

        if (!sesion) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        if (sesion.token === tokenActual || sesion.token_hash === hashActual) {
            return res.status(400).json({
                success: false,
                message: 'You cannot close the current session from this panel'
            });
        }

        if (!sesion.activa) {
            return res.json({
                success: true,
                message: 'The session was already closed'
            });
        }

        try {
            await pool.query(
                `UPDATE sesiones
                 SET activa = FALSE,
                     fecha_expiracion = NOW(),
                     fecha_revocacion = NOW(),
                     revocada_por = ?,
                     motivo_revocacion = 'cerrada_por_admin'
                 WHERE id = ?`,
                [req.usuario.id, sessionId]
            );
        } catch (error) {
            if (error.code !== 'ER_BAD_FIELD_ERROR') throw error;

            await pool.query(
                `UPDATE sesiones
                 SET activa = FALSE,
                     fecha_expiracion = NOW()
                 WHERE id = ?`,
                [sessionId]
            );
        }

        res.json({
            success: true,
            message: `Session closed for ${sesion.usuario_nombre}`
        });
    } catch (error) {
        console.error('Error closing session from admin dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'The session could not be closed'
        });
    }
});

router.get('/system-health', verificarToken, checkPermission('systemCenter', 'ver'), async (req, res) => {
    const config = getConfigurationStatus();

    res.status(config.ok ? 200 : 503).json({
        success: config.ok,
        status: config.ok ? 'ok' : 'configuration_attention',
        service: 'XBFS Operations Hub API',
        timestamp: new Date().toISOString(),
        configuration: {
            missingRequired: config.missingRequired,
            missingRecommended: config.missingRecommended,
            integrations: config.integrations.map(integration => ({
                name: integration.name,
                enabled: integration.enabled,
                configured: integration.configured,
                configuredKeys: integration.configuredKeys,
                expectedKeys: integration.expectedKeys
            }))
        }
    });
});

router.get('/approval-center', verificarToken, checkPermission('view_approval_center'), async (req, res) => {
    try {
        const filtrarPorDepartment = debeFiltrarPorDepartment(req);
        const departmentId = req.departamento?.id || null;
        const whereArchivos = filtrarPorDepartment
            ? 'WHERE (a.departamento_id = ? OR a.departamento_id IS NULL)'
            : '';
        const wherePrepaid = filtrarPorDepartment
            ? 'WHERE (departamento_id = ? OR departamento_id IS NULL)'
            : '';
        const whereProperty = filtrarPorDepartment
            ? 'WHERE (s.departamento_id = ? OR s.departamento_id IS NULL)'
            : '';
        const paramsDepartment = filtrarPorDepartment ? [departmentId] : [];

        const [
            files,
            prepaidSchedules,
            propertySchedules,
            openErrors,
            recentMovements,
            approvals
        ] = await Promise.all([
            consultaSegura(
                `SELECT a.id,
                        a.nombre_original,
                        a.estado,
                        a.fecha_subida,
                        r.nombre AS restaurante_nombre,
                        u.nombre_completo AS usuario_nombre,
                        COALESCE(d.nombre, du.nombre, 'No department') AS departamento_nombre
                 FROM archivos_excel a
                 LEFT JOIN restaurantes r ON r.id = a.restaurante_id
                 LEFT JOIN usuarios u ON u.id = a.usuario_id
                 LEFT JOIN departamentos d ON d.id = a.departamento_id
                 LEFT JOIN departamentos du ON du.id = u.departamento_id
                 ${whereArchivos}
                 ORDER BY a.fecha_subida DESC, a.id DESC
                 LIMIT 500`,
                paramsDepartment,
                []
            ),
            consultaSegura(
                `SELECT id,
                        title,
                        brand,
                        schedule_year,
                        status,
                        source_row_count,
                        included_row_count,
                        generated_month_count,
                        created_at,
                        updated_at,
                        metadata_json
                 FROM prepaid_schedules
                 ${wherePrepaid}
                 ORDER BY id DESC
                 LIMIT 500`,
                paramsDepartment,
                []
            ),
            consultaSegura(
                `SELECT s.id,
                        s.nombre,
                        s.periodo_anio,
                        s.periodo_mes,
                        s.total_tiendas,
                        s.total_filas,
                        s.balance_total,
                        s.estado,
                        s.fecha_creacion,
                        s.fecha_actualizacion,
                        COALESCE(u.nombre_completo, u.username, 'Property Management') AS usuario_nombre,
                        COALESCE(d.nombre, du.nombre, 'Property Management') AS departamento_nombre
                 FROM property_management_schedules s
                 LEFT JOIN usuarios u ON u.id = s.usuario_id
                 LEFT JOIN departamentos d ON d.id = s.departamento_id
                 LEFT JOIN departamentos du ON du.id = u.departamento_id
                 ${whereProperty}
                 ORDER BY COALESCE(s.fecha_actualizacion, s.fecha_creacion) DESC, s.id DESC
                 LIMIT 500`,
                paramsDepartment,
                []
            ),
            consultaSegura(
                `SELECT id,
                        status_code,
                        method,
                        normalized_path,
                        request_path,
                        error_message,
                        occurrences,
                        last_seen_at
                 FROM system_error_logs
                 WHERE resolved_at IS NULL
                 ORDER BY last_seen_at DESC, id DESC
                 LIMIT 20`,
                [],
                []
            ),
            obtenerMovimientosSistema(20),
            obtenerApprovalDecisions()
        ]);

        const pendingFiles = files.filter(file => String(file.estado || '').toLowerCase() === 'pendiente');
        const issueFiles = files.filter(file =>
            ['con_errores', 'fallido'].includes(String(file.estado || '').toLowerCase())
        );

        const tasks = [
            ...files.map(file => {
                const status = String(file.estado || 'pendiente').toLowerCase();
                const hasIssues = ['con_errores', 'fallido'].includes(status);
                const isPending = status === 'pendiente';

                return {
                id: `file-${file.id}`,
                type: 'document',
                priority: hasIssues ? 'high' : 'normal',
                status: formatDocumentApprovalStatus(file.estado),
                title: file.nombre_original,
                context: [
                    file.departamento_nombre,
                    file.restaurante_nombre
                ].filter(Boolean).join(' / ') || 'Documents',
                owner: file.usuario_nombre || 'System',
                date: file.fecha_subida,
                actionUrl: '/views/documentos',
                detail: hasIssues
                    ? 'Document has validation errors that require review.'
                    : isPending
                        ? 'Uploaded document is waiting for validation or processing.'
                        : 'Department document is available in the system.'
                };
            }),
            ...prepaidSchedules.map(schedule => {
                let metadata = {};
                try {
                    metadata = typeof schedule.metadata_json === 'string'
                        ? JSON.parse(schedule.metadata_json || '{}')
                        : schedule.metadata_json || {};
                } catch {
                    metadata = {};
                }

                const saved = Boolean(metadata.saved_workbook?.saved_at);

                return {
                    id: `prepaid-${schedule.id}`,
                    type: 'prepaid',
                    priority: schedule.status === 'DIFFERENCE' ? 'high' : 'normal',
                    status: saved ? schedule.status : 'Needs save',
                    title: schedule.title || `Prepaid schedule #${schedule.id}`,
                    context: [schedule.brand, schedule.schedule_year].filter(Boolean).join(' / ') || 'Property Management',
                    owner: 'Property Management',
                    date: schedule.updated_at || schedule.created_at,
                    actionUrl: `/views/departments/prepaid-amortization?schedule=${encodeURIComponent(schedule.id)}`,
                    detail: saved
                        ? 'Schedule requires operational review based on current status.'
                        : 'Generated workbook has not been saved to the server.'
                };
            }),
            ...propertySchedules.map(schedule => ({
                id: `schedule-${schedule.id}`,
                type: 'schedule',
                priority: ['con_errores', 'fallido', 'error', 'failed'].includes(String(schedule.estado || '').toLowerCase())
                    ? 'high'
                    : 'normal',
                status: formatDocumentApprovalStatus(schedule.estado || 'draft'),
                title: schedule.nombre || `Schedule #${schedule.id}`,
                context: [
                    schedule.departamento_nombre,
                    [schedule.periodo_anio, schedule.periodo_mes].filter(Boolean).join(' / ')
                ].filter(Boolean).join(' / ') || 'Property Management',
                owner: schedule.usuario_nombre || 'Property Management',
                date: schedule.fecha_actualizacion || schedule.fecha_creacion,
                actionUrl: `/views/departments/property-management?schedule=${encodeURIComponent(schedule.id)}`,
                detail: `${Number(schedule.total_tiendas || 0)} stores / ${Number(schedule.total_filas || 0)} rows / balance ${Number(schedule.balance_total || 0).toLocaleString('en-US')}`
            })),
            ...openErrors.map(error => ({
                id: `error-${error.id}`,
                type: 'incident',
                priority: Number(error.status_code || 0) >= 500 ? 'critical' : 'high',
                status: Number(error.status_code || 0) >= 500 ? 'Critical' : 'Open',
                title: `${error.method || 'API'} ${error.normalized_path || error.request_path || 'Unknown route'}`,
                context: 'System errors',
                owner: 'Information Technology',
                date: error.last_seen_at,
                actionUrl: '/views/system-errors',
                detail: error.error_message || `${error.occurrences || 1} occurrence(s)`
            }))
        ].sort((a, b) => {
            const priority = { critical: 3, high: 2, normal: 1 };
            return (priority[b.priority] || 0) - (priority[a.priority] || 0)
                || new Date(b.date || 0) - new Date(a.date || 0);
        });

        const decisionMap = new Map((approvals || []).map(decision => [decision.task_id, decision]));
        const eventRows = await obtenerApprovalEvents(tasks.map(task => task.id));
        const eventCountMap = eventRows.reduce((map, event) => {
            map.set(event.task_id, (map.get(event.task_id) || 0) + 1);
            return map;
        }, new Map());
        const enrichedTasks = tasks.map(task => {
            const decision = decisionMap.get(task.id);
            const workflowStatus = decision?.decision_status || 'pending_review';
            const sla = calcularApprovalSla(task.date, task.priority, workflowStatus);

            return {
                ...task,
                workflowStatus,
                workflowNotes: decision?.notes || '',
                workflowBy: decision?.decided_by_nombre || '',
                workflowAt: decision?.decided_at || decision?.updated_at || '',
                history_count: eventCountMap.get(task.id) || 0,
                ...sla
            };
        });

        res.json({
            success: true,
            generated_at: new Date().toISOString(),
            summary: {
                total_tasks: enrichedTasks.length,
                critical: enrichedTasks.filter(task => task.priority === 'critical').length,
                high: enrichedTasks.filter(task => task.priority === 'high').length,
                documents_pending: pendingFiles.length,
                documents_with_issues: issueFiles.length,
                documents_total: files.length,
                prepaid_attention: prepaidSchedules.length,
                schedules_total: propertySchedules.length,
                incidents_open: openErrors.length,
                overdue: enrichedTasks.filter(task => task.sla_status === 'overdue').length,
                due_soon: enrichedTasks.filter(task => task.sla_status === 'due_soon').length,
                approved: enrichedTasks.filter(task => task.workflowStatus === 'approved').length,
                changes_requested: enrichedTasks.filter(task => task.workflowStatus === 'changes_requested').length
            },
            tasks: enrichedTasks.slice(0, 500),
            recent_activity: recentMovements,
            approvals,
            history: eventRows
        });
    } catch (error) {
        console.error('Approval center could not be loaded:', error);
        res.status(500).json({
            success: false,
            message: 'Approval center could not be loaded'
        });
    }
});

router.get('/approval-center/decisions', verificarToken, checkPermission('view_approval_center'), async (req, res) => {
    try {
        res.json({
            success: true,
            decisions: await obtenerApprovalDecisions()
        });
    } catch (error) {
        console.error('Approval decisions could not be loaded:', error);
        res.status(500).json({
            success: false,
            message: 'Approval decisions could not be loaded'
        });
    }
});

router.post('/approval-center/decision', verificarToken, checkPermission('manage_approval_center'), async (req, res) => {
    try {
        await ensureApprovalWorkflowTable();

        const taskId = String(req.body.task_id || req.body.taskId || '').trim().slice(0, 160);
        const taskType = String(req.body.task_type || req.body.taskType || 'task').trim().slice(0, 60);
        const taskTitle = String(req.body.task_title || req.body.taskTitle || 'Approval task').trim().slice(0, 255);
        const taskContext = String(req.body.task_context || req.body.taskContext || '').trim().slice(0, 255) || null;
        const sourceUrl = String(req.body.source_url || req.body.sourceUrl || '').trim().slice(0, 500) || null;
        const priority = String(req.body.priority || 'normal').trim().slice(0, 40) || 'normal';
        const notes = String(req.body.notes || req.body.comment || '').trim().slice(0, 2000) || null;
        const status = normalizarDecisionStatus(req.body.decision_status || req.body.status);

        if (!taskId) {
            return res.status(400).json({
                success: false,
                message: 'Task id is required'
            });
        }

        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'A valid approval status is required'
            });
        }

        const previousDecisions = await obtenerApprovalDecisions();
        const previousDecision = previousDecisions.find(row => row.task_id === taskId) || null;
        const previousStatus = previousDecision?.decision_status || 'pending_review';

        await pool.query(
            `INSERT INTO approval_task_decisions
             (task_id, task_type, task_title, task_context, source_url, decision_status, priority, notes, decided_by, decided_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
                task_type = VALUES(task_type),
                task_title = VALUES(task_title),
                task_context = VALUES(task_context),
                source_url = VALUES(source_url),
                decision_status = VALUES(decision_status),
                priority = VALUES(priority),
                notes = VALUES(notes),
                decided_by = VALUES(decided_by),
                decided_at = NOW()`,
            [
                taskId,
                taskType,
                taskTitle,
                taskContext,
                sourceUrl,
                status,
                priority,
                notes,
                req.usuario.id
            ]
        );

        await pool.query(
            `INSERT INTO approval_task_events
             (task_id, task_type, event_type, previous_status, new_status, comment, actor_id, actor_name, metadata)
             VALUES (?, ?, 'decision', ?, ?, ?, ?, ?, ?)`,
            [
                taskId,
                taskType,
                previousStatus,
                status,
                notes,
                req.usuario.id,
                req.usuario.nombre_completo || req.usuario.username || req.usuario.email || null,
                JSON.stringify({
                    task_title: taskTitle,
                    task_context: taskContext,
                    source_url: sourceUrl,
                    priority
                })
            ]
        );

        const sourceUpdate = taskType === 'document'
            ? await actualizarEstadoDocumentoPorApproval(taskId, status)
            : null;
        const notificationResult = await notificarComentarioApproval({
            taskId,
            taskType,
            taskTitle,
            status,
            priority,
            notes,
            actorId: req.usuario.id
        });

        const decisions = await obtenerApprovalDecisions();
        const decision = decisions.find(row => row.task_id === taskId) || null;
        const history = await obtenerApprovalEventsPorTask(taskId);

        res.json({
            success: true,
            decision,
            history,
            source_update: sourceUpdate,
            notification: notificationResult
        });
    } catch (error) {
        console.error('Approval decision could not be saved:', error);
        res.status(500).json({
            success: false,
            message: 'Approval decision could not be saved'
        });
    }
});

router.get('/approval-center/history/:taskId', verificarToken, checkPermission('view_approval_center'), async (req, res) => {
    try {
        const taskId = String(req.params.taskId || '').trim().slice(0, 160);

        if (!taskId) {
            return res.status(400).json({
                success: false,
                message: 'Task id is required'
            });
        }

        res.json({
            success: true,
            task_id: taskId,
            history: await obtenerApprovalEventsPorTask(taskId)
        });
    } catch (error) {
        console.error('Approval history could not be loaded:', error);
        res.status(500).json({
            success: false,
            message: 'Approval history could not be loaded'
        });
    }
});

module.exports = router;
