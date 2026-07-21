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
    `CREATE TABLE IF NOT EXISTS corporate_integration_latency_history (
        id BIGINT NOT NULL AUTO_INCREMENT,
        provider VARCHAR(60) NOT NULL,
        status VARCHAR(20) NOT NULL,
        latency_ms INT NULL,
        checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_integration_latency_provider (provider, checked_at)
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

module.exports = {
    ensureCorporateSchema,
    parseJson,
    createReference,
    createFileHash,
    recordOperationalAudit
};
