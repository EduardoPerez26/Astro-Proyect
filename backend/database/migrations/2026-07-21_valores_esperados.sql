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
