const DEFAULT_DEPARTMENT_CODE = 'ar';

const DEPARTMENT_CATALOG = {
    ar: {
        codigo: 'ar',
        label: 'AR',
        nombre: 'Accounts Receivable',
        descripcion: 'Conciliaciones, documentos, tiendas e historial de AR.',
        paginaInicio: 'tiendas',
        modulos: ['tiendas', 'documentos', 'historial']
    },
    ap: {
        codigo: 'ap',
        label: 'AP',
        nombre: 'Accounts Payable',
        descripcion: 'Base preparada para futuros procesos de AP.',
        paginaInicio: 'documentos',
        modulos: ['documentos']
    },
    operations: {
        codigo: 'operations',
        label: 'OPS',
        nombre: 'Operations',
        descripcion: 'Base preparada para futuros procesos operativos.',
        paginaInicio: 'tiendas',
        modulos: ['tiendas', 'documentos']
    },
    hr: {
        codigo: 'hr',
        label: 'HR',
        nombre: 'Human Resources',
        descripcion: 'Base preparada para futuros procesos de recursos humanos.',
        paginaInicio: 'documentos',
        modulos: ['documentos']
    },
    it: {
        codigo: 'it',
        label: 'IT',
        nombre: 'Information Technology',
        descripcion: 'Base preparada para administracion tecnica y soporte.',
        paginaInicio: 'dashboardAdmin',
        modulos: ['dashboardAdmin', 'usuarios', 'permisos']
    }
};

function normalizeDepartmentCode(value) {
    const code = String(value || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return code || DEFAULT_DEPARTMENT_CODE;
}

function getDepartmentByCode(value) {
    const code = normalizeDepartmentCode(value);
    return DEPARTMENT_CATALOG[code] || null;
}

function deriveDepartmentLabel({ codigo, nombre }) {
    const value = String(nombre || codigo || DEFAULT_DEPARTMENT_CODE).trim();
    const words = value.match(/[A-Za-z0-9]+/g) || [];

    if (words.length >= 2) {
        return words
            .map(word => word[0])
            .join('')
            .slice(0, 4)
            .toUpperCase();
    }

    return value.slice(0, 4).toUpperCase();
}

function buildDepartmentContext(source = {}) {
    const explicitCode =
        source.departamento_codigo ||
        source.departmentCode ||
        source.department?.codigo ||
        source.codigo;
    const normalizedCode = normalizeDepartmentCode(explicitCode);
    const fallbackBase = DEPARTMENT_CATALOG[DEFAULT_DEPARTMENT_CODE];
    const base = getDepartmentByCode(explicitCode) || {
        codigo: normalizedCode,
        label: deriveDepartmentLabel({
            codigo: normalizedCode,
            nombre:
                source.departamento_nombre ||
                source.departmentName ||
                source.department?.nombre ||
                source.nombre
        }),
        nombre:
            source.departamento_nombre ||
            source.departmentName ||
            source.department?.nombre ||
            source.nombre ||
            normalizedCode.toUpperCase(),
        descripcion: 'Departamento configurado desde la base de datos.',
        paginaInicio: fallbackBase.paginaInicio,
        modulos: [...fallbackBase.modulos]
    };
    const activeValue =
        source.departamento_activo ??
        source.departmentActive ??
        source.department?.activo ??
        source.activo ??
        true;
    const id =
        source.departamento_id ??
        source.departmentId ??
        source.department?.id ??
        null;

    return {
        id: id ? Number(id) : null,
        codigo: base.codigo,
        label: base.label,
        nombre:
            source.departamento_nombre ||
            source.departmentName ||
            source.department?.nombre ||
            (source.codigo ? source.nombre : null) ||
            base.nombre,
        descripcion: base.descripcion,
        paginaInicio: base.paginaInicio,
        modulos: [...base.modulos],
        activo: activeValue !== 0 && activeValue !== false
    };
}

module.exports = {
    DEFAULT_DEPARTMENT_CODE,
    DEPARTMENT_CATALOG,
    normalizeDepartmentCode,
    getDepartmentByCode,
    buildDepartmentContext
};
