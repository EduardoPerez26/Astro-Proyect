-- Error notifications for administrators.
-- Logs backend errors and allows the existing notification center to alert admins.

CREATE TABLE IF NOT EXISTS system_error_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    error_hash CHAR(64) NOT NULL,
    status_code INT NOT NULL DEFAULT 500,
    method VARCHAR(12) NOT NULL,
    request_path VARCHAR(500) NULL,
    normalized_path VARCHAR(500) NULL,
    user_id INT NULL,
    user_label VARCHAR(160) NULL,
    ip_address VARCHAR(80) NULL,
    user_agent VARCHAR(500) NULL,
    error_name VARCHAR(160) NULL,
    error_code VARCHAR(120) NULL,
    error_message TEXT NULL,
    stack_trace TEXT NULL,
    query_params JSON NULL,
    body_snapshot JSON NULL,
    response_snapshot JSON NULL,
    metadata JSON NULL,
    occurrences INT UNSIGNED NOT NULL DEFAULT 1,
    first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL DEFAULT NULL,
    resolved_by INT NULL,
    resolution_notes VARCHAR(500) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_system_error_logs_hash (error_hash),
    KEY idx_system_error_logs_status_last_seen (status_code, last_seen_at),
    KEY idx_system_error_logs_resolved (resolved_at, last_seen_at),
    KEY idx_system_error_logs_user (user_id),
    KEY idx_system_error_logs_resolved_by (resolved_by),
    CONSTRAINT fk_system_error_logs_user
        FOREIGN KEY (user_id) REFERENCES usuarios(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT fk_system_error_logs_resolved_by
        FOREIGN KEY (resolved_by) REFERENCES usuarios(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
