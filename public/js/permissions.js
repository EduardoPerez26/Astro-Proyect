// Cliente para gestionar permisos desde el frontend (Admin)
const API_URL = 'http://localhost:3001/api';

// Estado global
let allPermisos = [];
let allCategorias = [];
let allRoles = [];
let currentRole = '';

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

    // Cargar datos inicialesa
    await Promise.all([
        loadCategorias(),
        loadPermisos(),
        loadRoles(),
        loadStats(),
        loadHistory()
    ]);

    // Configurar event listeners
    setupEventListeners();
}

const reloadHistoryBtn = document.getElementById('reloadHistoryBtn');

if (reloadHistoryBtn) {
    reloadHistoryBtn.addEventListener('click', loadHistory);
}

function setupEventListeners() {
    // Formulario de crear permiso
    const createForm = document.getElementById('createPermissionForm');
    createForm.addEventListener('submit', handleCreatePermission);

    // Búsqueda de permisos
    const searchInput = document.getElementById('searchPermission');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            renderPermisosPorCategoria(searchInput.value);
        }, 300));
    }

    // Filtro por categoría
    const categoriaFilter = document.getElementById('categoriaFilter');
    if (categoriaFilter) {
        categoriaFilter.addEventListener('change', () => renderPermisosPorCategoria());
    }

    // Selector de rol
    const roleSelect = document.getElementById('roleSelect');
    if (roleSelect) {
        roleSelect.addEventListener('change', () => loadRolePermissions(roleSelect.value));
    }

    // Botón guardar asignaciones
    const saveBtn = document.getElementById('saveRolePermsBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', handleSaveRolePermissions);
    }

    // Preview del icono
    const iconSelect = document.getElementById('permIcono');
    if (iconSelect) {
        iconSelect.addEventListener('change', (e) => {
            const preview = document.getElementById('iconPreview');
            if (preview) {
                preview.className = `fas ${e.target.value} preview-icon`;
            }
        });
    }
}

// Función debounce para búsqueda
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

// Función global para recargar todos los datos
async function refreshData() {
    const btn = document.querySelector('.page-header-actions .btn-primary');
    if (btn) {
        btn.classList.add('loading');
        btn.disabled = true;
    }
    
    await Promise.all([
        loadCategorias(),
        loadPermisos(),
        loadRoles(),
        loadStats(),
        loadHistory()
    ]);
    
    if (currentRole) {
        await loadRolePermissions(currentRole);
    }
    
    if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
    
    Swal.fire({
        icon: 'success',
        title: 'Datos actualizados',
        timer: 1500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
    });
}

// Función para exportar permisos
async function exportPermissions() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/permissions/export`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'permisos.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            Swal.fire({
                icon: 'success',
                title: 'Exportado',
                timer: 1500,
                showConfirmButton: false
            });
        }
    } catch (err) {
        console.error('Error exportando permisos:', err);
    }
}

// Cargar categorías
async function loadCategorias() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/permissions/categories`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            console.warn('No se pudo cargar categorías, usando lista vacía');
            allCategorias = [];
            return;
        }
        
        const data = await res.json();
        
        if (data.error) {
            console.warn('Error en respuesta de categorías:', data.mensaje);
            allCategorias = [];
            return;
        }
        
        allCategorias = data.categorias || [];
        
        // Actualizar select de categorías en formulario
        const select = document.getElementById('permCategoria');
        if (select) {
            select.innerHTML = '<option value="">Sin categoría</option>';
            allCategorias.forEach(cat => {
                select.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`;
            });
        }
        
        // Actualizar filtro de categorías
        const filter = document.getElementById('categoriaFilter');
        if (filter) {
            filter.innerHTML = '<option value="">Todas las categorías</option>';
            allCategorias.forEach(cat => {
                filter.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`;
            });
        }
        
    } catch (err) {
        console.warn('Error cargando categorías (continuando sin ellas):', err.message);
        allCategorias = [];
    }
}

// Cargar permisos
async function loadPermisos() {
    const token = localStorage.getItem('token');
    const categoriaId = document.getElementById('categoriaFilter')?.value;
    
    try {
        let url = `${API_URL}/permissions`;
        if (categoriaId) {
            url += `?categoria=${categoriaId}`;
        }
        
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        
        const data = await res.json();
        
        if (data.error) throw new Error(data.mensaje);
        
        allPermisos = data.permisos || [];
        renderPermisosPorCategoria();
        
    } catch (err) {
        console.error('Error cargando permisos:', err);
        allPermisos = [];
        const container = document.getElementById('permisosPorCategoria');
        if (container) {
            container.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-triangle"></i><p>Error cargando permisos. Asegúrate de que la base de datos esté actualizada.</p></div>';
        }
    }
}

// Renderizar permisos agrupados por categoría
function renderPermisosPorCategoria(searchTerm = '') {
    const container = document.getElementById('permisosPorCategoria');
    if (!container) return;
    
    if (allPermisos.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-key"></i><p>No hay permisos disponibles</p></div>';
        return;
    }
    
    // Filtrar por búsqueda
    let permisosFiltrados = allPermisos;
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        permisosFiltrados = allPermisos.filter(p => 
            p.nombre.toLowerCase().includes(term) ||
            (p.descripcion && p.descripcion.toLowerCase().includes(term))
        );
    }
    
    // Agrupar por categoría
    const grouped = {};
    
    // Inicializar con todas las categorías
    allCategorias.forEach(cat => {
        grouped[cat.id] = { categoria: cat, permisos: [] };
    });
    
    // También agregar permisos sin categoría
    grouped['null'] = { 
        categoria: { nombre: 'Sin categoría', icono: 'fa-folder', color: 'secondary' }, 
        permisos: [] 
    };
    
    permisosFiltrados.forEach(perm => {
        const catId = perm.categoria_id || 'null';
        if (!grouped[catId]) {
            grouped[catId] = { 
                categoria: { nombre: 'Otros', icono: 'fa-folder', color: 'secondary' }, 
                permisos: [] 
            };
        }
        grouped[catId].permisos.push(perm);
    });
    
    // Renderizar
    let html = '';
    Object.entries(grouped).forEach(([catId, { categoria, permisos }]) => {
        if (permisos.length === 0) return;
        
        const colorClass = `var(--${categoria.color || 'primary'}-light)`;
        const colorText = `var(--${categoria.color || 'primary'})`;
        
        html += `
            <div class="category-group-modern">
                <div class="category-header-modern" style="border-left: 3px solid ${colorText};">
                    <div class="category-icon-modern" style="background: ${colorClass}; color: ${colorText};">
                        <i class="fas ${categoria.icono}"></i>
                    </div>
                    <span class="category-title-modern">${categoria.nombre}</span>
                    <span class="category-count-modern">${permisos.length}</span>
                </div>
                <div class="category-permissions-modern">
        `;
        
        permisos.forEach(perm => {
            html += `
                <div class="permission-item-modern">
                    <i class="fas ${perm.icono}" style="color: ${colorText};"></i>
                    <div class="permission-info-modern">
                        <div class="permission-name-modern">${perm.nombre}</div>
                        <div class="permission-desc-modern">${perm.descripcion || ''}</div>
                    </div>
                    <span class="permission-level-modern level-${perm.nivel}">Nivel ${perm.nivel}</span>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html || '<div class="empty-state"><i class="fas fa-search"></i><p>No se encontraron permisos</p></div>';
}

// Cargar roles disponibles
async function loadRoles() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/permissions/roles/list`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            console.warn('No se pudo cargar roles, usando roles por defecto');
            allRoles = ['admin', 'supervisor', 'usuario'];
            updateRoleSelect();
            return;
        }
        
        const data = await res.json();
        
        if (data.error) {
            console.warn('Error en respuesta de roles, usando roles por defecto:', data.mensaje);
            allRoles = ['admin', 'supervisor', 'usuario'];
        } else {
            allRoles = data.roles || ['admin', 'supervisor', 'usuario'];
        }
        
        updateRoleSelect();
        
    } catch (err) {
        console.warn('Error cargando roles, usando roles por defecto:', err.message);
        allRoles = ['admin', 'supervisor', 'usuario'];
        updateRoleSelect();
    }
}

// Actualizar el select de roles
function updateRoleSelect() {
    const roleSelect = document.getElementById('roleSelect');
    if (roleSelect && Array.isArray(allRoles)) {
        roleSelect.innerHTML = '<option value="">Seleccione un rol...</option>';
        allRoles.forEach(rol => {
            roleSelect.innerHTML += `<option value="${rol}">${rol.charAt(0).toUpperCase() + rol.slice(1)}</option>`;
        });
    }
}

// Cargar permisos de un rol específico
async function loadRolePermissions(rol) {
    if (!rol) {
        const matrix = document.getElementById('rolePermsMatrix');
        if (matrix) {
            matrix.innerHTML = '<div class="empty-state"><i class="fas fa-user-shield"></i><p>Seleccione un rol para ver sus permisos</p></div>';
        }
        const infoCard = document.getElementById('roleInfoCard');
        if (infoCard) infoCard.style.display = 'none';
        return;
    }
    
    currentRole = rol;
    const token = localStorage.getItem('token');
    
    try {
        const [permsRes, roleRes] = await Promise.all([
            fetch(`${API_URL}/permissions`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_URL}/permissions/roles/${rol}`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        
        const permsData = await permsRes.json();
        const roleData = await roleRes.json();
        
        const assignedPerms = new Set(roleData.permisos.map(p => p.permiso_nombre));
        
        // Actualizar info del rol
        const infoCard = document.getElementById('roleInfoCard');
        if (infoCard) {
            infoCard.style.display = 'flex';
            const badge = document.getElementById('roleBadge');
            if (badge) badge.textContent = rol.charAt(0).toUpperCase() + rol.slice(1);
            const count = document.getElementById('rolePermisosCount');
            if (count) count.textContent = assignedPerms.size;
        }
        
        // Agrupar permisos por categoría
        const grouped = {};
        allCategorias.forEach(cat => {
            grouped[cat.id] = { categoria: cat, permisos: [] };
        });
        grouped['null'] = { 
            categoria: { nombre: 'Otros', icono: 'fa-folder', color: 'secondary' }, 
            permisos: [] 
        };
        
        permsData.permisos.forEach(perm => {
            const catId = perm.categoria_id || 'null';
            if (!grouped[catId]) {
                grouped[catId] = { 
                    categoria: { nombre: 'Otros', icono: 'fa-folder', color: 'secondary' }, 
                    permisos: [] 
                };
            }
            grouped[catId].permisos.push({
                ...perm,
                checked: assignedPerms.has(perm.nombre)
            });
        });
        
        // Renderizar matriz
        const matrix = document.getElementById('rolePermsMatrix');
        if (!matrix) return;
        
        let html = '';
        Object.entries(grouped).forEach(([catId, { categoria, permisos }]) => {
            if (permisos.length === 0) return;
            
            const colorText = `var(--${categoria.color || 'primary'})`;
            
            html += `
                <div class="matrix-category-modern">
                    <div class="matrix-category-title-modern">
                        <i class="fas ${categoria.icono}" style="color: ${colorText};"></i>
                        ${categoria.nombre}
                    </div>
            `;
            
            permisos.forEach(perm => {
                html += `
                    <div class="matrix-permission-modern">
                        <label>
                            <input type="checkbox" data-perm="${perm.nombre}" ${perm.checked ? 'checked' : ''}/>
                            <i class="fas ${perm.icono}"></i>
                            <div class="matrix-perm-text">
                                <div class="matrix-perm-name">${perm.nombre}</div>
                                <div class="matrix-perm-desc">${perm.descripcion || ''}</div>
                            </div>
                        </label>
                    </div>
                `;
            });
            
            html += `
                </div>
            `;
        });
        
        matrix.innerHTML = html || '<div class="empty-state"><p>No hay permisos disponibles</p></div>';
        
    } catch (err) {
        console.error('Error cargando permisos del rol:', err);
        const matrix = document.getElementById('rolePermsMatrix');
        if (matrix) {
            matrix.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-triangle"></i><p>Error cargando permisos</p></div>';
        }
    }
}

// Manejar creación de permiso
async function handleCreatePermission(e) {
    e.preventDefault();
    
    const nombre = document.getElementById('permName').value.trim();
    const descripcion = document.getElementById('permDesc').value.trim();
    const categoria_id = document.getElementById('permCategoria').value || null;
    const icono = document.getElementById('permIcono').value;
    const nivel = parseInt(document.getElementById('permNivel').value);
    
    if (!nombre) {
        Swal.fire({
            icon: 'warning',
            title: 'Nombre requerido',
            text: 'El nombre del permiso es obligatorio',
            confirmButtonColor: '#6366f1'
        });
        return;
    }
    
    const token = localStorage.getItem('token');
    const btn = document.getElementById('createPermBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
    }
    
    try {
        const res = await fetch(`${API_URL}/permissions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ nombre, descripcion, categoria_id, icono, nivel })
        });
        
        const data = await res.json();
        
        if (res.ok && !data.error) {
            document.getElementById('createPermissionForm').reset();
            await loadPermisos();
            await loadStats();
            
            // Si hay un rol seleccionado, recargar sus permisos
            if (currentRole) {
                await loadRolePermissions(currentRole);
            }
            
            Swal.fire({
                icon: 'success',
                title: data.mensaje,
                timer: 1500,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });
        } else {
            throw new Error(data.mensaje || 'Error al crear permiso');
        }
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: err.message,
            confirmButtonColor: '#6366f1'
        });
    } finally {
        const btn = document.getElementById('createPermBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus-circle"></i> Crear Permiso';
        }
    }
}

// Manejar guardado de permisos del rol
async function handleSaveRolePermissions() {
    const checkboxes = Array.from(document.querySelectorAll('#rolePermsMatrix input[type="checkbox"]'));
    const permisos = checkboxes.filter(c => c.checked).map(c => c.dataset.perm);
    
    if (!currentRole) {
        Swal.fire({
            icon: 'warning',
            title: 'Seleccione un rol',
            text: 'Debe seleccionar un rol para guardar los permisos',
            confirmButtonColor: '#6366f1'
        });
        return;
    }
    
    const token = localStorage.getItem('token');
    const btn = document.getElementById('saveRolePermsBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }
    
    try {
        const res = await fetch(`${API_URL}/permissions/roles/${currentRole}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ permisos })
        });
        
        const data = await res.json();
        
        if (res.ok && !data.error) {
            // Actualizar contador
            const count = document.getElementById('rolePermisosCount');
            if (count) count.textContent = permisos.length;
            
            await loadStats();
            await loadHistory();
            
            Swal.fire({
                icon: 'success',
                title: 'Permisos guardados',
                timer: 1500,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });
        } else {
            throw new Error(data.mensaje || 'Error al guardar');
        }
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: err.message,
            confirmButtonColor: '#6366f1'
        });
    } finally {
        const btn = document.getElementById('saveRolePermsBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
        }
    }
}

// Cargar estadísticas
async function loadStats() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/permissions/stats/summary`, {
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
        const totalPermisos = document.getElementById('totalPermisos');
        const totalCategorias = document.getElementById('totalCategorias');
        const totalRoles = document.getElementById('totalRoles');
        const totalAsignaciones = document.getElementById('totalAsignaciones');
        
        if (totalPermisos) totalPermisos.textContent = stats.total_permisos || 0;
        if (totalCategorias) totalCategorias.textContent = stats.total_categorias || 0;
        if (totalRoles) totalRoles.textContent = stats.total_roles || 0;
        if (totalAsignaciones) totalAsignaciones.textContent = stats.total_asignaciones || 0;
        
    } catch (err) {
        console.warn('Error cargando estadísticas:', err.message);
    }
}

// Cargar historial
async function loadHistory() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/permissions/history?limit=20`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.error) throw new Error(data.mensaje);
        
        const history = data.history;
        const container = document.getElementById('permisosHistory');
        if (!container) return;
        
        if (history.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-clock"></i><p>No hay historial reciente</p></div>';
            return;
        }
        
        let html = '';
        history.forEach(item => {
            const accionLabels = {
                'crear': { icon: 'fa-plus', class: 'crear', text: 'Creó' },
                'modificar': { icon: 'fa-pen', class: 'modificar', text: 'Modificó' },
                'eliminar': { icon: 'fa-trash', class: 'eliminar', text: 'Eliminó' },
                'asignar': { icon: 'fa-check', class: 'asignar', text: 'Asignó permisos' }
            };
            
            const accion = accionLabels[item.accion] || { icon: 'fa-circle', class: '', text: item.accion };
            const fecha = new Date(item.fecha_accion).toLocaleString();
            
            html += `
                <div class="history-item-modern">
                    <div class="history-icon-modern ${accion.class}">
                        <i class="fas ${accion.icon}"></i>
                    </div>
                    <div class="history-content-modern">
                        <div class="history-title-modern">
                            <strong>${item.nombre_completo || item.username}</strong> ${accion.text} 
                            ${item.tipo_objeto === 'rol_permiso' ? `al rol <strong>${item.objeto_nombre}</strong>` : `<strong>${item.objeto_nombre}</strong>`}
                        </div>
                        <div class="history-meta-modern">
                            <i class="far fa-clock"></i> ${fecha}
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (err) {
        console.error('Error cargando historial:', err);
        const container = document.getElementById('permisosHistory');
        if (container) {
            container.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-triangle"></i><p>Error cargando historial</p></div>';
        }
    }
}
window.loadHistory = loadHistory;
window.refreshData = refreshData;
window.exportPermissions = exportPermissions