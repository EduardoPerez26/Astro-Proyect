// Cliente para gestionar permisos desde el frontend (Admin)
const API_URL = 'http://localhost:3001/api';

document.addEventListener('DOMContentLoaded', () => {
    setupAdminUI();
});

async function setupAdminUI() {
    // Comprobar que el usuario es admin; si no, redirigir
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    if (usuario.rol !== 'admin') {
        await Swal.fire({
            icon: 'error',
            title: 'Acceso denegado',
            text: 'Solo administradores pueden gestionar permisos',
            confirmButtonColor: '#6366f1'
        });
        window.location.href = '/views/inicio';
        return;
    }

    // Mostrar enlace de permisos en el sidebar
    const adminItems = document.querySelectorAll('.admin-only');
    adminItems.forEach(i => i.style.display = '');

    const permisosList = document.getElementById('permisosList');
    const createPermBtn = document.getElementById('createPermBtn');
    const permName = document.getElementById('permName');
    const permDesc = document.getElementById('permDesc');
    const roleSelect = document.getElementById('roleSelect');
    const rolePerms = document.getElementById('rolePerms');
    const saveRolePermsBtn = document.getElementById('saveRolePermsBtn');

    await loadPermisos();
    await loadRolePerms(roleSelect.value);

    roleSelect.addEventListener('change', () => loadRolePerms(roleSelect.value));

    createPermBtn.addEventListener('click', async () => {
        const nombre = permName.value.trim();
        const descripcion = permDesc.value.trim();
        if (!nombre) {
            return Swal.fire({ icon: 'warning', title: 'Nombre requerido', confirmButtonColor: '#6366f1' });
        }

        const token = localStorage.getItem('token');
        createPermBtn.disabled = true;
        createPermBtn.textContent = 'Creando...';
        try {
            const res = await fetch(`${API_URL}/permissions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ nombre, descripcion })
            });

            const data = await res.json();
            if (res.ok && !data.error) {
                permName.value = '';
                permDesc.value = '';
                await loadPermisos();
                await loadRolePerms(roleSelect.value);
                Swal.fire({ icon: 'success', title: 'Permiso creado', timer: 1200, showConfirmButton: false });
            } else {
                Swal.fire({ icon: 'error', title: 'Error', text: data.mensaje || 'Error al crear permiso', confirmButtonColor: '#6366f1' });
            }
        } catch (err) {
            console.error(err);
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo crear permiso', confirmButtonColor: '#6366f1' });
        } finally {
            createPermBtn.disabled = false;
            createPermBtn.textContent = 'Crear permiso';
        }
    });

    saveRolePermsBtn.addEventListener('click', async () => {
        const checkboxes = Array.from(rolePerms.querySelectorAll('input[type="checkbox"]'));
        const permisos = checkboxes.filter(c => c.checked).map(c => c.dataset.perm);
        const rol = roleSelect.value;
        const token = localStorage.getItem('token');

        saveRolePermsBtn.disabled = true;
        saveRolePermsBtn.textContent = 'Guardando...';
        try {
            const res = await fetch(`${API_URL}/permissions/roles/${rol}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ permisos })
            });

            const data = await res.json();
            if (res.ok && !data.error) {
                Swal.fire({ icon: 'success', title: 'Permisos asignados', timer: 1000, showConfirmButton: false });
            } else {
                Swal.fire({ icon: 'error', title: 'Error', text: data.mensaje || 'Error al asignar permisos', confirmButtonColor: '#6366f1' });
            }
        } catch (err) {
            console.error(err);
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo asignar permisos', confirmButtonColor: '#6366f1' });
        } finally {
            saveRolePermsBtn.disabled = false;
            saveRolePermsBtn.textContent = 'Guardar asignaciones';
        }
    });

    async function loadPermisos() {
        permisosList.innerHTML = 'Cargando...';
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/permissions`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('No autorizado');
            const data = await res.json();
            if (data.error) throw new Error(data.mensaje || 'Error');

            if (data.permisos && data.permisos.length) {
                permisosList.innerHTML = '<ul>' + data.permisos.map(p => `<li><strong>${p.nombre}</strong> — ${p.descripcion || ''}</li>`).join('') + '</ul>';
            } else {
                permisosList.innerHTML = '<p>No hay permisos definidos.</p>';
            }
        } catch (err) {
            permisosList.innerHTML = '<p>Error cargando permisos.</p>';
            console.error(err);
        }
    }

    async function loadRolePerms(rol) {
        rolePerms.innerHTML = 'Cargando...';
        const token = localStorage.getItem('token');
        try {
            const [permsRes, roleRes] = await Promise.all([
                fetch(`${API_URL}/permissions`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${API_URL}/permissions/roles/${rol}`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (!permsRes.ok || !roleRes.ok) throw new Error('No autorizado');

            const permsData = await permsRes.json();
            const roleData = await roleRes.json();

            const assigned = new Set(roleData.permisos || []);

            if (permsData.permisos && permsData.permisos.length) {
                rolePerms.innerHTML = permsData.permisos.map(p => {
                    const checked = assigned.has(p.nombre) ? 'checked' : '';
                    return `<label style="display:block;"><input type="checkbox" data-perm="${p.nombre}" ${checked}/> ${p.nombre} — ${p.descripcion || ''}</label>`;
                }).join('');
            } else {
                rolePerms.innerHTML = '<p>No hay permisos disponibles.</p>';
            }
        } catch (err) {
            rolePerms.innerHTML = '<p>Error cargando datos.</p>';
            console.error(err);
        }
    }
}
