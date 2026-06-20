document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('refreshAdminDashboard')
        ?.addEventListener('click', loadAdminDashboard);
    loadAdminDashboard();
});

async function loadAdminDashboard() {
    const token = localStorage.getItem('token');
    const button = document.getElementById('refreshAdminDashboard');

    if (!token) {
        window.location.href = '/';
        return;
    }

    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Actualizando';
    }

    try {
        const response = await fetch(`${window.API_URL}/dashboard/admin`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        let data = await response.json().catch(() => ({}));

        if (response.status === 404) {
            data = await loadCompatibleAdminDashboard(token);
        }

        if ((response.status !== 404 && !response.ok) || !data.success) {
            throw new Error(data.message || data.mensaje || 'No se pudo cargar el dashboard');
        }

        renderAdminSummary(data.resumen || {}, data.modo_compatibilidad);
        renderAdminMovements(data.movimientos || []);
        renderAdminSessions(data.sesiones_recientes || [], data.modo_compatibilidad);
        renderAdminUserActivity(data.actividad_usuarios || []);
        document.getElementById('adminDashboardUpdated').textContent = data.modo_compatibilidad
            ? `Resumen compatible / ${formatAdminDate(data.generado_en, true)}`
            : `Actualizado ${formatAdminDate(data.generado_en, true)}`;
    } catch (error) {
        console.error('Error en dashboard administrativo:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Dashboard no disponible',
            text: error.message
        });
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fa-solid fa-rotate"></i> Actualizar';
        }
    }
}

async function loadCompatibleAdminDashboard(token) {
    const headers = { Authorization: `Bearer ${token}` };
    const [summaryResponse, usersResponse, departmentsResponse] = await Promise.all([
        fetch(`${window.API_URL}/dashboard/resumen?periodo=30d`, { headers }),
        fetch(`${window.API_URL}/usuarios`, { headers }),
        fetch(`${window.API_URL}/departamentos`, { headers })
    ]);
    const [summaryData, usersData, departmentsData] = await Promise.all([
        summaryResponse.json().catch(() => ({})),
        usersResponse.json().catch(() => ({})),
        departmentsResponse.json().catch(() => ({}))
    ]);

    if (!summaryResponse.ok || !summaryData.success) {
        throw new Error(
            summaryData.message || summaryData.mensaje ||
            'El backend publicado necesita actualizarse para mostrar el dashboard'
        );
    }

    const users = usersResponse.ok
        ? (usersData.usuarios || (Array.isArray(usersData) ? usersData : []))
        : [];
    const departments = departmentsResponse.ok
        ? (departmentsData.departamentos || [])
        : [];
    const activity = summaryData.actividad_reciente || [];
    const today = new Date().toDateString();
    const filesToday = activity.filter(item =>
        item.fecha_subida && new Date(item.fecha_subida).toDateString() === today
    ).length;

    return {
        success: true,
        modo_compatibilidad: true,
        generado_en: new Date().toISOString(),
        resumen: {
            usuarios_total: users.length,
            usuarios_activos: users.filter(user =>
                user.activo === true || user.activo === 1 || user.estado === 'activo'
            ).length,
            administradores: users.filter(user => user.rol === 'admin').length,
            sesiones_activas: 0,
            inicios_hoy: 0,
            inicios_7_dias: 0,
            archivos_total: summaryData.resumen?.total_archivos || 0,
            archivos_hoy: filesToday,
            archivos_7_dias: summaryData.resumen?.total_archivos || 0,
            validaciones_total: summaryData.resumen?.total_validaciones || 0,
            validaciones_hoy: 0,
            validaciones_con_incidencias: summaryData.resumen?.con_errores || 0,
            departamentos_total: departments.length,
            departamentos_activos: departments.filter(department =>
                department.activo === true || department.activo === 1
            ).length
        },
        sesiones_recientes: [],
        movimientos: activity.map(item => ({
            id: `archivo-${item.id}`,
            tipo: 'archivo',
            accion: 'Archivo guardado',
            usuario_nombre: item.usuario_nombre || 'Sistema',
            username: '',
            fecha: item.fecha_subida,
            detalle: [item.nombre_original, item.restaurante_nombre].filter(Boolean).join(' / '),
            estado: item.estado || 'registrado'
        })),
        actividad_usuarios: users.slice(0, 12).map(user => ({
            id: user.id,
            nombre: user.nombre || user.nombre_completo || user.username,
            username: user.username,
            rol: user.rol,
            activo: user.activo,
            departamento_nombre: user.departamento_nombre,
            total_sesiones: 0,
            total_archivos: 0,
            ultimo_acceso: user.ultimo_acceso || user.fecha_creacion || null
        }))
    };
}

function renderAdminSummary(summary, compatibilityMode = false) {
    setAdminText('adminUsersTotal', summary.usuarios_activos);
    setAdminText('adminUsersMeta', `${summary.usuarios_total || 0} registrados`);
    setAdminText('adminActiveSessions', compatibilityMode ? '—' : summary.sesiones_activas);
    setAdminText('adminLoginsToday', compatibilityMode
        ? 'Disponible al actualizar Railway'
        : `${summary.inicios_hoy || 0} inicios hoy`);
    setAdminText('adminFilesToday', summary.archivos_hoy);
    setAdminText('adminFilesMeta', `${summary.archivos_7_dias || 0} en los ultimos 7 dias`);
    setAdminText('adminValidationsToday', summary.validaciones_hoy);
    setAdminText('adminValidationMeta', `${summary.validaciones_con_incidencias || 0} con incidencias`);
    setAdminText('adminDepartmentsActive', summary.departamentos_activos);
    setAdminText('adminDepartmentsMeta', `${summary.departamentos_total || 0} registrados`);
}

function renderAdminMovements(movements) {
    const tbody = document.getElementById('adminMovementsBody');
    if (!tbody) return;

    if (!movements.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="admin-loading">No hay movimientos registrados.</td></tr>';
        return;
    }

    tbody.innerHTML = movements.map(item => {
        const icon = {
            sesion: 'fa-right-to-bracket',
            archivo: 'fa-file-arrow-up',
            validacion: 'fa-shield-halved'
        }[item.tipo] || 'fa-circle-info';

        return `
            <tr>
                <td data-label="Movimiento"><span class="admin-movement"><span class="admin-movement-icon"><i class="fa-solid ${icon}"></i></span>${escapeAdminHtml(item.accion)}</span></td>
                <td data-label="Usuario" class="admin-user-cell"><strong>${escapeAdminHtml(item.usuario_nombre || 'Sistema')}</strong><small>@${escapeAdminHtml(item.username || 'sistema')}</small></td>
                <td data-label="Detalle"><span class="admin-detail-cell" title="${escapeAdminHtml(item.detalle || 'Sin detalle')}">${escapeAdminHtml(formatAdminMovementDetail(item))}</span></td>
                <td data-label="Estado"><span class="admin-state ${adminStateClass(item.estado)}">${escapeAdminHtml(item.estado || 'registrado')}</span></td>
                <td data-label="Fecha" class="admin-date-cell">${formatAdminDate(item.fecha)}</td>
            </tr>
        `;
    }).join('');
}

function renderAdminSessions(sessions, compatibilityMode = false) {
    const container = document.getElementById('adminSessionsList');
    if (!container) return;

    if (!sessions.length) {
        container.innerHTML = compatibilityMode
            ? '<div class="admin-loading">Publica el backend actualizado para consultar las sesiones.</div>'
            : '<div class="admin-loading">No hay sesiones registradas.</div>';
        return;
    }

    container.innerHTML = sessions.map(session => `
        <article class="admin-session-item">
            <span class="admin-session-avatar">${getAdminInitials(session.usuario_nombre)}</span>
            <div class="admin-session-copy">
                <strong>${escapeAdminHtml(session.usuario_nombre || session.username)}</strong>
                <span>${escapeAdminHtml(session.departamento_nombre || 'Sin departamento')} · ${escapeAdminHtml(session.rol)}</span>
                <small>${escapeAdminHtml(session.ip_address || 'IP no disponible')} · ${formatAdminDate(session.fecha_creacion)}</small>
            </div>
            <span class="admin-session-dot ${session.activa ? 'active' : ''}" title="${session.activa ? 'Activa' : 'Cerrada'}"></span>
        </article>
    `).join('');
}

function renderAdminUserActivity(users) {
    const tbody = document.getElementById('adminUserActivityBody');
    if (!tbody) return;

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="admin-loading">No hay actividad de usuarios.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr>
            <td><strong>${escapeAdminHtml(user.nombre)}</strong><br><small>@${escapeAdminHtml(user.username)}</small></td>
            <td>${escapeAdminHtml(user.departamento_nombre || 'Sin departamento')}</td>
            <td><span class="admin-state">${escapeAdminHtml(user.rol)}</span></td>
            <td>${Number(user.total_sesiones || 0).toLocaleString('en-US')}</td>
            <td>${Number(user.total_archivos || 0).toLocaleString('en-US')}</td>
            <td>${user.ultimo_acceso ? formatAdminDate(user.ultimo_acceso) : 'Nunca'}</td>
        </tr>
    `).join('');
}

function adminStateClass(state) {
    const value = String(state || '').toLowerCase();
    if (['activo', 'validado', 'procesado', 'exitoso'].includes(value)) return 'is-success';
    if (['pendiente', 'con_errores'].includes(value)) return 'is-warning';
    if (['cerrado', 'fallido', 'inactivo'].includes(value)) return 'is-error';
    return '';
}

function formatAdminMovementDetail(item) {
    const detail = String(item.detalle || 'Sin detalle');
    if (item.tipo !== 'sesion') return detail;

    const [ip, userAgent = ''] = detail.split(' | ');
    const browser = userAgent.match(/(?:Edg|Chrome|Firefox|Safari)\/[\d.]+/)?.[0];
    const system = userAgent.match(/Windows NT [\d.]+|Android [\d.]+|iPhone OS [\d_]+|Mac OS X [\d_]+/)?.[0];
    return [ip, browser, system].filter(Boolean).join(' / ') || detail;
}

function setAdminText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value ?? 0;
}

function formatAdminDate(value, short = false) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('es-MX', short
        ? { hour: '2-digit', minute: '2-digit' }
        : { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getAdminInitials(name) {
    return String(name || '--').split(/\s+/).filter(Boolean).slice(0, 2)
        .map(part => part[0]).join('').toUpperCase() || '--';
}

function escapeAdminHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
