// ============================================
// ADMINISTRACION DE USUARIOS
// ============================================

let users = [];
let userToDelete = null;
let departments = [];

// Inicializar
document.addEventListener('DOMContentLoaded', async function () {
    await loadDepartments();
    await loadUsers();
});

async function loadDepartments() {
    const token = localStorage.getItem('token');

    if (!token || localStorage.getItem('modoOffline')) {
        departments = [
            { id: 1, codigo: 'contabilidad', nombre: 'Contabilidad', activo: true, total_usuarios: 2 },
            { id: 2, codigo: 'operaciones', nombre: 'Operaciones', activo: true, total_usuarios: 1 }
        ];
        renderDepartments();
        populateDepartmentSelect();
        populateDepartmentFilter();
        return;
    }

    try {
        const headers = { Authorization: `Bearer ${token}` };
        const departmentsResponse = await fetch(
            `${window.API_URL}/departamentos`,
            { headers }
        );
        const departmentsData = await departmentsResponse.json().catch(() => ({}));

        if (!departmentsResponse.ok) {
            throw new Error(
                departmentsData.message ||
                'No se pudieron cargar los departamentos'
            );
        }

        departments = departmentsData.departamentos || [];
        renderDepartments();
        populateDepartmentSelect();
        populateDepartmentFilter();
    } catch (error) {
        console.error('Error cargando departamentos:', error);
        const tbody = document.getElementById('departmentsTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5">
                        <div class="empty-state">
                            <i class="fa-solid fa-database"></i>
                            <p>${escapeHtml(error.message)}</p>
                        </div>
                    </td>
                </tr>
            `;
        }
    }
}

function populateDepartmentSelect() {
    const select = document.getElementById('userDepartment');
    if (!select) return;
    const currentValue = select.value;
    const activos = departments.filter(department => department.activo === true || department.activo === 1);

    select.innerHTML = '<option value="">Sin departamento</option>' +
        activos.map(department => `
            <option value="${department.id}">${escapeHtml(department.nombre)}</option>
        `).join('');
    select.value = currentValue;
}

function populateDepartmentFilter() {
    const select = document.getElementById('filterDepartment');
    if (!select) return;
    const currentValue = select.value;

    select.innerHTML = '<option value="">Todos</option>' + departments.map(department => `
        <option value="${department.id}">${escapeHtml(department.nombre)}</option>
    `).join('');
    select.value = currentValue;
}

function renderDepartments() {
    const tbody = document.getElementById('departmentsTableBody');
    const total = document.getElementById('totalDepartamentos');
    if (total) total.textContent = departments.length;
    if (!tbody) return;

    if (!departments.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state">
                        <i class="fa-solid fa-building-circle-xmark"></i>
                        <p>No hay departamentos registrados</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = departments.map(department => {
        const active = department.activo === true || department.activo === 1;
        return `
            <tr>
                <td>
                    <strong>${escapeHtml(department.nombre)}</strong>
                    <div class="user-email">${escapeHtml(department.descripcion || 'Sin descripcion')}</div>
                </td>
                <td><code>${escapeHtml(department.codigo)}</code></td>
                <td>${Number(department.total_usuarios || 0)}</td>
                <td><span class="status-badge ${active ? 'activo' : 'inactivo'}">${active ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                    <button class="action-btn edit" onclick="openDepartmentModal(${department.id})" title="Editar departamento">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button
                        class="action-btn department-state ${active ? 'is-disable' : 'is-enable'}"
                        onclick="toggleDepartmentStatus(${department.id}, ${!active})"
                        title="${active ? 'Desactivar' : 'Activar'} departamento"
                    >
                        <i class="fa-solid ${active ? 'fa-ban' : 'fa-power-off'}"></i>
                    </button>
                    <button
                        class="action-btn delete"
                        onclick="deleteDepartment(${department.id})"
                        title="Eliminar departamento"
                    >
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function switchAdminView(view) {
    const isDepartments = view === 'departamentos';
    document.getElementById('usuariosPanel').hidden = isDepartments;
    document.getElementById('departamentosPanel').hidden = !isDepartments;
    document.getElementById('btnNuevoUsuario').hidden = isDepartments;
    document.getElementById('btnNuevoDepartamento').hidden = !isDepartments;
    document.getElementById('tabUsuarios').classList.toggle('active', !isDepartments);
    document.getElementById('tabDepartamentos').classList.toggle('active', isDepartments);
}

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
        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            users = data.usuarios || data;

            renderUsers(users);
            updateStats();
        } else {
            throw new Error(data.message || data.mensaje || 'Error al cargar usuarios');
        }
    } catch (error) {
        console.error('Error:', error);
        // Mostrar mensaje de error
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <i class="fa-solid fa-exclamation-circle"></i>
                    <p>${escapeHtml(error.message || 'Error al cargar usuarios.')}</p>
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
        const departmentLabel = user.departamento_nombre || 'Sin departamento';

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
                <td><span class="department-badge">${escapeHtml(departmentLabel)}</span></td>
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
    const departmentFilter = document.getElementById('filterDepartment').value;

    const filtered = users.filter(user => {
        const matchesSearch =
            String(user.nombre || '').toLowerCase().includes(searchTerm) ||
            String(user.email || '').toLowerCase().includes(searchTerm) ||
            String(user.username || '').toLowerCase().includes(searchTerm) ||
            String(user.departamento_nombre || '').toLowerCase().includes(searchTerm);

        const matchesRole = !roleFilter || user.rol === roleFilter;
        const matchesStatus = !statusFilter || user.estado === statusFilter;
        const matchesDepartment = !departmentFilter ||
            String(user.departamento_id || '') === departmentFilter;

        return matchesSearch && matchesRole && matchesStatus && matchesDepartment;
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
    populateDepartmentSelect();

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
            document.getElementById('userDepartment').value = user.departamento_id || '';
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
        estado: document.getElementById('userStatus').value,
        departamento_id: document.getElementById('userDepartment').value || null
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

    if (!token || localStorage.getItem('modoOffline')) {

        users = users.filter(
            u => u.id !== userToDelete
        );

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

            throw new Error(
                data.message || 'Error al eliminar'
            );

        }

    } catch (error) {

        Swal.fire({
            icon: 'error',
            title: 'Error',
            text:
                error.message ||
                'No se pudo eliminar el usuario.'
        });

    }
}

// ============================================
// PERMISOS
// ============================================

function openPermissions(userId) {
    window.location.href = `/views/permisos/?userId=${userId}`;
}

// ============================================
// DEPARTAMENTOS
// ============================================

function openDepartmentModal(departmentId = null) {
    const modal = document.getElementById('departmentModal');
    const form = document.getElementById('departmentForm');
    const department = departments.find(item => item.id === departmentId);
    form.reset();
    document.getElementById('departmentId').value = department?.id || '';
    document.getElementById('departmentModalTitle').textContent = department
        ? 'Editar departamento'
        : 'Nuevo departamento';
    document.getElementById('departmentName').value = department?.nombre || '';
    document.getElementById('departmentCode').value = department?.codigo || '';
    document.getElementById('departmentDescription').value = department?.descripcion || '';
    document.getElementById('departmentStatus').value =
        department && !(department.activo === true || department.activo === 1)
            ? 'inactivo'
            : 'activo';
    modal.classList.add('active');
}

function closeDepartmentModal() {
    document.getElementById('departmentModal').classList.remove('active');
}

async function saveDepartment() {
    const id = document.getElementById('departmentId').value;
    const nombre = document.getElementById('departmentName').value.trim();
    const codigo = document.getElementById('departmentCode').value.trim();
    const descripcion = document.getElementById('departmentDescription').value.trim();
    const activo = document.getElementById('departmentStatus').value === 'activo';

    if (!nombre || !codigo) {
        await Swal.fire({
            icon: 'warning',
            title: 'Datos requeridos',
            text: 'Escribe el nombre y codigo del departamento.'
        });
        return;
    }

    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('modoOffline')) {
        const record = {
            id: id ? Number(id) : Date.now(),
            nombre,
            codigo,
            descripcion,
            activo,
            total_usuarios: 0
        };
        const index = departments.findIndex(item => item.id === record.id);
        if (index >= 0) departments[index] = { ...departments[index], ...record };
        else departments.push(record);
        renderDepartments();
        populateDepartmentSelect();
        populateDepartmentFilter();
        closeDepartmentModal();
        return;
    }

    try {
        const response = await fetch(
            id ? `${window.API_URL}/departamentos/${id}` : `${window.API_URL}/departamentos`,
            {
                method: id ? 'PUT' : 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ nombre, codigo, descripcion, activo })
            }
        );
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'No se pudo guardar el departamento');
        }

        closeDepartmentModal();
        await loadDepartments();
        await loadUsers();
        await Swal.fire({
            icon: 'success',
            title: id ? 'Departamento actualizado' : 'Departamento creado',
            text: data.message,
            timer: 1800,
            showConfirmButton: false
        });
    } catch (error) {
        await Swal.fire({
            icon: 'error',
            title: 'No se pudo guardar',
            text: error.message
        });
    }
}

async function toggleDepartmentStatus(departmentId, activar) {
    const department = departments.find(item => item.id === departmentId);
    if (!department) return;

    const confirmation = await Swal.fire({
        icon: activar ? 'question' : 'warning',
        title: activar ? 'Activar departamento' : 'Desactivar departamento',
        text: activar
            ? `Se habilitara nuevamente ${department.nombre}.`
            : `Los usuarios de ${department.nombre} perderan su sesion activa hasta que el departamento vuelva a habilitarse.`,
        showCancelButton: true,
        confirmButtonText: activar ? 'Si, activar' : 'Si, desactivar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: activar ? '#16834b' : '#a46612'
    });

    if (!confirmation.isConfirmed) return;

    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('modoOffline')) {
        department.activo = activar;
        renderDepartments();
        populateDepartmentSelect();
        return;
    }

    try {
        const response = await fetch(
            `${window.API_URL}/departamentos/${departmentId}/estado`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ activo: activar })
            }
        );
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'No se pudo cambiar el estado');
        }

        await loadDepartments();
        await loadUsers();
        await Swal.fire({
            icon: 'success',
            title: activar ? 'Departamento activado' : 'Departamento desactivado',
            text: data.message,
            timer: 1800,
            showConfirmButton: false
        });
    } catch (error) {
        await Swal.fire({
            icon: 'error',
            title: 'No se pudo cambiar el estado',
            text: error.message
        });
    }
}

async function deleteDepartment(departmentId) {
    const department = departments.find(item => item.id === departmentId);
    if (!department) return;
    const totalUsers = Number(department.total_usuarios || 0);
    const confirmation = await Swal.fire({
        icon: 'warning',
        title: 'Eliminar departamento',
        html: `
            <p>Se eliminara definitivamente <strong>${escapeHtml(department.nombre)}</strong>.</p>
            <p style="margin-top:8px;color:#64748b;">
                ${totalUsers
                    ? `${totalUsers} usuario(s) quedaran sin departamento, pero conservaran su cuenta y permisos.`
                    : 'Este departamento no tiene usuarios asignados.'}
            </p>
        `,
        showCancelButton: true,
        confirmButtonText: 'Eliminar definitivamente',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#b4232f'
    });

    if (!confirmation.isConfirmed) return;

    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('modoOffline')) {
        departments = departments.filter(item => item.id !== departmentId);
        users = users.map(user => String(user.departamento_id) === String(departmentId)
            ? { ...user, departamento_id: null, departamento_nombre: null }
            : user);
        renderDepartments();
        renderUsers(users);
        populateDepartmentSelect();
        populateDepartmentFilter();
        return;
    }

    try {
        const response = await fetch(
            `${window.API_URL}/departamentos/${departmentId}`,
            {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            }
        );
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'No se pudo eliminar el departamento');
        }

        await loadDepartments();
        await loadUsers();
        await Swal.fire({
            icon: 'success',
            title: 'Departamento eliminado',
            text: data.usuariosLiberados
                ? `${data.usuariosLiberados} usuario(s) quedaron sin departamento.`
                : data.message,
            timer: 2000,
            showConfirmButton: false
        });
    } catch (error) {
        await Swal.fire({
            icon: 'error',
            title: 'No se pudo eliminar',
            text: error.message
        });
    }
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

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
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
