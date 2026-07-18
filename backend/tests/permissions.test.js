const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeUserPermissions,
    hasPermission
} = require('../config/permissions');

test('admin receives corporate admin-only modules', () => {
    const permissions = normalizeUserPermissions({}, 'admin', { departmentCode: 'it' });
    assert.equal(hasPermission(permissions, 'reportCenter', 'ver'), true);
    assert.equal(hasPermission(permissions, 'auditCenter', 'ver'), true);
    assert.equal(hasPermission(permissions, 'systemCenter', 'editar'), true);
});

test('standard user cannot receive an admin-only permission', () => {
    const permissions = normalizeUserPermissions({
        acciones: {
            auditCenter: { ver: true, exportar: true }
        }
    }, 'usuario', { departmentCode: 'accounting' });

    assert.equal(hasPermission(permissions, 'auditCenter', 'ver'), false);
});
