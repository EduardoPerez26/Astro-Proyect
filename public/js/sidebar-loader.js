// Sidebar loader adaptado para Astro con Backend
const SIDEBAR_API_URL = 'http://localhost:3001/api';

document.addEventListener('DOMContentLoaded', async function() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const logoutBtn = document.getElementById('logoutBtn');

    // Verificar autenticacion
    verificarAutenticacion();

    // Cargar info del usuario en el sidebar desde la base de datos
    await cargarInfoUsuario();

    // Toggle sidebar
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
            document.body.classList.toggle('sidebar-collapsed');
        });
    }

    // Marcar link activo basado en la URL actual
    const currentUrl = window.location.pathname + window.location.hash;
    const menuLinks = document.querySelectorAll('.sidebar-menu-link');
    
    menuLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href && currentUrl.includes(href)) {
            link.classList.add('active');
        }
    });

    // Logout desde el sidebar o topbar
    if (logoutBtn) {
        logoutBtn.addEventListener('click', cerrarSesion);
    }

    const topbarLogoutBtn = document.getElementById('topbarLogoutBtn');
    if (topbarLogoutBtn) {
        topbarLogoutBtn.addEventListener('click', cerrarSesion);
    }

    // Menu de perfil en el topbar o sidebar
    const sidebarProfileToggle = document.getElementById('sidebarProfileToggle');
    const topbarProfileToggle = document.getElementById('topbarProfileToggle');
    const profileMenu = document.getElementById('profileMenu');
    const profileToggle = sidebarProfileToggle || topbarProfileToggle;

    if (profileToggle && profileMenu) {
        profileToggle.addEventListener('click', function(event) {
            event.stopPropagation();
            profileMenu.classList.toggle('active');
            profileToggle.classList.toggle('active');
        });

        document.addEventListener('click', function(event) {
            if (!profileMenu.contains(event.target) && !profileToggle.contains(event.target)) {
                profileMenu.classList.remove('active');
                profileToggle.classList.remove('active');
            }
        });
    }

    // Cerrar sesion en el servidor y limpiar localStorage
    async function cerrarSesion() {
        const token = localStorage.getItem('token');
        if (token && !localStorage.getItem('modoOffline')) {
            try {
                await fetch(`${SIDEBAR_API_URL}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            } catch (error) {
                console.log('Error al cerrar sesion en servidor:', error);
            }
        }

        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('modoOffline');
        window.location.href = '/';
    }
});

// Verificar que el usuario este autenticado
function verificarAutenticacion() {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const currentPath = window.location.pathname;

    // Si no esta logueado y no esta en la pagina de login, redirigir
    if (!isLoggedIn && currentPath !== '/') {
        window.location.href = '/';
    }
}

// Cargar informacion del usuario en el header
async function cargarInfoUsuario() {
    const usuarioCache = JSON.parse(localStorage.getItem('usuario') || '{}');
    if (Object.keys(usuarioCache).length > 0) {
        actualizarInformacionUsuario(usuarioCache);
    } else {
        actualizarInformacionUsuario({ nombre: 'Cargando...', rol: '' });
    }

    const token = localStorage.getItem('token');
    const modoOffline = localStorage.getItem('modoOffline');

    if (token && !modoOffline) {
        try {
            const response = await fetch(`${SIDEBAR_API_URL}/auth/profile`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (!data.error && data.usuario) {
                    localStorage.setItem('usuario', JSON.stringify(data.usuario));
                    actualizarInformacionUsuario(data.usuario);
                    return;
                }
            }
        } catch (error) {
            console.warn('No se pudo cargar perfil desde el servidor:', error);
        }
    }

    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    actualizarInformacionUsuario(usuario);
}

function actualizarInformacionUsuario(usuario) {
    const headerUserName = document.getElementById('sidebarUserName') || document.querySelector('.header-user-name');
    const headerUserRole = document.getElementById('sidebarUserRole') || document.querySelector('.header-user-role');
    const avatar = document.getElementById('sidebarAvatar') || document.querySelector('.avatar');

    const nombre = usuario.nombre_completo || usuario.nombre || 'Usuario';
    const rol = usuario.rol || '';

    if (headerUserName) {
        headerUserName.textContent = nombre;
    }

    if (headerUserRole) {
        const roles = {
            'admin': 'Administrador',
            'supervisor': 'Supervisor',
            'usuario': 'Usuario'
        };
        headerUserRole.textContent = roles[rol] || rol || 'Rol';
    }

    if (avatar && nombre) {
        const iniciales = nombre.split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
        avatar.textContent = iniciales;
    }

    // Mostrar indicador de modo offline
    if (localStorage.getItem('modoOffline')) {
        const profileContainer = document.querySelector('.sidebar-profile');
        if (profileContainer && !profileContainer.querySelector('.offline-indicator')) {
            const offlineIndicator = document.createElement('div');
            offlineIndicator.className = 'offline-indicator';
            offlineIndicator.innerHTML = '<i class="fa-solid fa-wifi-slash"></i> Modo Offline';
            profileContainer.appendChild(offlineIndicator);
        }
    }
}
