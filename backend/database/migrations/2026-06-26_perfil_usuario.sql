-- ============================================================
-- USER PROFILE
-- Adds profile photo support.
-- Run against the same database used by the backend.
-- It is idempotent and compatible with MySQL 8.
-- ============================================================

DROP PROCEDURE IF EXISTS instalar_perfil_usuario;
DELIMITER $$

CREATE PROCEDURE instalar_perfil_usuario()
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'usuarios'
          AND COLUMN_NAME = 'foto_perfil_url'
    ) THEN
        ALTER TABLE usuarios
            ADD COLUMN foto_perfil_url VARCHAR(255) NULL AFTER email;
    END IF;
END$$

DELIMITER ;
CALL instalar_perfil_usuario();
DROP PROCEDURE IF EXISTS instalar_perfil_usuario;
