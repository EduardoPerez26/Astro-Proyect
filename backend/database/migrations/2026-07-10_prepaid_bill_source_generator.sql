-- =========================================================
-- Prepaid PTAX schedules - document-style storage
-- Mirrors normal Property Management schedules:
-- one saved schedule/document row with JSON payload, no detail/upload/source tables.
-- =========================================================

SET NAMES utf8mb4;

DROP TABLE IF EXISTS prepaid_gl_details;
DROP TABLE IF EXISTS prepaid_gl_uploads;
DROP TABLE IF EXISTS prepaid_amortization_months;
DROP TABLE IF EXISTS prepaid_bills;
DROP TABLE IF EXISTS prepaid_source_rows;
DROP TABLE IF EXISTS prepaid_schedules;

CREATE TABLE prepaid_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    brand VARCHAR(80) NOT NULL DEFAULT 'PLK',
    schedule_year INT NOT NULL,
    tax_year INT NULL,
    title VARCHAR(255) NOT NULL,
    source_account VARCHAR(50) NOT NULL DEFAULT '246000',
    prepaid_account VARCHAR(50) NOT NULL DEFAULT '138500',
    expense_account VARCHAR(50) NOT NULL DEFAULT '708500',
    amortization_start DATE NOT NULL,
    amortization_end DATE NOT NULL,
    status ENUM('SOURCE_LOADED', 'GENERATED', 'VALIDATED', 'DIFFERENCE') NOT NULL DEFAULT 'GENERATED',
    source_file_name VARCHAR(255) NULL,
    source_file_hash VARCHAR(128) NULL,
    source_sheet_name VARCHAR(180) NULL,
    source_row_count INT NOT NULL DEFAULT 0,
    included_row_count INT NOT NULL DEFAULT 0,
    excluded_row_count INT NOT NULL DEFAULT 0,
    generated_month_count INT NOT NULL DEFAULT 0,
    datos_json JSON NOT NULL,
    metadata_json JSON NULL,
    created_by INT NULL,
    departamento_id INT NULL,
    generated_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_prepaid_schedules_year_brand (schedule_year, brand),
    INDEX idx_prepaid_schedules_status (status),
    INDEX idx_prepaid_schedules_department (departamento_id),
    INDEX idx_prepaid_schedules_user (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
