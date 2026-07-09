(function () {
    const ACTIONS = ['ver', 'crear', 'editar', 'eliminar', 'exportar'];

    function getUser() {
        try {
            return JSON.parse(localStorage.getItem('usuario') || '{}');
        } catch {
            return {};
        }
    }

    function can(module, action = 'ver', user = getUser()) {
        if (user?.rol === 'superadmin') return true;

        const permissions = user?.permisos || {};
        const explicit = permissions.acciones?.[module]?.[action];

        if (typeof explicit === 'boolean') return explicit;

        // Backward compatibility while old JSON permissions are migrated.
        return permissions[module] === true;
    }

    function canAny(requirements = [], user = getUser()) {
        return requirements.some(requirement =>
            can(requirement.module, requirement.action, user)
        );
    }

    function isAdmin(user = getUser()) {
        return user?.rol === 'superadmin' || user?.rol === 'admin';
    }

    function apply(root = document) {
        root.querySelectorAll('[data-permission-module]').forEach(element => {
            const module = element.dataset.permissionModule;
            const action = element.dataset.permissionAction || 'ver';
            const allowed = can(module, action);

            element.hidden = !allowed;
            element.classList.toggle('permission-denied', !allowed);

            if ('disabled' in element) {
                element.disabled = !allowed;
            }
        });
    }

    window.AppPermissions = {
        ACTIONS,
        getUser,
        can,
        canAny,
        isAdmin,
        apply
    };

    document.addEventListener('DOMContentLoaded', () => apply());
})();
