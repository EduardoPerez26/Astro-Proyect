// Login conectado al backend con MySQL
const API_URL = window.API_URL;

function obtenerRutaInicial(usuario) {
    const permisos = usuario?.permisos || {};
    const rutas = {
        dashboardAdmin: '/views/dashboard-admin',
        tiendas: '/views/tiendas',
        documentos: '/views/documentos',
        historial: '/views/historial'
    };
    const paginaConfigurada = permisos.paginaInicio;

    if (paginaConfigurada && permisos[paginaConfigurada] && rutas[paginaConfigurada]) {
        return rutas[paginaConfigurada];
    }

    if (permisos.tiendas) return '/views/tiendas';
    if (permisos.documentos) return '/views/documentos';
    if (permisos.historial) return '/views/historial';
    if (usuario?.rol === 'admin' && permisos.dashboardAdmin) return '/views/dashboard-admin';
    return '/';
}

document.addEventListener('DOMContentLoaded', function () {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const passwordToggle = document.getElementById('passwordToggle');

    // Verificar si ya hay una sesión activa.
    const token = localStorage.getItem('token');
    if (token) {
        verificarSesion(token);
    }

    if (passwordToggle && passwordInput) {
        passwordToggle.addEventListener('click', function () {
            const isVisible = passwordInput.type === 'text';
            passwordInput.type = isVisible ? 'password' : 'text';
            passwordToggle.setAttribute('aria-pressed', String(!isVisible));
            passwordToggle.setAttribute(
                'aria-label',
                isVisible ? 'Mostrar contraseña' : 'Ocultar contraseña'
            );
            passwordToggle.innerHTML = isVisible
                ? '<i class="fa-regular fa-eye" aria-hidden="true"></i>'
                : '<i class="fa-regular fa-eye-slash" aria-hidden="true"></i>';
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async function (event) {
            event.preventDefault();

            const username = usernameInput.value.trim();
            const password = passwordInput.value;

            if (!username || !password) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Completa los campos',
                    text: 'Ingresa tu usuario y contraseña para continuar.',
                    confirmButtonColor: '#102A43'
                });
                return;
            }

            setLoading(true);

            try {
                const response = await fetch(`${API_URL}/auth/login`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok && !data.error) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('usuario', JSON.stringify(data.usuario));
                    localStorage.setItem('isLoggedIn', 'true');
                    const rutaInicial = obtenerRutaInicial(data.usuario);

                    Swal.fire({
                        icon: 'success',
                        title: '¡Bienvenido!',
                        text: `Hola, ${data.usuario.nombre}`,
                        timer: 1500,
                        showConfirmButton: false
                    }).then(() => {
                        window.location.href = rutaInicial;
                    });
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'No pudimos iniciar sesión',
                        text: data.message || data.mensaje || 'El usuario o la contraseña no son correctos.',
                        confirmButtonColor: '#102A43'
                    });
                }
            } catch (error) {
                console.error('Error de conexión:', error);

                Swal.fire({
                    icon: 'error',
                    title: 'Sin conexión con el servidor',
                    html: `
                        <p>No pudimos validar tus credenciales en este momento.</p>
                        <p style="font-size: 13px; color: #64748b; margin-top: 10px;">
                            Verifica que el servidor esté disponible e inténtalo nuevamente.
                        </p>
                    `,
                    showCancelButton: true,
                    confirmButtonText: 'Reintentar',
                    cancelButtonText: 'Modo sin conexión',
                    confirmButtonColor: '#102A43'
                }).then((result) => {
                    if (result.isConfirmed) {
                        loginForm.requestSubmit();
                        return;
                    }

                    if (username === 'admin' && password === 'admin123') {
                        localStorage.setItem('token', 'offline-token');
                        localStorage.setItem('isLoggedIn', 'true');
                        localStorage.setItem('modoOffline', 'true');
                        localStorage.setItem('usuario', JSON.stringify({
                            id: 1,
                            nombre: 'Administrador',
                            username: 'admin',
                            rol: 'admin',
                            permisos: {
                                dashboardAdmin: true,
                                tiendas: true,
                                documentos: true,
                                perfil: true,
                                permisos: true,
                                historial: true,
                                usuarios: true,
                                controlRestaurantes: true,
                                paginaInicio: 'dashboardAdmin'
                            }
                        }));
                        window.location.href = '/views/dashboard-admin';
                    } else {
                        Swal.fire({
                            icon: 'info',
                            title: 'Modo sin conexión',
                            text: 'En modo offline usa: admin / admin123',
                            confirmButtonColor: '#102A43'
                        });
                    }
                });
            } finally {
                setLoading(false);
            }
        });
    }

    function setLoading(isLoading) {
        loginBtn.disabled = isLoading;
        loginForm.setAttribute('aria-busy', String(isLoading));
        loginBtn.innerHTML = isLoading
            ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Verificando...</span>'
            : '<span>Iniciar sesión</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
    }
});

// Verificar si el token guardado sigue siendo válido.
async function verificarSesion(token) {
    try {
        const response = await fetch(`${API_URL}/auth/verify`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.usuario) {
                localStorage.setItem('usuario', JSON.stringify(data.usuario));
            }
            window.location.href = obtenerRutaInicial(
                data.usuario || JSON.parse(localStorage.getItem('usuario') || '{}')
            );
            return;
        }

        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        localStorage.removeItem('isLoggedIn');
    } catch (error) {
        console.warn('No se pudo verificar la sesión:', error);
    }
}
