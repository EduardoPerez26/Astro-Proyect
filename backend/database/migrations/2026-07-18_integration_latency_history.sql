CREATE TABLE IF NOT EXISTS corporate_integration_latency_history (
    id BIGINT NOT NULL AUTO_INCREMENT,
    provider VARCHAR(60) NOT NULL,
    status VARCHAR(20) NOT NULL,
    latency_ms INT NULL,
    checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_integration_latency_provider (provider, checked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
