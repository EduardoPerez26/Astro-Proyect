// Login conectado al backend con MySQL.
const API_URL = window.API_URL;

function obtenerRutaInicial(usuario) {
    const rutas = {
        dashboardAdmin: '/views/dashboard-admin',
        systemErrors: '/views/system-errors',
        tiendas: '/views/tiendas',
        documentos: '/views/documentos',
        historial: '/views/historial',
        propertyManagement:
            '/views/departments/dashboard-property',
        propertyManagementDocuments:
            '/views/departments/property-management-documents',
        chat: '/views/chat'
    };

    const aliases = {
        propertySchedules: 'propertyManagement',
        propertySchedule: 'propertyManagement',
        propertyDocuments:
            'propertyManagementDocuments',
        propertyManagementSchedule:
            'propertyManagement',
        propertyManagementDocument:
            'propertyManagementDocuments'
    };

    let permisos = usuario?.permisos || {};

    if (typeof permisos === 'string') {
        try {
            permisos = JSON.parse(permisos);
        } catch (error) {
            permisos = {};
        }
    }

    const acciones =
        permisos?.acciones
        && typeof permisos.acciones === 'object'
            ? permisos.acciones
            : {};

    function normalizarModulo(value) {
        const moduleName =
            String(value || '').trim();

        return aliases[moduleName] || moduleName;
    }

    function puedeVer(moduleName) {
        const normalized =
            normalizarModulo(moduleName);

        if (!normalized) return false;

        if (permisos[normalized] === true) {
            return true;
        }

        return (
            acciones?.[normalized]?.ver === true
        );
    }

    const paginaConfigurada =
        normalizarModulo(
            permisos.paginaInicio
            || permisos.pagina_inicio
            || usuario?.paginaInicio
            || usuario?.pagina_inicio
            || usuario?.departamento?.paginaInicio
            || usuario?.departamento?.pagina_inicio
        );

    if (
        paginaConfigurada
        && rutas[paginaConfigurada]
        && puedeVer(paginaConfigurada)
    ) {
        return rutas[paginaConfigurada];
    }

    const departmentCode =
        String(
            usuario?.departamento?.codigo || ''
        ).toLowerCase();

    const preferredOrder = [
        'tiendas',
        'documentos',
        'historial',
        'propertyManagement',
        'propertyManagementDocuments',
        'chat',
        'dashboardAdmin',
        'systemErrors'
    ];

    if (
        ['property-management', 'pm']
            .includes(departmentCode)
    ) {
        preferredOrder.splice(
            preferredOrder.indexOf(
                'propertyManagement'
            ),
            1
        );

        preferredOrder.unshift(
            'propertyManagement'
        );
    }

    for (const moduleName of preferredOrder) {
        if (
            rutas[moduleName]
            && puedeVer(moduleName)
        ) {
            return rutas[moduleName];
        }
    }

    /*
     * Department fallback for legacy users whose permissions
     * were created before action permissions were introduced.
     */
    if (
        ['property-management', 'pm']
            .includes(departmentCode)
    ) {
        return rutas.propertyManagement;
    }

    return null;
}

function limpiarSesionLocal() {
    if (
        window.XBFSSessionPersistence &&
        typeof window.XBFSSessionPersistence.clear === 'function'
    ) {
        window.XBFSSessionPersistence.clear();
        return;
    }

    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('modoOffline');
}

function guardarSesion(data, mantenerSesion) {
    if (
        window.XBFSSessionPersistence &&
        typeof window.XBFSSessionPersistence.save === 'function'
    ) {
        window.XBFSSessionPersistence.save(
            data,
            Boolean(mantenerSesion)
        );
        return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem(
        'usuario',
        JSON.stringify(data.usuario)
    );
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.removeItem('modoOffline');
}

async function mostrarVerificacionCodigo({
    mfaToken,
    destino,
    mantenerSesion
}) {
    const resultado = await Swal.fire({
        icon: 'info',
        title: 'Verificación de identidad',
        html: `
            <p>Enviamos un código de 6 dígitos a:</p>
            <strong>${destino || 'tu correo registrado'}</strong>
        `,
        input: 'text',
        inputPlaceholder: 'Código de 6 dígitos',
        inputAttributes: {
            maxlength: 6,
            inputmode: 'numeric',
            autocomplete: 'one-time-code'
        },
        confirmButtonText: 'Verificar',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#102A43',
        allowOutsideClick: false,
        preConfirm: async (codigo) => {
            const codigoLimpio =
                String(codigo || '').trim();

            if (!/^\d{6}$/.test(codigoLimpio)) {
                Swal.showValidationMessage(
                    'Ingresa un código válido de 6 dígitos.'
                );
                return false;
            }

            try {
                const response = await fetch(
                    `${API_URL}/auth/verificar-codigo`,
                    {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            mfaToken,
                            codigo: codigoLimpio
                        })
                    }
                );

                const data = await response
                    .json()
                    .catch(() => ({}));

                if (!response.ok || data.error) {
                    throw new Error(
                        data.message ||
                        data.mensaje ||
                        'Código inválido.'
                    );
                }

                return data;
            } catch (error) {
                Swal.showValidationMessage(
                    error.message ||
                    'No se pudo verificar el código.'
                );
                return false;
            }
        }
    });

    if (!resultado.isConfirmed || !resultado.value) {
        return;
    }

    const data = resultado.value;

    guardarSesion(data, mantenerSesion);

    const rutaInicial =
        obtenerRutaInicial(data.usuario);

    await Swal.fire({
        icon: 'success',
        title: 'Bienvenido',
        text: `Hola, ${data.usuario.nombre}`,
        timer: 1200,
        showConfirmButton: false
    });

    {
                if (!rutaInicial) {
                limpiarSesionLocal();

                await Swal.fire({
                    icon: 'warning',
                    title: 'No available start page',
                    text:
                        'The account has no visible operational module. Review its View permissions and initial window.'
                });

                return;
            }

            const targetUrl = new URL(
                rutaInicial,
                window.location.origin
            );

                const targetPath =
                    targetUrl.pathname
                        .replace(/\/+$/, '')
                    || '/';

                if (
                    ['/', '/index', '/index.html']
                        .includes(targetPath)
                ) {
                    limpiarSesionLocal();

                    await Swal.fire({
                        icon: 'warning',
                        title: 'No initial page assigned',
                        text:
                            'Your account does not have an available start page. Contact an administrator to review its permissions.'
                    });

                    return;
                }

                window.location.replace(
                    targetUrl.pathname
                    + targetUrl.search
                    + targetUrl.hash
                );
            }
}

document.addEventListener(
    'DOMContentLoaded',
    function () {
        const loginForm =
            document.getElementById('loginForm');

        const loginBtn =
            document.getElementById('loginBtn');

        const usernameInput =
            document.getElementById('username');

        const passwordInput =
            document.getElementById('password');

        const passwordToggle =
            document.getElementById('passwordToggle');

        const rememberSessionInput =
            document.getElementById('rememberSession');

        const token = localStorage.getItem('token');

        if (token) {
            verificarSesion(token);
        }

        if (passwordToggle && passwordInput) {
            passwordToggle.addEventListener(
                'click',
                function () {
                    const isVisible =
                        passwordInput.type === 'text';

                    passwordInput.type =
                        isVisible ? 'password' : 'text';

                    passwordToggle.setAttribute(
                        'aria-pressed',
                        String(!isVisible)
                    );

                    passwordToggle.setAttribute(
                        'aria-label',
                        isVisible
                            ? 'Mostrar contrasena'
                            : 'Ocultar contrasena'
                    );

                    passwordToggle.innerHTML =
                        isVisible
                            ? '<i class="fa-regular fa-eye" aria-hidden="true"></i>'
                            : '<i class="fa-regular fa-eye-slash" aria-hidden="true"></i>';
                }
            );
        }

        if (!loginForm) return;

        loginForm.addEventListener(
            'submit',
            async function (event) {
                event.preventDefault();

                const username =
                    usernameInput.value.trim();

                const password =
                    passwordInput.value;

                const mantenerSesion =
                    Boolean(rememberSessionInput?.checked);

                if (!username || !password) {
                    await Swal.fire({
                        icon: 'warning',
                        title: 'Completa los campos',
                        text:
                            'Ingresa tu usuario y contrasena para continuar.',
                        confirmButtonColor: '#102A43'
                    });
                    return;
                }

                setLoading(true);

                try {
                    const response = await fetch(
                        `${API_URL}/auth/login`,
                        {
                            method: 'POST',
                            credentials: 'include',
                            headers: {
                                'Content-Type':
                                    'application/json'
                            },
                            body: JSON.stringify({
                                username,
                                password,
                                mantenerSesion
                            })
                        }
                    );

                    const data = await response
                        .json()
                        .catch(() => ({}));

                    if (!response.ok || data.error) {
                        throw new Error(
                            data.message ||
                            data.mensaje ||
                            'El usuario o la contrasena no son correctos.'
                        );
                    }

                    if (data.requiere_verificacion) {
                        await mostrarVerificacionCodigo({
                            mfaToken: data.mfaToken,
                            destino: data.destino,
                            mantenerSesion
                        });
                        return;
                    }

                    guardarSesion(
                        data,
                        mantenerSesion
                    );

                    const rutaInicial =
                        obtenerRutaInicial(data.usuario);

                    await Swal.fire({
                        icon: 'success',
                        title: 'Bienvenido',
                        text:
                            `Hola, ${data.usuario.nombre}`,
                        timer: 1200,
                        showConfirmButton: false
                    });

                    {
                if (!rutaInicial) {
                limpiarSesionLocal();

                await Swal.fire({
                    icon: 'warning',
                    title: 'No available start page',
                    text:
                        'The account has no visible operational module. Review its View permissions and initial window.'
                });

                return;
            }

            const targetUrl = new URL(
                rutaInicial,
                window.location.origin
            );

                const targetPath =
                    targetUrl.pathname
                        .replace(/\/+$/, '')
                    || '/';

                if (
                    ['/', '/index', '/index.html']
                        .includes(targetPath)
                ) {
                    limpiarSesionLocal();

                    await Swal.fire({
                        icon: 'warning',
                        title: 'No initial page assigned',
                        text:
                            'Your account does not have an available start page. Contact an administrator to review its permissions.'
                    });

                    return;
                }

                window.location.replace(
                    targetUrl.pathname
                    + targetUrl.search
                    + targetUrl.hash
                );
            }
                } catch (error) {
                    console.error(
                        'Error de login:',
                        error
                    );

                    await Swal.fire({
                        icon: 'error',
                        title:
                            'No pudimos iniciar sesion',
                        text:
                            error.message ||
                            'No se pudieron validar tus credenciales.',
                        confirmButtonColor: '#102A43'
                    });
                } finally {
                    setLoading(false);
                }
            }
        );

        function setLoading(isLoading) {
            loginBtn.disabled = isLoading;

            loginForm.setAttribute(
                'aria-busy',
                String(isLoading)
            );

            loginBtn.innerHTML = isLoading
                ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Verificando...</span>'
                : '<span>Entrar al hub</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
        }
    }
);

async function verificarSesion(token) {
    if (!token) return;

    const verifyFlag = 'xbfs_login_session_verifying';

    if (sessionStorage.getItem(verifyFlag) === 'true') {
        return;
    }

    sessionStorage.setItem(verifyFlag, 'true');

    const controller = new AbortController();
    const timeoutId = window.setTimeout(
        function () {
            controller.abort();
        },
        6500
    );

    try {
        if (!API_URL || API_URL === 'undefined') {
            throw new Error(
                'API_URL is not configured.'
            );
        }

        const response = await fetch(
            `${API_URL}/auth/verify`,
            {
                method: 'GET',
                credentials: 'include',
                headers: token
                    ? {
                        Authorization:
                            `Bearer ${token}`
                    }
                    : {},
                signal: controller.signal
            }
        );

        if (!response.ok) {
            if (
                response.status === 401
                || response.status === 403
            ) {
                limpiarSesionLocal();
            }

            return;
        }

        const data = await response
            .json()
            .catch(() => ({}));

        let storedUser = {};

        try {
            storedUser = JSON.parse(
                localStorage.getItem('usuario')
                || '{}'
            );
        } catch (error) {
            storedUser = {};
        }

        /*
         * /auth/verify may return a reduced user object.
         * Preserve permissions and department information stored
         * during login so route resolution does not fall back to /.
         */
        const verifiedUser = data.usuario || {};

        const usuario = {
            ...storedUser,
            ...verifiedUser,
            permisos:
                verifiedUser.permisos
                || storedUser.permisos
                || {},
            departamento:
                verifiedUser.departamento
                || storedUser.departamento
                || null
        };

        if (!usuario || !usuario.id) {
            limpiarSesionLocal();
            return;
        }

        localStorage.setItem(
            'usuario',
            JSON.stringify(usuario)
        );

        const rutaInicial =
            obtenerRutaInicial(usuario);

        if (!rutaInicial) {
                limpiarSesionLocal();

                await Swal.fire({
                    icon: 'warning',
                    title: 'No available start page',
                    text:
                        'The account has no visible operational module. Review its View permissions and initial window.'
                });

                return;
            }

            const targetUrl = new URL(
                rutaInicial,
                window.location.origin
            );

        const currentPath =
            window.location.pathname
                .replace(/\/+$/, '')
            || '/';

        const targetPath =
            targetUrl.pathname
                .replace(/\/+$/, '')
            || '/';

        const loginPaths = new Set([
            '/',
            '/index',
            '/index.html'
        ]);

        /*
         * Prevent the login page from redirecting to itself.
         * That was the source of the infinite reload loop.
         */
        if (
            loginPaths.has(targetPath)
            || targetPath === currentPath
        ) {
            console.warn(
                'The stored session has no valid initial route. '
                + 'The stale session was cleared to prevent a redirect loop.'
            );

            limpiarSesionLocal();
            return;
        }

        window.location.replace(
            targetUrl.pathname
            + targetUrl.search
            + targetUrl.hash
        );
    } catch (error) {
        if (error?.name === 'AbortError') {
            console.warn(
                'Session verification timed out. '
                + 'The login page will remain available.'
            );
        } else {
            console.warn(
                'Session could not be verified:',
                error
            );
        }
    } finally {
        window.clearTimeout(timeoutId);
        sessionStorage.removeItem(verifyFlag);
    }
}
