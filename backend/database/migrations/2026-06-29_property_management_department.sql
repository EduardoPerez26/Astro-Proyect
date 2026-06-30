INSERT INTO departamentos (codigo, nombre, descripcion, modulos, pagina_inicio, activo)
VALUES (
    'property-management',
    'Property Management',
    'Property procedures, requests, approvals, and follow-up.',
    JSON_OBJECT('propertyManagement', true, 'propertyManagementDocuments', true, 'historial', true),
    'propertyManagement',
    TRUE
)
ON DUPLICATE KEY UPDATE
    nombre = VALUES(nombre),
    descripcion = VALUES(descripcion),
    modulos = VALUES(modulos),
    pagina_inicio = VALUES(pagina_inicio),
    activo = VALUES(activo);
