SET NAMES utf8mb4;

-- Internal team chat was removed from the product; these tables are no
-- longer read or written by the application.
DROP TABLE IF EXISTS chat_typing_status;
DROP TABLE IF EXISTS chat_mensajes;
DROP TABLE IF EXISTS chat_conversaciones_usuarios;
DROP TABLE IF EXISTS chat_conversaciones;
