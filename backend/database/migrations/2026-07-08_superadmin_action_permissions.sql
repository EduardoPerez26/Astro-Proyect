-- Separates the unrestricted super administrator from limited administrators.
-- Existing administrators are promoted so no current system owner loses access.
-- Action permissions are stored inside usuarios.permisos.acciones and legacy
-- section booleans remain compatible until each account is saved again.

ALTER TABLE usuarios
    MODIFY COLUMN rol
    ENUM('superadmin', 'admin', 'supervisor', 'usuario')
    NOT NULL DEFAULT 'usuario';

UPDATE usuarios
SET rol = 'superadmin'
WHERE rol = 'admin';
