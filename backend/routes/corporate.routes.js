const express = require('express');
const fs = require('fs');
const router = express.Router();

const { pool } = require('../config/database');
const { verificarToken, checkPermission, esAdmin } = require('../middleware/auth.middleware');
const { getIntacctConfigStatus } = require('../services/intacctConfig.service');
const {
    testIntacctConnection,
    readByQuery
} = require('../services/intacctClient.service');
const {
    ensureCorporateSchema,
    parseJson,
    createReference,
    createFileHash,
    recordOperationalAudit
} = require('../services/corporatePlatform.service');
const {
    smtpStatus,
    runScheduledReport,
    reportPath
} = require('../services/corporateReport.service');
const { checkAllIntegrations } = require('../services/integrationHealth.service');

router.use(verificarToken);
router.use(async (req, res, next) => {
    try {
        await ensureCorporateSchema();
        next();
    } catch (error) {
        console.error('Corporate schema initialization failed:', error);
        res.status(500).json({
            success: false,
            error: true,
            message: 'Corporate platform tables could not be initialized',
            code: error.code || 'CORPORATE_SCHEMA_ERROR'
        });
    }
});

function text(value, max = 255) {
    return String(value || '').trim().slice(0, max);
}

function integer(value, fallback = null) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : fallback;
}

function decimal(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1' || value === 'true') return true;
    if (value === 0 || value === '0' || value === 'false') return false;
    return fallback;
}

function dateOrNull(value) {
    const raw = text(value, 40);
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : raw;
}

function parseLimit(value, fallback = 50, max = 250) {
    const parsed = integer(value, fallback);
    return Math.min(Math.max(parsed || fallback, 1), max);
}

function parseOffset(value) {
    return Math.max(integer(value, 0) || 0, 0);
}

async function tableExists(tableName) {
    const [rows] = await pool.query(
        `SELECT 1
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
         LIMIT 1`,
        [tableName]
    );
    return rows.length > 0;
}

async function safeScalar(query, params = [], fallback = 0) {
    try {
        const [rows] = await pool.query(query, params);
        const first = rows[0] || {};
        const key = Object.keys(first)[0];
        return key ? Number(first[key] || 0) : fallback;
    } catch (error) {
        if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) return fallback;
        throw error;
    }
}

async function safeRow(query, params = [], fallback = {}) {
    try {
        const [rows] = await pool.query(query, params);
        return rows[0] || fallback;
    } catch (error) {
        if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) return fallback;
        throw error;
    }
}

function nextReportRun(frequency, deliveryHour = 8) {
    const now = new Date();
    const next = new Date(now);
    next.setMinutes(0, 0, 0);
    next.setHours(Math.min(Math.max(Number(deliveryHour || 8), 0), 23));

    if (next <= now) next.setDate(next.getDate() + 1);

    if (frequency === 'weekly') {
        while (next.getDay() !== 1) next.setDate(next.getDate() + 1);
    } else if (frequency === 'monthly') {
        next.setDate(1);
        if (next <= now) next.setMonth(next.getMonth() + 1);
    }

    return next.toISOString().slice(0, 19).replace('T', ' ');
}

// -----------------------------------------------------------------------------
// Executive corporate overview
// -----------------------------------------------------------------------------
router.get(
    '/overview',
    async (req, res) => {
        try {
            const [reportRows, workflowRows] = await Promise.all([
                pool.query(
                    `SELECT COUNT(*) AS total,
                            SUM(active = TRUE) AS active_total,
                            SUM(active = TRUE AND next_run_at <= NOW()) AS due_total
                     FROM corporate_scheduled_reports`
                ),
                pool.query(
                    `SELECT workflow_status, COUNT(*) AS total
                     FROM corporate_document_versions
                     GROUP BY workflow_status`
                )
            ]);

            const filesTotal = await safeScalar('SELECT COUNT(*) AS total FROM archivos_excel');
            const storesTotal = await safeScalar('SELECT COUNT(*) AS total FROM restaurantes WHERE activo = TRUE');
            const reconciliations = await safeRow(
                `SELECT COUNT(*) AS total,
                        SUM(estado = 'borrador') AS pending,
                        SUM(estado IN ('completada', 'aprobada')) AS completed,
                        SUM(conceptos_diferencia > 0) AS with_differences,
                        COALESCE(SUM(monto_total_diferencia), 0) AS difference_amount
                 FROM conciliaciones
                 WHERE fecha_conciliacion >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`
            );
            const notificationsUnread = await safeScalar(
                `SELECT COUNT(*) AS total
                 FROM notificaciones
                 WHERE usuario_id = ? AND leida = FALSE AND archivada = FALSE`,
                [req.usuario.id]
            );
            const integrationHealth = await checkAllIntegrations().catch(error => {
                console.error('Corporate overview integration health error:', error);
                return null;
            });

            const reports = reportRows[0][0] || {};

            res.json({
                success: true,
                generated_at: new Date().toISOString(),
                summary: {
                    scheduled_reports: Number(reports.total || 0),
                    active_scheduled_reports: Number(reports.active_total || 0),
                    reports_due: Number(reports.due_total || 0),
                    documents_total: filesTotal,
                    stores_total: storesTotal,
                    reconciliations_total: Number(reconciliations.total || 0),
                    reconciliations_pending: Number(reconciliations.pending || 0),
                    reconciliations_with_differences: Number(reconciliations.with_differences || 0),
                    reconciliations_difference_amount: Number(reconciliations.difference_amount || 0),
                    notifications_unread: notificationsUnread
                },
                document_workflow: Object.fromEntries(
                    workflowRows[0].map(row => [row.workflow_status, Number(row.total || 0)])
                ),
                integration_health: integrationHealth
                    ? {
                        availability: integrationHealth.summary.availability,
                        online: integrationHealth.summary.online,
                        warning: integrationHealth.summary.warning,
                        offline: integrationHealth.summary.offline,
                        checked_at: integrationHealth.generated_at
                    }
                    : null
            });
        } catch (error) {
            console.error('Corporate overview error:', error);
            res.status(500).json({ success: false, message: 'Corporate overview could not be loaded' });
        }
    }
);

// -----------------------------------------------------------------------------
// Document lifecycle and immutable version history
// -----------------------------------------------------------------------------
router.get(
    '/documents/:archivoId/lifecycle',
    checkPermission('documentos', 'ver'),
    async (req, res) => {
        try {
            const archivoId = integer(req.params.archivoId);
            const [versions, events] = await Promise.all([
                pool.query(
                    `SELECT v.*,
                            owner.nombre_completo AS owner_name,
                            reviewer.nombre_completo AS reviewer_name,
                            approver.nombre_completo AS approver_name
                     FROM corporate_document_versions v
                     LEFT JOIN usuarios owner ON owner.id = v.owner_id
                     LEFT JOIN usuarios reviewer ON reviewer.id = v.reviewer_id
                     LEFT JOIN usuarios approver ON approver.id = v.approver_id
                     WHERE v.archivo_id = ?
                     ORDER BY v.version_number DESC`,
                    [archivoId]
                ),
                pool.query(
                    `SELECT e.*, u.nombre_completo AS actor_name
                     FROM corporate_document_events e
                     LEFT JOIN usuarios u ON u.id = e.actor_id
                     WHERE e.archivo_id = ?
                     ORDER BY e.created_at DESC, e.id DESC`,
                    [archivoId]
                )
            ]);

            res.json({ success: true, versions: versions[0], events: events[0] });
        } catch (error) {
            console.error('Document lifecycle error:', error);
            res.status(500).json({ success: false, message: 'Document lifecycle could not be loaded' });
        }
    }
);

router.post(
    '/documents/:archivoId/transition',
    checkPermission('documentos', 'editar'),
    async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const archivoId = integer(req.params.archivoId);
            const allowed = ['draft', 'uploaded', 'under_review', 'changes_requested', 'approved', 'posted', 'archived', 'rejected'];
            const newStatus = text(req.body.status, 40);
            if (!allowed.includes(newStatus)) return res.status(400).json({ success: false, message: 'Invalid document workflow status' });

            const notes = text(req.body.notes, 5000) || null;
            if (['changes_requested', 'rejected'].includes(newStatus) && !notes) {
                return res.status(400).json({ success: false, message: 'A comment is required for this workflow decision' });
            }

            await connection.beginTransaction();
            const [fileRows] = await connection.query(
                `SELECT id, nombre_original, nombre_servidor, estado, usuario_id, departamento_id
                 FROM archivos_excel
                 WHERE id = ?
                 LIMIT 1
                 FOR UPDATE`,
                [archivoId]
            );
            const file = fileRows[0];
            if (!file) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'Document was not found' });
            }

            const [versionRows] = await connection.query(
                `SELECT * FROM corporate_document_versions
                 WHERE archivo_id = ?
                 ORDER BY version_number DESC
                 LIMIT 1
                 FOR UPDATE`,
                [archivoId]
            );
            let version = versionRows[0];

            if (!version) {
                const [insertVersion] = await connection.query(
                    `INSERT INTO corporate_document_versions
                        (archivo_id, version_number, workflow_status, file_hash, source_filename,
                         owner_id, departamento_id, metadata_json)
                     VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
                    [
                        archivoId,
                        newStatus,
                        createFileHash(`${archivoId}:${file.nombre_servidor || file.nombre_original || ''}`),
                        file.nombre_original || file.nombre_servidor,
                        file.usuario_id || req.usuario.id,
                        file.departamento_id || req.departamento?.id || null,
                        JSON.stringify({ initialized_from_legacy_file: true })
                    ]
                );
                version = { id: insertVersion.insertId, version_number: 1, workflow_status: file.estado || 'uploaded' };
            }

            if (version.locked_at && !['archived'].includes(newStatus)) {
                await connection.rollback();
                return res.status(409).json({ success: false, message: 'Approved document versions are locked. Create a new version before changing them.' });
            }

            await connection.query(
                `UPDATE corporate_document_versions
                 SET workflow_status = ?, comments = ?,
                     reviewer_id = CASE WHEN ? = 'under_review' THEN ? ELSE reviewer_id END,
                     approver_id = CASE WHEN ? IN ('approved', 'posted') THEN ? ELSE approver_id END,
                     approved_at = CASE WHEN ? IN ('approved', 'posted') THEN COALESCE(approved_at, NOW()) ELSE approved_at END,
                     locked_at = CASE WHEN ? IN ('approved', 'posted', 'archived') THEN COALESCE(locked_at, NOW()) ELSE locked_at END
                 WHERE id = ?`,
                [newStatus, notes, newStatus, req.usuario.id, newStatus, req.usuario.id, newStatus, newStatus, version.id]
            );

            await connection.query(
                `INSERT INTO corporate_document_events
                    (archivo_id, version_id, event_type, previous_status, new_status, actor_id, notes, metadata_json)
                 VALUES (?, ?, 'status_transition', ?, ?, ?, ?, ?)`,
                [
                    archivoId,
                    version.id,
                    version.workflow_status || file.estado || null,
                    newStatus,
                    req.usuario.id,
                    notes,
                    JSON.stringify({ request_id: req.requestId || null })
                ]
            );

            await connection.query('UPDATE archivos_excel SET estado = ? WHERE id = ?', [newStatus, archivoId]);
            await connection.commit();

            await recordOperationalAudit({
                req,
                action: 'document_status_transition',
                resourceType: 'document',
                resourceId: archivoId,
                before: { status: version.workflow_status || file.estado },
                after: { status: newStatus, version: version.version_number, notes }
            });

            res.json({ success: true, status: newStatus, version_id: version.id });
        } catch (error) {
            await connection.rollback();
            console.error('Document transition error:', error);
            res.status(500).json({ success: false, message: 'Document workflow could not be updated' });
        } finally {
            connection.release();
        }
    }
);

router.post(
    '/documents/:archivoId/versions',
    checkPermission('documentos', 'crear'),
    async (req, res) => {
        try {
            const archivoId = integer(req.params.archivoId);
            const [fileRows] = await pool.query(
                'SELECT id, nombre_original, nombre_servidor, usuario_id, departamento_id FROM archivos_excel WHERE id = ? LIMIT 1',
                [archivoId]
            );
            const file = fileRows[0];
            if (!file) return res.status(404).json({ success: false, message: 'Document was not found' });

            const [versionRows] = await pool.query(
                'SELECT COALESCE(MAX(version_number), 0) AS max_version FROM corporate_document_versions WHERE archivo_id = ?',
                [archivoId]
            );
            const versionNumber = Number(versionRows[0]?.max_version || 0) + 1;
            const [result] = await pool.query(
                `INSERT INTO corporate_document_versions
                    (archivo_id, version_number, workflow_status, file_hash, source_filename,
                     owner_id, departamento_id, comments, metadata_json)
                 VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
                [
                    archivoId,
                    versionNumber,
                    createFileHash(`${archivoId}:${versionNumber}:${Date.now()}`),
                    text(req.body.source_filename, 255) || file.nombre_original || file.nombre_servidor,
                    req.usuario.id,
                    file.departamento_id || req.departamento?.id || null,
                    text(req.body.comments, 5000) || null,
                    JSON.stringify(req.body.metadata || {})
                ]
            );

            await pool.query(
                `INSERT INTO corporate_document_events
                    (archivo_id, version_id, event_type, new_status, actor_id, notes)
                 VALUES (?, ?, 'version_created', 'draft', ?, ?)`,
                [archivoId, result.insertId, req.usuario.id, text(req.body.comments, 5000) || null]
            );

            await recordOperationalAudit({
                req,
                action: 'document_version_created',
                resourceType: 'document',
                resourceId: archivoId,
                after: { versionNumber, versionId: result.insertId }
            });

            res.status(201).json({ success: true, version_id: result.insertId, version_number: versionNumber });
        } catch (error) {
            console.error('Create document version error:', error);
            res.status(500).json({ success: false, message: 'Document version could not be created' });
        }
    }
);

// -----------------------------------------------------------------------------
// Audit center
// -----------------------------------------------------------------------------
router.get(
    '/audit',
    checkPermission('auditCenter', 'ver'),
    async (req, res) => {
        try {
            const limit = parseLimit(req.query.limit, 100, 250);
            const offset = parseOffset(req.query.offset);
            const search = text(req.query.search, 120);
            const action = text(req.query.action, 80);
            const where = [];
            const params = [];

            if (search) {
                const like = `%${search}%`;
                where.push('(a.action_name LIKE ? OR a.resource_type LIKE ? OR a.resource_id LIKE ? OR u.nombre_completo LIKE ? OR u.username LIKE ?)');
                params.push(like, like, like, like, like);
            }
            if (action) {
                where.push('a.action_name = ?');
                params.push(action);
            }

            const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
            const [rows] = await pool.query(
                `SELECT a.*,
                        u.nombre_completo AS user_name,
                        u.username,
                        d.nombre AS department_name
                 FROM auditoria_operativa a
                 LEFT JOIN usuarios u ON u.id = a.usuario_id
                 LEFT JOIN departamentos d ON d.id = a.departamento_id
                 ${whereSql}
                 ORDER BY a.created_at DESC, a.id DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const events = rows.map(row => ({
                ...row,
                before: parseJson(row.before_json),
                after: parseJson(row.after_json),
                metadata: parseJson(row.metadata_json)
            }));

            const [summary] = await pool.query(
                `SELECT COUNT(*) AS total,
                        COUNT(DISTINCT usuario_id) AS users,
                        COUNT(DISTINCT resource_type) AS resource_types,
                        SUM(created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS last_24h
                 FROM auditoria_operativa`
            );

            res.json({ success: true, events, summary: summary[0] || {} });
        } catch (error) {
            console.error('Audit center error:', error);
            res.status(500).json({ success: false, message: 'Operational audit could not be loaded' });
        }
    }
);

// -----------------------------------------------------------------------------
// Integration monitor: Sage Intacct, database, SMTP, OpenAI, CDTFA tax API
// -----------------------------------------------------------------------------
router.get(
    '/integrations/health',
    checkPermission('systemCenter', 'ver'),
    async (req, res) => {
        try {
            const health = await checkAllIntegrations();
            res.json({ success: true, ...health });
        } catch (error) {
            console.error('Integration monitor error:', error);
            res.status(500).json({ success: false, message: 'Integration health could not be evaluated' });
        }
    }
);

router.post(
    '/integrations/:provider/runs',
    esAdmin,
    checkPermission('systemCenter', 'editar'),
    async (req, res) => {
        try {
            const provider = text(req.params.provider, 60);
            const allowedProviders = ['sage-intacct', 'microsoft-entra', 'ai-assistant'];
            if (!allowedProviders.includes(provider)) return res.status(400).json({ success: false, message: 'Unsupported integration provider' });

            const operation = text(req.body.operation, 80) || 'configuration_check';
            let status = operation === 'configuration_check' ? 'completed' : 'queued';
            let summary = 'Integration request was registered.';
            let errors = 0;
            let recordsProcessed = 0;
            let metadata = { request_id: req.requestId || null };

            if (provider === 'sage-intacct' && operation === 'configuration_check') {
                const config = getIntacctConfigStatus();
                errors = config.ready ? 0 : config.missing.length;
                summary = config.ready
                    ? 'Sage Intacct credentials are configured.'
                    : `Missing Sage Intacct variables: ${config.missing.join(', ')}`;
            }

            if (provider === 'sage-intacct' && operation === 'connection_test') {
                status = 'completed';
                try {
                    const connection = await testIntacctConnection();
                    summary = connection.sessionIssued
                        ? 'Sage Intacct accepted the credentials and issued an API session.'
                        : 'Sage Intacct accepted the request, but no API session identifier was returned.';
                    metadata = {
                        ...metadata,
                        company_id: connection.companyId,
                        entity_id: connection.entityId,
                        endpoint: connection.endpoint,
                        intacct_request_id: connection.requestId,
                        session_issued: connection.sessionIssued
                    };
                } catch (error) {
                    errors = 1;
                    status = 'failed';
                    summary = text(error.message, 1000) || 'Sage Intacct connection test failed.';
                    metadata = {
                        ...metadata,
                        error_code: error.code || 'INTACCT_CONNECTION_ERROR'
                    };
                }
            }

            const [result] = await pool.query(
                `INSERT INTO corporate_integration_runs
                    (provider, operation, status, requested_by, records_processed,
                     warnings_count, errors_count, started_at, completed_at, summary, metadata_json)
                 VALUES (?, ?, ?, ?, ?, 0, ?, NOW(), ?, ?, ?)`,
                [
                    provider,
                    operation,
                    errors ? 'failed' : status,
                    req.usuario.id,
                    recordsProcessed,
                    errors,
                    status === 'completed' || errors ? new Date() : null,
                    summary,
                    JSON.stringify(metadata)
                ]
            );

            await recordOperationalAudit({
                req,
                action: 'integration_run_requested',
                resourceType: 'integration',
                resourceId: result.insertId,
                after: { provider, operation, status: errors ? 'failed' : status, summary }
            });

            res.status(201).json({ success: true, run_id: result.insertId, status: errors ? 'failed' : status, summary });
        } catch (error) {
            console.error('Integration run error:', error);
            res.status(500).json({ success: false, message: 'Integration request could not be registered' });
        }
    }
);

router.post(
    '/integrations/sage-intacct/query',
    esAdmin,
    checkPermission('systemCenter', 'editar'),
    async (req, res) => {
        try {
            const result = await readByQuery({
                object: req.body.object,
                fields: req.body.fields,
                query: req.body.query,
                pageSize: req.body.page_size
            });

            await recordOperationalAudit({
                req,
                action: 'intacct_read_query_executed',
                resourceType: 'integration',
                resourceId: 'sage-intacct',
                after: {
                    object: result.object,
                    fields: Array.isArray(req.body.fields)
                        ? req.body.fields
                        : text(req.body.fields, 1000),
                    query: text(req.body.query, 4000),
                    page_size: Math.min(Math.max(integer(req.body.page_size, 100), 1), 1000),
                    rows_returned: result.rows.length,
                    total_count: result.totalCount,
                    intacct_request_id: result.requestId
                }
            });

            res.json(result);
        } catch (error) {
            console.error('Sage Intacct query error:', error);
            res.status(
                ['INTACCT_NOT_CONFIGURED', 'INTACCT_OBJECT_NOT_ALLOWED'].includes(error.code)
                    ? 400
                    : 502
            ).json({
                success: false,
                message: text(error.message, 1000) || 'Sage Intacct query failed.',
                code: error.code || 'INTACCT_QUERY_ERROR'
            });
        }
    }
);

// -----------------------------------------------------------------------------
// Scheduled reports
// -----------------------------------------------------------------------------
router.get(
    '/reports',
    checkPermission('reportCenter', 'ver'),
    async (req, res) => {
        try {
            const [rows] = await pool.query(
                `SELECT r.*, u.nombre_completo AS created_by_name
                 FROM corporate_scheduled_reports r
                 LEFT JOIN usuarios u ON u.id = r.created_by
                 ORDER BY r.active DESC, r.next_run_at, r.name`
            );
            const smtp = smtpStatus();
            res.json({
                success: true,
                delivery: {
                    smtp_ready: smtp.ready
                },
                reports: rows.map(row => ({
                    ...row,
                    recipients: parseJson(row.recipients_json, []),
                    filters: parseJson(row.filters_json, {}),
                    output_available: fs.existsSync(reportPath(row.id, row.format))
                }))
            });
        } catch (error) {
            console.error('Scheduled reports error:', error);
            res.status(500).json({ success: false, message: 'Scheduled reports could not be loaded' });
        }
    }
);

router.post(
    '/reports',
    checkPermission('reportCenter', 'crear'),
    async (req, res) => {
        try {
            const name = text(req.body.name, 140);
            const reportType = text(req.body.report_type, 80);
            const frequency = ['daily', 'weekly', 'monthly'].includes(text(req.body.frequency, 30))
                ? text(req.body.frequency, 30)
                : 'weekly';
            const recipients = Array.isArray(req.body.recipients)
                ? req.body.recipients.map(item => text(item, 180)).filter(Boolean).slice(0, 50)
                : text(req.body.recipients, 2000).split(',').map(item => item.trim()).filter(Boolean).slice(0, 50);

            if (!name || !reportType || !recipients.length) {
                return res.status(400).json({ success: false, message: 'Name, report type, and at least one recipient are required' });
            }

            const deliveryHour = Math.min(Math.max(integer(req.body.delivery_hour, 8), 0), 23);
            const format = ['csv', 'xlsx', 'pdf'].includes(text(req.body.format, 20))
                ? text(req.body.format, 20)
                : 'csv';
            const [result] = await pool.query(
                `INSERT INTO corporate_scheduled_reports
                    (name, report_type, frequency, delivery_hour, timezone,
                     recipients_json, filters_json, format, active, next_run_at, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    name,
                    reportType,
                    frequency,
                    deliveryHour,
                    text(req.body.timezone, 60) || 'America/Phoenix',
                    JSON.stringify(recipients),
                    JSON.stringify(req.body.filters || {}),
                    format,
                    boolean(req.body.active, true),
                    nextReportRun(frequency, deliveryHour),
                    req.usuario.id
                ]
            );

            await recordOperationalAudit({
                req,
                action: 'scheduled_report_created',
                resourceType: 'scheduled_report',
                resourceId: result.insertId,
                after: { name, reportType, frequency, deliveryHour, recipients, format }
            });

            res.status(201).json({ success: true, id: result.insertId });
        } catch (error) {
            console.error('Create scheduled report error:', error);
            res.status(500).json({ success: false, message: 'Scheduled report could not be created' });
        }
    }
);

router.patch(
    '/reports/:id',
    checkPermission('reportCenter', 'editar'),
    async (req, res) => {
        try {
            const id = integer(req.params.id);
            const [rows] = await pool.query('SELECT * FROM corporate_scheduled_reports WHERE id = ? LIMIT 1', [id]);
            const existing = rows[0];
            if (!existing) return res.status(404).json({ success: false, message: 'Scheduled report was not found' });

            const active = req.body.active === undefined ? Boolean(existing.active) : boolean(req.body.active);
            const frequency = req.body.frequency && ['daily', 'weekly', 'monthly'].includes(text(req.body.frequency, 30))
                ? text(req.body.frequency, 30)
                : existing.frequency;
            const deliveryHour = req.body.delivery_hour === undefined
                ? Number(existing.delivery_hour || 8)
                : Math.min(Math.max(integer(req.body.delivery_hour, 8), 0), 23);

            await pool.query(
                `UPDATE corporate_scheduled_reports
                 SET active = ?, frequency = ?, delivery_hour = ?,
                     next_run_at = CASE WHEN ? = TRUE THEN ? ELSE next_run_at END
                 WHERE id = ?`,
                [active, frequency, deliveryHour, active, nextReportRun(frequency, deliveryHour), id]
            );

            await recordOperationalAudit({
                req,
                action: 'scheduled_report_updated',
                resourceType: 'scheduled_report',
                resourceId: id,
                before: existing,
                after: { active, frequency, deliveryHour }
            });

            res.json({ success: true });
        } catch (error) {
            console.error('Update scheduled report error:', error);
            res.status(500).json({ success: false, message: 'Scheduled report could not be updated' });
        }
    }
);


router.post(
    '/reports/:id/run',
    esAdmin,
    checkPermission('reportCenter', 'editar'),
    async (req, res) => {
        try {
            const id = integer(req.params.id);
            const [rows] = await pool.query(
                'SELECT * FROM corporate_scheduled_reports WHERE id = ? LIMIT 1',
                [id]
            );
            const report = rows[0];
            if (!report) return res.status(404).json({ success: false, message: 'Scheduled report was not found' });

            const result = await runScheduledReport(report);
            await pool.query(
                `UPDATE corporate_scheduled_reports
                 SET last_run_at = NOW(), last_status = ?, next_run_at = ?
                 WHERE id = ?`,
                [result.status, nextReportRun(report.frequency, report.delivery_hour), id]
            );

            await recordOperationalAudit({
                req,
                action: 'scheduled_report_executed',
                resourceType: 'scheduled_report',
                resourceId: id,
                after: {
                    status: result.status,
                    records: result.records || 0,
                    delivered: Boolean(result.delivered),
                    error: result.error || null
                }
            });

            return res.status(result.success ? 200 : 500).json(result);
        } catch (error) {
            console.error('Run scheduled report error:', error);
            return res.status(500).json({ success: false, message: 'Scheduled report could not be executed' });
        }
    }
);

router.get(
    '/reports/:id/download-latest',
    checkPermission('reportCenter', 'exportar'),
    async (req, res) => {
        try {
            const id = integer(req.params.id);
            const [rows] = await pool.query(
                'SELECT id, name, format FROM corporate_scheduled_reports WHERE id = ? LIMIT 1',
                [id]
            );
            const report = rows[0];
            if (!report) return res.status(404).json({ success: false, message: 'Scheduled report was not found' });

            const outputPath = reportPath(report.id, report.format);
            if (!fs.existsSync(outputPath)) {
                return res.status(404).json({ success: false, message: 'No generated output is available for this report yet' });
            }

            await recordOperationalAudit({
                req,
                action: 'scheduled_report_downloaded',
                resourceType: 'scheduled_report',
                resourceId: id,
                metadata: { format: report.format }
            });

            const safeName = String(report.name || 'corporate-report')
                .replace(/[^a-zA-Z0-9._-]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'corporate-report';
            return res.download(outputPath, `${safeName}.${report.format}`);
        } catch (error) {
            console.error('Download scheduled report error:', error);
            return res.status(500).json({ success: false, message: 'Report output could not be downloaded' });
        }
    }
);

router.post(
    '/reports/run-due',
    esAdmin,
    checkPermission('reportCenter', 'editar'),
    async (req, res) => {
        try {
            const [dueReports] = await pool.query(
                `SELECT * FROM corporate_scheduled_reports
                 WHERE active = TRUE AND next_run_at <= NOW()
                 ORDER BY next_run_at
                 LIMIT 20`
            );

            const results = [];
            for (const report of dueReports) {
                const result = await runScheduledReport(report);
                await pool.query(
                    `UPDATE corporate_scheduled_reports
                     SET last_run_at = NOW(), last_status = ?,
                         next_run_at = ?
                     WHERE id = ?`,
                    [result.status, nextReportRun(report.frequency, report.delivery_hour), report.id]
                );
                results.push({
                    id: report.id,
                    name: report.name,
                    status: result.status,
                    records: result.records || 0,
                    delivered: Boolean(result.delivered),
                    error: result.error || null
                });
            }

            const successful = results.filter(item => item.status !== 'failed').length;
            const failed = results.filter(item => item.status === 'failed').length;
            await recordOperationalAudit({
                req,
                action: 'scheduled_reports_executed',
                resourceType: 'scheduled_report_batch',
                resourceId: createReference('RPT'),
                after: { total: results.length, successful, failed, results }
            });

            res.json({
                success: failed === 0,
                processed: results.length,
                successful,
                failed,
                results,
                message: results.length
                    ? `${successful} report(s) generated successfully${failed ? `; ${failed} failed` : ''}.`
                    : 'No reports are due.'
            });
        } catch (error) {
            console.error('Run scheduled reports error:', error);
            res.status(500).json({ success: false, message: 'Due reports could not be queued' });
        }
    }
);

module.exports = router;
