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
-- NUEVAS TABLAS
-- ============================================

-- Tabla: categorias_permisos
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

-- Tabla: historial_permisos
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

-- Tabla: permisos_usuario_excepcion
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
-- ACTUALIZAR TABLA permisos EXISTENTE
-- ============================================

-- Agregar nuevas columnas si no existen
ALTER TABLE permisos 
ADD COLUMN IF NOT EXISTS categoria_id INT AFTER descripcion,
ADD COLUMN IF NOT EXISTS icono VARCHAR(50) DEFAULT 'fa-key' AFTER categoria_id,
ADD COLUMN IF NOT EXISTS nivel INT DEFAULT 1 AFTER icono,
ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE AFTER nivel;

-- Agregar foreign key y índices
ALTER TABLE permisos
ADD CONSTRAINT fk_permisos_categoria 
FOREIGN KEY (categoria_id) REFERENCES categorias_permisos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categoria ON permisos (categoria_id);
CREATE INDEX IF NOT EXISTS idx_activo ON permisos (activo);

-- ============================================
-- DATOS INICIALES - CATEGORÍAS
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
-- ACTUALIZAR PERMISOS EXISTENTES Y AGREGAR NUEVOS
-- ============================================

-- Primero, actualizamos los permisos existentes con sus nuevas propiedades
UPDATE permisos SET 
    descripcion = CASE nombre
        WHEN 'view_dashboard' THEN 'Ver el dashboard principal'
        WHEN 'view_archivos' THEN 'Ver lista de archivos'
        WHEN 'upload_files' THEN 'Subir archivos Excel'
        WHEN 'validate_files' THEN 'Ejecutar validaciones de archivos'
        WHEN 'view_validaciones' THEN 'Ver historial de validaciones'
        WHEN 'view_tiendas' THEN 'Ver tiendas/restaurantes'
        WHEN 'manage_users' THEN 'Gestionar usuarios (crear/editar/desactivar)'
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
        ELSE nivel
    END
WHERE nombre IN ('view_dashboard', 'view_archivos', 'upload_files', 'validate_files', 'view_validaciones', 'view_tiendas', 'manage_users');

-- Asignar categorías a los permisos existentes
UPDATE permisos p
JOIN categorias_permisos c ON c.nombre = CASE p.nombre
    WHEN 'view_dashboard' THEN 'dashboard'
    WHEN 'view_archivos' THEN 'archivos'
    WHEN 'upload_files' THEN 'archivos'
    WHEN 'validate_files' THEN 'validaciones'
    WHEN 'view_validaciones' THEN 'validaciones'
    WHEN 'view_tiendas' THEN 'tiendas'
    WHEN 'manage_users' THEN 'usuarios'
END
SET p.categoria_id = c.id
WHERE p.nombre IN ('view_dashboard', 'view_archivos', 'upload_files', 'validate_files', 'view_validaciones', 'view_tiendas', 'manage_users');

-- Insertar nuevos permisos
INSERT INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'view_stats', 'Ver estadísticas del sistema', c.id, 'fa-chart-line', 2
FROM categorias_permisos c WHERE c.nombre = 'dashboard'
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), categoria_id = VALUES(categoria_id), icono = VALUES(icono), nivel = VALUES(nivel);

INSERT INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'download_files', 'Descargar archivos Excel', c.id, 'fa-file-export', 2
FROM categorias_permisos c WHERE c.nombre = 'archivos'
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), categoria_id = VALUES(categoria_id), icono = VALUES(icono), nivel = VALUES(nivel);

INSERT INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'delete_files', 'Eliminar archivos Excel', c.id, 'fa-trash', 3
FROM categorias_permisos c WHERE c.nombre = 'archivos'
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), categoria_id = VALUES(categoria_id), icono = VALUES(icono), nivel = VALUES(nivel);

INSERT INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'edit_file_notes', 'Editar notas de archivos', c.id, 'fa-pen', 2
FROM categorias_permisos c WHERE c.nombre = 'archivos'
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), categoria_id = VALUES(categoria_id), icono = VALUES(icono), nivel = VALUES(nivel);

INSERT INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'export_validaciones', 'Exportar reportes de validación', c.id, 'fa-file-pdf', 3
FROM categorias_permisos c WHERE c.nombre = 'validaciones'
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), categoria_id = VALUES(categoria_id), icono = VALUES(icono), nivel = VALUES(nivel);

INSERT INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'manage_tiendas', 'Gestionar tiendas (crear/editar)', c.id, 'fa-store-slash', 3
FROM categorias_permisos c WHERE c.nombre = 'tiendas'
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), categoria_id = VALUES(categoria_id), icono = VALUES(icono), nivel = VALUES(nivel);

INSERT INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'view_users', 'Ver lista de usuarios', c.id, 'fa-users', 2
FROM categorias_permisos c WHERE c.nombre = 'usuarios'
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), categoria_id = VALUES(categoria_id), icono = VALUES(icono), nivel = VALUES(nivel);

INSERT INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'manage_roles', 'Gestionar roles y permisos', c.id, 'fa-key', 3
FROM categorias_permisos c WHERE c.nombre = 'usuarios'
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), categoria_id = VALUES(categoria_id), icono = VALUES(icono), nivel = VALUES(nivel);

INSERT INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'view_config', 'Ver configuración del sistema', c.id, 'fa-sliders', 2
FROM categorias_permisos c WHERE c.nombre = 'configuracion'
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), categoria_id = VALUES(categoria_id), icono = VALUES(icono), nivel = VALUES(nivel);

INSERT INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
SELECT 'manage_config', 'Modificar configuración del sistema', c.id, 'fa-screwdriver-wrench', 3
FROM categorias_permisos c WHERE c.nombre = 'configuracion'
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), categoria_id = VALUES(categoria_id), icono = VALUES(icono), nivel = VALUES(nivel);

-- ============================================
-- VISTA PARA PERMISOS CON CATEGORÍAS
-- ============================================

CREATE OR REPLACE VIEW vista_permisos_completos AS
SELECT 
    p.id,
    p.nombre,
    p.descripcion,
    p.icono,
    p.nivel,
    p.activo,
    p.fecha_creacion,
    c.id as categoria_id,
    c.nombre as categoria_nombre,
    c.icono as categoria_icono,
    c.color as categoria_color
FROM permisos p
LEFT JOIN categorias_permisos c ON p.categoria_id = c.id
ORDER BY c.orden, p.nombre;

-- ============================================
-- VERIFICACIÓN
-- ============================================

SELECT 'Actualización completada exitosamente!' as Estado;
SELECT COUNT(*) as total_categorias FROM categorias_permisos WHERE activo = TRUE;
SELECT COUNT(*) as total_permisos FROM permisos WHERE activo = TRUE;

-- ============================================
-- FIN DEL SCRIPT DE ACTUALIZACIÓN
-- ============================================