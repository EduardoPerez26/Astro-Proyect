const PERMISSION_ACTIONS = ['ver', 'crear', 'editar', 'eliminar', 'exportar'];

const MODULE_ACTIONS = {
    dashboardAdmin: ['ver', 'editar', 'exportar'],
    systemCenter: ['ver', 'editar', 'exportar'],
    approvalCenter: ['ver', 'crear', 'editar', 'exportar'],
    reportCenter: ['ver', 'crear', 'editar', 'exportar'],
    auditCenter: ['ver', 'exportar'],
    governanceSettings: ['ver', 'editar', 'exportar'],
    systemErrors: ['ver', 'crear', 'editar', 'exportar'],
    tiendas: [...PERMISSION_ACTIONS],
    documentos: [...PERMISSION_ACTIONS],
    historial: ['ver', 'eliminar', 'exportar'],
    propertyManagement: [...PERMISSION_ACTIONS],
    propertyManagementDocuments: [...PERMISSION_ACTIONS],
    usuarios: [...PERMISSION_ACTIONS],
    controlRestaurants: ['ver', 'crear', 'editar', 'eliminar'],
    permisos: ['ver', 'editar'],
    perfil: ['ver', 'editar'],
    chat: ['ver', 'crear', 'editar', 'eliminar', 'exportar']
};

const ADMIN_MODULES = new Set([
    'dashboardAdmin',
    'systemCenter',
    'systemErrors',
    'auditCenter',
    'governanceSettings',
    'usuarios',
    'controlRestaurants',
    'permisos'
]);

const MODULE_ROLE_LIMITS = {
    approvalCenter: new Set(['admin', 'supervisor']),
    reportCenter: new Set(['admin', 'supervisor'])
};

const START_MODULES = [
    'dashboardAdmin',
    'systemCenter',
    'approvalCenter',
    'reportCenter',
    'auditCenter',
    'governanceSettings',
    'systemErrors',
    'tiendas',
    'documentos',
    'historial',
    'propertyManagement',
    'propertyManagementDocuments',
    'chat'
];

const ROLE_DEFAULT_MODULES = {
    admin: {
        dashboardAdmin: true,
        systemCenter: true,
        systemErrors: true,
        approvalCenter: true,
        reportCenter: true,
        auditCenter: true,
        governanceSettings: true,
        usuarios: true,
        controlRestaurants: true,
        permisos: true,
        perfil: true
    },
    supervisor: {
        approvalCenter: true,
        reportCenter: true,
        tiendas: true,
        documentos: true,
        historial: true,
        perfil: true
    },
    usuario: {
        tiendas: true,
        documentos: true,
        perfil: true
    }
};

function parsePermissions(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;

    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}

function actionSet(module, enabled = false) {
    return Object.fromEntries(
        (MODULE_ACTIONS[module] || PERMISSION_ACTIONS)
            .map(action => [action, Boolean(enabled)])
    );
}

function fullPermissions(page = 'dashboardAdmin') {
    const acciones = Object.fromEntries(
        Object.keys(MODULE_ACTIONS).map(module => [
            module,
            actionSet(module, true)
        ])
    );
    const permissions = {
        acciones,
        paginaInicio: page
    };

    Object.keys(MODULE_ACTIONS).forEach(module => {
        permissions[module] = true;
    });

    return permissions;
}

function defaultModuleEnabled(role, module, departmentCode) {
    if (ROLE_DEFAULT_MODULES[role]?.[module]) return true;

    if (
        ['property-management', 'pm'].includes(String(departmentCode || '').toLowerCase()) &&
        ['propertyManagement', 'propertyManagementDocuments'].includes(module)
    ) {
        return true;
    }

    return false;
}

function normalizeUserPermissions(value, role = 'usuario', options = {}) {
    const permissions = parsePermissions(value);
    const normalizedRole = String(role || 'usuario').toLowerCase();

    if (normalizedRole === 'superadmin') {
        const requestedPage = START_MODULES.includes(permissions.paginaInicio)
            ? permissions.paginaInicio
            : 'dashboardAdmin';
        return fullPermissions(requestedPage);
    }

    const acciones = {};
    const result = { acciones };

    Object.keys(MODULE_ACTIONS).forEach(module => {
        const roleLimit = MODULE_ROLE_LIMITS[module];
        const roleCanUseModule =
            roleLimit
                ? roleLimit.has(normalizedRole)
                : (!ADMIN_MODULES.has(module) || normalizedRole === 'admin');
        const explicitActions = permissions.acciones?.[module];
        const hasExplicitActions =
            explicitActions &&
            typeof explicitActions === 'object' &&
            !Array.isArray(explicitActions);
        const hasLegacyPermission =
            typeof permissions[module] === 'boolean';
        const fallbackEnabled = defaultModuleEnabled(
            normalizedRole,
            module,
            options.departmentCode
        );
        const legacyEnabled = hasLegacyPermission
            ? permissions[module]
            : fallbackEnabled;

        acciones[module] = Object.fromEntries(
            MODULE_ACTIONS[module].map(action => {
                const enabled = hasExplicitActions &&
                    typeof explicitActions[action] === 'boolean'
                    ? explicitActions[action]
                    : legacyEnabled;

                return [action, roleCanUseModule && Boolean(enabled)];
            })
        );

        if (module === 'perfil') {
            acciones[module].ver = true;
            acciones[module].editar = true;
        }

        result[module] = Boolean(acciones[module].ver);
    });

    const availablePages = START_MODULES.filter(module => result[module]);
    result.paginaInicio = availablePages.includes(permissions.paginaInicio)
        ? permissions.paginaInicio
        : availablePages[0] || null;

    return result;
}

function hasPermission(permissions, module, action = 'ver') {
    if (!MODULE_ACTIONS[module]?.includes(action)) return false;
    return permissions?.acciones?.[module]?.[action] === true;
}

function isSuperAdmin(userOrRole) {
    const role = typeof userOrRole === 'string'
        ? userOrRole
        : userOrRole?.rol;
    return role === 'superadmin';
}

function isAdminRole(userOrRole) {
    const role = typeof userOrRole === 'string'
        ? userOrRole
        : userOrRole?.rol;
    return role === 'superadmin' || role === 'admin';
}

module.exports = {
    PERMISSION_ACTIONS,
    MODULE_ACTIONS,
    ADMIN_MODULES,
    MODULE_ROLE_LIMITS,
    START_MODULES,
    fullPermissions,
    normalizeUserPermissions,
    hasPermission,
    isSuperAdmin,
    isAdminRole
};
