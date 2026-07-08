// Sidebar loader adapted for Astro, backend data, and permission control.
window.API_URL

document.addEventListener('DOMContentLoaded', async function () {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const topbarSidebarToggle = document.getElementById('topbarSidebarToggle');
    const logoutBtn = document.getElementById('logoutBtn');
    const mainContent = document.getElementById('mainContent');
    const sidebarSearchInput = document.getElementById('sidebarSearch');

    function isDesktopSidebar() {
        return !window.matchMedia || !window.matchMedia('(max-width: 1024px)').matches;
    }

    function setSidebarCollapsedState(collapsed, options = {}) {
        if (!sidebar) return;

        if (!isDesktopSidebar()) {
            sidebar.classList.remove('collapsed');
            mainContent?.classList.remove('sidebar-collapsed');
            document.body.classList.remove('sidebar-collapsed');
            document.documentElement.classList.remove('sidebar-collapsed-preset');
            return;
        }

        sidebar.classList.toggle('collapsed', collapsed);
        mainContent?.classList.toggle('sidebar-collapsed', collapsed);
        document.body.classList.toggle('sidebar-collapsed', collapsed);
        document.documentElement.classList.toggle('sidebar-collapsed-preset', collapsed);

        if (options.persist) {
            localStorage.setItem('sidebarCollapsed', String(collapsed));
        }
    }

    setSidebarCollapsedState(localStorage.getItem('sidebarCollapsed') === 'true');

    // Verify authentication.
    verificarAutenticacion();

    // Apply local context first to avoid a full-menu flash.
    cargarInfoUser();
    aplicarPermissions({ verificarPagina: false });

    // Refresh department and permissions from the database, then filter again.
    await actualizarContextoUser();
    cargarInfoUser();
    aplicarPermissions({ verificarPagina: true });

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

        setSidebarCollapsedState(!sidebar.classList.contains('collapsed'), { persist: true });
    }

    // Toggle sidebar
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }

    if (topbarSidebarToggle && sidebar) {
        topbarSidebarToggle.addEventListener('click', toggleSidebar);
    }

    // Mark the active link from the current URL.
    const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
    const menuLinks = Array.from(document.querySelectorAll('.sidebar-menu-link'));
    let activeLink = null;
    let activeHrefLength = -1;

    menuLinks.forEach(link => {
        const href = String(link.getAttribute('href') || '').replace(/\/+$/, '') || '/';
        const isMatch = currentPath === href || currentPath.startsWith(`${href}/`);

        link.classList.remove('active');

        if (isMatch && href.length > activeHrefLength) {
            activeLink = link;
            activeHrefLength = href.length;
        }
    });

    activeLink?.classList.add('active');

    menuLinks.forEach(link => {
        link.addEventListener('click', function () {
            if (isDesktopSidebar() && sidebar?.classList.contains('collapsed')) {
                localStorage.setItem('sidebarCollapsed', 'true');
                document.documentElement.classList.add('sidebar-collapsed-preset');
            }
        });
    });

    function applySidebarSearch() {
        const term = String(sidebarSearchInput?.value || '').trim().toLowerCase();
        const sections = document.querySelectorAll('.sidebar-section');

        sections.forEach(section => {
            let hasVisibleItem = false;

            section.querySelectorAll('.sidebar-menu-item').forEach(item => {
                const text = String(item.textContent || '').trim().toLowerCase();
                const isPermissionHidden = item.classList.contains('hidden');
                const isSearchHidden = Boolean(term && !text.includes(term));

                item.classList.toggle('sidebar-search-hidden', isSearchHidden);

                if (!isPermissionHidden && !isSearchHidden) {
                    hasVisibleItem = true;
                }
            });

            section.style.display = hasVisibleItem ? '' : 'none';
        });
    }

    window.applySidebarSearch = applySidebarSearch;

    if (sidebarSearchInput) {
        sidebarSearchInput.addEventListener('input', applySidebarSearch);
        applySidebarSearch();
    }

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            cerrarSesion();
        });
    }
    iniciarContadorChat();
    configurarMenuPerfil();
});

function configurarMenuPerfil() {
    const button = document.getElementById('userProfileMenuButton');
    const menu = document.getElementById('userProfileMenu');

    if (!button || !menu) return;

    button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();

        const isOpen = menu.classList.toggle('open');
        button.setAttribute('aria-expanded', String(isOpen));
    });

    menu.addEventListener('click', function (event) {
        event.stopPropagation();
    });

    document.addEventListener('click', function () {
        menu.classList.remove('open');
        button.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;

        menu.classList.remove('open');
        button.setAttribute('aria-expanded', 'false');
    });
}

// Close the current session.
async function cerrarSesion() {
    const token = localStorage.getItem('token');

    // Confirm logout.
    const result = await Swal.fire({
        title: 'Log out',
        text: 'Are you sure you want to log out?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#6B7280',
        confirmButtonText: 'Yes, log out',
        cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    // Try to close the session on the server.
    if (window.API_URL && !localStorage.getItem('modoOffline')) {
        try {
            await fetch(`${window.API_URL}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: token
                    ? { 'Authorization': `Bearer ${token}` }
                    : {}
            });
        } catch (error) {
            // Ignore logout errors.
        }
    }

    // Clear localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('modoOffline');
    localStorage.removeItem('sidebarCollapsed');

    // Redirigir al login
    window.location.href = '/';
}

// Verify that the user is authenticated.
function verificarAutenticacion() {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const currentPath = window.location.pathname;

    // Si no esta logueado y no esta en la pagina de login, redirigir
    if (!isLoggedIn && currentPath !== '/') {
        window.location.href = '/';
    }
}

async function actualizarContextoUser() {
    const token = localStorage.getItem('token');
    const apiUrl = window.API_URL;

    if (!apiUrl || localStorage.getItem('modoOffline')) return;

    try {
        const response = await fetch(`${apiUrl}/auth/verify`, {
            credentials: 'include',
            headers: token
                ? { Authorization: `Bearer ${token}` }
                : {}
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok && data.usuario) {
            localStorage.setItem('usuario', JSON.stringify(data.usuario));
            window.AppDepartment?.refresh?.();
        }
    } catch (error) {
        console.warn('User context could not be refreshed:', error);
    }
}

function resolverUrlFotoPerfil(url) {
    if (!url) return '';

    const value = String(url);
    if (/^(https?:|data:|blob:)/i.test(value)) return value;

    const apiBase = String(window.API_URL || '').replace(/\/$/, '');
    const apiOrigin = apiBase.replace(/\/api$/, '') || window.location.origin;

    return value.startsWith('/')
        ? `${apiOrigin}${value}`
        : `${apiOrigin}/${value}`;
}

function obtenerFotoPerfilUsuario(usuario = {}) {
    return usuario.foto_perfil_url ||
        usuario.fotoPerfilUrl ||
        usuario.foto_perfil ||
        usuario.foto ||
        usuario.avatar_url ||
        usuario.avatarUrl ||
        usuario.profile_photo_url ||
        usuario.photo_url ||
        '';
}

function aplicarAvatarUser(element, nombre, fotoUrl) {
    if (!element) return;

    const fotoResuelta = resolverUrlFotoPerfil(fotoUrl);

    if (fotoResuelta) {
        element.textContent = '';
        element.classList.add('has-image');
        element.style.setProperty('background-image', `url("${fotoResuelta}")`, 'important');
        element.style.setProperty('background-size', 'cover', 'important');
        element.style.setProperty('background-position', 'center', 'important');
        element.style.setProperty('background-repeat', 'no-repeat', 'important');
        return;
    }

    const iniciales = nombre
        ? nombre.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
        : '--';

    element.classList.remove('has-image');
    element.style.removeProperty('background-image');
    element.style.removeProperty('background-size');
    element.style.removeProperty('background-position');
    element.style.removeProperty('background-repeat');
    element.textContent = iniciales;
}

// Load user information in the header and sidebar.
function cargarInfoUser() {
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const departamento = window.AppDepartment?.refresh?.() || usuario.departamento || {
        label: 'AR',
        nombre: 'Accounts Receivable'
    };

    // Header elements
    const headerUserName = document.querySelector('.header-user-name');
    const headerUserRole = document.querySelector('.header-user-role');
    const avatars = document.querySelectorAll('.avatar');

    // Sidebar elements
    const sidebarUserName = document.getElementById('sidebarUserName');
    const sidebarUserRole = document.getElementById('sidebarUserRole');
    const sidebarUserAvatar = document.getElementById('sidebarUserAvatar');

    const roles = {
        'admin': 'Administrator',
        'supervisor': 'Supervisor',
        'usuario': 'User'
    };
    const etiquetaRole = roles[usuario.rol] || usuario.rol || 'Role';
    const etiquetaContexto = departamento?.nombre
        ? `${etiquetaRole} / ${departamento.nombre}`
        : etiquetaRole;

    // Refresh header
    if (headerUserName && usuario.nombre) {
        headerUserName.textContent = usuario.nombre;
    }
    if (headerUserRole && usuario.rol) {
        headerUserRole.textContent = etiquetaContexto;
    }
    if (avatars.length > 0) {
        const fotoPerfil = obtenerFotoPerfilUsuario(usuario);
        avatars.forEach((avatar) => {
            aplicarAvatarUser(avatar, usuario.nombre, fotoPerfil);
        });
    }

    // Refresh sidebar
    if (sidebarUserName) {
        sidebarUserName.textContent = usuario.nombre || 'User';
    }
    if (sidebarUserRole) {
        sidebarUserRole.textContent = etiquetaContexto;
    }
    if (sidebarUserAvatar) {
        aplicarAvatarUser(sidebarUserAvatar, usuario.nombre, obtenerFotoPerfilUsuario(usuario));
    }

    // Mostrar indicador de modo offline
    if (localStorage.getItem('modoOffline')) {
        const topbar = document.querySelector('.topbar');
        if (topbar && !document.querySelector('.offline-badge')) {
            const offlineIndicator = document.createElement('div');
            offlineIndicator.className = 'badge badge-warning offline-badge';
            offlineIndicator.style.marginRight = '10px';
            offlineIndicator.innerHTML = '<i class="fa-solid fa-wifi-slash"></i> Offline mode';
            topbar.insertBefore(offlineIndicator, topbar.firstChild);
        }
    }
}

window.cargarInfoUser = cargarInfoUser;

const START_PERMISSION_ORDER = [
    'dashboardAdmin',
    'tiendas',
    'documentos',
    'historial',
    'propertyManagement',
    'propertyManagementDocuments',
    'chat'
];

function resolverPaginaInicioPermitida(permisos, fallback = null) {
    if (permisos.paginaInicio && permisos[permisos.paginaInicio]) {
        return permisos.paginaInicio;
    }

    if (fallback && permisos[fallback]) {
        return fallback;
    }

    return START_PERMISSION_ORDER.find(codigo => permisos[codigo]) || null;
}

// Apply permissions to the sidebar menu.
function aplicarPermissions(opciones = {}) {
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const permisos = obtenerPermissions(usuario);

    // Get all menu items with data-permission.
    const menuItems = document.querySelectorAll('[data-permission]');

    menuItems.forEach(item => {
        const permiso = item.getAttribute('data-permission');
        const soloAdmin = item.hasAttribute('data-admin-only');

        // Check whether the user has the permission.
        if (!permisos[permiso] || (soloAdmin && usuario.rol !== 'admin')) {
            item.classList.add('hidden');
        } else {
            item.classList.remove('hidden');
        }
    });

    // Ocultar secciones vacias
    const sections = document.querySelectorAll('.sidebar-section');
    sections.forEach(section => {
        section.style.display = '';
        const visibleItems = section.querySelectorAll('.sidebar-menu-item:not(.hidden)');
        if (visibleItems.length === 0) {
            section.style.display = 'none';
        }
    });

    document
        .getElementById('sidebar')
        ?.classList.remove('sidebar-permissions-pending');

    window.applySidebarSearch?.();

    // Check access to the current page.
    if (opciones.verificarPagina !== false) {
        verificarAccesoPagina(permisos);
    }
}

// Get user permissions.
function obtenerPermissions(usuario) {
    const departmentCode = String(usuario.departamento?.codigo || '').toLowerCase();
    const esPropertyManagement = departmentCode === 'property-management' || departmentCode === 'pm';
    const defaultPermissions = {
        'admin': {
            dashboardAdmin: true,
            tiendas: true,
            documentos: true,
            perfil: true,
            permisos: true,
            historial: true,
            usuarios: true,
            controlRestaurants: true,
            propertyManagement: true,
            propertyManagementDocuments: true,
            chat: true
        },
        'supervisor': {
            tiendas: true,
            documentos: true,
            perfil: true,
            permisos: false,
            historial: true,
            usuarios: false,
            controlRestaurants: false,
            propertyManagement: false,
            propertyManagementDocuments: false,
            chat: false

        },
        'usuario': {
            tiendas: true,
            documentos: true,
            perfil: true,
            permisos: false,
            historial: false,
            usuarios: false,
            controlRestaurants: false,
            propertyManagement: false,
            propertyManagementDocuments: false,
            chat: false
        }
    };

    if (usuario.rol === 'admin') {
        const permisos = {
            ...defaultPermissions.admin,
            paginaInicio: usuario.permisos?.paginaInicio || 'dashboardAdmin'
        };
        permisos.paginaInicio = resolverPaginaInicioPermitida(permisos, 'dashboardAdmin');
        return permisos;
    }

    // Use permissions saved in localStorage when available.
    const savedPermissions = JSON.parse(localStorage.getItem('userPermissions') || '{}');

    if (usuario.id && savedPermissions[usuario.id]) {
        const permisosGuardados = savedPermissions[usuario.id];
        const tienePropertyManagement =
            permisosGuardados.propertyManagement === true ||
            (permisosGuardados.propertyManagement === undefined && esPropertyManagement);
        const permisos = {
            ...permisosGuardados,
            perfil: true,
            usuarios: false,
            permisos: false,
            controlRestaurants: false,
            propertyManagement: tienePropertyManagement,
            propertyManagementDocuments: permisosGuardados.propertyManagementDocuments === true ||
                (permisosGuardados.propertyManagementDocuments === undefined && tienePropertyManagement),
            chat: permisosGuardados.chat === true
        };
        permisos.paginaInicio = resolverPaginaInicioPermitida(permisos);
        return permisos;
    }

    // Use permissions from the user object when available.
    if (usuario.permisos) {
        const permisosGuardados = usuario.permisos;
        const tienePropertyManagement =
            permisosGuardados.propertyManagement === true ||
            (permisosGuardados.propertyManagement === undefined && esPropertyManagement);
        const tienePropertyManagementDocuments =
            permisosGuardados.propertyManagementDocuments === true ||
            (permisosGuardados.propertyManagementDocuments === undefined && tienePropertyManagement);
        const permisos = {
            tiendas: false,
            documentos: false,
            historial: false,
            ...permisosGuardados,
            perfil: true,
            usuarios: false,
            permisos: false,
            controlRestaurants: false,
            propertyManagement: tienePropertyManagement,
            propertyManagementDocuments: tienePropertyManagementDocuments,
            chat: permisosGuardados.chat === true,
            paginaInicio: permisosGuardados.paginaInicio ||
                (tienePropertyManagement ? 'propertyManagement' : undefined)
        };
        permisos.paginaInicio = resolverPaginaInicioPermitida(
            permisos,
            tienePropertyManagement ? 'propertyManagement' : null
        );
        return permisos;
    }

    return defaultPermissions[usuario.rol] || defaultPermissions['usuario'];
}

// Check whether the user can access the current page.
function verificarAccesoPagina(permisos) {
    const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';

    // Route-to-permission map.
    const routePermissions = {
        '/views/tiendas': 'tiendas',
        '/views/dashboard-admin': 'dashboardAdmin',
        '/views/documentos': 'documentos',
        '/views/perfil': 'perfil',
        '/views/permisos': 'permisos',
        '/views/historial': 'historial',
        '/views/usuarios': 'usuarios',
        '/views/restaurantes': 'controlRestaurants',
        '/views/departments/dashboard-property': 'propertyManagement',
        '/views/departments/property-management': 'propertyManagement',
        '/views/departments/property-management-documents': 'propertyManagementDocuments',
        '/views/chat': 'chat'
    };

    const requiredPermission = routePermissions[currentPath];

    // If the page requires a permission and the user does not have it.
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const requiereAdmin = [
        '/views/restaurantes',
        '/views/dashboard-admin',
        '/views/usuarios',
        '/views/permisos'
    ].includes(currentPath);

    if (
        requiredPermission &&
        (!permisos[requiredPermission] || (requiereAdmin && usuario.rol !== 'admin'))
    ) {
        Swal.fire({
            icon: 'error',
            title: 'Access denied',
            text: 'You do not have permission to access this section.',
            confirmButtonColor: '#2563eb'
        }).then(() => {
            const rutasDepartment = {
                dashboardAdmin: '/views/dashboard-admin',
                tiendas: '/views/tiendas',
                documentos: '/views/documentos',
                historial: '/views/historial',
                propertyManagement: '/views/departments/dashboard-property',
                propertyManagementDocuments: '/views/departments/property-management-documents',
                chat: '/views/chat'
            };
            const paginaConfigurada = permisos.paginaInicio;
            const destinoConfigurado = paginaConfigurada && permisos[paginaConfigurada]
                ? rutasDepartment[paginaConfigurada]
                : null;
            const destino = destinoConfigurado || (permisos.tiendas
                ? '/views/tiendas'
                : permisos.documentos
                    ? '/views/documentos'
                    : permisos.historial
                        ? '/views/historial'
                        : permisos.propertyManagement
                            ? '/views/departments/dashboard-property'
                            : permisos.propertyManagementDocuments
                                ? '/views/departments/property-management-documents'
                                : permisos.chat
                                    ? '/views/chat'
                                    : usuario.rol === 'admin' && permisos.dashboardAdmin
                                        ? '/views/dashboard-admin'
                                        : '/');
            window.location.href = destino;
        });
    }
}

let chatUnreadInterval = null;
let previousChatUnreadTotal = null;

async function actualizarContadorChat() {
    const badge = document.getElementById('chatUnreadBadge');
    const token = localStorage.getItem('token');

    if (!badge || !window.API_URL || !token) return;

    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const permisos = obtenerPermissions(usuario);

    if (!permisos.chat) {
        badge.hidden = true;
        previousChatUnreadTotal = null;
        return;
    }

    try {
        const response = await fetch(`${window.API_URL}/chat/no-leidos`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'No se pudo cargar el contador de chat');
        }

        const total = Number(data.total || 0);
        const chatLink = badge.closest('.sidebar-menu-link');

        badge.hidden = total <= 0;
        badge.textContent = total > 99 ? '99+' : String(total);
        badge.title = total > 0
            ? `${total} unread chat message${total === 1 ? '' : 's'}`
            : '';
        badge.setAttribute(
            'aria-label',
            total > 0
                ? `${total} unread chat message${total === 1 ? '' : 's'}`
                : 'No unread chat messages'
        );
        chatLink?.classList.toggle('has-unread-chat', total > 0);

        const currentPath = window.location.pathname;

        if (
            previousChatUnreadTotal !== null &&
            total > previousChatUnreadTotal &&
            currentPath !== '/views/chat'
        ) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'info',
                title: 'New chat message',
                showConfirmButton: false,
                timer: 2500,
                timerProgressBar: true
            });
        }

        previousChatUnreadTotal = total;
    } catch (error) {
        console.warn('Chat unread counter error:', error);
    }
}

function iniciarContadorChat() {
    if (chatUnreadInterval) return;

    actualizarContadorChat();

    chatUnreadInterval = setInterval(() => {
        actualizarContadorChat();
    }, 15000);
}

window.actualizarContadorChat = actualizarContadorChat;

