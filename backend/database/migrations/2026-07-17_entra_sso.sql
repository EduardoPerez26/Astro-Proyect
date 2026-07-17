CREATE TABLE IF NOT EXISTS auth_exchange_tickets (
    id BIGINT NOT NULL AUTO_INCREMENT,
    token_hash CHAR(64) NOT NULL,
    usuario_id INT NOT NULL,
    remember_session BOOLEAN NOT NULL DEFAULT FALSE,
    identity_provider VARCHAR(40) NOT NULL DEFAULT 'microsoft-entra',
    identity_subject VARCHAR(255) NULL,
    identity_email VARCHAR(255) NULL,
    ip_address VARCHAR(64) NULL,
    user_agent VARCHAR(255) NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_auth_exchange_ticket_hash (token_hash),
    INDEX idx_auth_exchange_ticket_expiry (expires_at, used_at),
    INDEX idx_auth_exchange_ticket_user (usuario_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
