// Cliente para gestionar usuarios desde el frontend (Admin)
const API_URL = 'http://localhost:3001/api';

// Estado global
let allUsers = [];

document.addEventListener('DOMContentLoaded', () => {
    // Solo inicializar si estamos en la pestaña de usuarios
    if (document.getElementById('usuarios')) {
        setupUsersUI();
    }
});

async function loadStatsUser() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/users/stats/summary`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            console.warn('No se pudo cargar estadísticas');
            return;
        }
        
        const data = await res.json();
        
        if (data.error) {
            console.warn('Error en estadísticas:', data.mensaje);
            return;
        }
        
        const stats = data.stats;
        const totalUsuarios = document.getElementById('totalUsuarios');
        if (totalUsuarios) totalUsuarios.textContent = stats.total_usuarios || 0;
        
    } catch (err) {
        console.warn('Error cargando estadísticas:', err.message);
    }
}

async function setupUsersUI() {
    // Comprobar que el usuario es admin
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    if (usuario.rol !== 'admin') {
        return; // No hacer nada si no es admin
    }

    // Cargar datos iniciales
    await loadUsers();
    await loadUserStats();

    // Configurar event listeners
    setupUsersEventListeners();
}

function setupUsersEventListeners() {
    // Búsqueda de usuarios
    const searchInput = document.getElementById('searchUser');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            renderUsersTable(e.target.value);
        }, 300));
    }

    // Filtro por rol
    const filterRole = document.getElementById('filterRole');
    if (filterRole) {
        filterRole.addEventListener('change', () => renderUsersTable());
    }
}

// Función debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Cargar usuarios
async function loadUsers() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/usuarios`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        if (data.error) throw new Error(data.mensaje);

        allUsers = data.usuarios || [];
        renderUsersTable();

    } catch (err) {
        console.error('Error cargando usuarios:', err);
        const tbody = document.getElementById('usersTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center">
                        <div class="error-state">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>Error cargando usuarios</p>
                        </div>
                    </td>
                </tr>
            `;
        }
    }
}

async function cargarUsuarios() {
    try {
        const response = await fetch('/api/usuarios');
        const result = await response.json();

        const tbody = document.querySelector('#UsersTable tbody');
        const info = document.getElementById('usersInfo');

        if (!result.success) {
            throw new Error('Error al cargar usuarios');
        }

        const usuarios = result.data;

        info.textContent = `${usuarios.length} usuarios encontrados`;

        tbody.innerHTML = usuarios.map(usuario => `
            <tr>
                <td>${usuario.nombre_completo || ''}</td>
                <td>${usuario.username || ''}</td>
                <td>${usuario.email || ''}</td>
                <td>
                    <span class="role-badge ${usuario.rol}">
                        ${usuario.rol}
                    </span>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error(error);

        document.querySelector('#UsersTable tbody').innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center;color:red;padding:20px">
                    Error al cargar usuarios
                </td>
            </tr>
        `;
    }
}

// Renderizar tabla de usuarios
function renderUsersTable(searchTerm = '') {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    const filterRole = document.getElementById('filterRole')?.value || '';

    // Filtrar usuarios
    let filteredUsers = allUsers;

    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredUsers = filteredUsers.filter(u =>
            u.username.toLowerCase().includes(term) ||
            (u.nombre_completo && u.nombre_completo.toLowerCase().includes(term)) ||
            (u.email && u.email.toLowerCase().includes(term))
        );
    }

    if (filterRole) {
        filteredUsers = filteredUsers.filter(u => u.rol === filterRole);
    }

    if (filteredUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">
                    <div class="empty-state">
                        <i class="fas fa-users"></i>
                        <p>No se encontraron usuarios</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    filteredUsers.forEach(user => {
        const roleClass = user.rol === 'admin' ? 'admin' : user.rol === 'supervisor' ? 'supervisor' : 'usuario';
        const statusClass = user.activo ? 'activo' : 'inactivo';
        const fechaRegistro = new Date(user.fecha_creacion).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        html += `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: 600;">
                            ${user.username.charAt(0).toUpperCase()}
                        </div>
                        <span style="font-weight: 500;">${user.username}</span>
                    </div>
                </td>
                <td>${user.nombre_completo || '-'}</td>
                <td>${user.email || '-'}</td>
                <td>
                    <span class="role-badge ${roleClass}">
                        ${user.rol.charAt(0).toUpperCase() + user.rol.slice(1)}
                    </span>
                </td>
                <td>
                    <span class="status-badge ${statusClass}">
                        <i class="fas fa-circle" style="font-size: 8px;"></i>
                        ${user.activo ? 'Activo' : 'Inactivo'}
                    </span>
                </td>
                <td>${fechaRegistro}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon edit" onclick="editUser(${user.id})" title="Editar usuario">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn-icon delete" onclick="toggleUserStatus(${user.id}, ${user.activo})" title="${user.activo ? 'Desactivar' : 'Activar'} usuario">
                            <i class="fas fa-${user.activo ? 'ban' : 'check'}"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// Cargar estadísticas de usuarios
async function loadUserStats() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/usuarios/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            return;
        }

        const data = await res.json();

        if (data.error) return;

        const stats = data.stats;

        const totalUsuarios = document.getElementById('totalUsuarios');
        const usuariosActivos = document.getElementById('usuariosActivos');
        const adminCount = document.getElementById('adminCount');
        const ultimoRegistro = document.getElementById('ultimoRegistro');

        if (totalUsuarios) totalUsuarios.textContent = stats.total_usuarios || 0;
        if (usuariosActivos) usuariosActivos.textContent = stats.usuarios_activos || 0;
        if (adminCount) adminCount.textContent = stats.admin_count || 0;
        if (ultimoRegistro) {
            if (stats.ultimo_registro) {
                const fecha = new Date(stats.ultimo_registro);
                ultimoRegistro.textContent = fecha.toLocaleDateString('es-ES', {
                    month: 'short',
                    day: 'numeric'
                });
            } else {
                ultimoRegistro.textContent = '-';
            }
        }

    } catch (err) {
        console.warn('Error cargando estadísticas de usuarios:', err.message);
    }
}

// Mostrar modal de crear usuario
function showCreateUserModal() {
    const modal = document.getElementById('createUserModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('createUserForm')?.reset();
    }
}

// Cerrar modal de crear usuario
function closeCreateUserModal() {
    const modal = document.getElementById('createUserModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Toggle password visibility
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
        const icon = input.parentElement.querySelector('.password-toggle i');
        if (icon) {
            icon.className = input.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
        }
    }
}

// Crear usuario
async function createUser() {
    const username = document.getElementById('newUsername').value.trim();
    const nombre_completo = document.getElementById('newFullName').value.trim();
    const email = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('newPassword').value;
    const rol = document.getElementById('newRole').value;

    // Validaciones
    if (!username || !nombre_completo || !email || !password) {
        Swal.fire({
            icon: 'warning',
            title: 'Campos requeridos',
            text: 'Todos los campos marcados con * son obligatorios',
            confirmButtonColor: '#6366f1'
        });
        return;
    }

    if (password.length < 8) {
        Swal.fire({
            icon: 'warning',
            title: 'Contraseña débil',
            text: 'La contraseña debe tener al menos 8 caracteres',
            confirmButtonColor: '#6366f1'
        });
        return;
    }

    const token = localStorage.getItem('token');

    try {
        const res = await fetch(`${API_URL}/usuarios`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                username,
                nombre_completo,
                email,
                password,
                rol
            })
        });

        const data = await res.json();

        if (res.ok && !data.error) {
            closeCreateUserModal();
            await loadUsers();
            await loadUserStats();

            Swal.fire({
                icon: 'success',
                title: 'Usuario creado',
                text: data.mensaje || 'El usuario ha sido creado exitosamente',
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            throw new Error(data.mensaje || 'Error al crear usuario');
        }
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: err.message,
            confirmButtonColor: '#6366f1'
        });
    }
}

// Editar usuario (abre modal con datos)
async function editUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    // Por ahora, solo mostramos un mensaje
    // En una implementación completa, se abriría un modal de edición
    Swal.fire({
        icon: 'info',
        title: 'Editar Usuario',
        text: `Funcionalidad de edición para: ${user.username}`,
        confirmButtonColor: '#6366f1'
    });
}

// Activar/Desactivar usuario
async function toggleUserStatus(userId, currentStatus) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    const action = currentStatus ? 'desactivar' : 'activar';
    const actionText = currentStatus ? 'Desactivar' : 'Activar';

    const result = await Swal.fire({
        icon: 'question',
        title: `¿${actionText} usuario?`,
        text: `¿Estás seguro de que deseas ${action} al usuario "${user.username}"?`,
        showCancelButton: true,
        confirmButtonColor: currentStatus ? '#ef4444' : '#22c55e',
        cancelButtonColor: '#6b7280',
        confirmButtonText: `Sí, ${actionText}`,
        cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    const token = localStorage.getItem('token');

    try {
        const res = await fetch(`${API_URL}/usuarios/${userId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ activo: !currentStatus })
        });

        const data = await res.json();

        if (res.ok && !data.error) {
            await loadUsers();
            await loadUserStats();

            Swal.fire({
                icon: 'success',
                title: `${actionText.charAt(0).toUpperCase() + actionText.slice(1)}`,
                text: `Usuario ${actionText.toLowerCase()} exitosamente`,
                timer: 1500,
                showConfirmButton: false
            });
        } else {
            throw new Error(data.mensaje || `Error al ${action} usuario`);
        }
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: err.message,
            confirmButtonColor: '#6366f1'
        });
    }
}

// Cerrar modal al hacer click fuera
document.addEventListener('click', (e) => {
    const modal = document.getElementById('createUserModal');
    if (modal && e.target === modal) {
        closeCreateUserModal();
    }
});

// Cerrar modal con tecla Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeCreateUserModal();
    }
});