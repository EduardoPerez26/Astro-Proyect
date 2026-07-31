SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS ap_documentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NULL,
    departamento_id INT NULL,
    tipo_documento VARCHAR(60) NOT NULL,
    nombre_original VARCHAR(255) NOT NULL,
    nombre_servidor VARCHAR(255) NULL,
    tamano_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
    tipo_mime VARCHAR(160) NULL,
    archivo_blob LONGBLOB NULL,
    hash_archivo VARCHAR(64) NULL,
    periodo_anio INT NOT NULL DEFAULT 2026,
    periodo_mes TINYINT NULL,
    estado VARCHAR(40) NOT NULL DEFAULT 'loaded',
    metadata_json JSON NULL,
    fecha_carga TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ap_docs_periodo (periodo_anio, periodo_mes),
    INDEX idx_ap_docs_tipo (tipo_documento),
    INDEX idx_ap_docs_departamento (departamento_id),
    INDEX idx_ap_docs_usuario (usuario_id),
    INDEX idx_ap_docs_hash (hash_archivo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ap_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NULL,
    departamento_id INT NULL,
    nombre VARCHAR(180) NOT NULL DEFAULT 'Schedule 2026',
    periodo_anio INT NOT NULL DEFAULT 2026,
    periodo_mes TINYINT NULL,
    datos_json JSON NOT NULL,
    total_tiendas INT NOT NULL DEFAULT 0,
    total_filas INT NOT NULL DEFAULT 0,
    balance_total DECIMAL(16, 2) NOT NULL DEFAULT 0.00,
    estado VARCHAR(40) NOT NULL DEFAULT 'draft',
    submitted_by INT NULL,
    submitted_at TIMESTAMP NULL,
    reviewed_by INT NULL,
    reviewed_at TIMESTAMP NULL,
    review_notes VARCHAR(1000) NULL,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ap_schedules_periodo (periodo_anio, periodo_mes),
    INDEX idx_ap_schedules_departamento (departamento_id),
    INDEX idx_ap_schedules_usuario (usuario_id),
    INDEX idx_ap_schedules_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ap_schedule_documentos (
    schedule_id INT NOT NULL,
    documento_id INT NOT NULL,
    fecha_vinculo TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (schedule_id, documento_id),
    INDEX idx_ap_schedule_docs_documento (documento_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ap_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NULL,
    departamento_id INT NULL,
    title VARCHAR(200) NOT NULL,
    property VARCHAR(200) NOT NULL,
    category VARCHAR(60) NOT NULL DEFAULT 'Other',
    priority VARCHAR(40) NOT NULL DEFAULT 'Normal',
    due_date DATE NULL,
    notes TEXT NULL,
    stage VARCHAR(40) NOT NULL DEFAULT 'intake',
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ap_requests_departamento (departamento_id),
    INDEX idx_ap_requests_usuario (usuario_id),
    INDEX idx_ap_requests_stage (stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ap_entities (
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
    UNIQUE KEY uq_ap_entity_location (location)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ap_prepaid_schedules (
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
    INDEX idx_ap_prepaid_schedules_year_brand (schedule_year, brand),
    INDEX idx_ap_prepaid_schedules_status (status),
    INDEX idx_ap_prepaid_schedules_department (departamento_id),
    INDEX idx_ap_prepaid_schedules_user (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
