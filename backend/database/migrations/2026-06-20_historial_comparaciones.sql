-- Historial de comparaciones por restaurante, tienda y fecha operativa.
-- Ejecutar una sola vez en la base de datos de Railway.

CREATE TABLE IF NOT EXISTS comparaciones_archivos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    restaurante_id INT NOT NULL,
    usuario_id INT NULL,
    archivo_referencia_id INT NULL,
    conciliacion_id INT NULL,
    fecha_operacion DATE NOT NULL,
    estado ENUM(
        'primera_carga',
        'sin_cambios',
        'con_cambios',
        'referencia_incompatible'
    ) NOT NULL,
    tiendas_comparadas INT UNSIGNED NOT NULL DEFAULT 0,
    tiendas_con_diferencias INT UNSIGNED NOT NULL DEFAULT 0,
    total_diferencias INT UNSIGNED NOT NULL DEFAULT 0,
    monto_diferencia_absoluta DECIMAL(18,2) NOT NULL DEFAULT 0,
    huella_datos CHAR(64) NULL,
    resumen JSON NULL,
    fecha_comparacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_comparacion_restaurante
        FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_comparacion_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_comparacion_archivo
        FOREIGN KEY (archivo_referencia_id) REFERENCES archivos_excel(id)
        ON DELETE SET NULL,

    INDEX idx_comparacion_fecha (fecha_comparacion),
    INDEX idx_comparacion_operacion (fecha_operacion),
    INDEX idx_comparacion_restaurante (restaurante_id),
    INDEX idx_comparacion_estado (estado),
    INDEX idx_comparacion_conciliacion (conciliacion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comparacion_diferencias (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    comparacion_id BIGINT UNSIGNED NOT NULL,
    tienda VARCHAR(50) NOT NULL,
    fecha_operacion DATE NOT NULL,
    tipo ENUM('montos_diferentes', 'tienda_nueva', 'tienda_eliminada') NOT NULL,
    campo VARCHAR(100) NULL,
    valor_anterior DECIMAL(18,2) NULL,
    valor_nuevo DECIMAL(18,2) NULL,
    diferencia DECIMAL(18,2) NULL,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_diferencia_comparacion
        FOREIGN KEY (comparacion_id) REFERENCES comparaciones_archivos(id)
        ON DELETE CASCADE,

    INDEX idx_diferencia_comparacion (comparacion_id),
    INDEX idx_diferencia_tienda (tienda),
    INDEX idx_diferencia_fecha (fecha_operacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
