SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS property_management_documentos (
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
    INDEX idx_pm_docs_periodo (periodo_anio, periodo_mes),
    INDEX idx_pm_docs_tipo (tipo_documento),
    INDEX idx_pm_docs_departamento (departamento_id),
    INDEX idx_pm_docs_usuario (usuario_id),
    INDEX idx_pm_docs_hash (hash_archivo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS property_management_schedules (
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
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pm_schedules_periodo (periodo_anio, periodo_mes),
    INDEX idx_pm_schedules_departamento (departamento_id),
    INDEX idx_pm_schedules_usuario (usuario_id),
    INDEX idx_pm_schedules_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS property_management_schedule_documentos (
    schedule_id INT NOT NULL,
    documento_id INT NOT NULL,
    fecha_vinculo TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (schedule_id, documento_id),
    INDEX idx_pm_schedule_docs_documento (documento_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
