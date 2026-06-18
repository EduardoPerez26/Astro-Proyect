// ============================================
// CONFIGURACION DE PERMISOS
// ============================================

let currentUserId = null;
let currentUser = null;
let originalPermissions = {};

// Definicion de todas las secciones del sistema
const MENU_SECTIONS = [
    {
        id: 'tiendas',
        name: 'Tiendas',
        description: 'Gestion de restaurantes y sucursales',
        icon: 'fa-shop',
        iconClass: 'tiendas',
        path: '/views/tiendas',
        required: true
    },
    {
        id: 'documentos',
        name: 'Documentos',
        description: 'Editor y validador de Excel',
        icon: 'fa-file-excel',
        iconClass: 'documentos',
        path: '/views/editor',
        required: false
    },
    {
        id: 'perfil',
        name: 'Perfil',
        description: 'Configuracion de cuenta personal',
        icon: 'fa-user',
        iconClass: 'perfil',
        path: '/views/perfil',
        required: true // Siempre visible
    },
    {
        id: 'permisos',
        name: 'Permisos',
        description: 'Configuracion de accesos (solo admin)',
        icon: 'fa-key',
        iconClass: 'permisos',
        path: '/views/permisos',
        required: false,
        adminOnly: true
    },
    {
        id: 'historial',
        name: 'Historial',
        description: 'Registro de actividades y cambios',
        icon: 'fa-clock-rotate-left',
        iconClass: 'historial',
        path: '/views/historial',
        required: false
    },
    {
        id: 'usuarios',
        name: 'Usuarios',
        description: 'Administracion de usuarios (solo admin)',
        icon: 'fa-users',
        iconClass: 'usuarios',
        path: '/views/usuarios',
        required: false,
        adminOnly: true
    },
    {
        id: 'controlRestaurantes',
        name: 'Control de restaurantes',
        description: 'Disponibilidad operativa por mantenimiento o fallas',
        icon: 'fa-screwdriver-wrench',
        iconClass: 'restaurantes',
        path: '/views/restaurantes',
        required: true,
        adminOnly: true
    }
];

// Inicializar
document.addEventListener('DOMContentLoaded', function() {
    // Obtener userId de la URL
    const urlParams = new URLSearchParams(window.location.search);
    currentUserId = urlParams.get('userId');
    
    if (!currentUserId) {
        Swal.fire({
            icon: 'error',
            title: 'Usuario no especificado',
            text: 'No se especifico el usuario a configurar.',
        }).then(() => {
            window.location.href = '/views/usuarios';
        });
        return;
    }
    
    loadUserData();
});

// ============================================
// CARGAR DATOS DEL USUARIO
// ============================================

async function loadUserData() {
    const token = localStorage.getItem('token');
    
    // Modo offline - datos de ejemplo
    if (!token || localStorage.getItem('modoOffline')) {
        const users = [
            { id: 1, nombre: 'Administrador', email: 'admin@empresa.com', username: 'admin', rol: 'admin' },
            { id: 2, nombre: 'Juan Perez', email: 'juan@empresa.com', username: 'jperez', rol: 'supervisor' },
            { id: 3, nombre: 'Maria Garcia', email: 'maria@empresa.com', username: 'mgarcia', rol: 'usuario' },
            { id: 4, nombre: 'Carlos Lopez', email: 'carlos@empresa.com', username: 'clopez', rol: 'usuario' }
        ];
        
        currentUser = users.find(u => u.id === parseInt(currentUserId));
        
        if (!currentUser) {
            Swal.fire({
                icon: 'error',
                title: 'Usuario no encontrado',
            }).then(() => {
                window.location.href = '/views/usuarios';
            });
            return;
        }
        
        // Permisos de ejemplo
        const defaultPermissions = {
            1: { tiendas: true, documentos: true, perfil: true, permisos: true, historial: true, usuarios: true, controlRestaurantes: true },
            2: { tiendas: true, documentos: true, perfil: true, permisos: false, historial: true, usuarios: false, controlRestaurantes: false },
            3: { tiendas: true, documentos: true, perfil: true, permisos: false, historial: false, usuarios: false, controlRestaurantes: false },
            4: { tiendas: true, documentos: false, perfil: true, permisos: false, historial: false, usuarios: false, controlRestaurantes: false }
        };
        
        currentUser.permisos = defaultPermissions[currentUser.id] || {};
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
            
            // Asegurar que permisos sea un objeto
            if (typeof currentUser.permisos === 'string') {
                try {
                    currentUser.permisos = JSON.parse(currentUser.permisos);
                } catch {
                    currentUser.permisos = {};
                }
            }
            currentUser.permisos = {
                ...(currentUser.permisos || {}),
                tiendas: true,
                controlRestaurantes: currentUser.rol === 'admin'
            };
            originalPermissions = { ...currentUser.permisos };
            
            renderUserInfo();
            renderPermissions();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.mensaje || 'Error al cargar usuario');
        }
    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'No se pudo cargar la informacion del usuario.',
        }).then(() => {
            window.location.href = '/views/usuarios';
        });
    }
}

// ============================================
// RENDERIZAR INFO USUARIO
// ============================================

function renderUserInfo() {
    if (!currentUser) return;
    
    const avatarEl = document.getElementById('userAvatar');
    const nameEl = document.getElementById('permUserName');
    const emailEl = document.getElementById('permUserEmail');
    const roleEl = document.getElementById('permUserRole');
    
    if (avatarEl) avatarEl.textContent = getInitials(currentUser.nombre || '');
    if (nameEl) nameEl.textContent = currentUser.nombre || 'Sin nombre';
    if (emailEl) emailEl.textContent = currentUser.email || '';
    
    if (roleEl) {
        roleEl.textContent = getRoleLabel(currentUser.rol);
        roleEl.className = `status-badge ${currentUser.rol || 'usuario'}`;
    }
}

// ============================================
// RENDERIZAR PERMISOS
// ============================================

function renderPermissions() {
    const container = document.getElementById('permissionsList');
    
    container.innerHTML = MENU_SECTIONS.map(section => {
        const isRequired = section.required;
        const isAdminSection = section.adminOnly;
        const isEnabled = isAdminSection
            ? currentUser.rol === 'admin'
            : currentUser.permisos[section.id] !== false;
        const isDisabled = isRequired || (isAdminSection && currentUser.rol !== 'admin');
        
        return `
            <div class="permission-card">
                <div class="permission-info">
                    <div class="permission-icon">
                        <i class="fa-solid ${section.icon}"></i>
                    </div>
                    <div class="permission-details">
                        <h4>${section.name}</h4>
                        <p>${section.description}${isRequired ? ' (Requerido)' : ''}${isAdminSection ? ' (Solo Admin)' : ''}</p>
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
    }).join('');
}

// ============================================
// TOGGLE PERMISO
// ============================================

function togglePermission(sectionId, enabled) {
    if (!currentUser) return;
    currentUser.permisos[sectionId] = enabled;
}

// ============================================
// RESTABLECER PERMISOS
// ============================================

function resetPermissions() {
    currentUser.permisos = { ...originalPermissions };
    renderPermissions();
    
    Swal.fire({
        icon: 'info',
        title: 'Permisos restablecidos',
        text: 'Se restauraron los permisos originales.',
        timer: 2000,
        showConfirmButton: false
    });
}

// ============================================
// GUARDAR PERMISOS
// ============================================

async function savePermissions() {
    const token = localStorage.getItem('token');
    
    // Recopilar permisos actuales
    const permissions = {};
    MENU_SECTIONS.forEach(section => {
        const checkbox = document.getElementById(`perm_${section.id}`);
        if (checkbox) {
            permissions[section.id] = section.adminOnly
                ? currentUser.rol === 'admin'
                : checkbox.checked;
        }
    });
    
    // Modo offline
    if (!token || localStorage.getItem('modoOffline')) {
        // Guardar en localStorage para simular persistencia
        const savedPermissions = JSON.parse(localStorage.getItem('userPermissions') || '{}');
        savedPermissions[currentUserId] = permissions;
        localStorage.setItem('userPermissions', JSON.stringify(savedPermissions));
        
        originalPermissions = { ...permissions };
        
        Swal.fire({
            icon: 'success',
            title: 'Permisos guardados',
            text: 'Los permisos se actualizaron correctamente.',
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
            originalPermissions = { ...permissions };
            
            Swal.fire({
                icon: 'success',
                title: 'Permisos guardados',
                text: data.message || 'Los permisos se actualizaron correctamente.',
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            throw new Error(data.message || 'Error al guardar');
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'No se pudieron guardar los permisos.'
        });
    }
}

// ============================================
// UTILIDADES
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
        'admin': 'Administrador',
        'supervisor': 'Supervisor',
        'usuario': 'Usuario'
    };
    return labels[role] || role;
}
