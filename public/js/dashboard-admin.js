document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('refreshAdminDashboard')
        ?.addEventListener('click', loadAdminDashboard);
    document.getElementById('adminSessionsList')
        ?.addEventListener('click', onAdminSessionListClick);
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
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating';
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
            throw new Error(data.message || data.mensaje || 'Dashboard could not be loaded');
        }

        renderAdminSummary(data.resumen || {}, data.modo_compatibilidad);
        renderAdminMovements(data.movimientos || []);
        renderAdminSessions(data.sesiones_recientes || [], data.modo_compatibilidad);
        renderAdminUserActivity(data.actividad_usuarios || []);
        renderAdminDatabaseTables(data.tablas_base_datos || []);
        document.getElementById('adminDashboardUpdated').textContent = data.modo_compatibilidad
            ? `Compatibility summary / ${formatAdminDate(data.generado_en, true)}`
            : `Updated ${formatAdminDate(data.generado_en, true)}`;
    } catch (error) {
        console.error('Admin dashboard error:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Dashboard unavailable',
            text: error.message
        });
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fa-solid fa-rotate"></i> Refresh';
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
            'The published backend needs to be updated to show the dashboard'
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
            accion: 'File saved',
            usuario_nombre: item.usuario_nombre || 'System',
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
        })),
        tablas_base_datos: []
    };
}

function renderAdminSummary(summary, compatibilityMode = false) {
    setAdminText('adminUsersTotal', summary.usuarios_activos);
    setAdminText('adminUsersMeta', `${summary.usuarios_total || 0} registered`);
    setAdminText('adminActiveSessions', compatibilityMode ? '-' : summary.sesiones_activas);
    setAdminText('adminLoginsToday', compatibilityMode
        ? 'Available after updating Railway'
        : `${summary.inicios_hoy || 0} logins today`);
    setAdminText('adminFilesToday', summary.archivos_hoy);
    setAdminText('adminFilesMeta', `${summary.archivos_7_dias || 0} in the last 7 days`);
    setAdminText('adminValidationsToday', summary.validaciones_hoy);
    setAdminText('adminValidationMeta', `${summary.validaciones_con_incidencias || 0} with issues`);
    setAdminText('adminDepartmentsActive', summary.departamentos_activos);
    setAdminText('adminDepartmentsMeta', `${summary.departamentos_total || 0} registered`);
}

function renderAdminMovements(movements) {
    const tbody = document.getElementById('adminMovementsBody');
    if (!tbody) return;

    if (!movements.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="admin-loading">No movements registered.</td></tr>';
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
                <td data-label="Movement"><span class="admin-movement"><span class="admin-movement-icon"><i class="fa-solid ${icon}"></i></span>${escapeAdminHtml(item.accion)}</span></td>
                <td data-label="User" class="admin-user-cell"><strong>${escapeAdminHtml(item.usuario_nombre || 'System')}</strong><small>@${escapeAdminHtml(item.username || 'system')}</small></td>
                <td data-label="Detail"><span class="admin-detail-cell" title="${escapeAdminHtml(item.detalle || 'No detail')}">${escapeAdminHtml(formatAdminMovementDetail(item))}</span></td>
                <td data-label="Status"><span class="admin-state ${adminStateClass(item.estado)}">${escapeAdminHtml(formatAdminStateLabel(item.estado || 'registered'))}</span></td>
                <td data-label="Date" class="admin-date-cell">${formatAdminDate(item.fecha)}</td>
            </tr>
        `;
    }).join('');
}

function renderAdminSessions(sessions, compatibilityMode = false) {
    const container = document.getElementById('adminSessionsList');
    if (!container) return;

    if (!sessions.length) {
        container.innerHTML = compatibilityMode
            ? '<div class="admin-loading">Publish the updated backend to view sessions.</div>'
            : '<div class="admin-loading">No sessions registered.</div>';
        return;
    }

    container.innerHTML = sessions.map(session => `
        <article class="admin-session-item">
            <span class="admin-session-avatar">${getAdminInitials(session.usuario_nombre)}</span>
            <div class="admin-session-copy">
                <strong>${escapeAdminHtml(session.usuario_nombre || session.username)}</strong>
                <span>${escapeAdminHtml(session.departamento_nombre || 'No department')} / ${escapeAdminHtml(formatAdminStateLabel(session.rol))}</span>
                <small>${escapeAdminHtml(session.ip_address || 'IP unavailable')} / ${formatAdminDate(session.fecha_creacion)}</small>
            </div>
            <div class="admin-session-actions">
                <span class="admin-session-dot ${session.activa ? 'active' : ''}" title="${session.activa ? 'Active' : 'Closed'}"></span>
                ${session.activa && !session.sesion_actual ? `
                    <button
                        class="admin-session-logout"
                        type="button"
                        data-session-logout="${session.id}"
                        data-session-user="${escapeAdminHtml(session.usuario_nombre || session.username)}"
                        title="Log out"
                    >
                        <i class="fa-solid fa-right-from-bracket"></i>
                    </button>
                ` : ''}
                ${session.sesion_actual ? '<small class="admin-current-session">Current</small>' : ''}
            </div>
        </article>
    `).join('');
}

async function onAdminSessionListClick(event) {
    const button = event.target.closest('[data-session-logout]');
    if (!button) return;

    const sessionId = button.dataset.sessionLogout;
    const userName = button.dataset.sessionUser || 'this user';

    const confirmation = await Swal.fire({
        icon: 'warning',
        title: 'Active logout',
        text: `The open session for ${userName} will be closed.`,
        showCancelButton: true,
        confirmButtonText: 'Log out',
        cancelButtonText: 'Cancel'
    });

    if (!confirmation.isConfirmed) return;

    await closeAdminSession(sessionId, button);
}

async function closeAdminSession(sessionId, button) {
    const token = localStorage.getItem('token');

    if (!token) {
        window.location.href = '/';
        return;
    }

    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        const response = await fetch(`${window.API_URL}/dashboard/admin/sessions/${sessionId}/logout`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.message || data.mensaje || 'The session could not be closed');
        }

        await Swal.fire({
            icon: 'success',
            title: 'Session closed',
            text: data.message || 'The session was closed successfully.',
            timer: 1700,
            showConfirmButton: false
        });

        await loadAdminDashboard();
    } catch (error) {
        console.error('Error closing session:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Could not close',
            text: error.message
        });
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i>';
    }
}

function renderAdminUserActivity(users) {
    const tbody = document.getElementById('adminUserActivityBody');
    if (!tbody) return;

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="admin-loading">No user activity.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr>
            <td><strong>${escapeAdminHtml(user.nombre)}</strong><br><small>@${escapeAdminHtml(user.username)}</small></td>
            <td>${escapeAdminHtml(user.departamento_nombre || 'No department')}</td>
            <td><span class="admin-state">${escapeAdminHtml(formatAdminStateLabel(user.rol))}</span></td>
            <td>${Number(user.total_sesiones || 0).toLocaleString('en-US')}</td>
            <td>${Number(user.total_archivos || 0).toLocaleString('en-US')}</td>
            <td>${user.ultimo_acceso ? formatAdminDate(user.ultimo_acceso) : 'Never'}</td>
        </tr>
    `).join('');
}

function renderAdminDatabaseTables(tables) {
    const container = document.getElementById('adminDatabaseTables');
    if (!container) return;

    if (!tables.length) {
        container.innerHTML = '<div class="admin-loading">No audit information was received. Update the backend to inspect the database.</div>';
        return;
    }

    container.innerHTML = tables.map(table => {
        const exists = table.existe === true;
        const columns = Array.isArray(table.columnas_muestra) && table.columnas_muestra.length
            ? table.columnas_muestra
            : (table.columnas || []).map(column => column.nombre);
        const rows = Array.isArray(table.registros) ? table.registros : [];
        const columnsMeta = Array.isArray(table.columnas) ? table.columnas : [];
        const created = table.fecha_creacion ? formatAdminDate(table.fecha_creacion) : 'Pending';

        return `
            <article class="admin-db-card ${exists ? '' : 'is-missing'}">
                <header class="admin-db-card-head">
                    <span class="admin-db-icon"><i class="fa-solid ${escapeAdminHtml(table.icono || 'fa-table')}"></i></span>
                    <div class="admin-db-title">
                        <strong>${escapeAdminHtml(table.titulo || table.nombre)}</strong>
                        <span>${escapeAdminHtml(table.descripcion || table.nombre)}</span>
                    </div>
                    <span class="admin-db-count">${exists ? Number(table.total || 0).toLocaleString('en-US') : '-'}</span>
                </header>
                <div class="admin-db-meta">
                    <span>${exists ? 'Available' : 'SQL pending'}</span>
                    <span>${columnsMeta.length} columns</span>
                    <span>Created: ${escapeAdminHtml(created)}</span>
                </div>
                ${renderAdminDatabasePreview(table, columns, rows)}
            </article>
        `;
    }).join('');
}

function renderAdminDatabasePreview(table, columns, rows) {
    if (table.existe !== true) {
        return '<div class="admin-db-empty">The auditoria_seguridad table does not exist in the connected database yet. Run the security migration to view it here.</div>';
    }

    if (!columns.length) {
        return '<div class="admin-db-empty">The table exists, but no column information was received.</div>';
    }

    if (!rows.length) {
        return '<div class="admin-db-empty">Table available with no recent records.</div>';
    }

    return `
        <div class="admin-db-preview">
            <table>
                <thead>
                    <tr>${columns.map(column => `<th>${escapeAdminHtml(formatAdminColumnName(column))}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            ${columns.map(column => `
                                <td title="${escapeAdminHtml(formatAdminTableValue(row[column], column))}">
                                    ${escapeAdminHtml(formatAdminTableValue(row[column], column))}
                                </td>
                            `).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function formatAdminColumnName(column) {
    const labels = {
        id: 'ID',
        username: 'User',
        ip_address: 'IP',
        exitoso: 'Result',
        fecha_creacion: 'Date',
        fecha_actualizacion: 'Updated',
        fecha_comparacion: 'Comparison',
        fecha_operacion: 'Operation',
        pagina_inicio: 'Start',
        usuario_id: 'User ID',
        departamento_id: 'Dept. ID',
        evento: 'Event',
        detalle: 'Detail',
        restaurante_id: 'Rest. ID',
        comparacion_id: 'Comparison ID',
        permiso_nombre: 'Permission',
        tiendas_comparadas: 'Stores',
        tiendas_con_diferencias: 'With diff.',
        total_diferencias: 'Differences',
        monto_diferencia_absoluta: 'Diff. amount',
        valor_anterior: 'Previous',
        valor_nuevo: 'New'
    };

    return labels[column] || String(column || '')
        .replaceAll('_', ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatAdminTableValue(value, column = '') {
    if (value === null || value === undefined || value === '') return '-';

    if (column === 'exitoso') {
        return value === true || value === 1 || value === '1' ? 'Successful' : 'Failed';
    }

    if (column === 'activo' || column === 'concedido') {
        return value === true || value === 1 || value === '1' ? 'Active' : 'Inactive';
    }

    if (String(column).startsWith('fecha_')) {
        return formatAdminDate(value);
    }

    if (typeof value === 'object') {
        try {
            return truncateAdminText(JSON.stringify(value), 80);
        } catch {
            return '[object]';
        }
    }

    return truncateAdminText(String(value), 80);
}

function truncateAdminText(value, maxLength) {
    const text = String(value ?? '');
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function adminStateClass(state) {
    const value = String(state || '').toLowerCase();
    if (['activo', 'active', 'validado', 'validated', 'procesado', 'processed', 'exitoso', 'successful'].includes(value)) return 'is-success';
    if (['pendiente', 'pending', 'con_errores', 'with_errors'].includes(value)) return 'is-warning';
    if (['cerrado', 'closed', 'fallido', 'failed', 'inactivo', 'inactive'].includes(value)) return 'is-error';
    return '';
}

function formatAdminMovementDetail(item) {
    const detail = String(item.detalle || 'No detail');
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
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-US', short
        ? { hour: '2-digit', minute: '2-digit' }
        : { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatAdminStateLabel(value) {
    const labels = {
        admin: 'Administrator',
        supervisor: 'Supervisor',
        usuario: 'User',
        activo: 'Active',
        inactivo: 'Inactive',
        pendiente: 'Pending',
        registrado: 'Registered',
        validado: 'Validated',
        procesado: 'Processed',
        exitoso: 'Successful',
        fallido: 'Failed',
        cerrado: 'Closed',
        con_errores: 'With errors'
    };
    return labels[String(value || '').toLowerCase()] || value;
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
