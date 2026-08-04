-- ============================================================
-- Rename the AP department to "AP Food"
-- Updates the departamentos catalog row (codigo/nombre/descripcion/
-- modulos/pagina_inicio) and renames any per-user permisos JSON
-- keys that already referenced the old accountsPayable /
-- accountsPayableDocuments module names, so existing custom
-- overrides for AP-department users survive the rename.
-- Idempotent: safe to run more than once.
-- ============================================================

SET NAMES utf8mb4;

UPDATE departamentos
SET codigo = 'ap-food',
    nombre = 'AP Food',
    descripcion = 'AP Food schedules, prepaid amortization, entities, requests, and documents.',
    modulos = JSON_OBJECT('apFood', true, 'apFoodDocuments', true, 'historial', true),
    pagina_inicio = 'apFood'
WHERE codigo = 'ap';

-- Nested acciones.accountsPayable(Documents) permission blocks
UPDATE usuarios
SET permisos = JSON_REMOVE(
    JSON_SET(permisos, '$.acciones.apFood', JSON_EXTRACT(permisos, '$.acciones.accountsPayable')),
    '$.acciones.accountsPayable'
)
WHERE JSON_CONTAINS_PATH(permisos, 'one', '$.acciones.accountsPayable');

UPDATE usuarios
SET permisos = JSON_REMOVE(
    JSON_SET(permisos, '$.acciones.apFoodDocuments', JSON_EXTRACT(permisos, '$.acciones.accountsPayableDocuments')),
    '$.acciones.accountsPayableDocuments'
)
WHERE JSON_CONTAINS_PATH(permisos, 'one', '$.acciones.accountsPayableDocuments');

-- Legacy top-level boolean module flags1
UPDATE usuarios
SET permisos = JSON_REMOVE(
    JSON_SET(permisos, '$.apFood', JSON_EXTRACT(permisos, '$.accountsPayable')),
    '$.accountsPayable'
)
WHERE JSON_CONTAINS_PATH(permisos, 'one', '$.accountsPayable');

UPDATE usuarios
SET permisos = JSON_REMOVE(
    JSON_SET(permisos, '$.apFoodDocuments', JSON_EXTRACT(permisos, '$.accountsPayableDocuments')),
    '$.accountsPayableDocuments'
)
WHERE JSON_CONTAINS_PATH(permisos, 'one', '$.accountsPayableDocuments');

-- Stored landing-page preference
UPDATE usuarios
SET permisos = JSON_SET(permisos, '$.paginaInicio', 'apFood')
WHERE permisos->>'$.paginaInicio' = 'accountsPayable';
