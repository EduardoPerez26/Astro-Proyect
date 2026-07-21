// Tools Franchie (the chatbot) can call to act on the app instead of only describing it.
// Every tool forwards the caller's own Bearer token to the real REST endpoint, so the
// existing permission checks (checkPermission/esAdmin) and operational audit trail apply
// exactly as if the user had clicked the equivalent button.
const { pool } = require('../config/database');

const TOOL_DEFINITIONS = [
    {
        type: 'function',
        name: 'list_scheduled_reports',
        description: 'List the corporate scheduled reports registered in the Report Center: frequency, delivery hour, recipients, format, and last run status.',
        parameters: { type: 'object', properties: {}, required: [] }
    },
    {
        type: 'function',
        name: 'create_scheduled_report',
        description: 'Create a new scheduled report in the Report Center. Requires the reportCenter create permission on the user\'s account.',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Report name shown in Report Center.' },
                report_type: { type: 'string', description: 'Report template/type identifier as used in Report Center (ask the user which one if unsure).' },
                frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
                delivery_hour: { type: 'integer', description: 'Hour of day (0-23) the report should run. Defaults to 8 if omitted.' },
                format: { type: 'string', enum: ['csv', 'xlsx', 'pdf'], description: 'Defaults to csv if omitted.' },
                recipients: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Email addresses that should receive the report.'
                },
                active: { type: 'boolean', description: 'Whether the schedule is active immediately. Defaults to true.' }
            },
            required: ['name', 'report_type', 'frequency', 'recipients']
        }
    },
    {
        type: 'function',
        name: 'run_scheduled_report_now',
        description: 'Run an existing scheduled report immediately instead of waiting for its next scheduled time. Requires an admin account with reportCenter edit permission.',
        parameters: {
            type: 'object',
            properties: {
                report_id: { type: 'integer', description: 'ID of the scheduled report to run now (from list_scheduled_reports).' }
            },
            required: ['report_id']
        }
    },
    {
        type: 'function',
        name: 'count_pending_documents',
        description: 'Count how many uploaded documents are pending review for the current user\'s department (or across all departments for admins).',
        parameters: { type: 'object', properties: {}, required: [] }
    },
    {
        type: 'function',
        name: 'list_departments',
        description: 'List active departments with their IDs, to resolve the department_id needed by create_user.',
        parameters: { type: 'object', properties: {}, required: [] }
    },
    {
        type: 'function',
        name: 'create_user',
        description: 'Create a new user account. Requires the create_users permission on the caller\'s account. Ask the user for any missing required field before calling — do not invent a password, email, or username.',
        parameters: {
            type: 'object',
            properties: {
                nombre: { type: 'string', description: 'Full name of the new user.' },
                email: { type: 'string', description: 'Email address. Must be unique.' },
                username: { type: 'string', description: 'Login username. Must be unique.' },
                password: { type: 'string', description: 'Initial password for the account.' },
                rol: { type: 'string', enum: ['usuario', 'supervisor', 'admin', 'superadmin'], description: 'Defaults to "usuario" if omitted. The caller can only grant roles at or below their own.' },
                departamento_id: { type: 'integer', description: 'Department ID from list_departments. Optional.' }
            },
            required: ['nombre', 'email', 'username', 'password']
        }
    }
];

const PORT = process.env.PORT || 3001;
const API_BASE_URL = `http://127.0.0.1:${PORT}/api`;

function authHeaders(req) {
    return {
        'Content-Type': 'application/json',
        Authorization: req.headers.authorization || '',
        'x-request-id': req.requestId || ''
    };
}

async function callInternalApi(req, method, path, body) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: authHeaders(req),
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
}

async function executeTool(name, args, req) {
    switch (name) {
        case 'list_scheduled_reports': {
            const { ok, status, data } = await callInternalApi(req, 'GET', '/corporate/reports');
            if (!ok) return { error: data.message || `Request failed with status ${status}` };

            return {
                reports: (data.reports || []).map(report => ({
                    id: report.id,
                    name: report.name,
                    report_type: report.report_type,
                    frequency: report.frequency,
                    delivery_hour: report.delivery_hour,
                    format: report.format,
                    active: Boolean(report.active),
                    recipients: report.recipients,
                    next_run_at: report.next_run_at,
                    last_run_at: report.last_run_at,
                    last_status: report.last_status
                }))
            };
        }

        case 'create_scheduled_report': {
            const { ok, status, data } = await callInternalApi(req, 'POST', '/corporate/reports', {
                name: args?.name,
                report_type: args?.report_type,
                frequency: args?.frequency,
                delivery_hour: args?.delivery_hour,
                format: args?.format,
                recipients: args?.recipients,
                active: args?.active
            });
            if (!ok) return { error: data.message || `Request failed with status ${status}` };
            return { success: true, id: data.id };
        }

        case 'run_scheduled_report_now': {
            const reportId = Number(args?.report_id);
            if (!Number.isInteger(reportId)) return { error: 'report_id must be an integer' };

            const { ok, status, data } = await callInternalApi(req, 'POST', `/corporate/reports/${reportId}/run`);
            if (!ok) return { error: data.message || `Request failed with status ${status}` };
            return data;
        }

        case 'count_pending_documents': {
            const filtrarPorDepartment = req.usuario?.rol !== 'superadmin'
                && req.usuario?.rol !== 'admin'
                && Boolean(req.departamento?.id);
            const where = filtrarPorDepartment
                ? "WHERE estado = 'pendiente' AND (departamento_id = ? OR departamento_id IS NULL)"
                : "WHERE estado = 'pendiente'";
            const params = filtrarPorDepartment ? [req.departamento.id] : [];

            const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM archivos_excel ${where}`, params);
            return { pending_documents: Number(rows?.[0]?.total || 0) };
        }

        case 'list_departments': {
            const [rows] = await pool.query(
                'SELECT id, nombre FROM departamentos WHERE activo = TRUE ORDER BY nombre'
            );
            return { departments: rows };
        }

        case 'create_user': {
            const { ok, status, data } = await callInternalApi(req, 'POST', '/usuarios', {
                nombre: args?.nombre,
                email: args?.email,
                username: args?.username,
                password: args?.password,
                rol: args?.rol,
                departamento_id: args?.departamento_id
            });
            if (!ok) return { error: data.message || `Request failed with status ${status}` };
            return { success: true, usuario: data.usuario };
        }

        default:
            return { error: `Unknown tool: ${name}` };
    }
}

module.exports = { TOOL_DEFINITIONS, executeTool };
