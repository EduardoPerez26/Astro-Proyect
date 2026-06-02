-- ============================================
-- ACTUALIZACIÓN DEL ESQUEMA DE PERMISOS
-- ============================================
-- Este script actualiza una base de datos existente
-- agregando las nuevas tablas y campos para la gestión
-- mejorada de permisos.
--
-- INSTRUCCIONES:
-- 1. Ejecutar este script en la base de datos existente
-- 2. Los datos existentes se mantendrán
-- 3. Se agregarán nuevas categorías y permisos
-- ============================================

USE excel_validator;

-- ============================================
-- 1. CREAR TABLA categorias_permisos SI NO EXISTE
-- ============================================
CREATE TABLE IF NOT EXISTS categorias_permisos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(255),
    icono VARCHAR(50) DEFAULT 'fa-folder',
    color VARCHAR(20) DEFAULT 'primary',
    orden INT DEFAULT 0,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. AGREGAR COLUMNAS FALTANTES A permisos
-- ============================================

-- Verificar y agregar categoria_id
SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns 
                      WHERE table_schema = 'excel_validator' 
                      AND table_name = 'permisos' 
                      AND column_name = 'categoria_id');

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE permisos ADD COLUMN categoria_id INT AFTER descripcion',
    'SELECT "Columna categoria_id ya existe" as mensaje'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verificar y agregar icono
SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns 
                      WHERE table_schema = 'excel_validator' 
                      AND table_name = 'permisos' 
                      AND column_name = 'icono');

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE permisos ADD COLUMN icono VARCHAR(50) DEFAULT ''fa-key'' AFTER categoria_id',
    'SELECT "Columna icono ya existe" as mensaje'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verificar y agregar nivel
SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns 
                      WHERE table_schema = 'excel_validator' 
                      AND table_name = 'permisos' 
                      AND column_name = 'nivel');

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE permisos ADD COLUMN nivel INT DEFAULT 1 AFTER icono',
    'SELECT "Columna nivel ya existe" as mensaje'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verificar y agregar activo
SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns 
                      WHERE table_schema = 'excel_validator' 
                      AND table_name = 'permisos' 
                      AND column_name = 'activo');

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE permisos ADD COLUMN activo BOOLEAN DEFAULT TRUE AFTER nivel',
    'SELECT "Columna activo ya existe" as mensaje'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- 3. AGREGAR FOREIGN KEY Y ÍNDICES
-- ============================================

-- Verificar y agregar foreign key
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints 
                  WHERE table_schema = 'excel_validator' 
                  AND table_name = 'permisos' 
                  AND constraint_name = 'fk_permisos_categoria');

SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE permisos ADD CONSTRAINT fk_permisos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias_permisos(id) ON DELETE SET NULL',
    'SELECT "Foreign key ya existe" as mensaje'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Crear índices si no existen
CREATE INDEX IF NOT EXISTS idx_permisos_categoria ON permisos (categoria_id);
CREATE INDEX IF NOT EXISTS idx_permisos_activo ON permisos (activo);

-- ============================================
-- 4. CREAR TABLA historial_permisos SI NO EXISTE
-- ============================================
CREATE TABLE IF NOT EXISTS historial_permisos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    accion VARCHAR(50) NOT NULL,
    tipo_objeto VARCHAR(50) NOT NULL,
    objeto_id INT,
    objeto_nombre VARCHAR(255),
    detalles_anteriores JSON,
    detalles_nuevos JSON,
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    fecha_accion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_usuario (usuario_id),
    INDEX idx_fecha (fecha_accion),
    INDEX idx_accion (accion)
);

-- ============================================
-- 5. CREAR TABLA permisos_usuario_excepcion SI NO EXISTE
-- ============================================
CREATE TABLE IF NOT EXISTS permisos_usuario_excepcion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    permiso_nombre VARCHAR(100) NOT NULL,
    tipo ENUM('conceder', 'denegar') DEFAULT 'conceder',
    razon VARCHAR(255),
    fecha_asignacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion TIMESTAMP NULL,
    activo BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (permiso_nombre) REFERENCES permisos(nombre) ON DELETE CASCADE,
    UNIQUE KEY uk_usuario_permiso (usuario_id, permiso_nombre),
    INDEX idx_usuario (usuario_id),
    INDEX idx_activo (activo)
);

-- ============================================
-- 6. INSERTAR CATEGORÍAS POR DEFECTO
-- ============================================
INSERT INTO categorias_permisos (nombre, descripcion, icono, color, orden) VALUES
('dashboard', 'Permisos del dashboard y vista principal', 'fa-gauge', 'info', 1),
('archivos', 'Gestión de archivos Excel', 'fa-file-excel', 'success', 2),
('validaciones', 'Validaciones y reportes', 'fa-clipboard-check', 'warning', 3),
('tiendas', 'Gestión de tiendas/restaurantes', 'fa-store', 'primary', 4),
('usuarios', 'Administración de usuarios', 'fa-users', 'danger', 5),
('configuracion', 'Configuración del sistema', 'fa-gear', 'secondary', 6)
ON DUPLICATE KEY UPDATE 
    descripcion = VALUES(descripcion),
    icono = VALUES(icono),
    color = VALUES(color),
    orden = VALUES(orden);

-- ============================================
-- 7. ACTUALIZAR PERMISOS EXISTENTES CON NUEVAS PROPIEDADES
-- ============================================

-- Actualizar descripciones, iconos y niveles
UPDATE permisos SET 
    descripcion = CASE nombre
        WHEN 'view_dashboard' THEN 'Ver el dashboard principal'
        WHEN 'view_archivos' THEN 'Ver lista de archivos'
        WHEN 'upload_files' THEN 'Subir archivos Excel'
        WHEN 'validate_files' THEN 'Ejecutar validaciones de archivos'
        WHEN 'view_validaciones' THEN 'Ver historial de validaciones'
        WHEN 'view_tiendas' THEN 'Ver tiendas/restaurantes'
        WHEN 'manage_users' THEN 'Gestionar usuarios (crear/editar/desactivar)'
        WHEN 'view_stats' THEN 'Ver estadísticas del sistema'
        WHEN 'download_files' THEN 'Descargar archivos Excel'
        WHEN 'delete_files' THEN 'Eliminar archivos Excel'
        WHEN 'edit_file_notes' THEN 'Editar notas de archivos'
        WHEN 'export_validaciones' THEN 'Exportar reportes de validación'
        WHEN 'manage_tiendas' THEN 'Gestionar tiendas (crear/editar)'
        WHEN 'view_users' THEN 'Ver lista de usuarios'
        WHEN 'manage_roles' THEN 'Gestionar roles y permisos'
        WHEN 'view_config' THEN 'Ver configuración del sistema'
        WHEN 'manage_config' THEN 'Modificar configuración del sistema'
        ELSE descripcion
    END,
    icono = CASE nombre
        WHEN 'view_dashboard' THEN 'fa-gauge-high'
        WHEN 'view_archivos' THEN 'fa-file-lines'
        WHEN 'upload_files' THEN 'fa-file-import'
        WHEN 'validate_files' THEN 'fa-circle-check'
        WHEN 'view_validaciones' THEN 'fa-clock-rotate-left'
        WHEN 'view_tiendas' THEN 'fa-store'
        WHEN 'manage_users' THEN 'fa-user-gear'
        WHEN 'view_stats' THEN 'fa-chart-line'
        WHEN 'download_files' THEN 'fa-file-export'
        WHEN 'delete_files' THEN 'fa-trash'
        WHEN 'edit_file_notes' THEN 'fa-pen'
        WHEN 'export_validaciones' THEN 'fa-file-pdf'
        WHEN 'manage_tiendas' THEN 'fa-store-slash'
        WHEN 'view_users' THEN 'fa-users'
        WHEN 'manage_roles' THEN 'fa-key'
        WHEN 'view_config' THEN 'fa-sliders'
        WHEN 'manage_config' THEN 'fa-screwdriver-wrench'
        ELSE icono
    END,
    nivel = CASE nombre
        WHEN 'view_dashboard' THEN 1
        WHEN 'view_archivos' THEN 1
        WHEN 'upload_files' THEN 1
        WHEN 'validate_files' THEN 2
        WHEN 'view_validaciones' THEN 1
        WHEN 'view_tiendas' THEN 1
        WHEN 'manage_users' THEN 3
        WHEN 'view_stats' THEN 2
        WHEN 'download_files' THEN 2
        WHEN 'delete_files' THEN 3
        WHEN 'edit_file_notes' THEN 2
        WHEN 'export_validaciones' THEN 3
        WHEN 'manage_tiendas' THEN 3
        WHEN 'view_users' THEN 2
        WHEN 'manage_roles' THEN 3
        WHEN 'view_config' THEN 2
        WHEN 'manage_config' THEN 3
        ELSE nivel
    END
WHERE nombre IN ('view_dashboard', 'view_archivos', 'upload_files', 'validate_files', 
                 'view_validaciones', 'view_tiendas', 'manage_users', 'view_stats',
                 'download_files', 'delete_files', 'edit_file_notes', 'export_validaciones',
                 'manage_tiendas', 'view_users', 'manage_roles', 'view_config', 'manage_config');

-- Asignar categorías a los permisos existentes
UPDATE permisos p
JOIN categorias_permisos c ON c.nombre = CASE p.nombre
    WHEN 'view_dashboard' THEN 'dashboard'
    WHEN 'view_stats' THEN 'dashboard'
    WHEN 'view_archivos' THEN 'archivos'
    WHEN 'upload_files' THEN 'archivos'
    WHEN 'download_files' THEN 'archivos'
    WHEN 'delete_files' THEN 'archivos'
    WHEN 'edit_file_notes' THEN 'archivos'
    WHEN 'validate_files' THEN 'validaciones'
    WHEN 'view_validaciones' THEN 'validaciones'
    WHEN 'export_validaciones' THEN 'validaciones'
    WHEN 'view_tiendas' THEN 'tiendas'
    WHEN 'manage_tiendas' THEN 'tiendas'
    WHEN 'view_users' THEN 'usuarios'
    WHEN 'manage_users' THEN 'usuarios'
    WHEN 'manage_roles' THEN 'usuarios'
    WHEN 'view_config' THEN 'configuracion'
    WHEN 'manage_config' THEN 'configuracion'
END
SET p.categoria_id = c.id
WHERE p.nombre IN ('view_dashboard', 'view_stats', 'view_archivos', 'upload_files', 
                   'download_files', 'delete_files', 'edit_file_notes', 'validate_files', 
                   'view_validaciones', 'export_validaciones', 'view_tiendas', 'manage_tiendas',
                   'view_users', 'manage_users', 'manage_roles', 'view_config', 'manage_config');

-- ============================================
-- 8. INSERTAR PERMISOS FALTANTES
-- ============================================
INSERT IGNORE INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'view_stats', 'Ver estadísticas del sistema', c.id, 'fa-chart-line', 2
FROM categorias_permisos c WHERE c.nombre = 'dashboard';

INSERT IGNORE INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'download_files', 'Descargar archivos Excel', c.id, 'fa-file-export', 2
FROM categorias_permisos c WHERE c.nombre = 'archivos';

INSERT IGNORE INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'delete_files', 'Eliminar archivos Excel', c.id, 'fa-trash', 3
FROM categorias_permisos c WHERE c.nombre = 'archivos';

INSERT IGNORE INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'edit_file_notes', 'Editar notas de archivos', c.id, 'fa-pen', 2
FROM categorias_permisos c WHERE c.nombre = 'archivos';

INSERT IGNORE INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'export_validaciones', 'Exportar reportes de validación', c.id, 'fa-file-pdf', 3
FROM categorias_permisos c WHERE c.nombre = 'validaciones';

INSERT IGNORE INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'manage_tiendas', 'Gestionar tiendas (crear/editar)', c.id, 'fa-store-slash', 3
FROM categorias_permisos c WHERE c.nombre = 'tiendas';

INSERT IGNORE INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'view_users', 'Ver lista de usuarios', c.id, 'fa-users', 2
FROM categorias_permisos c WHERE c.nombre = 'usuarios';

INSERT IGNORE INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'manage_roles', 'Gestionar roles y permisos', c.id, 'fa-key', 3
FROM categorias_permisos c WHERE c.nombre = 'usuarios';

INSERT IGNORE INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'view_config', 'Ver configuración del sistema', c.id, 'fa-sliders', 2
FROM categorias_permisos c WHERE c.nombre = 'configuracion';

INSERT IGNORE INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'manage_config', 'Modificar configuración del sistema', c.id, 'fa-screwdriver-wrench', 3
FROM categorias_permisos c WHERE c.nombre = 'configuracion';

-- ============================================
-- 9. VERIFICACIÓN
-- ============================================
SELECT '===== VERIFICACIÓN DEL ESQUEMA =====' as Estado;

-- Verificar columnas de permisos
SELECT 
    'permisos' as tabla,
    COUNT(*) as total_columnas
FROM information_schema.columns 
WHERE table_schema = 'excel_validator' AND table_name = 'permisos';

-- Verificar tablas creadas
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'excel_validator' 
AND table_name IN ('categorias_permisos', 'permisos', 'roles_permisos', 'historial_permisos', 'permisos_usuario_excepcion')
ORDER BY table_name;

-- Contar permisos y categorías
SELECT COUNT(*) as total_categorias FROM categorias_permisos WHERE activo = TRUE;
SELECT COUNT(*) as total_permisos FROM permisos WHERE activo = TRUE;

SELECT '===== ESQUEMA ACTUALIZADO CORRECTAMENTE =====' as Estado;