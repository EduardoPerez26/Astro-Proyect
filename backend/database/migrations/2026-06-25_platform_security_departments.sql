-- ============================================================
-- PLATAFORMA GLOBAL + SEGURIDAD
-- Ejecutar sobre la misma base usada por el backend.
-- Es idempotente y compatible con MySQL 8.
-- ============================================================

CREATE TABLE IF NOT EXISTS departamentos (
    id INT NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(60) NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    descripcion VARCHAR(255) NULL,
    modulos JSON NOT NULL,
    pagina_inicio VARCHAR(60) NOT NULL DEFAULT 'tiendas',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_departamentos_codigo (codigo),
    UNIQUE KEY uq_departamentos_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seguridad_login_intentos (
    id BIGINT NOT NULL AUTO_INCREMENT,
    username VARCHAR(120) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    exitoso BOOLEAN NOT NULL DEFAULT FALSE,
    detalle VARCHAR(255) NULL,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_login_intentos_lookup (username, ip_address, fecha_creacion),
    INDEX idx_login_intentos_fecha (fecha_creacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auditoria_seguridad (
    id BIGINT NOT NULL AUTO_INCREMENT,
    usuario_id INT NULL,
    departamento_id INT NULL,
    evento VARCHAR(80) NOT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    detalle JSON NULL,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_auditoria_usuario_fecha (usuario_id, fecha_creacion),
    INDEX idx_auditoria_departamento_fecha (departamento_id, fecha_creacion),
    INDEX idx_auditoria_evento_fecha (evento, fecha_creacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS instalar_plataforma_segura;
DELIMITER $$

CREATE PROCEDURE instalar_plataforma_segura()
BEGIN
    DECLARE ar_id INT DEFAULT NULL;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'usuarios'
          AND COLUMN_NAME = 'departamento_id'
    ) THEN
        ALTER TABLE usuarios
            ADD COLUMN departamento_id INT NULL AFTER rol;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'usuarios'
          AND INDEX_NAME = 'idx_usuarios_departamento'
    ) THEN
        ALTER TABLE usuarios
            ADD INDEX idx_usuarios_departamento (departamento_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'usuarios'
          AND CONSTRAINT_NAME = 'fk_usuarios_departamento'
    ) THEN
        ALTER TABLE usuarios
            ADD CONSTRAINT fk_usuarios_departamento
            FOREIGN KEY (departamento_id)
            REFERENCES departamentos(id)
            ON UPDATE CASCADE
            ON DELETE SET NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sesiones'
          AND COLUMN_NAME = 'token'
          AND CHARACTER_MAXIMUM_LENGTH < 2048
    ) THEN
        ALTER TABLE sesiones
            MODIFY COLUMN token VARCHAR(2048) NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sesiones'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sesiones'
          AND COLUMN_NAME = 'token_hash'
    ) THEN
        ALTER TABLE sesiones
            ADD COLUMN token_hash CHAR(64) NULL AFTER token,
            ADD INDEX idx_sesiones_token_hash (token_hash);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sesiones'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sesiones'
          AND COLUMN_NAME = 'fecha_revocacion'
    ) THEN
        ALTER TABLE sesiones
            ADD COLUMN fecha_revocacion TIMESTAMP NULL AFTER fecha_expiracion,
            ADD COLUMN revocada_por INT NULL AFTER fecha_revocacion,
            ADD COLUMN motivo_revocacion VARCHAR(255) NULL AFTER revocada_por,
            ADD COLUMN ultimo_uso TIMESTAMP NULL AFTER motivo_revocacion;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'archivos_excel'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'archivos_excel'
          AND COLUMN_NAME = 'departamento_id'
    ) THEN
        ALTER TABLE archivos_excel
            ADD COLUMN departamento_id INT NULL AFTER usuario_id,
            ADD INDEX idx_archivos_departamento (departamento_id);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'historial_validaciones'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'historial_validaciones'
          AND COLUMN_NAME = 'departamento_id'
    ) THEN
        ALTER TABLE historial_validaciones
            ADD COLUMN departamento_id INT NULL AFTER usuario_id,
            ADD INDEX idx_validaciones_departamento (departamento_id);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'comparaciones_archivos'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'comparaciones_archivos'
          AND COLUMN_NAME = 'departamento_id'
    ) THEN
        ALTER TABLE comparaciones_archivos
            ADD COLUMN departamento_id INT NULL AFTER usuario_id,
            ADD INDEX idx_comparaciones_departamento (departamento_id);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'conciliaciones'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'conciliaciones'
          AND COLUMN_NAME = 'departamento_id'
    ) THEN
        ALTER TABLE conciliaciones
            ADD COLUMN departamento_id INT NULL AFTER usuario_id,
            ADD INDEX idx_conciliaciones_departamento (departamento_id);
    END IF;

    INSERT INTO departamentos (codigo, nombre, descripcion, modulos, pagina_inicio, activo)
    VALUES
        ('ar', 'Accounts Receivable', 'Modulo actual: conciliaciones, documentos, tiendas e historial.', JSON_OBJECT(), 'tiendas', TRUE),
        ('ap', 'Accounts Payable', 'Base preparada para procesos futuros de AP.', JSON_OBJECT(), 'documentos', TRUE),
        ('operations', 'Operations', 'Base preparada para procesos futuros de operaciones.', JSON_OBJECT(), 'tiendas', TRUE),
        ('hr', 'Human Resources', 'Base preparada para procesos futuros de recursos humanos.', JSON_OBJECT(), 'documentos', TRUE),
        ('it', 'Information Technology', 'Administracion tecnica, seguridad y soporte.', JSON_OBJECT(), 'dashboardAdmin', TRUE)
    ON DUPLICATE KEY UPDATE
        descripcion = VALUES(descripcion),
        pagina_inicio = VALUES(pagina_inicio),
        activo = VALUES(activo);

    SELECT id INTO ar_id
    FROM departamentos
    WHERE codigo = 'ar'
    LIMIT 1;

    IF ar_id IS NOT NULL THEN
        UPDATE usuarios
        SET departamento_id = ar_id
        WHERE departamento_id IS NULL;
    END IF;
END$$

DELIMITER ;
CALL instalar_plataforma_segura();
DROP PROCEDURE instalar_plataforma_segura;
