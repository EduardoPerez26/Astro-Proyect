// ============================================
// CONFIGURACION DE PERMISOS
// ============================================

const API_URL = 'http://localhost:3001/api';
let currentUserId = null;
let currentUser = null;
let originalPermissions = {};

// Definicion de todas las secciones del sistema
const MENU_SECTIONS = [
    {
        id: 'dashboard',
        name: 'Dashboard',
        description: 'Panel principal con estadisticas',
        icon: 'fa-house',
        iconClass: 'dashboard',
        path: '/views/inicio',
        required: false
    },
    {
        id: 'tiendas',
        name: 'Tiendas',
        description: 'Gestion de restaurantes y sucursales',
        icon: 'fa-shop',
        iconClass: 'tiendas',
        path: '/views/tiendas',
        required: false
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
            1: { dashboard: true, tiendas: true, documentos: true, perfil: true, permisos: true, historial: true, usuarios: true },
            2: { dashboard: true, tiendas: true, documentos: true, perfil: true, permisos: false, historial: true, usuarios: false },
            3: { dashboard: true, tiendas: false, documentos: true, perfil: true, permisos: false, historial: false, usuarios: false },
            4: { dashboard: true, tiendas: false, documentos: false, perfil: true, permisos: false, historial: false, usuarios: false }
        };
        
        currentUser.permisos = defaultPermissions[currentUser.id] || {};
        originalPermissions = { ...currentUser.permisos };
        
        renderUserInfo();
        renderPermissions();
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/usuarios/${currentUserId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data.usuario || data;
            currentUser.permisos = currentUser.permisos || {};
            originalPermissions = { ...currentUser.permisos };
            
            renderUserInfo();
            renderPermissions();
        } else {
            throw new Error('Error al cargar usuario');
        }
    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo cargar la informacion del usuario.',
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
    
    document.getElementById('userAvatar').textContent = getInitials(currentUser.nombre);
    document.getElementById('permUserName').textContent = currentUser.nombre;
    document.getElementById('permUserEmail').textContent = currentUser.email;
    
    const roleEl = document.getElementById('permUserRole');
    roleEl.textContent = getRoleLabel(currentUser.rol);
    roleEl.className = `role-badge ${currentUser.rol}`;
}

// ============================================
// RENDERIZAR PERMISOS
// ============================================

function renderPermissions() {
    const container = document.getElementById('permissionsList');
    
    container.innerHTML = MENU_SECTIONS.map(section => {
        const isEnabled = currentUser.permisos[section.id] !== false;
        const isRequired = section.required;
        const isAdminSection = section.adminOnly;
        const isDisabled = isRequired || (isAdminSection && currentUser.rol !== 'admin');
        
        return `
            <div class="permission-item">
                <div class="permission-info">
                    <div class="permission-icon ${section.iconClass}">
                        <i class="fa-solid ${section.icon}"></i>
                    </div>
                    <div class="permission-details">
                        <h4>
                            ${section.name}
                            ${isRequired ? '<span class="permission-required">(Requerido)</span>' : ''}
                            ${isAdminSection ? '<span class="permission-required">(Solo Admin)</span>' : ''}
                        </h4>
                        <p>${section.description}</p>
                    </div>
                </div>
                <div class="permission-toggle">
                    <input type="checkbox" 
                           id="perm_${section.id}" 
                           class="toggle-input" 
                           data-section="${section.id}"
                           ${isEnabled || isRequired ? 'checked' : ''} 
                           ${isDisabled ? 'disabled' : ''}
                           onchange="togglePermission('${section.id}', this.checked)">
                    <label for="perm_${section.id}" class="toggle-switch"></label>
                </div>
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
            permissions[section.id] = checkbox.checked;
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
        const response = await fetch(`${API_URL}/usuarios/${currentUserId}/permisos`, {
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
