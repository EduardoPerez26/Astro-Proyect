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
    const mfaForm = document.getElementById('mfaForm');
    const loginBtn = document.getElementById('loginBtn');
    const mfaBtn = document.getElementById('mfaBtn');
    const mfaBackBtn = document.getElementById('mfaBackBtn');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const mfaCodeInput = document.getElementById('mfaCode');
    const passwordToggle = document.getElementById('passwordToggle');
    let pendingMfaToken = '';
    let pendingMfaUser = null;

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
                isVisible ? 'Show password' : 'Hide password'
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
                title: 'Complete the fields',
                text: 'Enter your username and password to continue.',
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
                    'The username or password is incorrect.'
                );
            }

            if (data.mfa_required) {
                mostrarPasoMfa(data);
                return;
            }

            completarInicioSesion(data);
        } catch (error) {
            console.error('Login error:', error);

            await Swal.fire({
                icon: 'error',
                title: 'We could not sign you in',
                text: error.message || 'Your credentials could not be validated.',
                confirmButtonColor: '#102A43'
            });
        } finally {
            setLoading(false);
        }
    });

    if (mfaForm) {
        mfaForm.addEventListener('submit', async function (event) {
            event.preventDefault();

            const code = String(mfaCodeInput?.value || '').replace(/\D/g, '');

            if (!/^\d{6}$/.test(code)) {
                await Swal.fire({
                    icon: 'warning',
                    title: 'Enter the code',
                    text: 'Type the 6-digit code from Microsoft Authenticator.',
                    confirmButtonColor: '#102A43'
                });
                return;
            }

            setMfaLoading(true);

            try {
                const response = await fetch(`${API_URL}/auth/mfa/login`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        mfaToken: pendingMfaToken,
                        code
                    })
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok || data.error) {
                    throw new Error(
                        data.message ||
                        data.mensaje ||
                        'The authenticator code is not valid.'
                    );
                }

                completarInicioSesion(data);
            } catch (error) {
                console.error('MFA login error:', error);

                await Swal.fire({
                    icon: 'error',
                    title: 'Code could not be verified',
                    text: error.message || 'Try again with a new code.',
                    confirmButtonColor: '#102A43'
                });
            } finally {
                setMfaLoading(false);
            }
        });
    }

    if (mfaBackBtn) {
        mfaBackBtn.addEventListener('click', function () {
            pendingMfaToken = '';
            pendingMfaUser = null;
            if (mfaCodeInput) mfaCodeInput.value = '';
            if (passwordInput) passwordInput.value = '';
            loginForm.hidden = false;
            if (mfaForm) mfaForm.hidden = true;
            usernameInput?.focus();
        });
    }

    if (mfaCodeInput) {
        mfaCodeInput.addEventListener('input', function () {
            mfaCodeInput.value = String(mfaCodeInput.value || '')
                .replace(/\D/g, '')
                .slice(0, 6);
        });
    }

    function mostrarPasoMfa(data) {
        pendingMfaToken = data.mfaToken || '';
        pendingMfaUser = data.usuario || null;
        loginForm.hidden = true;
        if (mfaForm) mfaForm.hidden = false;
        if (mfaCodeInput) {
            mfaCodeInput.value = '';
            mfaCodeInput.focus();
        }

        Swal.fire({
            icon: 'info',
            title: 'Authenticator required',
            text: `Enter the Microsoft Authenticator code${pendingMfaUser?.nombre ? ` for ${pendingMfaUser.nombre}` : ''}.`,
            timer: 1600,
            showConfirmButton: false
        });
    }

    async function completarInicioSesion(data) {
        if (!data.token || !data.usuario) {
            throw new Error('The sign-in response was incomplete.');
        }

            localStorage.setItem('token', data.token);
            localStorage.setItem('usuario', JSON.stringify(data.usuario));
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.removeItem('modoOffline');

            const rutaInicial = obtenerRutaInicial(data.usuario);

            await Swal.fire({
                icon: 'success',
                title: 'Welcome',
                text: `Hello, ${data.usuario.nombre}`,
                timer: 1200,
                showConfirmButton: false
            });

            window.location.href = rutaInicial;
    }

    function setLoading(isLoading) {
        loginBtn.disabled = isLoading;
        loginForm.setAttribute('aria-busy', String(isLoading));
        loginBtn.innerHTML = isLoading
            ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Verifying...</span>'
            : '<span>Enter the hub</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
    }

    function setMfaLoading(isLoading) {
        if (!mfaBtn || !mfaForm) return;

        mfaBtn.disabled = isLoading;
        mfaForm.setAttribute('aria-busy', String(isLoading));
        mfaBtn.innerHTML = isLoading
            ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Checking...</span>'
            : '<span>Verify code</span><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>';
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
        console.warn('Session could not be verified:', error);
    }
}
