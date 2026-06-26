-- ============================================================
-- Unified core schema cleanup
-- Removes obsolete permission/editor tables and normalizes seed text.
-- Run after the current production migrations.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP VIEW IF EXISTS vista_resumen_tiendas;
DROP VIEW IF EXISTS vista_archivos;

DROP TABLE IF EXISTS permisos_usuario_excepcion;
DROP TABLE IF EXISTS historial_permisos;
DROP TABLE IF EXISTS roles_permisos;
DROP TABLE IF EXISTS permisos;
DROP TABLE IF EXISTS categorias_permisos;
DROP TABLE IF EXISTS datos_conciliacion;

SET FOREIGN_KEY_CHECKS = 1;

DROP PROCEDURE IF EXISTS cleanup_core_seed_text;
DELIMITER $$

CREATE PROCEDURE cleanup_core_seed_text()
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'departamentos'
    ) THEN
        UPDATE departamentos
        SET descripcion = CASE codigo
            WHEN 'ar' THEN 'AR reconciliations, documents, stores, and history.'
            WHEN 'ap' THEN 'Base prepared for future AP workflows.'
            WHEN 'operations' THEN 'Base prepared for future operations workflows.'
            WHEN 'hr' THEN 'Base prepared for future human resources workflows.'
            WHEN 'it' THEN 'Technical administration, security, and support.'
            ELSE descripcion
        END
        WHERE codigo IN ('ar', 'ap', 'operations', 'hr', 'it');
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'restaurantes'
    ) THEN
        UPDATE restaurantes
        SET descripcion = 'Mexican-inspired quick service restaurant.',
            icono = 'fa-bell'
        WHERE codigo = 'taco-bell';

        UPDATE restaurantes
        SET descripcion = 'Burger quick service restaurant.'
        WHERE codigo = 'burger-king';

        UPDATE restaurantes
        SET descripcion = 'Louisiana-style chicken quick service restaurant.'
        WHERE codigo = 'popeyes';

        UPDATE restaurantes
        SET descripcion = 'Kentucky Fried Chicken quick service restaurant.'
        WHERE codigo = 'kfc';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'usuarios'
    ) THEN
        UPDATE usuarios
        SET nombre_completo = 'Administrator'
        WHERE username = 'admin'
          AND nombre_completo IN ('Administrador', 'Admin');
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'templates_conciliacion'
    ) THEN
        UPDATE templates_conciliacion
        SET nombre = 'Automatic reconciliation template',
            descripcion = 'Internal configuration for history and comparison'
        WHERE nombre LIKE 'Template%'
          AND nombre LIKE '%conciliaci%';
    END IF;
END$$

DELIMITER ;
CALL cleanup_core_seed_text();
DROP PROCEDURE IF EXISTS cleanup_core_seed_text;
