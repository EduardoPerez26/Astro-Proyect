// ============================================
// PERMISSION SETTINGS
// ============================================

let currentUserId = null;
let currentUser = null;
let originalPermissions = {};
let viewerUser = null;

const ACTION_LABELS = {
    ver: 'View',
    crear: 'Create',
    editar: 'Edit',
    eliminar: 'Delete',
    exportar: 'Export'
};

const MODULE_ACTIONS = {
    dashboardAdmin: ['ver', 'editar', 'exportar'],
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

        normalized.acciones[section.id] = Object.fromEntries(
            actions.map(action => [
                action,
                typeof existing[action] === 'boolean'
                    ? existing[action]
                    : legacyEnabled
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
            1: { dashboardAdmin: true, systemErrors: true, tiendas: true, documentos: true, perfil: true, permisos: true, historial: true, usuarios: true, controlRestaurants: true, propertyManagement: true, propertyManagementDocuments: true, chat: true, paginaInicio: 'dashboardAdmin' },
            2: { tiendas: true, documentos: true, perfil: true, permisos: false, historial: true, usuarios: false, controlRestaurants: false, propertyManagement: false, propertyManagementDocuments: false, chat: false, paginaInicio: 'tiendas' },
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
        const targetCanUseSection =
            !isAdministrative ||
            ['superadmin', 'admin'].includes(currentUser.rol);
        const actions = MODULE_ACTIONS[section.id] || ['ver'];
        const isLocked =
            currentUser.rol === 'superadmin' ||
            !viewerCanManageTarget ||
            !targetCanUseSection;
        const tags = [
            isRequired ? 'Required' : '',
            isAdministrative ? 'Administrative' : '',
            currentUser.rol === 'superadmin' ? 'Full access' : ''
        ].filter(Boolean);

        return `
            <div class="permission-card">
                <div class="permission-info">
                    <div class="permission-icon">
                        <i class="fa-solid ${section.icon}"></i>
                    </div>
                    <div class="permission-details">
                        <h4>${section.name}</h4>
                        <p>${section.description}</p>
                        ${tags.length ? `
                            <div class="permission-tags">
                                ${tags.map(tag => `<span>${tag}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="permission-action-grid" aria-label="${section.name} permissions">
                    ${actions.map(action => {
                        const requiredAction =
                            section.id === 'perfil' &&
                            ['ver', 'editar'].includes(action);
                        const checked =
                            currentUser.rol === 'superadmin' ||
                            currentUser.permisos.acciones?.[section.id]?.[action] === true ||
                            requiredAction;
                        const disabled = isLocked || requiredAction;

                        return `
                            <label class="permission-action">
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
            <section class="permission-group">
                <div class="permission-group-header">
                    <span>${groupName}</span>
                    <strong>${sections.length}</strong>
                </div>
                <div class="permission-group-grid">
                    ${sections.map(renderCard).join('')}
                </div>
            </section>
        `;
    }).join('');

    renderInitialWindow();

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
}

function changeInitialWindow(value) {
    if (!currentUser) return;
    currentUser.permisos.paginaInicio = value || null;
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
}

// ============================================
// RESET PERMISSIONS
// ============================================

function resetPermissions() {
    currentUser.permisos = JSON.parse(JSON.stringify(originalPermissions));
    renderPermissions();

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
        (MODULE_ACTIONS[section.id] || ['ver']).forEach(action => {
            const checkbox = document.getElementById(
                `perm_${section.id}_${action}`
            );
            permissions.acciones[section.id][action] =
                currentUser.rol === 'superadmin' ||
                checkbox?.checked === true;
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
