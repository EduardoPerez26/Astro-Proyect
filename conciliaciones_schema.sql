-- ============================================
-- MIGRACION: Tablas de Conciliacion
-- ============================================
-- Crea las tablas necesarias para guardar conciliaciones:
--   - templates_conciliacion
--   - conciliaciones
--   - valores_esperados
--
-- Ejecuta este script sobre tu base de datos existente para
-- habilitar el boton "Guardar conciliacion" sin recrear todo.
--
-- INSTRUCCIONES:
-- 1. Abre MySQL Workbench o phpMyAdmin
-- 2. Selecciona la base de datos: USE excel_validator;
-- 3. Copia y pega este script completo y ejecutalo
-- ============================================

USE excel_validator;

-- ============================================
-- TABLA: templates_conciliacion
-- ============================================
CREATE TABLE IF NOT EXISTS templates_conciliacion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    restaurante_id INT NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion VARCHAR(255),
    configuracion JSON NOT NULL,
    es_default BOOLEAN DEFAULT FALSE,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE,
    INDEX idx_restaurante (restaurante_id),
    INDEX idx_activo (activo)
);

-- ============================================
-- TABLA: conciliaciones
-- ============================================
CREATE TABLE IF NOT EXISTS conciliaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    restaurante_id INT NOT NULL,
    template_id INT NOT NULL,
    usuario_id INT NOT NULL,
    fecha_conciliacion DATE NOT NULL,
    periodo_inicio DATE NULL,
    periodo_fin DATE NULL,
    datos_extraidos JSON NOT NULL,
    total_conceptos INT DEFAULT 0,
    conceptos_ok INT DEFAULT 0,
    conceptos_diferencia INT DEFAULT 0,
    monto_total_diferencia DECIMAL(15,2) DEFAULT 0,
    notas TEXT,
    estado ENUM('borrador', 'finalizada', 'revisada') DEFAULT 'borrador',
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE RESTRICT,
    FOREIGN KEY (template_id) REFERENCES templates_conciliacion(id) ON DELETE RESTRICT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
    INDEX idx_restaurante (restaurante_id),
    INDEX idx_template (template_id),
    INDEX idx_usuario (usuario_id),
    INDEX idx_fecha (fecha_conciliacion),
    INDEX idx_estado (estado)
);

-- ============================================
-- TABLA: valores_esperados
-- ============================================
CREATE TABLE IF NOT EXISTS valores_esperados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    restaurante_id INT NOT NULL,
    fecha DATE NOT NULL,
    concepto VARCHAR(150) NOT NULL,
    valor DECIMAL(15,2) NOT NULL DEFAULT 0,
    fuente VARCHAR(50) DEFAULT 'manual',
    usuario_id INT NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    UNIQUE KEY uk_restaurante_fecha_concepto (restaurante_id, fecha, concepto),
    INDEX idx_restaurante_fecha (restaurante_id, fecha)
);

-- ============================================
-- TEMPLATE POR DEFECTO PARA CADA RESTAURANTE
-- ============================================
-- Solo inserta si el restaurante aun no tiene un template por defecto.
INSERT INTO templates_conciliacion (restaurante_id, nombre, descripcion, configuracion, es_default)
SELECT
    r.id,
    'Conciliacion diaria POS',
    'Template por defecto generado automaticamente',
    JSON_OBJECT(
        'conceptos', JSON_ARRAY(
            'sales_tax', 'gross_sales_pos', 'discounts', 'promo', 'donations',
            'net_sales', 'gc_sold', 'paid_out', 'paid_in', 'total_revenue'
        )
    ),
    TRUE
FROM restaurantes r
WHERE NOT EXISTS (
    SELECT 1 FROM templates_conciliacion t
    WHERE t.restaurante_id = r.id AND t.es_default = TRUE
);

-- ============================================
-- VERIFICACION
-- ============================================
-- SHOW TABLES LIKE '%concilia%';
-- SELECT * FROM templates_conciliacion;
-- ============================================
