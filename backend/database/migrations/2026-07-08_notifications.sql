-- Internal notification center.
-- Supports per-user notifications, read state, archive state, priority and action URL.

CREATE TABLE IF NOT EXISTS notificaciones (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id INT NOT NULL,
    creado_por INT NULL,
    tipo VARCHAR(40) NOT NULL DEFAULT 'system',
    titulo VARCHAR(160) NOT NULL,
    mensaje TEXT NOT NULL,
    url_accion VARCHAR(500) NULL,
    prioridad ENUM('low', 'normal', 'high') NOT NULL DEFAULT 'normal',
    leida BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_leida TIMESTAMP NULL DEFAULT NULL,
    archivada BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_archivada TIMESTAMP NULL DEFAULT NULL,
    metadata JSON NULL,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_notificaciones_usuario_estado (usuario_id, archivada, leida, fecha_creacion),
    KEY idx_notificaciones_tipo_fecha (tipo, fecha_creacion),
    KEY idx_notificaciones_creado_por (creado_por),
    CONSTRAINT fk_notificaciones_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_notificaciones_creado_por
        FOREIGN KEY (creado_por) REFERENCES usuarios(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
