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
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'No se pudo cargar el dashboard');
        }

        renderAdminSummary(data.resumen || {});
        renderAdminMovements(data.movimientos || []);
        renderAdminSessions(data.sesiones_recientes || []);
        renderAdminUserActivity(data.actividad_usuarios || []);
        document.getElementById('adminDashboardUpdated').textContent =
            `Actualizado ${formatAdminDate(data.generado_en, true)}`;
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

function renderAdminSummary(summary) {
    setAdminText('adminUsersTotal', summary.usuarios_activos);
    setAdminText('adminUsersMeta', `${summary.usuarios_total || 0} registrados`);
    setAdminText('adminActiveSessions', summary.sesiones_activas);
    setAdminText('adminLoginsToday', `${summary.inicios_hoy || 0} inicios hoy`);
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
                <td><span class="admin-movement"><span class="admin-movement-icon"><i class="fa-solid ${icon}"></i></span>${escapeAdminHtml(item.accion)}</span></td>
                <td><strong>${escapeAdminHtml(item.usuario_nombre || 'Sistema')}</strong><br><small>@${escapeAdminHtml(item.username || 'sistema')}</small></td>
                <td>${escapeAdminHtml(item.detalle || '—')}</td>
                <td><span class="admin-state ${adminStateClass(item.estado)}">${escapeAdminHtml(item.estado || 'registrado')}</span></td>
                <td>${formatAdminDate(item.fecha)}</td>
            </tr>
        `;
    }).join('');
}

function renderAdminSessions(sessions) {
    const container = document.getElementById('adminSessionsList');
    if (!container) return;

    if (!sessions.length) {
        container.innerHTML = '<div class="admin-loading">No hay sesiones registradas.</div>';
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

