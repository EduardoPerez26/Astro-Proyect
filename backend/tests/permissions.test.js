const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeUserPermissions,
    hasPermission
} = require('../config/permissions');

test('admin receives corporate governance modules', () => {
    const permissions = normalizeUserPermissions({}, 'admin', { departmentCode: 'it' });
    assert.equal(hasPermission(permissions, 'closeCenter', 'ver'), true);
    assert.equal(hasPermission(permissions, 'exceptionCenter', 'editar'), true);
    assert.equal(hasPermission(permissions, 'auditCenter', 'ver'), true);
    assert.equal(hasPermission(permissions, 'governanceSettings', 'editar'), true);
});

test('standard user cannot receive an admin-only governance permission', () => {
    const permissions = normalizeUserPermissions({
        acciones: {
            auditCenter: { ver: true, exportar: true }
        }
    }, 'usuario', { departmentCode: 'accounting' });

    assert.equal(hasPermission(permissions, 'auditCenter', 'ver'), false);
});
