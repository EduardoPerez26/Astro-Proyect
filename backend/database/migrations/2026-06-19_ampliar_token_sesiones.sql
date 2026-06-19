-- Amplia la columna para aceptar JWT actuales y futuros.
-- El indice existente usa solamente los primeros 100 caracteres,
-- por lo que puede conservarse sin cambios.

ALTER TABLE sesiones
    MODIFY COLUMN token VARCHAR(2048) NOT NULL;

