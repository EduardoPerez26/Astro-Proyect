// ============================================
// ADMINISTRACION DE USUARIOS
// ============================================

window.API_URL
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

    // Modo offline - datos de ejemplo
    if (!token || localStorage.getItem('modoOffline')) {
        users = [
            { id: 1, nombre: 'Administrador', email: 'admin@empresa.com', username: 'admin', rol: 'admin', estado: 'activo', ultimo_acceso: '2024-01-15 10:30:00' },
            { id: 2, nombre: 'Juan Perez', email: 'juan@empresa.com', username: 'jperez', rol: 'supervisor', estado: 'activo', ultimo_acceso: '2024-01-14 15:45:00' },
            { id: 3, nombre: 'Maria Garcia', email: 'maria@empresa.com', username: 'mgarcia', rol: 'usuario', estado: 'activo', ultimo_acceso: '2024-01-13 09:20:00' },
            { id: 4, nombre: 'Carlos Lopez', email: 'carlos@empresa.com', username: 'clopez', rol: 'usuario', estado: 'inactivo', ultimo_acceso: '2024-01-10 14:00:00' }
        ];
        renderUsers(users);
        return;
    }

    try {
        const response = await fetch(`${window.API_URL}/usuarios`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            users = data.usuarios || data;

            renderUsers(users);
            updateStats();
        } else {
            throw new Error('Error al cargar usuarios');
        }
    } catch (error) {
        console.error('Error:', error);
        // Mostrar mensaje de error
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <i class="fa-solid fa-exclamation-circle"></i>
                    <p>Error al cargar usuarios. Verifica la conexion al servidor.</p>
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
        const initials = getInitials(user.nombre || user.nombre_completo || '');
        const roleClass = user.rol || 'usuario';
        const roleLabel = getRoleLabel(user.rol);
        // Manejar estado como booleano o string
        const isActive = user.activo === true || user.activo === 1 || user.estado === 'activo';
        const statusClass = isActive ? 'activo' : 'inactivo';
        const statusLabel = isActive ? 'Activo' : 'Inactivo';
        const lastAccess = user.fecha_creacion ? formatDate(user.fecha_creacion) : 'N/A';

        return `
            <tr data-id="${user.id}">
                <td>
                    <div class="user-cell">
                        <div class="user-avatar">${initials}</div>
                        <div class="user-info">
                            <span class="user-name">${user.nombre || user.nombre_completo || ''}</span>
                            <span class="user-email">@${user.username || ''}</span>
                        </div>
                    </div>
                </td>
                <td>${user.email}</td>
                <td><span class="status-badge ${roleClass}">${roleLabel}</span></td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                <td>${lastAccess}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn edit" onclick="editUser(${user.id})" title="Editar">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="action-btn view" onclick="openPermissions(${user.id})" title="Permisos">
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

function updateStats() {
    const total = users.length;

    const activos = users.filter(u =>
        u.activo === 1 ||
        u.activo === true ||
        u.estado === 'activo'
    ).length;

    const inactivos = total - activos;

    const admins = users.filter(u =>
        u.rol === 'admin'
    ).length;

    document.getElementById('totalUsuarios').textContent = total;
    document.getElementById('usuariosActivos').textContent = activos;
    document.getElementById('usuariosInactivos').textContent = inactivos;
    document.getElementById('usuariosAdmin').textContent = admins;
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
        nombre: document.getElementById('userName').value,
        email: document.getElementById('userEmail').value,
        username: document.getElementById('userUsername').value,
        password: document.getElementById('userPassword').value,
        rol: document.getElementById('userRole').value,
        estado: document.getElementById('userStatus').value
    };

    // Validaciones
    if (!userData.nombre || !userData.email || !userData.username || !userData.rol) {
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
            title: 'Contrasena requerida',
            text: 'Debes ingresar una contrasena para el nuevo usuario.'
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

    try {
        const url = userId
            ? `${API_URL}/usuarios/${userId}`
            : `${API_URL}/usuarios`;

        const method = userId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            closeUserModal();
            loadUsers();

            Swal.fire({
                icon: 'success',
                title: userId ? 'Usuario actualizado' : 'Usuario creado',
                text: data.message || 'Los cambios se guardaron correctamente.',
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            throw new Error(data.message || 'Error al guardar');
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

    // Modo offline
    if (!token || localStorage.getItem('modoOffline')) {
        users = users.filter(u => u.id !== userToDelete);
        renderUsers(users);
        closeDeleteModal();

        Swal.fire({
            icon: 'success',
            title: 'Usuario eliminado',
            timer: 2000,
            showConfirmButton: false
        });
        return;
    }

    try {
        const response = await fetch(`${window.API_URL}/usuarios/${userToDelete}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            closeDeleteModal();
            loadUsers();

            Swal.fire({
                icon: 'success',
                title: 'Usuario eliminado',
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            throw new Error(data.message || 'Error al eliminar');
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'No se pudo eliminar el usuario.'
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
