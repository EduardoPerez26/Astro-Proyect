// Login conectado al Backend con MySQL
// Configuracion de la API


const API_URL = window.API_URL;

document.addEventListener('DOMContentLoaded', function () {
    const loginBtn = document.getElementById('loginBtn');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');



    // Verificar si ya hay sesion activa
    const token = localStorage.getItem('token');
    if (token) {
        verificarSesion(token);
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', async function () {
            const username = usernameInput.value.trim();
            const password = passwordInput.value.trim();

            if (!username || !password) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Campos vacios',
                    text: 'Por favor ingresa usuario y contrasena',
                    confirmButtonColor: '#6366f1'
                });
                return;
            }

            // Mostrar loading
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';

            try {

                console.log('Username:', username);
                console.log('Password:', password);
                console.log('API URL:', window.API_URL);
                const response = await fetch(`${window.API_URL}/auth/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        username,
                        password
                    })
                });

                const data = await response.json();

                console.log('Status:', response.status);
                console.log('Response:', data);

                if (response.ok && !data.error) {
                    // Guardar token y datos del usuario
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('usuario', JSON.stringify(data.usuario));
                    localStorage.setItem('isLoggedIn', 'true');

                    Swal.fire({
                        icon: 'success',
                        title: 'Bienvenido!',
                        text: `Hola ${data.usuario.nombre}`,
                        timer: 1500,
                        showConfirmButton: false
                    }).then(() => {
                        window.location.href = '/views/inicio';
                    });
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error de autenticacion',
                        text: data.message || 'Usuario o contrasena incorrectos',
                        confirmButtonColor: '#6366f1'
                    });
                }
            } catch (error) {
                console.error('Error de conexion:', error);

                // Si no hay conexion al backend, mostrar opcion de modo offline
                Swal.fire({
                    icon: 'error',
                    title: 'Error de conexion',
                    html: `
                        <p>No se pudo conectar al servidor.</p>
                        <p style="font-size: 13px; color: #666; margin-top: 10px;">
                            Asegurate de que el backend este corriendo en <code>${API_URL}</code>
                        </p>
                    `,
                    showCancelButton: true,
                    confirmButtonText: 'Reintentar',
                    cancelButtonText: 'Modo sin conexion',
                    confirmButtonColor: '#6366f1'
                }).then((result) => {
                    if (!result.isConfirmed) {
                        // Modo offline con credenciales por defecto
                        if (username === 'admin' && password === 'admin123') {
                            localStorage.setItem('isLoggedIn', 'true');
                            localStorage.setItem('modoOffline', 'true');
                            window.location.href = '/views/inicio';
                        } else {
                            Swal.fire({
                                icon: 'info',
                                title: 'Modo sin conexion',
                                text: 'En modo offline usa: admin / admin123',
                                confirmButtonColor: '#6366f1'
                            });
                        }
                    }
                });
            } finally {
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Iniciar sesion';
            }
        });
    }

    // Enter key to login
    if (passwordInput) {
        passwordInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                loginBtn.click();
            }
        });
    }
});

// Verificar si el token es valido
async function verificarSesion(token) {
    console.log('Username:', username);
    console.log('Password:', password);
    console.log('API URL:', window.API_URL);
    try {
        const response = await fetch(`${window.API_URL}/auth/verificar`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            // Token valido, redirigir al dashboard
            window.location.href = '/views/inicio';
        } else {
            // Token invalido, limpiar storage
            localStorage.removeItem('token');
            localStorage.removeItem('usuario');
            localStorage.removeItem('isLoggedIn');
        }
    } catch (error) {
        // Error de conexion, no hacer nada
        console.log('No se pudo verificar sesion:', error);
    }
}


