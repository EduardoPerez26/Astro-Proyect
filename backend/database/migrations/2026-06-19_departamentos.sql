-- ============================================================
-- MODULO DE DEPARTAMENTOS
-- Ejecutar una sola vez sobre la misma base usada por el backend.
-- Compatible con MySQL 8 y seguro para volver a ejecutar.
-- ============================================================

CREATE TABLE IF NOT EXISTS departamentos (
    id INT NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(60) NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    descripcion VARCHAR(255) NULL,
    -- Campos conservados por compatibilidad. Las ventanas se gestionan
    -- only in usuarios.permisos from the Permissions screen.
    modulos JSON NOT NULL,
    pagina_inicio VARCHAR(60) NOT NULL DEFAULT 'tiendas',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_departamentos_codigo (codigo),
    UNIQUE KEY uq_departamentos_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS instalar_departamentos;
DELIMITER $$

CREATE PROCEDURE instalar_departamentos()
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'departamentos'
          AND COLUMN_NAME = 'pagina_inicio'
    ) THEN
        ALTER TABLE departamentos
            ADD COLUMN pagina_inicio VARCHAR(60) NOT NULL DEFAULT 'tiendas' AFTER modulos;
    END IF;

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
END$$

DELIMITER ;
CALL instalar_departamentos();
DROP PROCEDURE instalar_departamentos;

INSERT INTO departamentos (codigo, nombre, descripcion, modulos, pagina_inicio, activo)
VALUES
    (
        'accounting',
        'Accounting',
        'Reconciliations, documents, and accounting history.',
        JSON_OBJECT(),
        'tiendas',
        TRUE
    ),
    (
        'operations',
        'Operations',
        'Daily store operations and document lookup.',
        JSON_OBJECT(),
        'tiendas',
        TRUE
    ),
    (
        'auditing',
        'Auditing',
        'Document review, reconciliations, and history.',
        JSON_OBJECT(),
        'tiendas',
        TRUE
    )
ON DUPLICATE KEY UPDATE
    descripcion = VALUES(descripcion),
    modulos = VALUES(modulos),
    pagina_inicio = VALUES(pagina_inicio),
    activo = VALUES(activo);

-- Existing users remain without a department to avoid changing
-- their current access. The administrator can assign them from Users.
