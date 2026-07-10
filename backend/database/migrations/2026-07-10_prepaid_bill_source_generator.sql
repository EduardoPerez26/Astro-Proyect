-- =========================================================
-- Prepaid PTAX schedules - clean rebuild
-- WARNING: this rebuilds only the prepaid_* tables.
-- It does not touch users, permissions, restaurants, documents, or other modules.
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
    status ENUM('SOURCE_LOADED', 'GENERATED', 'VALIDATED', 'DIFFERENCE') NOT NULL DEFAULT 'SOURCE_LOADED',
    source_file_name VARCHAR(255) NULL,
    source_file_hash VARCHAR(128) NULL,
    source_sheet_name VARCHAR(180) NULL,
    source_row_count INT NOT NULL DEFAULT 0,
    included_row_count INT NOT NULL DEFAULT 0,
    excluded_row_count INT NOT NULL DEFAULT 0,
    generated_month_count INT NOT NULL DEFAULT 0,
    metadata_json JSON NULL,
    created_by INT NULL,
    departamento_id INT NULL,
    generated_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_prepaid_schedules_year_brand (schedule_year, brand),
    INDEX idx_prepaid_schedules_status (status),
    INDEX idx_prepaid_schedules_department (departamento_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE prepaid_source_rows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id INT NOT NULL,
    source_row_number INT NOT NULL,
    posted_date DATE NULL,
    doc_date DATE NULL,
    doc_number VARCHAR(255) NULL,
    memo_description TEXT NULL,
    department VARCHAR(120) NULL,
    store_number VARCHAR(50) NOT NULL,
    txn_no VARCHAR(80) NULL,
    journal VARCHAR(50) NULL,
    debit DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    credit DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    payee VARCHAR(255) NULL,
    tax_year INT NULL,
    amount_paid DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    source_account VARCHAR(50) NOT NULL DEFAULT '246000',
    prepaid_account VARCHAR(50) NOT NULL DEFAULT '138500',
    expense_account VARCHAR(50) NOT NULL DEFAULT '708500',
    include_in_schedule TINYINT(1) NOT NULL DEFAULT 1,
    exception_reason TEXT NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_prepaid_source_row (schedule_id, source_row_number),
    INDEX idx_prepaid_source_schedule (schedule_id),
    INDEX idx_prepaid_source_store (store_number),
    CONSTRAINT fk_prepaid_source_schedule
        FOREIGN KEY (schedule_id) REFERENCES prepaid_schedules(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE prepaid_bills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id INT NOT NULL,
    source_row_id INT NOT NULL,
    store_number VARCHAR(50) NOT NULL,
    payee VARCHAR(255) NULL,
    doc_number VARCHAR(255) NULL,
    bill_date DATE NULL,
    tax_year INT NULL,
    amount_paid DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    source_account VARCHAR(50) NOT NULL DEFAULT '246000',
    prepaid_account VARCHAR(50) NOT NULL DEFAULT '138500',
    expense_account VARCHAR(50) NOT NULL DEFAULT '708500',
    amortization_start DATE NOT NULL,
    amortization_end DATE NOT NULL,
    total_months INT NOT NULL DEFAULT 0,
    monthly_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_prepaid_bill_source (source_row_id),
    INDEX idx_prepaid_bills_schedule (schedule_id),
    INDEX idx_prepaid_bills_store (store_number),
    CONSTRAINT fk_prepaid_bills_schedule
        FOREIGN KEY (schedule_id) REFERENCES prepaid_schedules(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_prepaid_bills_source
        FOREIGN KEY (source_row_id) REFERENCES prepaid_source_rows(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE prepaid_amortization_months (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id INT NOT NULL,
    bill_id INT NOT NULL,
    source_row_id INT NOT NULL,
    store_number VARCHAR(50) NOT NULL,
    period_year INT NOT NULL,
    period_month TINYINT NOT NULL,
    period_code VARCHAR(20) NOT NULL,
    expected_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    gl_actual_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    difference DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    status ENUM('PENDING_GL', 'MATCHED', 'DIFFERENCE', 'MISSING_GL') NOT NULL DEFAULT 'PENDING_GL',
    gl_upload_id INT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_prepaid_month (bill_id, period_year, period_month),
    INDEX idx_prepaid_month_schedule (schedule_id, period_year, period_month),
    INDEX idx_prepaid_month_status (status),
    INDEX idx_prepaid_month_store (store_number),
    CONSTRAINT fk_prepaid_month_schedule
        FOREIGN KEY (schedule_id) REFERENCES prepaid_schedules(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_prepaid_month_bill
        FOREIGN KEY (bill_id) REFERENCES prepaid_bills(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_prepaid_month_source
        FOREIGN KEY (source_row_id) REFERENCES prepaid_source_rows(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE prepaid_gl_uploads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id INT NOT NULL,
    period_year INT NOT NULL,
    period_month TINYINT NOT NULL,
    file_name VARCHAR(255) NULL,
    file_hash VARCHAR(128) NULL,
    sheet_name VARCHAR(180) NULL,
    parsed_row_count INT NOT NULL DEFAULT 0,
    matched_count INT NOT NULL DEFAULT 0,
    difference_count INT NOT NULL DEFAULT 0,
    missing_count INT NOT NULL DEFAULT 0,
    uploaded_by INT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata_json JSON NULL,
    UNIQUE KEY uq_prepaid_gl_upload_period (schedule_id, period_year, period_month),
    INDEX idx_prepaid_gl_schedule (schedule_id),
    CONSTRAINT fk_prepaid_gl_upload_schedule
        FOREIGN KEY (schedule_id) REFERENCES prepaid_schedules(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE prepaid_gl_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    gl_upload_id INT NOT NULL,
    source_row_number INT NULL,
    posted_date DATE NULL,
    doc_date DATE NULL,
    doc_number VARCHAR(255) NULL,
    memo_description TEXT NULL,
    store_number VARCHAR(50) NOT NULL,
    debit DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    credit DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    signed_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    actual_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_prepaid_gl_details_upload (gl_upload_id),
    INDEX idx_prepaid_gl_details_store (store_number),
    CONSTRAINT fk_prepaid_gl_details_upload
        FOREIGN KEY (gl_upload_id) REFERENCES prepaid_gl_uploads(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
