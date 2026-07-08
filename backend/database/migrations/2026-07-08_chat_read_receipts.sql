-- Adds a timestamp for chat read receipts.
-- The last-read message id already exists; this column records when it was updated.

ALTER TABLE chat_conversaciones_usuarios
    ADD COLUMN ultimo_mensaje_leido_at TIMESTAMP NULL DEFAULT NULL
    AFTER ultimo_mensaje_leido_id;
