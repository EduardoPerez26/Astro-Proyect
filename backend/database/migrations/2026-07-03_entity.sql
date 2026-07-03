CREATE TABLE IF NOT EXISTS property_management_entities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    brand VARCHAR(80) NULL,
    entity_legal_name VARCHAR(180) NULL,
    entity_short_name VARCHAR(120) NULL,
    entity_code VARCHAR(20) NOT NULL,
    other_id VARCHAR(80) NULL,
    location VARCHAR(40) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_pm_entity_location (location)
);