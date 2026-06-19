-- ============================================
-- BASE DE DATOS: Sistema de Validacion de Excel
-- ============================================
-- Este archivo crea toda la estructura necesaria para
-- almacenar usuarios, archivos Excel y datos procesados.
--
-- INSTRUCCIONES:
-- 1. Abre MySQL Workbench o phpMyAdmin
-- 2. Copia y pega este script completo
-- 3. Ejecutalo para crear la base de datos
-- ============================================

-- Crear la base de datos (si no existe)
CREATE DATABASE IF NOT EXISTS excel_validator
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

-- Usar la base de datos
USE excel_validator;

-- ============================================
-- TABLA: usuarios
-- ============================================
-- Almacena la informacion de los usuarios del sistema
-- Cada usuario tiene un rol que determina sus permisos
-- ============================================
CREATE TABLE IF NOT EXISTS usuarios (
    -- ID unico del usuario (se genera automaticamente)
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- Nombre de usuario para iniciar sesion (debe ser unico)
    username VARCHAR(50) NOT NULL UNIQUE,
    
    -- Contrasena encriptada (nunca guardar en texto plano)
    password VARCHAR(255) NOT NULL,
    
    -- Nombre completo del usuario
    nombre_completo VARCHAR(100) NOT NULL,
    
    -- Correo electronico (debe ser unico)
    email VARCHAR(100) NOT NULL UNIQUE,
    
    -- Rol del usuario: 'admin', 'supervisor', 'usuario'
    -- admin: acceso total
    -- supervisor: puede ver reportes y validar
    -- usuario: solo puede subir archivos
    rol ENUM('admin', 'supervisor', 'usuario') DEFAULT 'usuario',
    
    -- Estado del usuario (activo o inactivo)
    activo BOOLEAN DEFAULT TRUE,
    
    -- Fecha de creacion (se llena automaticamente)
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Fecha de ultima actualizacion
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- TABLA: restaurantes
-- ============================================
-- Catalogo de restaurantes/tiendas del sistema
-- ============================================
CREATE TABLE IF NOT EXISTS restaurantes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- Codigo interno del restaurante (ej: 'taco-bell', 'burger-king')
    codigo VARCHAR(50) NOT NULL UNIQUE,
    
    -- Nombre para mostrar
    nombre VARCHAR(100) NOT NULL,
    
    -- Descripcion del restaurante
    descripcion VARCHAR(255),
    
    -- Icono de FontAwesome (ej: 'fa-utensils')
    icono VARCHAR(50) DEFAULT 'fa-store',
    
    -- Clase de color CSS (ej: 'primary', 'warning')
    color_clase VARCHAR(20) DEFAULT 'primary',
    
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TABLA: archivos_excel
-- ============================================
-- Almacena los archivos Excel subidos al sistema
-- Guarda tanto el archivo binario como metadatos
-- ============================================
CREATE TABLE IF NOT EXISTS archivos_excel (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- Relacion con el usuario que subio el archivo
    usuario_id INT NOT NULL,
    
    -- Relacion con el restaurante al que pertenece
    restaurante_id INT NOT NULL,
    
    -- Nombre original del archivo (como lo subio el usuario)
    nombre_original VARCHAR(255) NOT NULL,
    
    -- Nombre unico en el servidor (para evitar duplicados)
    nombre_servidor VARCHAR(255) NOT NULL,
    
    -- Tamano del archivo en bytes
    tamano_bytes BIGINT NOT NULL,
    
    -- Tipo MIME del archivo
    tipo_mime VARCHAR(100) DEFAULT 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    
    -- El archivo Excel en formato binario (LONGBLOB soporta hasta 4GB)
    archivo_blob LONGBLOB,
    
    -- Ruta del archivo en el servidor (alternativa a guardar en DB)
    ruta_archivo VARCHAR(500),
    
    -- Numero de hojas en el archivo
    numero_hojas INT DEFAULT 1,
    
    -- Nombres de las hojas separados por coma
    nombres_hojas TEXT,
    
    -- Estado del archivo: 'pendiente', 'validado', 'con_errores', 'procesado'
    estado ENUM('pendiente', 'validado', 'con_errores', 'procesado') DEFAULT 'pendiente',
    
    -- Fecha del periodo que cubre el archivo (mes/ano de los datos)
    periodo_fecha DATE,
    
    -- Notas o comentarios sobre el archivo
    notas TEXT,
    
    fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Relaciones (Foreign Keys)
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE RESTRICT,
    
    -- Indices para busquedas rapidas
    INDEX idx_usuario (usuario_id),
    INDEX idx_restaurante (restaurante_id),
    INDEX idx_estado (estado),
    INDEX idx_fecha (fecha_subida)
);

-- ============================================
-- TABLA: datos_conciliacion
-- ============================================
-- Almacena los datos extraidos de los archivos Excel
-- Cada fila representa una tienda con sus valores
-- ============================================
CREATE TABLE IF NOT EXISTS datos_conciliacion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- Relacion con el archivo de donde se extrajeron los datos
    archivo_id INT NOT NULL,
    
    -- Numero de tienda (ej: 28841, 28842)
    numero_tienda VARCHAR(20) NOT NULL,
    
    -- Nombre de la hoja de donde se extrajo
    nombre_hoja VARCHAR(100),
    
    -- Valores financieros (usamos DECIMAL para precision monetaria)
    sales_tax DECIMAL(15,2) DEFAULT 0,
    gross_sales_pos DECIMAL(15,2) DEFAULT 0,
    discounts DECIMAL(15,2) DEFAULT 0,
    promo DECIMAL(15,2) DEFAULT 0,
    donations DECIMAL(15,2) DEFAULT 0,
    net_sales DECIMAL(15,2) DEFAULT 0,
    gc_sold DECIMAL(15,2) DEFAULT 0,
    paid_out DECIMAL(15,2) DEFAULT 0,
    paid_in DECIMAL(15,2) DEFAULT 0,
    
    -- Campos adicionales para EBT y otros
    ebt_fs DECIMAL(15,2) DEFAULT 0,
    ebt_cash DECIMAL(15,2) DEFAULT 0,
    
    -- Resultado de la validacion
    validacion_correcta BOOLEAN DEFAULT NULL,
    errores_validacion TEXT,
    
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (archivo_id) REFERENCES archivos_excel(id) ON DELETE CASCADE,
    
    INDEX idx_archivo (archivo_id),
    INDEX idx_tienda (numero_tienda)
);

-- ============================================
-- TABLA: historial_validaciones
-- ============================================
-- Registro de todas las validaciones realizadas
-- Util para auditorias y seguimiento
-- ============================================
CREATE TABLE IF NOT EXISTS historial_validaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    archivo_id INT NOT NULL,
    usuario_id INT NOT NULL,
    
    -- Tipo de validacion realizada
    tipo_validacion VARCHAR(50) NOT NULL,
    
    -- Resultado: 'exitoso', 'con_errores', 'fallido'
    resultado ENUM('exitoso', 'con_errores', 'fallido') NOT NULL,
    
    -- Numero de errores encontrados
    total_errores INT DEFAULT 0,
    
    -- Detalle de errores en formato JSON
    detalle_errores JSON,
    
    -- Duracion de la validacion en segundos
    duracion_segundos DECIMAL(10,3),
    
    fecha_validacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (archivo_id) REFERENCES archivos_excel(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
    
    INDEX idx_archivo (archivo_id),
    INDEX idx_fecha (fecha_validacion)
);

-- ============================================
-- TABLA: sesiones
-- ============================================
-- Manejo de sesiones de usuario (para JWT o sesiones)
-- ============================================
CREATE TABLE IF NOT EXISTS sesiones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    usuario_id INT NOT NULL,
    
    -- Token de sesion (JWT o similar)
    token VARCHAR(2048) NOT NULL,
    
    -- IP desde donde se conecto
    ip_address VARCHAR(45),
    
    -- Informacion del navegador
    user_agent VARCHAR(255),
    
    -- Fecha de expiracion del token
    fecha_expiracion TIMESTAMP NOT NULL,
    
    -- Si la sesion sigue activa
    activa BOOLEAN DEFAULT TRUE,
    
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    
    INDEX idx_token (token(100)),
    INDEX idx_usuario (usuario_id)
);

    -- ============================================
    -- TABLA: categorias_permisos
    -- ============================================
    -- Categorías para agrupar permisos por área funcional
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
    -- TABLA: permisos
    -- ============================================
    -- Lista de permisos que el sistema puede usar para controlar accesos
    CREATE TABLE IF NOT EXISTS permisos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        descripcion VARCHAR(255),
        categoria_id INT,
        icono VARCHAR(50) DEFAULT 'fa-key',
        nivel INT DEFAULT 1 COMMENT '1=básico, 2=intermedio, 3=avanzado',
        activo BOOLEAN DEFAULT TRUE,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (categoria_id) REFERENCES categorias_permisos(id) ON DELETE SET NULL,
        INDEX idx_categoria (categoria_id),
        INDEX idx_activo (activo)
    );

    -- ============================================
    -- TABLA: roles_permisos
    -- ============================================
    -- Asigna permisos a roles (rol es el texto que se guarda en usuarios.rol)
    CREATE TABLE IF NOT EXISTS roles_permisos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rol VARCHAR(50) NOT NULL,
        permiso_nombre VARCHAR(100) NOT NULL,
        fecha_asignacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_rol_permiso (rol, permiso_nombre),
        FOREIGN KEY (permiso_nombre) REFERENCES permisos(nombre) ON DELETE CASCADE
    );

    -- ============================================
    -- TABLA: historial_permisos
    -- ============================================
    -- Registro de auditoría de cambios en permisos y asignaciones
    CREATE TABLE IF NOT EXISTS historial_permisos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        accion VARCHAR(50) NOT NULL COMMENT 'crear, eliminar, asignar, quitar, modificar',
        tipo_objeto VARCHAR(50) NOT NULL COMMENT 'permiso, rol_permiso, categoria',
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
    -- TABLA: permisos_usuario_excepcion
    -- ============================================
    -- Permisos especiales a nivel de usuario individual (excepciones al rol)
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
-- DATOS INICIALES
-- ============================================

-- Insertar usuario administrador por defecto
-- Contrasena: admin123 (en produccion usar hash bcrypt)
INSERT INTO usuarios (username, password, nombre_completo, email, rol) VALUES
('admin', '$2b$10$rQZ8K8HN1vN8N8N8N8N8NuYhYhYhYhYhYhYhYhYhYhYhYhYhYhYh', 'Administrador', 'admin@sistema.com', 'admin'),
('eduardo', '$2b$10$rQZ8K8HN1vN8N8N8N8N8NuYhYhYhYhYhYhYhYhYhYhYhYhYhYhYh', 'Eduardo Perez', 'eduardo@sistema.com', 'admin');

-- Insertar restaurantes
INSERT INTO restaurantes (codigo, nombre, descripcion, icono, color_clase) VALUES
('taco-bell', 'Taco Bell', 'Comida rapida mexicana', 'fa-utensils', 'primary'),
('burger-king', 'Burger King', 'Hamburguesas y mas', 'fa-burger', 'warning'),
('popeyes', 'Popeyes', 'Pollo frito estilo Louisiana', 'fa-drumstick-bite', 'danger'),
('kfc', 'KFC', 'Kentucky Fried Chicken', 'fa-bowl-food', 'success');

-- ============================================
-- CATEGORIAS DE PERMISOS INICIALES
INSERT INTO categorias_permisos (nombre, descripcion, icono, color, orden) VALUES
('dashboard', 'Permisos del dashboard y vista principal', 'fa-gauge', 'info', 1),
('archivos', 'Gestión de archivos Excel', 'fa-file-excel', 'success', 2),
('validaciones', 'Validaciones y reportes', 'fa-clipboard-check', 'warning', 3),
('tiendas', 'Gestión de tiendas/restaurantes', 'fa-store', 'primary', 4),
('usuarios', 'Administración de usuarios', 'fa-users', 'danger', 5),
('configuracion', 'Configuración del sistema', 'fa-gear', 'secondary', 6)
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

-- ============================================
-- PERMISOS INICIALES
-- Inserta permisos por defecto y asignaciones de ejemplo a roles
-- Los administradores (`rol = 'admin'`) tienen acceso total implicitamente.
INSERT INTO permisos (nombre, descripcion, categoria_id, icono, nivel) VALUES
-- Dashboard
('view_dashboard', 'Ver el dashboard principal', 1, 'fa-gauge-high', 1),
('view_stats', 'Ver estadísticas del sistema', 1, 'fa-chart-line', 2),

-- Archivos
('view_archivos', 'Ver lista de archivos', 2, 'fa-file-lines', 1),
('upload_files', 'Subir archivos Excel', 2, 'fa-file-import', 1),
('download_files', 'Descargar archivos Excel', 2, 'fa-file-export', 2),
('delete_files', 'Eliminar archivos Excel', 2, 'fa-trash', 3),
('edit_file_notes', 'Editar notas de archivos', 2, 'fa-pen', 2),

-- Validaciones
('validate_files', 'Ejecutar validaciones de archivos', 3, 'fa-circle-check', 2),
('view_validaciones', 'Ver historial de validaciones', 3, 'fa-clock-rotate-left', 1),
('export_validaciones', 'Exportar reportes de validación', 3, 'fa-file-pdf', 3),

-- Tiendas
('view_tiendas', 'Ver tiendas/restaurantes', 4, 'fa-store', 1),
('manage_tiendas', 'Gestionar tiendas (crear/editar)', 4, 'fa-store-slash', 3),

-- Usuarios
('manage_users', 'Gestionar usuarios (crear/editar/desactivar)', 5, 'fa-user-gear', 3),
('view_users', 'Ver lista de usuarios', 5, 'fa-users', 2),
('manage_roles', 'Gestionar roles y permisos', 5, 'fa-key', 3),

-- Configuración
('view_config', 'Ver configuración del sistema', 6, 'fa-sliders', 2),
('manage_config', 'Modificar configuración del sistema', 6, 'fa-screwdriver-wrench', 3)
ON DUPLICATE KEY UPDATE 
    descripcion = VALUES(descripcion),
    categoria_id = VALUES(categoria_id),
    icono = VALUES(icono),
    nivel = VALUES(nivel);

-- Asignaciones de ejemplo: supervisores y usuarios
INSERT INTO roles_permisos (rol, permiso_nombre) VALUES
('supervisor','view_dashboard'),
('supervisor','view_archivos'),
('supervisor','view_validaciones'),
('supervisor','validate_files'),
('supervisor','view_tiendas'),
('usuario','upload_files'),
('usuario','view_archivos')
ON DUPLICATE KEY UPDATE permiso_nombre = permiso_nombre;

-- ============================================
-- VISTAS UTILES
-- ============================================

-- Vista para ver archivos con informacion del usuario y restaurante
CREATE OR REPLACE VIEW vista_archivos AS
SELECT 
    a.id,
    a.nombre_original,
    a.tamano_bytes,
    a.estado,
    a.fecha_subida,
    u.nombre_completo AS subido_por,
    r.nombre AS restaurante
FROM archivos_excel a
JOIN usuarios u ON a.usuario_id = u.id
JOIN restaurantes r ON a.restaurante_id = r.id
ORDER BY a.fecha_subida DESC;

-- Vista para resumen de datos por tienda
CREATE OR REPLACE VIEW vista_resumen_tiendas AS
SELECT 
    d.numero_tienda,
    r.nombre AS restaurante,
    COUNT(d.id) AS total_registros,
    SUM(d.net_sales) AS total_ventas_netas,
    MAX(a.fecha_subida) AS ultima_actualizacion
FROM datos_conciliacion d
JOIN archivos_excel a ON d.archivo_id = a.id
JOIN restaurantes r ON a.restaurante_id = r.id
GROUP BY d.numero_tienda, r.nombre
ORDER BY d.numero_tienda;

-- ============================================
-- PROCEDIMIENTOS ALMACENADOS
-- ============================================

-- Procedimiento para obtener estadisticas generales
DELIMITER //
CREATE PROCEDURE obtener_estadisticas()
BEGIN
    SELECT 
        (SELECT COUNT(*) FROM usuarios WHERE activo = TRUE) AS total_usuarios,
        (SELECT COUNT(*) FROM archivos_excel) AS total_archivos,
        (SELECT COUNT(*) FROM archivos_excel WHERE estado = 'validado') AS archivos_validados,
        (SELECT COUNT(*) FROM archivos_excel WHERE estado = 'con_errores') AS archivos_con_errores,
        (SELECT COUNT(DISTINCT numero_tienda) FROM datos_conciliacion) AS total_tiendas;
END //
DELIMITER ;

-- ============================================
-- FIN DEL SCRIPT
-- ============================================
-- Para verificar que todo se creo correctamente:
-- SHOW TABLES;
-- DESCRIBE usuarios;
-- SELECT * FROM restaurantes;
-- ============================================
