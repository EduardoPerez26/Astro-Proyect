// ============================================
// ADMINISTRACION DE USUARIOS
// ============================================

window.API_URL = window.API_URL || 'http://localhost:3001/api';
let users = [];
let userToDelete = null;

// Inicializar
document.addEventListener('DOMContentLoaded', function () {
    loadUsers();
});

// ============================================
// CARGAR USUARIOS
// ============================================

async function loadUsers() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('usersTableBody');

    try {
        const response = await fetch(`${window.API_URL}/usuarios`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.mensaje || 'Error al cargar usuarios');
        }

        users = (data.usuarios || []).map(user => ({
            id: user.id,
            nombre: user.nombre_completo,
            email: user.email,
            username: user.username,
            rol: user.rol,
            estado: user.activo ? 'activo' : 'inactivo',
            ultimo_acceso: user.fecha_creacion
        }));

        renderUsers(users);

    } catch (error) {
        console.error('Error cargando usuarios:', error);

        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <i class="fa-solid fa-exclamation-circle"></i>
                    <p>${error.message}</p>
                </td>
            </tr>
        `;
    }
}

// ============================================
// RENDERIZAR USUARIOS
// ============================================

function renderUsers(usersToRender) {
    const tbody = document.getElementById('usersTableBody');

    if (!usersToRender || usersToRender.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <i class="fa-solid fa-users-slash"></i>
                    <p>No hay usuarios registrados</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = usersToRender.map(user => {
        const initials = getInitials(user.nombre);
        const roleClass = user.rol;
        const roleLabel = getRoleLabel(user.rol);
        const statusClass = user.estado;
        const statusLabel = user.estado === 'activo' ? 'Activo' : 'Inactivo';
        const lastAccess = formatDate(user.ultimo_acceso);

        return `
            <tr data-id="${user.id}">
                <td>
                    <div class="user-info">
                        <div class="user-avatar">${initials}</div>
                        <div>
                            <div class="user-name">${user.nombre}</div>
                            <div class="user-username">@${user.username}</div>
                        </div>
                    </div>
                </td>
                <td>${user.email}</td>
                <td><span class="role-badge ${roleClass}">${roleLabel}</span></td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                <td>${lastAccess}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn edit" onclick="editUser(${user.id})" title="Editar">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="action-btn permissions" onclick="openPermissions(${user.id})" title="Permisos">
                            <i class="fa-solid fa-key"></i>
                        </button>
                        <button class="action-btn delete" onclick="deleteUser(${user.id}, '${user.nombre}')" title="Eliminar">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================
// FILTRAR USUARIOS
// ============================================

function filterUsers() {
    const searchTerm = document.getElementById('searchUsers').value.toLowerCase();
    const roleFilter = document.getElementById('filterRole').value;
    const statusFilter = document.getElementById('filterStatus').value;

    const filtered = users.filter(user => {
        const matchesSearch =
            user.nombre.toLowerCase().includes(searchTerm) ||
            user.email.toLowerCase().includes(searchTerm) ||
            user.username.toLowerCase().includes(searchTerm);

        const matchesRole = !roleFilter || user.rol === roleFilter;
        const matchesStatus = !statusFilter || user.estado === statusFilter;

        return matchesSearch && matchesRole && matchesStatus;
    });

    renderUsers(filtered);
}

// ============================================
// MODAL USUARIO
// ============================================

function openUserModal(userId = null) {
    const modal = document.getElementById('userModal');
    const form = document.getElementById('userForm');
    const title = document.getElementById('modalTitle');
    const passwordHelp = document.getElementById('passwordHelp');
    const passwordInput = document.getElementById('userPassword');

    form.reset();
    document.getElementById('userId').value = '';

    if (userId) {
        // Modo edicion
        title.textContent = 'Editar Usuario';
        passwordHelp.style.display = 'block';
        passwordInput.required = false;

        const user = users.find(u => u.id === userId);
        if (user) {
            document.getElementById('userId').value = user.id;
            document.getElementById('userName').value = user.nombre;
            document.getElementById('userEmail').value = user.email;
            document.getElementById('userUsername').value = user.username;
            document.getElementById('userRole').value = user.rol;
            document.getElementById('userStatus').value = user.estado;
        }
    } else {
        // Modo creacion
        title.textContent = 'Nuevo Usuario';
        passwordHelp.style.display = 'none';
        passwordInput.required = true;
    }

    modal.classList.add('active');
}

function closeUserModal() {
    document.getElementById('userModal').classList.remove('active');
}

// ============================================
// GUARDAR USUARIO
// ============================================

async function saveUser() {
    const userId = document.getElementById('userId').value;
    const userData = {
        nombre_completo: document.getElementById('userName').value.trim(),
        email: document.getElementById('userEmail').value.trim(),
        username: document.getElementById('userUsername').value.trim(),
        password: document.getElementById('userPassword').value,
        rol: document.getElementById('userRole').value,
        activo: document.getElementById('userStatus').value === 'activo'
    };

    // Validaciones locales
    if (!userData.nombre_completo || !userData.email || !userData.username || !userData.rol) {
        Swal.fire({
            icon: 'warning',
            title: 'Campos requeridos',
            text: 'Por favor completa todos los campos obligatorios.'
        });
        return;
    }

    if (!userId && !userData.password) {
        Swal.fire({
            icon: 'warning',
            title: 'Contraseña requerida',
            text: 'Debes ingresar una contraseña para el nuevo usuario.'
        });
        return;
    }

    if (userData.password && userData.password.length < 8) {
        Swal.fire({
            icon: 'warning',
            title: 'Contraseña inválida',
            text: 'La contraseña debe tener al menos 8 caracteres.'
        });
        return;
    }

    const token = localStorage.getItem('token');

    // Modo offline
    if (!token || localStorage.getItem('modoOffline')) {
        if (userId) {
            // Actualizar usuario local
            const index = users.findIndex(u => u.id === parseInt(userId));
            if (index !== -1) {
                users[index] = { ...users[index], ...userData };
            }
        } else {
            // Crear usuario local
            const newUser = {
                id: users.length + 1,
                ...userData,
                ultimo_acceso: 'Nunca'
            };
            users.push(newUser);
        }

        renderUsers(users);
        closeUserModal();

        Swal.fire({
            icon: 'success',
            title: userId ? 'Usuario actualizado' : 'Usuario creado',
            text: 'Los cambios se guardaron correctamente.',
            timer: 2000,
            showConfirmButton: false
        });
        return;
    }

    // Enviar al backend
    try {
        const url = userId
            ? `${API_URL}/usuarios/${userId}`
            : `${API_URL}/usuarios`;

        const method = userId ? 'PUT' : 'POST';

        console.log('Enviando usuario:', userData); // Para depuración

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (response.ok && !data.error) {
            closeUserModal();
            loadUsers();

            Swal.fire({
                icon: 'success',
                title: userId ? 'Usuario actualizado' : 'Usuario creado',
                text: data.mensaje || 'Los cambios se guardaron correctamente.',
                timer: 2000,
                showConfirmButton: false
            });
        } else if (response.status === 409) {
            // Conflicto: username o email duplicado
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: data.mensaje || 'El nombre de usuario o correo electrónico ya existe.'
            });
        } else if (response.status === 400) {
            // Validaciones del backend
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: data.mensaje || 'Datos inválidos. Revisa los campos.'
            });
        } else {
            throw new Error(data.mensaje || 'Error al guardar el usuario.');
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'No se pudo guardar el usuario.'
        });
    }
}

// ============================================
// EDITAR USUARIO
// ============================================

function editUser(userId) {
    openUserModal(userId);
}

// ============================================
// ELIMINAR USUARIO
// ============================================

function deleteUser(userId, userName) {
    userToDelete = userId;
    document.getElementById('deleteUserName').textContent = userName;
    document.getElementById('deleteModal').classList.add('active');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('active');
    userToDelete = null;
}

async function confirmDelete() {
    if (!userToDelete) return;

    const token = localStorage.getItem('token');

    try {
        const response = await fetch(
            `${window.API_URL}/usuarios/${userToDelete}`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        console.log('DELETE STATUS:', response.status);
        console.log('DELETE RESPONSE:', data);

        if (response.ok && !data.error) {

            // Eliminar usuario de la lista local
            users = users.filter(u => u.id !== userToDelete);
            renderUsers(users);

            closeDeleteModal();

            Swal.fire({
                icon: 'success',
                title: 'Usuario eliminado',
                text: data.mensaje,
                timer: 2000,
                showConfirmButton: false
            });

        } else {
            throw new Error(data.mensaje || 'Error al eliminar');
        }

    } catch (error) {
        console.error(error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message
        });
    }
}

// ============================================
// PERMISOS
// ============================================

function openPermissions(userId) {
    window.location.href = `/views/permisos?userId=${userId}`;
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

function formatDate(dateString) {
    if (!dateString || dateString === 'Nunca') return 'Nunca';

    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateString;
    }
}
