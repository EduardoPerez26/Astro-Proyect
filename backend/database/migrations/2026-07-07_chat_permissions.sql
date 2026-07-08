-- ============================================================
-- Chat permissions and storage
-- Creates the chat tables used by /api/chat and keeps admin
-- permission JSON aligned with the application permission model.
-- ============================================================

SET NAMES utf8mb4;

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

UPDATE usuarios
SET permisos = JSON_SET(
    COALESCE(permisos, JSON_OBJECT()),
    '$.chat',
    TRUE
)
WHERE rol = 'admin';
