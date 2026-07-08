-- ============================================================
-- Reconciliation Platform - Unified Core Schema
-- MySQL 8 / utf8mb4
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- Departments
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departamentos (
    id INT NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(60) NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    descripcion VARCHAR(255) NULL,
    modulos JSON NULL,
    pagina_inicio VARCHAR(60) NOT NULL DEFAULT 'tiendas',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_departamentos_codigo (codigo),
    UNIQUE KEY uq_departamentos_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id INT NOT NULL AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL,
    foto_perfil_url VARCHAR(255) NULL,
    rol ENUM('admin', 'supervisor', 'usuario') NOT NULL DEFAULT 'usuario',
    departamento_id INT NULL,
    permisos JSON NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuarios_username (username),
    UNIQUE KEY uq_usuarios_email (email),
    KEY idx_usuarios_rol (rol),
    KEY idx_usuarios_departamento (departamento_id),
    CONSTRAINT fk_usuarios_departamento
        FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Restaurants
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS restaurantes (
    id INT NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(50) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT NULL,
    icono VARCHAR(50) NULL DEFAULT 'fa-store',
    color_clase VARCHAR(50) NULL DEFAULT 'primary',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_restaurantes_codigo (codigo),
    KEY idx_restaurantes_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Uploaded Excel files and generated workbooks
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS archivos_excel (
    id INT NOT NULL AUTO_INCREMENT,
    usuario_id INT NOT NULL,
    departamento_id INT NULL,
    restaurante_id INT NOT NULL,
    nombre_original VARCHAR(255) NOT NULL,
    nombre_servidor VARCHAR(255) NOT NULL,
    tamano_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
    tipo_mime VARCHAR(120) NULL,
    archivo_blob LONGBLOB NULL,
    ruta_archivo VARCHAR(500) NULL,
    numero_hojas INT UNSIGNED NOT NULL DEFAULT 1,
    nombres_hojas TEXT NULL,
    periodo_fecha DATE NULL,
    notas JSON NULL,
    estado ENUM('pendiente', 'validado', 'con_errores', 'procesado') NOT NULL DEFAULT 'pendiente',
    fecha_subida TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_archivos_usuario (usuario_id),
    KEY idx_archivos_departamento (departamento_id),
    KEY idx_archivos_restaurante (restaurante_id),
    KEY idx_archivos_estado (estado),
    KEY idx_archivos_periodo (periodo_fecha),
    KEY idx_archivos_fecha_subida (fecha_subida),
    CONSTRAINT fk_archivos_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_archivos_departamento
        FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_archivos_restaurante
        FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id)
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Validation history
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historial_validaciones (
    id INT NOT NULL AUTO_INCREMENT,
    archivo_id INT NOT NULL,
    usuario_id INT NOT NULL,
    departamento_id INT NULL,
    tipo_validacion VARCHAR(50) NOT NULL,
    resultado ENUM('exitoso', 'con_errores', 'fallido') NOT NULL DEFAULT 'exitoso',
    total_errores INT UNSIGNED NOT NULL DEFAULT 0,
    detalle_errores JSON NULL,
    duracion_segundos DECIMAL(10,3) NULL,
    fecha_validacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_validaciones_archivo (archivo_id),
    KEY idx_validaciones_usuario (usuario_id),
    KEY idx_validaciones_departamento (departamento_id),
    KEY idx_validaciones_resultado (resultado),
    KEY idx_validaciones_fecha (fecha_validacion),
    CONSTRAINT fk_validaciones_archivo
        FOREIGN KEY (archivo_id) REFERENCES archivos_excel(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_validaciones_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_validaciones_departamento
        FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Sessions and security audit
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sesiones (
    id INT NOT NULL AUTO_INCREMENT,
    usuario_id INT NOT NULL,
    token VARCHAR(2048) NOT NULL,
    token_hash CHAR(64) NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion TIMESTAMP NOT NULL,
    fecha_revocacion TIMESTAMP NULL,
    revocada_por INT NULL,
    motivo_revocacion VARCHAR(255) NULL,
    ultimo_uso TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_sesiones_usuario (usuario_id),
    KEY idx_sesiones_token_hash (token_hash),
    KEY idx_sesiones_activa (activa, fecha_expiracion),
    CONSTRAINT fk_sesiones_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seguridad_login_intentos (
    id BIGINT NOT NULL AUTO_INCREMENT,
    username VARCHAR(120) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    exitoso BOOLEAN NOT NULL DEFAULT FALSE,
    detalle VARCHAR(255) NULL,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_login_intentos_lookup (username, ip_address, fecha_creacion),
    KEY idx_login_intentos_fecha (fecha_creacion)
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
    KEY idx_auditoria_usuario_fecha (usuario_id, fecha_creacion),
    KEY idx_auditoria_departamento_fecha (departamento_id, fecha_creacion),
    KEY idx_auditoria_evento_fecha (evento, fecha_creacion),
    CONSTRAINT fk_auditoria_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_auditoria_departamento
        FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Internal chat
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_conversaciones (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tipo ENUM('directa', 'grupo') NOT NULL DEFAULT 'directa',
    titulo VARCHAR(160) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_chat_conversaciones_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_conversaciones_usuarios (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    conversacion_id BIGINT UNSIGNED NOT NULL,
    usuario_id INT NOT NULL,
    ultimo_mensaje_leido_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_chat_conversacion_usuario (conversacion_id, usuario_id),
    KEY idx_chat_cu_usuario (usuario_id),
    CONSTRAINT fk_chat_cu_conversacion
        FOREIGN KEY (conversacion_id) REFERENCES chat_conversaciones(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_chat_cu_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_mensajes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    conversacion_id BIGINT UNSIGNED NOT NULL,
    usuario_id INT NOT NULL,
    mensaje TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_chat_mensajes_conversacion_id (conversacion_id, id),
    KEY idx_chat_mensajes_usuario (usuario_id),
    CONSTRAINT fk_chat_mensajes_conversacion
        FOREIGN KEY (conversacion_id) REFERENCES chat_conversaciones(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_chat_mensajes_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_typing_status (
    conversacion_id BIGINT UNSIGNED NOT NULL,
    usuario_id INT NOT NULL,
    is_typing BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (conversacion_id, usuario_id),
    KEY idx_chat_typing_updated (updated_at),
    CONSTRAINT fk_chat_typing_conversacion
        FOREIGN KEY (conversacion_id) REFERENCES chat_conversaciones(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_chat_typing_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Reconciliation configuration and saved results
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS templates_conciliacion (
    id INT NOT NULL AUTO_INCREMENT,
    restaurante_id INT NOT NULL,
    nombre VARCHAR(160) NOT NULL,
    descripcion TEXT NULL,
    configuracion JSON NOT NULL,
    es_default BOOLEAN NOT NULL DEFAULT FALSE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_templates_restaurante (restaurante_id),
    KEY idx_templates_default (restaurante_id, es_default),
    CONSTRAINT fk_templates_restaurante
        FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conciliaciones (
    id INT NOT NULL AUTO_INCREMENT,
    restaurante_id INT NOT NULL,
    template_id INT NOT NULL,
    usuario_id INT NOT NULL,
    departamento_id INT NULL,
    fecha_conciliacion DATE NOT NULL,
    periodo_inicio DATE NULL,
    periodo_fin DATE NULL,
    datos_extraidos JSON NOT NULL,
    total_conceptos INT UNSIGNED NOT NULL DEFAULT 0,
    conceptos_ok INT UNSIGNED NOT NULL DEFAULT 0,
    conceptos_diferencia INT UNSIGNED NOT NULL DEFAULT 0,
    monto_total_diferencia DECIMAL(18,2) NOT NULL DEFAULT 0,
    notas TEXT NULL,
    estado ENUM('borrador', 'completada', 'aprobada', 'rechazada') NOT NULL DEFAULT 'borrador',
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_conciliaciones_restaurante (restaurante_id),
    KEY idx_conciliaciones_template (template_id),
    KEY idx_conciliaciones_usuario (usuario_id),
    KEY idx_conciliaciones_departamento (departamento_id),
    KEY idx_conciliaciones_fecha (fecha_conciliacion),
    KEY idx_conciliaciones_estado (estado),
    CONSTRAINT fk_conciliaciones_restaurante
        FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_conciliaciones_template
        FOREIGN KEY (template_id) REFERENCES templates_conciliacion(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_conciliaciones_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_conciliaciones_departamento
        FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS valores_esperados (
    id INT NOT NULL AUTO_INCREMENT,
    restaurante_id INT NOT NULL,
    fecha DATE NOT NULL,
    concepto VARCHAR(120) NOT NULL,
    valor DECIMAL(18,2) NOT NULL DEFAULT 0,
    fuente VARCHAR(80) NOT NULL DEFAULT 'manual',
    usuario_id INT NULL,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_valores_restaurante_fecha_concepto (restaurante_id, fecha, concepto),
    KEY idx_valores_usuario (usuario_id),
    CONSTRAINT fk_valores_restaurante
        FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_valores_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- File comparison history
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comparaciones_archivos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    restaurante_id INT NOT NULL,
    usuario_id INT NULL,
    departamento_id INT NULL,
    archivo_referencia_id INT NULL,
    conciliacion_id INT NULL,
    fecha_operacion DATE NOT NULL,
    estado ENUM('primera_carga', 'sin_cambios', 'con_cambios', 'referencia_incompatible') NOT NULL,
    tiendas_comparadas INT UNSIGNED NOT NULL DEFAULT 0,
    tiendas_con_diferencias INT UNSIGNED NOT NULL DEFAULT 0,
    total_diferencias INT UNSIGNED NOT NULL DEFAULT 0,
    monto_diferencia_absoluta DECIMAL(18,2) NOT NULL DEFAULT 0,
    huella_datos CHAR(64) NULL,
    resumen JSON NULL,
    fecha_comparacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_comparacion_fecha (fecha_comparacion),
    KEY idx_comparacion_operacion (fecha_operacion),
    KEY idx_comparacion_restaurante (restaurante_id),
    KEY idx_comparacion_departamento (departamento_id),
    KEY idx_comparacion_estado (estado),
    KEY idx_comparacion_conciliacion (conciliacion_id),
    CONSTRAINT fk_comparacion_restaurante
        FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_comparacion_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_comparacion_departamento
        FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_comparacion_archivo
        FOREIGN KEY (archivo_referencia_id) REFERENCES archivos_excel(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_comparacion_conciliacion
        FOREIGN KEY (conciliacion_id) REFERENCES conciliaciones(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comparacion_diferencias (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    comparacion_id BIGINT UNSIGNED NOT NULL,
    tienda VARCHAR(50) NOT NULL,
    fecha_operacion DATE NOT NULL,
    tipo ENUM('montos_diferentes', 'tienda_nueva', 'tienda_eliminada') NOT NULL,
    campo VARCHAR(100) NULL,
    valor_anterior DECIMAL(18,2) NULL,
    valor_nuevo DECIMAL(18,2) NULL,
    diferencia DECIMAL(18,2) NULL,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_diferencia_comparacion (comparacion_id),
    KEY idx_diferencia_tienda (tienda),
    KEY idx_diferencia_fecha (fecha_operacion),
    CONSTRAINT fk_diferencia_comparacion
        FOREIGN KEY (comparacion_id) REFERENCES comparaciones_archivos(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------
-- Seed data
-- ------------------------------------------------------------
INSERT INTO departamentos (codigo, nombre, descripcion, modulos, pagina_inicio, activo)
VALUES
    ('ar', 'Accounts Receivable', 'AR reconciliations, documents, stores, and history.', JSON_OBJECT(), 'tiendas', TRUE),
    ('ap', 'Accounts Payable', 'Base prepared for future AP workflows.', JSON_OBJECT(), 'documentos', TRUE),
    ('operations', 'Operations', 'Base prepared for future operations workflows.', JSON_OBJECT(), 'tiendas', TRUE),
    ('hr', 'Human Resources', 'Base prepared for future human resources workflows.', JSON_OBJECT(), 'documentos', TRUE),
    ('it', 'Information Technology', 'Technical administration, security, and support.', JSON_OBJECT(), 'dashboardAdmin', TRUE)
ON DUPLICATE KEY UPDATE
    nombre = VALUES(nombre),
    descripcion = VALUES(descripcion),
    pagina_inicio = VALUES(pagina_inicio),
    activo = VALUES(activo);

INSERT INTO restaurantes (codigo, nombre, descripcion, icono, color_clase, activo)
VALUES
    ('taco-bell', 'Taco Bell', 'Mexican-inspired quick service restaurant.', 'fa-bell', 'primary', TRUE),
    ('burger-king', 'Burger King', 'Burger quick service restaurant.', 'fa-burger', 'warning', TRUE),
    ('popeyes', 'Popeyes', 'Louisiana-style chicken quick service restaurant.', 'fa-drumstick-bite', 'danger', TRUE),
    ('kfc', 'KFC', 'Kentucky Fried Chicken quick service restaurant.', 'fa-bowl-food', 'success', FALSE)
ON DUPLICATE KEY UPDATE
    nombre = VALUES(nombre),
    descripcion = VALUES(descripcion),
    icono = VALUES(icono),
    color_clase = VALUES(color_clase);

INSERT INTO usuarios (username, password, nombre_completo, email, rol, departamento_id, permisos, activo)
VALUES
    (
        'admin',
        '$2b$10$rQZ8K8HN1vN8N8N8N8N8NuYhYhYhYhYhYhYhYhYhYhYhYhYhYhYh',
        'Administrator',
        'admin@sistema.com',
        'admin',
        (SELECT id FROM departamentos WHERE codigo = 'it' LIMIT 1),
        JSON_OBJECT(
            'dashboardAdmin', TRUE,
            'tiendas', TRUE,
            'documentos', TRUE,
            'perfil', TRUE,
            'permisos', TRUE,
            'historial', TRUE,
            'usuarios', TRUE,
            'controlRestaurants', TRUE,
            'chat', TRUE,
            'paginaInicio', 'dashboardAdmin'
        ),
        TRUE
    )
ON DUPLICATE KEY UPDATE
    nombre_completo = VALUES(nombre_completo),
    rol = VALUES(rol),
    departamento_id = VALUES(departamento_id),
    permisos = VALUES(permisos),
    activo = VALUES(activo);
