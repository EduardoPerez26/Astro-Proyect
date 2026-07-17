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
    recordOperationalAudit,
    calculateSeverity
} = require('../services/corporatePlatform.service');
const {
    smtpStatus,
    runScheduledReport,
    reportPath
} = require('../services/corporateReport.service');

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

async function refreshClosePeriodTotals(periodId) {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS total,
                SUM(status IN ('completed', 'verified', 'closed')) AS completed
         FROM corporate_close_tasks
         WHERE close_period_id = ?`,
        [periodId]
    );

    const total = Number(rows[0]?.total || 0);
    const completed = Number(rows[0]?.completed || 0);

    await pool.query(
        `UPDATE corporate_close_periods
         SET total_tasks = ?, completed_tasks = ?
         WHERE id = ?`,
        [total, completed, periodId]
    );

    return { total, completed };
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
    checkPermission('closeCenter', 'ver'),
    async (req, res) => {
        try {
            const [closeRows, exceptionRows, integrationRows, reportRows, workflowRows] = await Promise.all([
                pool.query(
                    `SELECT COUNT(*) AS periods,
                            SUM(status = 'open') AS open_periods,
                            COALESCE(SUM(total_tasks), 0) AS total_tasks,
                            COALESCE(SUM(completed_tasks), 0) AS completed_tasks
                     FROM corporate_close_periods
                     WHERE status <> 'archived'`
                ),
                pool.query(
                    `SELECT COUNT(*) AS total,
                            SUM(status NOT IN ('resolved', 'verified', 'closed')) AS open_total,
                            SUM(severity = 'critical' AND status NOT IN ('resolved', 'verified', 'closed')) AS critical_total,
                            COALESCE(SUM(CASE WHEN status NOT IN ('resolved', 'verified', 'closed') THEN ABS(amount) ELSE 0 END), 0) AS open_amount
                     FROM corporate_exceptions`
                ),
                pool.query(
                    `SELECT COUNT(*) AS runs,
                            SUM(status = 'failed') AS failures,
                            MAX(created_at) AS last_run_at
                     FROM corporate_integration_runs
                     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
                ),
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
            const close = closeRows[0][0] || {};
            const exceptions = exceptionRows[0][0] || {};
            const integrations = integrationRows[0][0] || {};
            const reports = reportRows[0][0] || {};
            const totalTasks = Number(close.total_tasks || 0);
            const completedTasks = Number(close.completed_tasks || 0);

            res.json({
                success: true,
                generated_at: new Date().toISOString(),
                summary: {
                    close_periods: Number(close.periods || 0),
                    open_close_periods: Number(close.open_periods || 0),
                    close_completion_rate: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0,
                    close_tasks_total: totalTasks,
                    close_tasks_completed: completedTasks,
                    exceptions_open: Number(exceptions.open_total || 0),
                    exceptions_critical: Number(exceptions.critical_total || 0),
                    exceptions_open_amount: Number(exceptions.open_amount || 0),
                    integration_runs_30d: Number(integrations.runs || 0),
                    integration_failures_30d: Number(integrations.failures || 0),
                    integration_last_run_at: integrations.last_run_at || null,
                    scheduled_reports: Number(reports.total || 0),
                    active_scheduled_reports: Number(reports.active_total || 0),
                    reports_due: Number(reports.due_total || 0),
                    documents_total: filesTotal,
                    stores_total: storesTotal
                },
                document_workflow: Object.fromEntries(
                    workflowRows[0].map(row => [row.workflow_status, Number(row.total || 0)])
                )
            });
        } catch (error) {
            console.error('Corporate overview error:', error);
            res.status(500).json({ success: false, message: 'Corporate overview could not be loaded' });
        }
    }
);

// -----------------------------------------------------------------------------
// Close center
// -----------------------------------------------------------------------------
router.get(
    '/close-center',
    checkPermission('closeCenter', 'ver'),
    async (req, res) => {
        try {
            const periodId = integer(req.query.period_id);
            const params = [];
            let where = '';

            if (periodId) {
                where = 'WHERE p.id = ?';
                params.push(periodId);
            }

            const [periods] = await pool.query(
                `SELECT p.*,
                        u.nombre_completo AS owner_name,
                        d.nombre AS department_name,
                        CASE WHEN p.total_tasks > 0
                            THEN ROUND((p.completed_tasks / p.total_tasks) * 100)
                            ELSE 0 END AS completion_rate,
                        DATEDIFF(p.due_date, CURDATE()) AS days_remaining
                 FROM corporate_close_periods p
                 LEFT JOIN usuarios u ON u.id = p.owner_id
                 LEFT JOIN departamentos d ON d.id = p.departamento_id
                 ${where}
                 ORDER BY p.period_year DESC, p.period_month DESC, p.id DESC`,
                params
            );

            let tasks = [];
            if (periodId) {
                [tasks] = await pool.query(
                    `SELECT t.*,
                            r.nombre AS restaurant_name,
                            r.codigo AS restaurant_code,
                            u.nombre_completo AS assignee_name,
                            rv.nombre_completo AS reviewer_name
                     FROM corporate_close_tasks t
                     LEFT JOIN restaurantes r ON r.id = t.restaurante_id
                     LEFT JOIN usuarios u ON u.id = t.assignee_id
                     LEFT JOIN usuarios rv ON rv.id = t.reviewer_id
                     WHERE t.close_period_id = ?
                     ORDER BY FIELD(t.status, 'blocked', 'pending', 'in_progress', 'completed', 'verified', 'closed'),
                              FIELD(t.priority, 'critical', 'high', 'normal', 'low'),
                              t.due_at, t.id`,
                    [periodId]
                );
            }

            res.json({ success: true, periods, tasks });
        } catch (error) {
            console.error('Close center error:', error);
            res.status(500).json({ success: false, message: 'Close center could not be loaded' });
        }
    }
);

router.post(
    '/close-center/periods',
    checkPermission('closeCenter', 'crear'),
    async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const year = integer(req.body.period_year);
            const month = integer(req.body.period_month);
            const departmentId = integer(req.body.departamento_id, req.departamento?.id || null);
            const dueDate = dateOrNull(req.body.due_date);
            const ownerId = integer(req.body.owner_id, req.usuario.id);
            const createStoreTasks = boolean(req.body.create_store_tasks, true);

            if (!year || year < 2020 || year > 2100 || !month || month < 1 || month > 12) {
                return res.status(400).json({ success: false, message: 'A valid close year and month are required' });
            }

            const periodName = text(req.body.name, 120) || new Intl.DateTimeFormat('en', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC'
            }).format(new Date(Date.UTC(year, month - 1, 1)));

            await connection.beginTransaction();
            const [result] = await connection.query(
                `INSERT INTO corporate_close_periods
                    (period_year, period_month, departamento_id, name, status, due_date, owner_id, created_by)
                 VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
                [year, month, departmentId, periodName, dueDate, ownerId, req.usuario.id]
            );

            const periodId = result.insertId;
            let createdTasks = 0;

            if (createStoreTasks && await tableExists('restaurantes')) {
                const [stores] = await connection.query(
                    `SELECT id, codigo, nombre
                     FROM restaurantes
                     WHERE activo = TRUE
                     ORDER BY codigo, nombre`
                );

                for (const store of stores) {
                    await connection.query(
                        `INSERT INTO corporate_close_tasks
                            (close_period_id, task_type, title, reference_type, reference_id,
                             restaurante_id, assignee_id, status, priority, due_at)
                         VALUES (?, 'reconciliation', ?, 'restaurant', ?, ?, ?, 'pending', 'normal', ?)`,
                        [
                            periodId,
                            `Reconcile ${store.codigo || store.nombre}`,
                            String(store.id),
                            store.id,
                            ownerId,
                            dueDate ? `${dueDate} 17:00:00` : null
                        ]
                    );
                    createdTasks += 1;
                }
            }

            await connection.query(
                `UPDATE corporate_close_periods
                 SET total_tasks = ?
                 WHERE id = ?`,
                [createdTasks, periodId]
            );
            await connection.commit();

            await recordOperationalAudit({
                req,
                action: 'close_period_created',
                resourceType: 'close_period',
                resourceId: periodId,
                after: { year, month, departmentId, dueDate, createdTasks }
            });

            res.status(201).json({ success: true, period_id: periodId, tasks_created: createdTasks });
        } catch (error) {
            await connection.rollback();
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ success: false, message: 'That close period already exists for the department' });
            }
            console.error('Create close period error:', error);
            res.status(500).json({ success: false, message: 'Close period could not be created' });
        } finally {
            connection.release();
        }
    }
);

router.patch(
    '/close-center/tasks/:id',
    checkPermission('closeCenter', 'editar'),
    async (req, res) => {
        try {
            const id = integer(req.params.id);
            const [existingRows] = await pool.query('SELECT * FROM corporate_close_tasks WHERE id = ? LIMIT 1', [id]);
            const existing = existingRows[0];
            if (!existing) return res.status(404).json({ success: false, message: 'Close task was not found' });

            const allowedStatuses = ['pending', 'in_progress', 'blocked', 'completed', 'verified', 'closed'];
            const status = text(req.body.status, 40) || existing.status;
            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({ success: false, message: 'Invalid close task status' });
            }

            const priority = ['low', 'normal', 'high', 'critical'].includes(text(req.body.priority, 20))
                ? text(req.body.priority, 20)
                : existing.priority;
            const assigneeId = req.body.assignee_id === undefined ? existing.assignee_id : integer(req.body.assignee_id);
            const reviewerId = req.body.reviewer_id === undefined ? existing.reviewer_id : integer(req.body.reviewer_id);
            const notes = req.body.notes === undefined ? existing.notes : text(req.body.notes, 4000);
            const materialityAmount = req.body.materiality_amount === undefined
                ? existing.materiality_amount
                : decimal(req.body.materiality_amount);

            await pool.query(
                `UPDATE corporate_close_tasks
                 SET status = ?, priority = ?, assignee_id = ?, reviewer_id = ?, notes = ?,
                     materiality_amount = ?,
                     completed_at = CASE WHEN ? IN ('completed', 'verified', 'closed') THEN COALESCE(completed_at, NOW()) ELSE NULL END,
                     verified_at = CASE WHEN ? IN ('verified', 'closed') THEN COALESCE(verified_at, NOW()) ELSE NULL END
                 WHERE id = ?`,
                [status, priority, assigneeId, reviewerId, notes, materialityAmount, status, status, id]
            );

            const totals = await refreshClosePeriodTotals(existing.close_period_id);
            await recordOperationalAudit({
                req,
                action: 'close_task_updated',
                resourceType: 'close_task',
                resourceId: id,
                before: existing,
                after: { status, priority, assigneeId, reviewerId, notes, materialityAmount }
            });

            res.json({ success: true, totals });
        } catch (error) {
            console.error('Update close task error:', error);
            res.status(500).json({ success: false, message: 'Close task could not be updated' });
        }
    }
);

router.patch(
    '/close-center/periods/:id',
    checkPermission('closeCenter', 'editar'),
    async (req, res) => {
        try {
            const id = integer(req.params.id);
            const [rows] = await pool.query('SELECT * FROM corporate_close_periods WHERE id = ? LIMIT 1', [id]);
            const existing = rows[0];
            if (!existing) return res.status(404).json({ success: false, message: 'Close period was not found' });

            const allowed = ['open', 'in_progress', 'ready_to_close', 'closed', 'archived'];
            const status = text(req.body.status, 40) || existing.status;
            if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'Invalid close period status' });

            const totals = await refreshClosePeriodTotals(id);
            if (status === 'closed' && totals.completed < totals.total) {
                return res.status(409).json({ success: false, message: 'All close tasks must be completed before the period can be closed' });
            }

            await pool.query(
                `UPDATE corporate_close_periods
                 SET status = ?,
                     locked_at = CASE WHEN ? IN ('closed', 'archived') THEN COALESCE(locked_at, NOW()) ELSE NULL END,
                     locked_by = CASE WHEN ? IN ('closed', 'archived') THEN ? ELSE NULL END
                 WHERE id = ?`,
                [status, status, status, req.usuario.id, id]
            );

            await recordOperationalAudit({
                req,
                action: 'close_period_status_changed',
                resourceType: 'close_period',
                resourceId: id,
                before: { status: existing.status },
                after: { status }
            });

            res.json({ success: true, status, totals });
        } catch (error) {
            console.error('Update close period error:', error);
            res.status(500).json({ success: false, message: 'Close period could not be updated' });
        }
    }
);

// -----------------------------------------------------------------------------
// Exception center
// -----------------------------------------------------------------------------
router.get(
    '/exceptions',
    checkPermission('exceptionCenter', 'ver'),
    async (req, res) => {
        try {
            const limit = parseLimit(req.query.limit, 100, 250);
            const offset = parseOffset(req.query.offset);
            const where = [];
            const params = [];

            if (req.query.status && req.query.status !== 'all') {
                where.push('e.status = ?');
                params.push(text(req.query.status, 40));
            }
            if (req.query.severity && req.query.severity !== 'all') {
                where.push('e.severity = ?');
                params.push(text(req.query.severity, 20));
            }
            if (req.query.search) {
                const like = `%${text(req.query.search, 120)}%`;
                where.push('(e.reference_code LIKE ? OR e.title LIKE ? OR e.description LIKE ? OR e.account_code LIKE ?)');
                params.push(like, like, like, like);
            }

            const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
            const [rows] = await pool.query(
                `SELECT e.*,
                        u.nombre_completo AS owner_name,
                        rv.nombre_completo AS reviewer_name,
                        r.nombre AS restaurant_name,
                        r.codigo AS restaurant_code,
                        d.nombre AS department_name,
                        TIMESTAMPDIFF(HOUR, NOW(), e.due_at) AS hours_remaining
                 FROM corporate_exceptions e
                 LEFT JOIN usuarios u ON u.id = e.owner_id
                 LEFT JOIN usuarios rv ON rv.id = e.reviewer_id
                 LEFT JOIN restaurantes r ON r.id = e.restaurante_id
                 LEFT JOIN departamentos d ON d.id = e.departamento_id
                 ${whereSql}
                 ORDER BY FIELD(e.status, 'open', 'assigned', 'investigating', 'resolved', 'verified', 'closed'),
                          FIELD(e.severity, 'critical', 'high', 'medium', 'low'),
                          e.due_at, e.updated_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [summaryRows] = await pool.query(
                `SELECT COUNT(*) AS total,
                        SUM(status NOT IN ('resolved', 'verified', 'closed')) AS open_total,
                        SUM(severity = 'critical' AND status NOT IN ('resolved', 'verified', 'closed')) AS critical_total,
                        SUM(due_at < NOW() AND status NOT IN ('resolved', 'verified', 'closed')) AS overdue_total,
                        COALESCE(SUM(CASE WHEN status NOT IN ('resolved', 'verified', 'closed') THEN ABS(amount) ELSE 0 END), 0) AS open_amount
                 FROM corporate_exceptions`
            );

            res.json({ success: true, exceptions: rows, summary: summaryRows[0] || {} });
        } catch (error) {
            console.error('Exception center error:', error);
            res.status(500).json({ success: false, message: 'Exceptions could not be loaded' });
        }
    }
);

router.post(
    '/exceptions',
    checkPermission('exceptionCenter', 'crear'),
    async (req, res) => {
        try {
            const title = text(req.body.title, 180);
            if (!title) return res.status(400).json({ success: false, message: 'Exception title is required' });

            const amount = decimal(req.body.amount);
            const severity = calculateSeverity(amount, req.body.severity);
            const referenceCode = createReference('EXC');
            const [result] = await pool.query(
                `INSERT INTO corporate_exceptions
                    (reference_code, source_type, source_id, departamento_id, restaurante_id,
                     account_code, title, description, status, severity, amount,
                     materiality_threshold, owner_id, reviewer_id, due_at, created_by, evidence_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    referenceCode,
                    text(req.body.source_type, 60) || 'manual',
                    text(req.body.source_id, 80) || null,
                    integer(req.body.departamento_id, req.departamento?.id || null),
                    integer(req.body.restaurante_id),
                    text(req.body.account_code, 80) || null,
                    title,
                    text(req.body.description, 5000) || null,
                    severity,
                    amount,
                    decimal(req.body.materiality_threshold),
                    integer(req.body.owner_id, req.usuario.id),
                    integer(req.body.reviewer_id),
                    dateOrNull(req.body.due_at),
                    req.usuario.id,
                    req.body.evidence ? JSON.stringify(req.body.evidence) : null
                ]
            );

            await recordOperationalAudit({
                req,
                action: 'exception_created',
                resourceType: 'exception',
                resourceId: result.insertId,
                after: { referenceCode, title, severity, amount }
            });

            res.status(201).json({ success: true, id: result.insertId, reference_code: referenceCode });
        } catch (error) {
            console.error('Create exception error:', error);
            res.status(500).json({ success: false, message: 'Exception could not be created' });
        }
    }
);

router.patch(
    '/exceptions/:id',
    checkPermission('exceptionCenter', 'editar'),
    async (req, res) => {
        try {
            const id = integer(req.params.id);
            const [rows] = await pool.query('SELECT * FROM corporate_exceptions WHERE id = ? LIMIT 1', [id]);
            const existing = rows[0];
            if (!existing) return res.status(404).json({ success: false, message: 'Exception was not found' });

            const allowedStatuses = ['open', 'assigned', 'investigating', 'resolved', 'verified', 'closed'];
            const status = text(req.body.status, 40) || existing.status;
            if (!allowedStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid exception status' });

            const amount = req.body.amount === undefined ? Number(existing.amount || 0) : decimal(req.body.amount);
            const severity = calculateSeverity(amount, req.body.severity || existing.severity);
            const resolution = req.body.resolution === undefined ? existing.resolution : text(req.body.resolution, 5000);
            const rootCause = req.body.root_cause === undefined ? existing.root_cause : text(req.body.root_cause, 5000);
            const ownerId = req.body.owner_id === undefined ? existing.owner_id : integer(req.body.owner_id);
            const reviewerId = req.body.reviewer_id === undefined ? existing.reviewer_id : integer(req.body.reviewer_id);

            if (['resolved', 'verified', 'closed'].includes(status) && !resolution) {
                return res.status(400).json({ success: false, message: 'A resolution is required before resolving an exception' });
            }

            await pool.query(
                `UPDATE corporate_exceptions
                 SET status = ?, severity = ?, amount = ?, owner_id = ?, reviewer_id = ?,
                     root_cause = ?, resolution = ?, due_at = COALESCE(?, due_at),
                     resolved_by = CASE WHEN ? IN ('resolved', 'verified', 'closed') THEN COALESCE(resolved_by, ?) ELSE NULL END,
                     resolved_at = CASE WHEN ? IN ('resolved', 'verified', 'closed') THEN COALESCE(resolved_at, NOW()) ELSE NULL END,
                     verified_by = CASE WHEN ? IN ('verified', 'closed') THEN COALESCE(verified_by, ?) ELSE NULL END,
                     verified_at = CASE WHEN ? IN ('verified', 'closed') THEN COALESCE(verified_at, NOW()) ELSE NULL END
                 WHERE id = ?`,
                [
                    status, severity, amount, ownerId, reviewerId, rootCause, resolution,
                    dateOrNull(req.body.due_at),
                    status, req.usuario.id, status, status, req.usuario.id, status, id
                ]
            );

            await recordOperationalAudit({
                req,
                action: 'exception_updated',
                resourceType: 'exception',
                resourceId: id,
                before: existing,
                after: { status, severity, amount, ownerId, reviewerId, rootCause, resolution }
            });

            res.json({ success: true });
        } catch (error) {
            console.error('Update exception error:', error);
            res.status(500).json({ success: false, message: 'Exception could not be updated' });
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
// Approval matrix / governance
// -----------------------------------------------------------------------------
router.get(
    '/governance/approval-matrix',
    checkPermission('governanceSettings', 'ver'),
    async (req, res) => {
        try {
            const [rows] = await pool.query(
                `SELECT m.*, d.nombre AS department_name, u.nombre_completo AS created_by_name
                 FROM corporate_approval_matrix m
                 LEFT JOIN departamentos d ON d.id = m.departamento_id
                 LEFT JOIN usuarios u ON u.id = m.created_by
                 ORDER BY m.active DESC, m.workflow_type, d.nombre`
            );
            res.json({ success: true, rules: rows });
        } catch (error) {
            console.error('Approval matrix error:', error);
            res.status(500).json({ success: false, message: 'Approval matrix could not be loaded' });
        }
    }
);

router.post(
    '/governance/approval-matrix',
    esAdmin,
    checkPermission('governanceSettings', 'editar'),
    async (req, res) => {
        try {
            const workflowType = text(req.body.workflow_type, 80);
            if (!workflowType) return res.status(400).json({ success: false, message: 'Workflow type is required' });

            const departmentId = integer(req.body.departamento_id);
            const entityCode = text(req.body.entity_code, 80) || null;
            const payload = {
                preparer_role: text(req.body.preparer_role, 50) || 'usuario',
                reviewer_role: text(req.body.reviewer_role, 50) || 'supervisor',
                approver_role: text(req.body.approver_role, 50) || 'admin',
                approval_levels: Math.min(Math.max(integer(req.body.approval_levels, 1), 1), 5),
                sla_hours: Math.min(Math.max(integer(req.body.sla_hours, 48), 1), 720),
                require_rejection_comment: boolean(req.body.require_rejection_comment, true),
                separation_of_duties: boolean(req.body.separation_of_duties, true),
                active: boolean(req.body.active, true)
            };

            await pool.query(
                `INSERT INTO corporate_approval_matrix
                    (workflow_type, departamento_id, entity_code, preparer_role, reviewer_role,
                     approver_role, approval_levels, sla_hours, require_rejection_comment,
                     separation_of_duties, active, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    preparer_role = VALUES(preparer_role), reviewer_role = VALUES(reviewer_role),
                    approver_role = VALUES(approver_role), approval_levels = VALUES(approval_levels),
                    sla_hours = VALUES(sla_hours), require_rejection_comment = VALUES(require_rejection_comment),
                    separation_of_duties = VALUES(separation_of_duties), active = VALUES(active)`,
                [
                    workflowType, departmentId, entityCode,
                    payload.preparer_role, payload.reviewer_role, payload.approver_role,
                    payload.approval_levels, payload.sla_hours,
                    payload.require_rejection_comment, payload.separation_of_duties,
                    payload.active, req.usuario.id
                ]
            );

            await recordOperationalAudit({
                req,
                action: 'approval_matrix_upserted',
                resourceType: 'approval_matrix',
                resourceId: `${workflowType}:${departmentId || 'global'}:${entityCode || 'all'}`,
                after: payload
            });

            res.json({ success: true });
        } catch (error) {
            console.error('Save approval matrix error:', error);
            res.status(500).json({ success: false, message: 'Approval rule could not be saved' });
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
// Integration center: Sage Intacct, Microsoft Entra ID, AI provider
// -----------------------------------------------------------------------------
router.get(
    '/integrations',
    checkPermission('integrationCenter', 'ver'),
    async (req, res) => {
        try {
            const intacct = getIntacctConfigStatus();
            const entraRequired = ['ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET', 'ENTRA_REDIRECT_URI'];
            const entraMissing = entraRequired.filter(key => !String(process.env[key] || '').trim());
            const aiProvider = text(process.env.AI_PROVIDER, 30) || 'none';
            const aiReady = Boolean(
                (aiProvider === 'openai' && process.env.OPENAI_API_KEY) ||
                (aiProvider === 'gemini' && process.env.GEMINI_API_KEY) ||
                (aiProvider === 'anthropic' && process.env.ANTHROPIC_API_KEY) ||
                (aiProvider === 'ollama' && process.env.OLLAMA_URL)
            );
            const [runs] = await pool.query(
                `SELECT r.*, u.nombre_completo AS requested_by_name
                 FROM corporate_integration_runs r
                 LEFT JOIN usuarios u ON u.id = r.requested_by
                 ORDER BY r.created_at DESC
                 LIMIT 50`
            );

            res.json({
                success: true,
                integrations: [
                    {
                        provider: 'sage-intacct',
                        name: 'Sage Intacct',
                        ready: intacct.ready,
                        missing: intacct.missing,
                        configured: intacct.configured,
                        endpoint: intacct.optional.INTACCT_ENDPOINT_URL
                    },
                    {
                        provider: 'microsoft-entra',
                        name: 'Microsoft Entra ID',
                        ready: entraMissing.length === 0,
                        missing: entraMissing,
                        configured: {
                            tenant: Boolean(process.env.ENTRA_TENANT_ID),
                            client: Boolean(process.env.ENTRA_CLIENT_ID),
                            redirect: process.env.ENTRA_REDIRECT_URI || ''
                        }
                    },
                    {
                        provider: 'ai-assistant',
                        name: 'AI assistant',
                        ready: aiReady,
                        missing: aiReady ? [] : ['provider credentials'],
                        configured: { provider: aiProvider }
                    }
                ],
                runs
            });
        } catch (error) {
            console.error('Integration center error:', error);
            res.status(500).json({ success: false, message: 'Integrations could not be loaded' });
        }
    }
);

router.post(
    '/integrations/:provider/runs',
    esAdmin,
    checkPermission('integrationCenter', 'editar'),
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
    checkPermission('integrationCenter', 'editar'),
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

// -----------------------------------------------------------------------------
// Saved views and user preferences
// -----------------------------------------------------------------------------
router.get('/saved-views/:module', async (req, res) => {
    try {
        const moduleName = text(req.params.module, 80);
        const [rows] = await pool.query(
            `SELECT id, module_name, view_name, configuration_json, is_default, created_at, updated_at
             FROM corporate_saved_views
             WHERE usuario_id = ? AND module_name = ?
             ORDER BY is_default DESC, view_name`,
            [req.usuario.id, moduleName]
        );
        res.json({
            success: true,
            views: rows.map(row => ({ ...row, configuration: parseJson(row.configuration_json, {}) }))
        });
    } catch (error) {
        console.error('Saved views error:', error);
        res.status(500).json({ success: false, message: 'Saved views could not be loaded' });
    }
});

router.post('/saved-views/:module', async (req, res) => {
    try {
        const moduleName = text(req.params.module, 80);
        const viewName = text(req.body.view_name, 120);
        if (!moduleName || !viewName || typeof req.body.configuration !== 'object') {
            return res.status(400).json({ success: false, message: 'Module, view name, and configuration are required' });
        }
        const isDefault = boolean(req.body.is_default, false);

        if (isDefault) {
            await pool.query(
                'UPDATE corporate_saved_views SET is_default = FALSE WHERE usuario_id = ? AND module_name = ?',
                [req.usuario.id, moduleName]
            );
        }

        await pool.query(
            `INSERT INTO corporate_saved_views
                (usuario_id, module_name, view_name, configuration_json, is_default)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                configuration_json = VALUES(configuration_json), is_default = VALUES(is_default)`,
            [req.usuario.id, moduleName, viewName, JSON.stringify(req.body.configuration), isDefault]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Save view error:', error);
        res.status(500).json({ success: false, message: 'Saved view could not be stored' });
    }
});

module.exports = router;
