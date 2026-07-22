CREATE TABLE IF NOT EXISTS store_tax_catalog (
    id INT NOT NULL AUTO_INCREMENT,
    restaurante_id INT NOT NULL,
    store_number VARCHAR(20) NOT NULL,
    address VARCHAR(255) NULL,
    city VARCHAR(120) NULL,
    state VARCHAR(2) NULL,
    zip VARCHAR(20) NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    preferred_jurisdiction VARCHAR(120) NULL,
    tax_rate DECIMAL(8,6) NOT NULL DEFAULT 0,
    usuario_id INT NULL,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_store_tax_catalog_restaurante_store (restaurante_id, store_number),
    KEY idx_store_tax_catalog_usuario (usuario_id),
    CONSTRAINT fk_store_tax_catalog_restaurante
        FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_store_tax_catalog_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
