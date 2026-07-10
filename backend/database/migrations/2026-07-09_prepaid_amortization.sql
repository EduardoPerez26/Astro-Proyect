SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS prepaid_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NULL,
    departamento_id INT NULL,
    brand VARCHAR(80) NOT NULL DEFAULT 'PLK',
    title VARCHAR(220) NOT NULL,
    schedule_year INT NOT NULL DEFAULT 2026,
    review_month TINYINT NOT NULL DEFAULT 12,
    gl_account VARCHAR(40) NOT NULL DEFAULT '138500',
    expense_gl_account VARCHAR(40) NOT NULL DEFAULT '708500',
    source_file_name VARCHAR(255) NULL,
    source_sheet_name VARCHAR(180) NULL,
    source_header_row INT NULL,
    rejected_rows_json JSON NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'generated',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_prepaid_schedules_year_brand (schedule_year, brand),
    INDEX idx_prepaid_schedules_department (departamento_id),
    INDEX idx_prepaid_schedules_user (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prepaid_bills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id INT NOT NULL,
    source_row_number INT NULL,
    payee VARCHAR(255) NULL,
    store_number VARCHAR(60) NOT NULL,
    entity VARCHAR(80) NULL,
    doc VARCHAR(120) NULL,
    gl_account VARCHAR(40) NULL,
    expense_gl_account VARCHAR(40) NULL,
    bill_date DATE NULL,
    amortization_start DATE NOT NULL,
    amortization_end DATE NOT NULL,
    amortization_period_label VARCHAR(80) NULL,
    amount_paid DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    prior_year_amortized DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    prior_year_balance_forward DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    monthly_amortization DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    total_months INT NOT NULL DEFAULT 0,
    prior_year_months INT NOT NULL DEFAULT 0,
    schedule_year_months INT NOT NULL DEFAULT 0,
    support_reference VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_prepaid_bills_schedule (schedule_id),
    INDEX idx_prepaid_bills_store (store_number),
    CONSTRAINT fk_prepaid_bills_schedule
        FOREIGN KEY (schedule_id) REFERENCES prepaid_schedules(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prepaid_gl_uploads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id INT NOT NULL,
    schedule_year INT NOT NULL,
    period_month TINYINT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    sheet_name VARCHAR(180) NULL,
    header_row INT NULL,
    uploaded_by INT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_prepaid_gl_upload (schedule_id, schedule_year, period_month),
    INDEX idx_prepaid_gl_schedule (schedule_id),
    CONSTRAINT fk_prepaid_gl_upload_schedule
        FOREIGN KEY (schedule_id) REFERENCES prepaid_schedules(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prepaid_amortization_months (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id INT NOT NULL,
    bill_id INT NOT NULL,
    schedule_year INT NOT NULL,
    period_month TINYINT NOT NULL,
    period_code VARCHAR(20) NOT NULL,
    expected_amount DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    gl_actual_amount DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    difference DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    status ENUM('PENDING_GL', 'MATCHED', 'DIFFERENCE', 'MISSING_GL') NOT NULL DEFAULT 'PENDING_GL',
    gl_upload_id INT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_prepaid_month (bill_id, schedule_year, period_month),
    INDEX idx_prepaid_month_schedule (schedule_id, schedule_year, period_month),
    INDEX idx_prepaid_month_status (status),
    CONSTRAINT fk_prepaid_month_schedule
        FOREIGN KEY (schedule_id) REFERENCES prepaid_schedules(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_prepaid_month_bill
        FOREIGN KEY (bill_id) REFERENCES prepaid_bills(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_prepaid_month_upload
        FOREIGN KEY (gl_upload_id) REFERENCES prepaid_gl_uploads(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
