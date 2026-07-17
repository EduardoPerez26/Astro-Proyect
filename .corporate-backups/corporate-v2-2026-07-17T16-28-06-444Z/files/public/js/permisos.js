// ============================================
// PERMISSION SETTINGS
// ============================================

let currentUserId = null;
let currentUser = null;
let originalPermissions = {};
let viewerUser = null;
let permissionFilterState = {
    search: '',
    group: '',
    status: ''
};

const ACTION_LABELS = {
    ver: 'View',
    crear: 'Create',
    editar: 'Edit',
    eliminar: 'Delete',
    exportar: 'Export'
};

const MODULE_ACTIONS = {
    dashboardAdmin: ['ver', 'editar', 'exportar'],
    systemCenter: ['ver', 'editar', 'exportar'],
    approvalCenter: ['ver', 'crear', 'editar', 'exportar'],
    systemErrors: ['ver', 'crear', 'editar', 'exportar'],
    tiendas: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
    documentos: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
    historial: ['ver', 'eliminar', 'exportar'],
    propertyManagement: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
    propertyManagementDocuments: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
    usuarios: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
    controlRestaurants: ['ver', 'crear', 'editar', 'eliminar'],
    permisos: ['ver', 'editar'],
    perfil: ['ver', 'editar'],
    chat: ['ver', 'crear', 'editar', 'eliminar', 'exportar']
};

const MODULE_ROLE_LIMITS = {
    approvalCenter: ['supervisor']
};

function targetRoleCanUseModule(section, user = currentUser) {
    if (!section || !user) return true;
    if (user.rol === 'superadmin') return true;

    const allowedRoles = section.allowedRoles || MODULE_ROLE_LIMITS[section.id];
    if (Array.isArray(allowedRoles) && allowedRoles.length) {
        return allowedRoles.includes(user.rol);
    }

    if (section.administrative) {
        return ['superadmin', 'admin'].includes(user.rol);
    }

    return true;
}

// System sections shown in the permission editor.
const MENU_SECTIONS = [
    {
        id: 'dashboardAdmin',
        name: 'Admin dashboard',
        description: 'Sessions, movements, and overall system activity',
        icon: 'fa-chart-line',
        iconClass: 'dashboard',
        department: 'Information Technology',
        path: '/views/dashboard-admin',
        required: true,
        administrative: true,
        initialOption: true
    },
    {
        id: 'systemErrors',
        name: 'System errors',
        description: 'Backend error monitoring and incident resolution',
        icon: 'fa-bug',
        iconClass: 'system-errors',
        department: 'Information Technology',
        path: '/views/system-errors',
        required: false,
        administrative: true
    },
    {
        id: 'systemCenter',
        name: 'System center',
        description: 'Platform readiness, integrations, incidents, and access load',
        icon: 'fa-tower-broadcast',
        iconClass: 'system-center',
        department: 'Information Technology',
        path: '/views/system-center',
        required: false,
        administrative: true,
        initialOption: true
    },
    {
        id: 'approvalCenter',
        name: 'Approval center',
        description: 'Corporate approval queue for documents, prepaids, schedules, and decisions',
        icon: 'fa-clipboard-check',
        iconClass: 'approval-center',
        department: 'Information Technology',
        path: '/views/approval-center',
        required: false,
        allowedRoles: ['supervisor'],
        initialOption: true
    },
    {
        id: 'tiendas',
        name: 'Stores',
        description: 'Restaurant and branch operations',
        icon: 'fa-shop',
        iconClass: 'tiendas',
        department: 'Accounts Receivable',
        path: '/views/tiendas',
        required: false,
        initialOption: true
    },
    {
        id: 'documentos',
        name: 'Documents',
        description: 'Excel files and validation records',
        icon: 'fa-file-excel',
        iconClass: 'documentos',
        department: 'Accounts Receivable',
        path: '/views/documentos',
        required: false,
        initialOption: true
    },
    {
        id: 'perfil',
        name: 'Profile',
        description: 'Personal account settings',
        icon: 'fa-user',
        iconClass: 'perfil',
        department: 'Account',
        path: '/views/perfil',
        required: true // Siempre visible
    },
    {
        id: 'permisos',
        name: 'Permissions',
        description: 'Access settings',
        icon: 'fa-key',
        iconClass: 'permisos',
        department: 'Information Technology',
        path: '/views/permisos',
        required: false,
        administrative: true
    },
    {
        id: 'historial',
        name: 'History',
        description: 'Activity and change log',
        icon: 'fa-clock-rotate-left',
        iconClass: 'historial',
        department: 'Accounts Receivable',
        path: '/views/historial',
        required: false,
        initialOption: true
    },
    {
        id: 'propertyManagement',
        name: 'Property schedules',
        description: 'Sales tax payable schedule builder and saved schedules',
        icon: 'fa-building-user',
        iconClass: 'property-management',
        department: 'Property Management',
        path: '/views/departments/dashboard-property',
        required: false,
        initialOption: true
    },
    {
        id: 'propertyManagementDocuments',
        name: 'Property documents',
        description: 'Saved Property Management schedules and source files',
        icon: 'fa-folder-tree',
        iconClass: 'property-management-documents',
        department: 'Property Management',
        path: '/views/departments/property-management-documents',
        required: false,
        initialOption: true
    },
    {
        id: 'usuarios',
        name: 'Users',
        description: 'User administration',
        icon: 'fa-users',
        iconClass: 'usuarios',
        department: 'Information Technology',
        path: '/views/usuarios',
        required: false,
        administrative: true
    },
    {
        id: 'controlRestaurants',
        name: 'Restaurant control',
        description: 'Operational availability for maintenance or outages',
        icon: 'fa-screwdriver-wrench',
        iconClass: 'restaurantes',
        department: 'Information Technology',
        path: '/views/restaurantes',
        required: true,
        administrative: true
    },
    {
        id: 'chat',
        name: 'Chat',
        description: 'Internal user messaging',
        icon: 'fa-comments',
        iconClass: 'chat',
        department: 'Information Technology',
        path: '/views/chat',
        required: false,
        initialOption: true
    }
];

const MENU_GROUP_ORDER = [
    'Accounts Receivable',
    'Property Management',
    'Information Technology',
    'Account'
];

const PERMISSION_TEMPLATES = {
    supervisor: {
        label: 'Supervisor review',
        startup: 'approvalCenter',
        modules: {
            approvalCenter: ['ver', 'crear', 'editar', 'exportar'],
            tiendas: ['ver', 'exportar'],
            documentos: ['ver', 'editar', 'exportar'],
            historial: ['ver', 'exportar'],
            propertyManagementDocuments: ['ver', 'exportar'],
            perfil: ['ver', 'editar'],
            chat: ['ver', 'crear']
        }
    },
    arOperator: {
        label: 'AR operator',
        startup: 'tiendas',
        modules: {
            tiendas: ['ver', 'crear', 'editar', 'exportar'],
            documentos: ['ver', 'crear', 'editar', 'exportar'],
            historial: ['ver', 'exportar'],
            perfil: ['ver', 'editar'],
            chat: ['ver', 'crear']
        }
    },
    propertyManagement: {
        label: 'Property management',
        startup: 'propertyManagement',
        modules: {
            propertyManagement: ['ver', 'crear', 'editar', 'exportar'],
            propertyManagementDocuments: ['ver', 'crear', 'editar', 'exportar'],
            historial: ['ver', 'exportar'],
            perfil: ['ver', 'editar'],
            chat: ['ver', 'crear']
        }
    },
    itAdmin: {
        label: 'IT administration',
        startup: 'systemCenter',
        modules: {
            dashboardAdmin: ['ver', 'editar', 'exportar'],
            systemCenter: ['ver', 'editar', 'exportar'],
            systemErrors: ['ver', 'crear', 'editar', 'exportar'],
            usuarios: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
            controlRestaurants: ['ver', 'crear', 'editar', 'eliminar'],
            permisos: ['ver', 'editar'],
            perfil: ['ver', 'editar'],
            chat: ['ver', 'crear', 'editar']
        }
    },
    readOnly: {
        label: 'Read only',
        startup: 'documentos',
        modules: {
            tiendas: ['ver'],
            documentos: ['ver'],
            historial: ['ver'],
            propertyManagementDocuments: ['ver'],
            perfil: ['ver']
        }
    }
};

function normalizeLegacyPermissions(permisos = {}) {
    const normalized = {
        ...permisos,
        acciones: { ...(permisos.acciones || {}) }
    };

    if (
        normalized.propertyManagement === true &&
        normalized.propertyManagementDocuments === undefined
    ) {
        normalized.propertyManagementDocuments = true;
    }

    MENU_SECTIONS.forEach(section => {
        const actions = MODULE_ACTIONS[section.id] || ['ver'];
        const existing = normalized.acciones[section.id] || {};
        const legacyEnabled = normalized[section.id] === true;
        const targetCanUseSection = targetRoleCanUseModule(section);

        normalized.acciones[section.id] = Object.fromEntries(
            actions.map(action => [
                action,
                targetCanUseSection && typeof existing[action] === 'boolean'
                    ? existing[action]
                    : targetCanUseSection && legacyEnabled
            ])
        );
        normalized[section.id] =
            normalized.acciones[section.id].ver === true;
    });

    return normalized;
}

// Initialize
document.addEventListener('DOMContentLoaded', function () {
    viewerUser = window.AppPermissions?.getUser() || {};
    // Read userId from the URL.
    const urlParams = new URLSearchParams(window.location.search);
    currentUserId = urlParams.get('userId');

    if (!currentUserId) {
        Swal.fire({
            icon: 'error',
            title: 'User not specified',
            text: 'No user was specified for configuration.',
        }).then(() => {
            window.location.href = '/views/usuarios';
        });
        return;
    }

    loadUserData();
});

// ============================================
// LOAD USER DATA
// ============================================

async function loadUserData() {
    const token = localStorage.getItem('token');

    // Offline mode sample data
    if (!token || window.isOfflineMode?.() === true) {
        const users = [
            { id: 1, nombre: 'Super administrator', email: 'admin@empresa.com', username: 'admin', rol: 'superadmin' },
            { id: 2, nombre: 'Juan Perez', email: 'juan@empresa.com', username: 'jperez', rol: 'supervisor' },
            { id: 3, nombre: 'Maria Garcia', email: 'maria@empresa.com', username: 'mgarcia', rol: 'usuario' },
            { id: 4, nombre: 'Carlos Lopez', email: 'carlos@empresa.com', username: 'clopez', rol: 'usuario' }
        ];

        currentUser = users.find(u => u.id === parseInt(currentUserId));

        if (!currentUser) {
            Swal.fire({
                icon: 'error',
                title: 'User not found',
            }).then(() => {
                window.location.href = '/views/usuarios';
            });
            return;
        }

        // Sample permissions
        const defaultPermissions = {
            1: { dashboardAdmin: true, systemCenter: true, approvalCenter: true, systemErrors: true, tiendas: true, documentos: true, perfil: true, permisos: true, historial: true, usuarios: true, controlRestaurants: true, propertyManagement: true, propertyManagementDocuments: true, chat: true, paginaInicio: 'dashboardAdmin' },
            2: { approvalCenter: true, tiendas: true, documentos: true, perfil: true, permisos: false, historial: true, usuarios: false, controlRestaurants: false, propertyManagement: false, propertyManagementDocuments: false, chat: false, paginaInicio: 'approvalCenter' },
            3: { tiendas: true, documentos: true, perfil: true, permisos: false, historial: false, usuarios: false, controlRestaurants: false, propertyManagement: false, propertyManagementDocuments: false, chat: false, paginaInicio: 'tiendas' },
            4: { tiendas: true, documentos: false, perfil: true, permisos: false, historial: false, usuarios: false, controlRestaurants: false, propertyManagement: true, propertyManagementDocuments: true, chat: false, paginaInicio: 'propertyManagement' }
        };

        currentUser.permisos = normalizeLegacyPermissions(defaultPermissions[currentUser.id] || {});
        originalPermissions = JSON.parse(JSON.stringify(currentUser.permisos));

        renderUserInfo();
        renderPermissions();
        return;
    }

    try {
        const response = await fetch(`${window.API_URL}/usuarios/${currentUserId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.usuario || data;

            // Ensure permissions are an object.
            if (typeof currentUser.permisos === 'string') {
                try {
                    currentUser.permisos = JSON.parse(currentUser.permisos);
                } catch {
                    currentUser.permisos = {};
                }
            }
            currentUser.permisos = normalizeLegacyPermissions(currentUser.permisos || {});
            originalPermissions = JSON.parse(JSON.stringify(currentUser.permisos));

            renderUserInfo();
            renderPermissions();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || errorData.mensaje || 'User could not be loaded');
        }
    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'User information could not be loaded.',
        }).then(() => {
            window.location.href = '/views/usuarios';
        });
    }
}

// ============================================
// RENDER USER INFO
// ============================================

function renderUserInfo() {
    if (!currentUser) return;

    const avatarEl = document.getElementById('userAvatar');
    const nameEl = document.getElementById('permUserName');
    const emailEl = document.getElementById('permUserEmail');
    const roleEl = document.getElementById('permUserRole');

    if (avatarEl) avatarEl.textContent = getInitials(currentUser.nombre || '');
    if (nameEl) nameEl.textContent = currentUser.nombre || 'No name';
    if (emailEl) emailEl.textContent = currentUser.email || '';

    if (roleEl) {
        roleEl.textContent = getRoleLabel(currentUser.rol);
        roleEl.className = `status-badge ${currentUser.rol || 'usuario'}`;
    }
}

// ============================================
// RENDER PERMISSIONS
// ============================================

function renderPermissions() {
    const container = document.getElementById('permissionsList');
    const viewerCanEdit =
        window.AppPermissions?.can('permisos', 'editar', viewerUser) === true;
    const targetIsPrivileged =
        ['superadmin', 'admin'].includes(currentUser.rol);
    const viewerCanManageTarget =
        viewerCanEdit &&
        (
            viewerUser.rol === 'superadmin' ||
            !targetIsPrivileged
        );

    const renderCard = (section) => {
        const isRequired = section.required;
        const isAdministrative = section.administrative;
        const targetCanUseSection = targetRoleCanUseModule(section);
        const actions = MODULE_ACTIONS[section.id] || ['ver'];
        const isLocked =
            currentUser.rol === 'superadmin' ||
            !viewerCanManageTarget ||
            !targetCanUseSection;
        const tags = [
            isRequired ? 'Required' : '',
            isAdministrative ? 'Administrative' : '',
            section.allowedRoles?.includes('supervisor') ? 'Supervisor only' : '',
            currentUser.rol === 'superadmin' ? 'Full access' : ''
        ].filter(Boolean);

        const enabledActions = actions.filter(action =>
            currentUser.rol === 'superadmin' ||
            currentUser.permisos.acciones?.[section.id]?.[action] === true ||
            (
                section.id === 'perfil' &&
                ['ver', 'editar'].includes(action)
            )
        ).length;

        return `
            <div
                class="access-policy-card"
                data-permission-id="${section.id}"
                data-permission-name="${section.name.toLowerCase()}"
                data-permission-description="${section.description.toLowerCase()}"
                data-access-policy-group="${section.department}"
                data-permission-enabled="${enabledActions > 0}"
                data-permission-locked="${isLocked}"
            >
                <div class="access-policy-info">
                    <div class="access-policy-icon">
                        <i class="fa-solid ${section.icon}"></i>
                    </div>
                    <div class="access-policy-details">
                        <h4>${section.name}</h4>
                        <p>${section.description}</p>
                        ${tags.length ? `
                            <div class="access-policy-tags">
                                ${tags.map(tag => `<span>${tag}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="access-policy-actions" aria-label="${section.name} permissions">
                    ${actions.map(action => {
                        const requiredAction =
                            section.id === 'perfil' &&
                            ['ver', 'editar'].includes(action);
                        const checked =
                            targetCanUseSection && (
                                currentUser.rol === 'superadmin' ||
                                currentUser.permisos.acciones?.[section.id]?.[action] === true ||
                                requiredAction
                            );
                        const disabled = isLocked || requiredAction;

                        return `
                            <label class="access-policy-action">
                                <input
                                    type="checkbox"
                                    id="perm_${section.id}_${action}"
                                    data-section="${section.id}"
                                    data-action="${action}"
                                    ${checked ? 'checked' : ''}
                                    ${disabled ? 'disabled' : ''}
                                    onchange="toggleActionPermission('${section.id}', '${action}', this.checked)">
                                <span>${ACTION_LABELS[action] || action}</span>
                            </label>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    };

    container.innerHTML = MENU_GROUP_ORDER.map(groupName => {
        const sections = MENU_SECTIONS.filter(section => section.department === groupName);

        if (!sections.length) return '';

        return `
            <section class="access-policy-group" data-access-policy-group="${groupName}">
                <div class="access-policy-group-header">
                    <div>
                        <i class="fa-solid fa-layer-group"></i>
                        <span>${groupName}</span>
                    </div>
                    <strong>${sections.length}</strong>
                </div>
                <div class="access-policy-group-grid">
                    ${sections.map(renderCard).join('')}
                </div>
            </section>
        `;
    }).join('');

    renderInitialWindow();
    updatePermissionOverview();
    applyPermissionFilters();
    updatePermissionChangeState();

    const saveButton = document.querySelector('[onclick="savePermissions()"]');
    if (saveButton) {
        saveButton.disabled = !viewerCanManageTarget || currentUser.rol === 'superadmin';
        saveButton.title = saveButton.disabled
            ? 'These permissions are managed by the super administrator policy'
            : '';
    }
}

function getEnabledInitialSections() {
    return MENU_SECTIONS.filter(section =>
        section.initialOption &&
        currentUser.permisos.acciones?.[section.id]?.ver === true
    );
}

function renderInitialWindow() {
    const select = document.getElementById('initialWindow');
    if (!select || !currentUser) return;
    const enabled = getEnabledInitialSections();
    const current = currentUser.permisos.paginaInicio;

    select.innerHTML = enabled.length
        ? enabled.map(section => `
            <option value="${section.id}">${section.name}</option>
        `).join('')
        : '<option value="">No enabled windows</option>';
    select.disabled = enabled.length === 0;
    currentUser.permisos.paginaInicio = enabled.some(section => section.id === current)
        ? current
        : enabled[0]?.id || null;
    select.value = currentUser.permisos.paginaInicio || '';

    const summary =
        document.getElementById('initialWindowSummary');
    const selectedSection = MENU_SECTIONS.find(
        section =>
            section.id === currentUser.permisos.paginaInicio
    );

    if (summary) {
        summary.textContent =
            selectedSection?.name || 'Not selected';
    }
}

function changeInitialWindow(value) {
    if (!currentUser) return;
    currentUser.permisos.paginaInicio = value || null;
    renderInitialWindow();
    updatePermissionChangeState();
}

// ============================================
// TOGGLE PERMISSION
// ============================================

function toggleActionPermission(sectionId, action, enabled) {
    if (!currentUser) return;

    currentUser.permisos.acciones ||= {};
    currentUser.permisos.acciones[sectionId] ||= {};
    currentUser.permisos.acciones[sectionId][action] = enabled;

    if (action === 'ver' && !enabled) {
        Object.keys(currentUser.permisos.acciones[sectionId])
            .forEach(key => {
                currentUser.permisos.acciones[sectionId][key] = false;
            });
        renderPermissions();
        return;
    }

    if (action !== 'ver' && enabled) {
        currentUser.permisos.acciones[sectionId].ver = true;
        const viewCheckbox = document.getElementById(`perm_${sectionId}_ver`);
        if (viewCheckbox) viewCheckbox.checked = true;
    }

    currentUser.permisos[sectionId] =
        currentUser.permisos.acciones[sectionId].ver === true;
    renderInitialWindow();
    updatePermissionOverview();
    updatePermissionChangeState();
    refreshPermissionCardState(sectionId);
    applyPermissionFilters();
}

// ============================================
// RESET PERMISSIONS
// ============================================

function resetPermissions() {
    currentUser.permisos = JSON.parse(JSON.stringify(originalPermissions));
    renderPermissions();
    updatePermissionChangeState();

    Swal.fire({
        icon: 'info',
        title: 'Permissions reset',
        text: 'The original permissions were restored.',
        timer: 2000,
        showConfirmButton: false
    });
}

// ============================================
// SAVE PERMISSIONS
// ============================================

async function savePermissions() {
    const token = localStorage.getItem('token');

    // Collect current permissions.
    const permissions = { acciones: {} };
    MENU_SECTIONS.forEach(section => {
        permissions.acciones[section.id] = {};
        const targetCanUseSection = targetRoleCanUseModule(section);
        (MODULE_ACTIONS[section.id] || ['ver']).forEach(action => {
            const checkbox = document.getElementById(
                `perm_${section.id}_${action}`
            );
            permissions.acciones[section.id][action] =
                targetCanUseSection && (
                    currentUser.rol === 'superadmin' ||
                    checkbox?.checked === true
                );
        });
        permissions[section.id] =
            permissions.acciones[section.id].ver === true;
    });
    const initialWindow = document.getElementById('initialWindow')?.value || null;
    const enabledWindows = MENU_SECTIONS.filter(
        section => section.initialOption && permissions[section.id]
    );

    if (!enabledWindows.length && currentUser.rol !== 'superadmin') {
        await Swal.fire({
            icon: 'warning',
            title: 'Select a window',
            text: 'The user must have access to at least one operational window.'
        });
        return;
    }

    permissions.paginaInicio = enabledWindows.some(section => section.id === initialWindow)
        ? initialWindow
        : enabledWindows[0]?.id || 'tiendas';

    // Offline mode
    if (!token || window.isOfflineMode?.() === true) {
        // Save to localStorage to simulate persistence.
        const savedPermissions = JSON.parse(localStorage.getItem('userPermissions') || '{}');
        savedPermissions[currentUserId] = permissions;
        localStorage.setItem('userPermissions', JSON.stringify(savedPermissions));

        originalPermissions = JSON.parse(JSON.stringify(permissions));
        currentUser.permisos = normalizeLegacyPermissions(permissions);
        renderPermissions();
        updatePermissionChangeState();

        Swal.fire({
            icon: 'success',
            title: 'Permissions saved',
            text: 'Permissions were updated successfully.',
            timer: 2000,
            showConfirmButton: false
        });
        return;
    }

    try {
        const response = await fetch(`${window.API_URL}/usuarios/${currentUserId}/permisos`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ permisos: permissions })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            currentUser.permisos = normalizeLegacyPermissions(
                data.permisos || permissions
            );
            originalPermissions = JSON.parse(JSON.stringify(currentUser.permisos));
            renderPermissions();
            updatePermissionChangeState();

            Swal.fire({
                icon: 'success',
                title: 'Permissions saved',
                text: data.message || 'Permissions were updated successfully.',
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            throw new Error(data.message || 'Save failed');
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Permissions could not be saved.'
        });
    }
}

// ============================================
// UTILITIES
// ============================================

function getInitials(name) {
    if (!name) return '??';
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function getRoleLabel(role) {
    const labels = {
        'superadmin': 'Super administrator',
        'admin': 'Administrator',
        'supervisor': 'Supervisor',
        'usuario': 'User'
    };
    return labels[role] || role;
}


// ============================================
// PROFESSIONAL PERMISSION WORKSPACE
// ============================================

function getPermissionSnapshot() {
    if (!currentUser?.permisos) return '{}';

    const snapshot = {
        paginaInicio:
            currentUser.permisos.paginaInicio || null,
        acciones: {}
    };

    MENU_SECTIONS.forEach(section => {
        snapshot.acciones[section.id] = {};

        (MODULE_ACTIONS[section.id] || ['ver'])
            .forEach(action => {
                snapshot.acciones[section.id][action] =
                    currentUser.rol === 'superadmin' ||
                    currentUser.permisos.acciones
                        ?.[section.id]?.[action] === true;
            });
    });

    return JSON.stringify(snapshot);
}

function getOriginalPermissionSnapshot() {
    const original = {
        paginaInicio:
            originalPermissions?.paginaInicio || null,
        acciones: {}
    };

    MENU_SECTIONS.forEach(section => {
        original.acciones[section.id] = {};

        (MODULE_ACTIONS[section.id] || ['ver'])
            .forEach(action => {
                original.acciones[section.id][action] =
                    currentUser?.rol === 'superadmin' ||
                    originalPermissions?.acciones
                        ?.[section.id]?.[action] === true;
            });
    });

    return JSON.stringify(original);
}

function updatePermissionChangeState() {
    const hasChanges =
        getPermissionSnapshot()
        !== getOriginalPermissionSnapshot();

    const headerState =
        document.getElementById('permissionSaveState');
    const footerState =
        document.getElementById('permissionFooterState');
    const stateContainer =
        document.querySelector('.permission-change-state');

    if (headerState) {
        headerState.textContent = hasChanges
            ? 'Unsaved policy changes'
            : 'Policy synchronized';
    }

    if (footerState) {
        footerState.textContent = hasChanges
            ? 'Review and save the current changes'
            : 'No unsaved changes';
    }

    stateContainer?.classList.toggle(
        'is-dirty',
        hasChanges
    );
}

function updatePermissionOverview() {
    if (!currentUser?.permisos) return;

    let enabledModules = 0;
    let enabledActions = 0;
    let lockedControls = 0;

    const viewerCanEdit =
        window.AppPermissions
            ?.can('permisos', 'editar', viewerUser)
        === true;

    const targetIsPrivileged =
        ['superadmin', 'admin']
            .includes(currentUser.rol);

    const viewerCanManageTarget =
        viewerCanEdit
        && (
            viewerUser?.rol === 'superadmin'
            || !targetIsPrivileged
        );

    MENU_SECTIONS.forEach(section => {
        const actions =
            MODULE_ACTIONS[section.id] || ['ver'];

        const sectionEnabled =
            currentUser.rol === 'superadmin'
            || currentUser.permisos.acciones
                ?.[section.id]?.ver === true;

        if (sectionEnabled) {
            enabledModules += 1;
        }

        actions.forEach(action => {
            const requiredAction =
                section.id === 'perfil'
                && ['ver', 'editar'].includes(action);

            const targetCanUseSection = targetRoleCanUseModule(section);

            const isLocked =
                currentUser.rol === 'superadmin'
                || !viewerCanManageTarget
                || !targetCanUseSection
                || requiredAction;

            const isEnabled =
                currentUser.rol === 'superadmin'
                || currentUser.permisos.acciones
                    ?.[section.id]?.[action] === true
                || requiredAction;

            if (isEnabled) enabledActions += 1;
            if (isLocked) lockedControls += 1;
        });
    });

    const modulesElement =
        document.getElementById('enabledModulesCount');
    const actionsElement =
        document.getElementById('enabledActionsCount');
    const lockedElement =
        document.getElementById('lockedPermissionsCount');

    if (modulesElement) {
        modulesElement.textContent =
            String(enabledModules);
    }

    if (actionsElement) {
        actionsElement.textContent =
            String(enabledActions);
    }

    if (lockedElement) {
        lockedElement.textContent =
            String(lockedControls);
    }
}

function refreshPermissionCardState(sectionId) {
    const card = document.querySelector(
        `.access-policy-card[data-permission-id="${sectionId}"]`
    );

    if (!card || !currentUser) return;

    const actions =
        MODULE_ACTIONS[sectionId] || ['ver'];

    const enabled = actions.some(action =>
        currentUser.rol === 'superadmin'
        || currentUser.permisos.acciones
            ?.[sectionId]?.[action] === true
    );

    card.dataset.permissionEnabled =
        String(enabled);
}

function applyPermissionFilters() {
    const searchInput =
        document.getElementById('permissionSearch');
    const groupSelect =
        document.getElementById('permissionGroupFilter');
    const statusSelect =
        document.getElementById('permissionStatusFilter');

    permissionFilterState = {
        search:
            String(searchInput?.value || '')
                .trim()
                .toLowerCase(),
        group:
            String(groupSelect?.value || ''),
        status:
            String(statusSelect?.value || '')
    };

    const cards = Array.from(
        document.querySelectorAll('.access-policy-card')
    );

    let visibleCards = 0;

    cards.forEach(card => {
        const searchable = [
            card.dataset.permissionName,
            card.dataset.permissionDescription,
            card.dataset.permissionGroup
        ].join(' ');

        const matchesSearch =
            !permissionFilterState.search
            || searchable.includes(
                permissionFilterState.search
            );

        const matchesGroup =
            !permissionFilterState.group
            || card.dataset.permissionGroup
                === permissionFilterState.group;

        const matchesStatus =
            !permissionFilterState.status
            || (
                permissionFilterState.status === 'enabled'
                && card.dataset.permissionEnabled === 'true'
            )
            || (
                permissionFilterState.status === 'disabled'
                && card.dataset.permissionEnabled !== 'true'
            )
            || (
                permissionFilterState.status === 'locked'
                && card.dataset.permissionLocked === 'true'
            );

        const visible =
            matchesSearch
            && matchesGroup
            && matchesStatus;

        card.hidden = !visible;

        if (visible) visibleCards += 1;
    });

    document
        .querySelectorAll('.access-policy-group')
        .forEach(group => {
            const groupHasVisibleCards =
                Array.from(
                    group.querySelectorAll(
                        '.access-policy-card'
                    )
                ).some(card => !card.hidden);

            group.hidden = !groupHasVisibleCards;
        });

    const resultElement =
        document.getElementById('permissionResultCount');

    if (resultElement) {
        resultElement.textContent =
            String(visibleCards);
    }
}

function resetPermissionFilters() {
    const search =
        document.getElementById('permissionSearch');
    const group =
        document.getElementById('permissionGroupFilter');
    const status =
        document.getElementById('permissionStatusFilter');

    if (search) search.value = '';
    if (group) group.value = '';
    if (status) status.value = '';

    applyPermissionFilters();
    search?.focus();
}

function getVisiblePermissionSections() {
    return Array.from(
        document.querySelectorAll(
            '.access-policy-card:not([hidden])'
        )
    )
        .map(card => card.dataset.permissionId)
        .filter(Boolean);
}

function enableVisiblePermissions() {
    if (!currentUser) return;

    const sectionIds =
        getVisiblePermissionSections();

    sectionIds.forEach(sectionId => {
        const viewCheckbox =
            document.getElementById(
                `perm_${sectionId}_ver`
            );

        if (!viewCheckbox || viewCheckbox.disabled) {
            return;
        }

        currentUser.permisos.acciones ||= {};
        currentUser.permisos.acciones[sectionId] ||= {};
        currentUser.permisos.acciones[sectionId].ver =
            true;
        currentUser.permisos[sectionId] = true;
    });

    renderPermissions();
    updatePermissionChangeState();
}

function applyPermissionTemplate(templateId = null) {
    if (!currentUser) return;

    const selectedTemplateId =
        templateId || document.getElementById('permissionTemplateSelect')?.value;
    const template = PERMISSION_TEMPLATES[selectedTemplateId];

    if (!template) {
        Swal.fire({
            icon: 'info',
            title: 'Select a template',
            text: 'Choose a corporate access template before applying it.'
        });
        return;
    }

    currentUser.permisos ||= { acciones: {} };
    currentUser.permisos.acciones ||= {};

    MENU_SECTIONS.forEach(section => {
        currentUser.permisos.acciones[section.id] ||= {};

        const actions = MODULE_ACTIONS[section.id] || ['ver'];
        const allowedTemplateActions =
            template.modules[section.id] || [];
        const targetCanUseSection =
            targetRoleCanUseModule(section);

        actions.forEach(action => {
            const checkbox =
                document.getElementById(
                    `perm_${section.id}_${action}`
                );
            const requiredAction =
                section.id === 'perfil'
                && ['ver', 'editar'].includes(action);

            if (
                checkbox?.disabled
                && !requiredAction
            ) {
                return;
            }

            currentUser.permisos.acciones[section.id][action] =
                targetCanUseSection
                && (
                    requiredAction
                    || allowedTemplateActions.includes(action)
                );
        });

        currentUser.permisos[section.id] =
            currentUser.permisos.acciones[section.id].ver === true;
    });

    const enabledStartup =
        MENU_SECTIONS.some(section =>
            section.id === template.startup
            && section.initialOption
            && currentUser.permisos[section.id] === true
        );

    currentUser.permisos.paginaInicio = enabledStartup
        ? template.startup
        : getEnabledInitialSections()[0]?.id || null;

    renderPermissions();
    updatePermissionChangeState();

    Swal.fire({
        icon: 'success',
        title: 'Template applied',
        text: `${template.label} policy was applied to editable modules.`,
        timer: 2200,
        showConfirmButton: false
    });
}

function clearOptionalPermissions() {
    if (!currentUser) return;

    MENU_SECTIONS.forEach(section => {
        const actions =
            MODULE_ACTIONS[section.id] || ['ver'];

        actions.forEach(action => {
            const checkbox =
                document.getElementById(
                    `perm_${section.id}_${action}`
                );

            const requiredAction =
                section.id === 'perfil'
                && ['ver', 'editar'].includes(action);

            if (
                !checkbox
                || checkbox.disabled
                || requiredAction
            ) {
                return;
            }

            currentUser.permisos.acciones ||= {};
            currentUser.permisos.acciones[section.id] ||= {};
            currentUser.permisos.acciones[section.id][action] =
                false;
        });

        currentUser.permisos[section.id] =
            currentUser.permisos.acciones
                ?.[section.id]?.ver === true;
    });

    renderPermissions();
    updatePermissionChangeState();
}


// Layout V2: show a clear empty state when no permission module matches.
(function installPermissionLayoutV2EmptyState() {
    const originalApplyPermissionFilters =
        window.applyPermissionFilters;

    if (typeof originalApplyPermissionFilters !== 'function') {
        return;
    }

    window.applyPermissionFilters = function () {
        originalApplyPermissionFilters.apply(this, arguments);

        const matrix =
            document.getElementById('permissionsList');

        if (!matrix) return;

        let emptyState =
            matrix.querySelector(
                ':scope > .access-policy-filter-empty'
            );

        const visibleCards =
            matrix.querySelectorAll(
                '.access-policy-card:not([hidden])'
            ).length;

        if (!emptyState) {
            emptyState = document.createElement('div');
            emptyState.className =
                'access-empty-state access-policy-filter-empty';
            emptyState.innerHTML = `
                <i class="fa-solid fa-filter-circle-xmark"></i>
                <strong>No modules match the filters</strong>
                <span>Clear the current filters to display the complete policy matrix.</span>
            `;
            matrix.appendChild(emptyState);
        }

        emptyState.hidden = visibleCards > 0;
    };
})();
