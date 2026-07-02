let adminActivityLogRows = [];

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('refreshAdminDashboard')
        ?.addEventListener('click', loadAdminDashboard);
    document.getElementById('adminSessionsList')
        ?.addEventListener('click', onAdminSessionListClick);
    document.getElementById('adminDatabaseTables')
        ?.addEventListener('input', onAdminActivityLogFilterChange);
    document.getElementById('adminDatabaseTables')
        ?.addEventListener('change', onAdminActivityLogFilterChange);
    document.getElementById('adminDatabaseTables')
        ?.addEventListener('click', onAdminActivityLogClick);
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
        renderAdminDatabaseTables(data.tablas_base_datos || [], data.movimientos || []);
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
