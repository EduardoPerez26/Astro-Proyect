// ============================================
// USER ADMINISTRATION
// ============================================

let users = [];
let userToDelete = null;
let departments = [];

// Initialize
document.addEventListener('DOMContentLoaded', async function () {
    await loadDepartments();
    await loadUsers();
});

async function loadDepartments() {
    const token = localStorage.getItem('token');

    if (!token || localStorage.getItem('modoOffline')) {
        departments = [
            { id: 1, codigo: 'accounting', nombre: 'Accounting', activo: true, total_usuarios: 2 },
            { id: 2, codigo: 'operations', nombre: 'Operations', activo: true, total_usuarios: 1 }
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
                'Departments could not be loaded'
            );
        }

        departments = departmentsData.departamentos || [];
        renderDepartments();
        populateDepartmentSelect();
        populateDepartmentFilter();
    } catch (error) {
        console.error('Error loading departments:', error);
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

    select.innerHTML = '<option value="">No department</option>' +
        activos.map(department => `
            <option value="${department.id}">${escapeHtml(department.nombre)}</option>
        `).join('');
    select.value = currentValue;
}

function populateDepartmentFilter() {
    const select = document.getElementById('filterDepartment');
    if (!select) return;
    const currentValue = select.value;

    select.innerHTML = '<option value="">All</option>' + departments.map(department => `
        <option value="${department.id}">${escapeHtml(department.nombre)}</option>
    `).join('');
    select.value = currentValue;
}

function renderDepartments() {
    const tbody = document.getElementById('departmentsTableBody');
    const total = document.getElementById('totalDepartments');
    if (total) total.textContent = departments.length;
    if (!tbody) return;

    if (!departments.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state">
                        <i class="fa-solid fa-building-circle-xmark"></i>
                            <p>No departments registered</p>
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
                    <div class="user-email">${escapeHtml(department.descripcion || 'No description')}</div>
                </td>
                <td><code>${escapeHtml(department.codigo)}</code></td>
                <td>${Number(department.total_usuarios || 0)}</td>
                <td><span class="status-badge ${active ? 'activo' : 'inactivo'}">${active ? 'Active' : 'Inactive'}</span></td>
                <td>
                    <div class="department-actions">
                    <button class="action-btn edit" onclick="openDepartmentModal(${department.id})" title="Edit department">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button
                        class="action-btn department-state ${active ? 'is-disable' : 'is-enable'}"
                        onclick="toggleDepartmentStatus(${department.id}, ${!active})"
                        title="${active ? 'Disable' : 'Enable'} department"
                    >
                        <i class="fa-solid ${active ? 'fa-ban' : 'fa-power-off'}"></i>
                    </button>
                    <button
                        class="action-btn delete"
                        onclick="deleteDepartment(${department.id})"
                        title="Delete department"
                    >
                        <i class="fa-solid fa-trash"></i>
                    </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function switchAdminView(view) {
    const isDepartments = view === 'departamentos';
    document.getElementById('usuariosPanel').hidden = isDepartments;
    document.getElementById('departamentosPanel').hidden = !isDepartments;
    document.getElementById('btnNuevoUser').hidden = isDepartments;
    document.getElementById('btnNuevoDepartment').hidden = !isDepartments;
    document.getElementById('tabUsers').classList.toggle('active', !isDepartments);
    document.getElementById('tabDepartments').classList.toggle('active', isDepartments);
}

// ============================================
// LOAD USERS
// ============================================

async function loadUsers() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('usersTableBody');

    // Offline mode sample data
    if (!token || localStorage.getItem('modoOffline')) {
        users = [
            { id: 1, nombre: 'Administrator', email: 'admin@empresa.com', username: 'admin', rol: 'admin', estado: 'activo', ultimo_acceso: '2024-01-15 10:30:00' },
            { id: 2, nombre: 'John Carter', email: 'john@example.com', username: 'jcarter', rol: 'supervisor', estado: 'activo', ultimo_acceso: '2024-01-14 15:45:00' },
            { id: 3, nombre: 'Mary Garcia', email: 'mary@example.com', username: 'mgarcia', rol: 'usuario', estado: 'activo', ultimo_acceso: '2024-01-13 09:20:00' },
            { id: 4, nombre: 'Carlos Lopez', email: 'carlos@example.com', username: 'clopez', rol: 'usuario', estado: 'inactivo', ultimo_acceso: '2024-01-10 14:00:00' }
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
            throw new Error(data.message || data.mensaje || 'Users could not be loaded');
        }
    } catch (error) {
        console.error('Error:', error);
        // Show error message
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <i class="fa-solid fa-exclamation-circle"></i>
                    <p>${escapeHtml(error.message || 'Users could not be loaded.')}</p>
                </td>
            </tr>
        `;
    }
}

// ============================================
// RENDER USERS
// ============================================

function renderUsers(usersToRender) {
    const tbody = document.getElementById('usersTableBody');

    if (!usersToRender || usersToRender.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <i class="fa-solid fa-users-slash"></i>
                    <p>No users registered</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = usersToRender.map(user => {
        const initials = getInitials(user.nombre || user.nombre_completo || '');
        const roleClass = user.rol || 'usuario';
        const roleLabel = getRoleLabel(user.rol);
        // Support both boolean and string status values.
        const isActive = user.activo === true || user.activo === 1 || user.estado === 'activo';
        const statusClass = isActive ? 'activo' : 'inactivo';
        const statusLabel = isActive ? 'Active' : 'Inactive';
        const lastAccess = user.fecha_creacion ? formatDate(user.fecha_creacion) : 'N/A';
        const departmentLabel = user.departamento_nombre || 'No department';

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
                        <button class="action-btn edit" onclick="editUser(${user.id})" title="Edit">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="action-btn view" onclick="openPermissions(${user.id})" title="Permissions">
                            <i class="fa-solid fa-key"></i>
                        </button>
                        <button class="action-btn delete" onclick="deleteUser(${user.id}, '${user.nombre}')" title="Delete">
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

    document.getElementById('totalUsers').textContent = total;
    document.getElementById('usuariosActivos').textContent = activos;
    document.getElementById('usuariosInactivos').textContent = inactivos;
    document.getElementById('usuariosAdmin').textContent = admins;
}

// ============================================
// FILTER USERS
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
// USER MODAL
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
        // Edit mode
        title.textContent = 'Edit User';
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
        // Create mode
        title.textContent = 'New User';
        passwordHelp.style.display = 'none';
        passwordInput.required = true;
    }

    modal.classList.add('active');
}

function closeUserModal() {
    document.getElementById('userModal').classList.remove('active');
}

// ============================================
// SAVE USER
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

    // Validation
    if (!userData.nombre || !userData.email || !userData.username || !userData.rol) {
        Swal.fire({
            icon: 'warning',
            title: 'Required fields',
            text: 'Please complete all required fields.'
        });
        return;
    }

    if (!userId && !userData.password) {
        Swal.fire({
            icon: 'warning',
            title: 'Password required',
            text: 'Enter a password for the new user.'
        });
        return;
    }

    const token = localStorage.getItem('token');

    // Offline mode
    if (!token || localStorage.getItem('modoOffline')) {
        if (userId) {
            // Refresh local user
            const index = users.findIndex(u => u.id === parseInt(userId));
            if (index !== -1) {
                users[index] = { ...users[index], ...userData };
            }
        } else {
            // Create local user
            const newUser = {
                id: users.length + 1,
                ...userData,
                ultimo_acceso: 'Never'
            };
            users.push(newUser);
        }

        renderUsers(users);
        closeUserModal();

        Swal.fire({
            icon: 'success',
            title: userId ? 'User updated' : 'User created',
            text: 'Changes were saved successfully.',
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
                title: userId ? 'User updated' : 'User created',
                text: data.message || 'Changes were saved successfully.',
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            throw new Error(data.message || 'Save failed');
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'The user could not be saved.'
        });
    }
}

// ============================================
// EDIT USER
// ============================================

function editUser(userId) {
    openUserModal(userId);
}

// ============================================
// DELETE USER
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
            title: 'User deleted',
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
                title: 'User deleted',
                timer: 2000,
                showConfirmButton: false
            });

        } else {

            throw new Error(
                data.message || 'Delete failed'
            );

        }

    } catch (error) {

        Swal.fire({
            icon: 'error',
            title: 'Error',
            text:
                error.message ||
                'The user could not be deleted.'
        });

    }
}

// ============================================
// PERMISSIONS
// ============================================

function openPermissions(userId) {
    window.location.href = `/views/permisos/?userId=${userId}`;
}

// ============================================
// DEPARTMENTS
// ============================================

function openDepartmentModal(departmentId = null) {
    const modal = document.getElementById('departmentModal');
    const form = document.getElementById('departmentForm');
    const department = departments.find(item => item.id === departmentId);
    form.reset();
    document.getElementById('departmentId').value = department?.id || '';
    document.getElementById('departmentModalTitle').textContent = department
        ? 'Edit department'
        : 'New department';
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
            title: 'Required data',
            text: 'Enter the department name and code.'
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
            throw new Error(data.message || 'The department could not be saved');
        }

        closeDepartmentModal();
        await loadDepartments();
        await loadUsers();
        await Swal.fire({
            icon: 'success',
            title: id ? 'Department updated' : 'Department created',
            text: data.message,
            timer: 1800,
            showConfirmButton: false
        });
    } catch (error) {
        await Swal.fire({
            icon: 'error',
            title: 'Could not save',
            text: error.message
        });
    }
}

async function toggleDepartmentStatus(departmentId, activar) {
    const department = departments.find(item => item.id === departmentId);
    if (!department) return;

    const confirmation = await Swal.fire({
        icon: activar ? 'question' : 'warning',
        title: activar ? 'Enable department' : 'Disable department',
        text: activar
            ? `${department.nombre} will be enabled again.`
            : `Users in ${department.nombre} will lose their active sessions until the department is enabled again.`,
        showCancelButton: true,
        confirmButtonText: activar ? 'Yes, enable' : 'Yes, disable',
        cancelButtonText: 'Cancel',
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
            throw new Error(data.message || 'The status could not be changed');
        }

        await loadDepartments();
        await loadUsers();
        await Swal.fire({
            icon: 'success',
            title: activar ? 'Department enabled' : 'Department disabled',
            text: data.message,
            timer: 1800,
            showConfirmButton: false
        });
    } catch (error) {
        await Swal.fire({
            icon: 'error',
            title: 'Could not change status',
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
        title: 'Delete department',
        html: `
            <p><strong>${escapeHtml(department.nombre)}</strong> will be permanently deleted.</p>
            <p style="margin-top:8px;color:#64748b;">
                ${totalUsers
                    ? `${totalUsers} user(s) will remain without a department, but their accounts and permissions will stay active.`
                    : 'This department has no assigned users.'}
            </p>
        `,
        showCancelButton: true,
        confirmButtonText: 'Delete permanently',
        cancelButtonText: 'Cancel',
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
        let response = await fetch(
            `${window.API_URL}/departamentos/${departmentId}`,
            {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            }
        );
        let data = await response.json().catch(() => ({}));

        if (response.status === 404) {
            response = await fetch(
                `${window.API_URL}/departamentos/${departmentId}/eliminar`,
                {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            data = await response.json().catch(() => ({}));
        }

        if (response.status === 404) {
            const legacyResponse = await fetch(
                `${window.API_URL}/departamentos/${departmentId}`,
                {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        nombre: department.nombre,
                        codigo: department.codigo,
                        descripcion: department.descripcion || '',
                        activo: false
                    })
                }
            );
            const legacyData = await legacyResponse.json().catch(() => ({}));

            if (!legacyResponse.ok || !legacyData.success) {
                throw new Error(
                    legacyData.message || legacyData.mensaje ||
                    'The published backend does not support deleting departments yet'
                );
            }

            await loadDepartments();
            await loadUsers();
            await Swal.fire({
                icon: 'warning',
                title: 'Department disabled',
                text: 'Railway is still running an older backend version. The department was disabled and can be permanently deleted after deploying the updated backend.'
            });
            return;
        }

        if (!response.ok || !data.success) {
            throw new Error(data.message || data.mensaje || 'The department could not be deleted');
        }

        await loadDepartments();
        await loadUsers();
        await Swal.fire({
            icon: 'success',
            title: 'Department deleted',
            text: data.usuariosLiberados
                ? `${data.usuariosLiberados} user(s) now have no department.`
                : data.message,
            timer: 2000,
            showConfirmButton: false
        });
    } catch (error) {
        await Swal.fire({
            icon: 'error',
            title: 'Could not delete',
            text: error.message
        });
    }
}

// ============================================
// UTILITIES
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
        'admin': 'Administrator',
        'supervisor': 'Supervisor',
        'usuario': 'User'
    };
    return labels[role] || role;
}

function formatDate(dateString) {
    if (!dateString || dateString === 'Never') return 'Never';

    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
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

