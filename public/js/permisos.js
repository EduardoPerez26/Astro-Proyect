// ============================================
// PERMISSION SETTINGS
// ============================================

let currentUserId = null;
let currentUser = null;
let originalPermissions = {};

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
        adminOnly: true,
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
        adminOnly: true
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
        path: '/views/departments/property-management',
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
        adminOnly: true
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
        adminOnly: true
    }
];

const MENU_GROUP_ORDER = [
    'Accounts Receivable',
    'Property Management',
    'Information Technology',
    'Account'
];

function normalizeLegacyPermissions(permisos = {}) {
    const normalized = { ...permisos };

    if (
        normalized.propertyManagement === true &&
        normalized.propertyManagementDocuments === undefined
    ) {
        normalized.propertyManagementDocuments = true;
    }

    return normalized;
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
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
    if (!token || localStorage.getItem('modoOffline')) {
        const users = [
            { id: 1, nombre: 'Administrator', email: 'admin@empresa.com', username: 'admin', rol: 'admin' },
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
            1: { dashboardAdmin: true, tiendas: true, documentos: true, perfil: true, permisos: true, historial: true, usuarios: true, controlRestaurants: true, propertyManagement: true, propertyManagementDocuments: true, paginaInicio: 'dashboardAdmin' },
            2: { tiendas: true, documentos: true, perfil: true, permisos: false, historial: true, usuarios: false, controlRestaurants: false, propertyManagement: false, propertyManagementDocuments: false, paginaInicio: 'tiendas' },
            3: { tiendas: true, documentos: true, perfil: true, permisos: false, historial: false, usuarios: false, controlRestaurants: false, propertyManagement: false, propertyManagementDocuments: false, paginaInicio: 'tiendas' },
            4: { tiendas: true, documentos: false, perfil: true, permisos: false, historial: false, usuarios: false, controlRestaurants: false, propertyManagement: true, propertyManagementDocuments: true, paginaInicio: 'propertyManagement' }
        };
        
        currentUser.permisos = normalizeLegacyPermissions(defaultPermissions[currentUser.id] || {});
        originalPermissions = { ...currentUser.permisos };
        
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
            if (currentUser.rol === 'admin') {
                MENU_SECTIONS.forEach(section => {
                    currentUser.permisos[section.id] = true;
                });
            }
            originalPermissions = { ...currentUser.permisos };
            
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

    const renderCard = (section) => {
        const isRequired = section.required;
        const isAdminSection = section.adminOnly;
        const isEnabled = isAdminSection
            ? currentUser.rol === 'admin'
            : isRequired || currentUser.permisos[section.id] === true;
        const isDisabled = isRequired || (isAdminSection && currentUser.rol !== 'admin');
        const tags = [
            isRequired ? 'Required' : '',
            isAdminSection ? 'Admin only' : ''
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
                <label class="toggle-switch">
                    <input type="checkbox" 
                           id="perm_${section.id}" 
                           data-section="${section.id}"
                           ${isEnabled || (isRequired && !isAdminSection) ? 'checked' : ''}
                           ${isDisabled ? 'disabled' : ''}
                           onchange="togglePermission('${section.id}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
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
}

function getEnabledInitialSections() {
    return MENU_SECTIONS.filter(section =>
        section.initialOption && currentUser.permisos[section.id] === true
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

function togglePermission(sectionId, enabled) {
    if (!currentUser) return;
    currentUser.permisos[sectionId] = enabled;
    renderInitialWindow();
}

// ============================================
// RESET PERMISSIONS
// ============================================

function resetPermissions() {
    currentUser.permisos = { ...originalPermissions };
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
    const permissions = {};
    MENU_SECTIONS.forEach(section => {
        const checkbox = document.getElementById(`perm_${section.id}`);
        if (checkbox) {
            permissions[section.id] = section.adminOnly
                ? currentUser.rol === 'admin'
                : checkbox.checked;
        }
    });
    const initialWindow = document.getElementById('initialWindow')?.value || null;
    const enabledWindows = MENU_SECTIONS.filter(
        section => section.initialOption && permissions[section.id]
    );

    if (!enabledWindows.length && currentUser.rol !== 'admin') {
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
    if (!token || localStorage.getItem('modoOffline')) {
        // Save to localStorage to simulate persistence.
        const savedPermissions = JSON.parse(localStorage.getItem('userPermissions') || '{}');
        savedPermissions[currentUserId] = permissions;
        localStorage.setItem('userPermissions', JSON.stringify(savedPermissions));
        
        originalPermissions = { ...permissions };
        
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
            currentUser.permisos = { ...(data.permisos || permissions) };
            originalPermissions = { ...currentUser.permisos };
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
        'admin': 'Administrator',
        'supervisor': 'Supervisor',
        'usuario': 'User'
    };
    return labels[role] || role;
}

