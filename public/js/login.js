// Login conectado al backend con MySQL.
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

function limpiarSesionLocal() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('modoOffline');
}

document.addEventListener('DOMContentLoaded', function () {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const passwordToggle = document.getElementById('passwordToggle');

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
                isVisible ? 'Mostrar contrasena' : 'Ocultar contrasena'
            );
            passwordToggle.innerHTML = isVisible
                ? '<i class="fa-regular fa-eye" aria-hidden="true"></i>'
                : '<i class="fa-regular fa-eye-slash" aria-hidden="true"></i>';
        });
    }

    if (!loginForm) return;

    loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            await Swal.fire({
                icon: 'warning',
                title: 'Completa los campos',
                text: 'Ingresa tu usuario y contrasena para continuar.',
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

            const data = await response.json().catch(() => ({}));

            if (!response.ok || data.error) {
                throw new Error(
                    data.message ||
                    data.mensaje ||
                    'El usuario o la contrasena no son correctos.'
                );
            }

            localStorage.setItem('token', data.token);
            localStorage.setItem('usuario', JSON.stringify(data.usuario));
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.removeItem('modoOffline');

            const rutaInicial = obtenerRutaInicial(data.usuario);

            await Swal.fire({
                icon: 'success',
                title: 'Bienvenido',
                text: `Hola, ${data.usuario.nombre}`,
                timer: 1200,
                showConfirmButton: false
            });

            window.location.href = rutaInicial;
        } catch (error) {
            console.error('Error de login:', error);

            await Swal.fire({
                icon: 'error',
                title: 'No pudimos iniciar sesion',
                text: error.message || 'No se pudieron validar tus credenciales.',
                confirmButtonColor: '#102A43'
            });
        } finally {
            setLoading(false);
        }
    });

    function setLoading(isLoading) {
        loginBtn.disabled = isLoading;
        loginForm.setAttribute('aria-busy', String(isLoading));
        loginBtn.innerHTML = isLoading
            ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Verificando...</span>'
            : '<span>Iniciar sesion</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
    }
});

async function verificarSesion(token) {
    try {
        const response = await fetch(`${API_URL}/auth/verify`, {
            method: 'GET',
            credentials: 'include',
            headers: token
                ? { Authorization: `Bearer ${token}` }
                : {}
        });

        if (response.ok) {
            const data = await response.json().catch(() => ({}));
            if (data.usuario) {
                localStorage.setItem('usuario', JSON.stringify(data.usuario));
            }
            window.location.href = obtenerRutaInicial(
                data.usuario || JSON.parse(localStorage.getItem('usuario') || '{}')
            );
            return;
        }

        limpiarSesionLocal();
    } catch (error) {
        console.warn('No se pudo verificar la sesion:', error);
    }
}
