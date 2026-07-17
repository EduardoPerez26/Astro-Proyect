const crypto = require('crypto');
const { pool } = require('../config/database');

let schemaPromise = null;

const SCHEMA_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS corporate_document_versions (
        id BIGINT NOT NULL AUTO_INCREMENT,
        archivo_id INT NOT NULL,
        version_number INT NOT NULL DEFAULT 1,
        workflow_status VARCHAR(40) NOT NULL DEFAULT 'draft',
        file_hash CHAR(64) NULL,
        source_filename VARCHAR(255) NULL,
        owner_id INT NULL,
        reviewer_id INT NULL,
        approver_id INT NULL,
        departamento_id INT NULL,
        period_year SMALLINT NULL,
        period_month TINYINT NULL,
        comments TEXT NULL,
        metadata_json JSON NULL,
        approved_at DATETIME NULL,
        locked_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_corporate_document_version (archivo_id, version_number),
        INDEX idx_corporate_document_status (workflow_status, updated_at),
        INDEX idx_corporate_document_period (period_year, period_month),
        INDEX idx_corporate_document_department (departamento_id, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS corporate_document_events (
        id BIGINT NOT NULL AUTO_INCREMENT,
        archivo_id INT NOT NULL,
        version_id BIGINT NULL,
        event_type VARCHAR(60) NOT NULL,
        previous_status VARCHAR(40) NULL,
        new_status VARCHAR(40) NULL,
        actor_id INT NULL,
        notes TEXT NULL,
        metadata_json JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_corporate_document_events_file (archivo_id, created_at),
        INDEX idx_corporate_document_events_actor (actor_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS corporate_approval_matrix (
        id BIGINT NOT NULL AUTO_INCREMENT,
        workflow_type VARCHAR(80) NOT NULL,
        departamento_id INT NULL,
        entity_code VARCHAR(80) NULL,
        preparer_role VARCHAR(50) NOT NULL DEFAULT 'usuario',
        reviewer_role VARCHAR(50) NOT NULL DEFAULT 'supervisor',
        approver_role VARCHAR(50) NOT NULL DEFAULT 'admin',
        approval_levels TINYINT NOT NULL DEFAULT 1,
        sla_hours INT NOT NULL DEFAULT 48,
        require_rejection_comment BOOLEAN NOT NULL DEFAULT TRUE,
        separation_of_duties BOOLEAN NOT NULL DEFAULT TRUE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_corporate_approval_scope (workflow_type, departamento_id, entity_code),
        INDEX idx_corporate_approval_active (active, workflow_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS corporate_close_periods (
        id BIGINT NOT NULL AUTO_INCREMENT,
        period_year SMALLINT NOT NULL,
        period_month TINYINT NOT NULL,
        departamento_id INT NULL,
        name VARCHAR(120) NOT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'open',
        due_date DATE NULL,
        owner_id INT NULL,
        total_tasks INT NOT NULL DEFAULT 0,
        completed_tasks INT NOT NULL DEFAULT 0,
        locked_at DATETIME NULL,
        locked_by INT NULL,
        created_by INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_corporate_close_period (period_year, period_month, departamento_id),
        INDEX idx_corporate_close_status (status, due_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS corporate_close_tasks (
        id BIGINT NOT NULL AUTO_INCREMENT,
        close_period_id BIGINT NOT NULL,
        task_type VARCHAR(60) NOT NULL DEFAULT 'reconciliation',
        title VARCHAR(180) NOT NULL,
        reference_type VARCHAR(60) NULL,
        reference_id VARCHAR(80) NULL,
        restaurante_id INT NULL,
        assignee_id INT NULL,
        reviewer_id INT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'pending',
        priority VARCHAR(20) NOT NULL DEFAULT 'normal',
        materiality_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
        due_at DATETIME NULL,
        completed_at DATETIME NULL,
        verified_at DATETIME NULL,
        notes TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_corporate_close_tasks_period (close_period_id, status),
        INDEX idx_corporate_close_tasks_assignee (assignee_id, status),
        INDEX idx_corporate_close_tasks_due (status, due_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS corporate_exceptions (
        id BIGINT NOT NULL AUTO_INCREMENT,
        reference_code VARCHAR(40) NOT NULL,
        source_type VARCHAR(60) NOT NULL DEFAULT 'manual',
        source_id VARCHAR(80) NULL,
        departamento_id INT NULL,
        restaurante_id INT NULL,
        account_code VARCHAR(80) NULL,
        title VARCHAR(180) NOT NULL,
        description TEXT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'open',
        severity VARCHAR(20) NOT NULL DEFAULT 'medium',
        amount DECIMAL(18,2) NOT NULL DEFAULT 0,
        materiality_threshold DECIMAL(18,2) NOT NULL DEFAULT 0,
        owner_id INT NULL,
        reviewer_id INT NULL,
        due_at DATETIME NULL,
        root_cause TEXT NULL,
        resolution TEXT NULL,
        evidence_json JSON NULL,
        created_by INT NULL,
        resolved_by INT NULL,
        resolved_at DATETIME NULL,
        verified_by INT NULL,
        verified_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_corporate_exception_reference (reference_code),
        INDEX idx_corporate_exception_status (status, severity, due_at),
        INDEX idx_corporate_exception_owner (owner_id, status),
        INDEX idx_corporate_exception_department (departamento_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS corporate_integration_runs (
        id BIGINT NOT NULL AUTO_INCREMENT,
        provider VARCHAR(60) NOT NULL,
        operation VARCHAR(80) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'queued',
        requested_by INT NULL,
        records_processed INT NOT NULL DEFAULT 0,
        warnings_count INT NOT NULL DEFAULT 0,
        errors_count INT NOT NULL DEFAULT 0,
        started_at DATETIME NULL,
        completed_at DATETIME NULL,
        summary TEXT NULL,
        metadata_json JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_corporate_integration_provider (provider, created_at),
        INDEX idx_corporate_integration_status (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS corporate_scheduled_reports (
        id BIGINT NOT NULL AUTO_INCREMENT,
        name VARCHAR(140) NOT NULL,
        report_type VARCHAR(80) NOT NULL,
        frequency VARCHAR(30) NOT NULL DEFAULT 'weekly',
        delivery_hour TINYINT NOT NULL DEFAULT 8,
        timezone VARCHAR(60) NOT NULL DEFAULT 'America/Phoenix',
        recipients_json JSON NOT NULL,
        filters_json JSON NULL,
        format VARCHAR(20) NOT NULL DEFAULT 'csv',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        next_run_at DATETIME NULL,
        last_run_at DATETIME NULL,
        last_status VARCHAR(30) NULL,
        created_by INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_corporate_reports_due (active, next_run_at),
        INDEX idx_corporate_reports_type (report_type, active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS corporate_saved_views (
        id BIGINT NOT NULL AUTO_INCREMENT,
        usuario_id INT NOT NULL,
        module_name VARCHAR(80) NOT NULL,
        view_name VARCHAR(120) NOT NULL,
        configuration_json JSON NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_corporate_saved_view (usuario_id, module_name, view_name),
        INDEX idx_corporate_saved_view_default (usuario_id, module_name, is_default)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS auditoria_operativa (
        id BIGINT NOT NULL AUTO_INCREMENT,
        usuario_id INT NULL,
        departamento_id INT NULL,
        action_name VARCHAR(80) NOT NULL,
        resource_type VARCHAR(80) NOT NULL,
        resource_id VARCHAR(100) NULL,
        request_id VARCHAR(80) NULL,
        ip_address VARCHAR(45) NULL,
        user_agent VARCHAR(255) NULL,
        before_json JSON NULL,
        after_json JSON NULL,
        metadata_json JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_operational_audit_resource (resource_type, resource_id, created_at),
        INDEX idx_operational_audit_user (usuario_id, created_at),
        INDEX idx_operational_audit_action (action_name, created_at),
        INDEX idx_operational_audit_request (request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

async function ensureCorporateSchema() {
    if (!schemaPromise) {
        schemaPromise = (async () => {
            for (const statement of SCHEMA_STATEMENTS) {
                await pool.query(statement);
            }

            await pool.query(
                `INSERT INTO corporate_approval_matrix
                    (workflow_type, preparer_role, reviewer_role, approver_role, approval_levels, sla_hours, require_rejection_comment, separation_of_duties, active)
                 VALUES
                    ('reconciliation', 'usuario', 'supervisor', 'admin', 2, 24, TRUE, TRUE, TRUE),
                    ('prepaid_schedule', 'usuario', 'supervisor', 'admin', 2, 48, TRUE, TRUE, TRUE),
                    ('tax_adjustment', 'usuario', 'supervisor', 'admin', 2, 24, TRUE, TRUE, TRUE),
                    ('user_permissions', 'admin', 'admin', 'superadmin', 1, 8, TRUE, TRUE, TRUE)
                 ON DUPLICATE KEY UPDATE
                    reviewer_role = VALUES(reviewer_role),
                    approver_role = VALUES(approver_role),
                    sla_hours = VALUES(sla_hours),
                    active = VALUES(active)`
            );
        })().catch(error => {
            schemaPromise = null;
            throw error;
        });
    }

    return schemaPromise;
}

function parseJson(value, fallback = null) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'object') return value;

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function getClientIp(req) {
    return String(req.headers['x-forwarded-for'] || '')
        .split(',')[0]
        .trim() || req.ip || req.socket?.remoteAddress || '';
}

function createReference(prefix = 'EXC') {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${date}-${random}`;
}

function createFileHash(value) {
    const payload = Buffer.isBuffer(value)
        ? value
        : String(value || '');

    return crypto.createHash('sha256').update(payload).digest('hex');
}

async function recordOperationalAudit({
    req,
    action,
    resourceType,
    resourceId = null,
    before = null,
    after = null,
    metadata = null
}) {
    try {
        await ensureCorporateSchema();
        await pool.query(
            `INSERT INTO auditoria_operativa
                (usuario_id, departamento_id, action_name, resource_type, resource_id,
                 request_id, ip_address, user_agent, before_json, after_json, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.usuario?.id || null,
                req.departamento?.id || req.usuario?.departamento_id || null,
                String(action || 'update').slice(0, 80),
                String(resourceType || 'resource').slice(0, 80),
                resourceId === null ? null : String(resourceId).slice(0, 100),
                String(req.requestId || '').slice(0, 80) || null,
                getClientIp(req),
                String(req.headers['user-agent'] || '').slice(0, 255),
                before === null ? null : JSON.stringify(before),
                after === null ? null : JSON.stringify(after),
                metadata === null ? null : JSON.stringify(metadata)
            ]
        );
    } catch (error) {
        console.warn('Operational audit could not be recorded:', error.code || error.message);
    }
}

function calculateSeverity(amount, explicitSeverity = '') {
    const requested = String(explicitSeverity || '').toLowerCase();
    if (['low', 'medium', 'high', 'critical'].includes(requested)) return requested;

    const absolute = Math.abs(Number(amount || 0));
    if (absolute >= 10000) return 'critical';
    if (absolute >= 1000) return 'high';
    if (absolute >= 100) return 'medium';
    return 'low';
}

module.exports = {
    ensureCorporateSchema,
    parseJson,
    createReference,
    createFileHash,
    recordOperationalAudit,
    calculateSeverity
};
