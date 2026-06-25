(function () {
    const DEFAULT_DEPARTMENT = {
        codigo: 'ar',
        label: 'AR',
        nombre: 'Accounts Receivable',
        descripcion: 'Conciliaciones, documentos, tiendas e historial de AR.'
    };

    function readUser() {
        try {
            return JSON.parse(localStorage.getItem('usuario') || '{}');
        } catch {
            return {};
        }
    }

    function normalizeDepartment(rawDepartment) {
        const department = rawDepartment || {};
        const rawName = String(department.nombre || '').trim();
        const rawCode = String(department.codigo || '').trim().toLowerCase();
        const defaultNames = ['ar', 'accounts receivable'];
        const codeLooksLikeFallback =
            rawCode === DEFAULT_DEPARTMENT.codigo &&
            rawName &&
            !defaultNames.includes(rawName.toLowerCase());
        const codigoSource = codeLooksLikeFallback
            ? rawName
            : (department.codigo || rawName || DEFAULT_DEPARTMENT.codigo);
        const codigo = String(codigoSource)
            .trim()
            .toLowerCase();
        const inferredLabel = String(department.label || rawName || codigo || DEFAULT_DEPARTMENT.label)
            .trim()
            .slice(0, 4)
            .toUpperCase();

        return {
            ...DEFAULT_DEPARTMENT,
            ...department,
            codigo: codigo || DEFAULT_DEPARTMENT.codigo,
            label: inferredLabel || DEFAULT_DEPARTMENT.label,
            nombre: department.nombre || DEFAULT_DEPARTMENT.nombre
        };
    }

    function getCurrentDepartment() {
        const user = readUser();
        return normalizeDepartment(user.departamento);
    }

    function applyDepartmentContext() {
        const department = getCurrentDepartment();

        document.documentElement.dataset.department = department.codigo;
        document.body.dataset.department = department.codigo;

        document.querySelectorAll('[data-department-label]').forEach(node => {
            node.textContent = department.label;
        });
        document.querySelectorAll('[data-department-name]').forEach(node => {
            node.textContent = department.nombre;
        });
        document.querySelectorAll('[data-department-description]').forEach(node => {
            node.textContent = department.descripcion || DEFAULT_DEPARTMENT.descripcion;
        });
        document.querySelectorAll('[data-department-only]').forEach(node => {
            const allowed = String(node.dataset.departmentOnly || '')
                .split(',')
                .map(value => value.trim().toLowerCase())
                .filter(Boolean);
            node.hidden = allowed.length > 0 && !allowed.includes(department.codigo);
        });

        return department;
    }

    window.AppDepartment = {
        getCurrent: getCurrentDepartment,
        refresh: applyDepartmentContext
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyDepartmentContext);
    } else {
        applyDepartmentContext();
    }
})();
