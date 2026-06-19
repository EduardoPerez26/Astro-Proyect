// Sidebar loader adaptado para Astro con Backend y Control de Permisos
window.API_URL

document.addEventListener('DOMContentLoaded', async function() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const topbarSidebarToggle = document.getElementById('topbarSidebarToggle');
    const logoutBtn = document.getElementById('logoutBtn');
    const mainContent = document.getElementById('mainContent');

    // Verificar autenticacion
    verificarAutenticacion();

    // Refrescar departamento y permisos desde la base de datos.
    await actualizarContextoUsuario();

    // Cargar info del usuario en el header y sidebar
    cargarInfoUsuario();

    // Aplicar permisos al menu
    aplicarPermisos();

    // Restaurar estado del sidebar
    const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (sidebarCollapsed && sidebar) {
        sidebar.classList.add('collapsed');
        if (mainContent) {
            mainContent.classList.add('sidebar-collapsed');
        }
        document.body.classList.add('sidebar-collapsed');
    }

    function toggleSidebar(e) {
        e.preventDefault();
        e.stopPropagation();

        if (
            window.matchMedia &&
            window.matchMedia('(max-width: 1024px)').matches
        ) {
            sidebar.classList.toggle('open');
            return;
        }
            
        sidebar.classList.toggle('collapsed');
            
        // Sincronizar con main content
        if (mainContent) {
            mainContent.classList.toggle('sidebar-collapsed');
        }
        document.body.classList.toggle('sidebar-collapsed');
            
        // Guardar estado
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
    }

    // Toggle sidebar
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }

    if (topbarSidebarToggle && sidebar) {
        topbarSidebarToggle.addEventListener('click', toggleSidebar);
    }

    // Marcar link activo basado en la URL actual
    const currentPath = window.location.pathname;
    const menuLinks = document.querySelectorAll('.sidebar-menu-link');
    
    menuLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href && currentPath.includes(href)) {
            link.classList.add('active');
        }
    });

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            cerrarSesion();
        });
    }
});

// Funcion para cerrar sesion
async function cerrarSesion() {
    const token = localStorage.getItem('token');
    
    // Confirmar cierre de sesion
    const result = await Swal.fire({
        title: 'Cerrar sesion',
        text: 'Estas seguro que deseas cerrar sesion?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#6B7280',
        confirmButtonText: 'Si, cerrar sesion',
        cancelButtonText: 'Cancelar'
    });
    
    if (!result.isConfirmed) return;
    
    // Intentar cerrar sesion en el servidor
    if (token && !localStorage.getItem('modoOffline')) {
        try {
            await fetch(`${window.API_URL}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (error) {
            // Silenciar error de logout
        }
    }

    // Limpiar localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('modoOffline');
    localStorage.removeItem('sidebarCollapsed');
    
    // Redirigir al login
    window.location.href = '/';
}

// Verificar que el usuario este autenticado
function verificarAutenticacion() {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const currentPath = window.location.pathname;

    // Si no esta logueado y no esta en la pagina de login, redirigir
    if (!isLoggedIn && currentPath !== '/') {
        window.location.href = '/';
    }
}

async function actualizarContextoUsuario() {
    const token = localStorage.getItem('token');
    const apiUrl = window.API_URL;

    if (!token || !apiUrl || localStorage.getItem('modoOffline')) return;

    try {
        const response = await fetch(`${apiUrl}/auth/verify`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok && data.usuario) {
            localStorage.setItem('usuario', JSON.stringify(data.usuario));
        }
    } catch (error) {
        console.warn('No se pudo actualizar el contexto del usuario:', error);
    }
}

// Cargar informacion del usuario en el header y sidebar
function cargarInfoUsuario() {
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    
    // Header elements
    const headerUserName = document.querySelector('.header-user-name');
    const headerUserRole = document.querySelector('.header-user-role');
    const avatar = document.querySelector('.avatar');
    
    // Sidebar elements
    const sidebarUserName = document.getElementById('sidebarUserName');
    const sidebarUserRole = document.getElementById('sidebarUserRole');
    const sidebarUserAvatar = document.getElementById('sidebarUserAvatar');

    const roles = {
        'admin': 'Administrador',
        'supervisor': 'Supervisor',
        'usuario': 'Usuario'
    };
    const etiquetaRol = roles[usuario.rol] || usuario.rol || 'Rol';
    const etiquetaContexto = usuario.departamento?.nombre
        ? `${etiquetaRol} · ${usuario.departamento.nombre}`
        : etiquetaRol;

    // Obtener iniciales
    const iniciales = usuario.nombre 
        ? usuario.nombre.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
        : '--';

    // Actualizar header
    if (headerUserName && usuario.nombre) {
        headerUserName.textContent = usuario.nombre;
    }
    if (headerUserRole && usuario.rol) {
        headerUserRole.textContent = etiquetaContexto;
    }
    if (avatar) {
        avatar.textContent = iniciales;
    }
    
    // Actualizar sidebar
    if (sidebarUserName) {
        sidebarUserName.textContent = usuario.nombre || 'Usuario';
    }
    if (sidebarUserRole) {
        sidebarUserRole.textContent = etiquetaContexto;
    }
    if (sidebarUserAvatar) {
        sidebarUserAvatar.textContent = iniciales;
    }

    // Mostrar indicador de modo offline
    if (localStorage.getItem('modoOffline')) {
        const topbar = document.querySelector('.topbar');
        if (topbar && !document.querySelector('.offline-badge')) {
            const offlineIndicator = document.createElement('div');
            offlineIndicator.className = 'badge badge-warning offline-badge';
            offlineIndicator.style.marginRight = '10px';
            offlineIndicator.innerHTML = '<i class="fa-solid fa-wifi-slash"></i> Modo Offline';
            topbar.insertBefore(offlineIndicator, topbar.firstChild);
        }
    }
}

// Aplicar permisos al menu del sidebar
function aplicarPermisos() {
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const permisos = obtenerPermisos(usuario);
    
    // Obtener todos los items del menu con data-permission
    const menuItems = document.querySelectorAll('[data-permission]');
    
    menuItems.forEach(item => {
        const permiso = item.getAttribute('data-permission');
        const soloAdmin = item.hasAttribute('data-admin-only');
        
        // Verificar si el usuario tiene el permiso
        if (!permisos[permiso] || (soloAdmin && usuario.rol !== 'admin')) {
            item.classList.add('hidden');
        } else {
            item.classList.remove('hidden');
        }
    });
    
    // Ocultar secciones vacias
    const sections = document.querySelectorAll('.sidebar-section');
    sections.forEach(section => {
        const visibleItems = section.querySelectorAll('.sidebar-menu-item:not(.hidden)');
        if (visibleItems.length === 0) {
            section.style.display = 'none';
        }
    });
    
    // Verificar acceso a la pagina actual
    verificarAccesoPagina(permisos);
}

// Obtener permisos del usuario
function obtenerPermisos(usuario) {
    const defaultPermissions = {
        'admin': {
            tiendas: true,
            documentos: true,
            perfil: true,
            permisos: true,
            historial: true,
            usuarios: true,
            controlRestaurantes: true
        },
        'supervisor': {
            tiendas: true,
            documentos: true,
            perfil: true,
            permisos: false,
            historial: true,
            usuarios: false,
            controlRestaurantes: false
        },
        'usuario': {
            tiendas: true,
            documentos: true,
            perfil: true,
            permisos: false,
            historial: false,
            usuarios: false,
            controlRestaurantes: false
        }
    };

    if (usuario.rol === 'admin') {
        return defaultPermissions.admin;
    }

    if (usuario.departamento?.modulos) {
        return {
            tiendas: false,
            documentos: false,
            historial: false,
            perfil: true,
            permisos: false,
            usuarios: false,
            controlRestaurantes: false,
            ...usuario.departamento.modulos
        };
    }

    // Si hay permisos guardados en localStorage, usarlos
    const savedPermissions = JSON.parse(localStorage.getItem('userPermissions') || '{}');

    if (usuario.id && savedPermissions[usuario.id]) {
        return {
            ...savedPermissions[usuario.id],
            tiendas: true,
            controlRestaurantes: usuario.rol === 'admin'
        };
    }

    // Si el usuario tiene permisos en su objeto, usarlos
    if (usuario.permisos) {
        return {
            ...usuario.permisos,
            tiendas: true,
            controlRestaurantes: usuario.rol === 'admin'
        };
    }
    
    return defaultPermissions[usuario.rol] || defaultPermissions['usuario'];
}

// Verificar si el usuario tiene acceso a la pagina actual
function verificarAccesoPagina(permisos) {
    const currentPath = window.location.pathname;
    
    // Mapeo de rutas a permisos
    const routePermissions = {
        '/views/tiendas': 'tiendas',
        '/views/editor': 'documentos',
        '/views/perfil': 'perfil',
        '/views/permisos': 'permisos',
        '/views/historial': 'historial',
        '/views/usuarios': 'usuarios',
        '/views/restaurantes': 'controlRestaurantes'
    };
    
    const requiredPermission = routePermissions[currentPath];
    
    // Si la pagina requiere permiso y el usuario no lo tiene
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const requiereAdmin = currentPath === '/views/restaurantes';

    if (
        requiredPermission &&
        (!permisos[requiredPermission] || (requiereAdmin && usuario.rol !== 'admin'))
    ) {
        Swal.fire({
            icon: 'error',
            title: 'Acceso denegado',
            text: 'No tienes permisos para acceder a esta seccion.',
            confirmButtonColor: '#2563eb'
        }).then(() => {
            const rutasDepartamento = {
                tiendas: '/views/tiendas',
                documentos: '/views/documentos',
                historial: '/views/historial'
            };
            const paginaDepartamento = usuario.departamento?.pagina_inicio;
            const destinoDepartamento = paginaDepartamento && permisos[paginaDepartamento]
                ? rutasDepartamento[paginaDepartamento]
                : null;
            const destino = destinoDepartamento || (permisos.tiendas
                ? '/views/tiendas'
                : permisos.documentos
                    ? '/views/documentos'
                    : permisos.historial
                        ? '/views/historial'
                        : usuario.rol === 'admin' && permisos.usuarios
                            ? '/views/usuarios'
                            : '/');
            window.location.href = destino;
        });
    }
}
