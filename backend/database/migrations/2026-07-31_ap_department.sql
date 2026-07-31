INSERT INTO departamentos (codigo, nombre, descripcion, modulos, pagina_inicio, activo)
VALUES (
    'ap',
    'Accounts Payable',
    'AP schedules, prepaid amortization, entities, requests, and documents.',
    JSON_OBJECT('accountsPayable', true, 'accountsPayableDocuments', true, 'historial', true),
    'accountsPayable',
    TRUE
)
ON DUPLICATE KEY UPDATE
    nombre = VALUES(nombre),
    descripcion = VALUES(descripcion),
    modulos = VALUES(modulos),
    pagina_inicio = VALUES(pagina_inicio),
    activo = VALUES(activo);
