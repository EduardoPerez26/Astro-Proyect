CREATE TABLE IF NOT EXISTS property_management_requests (
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
    INDEX idx_pm_requests_departamento (departamento_id),
    INDEX idx_pm_requests_usuario (usuario_id),
    INDEX idx_pm_requests_stage (stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
