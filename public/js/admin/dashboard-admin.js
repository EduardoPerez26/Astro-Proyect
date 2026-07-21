let adminActivityLogRows = [];
let adminDashboardState = {
    summary: {},
    sessions: [],
    movements: [],
    users: [],
    errors: {
        open: 0,
        critical: 0,
        available: false
    },
    generatedAt: null,
    compatibilityMode: false
};
let adminAutoRefreshTimer = null;
let adminClockTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    redirectLegacySystemErrorsLink();

    document.getElementById('refreshAdminDashboard')
        ?.addEventListener('click', loadAdminDashboard);

    document.getElementById('adminAutoRefresh')
        ?.addEventListener('click', toggleAdminAutoRefresh);

    document.getElementById('adminExportActivityLog')
        ?.addEventListener('click', exportAdminActivityLog);

    document.getElementById('adminSessionsList')
        ?.addEventListener('click', onAdminSessionListClick);

    document.getElementById('adminDatabaseTables')
        ?.addEventListener('input', onAdminActivityLogFilterChange);

    document.getElementById('adminDatabaseTables')
        ?.addEventListener('change', onAdminActivityLogFilterChange);

    document.getElementById('adminDatabaseTables')
        ?.addEventListener('click', onAdminActivityLogClick);

    startAdminDashboardClock();
    initializeAdminAutoRefresh();
    loadAdminDashboard();
});


function redirectLegacySystemErrorsLink() {
    const params = new URLSearchParams(window.location.search);

    if (params.get('section') === 'system-errors') {
        window.location.replace('/views/system-errors');
    }
}

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

        adminDashboardState = {
            ...adminDashboardState,
            summary: data.resumen || {},
            sessions: data.sesiones_recientes || [],
            movements: data.movimientos || [],
            users: data.actividad_usuarios || [],
            generatedAt: data.generado_en || new Date().toISOString(),
            compatibilityMode: Boolean(data.modo_compatibilidad)
        };

        renderAdminSummary(
            adminDashboardState.summary,
            adminDashboardState.compatibilityMode
        );

        renderAdminMovements(adminDashboardState.movements);
        renderAdminSessions(
            adminDashboardState.sessions,
            adminDashboardState.compatibilityMode
        );
        renderAdminUserActivity(adminDashboardState.users);
        renderAdminDatabaseTables(
            data.tablas_base_datos || [],
            adminDashboardState.movements
        );

        renderAdminExecutiveOverview();
        await loadAdminErrorSummary(token);

        document.getElementById('adminDashboardUpdated').textContent =
            adminDashboardState.compatibilityMode
                ? `Compatibility summary / ${formatAdminDate(adminDashboardState.generatedAt, true)}`
                : `Updated ${formatAdminDate(adminDashboardState.generatedAt, true)}`;
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
            administradores: users.filter(user =>
                ['superadmin', 'admin'].includes(user.rol)
            ).length,
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
            departamento_nombre: item.departamento_nombre || 'No department',
            ip_address: item.ip_address || null,
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
    const usersTotal = Number(summary.usuarios_total || 0);
    const usersActive = Number(summary.usuarios_activos || 0);
    const sessionsActive = Number(summary.sesiones_activas || 0);
    const filesToday = Number(summary.archivos_hoy || 0);
    const filesSevenDays = Number(summary.archivos_7_dias || 0);
    const validationsTotal = Number(summary.validaciones_total || 0);
    const validationsToday = Number(summary.validaciones_hoy || 0);
    const validationIssues = Number(summary.validaciones_con_incidencias || 0);
    const departmentsTotal = Number(summary.departamentos_total || 0);
    const departmentsActive = Number(summary.departamentos_activos || 0);

    const usersRate = percentage(usersActive, usersTotal);
    const departmentsRate = percentage(departmentsActive, departmentsTotal);
    const validationRate = validationsTotal
        ? clampPercentage(100 - percentage(validationIssues, validationsTotal))
        : 100;
    const sessionRate = usersActive
        ? clampPercentage(percentage(sessionsActive, usersActive))
        : 0;
    const filePace = filesSevenDays / 7;

    setAdminText('adminUsersTotal', usersActive);
    setAdminText('adminUsersMeta', `${usersTotal} registered`);
    setAdminText('adminUsersRate', `${usersRate}%`);

    setAdminText(
        'adminActiveSessions',
        compatibilityMode ? '-' : sessionsActive
    );
    setAdminText(
        'adminLoginsToday',
        compatibilityMode
            ? 'Detailed sessions unavailable'
            : `${Number(summary.inicios_hoy || 0)} logins today`
    );
    setAdminText(
        'adminSessionsRate',
        compatibilityMode ? 'N/A' : `${sessionRate}%`
    );

    setAdminText('adminFilesToday', filesToday);
    setAdminText('adminFilesMeta', `${filesSevenDays} in the last 7 days`);
    setAdminText('adminFilesPace', `${formatCompactNumber(filePace, 1)}/day`);

    setAdminText('adminValidationsToday', validationsToday);
    setAdminText('adminValidationMeta', `${validationIssues} with issues`);
    setAdminText('adminValidationRate', `${validationRate}%`);

    setAdminText('adminDepartmentsActive', departmentsActive);
    setAdminText('adminDepartmentsMeta', `${departmentsTotal} registered`);
    setAdminText('adminDepartmentsRate', `${departmentsRate}%`);
}


async function loadAdminErrorSummary(token) {
    const openElement = document.getElementById('adminSystemErrorsOpen');
    const metaElement = document.getElementById('adminSystemErrorsMeta');

    if (!openElement || !metaElement || !window.API_URL || !token) return;

    try {
        const response = await fetch(`${window.API_URL}/notificaciones/system-errors?status=open&limit=1`, {
            credentials: 'include',
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.success === false) {
            throw new Error(data.message || data.mensaje || 'System health unavailable');
        }

        const summary = data.summary || {};
        const open = Number(summary.abiertos || 0);
        const critical = Number(summary.criticos_abiertos || 0);

        adminDashboardState.errors = {
            open,
            critical,
            available: true
        };

        openElement.textContent = open.toLocaleString('en-US');
        metaElement.textContent = critical > 0
            ? `${critical.toLocaleString('en-US')} critical open`
            : 'No critical errors';
        metaElement.classList.toggle('is-error-meta', critical > 0);
        renderAdminExecutiveOverview();
    } catch (error) {
        console.warn('System error summary could not be loaded:', error);
        adminDashboardState.errors = {
            open: 0,
            critical: 0,
            available: false
        };

        openElement.textContent = '-';
        metaElement.textContent = 'Health endpoint unavailable';
        metaElement.classList.remove('is-error-meta');
        renderAdminExecutiveOverview();
    }
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
            validacion: 'fa-shield-halved',
            prepaid: 'fa-building-columns',
            property_management: 'fa-building-user'
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
    const summaryElement = document.getElementById('adminSessionsSummary');

    if (!container) return;

    const activeCount = sessions.filter(session => session.activa).length;

    if (summaryElement) {
        summaryElement.textContent = compatibilityMode
            ? 'Session detail requires the current backend.'
            : `${activeCount} active of ${sessions.length} recent sessions.`;
    }

    if (!sessions.length) {
        container.innerHTML = compatibilityMode
            ? '<div class="admin-loading">Update the backend to inspect active sessions.</div>'
            : '<div class="admin-loading">No sessions registered.</div>';
        return;
    }

    container.innerHTML = sessions.map(session => {
        const device = getAdminSessionDevice(session.user_agent);

        return `
            <article class="admin-session-item">
                <span class="admin-session-avatar">${getAdminInitials(session.usuario_nombre)}</span>
                <div class="admin-session-copy">
                    <strong>${escapeAdminHtml(session.usuario_nombre || session.username)}</strong>
                    <span>${escapeAdminHtml(session.departamento_nombre || 'No department')} / ${escapeAdminHtml(formatAdminStateLabel(session.rol))}</span>
                    <small>${escapeAdminHtml(session.ip_address || 'IP unavailable')} / ${escapeAdminHtml(device)} / ${formatAdminDate(session.fecha_creacion)}</small>
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
        `;
    }).join('');
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
        tbody.innerHTML = '<tr><td colspan="7" class="admin-loading">No user activity.</td></tr>';
        return;
    }

    const rankedUsers = [...users]
        .map(user => ({
            ...user,
            activityScore:
                Number(user.total_sesiones || 0)
                + Number(user.total_archivos || 0) * 2
        }))
        .sort((a, b) =>
            b.activityScore - a.activityScore
            || adminDateValue(b.ultimo_acceso) - adminDateValue(a.ultimo_acceso)
        );

    const maximumScore = Math.max(
        ...rankedUsers.map(user => user.activityScore),
        1
    );

    tbody.innerHTML = rankedUsers.map((user, index) => {
        const activityPercentage = Math.round(
            (user.activityScore / maximumScore) * 100
        );

        return `
            <tr>
                <td data-label="User">
                    <div class="admin-user-rank">
                        <span class="admin-user-rank-number">${index + 1}</span>
                        <span class="admin-user-cell">
                            <strong>${escapeAdminHtml(user.nombre)}</strong>
                            <small>@${escapeAdminHtml(user.username)}</small>
                        </span>
                    </div>
                </td>
                <td data-label="Department">${escapeAdminHtml(user.departamento_nombre || 'No department')}</td>
                <td data-label="Role"><span class="admin-state">${escapeAdminHtml(formatAdminStateLabel(user.rol))}</span></td>
                <td data-label="Sessions">${Number(user.total_sesiones || 0).toLocaleString('en-US')}</td>
                <td data-label="Files">${Number(user.total_archivos || 0).toLocaleString('en-US')}</td>
                <td data-label="Activity">
                    <div class="admin-user-activity-meter">
                        <div><span style="width:${activityPercentage}%"></span></div>
                        <small>${activityPercentage}% relative activity</small>
                    </div>
                </td>
                <td data-label="Last access">${user.ultimo_acceso ? formatAdminDate(user.ultimo_acceso) : 'Never'}</td>
            </tr>
        `;
    }).join('');
}

function renderAdminDatabaseTables(tables, movements = []) {
    const container = document.getElementById('adminDatabaseTables');
    if (!container) return;

    adminActivityLogRows = buildAdminActivityLogRows(tables, movements);

    container.innerHTML = renderAdminActivityLogShell(adminActivityLogRows);
    renderAdminActivityLogRows();
}

function buildAdminActivityLogRows(tables, movements) {
    const auditTable = (tables || []).find(table => table.nombre === 'auditoria_seguridad') || null;
    const movementRows = normalizeAdminMovementRows(movements || []);
    const auditRows = normalizeAdminAuditRows(auditTable);
    const hasSessionMovements = movementRows.some(row => row.tipo === 'sesion');

    const filteredAuditRows = auditRows.filter(row => {
        const event = String(row.evento || '').toLowerCase();
        return !(hasSessionMovements && ['login_success', 'sign_in', 'signin'].includes(event));
    });

    const uniqueRows = new Map();

    [...movementRows, ...filteredAuditRows].forEach(row => {
        const key = [row.fuente, row.id, row.usuario_nombre, row.movimiento, row.fecha].join('|');
        if (!uniqueRows.has(key)) {
            uniqueRows.set(key, row);
        }
    });

    return Array.from(uniqueRows.values())
        .sort((a, b) => adminDateValue(b.fecha) - adminDateValue(a.fecha))
        .slice(0, 200);
}

function normalizeAdminMovementRows(movements) {
    return movements.map((item, index) => {
        const movement = item.accion || item.movimiento || item.evento || 'Movement';
        const ip = item.ip_address || getAdminIpFromDetail(item.detalle) || '-';

        return {
            id: item.id || `movement-${index}`,
            fuente: 'movimientos',
            tipo: item.tipo || 'movimiento',
            evento: movement,
            movimiento: movement,
            usuario_nombre: item.usuario_nombre || item.nombre_usuario || 'System',
            username: item.username || item.usuario_username || 'system',
            departamento_nombre: formatAdminAuditDepartment(item.departamento_nombre || item.departamento || item.departamento_id),
            detalle: formatAdminLogDetail(item),
            ip_address: ip,
            estado: item.estado || item.status || 'registered',
            fecha: item.fecha || item.fecha_creacion
        };
    });
}

function normalizeAdminAuditRows(auditTable) {
    if (!auditTable || auditTable.existe !== true) return [];

    const rows = Array.isArray(auditTable.registros) ? auditTable.registros : [];

    return rows.map((row, index) => {
        const event = row.evento || row.movimiento || 'system_event';

        return {
            id: row.id || `audit-${index}`,
            fuente: 'auditoria',
            tipo: 'auditoria',
            evento: event,
            movimiento: formatAdminAuditEvent(event),
            usuario_nombre: row.usuario_nombre || row.nombre_usuario || 'System',
            username: row.username || row.usuario_username || 'system',
            departamento_nombre: formatAdminAuditDepartment(row.departamento_nombre || row.departamento || row.departamento_id),
            detalle: formatAdminAuditDetail(row.detalle, event),
            ip_address: row.ip_address || row.ip || '-',
            estado: row.estado || row.status || 'registered',
            fecha: row.fecha_creacion || row.fecha
        };
    });
}

function renderAdminActivityLogShell(rows) {
    const filters = getAdminActivityFilters();
    const users = getUniqueAdminOptions(rows, row => row.usuario_nombre || 'System');
    const departments = getUniqueAdminOptions(rows, row => row.departamento_nombre || 'No department');
    const movements = getUniqueAdminOptions(rows, row => row.movimiento || 'Movement');
    const statuses = getUniqueAdminOptions(rows, row => formatAdminStateLabel(row.estado || 'registered'));

    return `
        <div class="admin-log-toolbar">
            <div class="admin-log-filters" id="adminActivityLogFilters">
                <label class="admin-log-filter admin-log-filter-search">
                    <span>Search</span>
                    <input id="adminLogSearch" data-admin-log-filter type="search" value="${escapeAdminHtml(filters.search)}" placeholder="User, movement, detail, IP...">
                </label>
                <label class="admin-log-filter">
                    <span>User</span>
                    <select id="adminLogUserFilter" data-admin-log-filter>
                        <option value="">All users</option>
                        ${renderAdminOptions(users, filters.user)}
                    </select>
                </label>
                <label class="admin-log-filter">
                    <span>Department</span>
                    <select id="adminLogDepartmentFilter" data-admin-log-filter>
                        <option value="">All departments</option>
                        ${renderAdminOptions(departments, filters.department)}
                    </select>
                </label>
                <label class="admin-log-filter">
                    <span>Movement</span>
                    <select id="adminLogMovementFilter" data-admin-log-filter>
                        <option value="">All movements</option>
                        ${renderAdminOptions(movements, filters.movement)}
                    </select>
                </label>
                <label class="admin-log-filter">
                    <span>Status</span>
                    <select id="adminLogStatusFilter" data-admin-log-filter>
                        <option value="">All statuses</option>
                        ${renderAdminOptions(statuses, filters.status)}
                    </select>
                </label>
                <label class="admin-log-filter admin-log-filter-date">
                    <span>From</span>
                    <input id="adminLogDateFrom" data-admin-log-filter type="date" value="${escapeAdminHtml(filters.from)}">
                </label>
                <label class="admin-log-filter admin-log-filter-date">
                    <span>To</span>
                    <input id="adminLogDateTo" data-admin-log-filter type="date" value="${escapeAdminHtml(filters.to)}">
                </label>
                <button class="admin-log-clear" id="adminLogClearFilters" type="button">
                    <i class="fa-solid fa-filter-circle-xmark"></i>
                    Clear
                </button>
            </div>
            <div class="admin-log-summary" id="adminLogSummary">${rows.length} movements</div>
        </div>
        <div class="admin-table-wrap security-audit-table-wrap">
            <table class="admin-table security-audit-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Department</th>
                        <th>Movement</th>
                        <th>Detail</th>
                        <th>IP</th>
                        <th>Status</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody id="adminActivityLogBody">
                    <tr><td colspan="7" class="admin-loading">Loading activity log...</td></tr>
                </tbody>
            </table>
        </div>
    `;
}

function renderAdminActivityLogRows() {
    const tbody = document.getElementById('adminActivityLogBody');
    if (!tbody) return;

    const rows = applyAdminActivityFilters(adminActivityLogRows);
    const summary = document.getElementById('adminLogSummary');

    if (summary) {
        summary.textContent = `${rows.length} of ${adminActivityLogRows.length} movements`;
    }

    if (!adminActivityLogRows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="admin-loading">No activity registered yet.</td></tr>';
        return;
    }

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="admin-loading">No movements match the selected filters.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(row => {
        const icon = getAdminActivityIcon(row);
        const status = row.estado || 'registered';

        return `
            <tr>
                <td data-label="User" class="admin-user-cell"><strong>${escapeAdminHtml(row.usuario_nombre || 'System')}</strong><small>@${escapeAdminHtml(row.username || 'system')}</small></td>
                <td data-label="Department">${escapeAdminHtml(row.departamento_nombre || 'No department')}</td>
                <td data-label="Movement"><span class="admin-movement"><span class="admin-movement-icon"><i class="fa-solid ${icon}"></i></span>${escapeAdminHtml(row.movimiento || 'Movement')}</span></td>
                <td data-label="Detail"><span class="admin-detail-cell" title="${escapeAdminHtml(row.detalle || '-')}">${escapeAdminHtml(row.detalle || '-')}</span></td>
                <td data-label="IP"><span class="admin-detail-cell">${escapeAdminHtml(row.ip_address || '-')}</span></td>
                <td data-label="Status"><span class="admin-state ${adminStateClass(status)}">${escapeAdminHtml(formatAdminStateLabel(status))}</span></td>
                <td data-label="Date" class="admin-date-cell">${formatAdminDate(row.fecha)}</td>
            </tr>
        `;
    }).join('');
}

function onAdminActivityLogFilterChange(event) {
    if (!event.target.closest('[data-admin-log-filter]')) return;
    renderAdminActivityLogRows();
}

function onAdminActivityLogClick(event) {
    const clearButton = event.target.closest('#adminLogClearFilters');
    if (!clearButton) return;

    ['adminLogSearch', 'adminLogUserFilter', 'adminLogDepartmentFilter', 'adminLogMovementFilter', 'adminLogStatusFilter', 'adminLogDateFrom', 'adminLogDateTo']
        .forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });

    renderAdminActivityLogRows();
}

function applyAdminActivityFilters(rows) {
    const filters = getAdminActivityFilters();
    const search = filters.search.toLowerCase();

    return rows.filter(row => {
        const statusLabel = formatAdminStateLabel(row.estado || 'registered');
        const rowDate = toAdminDateInputValue(row.fecha);

        if (search) {
            const searchable = [
                row.usuario_nombre,
                row.username,
                row.departamento_nombre,
                row.movimiento,
                row.detalle,
                row.ip_address,
                statusLabel,
                formatAdminDate(row.fecha)
            ].join(' ').toLowerCase();

            if (!searchable.includes(search)) return false;
        }

        if (filters.user && row.usuario_nombre !== filters.user) return false;
        if (filters.department && row.departamento_nombre !== filters.department) return false;
        if (filters.movement && row.movimiento !== filters.movement) return false;
        if (filters.status && statusLabel !== filters.status) return false;
        if (filters.from && rowDate && rowDate < filters.from) return false;
        if (filters.to && rowDate && rowDate > filters.to) return false;

        return true;
    });
}

function getAdminActivityFilters() {
    return {
        search: document.getElementById('adminLogSearch')?.value.trim() || '',
        user: document.getElementById('adminLogUserFilter')?.value || '',
        department: document.getElementById('adminLogDepartmentFilter')?.value || '',
        movement: document.getElementById('adminLogMovementFilter')?.value || '',
        status: document.getElementById('adminLogStatusFilter')?.value || '',
        from: document.getElementById('adminLogDateFrom')?.value || '',
        to: document.getElementById('adminLogDateTo')?.value || ''
    };
}

function renderAdminOptions(options, selected) {
    return options.map(option => `
        <option value="${escapeAdminHtml(option)}" ${option === selected ? 'selected' : ''}>${escapeAdminHtml(option)}</option>
    `).join('');
}

function getUniqueAdminOptions(rows, getter) {
    return Array.from(new Set(rows.map(getter).filter(Boolean)))
        .sort((a, b) => String(a).localeCompare(String(b)));
}

function getAdminActivityIcon(row) {
    const type = String(row.tipo || '').toLowerCase();
    const event = String(row.evento || row.movimiento || '').toLowerCase();

    if (type === 'archivo' || event.includes('file')) return 'fa-file-arrow-up';
    if (type === 'validacion' || event.includes('validation')) return 'fa-shield-halved';
    if (event.includes('logout') || event.includes('sign-out') || event.includes('sign_out')) return 'fa-right-from-bracket';
    if (event.includes('login') || event.includes('sign-in') || event.includes('sign_in')) return 'fa-right-to-bracket';
    if (event.includes('mfa') || event.includes('fingerprint')) return 'fa-fingerprint';
    if (event.includes('password')) return 'fa-key';
    if (event.includes('permission') || event.includes('permiso')) return 'fa-user-lock';

    return 'fa-user-shield';
}

function getAdminIpFromDetail(detail) {
    const firstPart = String(detail || '').split(' | ')[0]?.trim();
    if (!firstPart) return '';
    if (firstPart === '::1' || /^[\d.:a-fA-F]+$/.test(firstPart)) return firstPart;
    return '';
}

function formatAdminLogDetail(item) {
    const detail = String(item.detalle || '').trim();
    if (!detail) return '-';

    if (String(item.tipo || '').toLowerCase() !== 'sesion') {
        return detail;
    }

    const [, userAgent = ''] = detail.split(' | ');
    const browser = userAgent.match(/(?:Edg|Chrome|Firefox|Safari)\/[\d.]+/)?.[0];
    const system = userAgent.match(/Windows NT [\d.]+|Android [\d.]+|iPhone OS [\d_]+|Mac OS X [\d_]+/)?.[0];

    return [browser, system].filter(Boolean).join(' / ') || userAgent || '-';
}

function formatAdminAuditDetail(detail, event) {
    if (detail === null || detail === undefined || detail === '') return '-';

    const text = String(detail).trim();
    if (!text || text === '{}') return '-';

    try {
        const parsed = JSON.parse(text);
        const parts = Object.entries(parsed)
            .filter(([key]) => !['departamento', 'department'].includes(String(key).toLowerCase()))
            .map(([key, value]) => `${String(key).replaceAll('_', ' ')}: ${String(value)}`);

        return parts.length ? truncateAdminText(parts.join(' / '), 120) : '-';
    } catch {
        return truncateAdminText(text, 120);
    }
}

function formatAdminAuditEvent(event) {
    const labels = {
        login_success: 'Sign-in',
        login_failed: 'Failed sign-in',
        user_logout: 'Sign-out',
        logout: 'Sign-out',
        mfa_setup_started: 'MFA setup started',
        mfa_setup_completed: 'MFA setup completed',
        mfa_verified: 'MFA verified',
        mfa_failed: 'MFA failed',
        password_changed: 'Password changed',
        permissions_updated: 'Permissions updated',
        system_event: 'System event'
    };
    const key = String(event || '').toLowerCase();

    if (labels[key]) return labels[key];

    return String(event || 'System event')
        .replaceAll('_', ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatAdminAuditDepartment(value) {
    const text = String(value ?? '').trim();

    if (!text || text === '-' || text.toLowerCase() === 'null') return 'No department';

    return text;
}

function adminDateValue(value) {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function toAdminDateInputValue(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

function renderAdminExecutiveOverview() {
    const summary = adminDashboardState.summary || {};
    const errors = adminDashboardState.errors || {};

    const usersTotal = Number(summary.usuarios_total || 0);
    const usersActive = Number(summary.usuarios_activos || 0);
    const departmentsTotal = Number(summary.departamentos_total || 0);
    const departmentsActive = Number(summary.departamentos_activos || 0);
    const validationsTotal = Number(summary.validaciones_total || 0);
    const validationIssues = Number(summary.validaciones_con_incidencias || 0);
    const sessionsActive = Number(summary.sesiones_activas || 0);

    const userCoverage = percentage(usersActive, usersTotal);
    const departmentCoverage = percentage(departmentsActive, departmentsTotal);
    const validationReliability = validationsTotal
        ? clampPercentage(100 - percentage(validationIssues, validationsTotal))
        : 100;
    const sessionLoad = usersActive
        ? clampPercentage(percentage(sessionsActive, usersActive))
        : 0;

    setAdminProgress(
        'adminUsersCoverage',
        userCoverage,
        `${usersActive} of ${usersTotal} users active`
    );

    setAdminProgress(
        'adminDepartmentCoverage',
        departmentCoverage,
        `${departmentsActive} of ${departmentsTotal} departments active`
    );

    setAdminProgress(
        'adminValidationReliability',
        validationReliability,
        validationIssues
            ? `${validationIssues} validations require review`
            : 'No validation issues detected'
    );

    setAdminProgress(
        'adminSessionLoad',
        sessionLoad,
        `${sessionsActive} sessions across ${usersActive} active users`
    );

    const inactiveDepartments = Math.max(
        departmentsTotal - departmentsActive,
        0
    );

    const validationIssueRate = validationsTotal
        ? validationIssues / validationsTotal
        : 0;

    let healthScore = 100;
    healthScore -= Math.min(Number(errors.critical || 0) * 15, 45);
    healthScore -= Math.min(Number(errors.open || 0) * 2, 20);
    healthScore -= Math.min(validationIssueRate * 38, 25);
    healthScore -= Math.min(inactiveDepartments * 6, 18);
    healthScore -= userCoverage < 75 ? 7 : 0;
    healthScore = Math.round(Math.max(0, Math.min(100, healthScore)));

    renderAdminHealthScore(healthScore, {
        userCoverage,
        departmentCoverage,
        validationReliability,
        inactiveDepartments,
        validationIssues,
        errors
    });

    renderAdminActivityTrend(adminDashboardState.movements || []);

    const filesSevenDays = Number(summary.archivos_7_dias || 0);
    const loginsSevenDays = Number(summary.inicios_7_dias || 0);
    const movementCount = (adminDashboardState.movements || []).filter(item => {
        const value = adminDateValue(item.fecha || item.fecha_creacion);
        return value >= Date.now() - 7 * 24 * 60 * 60 * 1000;
    }).length;

    const workload = Math.max(
        movementCount,
        filesSevenDays + loginsSevenDays
    );

    setAdminText('adminHeroWorkload', `${workload.toLocaleString('en-US')} operations`);
    setAdminText(
        'adminHeroWorkloadDetail',
        `${filesSevenDays.toLocaleString('en-US')} files / ${loginsSevenDays.toLocaleString('en-US')} sign-ins`
    );
}

function renderAdminHealthScore(score, context) {
    const ring = document.getElementById('adminHealthRing');
    const scoreElement = document.getElementById('adminHealthScore');
    const labelElement = document.getElementById('adminHealthLabel');
    const descriptionElement = document.getElementById('adminHealthDescription');
    const heroHealth = document.getElementById('adminHeroHealth');
    const heroDetail = document.getElementById('adminHeroHealthDetail');
    const list = document.getElementById('adminAttentionList');

    const level = score >= 90
        ? {
            label: 'Excellent',
            description: 'Core indicators are operating within the expected range.',
            tone: 'success'
        }
        : score >= 75
            ? {
                label: 'Stable',
                description: 'The system is stable with a small number of items to monitor.',
                tone: 'success'
            }
            : score >= 55
                ? {
                    label: 'Attention required',
                    description: 'One or more operational indicators should be reviewed.',
                    tone: 'warning'
                }
                : {
                    label: 'Critical attention',
                    description: 'Immediate review is recommended for system reliability.',
                    tone: 'danger'
                };

    if (ring) {
        ring.style.setProperty('--admin-health-score', String(score));
        ring.classList.toggle('is-warning', level.tone === 'warning');
        ring.classList.toggle('is-danger', level.tone === 'danger');
    }

    setAdminText('adminHealthScore', score);
    setAdminText('adminHealthLabel', level.label);
    setAdminText('adminHealthDescription', level.description);
    setAdminText('adminHeroHealth', level.label);
    setAdminText('adminHeroHealthDetail', `${score}/100 operational health`);

    if (!list) return;

    const items = [];

    if (!context.errors.available) {
        items.push({
            tone: 'warning',
            icon: 'fa-plug-circle-exclamation',
            text: 'System error summary is not available from the current backend.'
        });
    } else if (context.errors.critical > 0) {
        items.push({
            tone: 'danger',
            icon: 'fa-circle-exclamation',
            text: `${context.errors.critical} critical system error(s) remain open.`
        });
    } else if (context.errors.open > 0) {
        items.push({
            tone: 'warning',
            icon: 'fa-triangle-exclamation',
            text: `${context.errors.open} non-critical system error(s) remain open.`
        });
    }

    if (context.validationIssues > 0) {
        items.push({
            tone: 'warning',
            icon: 'fa-shield-halved',
            text: `${context.validationIssues} validation(s) contain issues.`
        });
    }

    if (context.inactiveDepartments > 0) {
        items.push({
            tone: 'warning',
            icon: 'fa-building-circle-exclamation',
            text: `${context.inactiveDepartments} department(s) are currently inactive.`
        });
    }

    if (context.userCoverage < 75) {
        items.push({
            tone: 'warning',
            icon: 'fa-user-clock',
            text: `Only ${context.userCoverage}% of registered users are active.`
        });
    }

    if (!items.length) {
        items.push({
            tone: 'success',
            icon: 'fa-circle-check',
            text: 'No immediate administrative attention points were detected.'
        });
    }

    list.innerHTML = items.slice(0, 4).map(item => `
        <li class="is-${item.tone}">
            <i class="fa-solid ${item.icon}"></i>
            <span>${escapeAdminHtml(item.text)}</span>
        </li>
    `).join('');
}

function renderAdminActivityTrend(movements) {
    const container = document.getElementById('adminActivityTrend');
    const summary = document.getElementById('adminTrendSummary');
    if (!container) return;

    const days = [];

    for (let offset = 6; offset >= 0; offset -= 1) {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - offset);

        days.push({
            key: toAdminDateInputValue(date),
            label: date.toLocaleDateString('en-US', { weekday: 'short' }),
            files: 0,
            validations: 0,
            sessions: 0
        });
    }

    const dayMap = new Map(days.map(day => [day.key, day]));

    movements.forEach(item => {
        const dateKey = toAdminDateInputValue(item.fecha || item.fecha_creacion);
        const day = dayMap.get(dateKey);
        if (!day) return;

        const type = String(item.tipo || '').toLowerCase();
        const action = String(item.accion || item.evento || '').toLowerCase();

        if (type === 'archivo' || action.includes('file')) {
            day.files += 1;
        } else if (type === 'validacion' || action.includes('validation')) {
            day.validations += 1;
        } else if (type === 'sesion' || action.includes('sign-in') || action.includes('login')) {
            day.sessions += 1;
        }
    });

    const maximum = Math.max(
        ...days.flatMap(day => [day.files, day.validations, day.sessions]),
        1
    );

    container.innerHTML = days.map(day => {
        const fileHeight = Math.max(3, Math.round((day.files / maximum) * 158));
        const validationHeight = Math.max(3, Math.round((day.validations / maximum) * 158));
        const sessionHeight = Math.max(3, Math.round((day.sessions / maximum) * 158));
        const total = day.files + day.validations + day.sessions;

        return `
            <div class="admin-trend-day" title="${escapeAdminHtml(`${day.label}: ${total} operations`)}">
                <div class="admin-trend-bars">
                    <span class="admin-trend-bar files" style="height:${fileHeight}px" title="${day.files} files"></span>
                    <span class="admin-trend-bar validations" style="height:${validationHeight}px" title="${day.validations} validations"></span>
                    <span class="admin-trend-bar sessions" style="height:${sessionHeight}px" title="${day.sessions} sessions"></span>
                </div>
                <span>${escapeAdminHtml(day.label)}</span>
            </div>
        `;
    }).join('');

    const totalOperations = days.reduce(
        (total, day) => total + day.files + day.validations + day.sessions,
        0
    );

    const busiestDay = days.reduce(
        (best, day) => {
            const total = day.files + day.validations + day.sessions;
            return total > best.total
                ? { label: day.label, total }
                : best;
        },
        { label: '-', total: 0 }
    );

    if (summary) {
        summary.textContent = totalOperations
            ? `${totalOperations} tracked operations. ${busiestDay.label} was the busiest day.`
            : 'No tracked operations during the last seven days.';
    }
}

function setAdminProgress(prefix, value, meta) {
    const normalized = clampPercentage(value);
    setAdminText(`${prefix}Value`, `${normalized}%`);
    setAdminText(`${prefix}Meta`, meta);

    const bar = document.getElementById(`${prefix}Bar`);
    if (bar) {
        bar.style.width = `${normalized}%`;
    }
}

function startAdminDashboardClock() {
    const update = () => {
        const now = new Date();

        setAdminText(
            'adminDashboardClock',
            now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            })
        );

        setAdminText(
            'adminDashboardDate',
            now.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
            })
        );
    };

    update();

    if (adminClockTimer) {
        window.clearInterval(adminClockTimer);
    }

    adminClockTimer = window.setInterval(update, 30000);
}

function initializeAdminAutoRefresh() {
    const enabled = localStorage.getItem('adminAutoRefresh') === 'true';
    setAdminAutoRefresh(enabled);
}

function toggleAdminAutoRefresh() {
    const enabled = localStorage.getItem('adminAutoRefresh') !== 'true';
    setAdminAutoRefresh(enabled);
}

function setAdminAutoRefresh(enabled) {
    localStorage.setItem('adminAutoRefresh', String(enabled));

    const button = document.getElementById('adminAutoRefresh');

    if (button) {
        button.setAttribute('aria-pressed', String(enabled));
        button.innerHTML = enabled
            ? '<i class="fa-solid fa-clock"></i> Auto refresh on'
            : '<i class="fa-solid fa-clock-rotate-left"></i> Auto refresh';
    }

    if (adminAutoRefreshTimer) {
        window.clearInterval(adminAutoRefreshTimer);
        adminAutoRefreshTimer = null;
    }

    if (enabled) {
        adminAutoRefreshTimer = window.setInterval(
            loadAdminDashboard,
            5 * 60 * 1000
        );
    }
}

function exportAdminActivityLog() {
    const rows = applyAdminActivityFilters(adminActivityLogRows);

    if (!rows.length) {
        Swal.fire({
            icon: 'info',
            title: 'No activity to export',
            text: 'Adjust the selected filters and try again.'
        });
        return;
    }

    const headers = [
        'User',
        'Username',
        'Department',
        'Movement',
        'Detail',
        'IP',
        'Status',
        'Date'
    ];

    const csvRows = [
        headers,
        ...rows.map(row => [
            row.usuario_nombre || 'System',
            row.username || 'system',
            row.departamento_nombre || 'No department',
            row.movimiento || 'Movement',
            row.detalle || '-',
            row.ip_address || '-',
            formatAdminStateLabel(row.estado || 'registered'),
            formatAdminDate(row.fecha)
        ])
    ];

    const csv = csvRows
        .map(row => row.map(csvEscapeValue).join(','))
        .join('\r\n');

    const blob = new Blob([`\ufeff${csv}`], {
        type: 'text/csv;charset=utf-8'
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);

    anchor.href = url;
    anchor.download = `admin-activity-${date}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function csvEscapeValue(value) {
    const text = String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
}

function getAdminSessionDevice(userAgent) {
    const value = String(userAgent || '');

    const browser = value.match(/(?:Edg|Chrome|Firefox|Safari)\/[\d.]+/)?.[0];
    const system = value.match(/Windows NT [\d.]+|Android [\d.]+|iPhone OS [\d_]+|Mac OS X [\d_]+/)?.[0];

    return [browser, system]
        .filter(Boolean)
        .join(' / ')
        || 'Device unavailable';
}

function percentage(value, total) {
    const numerator = Number(value || 0);
    const denominator = Number(total || 0);

    if (!denominator) return 0;

    return clampPercentage(
        Math.round((numerator / denominator) * 100)
    );
}

function clampPercentage(value) {
    return Math.max(
        0,
        Math.min(100, Math.round(Number(value || 0)))
    );
}

function formatCompactNumber(value, decimals = 0) {
    const number = Number(value || 0);

    return number.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
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
        superadmin: 'Super administrator',
        admin: 'Administrator',
        supervisor: 'Supervisor',
        usuario: 'User',
        activo: 'Active',
        inactivo: 'Inactive',
        pendiente: 'Pending',
        registrado: 'Registered',
        registered: 'Registered',
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
