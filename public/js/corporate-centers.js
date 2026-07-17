(function () {
    const root = document.querySelector('[data-corporate-center]');
    if (!root) return;

    const center = root.dataset.corporateCenter;
    const API = `${String(window.API_URL || '').replace(/\/$/, '')}/corporate`;
    const token = localStorage.getItem('token');
    const state = {
        close: { periods: [], tasks: [], selectedPeriodId: null },
        exceptions: [],
        audit: [],
        integrations: [],
        reports: [],
        governance: []
    };

    function headers(extra = {}) {
        return {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...extra
        };
    }

    async function request(path, options = {}) {
        const response = await fetch(`${API}${path}`, {
            credentials: 'include',
            ...options,
            headers: headers(options.headers || {})
        });
        const data = await response.json().catch(() => ({}));

        if (response.status === 401 || response.status === 403) {
            if (response.status === 401) window.location.replace('/');
            throw new Error(data.message || data.mensaje || 'You do not have permission for this operation.');
        }
        if (!response.ok || data.success === false || data.error === true) {
            throw new Error(data.message || data.mensaje || 'The operation could not be completed.');
        }
        return data;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatDate(value, includeTime = false) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {})
        }).format(date);
    }

    function formatMoney(value) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 2
        }).format(Number(value || 0));
    }

    function statusTone(status) {
        const value = String(status || '').toLowerCase();
        if (['approved', 'completed', 'verified', 'closed', 'resolved', 'active', 'completed'].includes(value)) return 'success';
        if (['blocked', 'critical', 'failed', 'rejected', 'overdue'].includes(value)) return 'danger';
        if (['pending', 'in_progress', 'under_review', 'changes_requested', 'queued', 'open', 'assigned', 'investigating'].includes(value)) return 'warning';
        return 'info';
    }

    function statusBadge(status, label = null) {
        return `<span class="xb-status xb-status--${statusTone(status)}">${escapeHtml(label || String(status || '-').replace(/_/g, ' '))}</span>`;
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value ?? '');
    }

    function notify(message, icon = 'success') {
        if (window.Swal) {
            return Swal.fire({
                toast: true,
                position: 'top-end',
                icon,
                title: message,
                timer: 2600,
                showConfirmButton: false
            });
        }
        window.alert(message);
    }

    function showError(error) {
        console.error(error);
        if (window.Swal) {
            Swal.fire({
                icon: 'error',
                title: 'Operation unavailable',
                text: error.message || 'The operation could not be completed.',
                confirmButtonColor: '#17191d'
            });
        }
    }

    function downloadCsv(filename, rows) {
        if (!rows.length) return notify('There is no data to export.', 'info');
        const keys = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
        const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const content = [
            keys.map(quote).join(','),
            ...rows.map(row => keys.map(key => quote(
                typeof row[key] === 'object' && row[key] !== null
                    ? JSON.stringify(row[key])
                    : row[key]
            )).join(','))
        ].join('\n');
        const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function serializeForm(form) {
        const data = Object.fromEntries(new FormData(form).entries());
        form.querySelectorAll('input[type="checkbox"]').forEach(input => {
            data[input.name] = input.checked;
        });
        return data;
    }

    // -------------------------------------------------------------------------
    // CLOSE CENTER
    // -------------------------------------------------------------------------
    async function loadCloseCenter(periodId = state.close.selectedPeriodId) {
        try {
            const query = periodId ? `?period_id=${encodeURIComponent(periodId)}` : '';
            const data = await request(`/close-center${query}`);
            state.close.periods = data.periods || [];
            state.close.tasks = data.tasks || [];
            if (periodId) state.close.selectedPeriodId = Number(periodId);
            renderClosePeriods();
            renderCloseTasks();
            renderCloseSummary();
            setText('closeUpdated', `Updated ${formatDate(new Date(), true)}`);
        } catch (error) {
            showError(error);
        }
    }

    function renderClosePeriods() {
        const select = document.getElementById('closePeriodSelect');
        if (!select) return;
        const selected = String(state.close.selectedPeriodId || '');
        select.innerHTML = '<option value="">Select a period</option>' + state.close.periods.map(period => (
            `<option value="${period.id}" ${String(period.id) === selected ? 'selected' : ''}>${escapeHtml(period.name)} · ${escapeHtml(period.status)} · ${Number(period.completion_rate || 0)}%</option>`
        )).join('');
    }

    function selectedClosePeriod() {
        return state.close.periods.find(period => Number(period.id) === Number(state.close.selectedPeriodId)) || null;
    }

    function filteredCloseTasks() {
        const status = document.getElementById('closeTaskStatusFilter')?.value || '';
        const search = String(document.getElementById('closeTaskSearch')?.value || '').trim().toLowerCase();
        return state.close.tasks.filter(task => {
            if (status && task.status !== status) return false;
            if (!search) return true;
            return [task.title, task.restaurant_name, task.restaurant_code, task.assignee_name, task.status]
                .some(value => String(value || '').toLowerCase().includes(search));
        });
    }

    function renderCloseTasks() {
        const body = document.getElementById('closeTaskBody');
        if (!body) return;
        const tasks = filteredCloseTasks();

        if (!state.close.selectedPeriodId) {
            body.innerHTML = '<tr><td colspan="7"><div class="xb-empty-state"><div><i class="fa-solid fa-calendar-days"></i><strong>Select a close period</strong><p>Choose a period to review its controlled work queue.</p></div></div></td></tr>';
            return;
        }
        if (!tasks.length) {
            body.innerHTML = '<tr><td colspan="7"><div class="xb-empty-state"><div><i class="fa-solid fa-check-double"></i><strong>No matching tasks</strong><p>Adjust the filters or create a close period with store tasks.</p></div></div></td></tr>';
            return;
        }

        body.innerHTML = tasks.map(task => `
            <tr>
                <td><strong>${escapeHtml(task.title)}</strong><br><small class="xb-text-muted">${escapeHtml(task.task_type)}</small></td>
                <td>${escapeHtml(task.restaurant_code || '-')}<br><small class="xb-text-muted">${escapeHtml(task.restaurant_name || '')}</small></td>
                <td>${escapeHtml(task.assignee_name || 'Unassigned')}</td>
                <td class="xb-nowrap">${formatDate(task.due_at, true)}</td>
                <td>${statusBadge(task.priority)}</td>
                <td>${statusBadge(task.status)}</td>
                <td><button class="xb-button" type="button" data-close-task="${task.id}"><i class="fa-solid fa-pen"></i> Update</button></td>
            </tr>
        `).join('');
    }

    function renderCloseSummary() {
        const period = selectedClosePeriod();
        const tasks = state.close.tasks;
        const completed = tasks.filter(task => ['completed', 'verified', 'closed'].includes(task.status)).length;
        const blocked = tasks.filter(task => task.status === 'blocked').length;
        const rate = tasks.length ? Math.round((completed / tasks.length) * 100) : Number(period?.completion_rate || 0);
        const days = period?.days_remaining;

        setText('closeCompletion', `${rate}%`);
        setText('closeCompletionMeta', period?.name || 'Selected close period');
        setText('closeCompleted', completed);
        setText('closeCompletedMeta', `${tasks.length || Number(period?.total_tasks || 0)} total`);
        setText('closeBlocked', blocked);
        setText('closeBlockedMeta', blocked ? 'Requires intervention' : 'No blocked tasks');
        setText('closeDays', days === null || days === undefined ? '-' : days);
        setText('closeDaysMeta', period?.due_date ? `Due ${formatDate(period.due_date)}` : 'No due date selected');

        const closeButton = document.getElementById('closePeriodStatus');
        if (closeButton) {
            const canClose = period && period.status !== 'closed' && completed === tasks.length && tasks.length > 0;
            closeButton.disabled = !canClose;
            closeButton.innerHTML = period?.status === 'closed'
                ? '<i class="fa-solid fa-lock"></i> Period closed'
                : '<i class="fa-solid fa-lock"></i> Close period';
        }
    }

    async function editCloseTask(taskId) {
        const task = state.close.tasks.find(item => Number(item.id) === Number(taskId));
        if (!task || !window.Swal) return;

        const result = await Swal.fire({
            title: 'Update close task',
            html: `
                <div class="xb-stack" style="text-align:left">
                    <label class="xb-field"><span>Status</span><select id="closeTaskModalStatus">
                        ${['pending', 'in_progress', 'blocked', 'completed', 'verified', 'closed'].map(status => `<option value="${status}" ${task.status === status ? 'selected' : ''}>${status.replace(/_/g, ' ')}</option>`).join('')}
                    </select></label>
                    <label class="xb-field"><span>Priority</span><select id="closeTaskModalPriority">
                        ${['low', 'normal', 'high', 'critical'].map(priority => `<option value="${priority}" ${task.priority === priority ? 'selected' : ''}>${priority}</option>`).join('')}
                    </select></label>
                    <label class="xb-field"><span>Materiality amount</span><input id="closeTaskModalAmount" type="number" step="0.01" value="${Number(task.materiality_amount || 0)}"></label>
                    <label class="xb-field"><span>Notes</span><textarea id="closeTaskModalNotes" rows="4">${escapeHtml(task.notes || '')}</textarea></label>
                </div>`,
            showCancelButton: true,
            confirmButtonText: 'Save task',
            confirmButtonColor: '#17191d',
            preConfirm: () => ({
                status: document.getElementById('closeTaskModalStatus').value,
                priority: document.getElementById('closeTaskModalPriority').value,
                materiality_amount: document.getElementById('closeTaskModalAmount').value,
                notes: document.getElementById('closeTaskModalNotes').value
            })
        });
        if (!result.isConfirmed) return;

        try {
            await request(`/close-center/tasks/${task.id}`, {
                method: 'PATCH',
                body: JSON.stringify(result.value)
            });
            notify('Close task updated.');
            await loadCloseCenter(state.close.selectedPeriodId);
        } catch (error) {
            showError(error);
        }
    }

    async function closeSelectedPeriod() {
        const period = selectedClosePeriod();
        if (!period) return;
        const result = await Swal.fire({
            icon: 'warning',
            title: 'Close accounting period?',
            text: 'This locks the period after all tasks are complete.',
            showCancelButton: true,
            confirmButtonText: 'Close period',
            confirmButtonColor: '#17191d'
        });
        if (!result.isConfirmed) return;

        try {
            await request(`/close-center/periods/${period.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'closed' })
            });
            notify('Close period locked.');
            await loadCloseCenter(period.id);
        } catch (error) {
            showError(error);
        }
    }

    function initCloseCenter() {
        document.getElementById('closeRefresh')?.addEventListener('click', () => loadCloseCenter());
        document.getElementById('closePeriodSelect')?.addEventListener('change', event => {
            state.close.selectedPeriodId = event.target.value ? Number(event.target.value) : null;
            loadCloseCenter(state.close.selectedPeriodId);
        });
        document.getElementById('closeTaskStatusFilter')?.addEventListener('change', renderCloseTasks);
        document.getElementById('closeTaskSearch')?.addEventListener('input', renderCloseTasks);
        document.getElementById('closeTaskBody')?.addEventListener('click', event => {
            const button = event.target.closest('[data-close-task]');
            if (button) editCloseTask(button.dataset.closeTask);
        });
        document.getElementById('closePeriodStatus')?.addEventListener('click', closeSelectedPeriod);
        document.getElementById('closeExport')?.addEventListener('click', () => downloadCsv('close-center.csv', filteredCloseTasks()));
        document.getElementById('closePeriodForm')?.addEventListener('submit', async event => {
            event.preventDefault();
            const form = event.currentTarget;
            const payload = serializeForm(form);
            try {
                const data = await request('/close-center/periods', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                form.reset();
                form.querySelector('[name="create_store_tasks"]').checked = true;
                window.XBFSCorporateUX?.clearFormDirty(form);
                state.close.selectedPeriodId = data.period_id;
                notify(`Close period created with ${data.tasks_created} tasks.`);
                await loadCloseCenter(data.period_id);
            } catch (error) {
                showError(error);
            }
        });
        const now = new Date();
        const form = document.getElementById('closePeriodForm');
        if (form) {
            form.elements.period_year.value = now.getFullYear();
            form.elements.period_month.value = now.getMonth() + 1;
        }
        loadCloseCenter();
    }

    // -------------------------------------------------------------------------
    // EXCEPTION CENTER
    // -------------------------------------------------------------------------
    async function loadExceptions() {
        try {
            const search = document.getElementById('exceptionSearch')?.value || '';
            const status = document.getElementById('exceptionStatusFilter')?.value || 'all';
            const severity = document.getElementById('exceptionSeverityFilter')?.value || 'all';
            const params = new URLSearchParams({ search, status, severity, limit: '200' });
            const data = await request(`/exceptions?${params}`);
            state.exceptions = data.exceptions || [];
            renderExceptions();
            setText('exceptionOpen', Number(data.summary?.open_total || 0));
            setText('exceptionCritical', Number(data.summary?.critical_total || 0));
            setText('exceptionOverdue', Number(data.summary?.overdue_total || 0));
            setText('exceptionAmount', formatMoney(data.summary?.open_amount || 0));
        } catch (error) {
            showError(error);
        }
    }

    function renderExceptions() {
        const body = document.getElementById('exceptionBody');
        if (!body) return;
        if (!state.exceptions.length) {
            body.innerHTML = '<tr><td colspan="9"><div class="xb-empty-state"><div><i class="fa-solid fa-shield-check"></i><strong>No matching exceptions</strong><p>No cases match the current filters.</p></div></div></td></tr>';
            return;
        }
        body.innerHTML = state.exceptions.map(item => `
            <tr>
                <td class="xb-mono">${escapeHtml(item.reference_code)}</td>
                <td><strong>${escapeHtml(item.title)}</strong><br><small class="xb-text-muted">${escapeHtml(String(item.description || '').slice(0, 90))}</small></td>
                <td>${escapeHtml(item.restaurant_code || '-')}<br><small class="xb-text-muted">${escapeHtml(item.account_code || item.department_name || '')}</small></td>
                <td class="xb-nowrap"><strong>${formatMoney(item.amount)}</strong></td>
                <td>${escapeHtml(item.owner_name || 'Unassigned')}</td>
                <td class="xb-nowrap ${Number(item.hours_remaining) < 0 && !['resolved', 'verified', 'closed'].includes(item.status) ? 'xb-text-danger' : ''}">${formatDate(item.due_at, true)}</td>
                <td>${statusBadge(item.severity)}</td>
                <td>${statusBadge(item.status)}</td>
                <td><button class="xb-button" type="button" data-exception-id="${item.id}"><i class="fa-solid fa-pen"></i> Manage</button></td>
            </tr>
        `).join('');
    }

    async function editException(id) {
        const item = state.exceptions.find(row => Number(row.id) === Number(id));
        if (!item || !window.Swal) return;
        const result = await Swal.fire({
            title: `Manage ${escapeHtml(item.reference_code)}`,
            width: 720,
            html: `
                <div class="xb-stack" style="text-align:left">
                    <label class="xb-field"><span>Status</span><select id="exceptionModalStatus">${['open', 'assigned', 'investigating', 'resolved', 'verified', 'closed'].map(status => `<option value="${status}" ${item.status === status ? 'selected' : ''}>${status.replace(/_/g, ' ')}</option>`).join('')}</select></label>
                    <div class="xb-form-grid">
                        <label class="xb-field"><span>Severity</span><select id="exceptionModalSeverity">${['low', 'medium', 'high', 'critical'].map(severity => `<option value="${severity}" ${item.severity === severity ? 'selected' : ''}>${severity}</option>`).join('')}</select></label>
                        <label class="xb-field"><span>Amount</span><input id="exceptionModalAmount" type="number" step="0.01" value="${Number(item.amount || 0)}"></label>
                    </div>
                    <label class="xb-field"><span>Root cause</span><textarea id="exceptionModalCause" rows="4">${escapeHtml(item.root_cause || '')}</textarea></label>
                    <label class="xb-field"><span>Resolution</span><textarea id="exceptionModalResolution" rows="4">${escapeHtml(item.resolution || '')}</textarea></label>
                </div>`,
            showCancelButton: true,
            confirmButtonText: 'Save exception',
            confirmButtonColor: '#17191d',
            preConfirm: () => ({
                status: document.getElementById('exceptionModalStatus').value,
                severity: document.getElementById('exceptionModalSeverity').value,
                amount: document.getElementById('exceptionModalAmount').value,
                root_cause: document.getElementById('exceptionModalCause').value,
                resolution: document.getElementById('exceptionModalResolution').value
            })
        });
        if (!result.isConfirmed) return;
        try {
            await request(`/exceptions/${item.id}`, { method: 'PATCH', body: JSON.stringify(result.value) });
            notify('Exception updated.');
            await loadExceptions();
        } catch (error) {
            showError(error);
        }
    }

    function initExceptions() {
        let timer;
        document.getElementById('exceptionRefresh')?.addEventListener('click', loadExceptions);
        document.getElementById('exceptionStatusFilter')?.addEventListener('change', loadExceptions);
        document.getElementById('exceptionSeverityFilter')?.addEventListener('change', loadExceptions);
        document.getElementById('exceptionSearch')?.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(loadExceptions, 280);
        });
        document.getElementById('exceptionBody')?.addEventListener('click', event => {
            const button = event.target.closest('[data-exception-id]');
            if (button) editException(button.dataset.exceptionId);
        });
        document.getElementById('exceptionExport')?.addEventListener('click', () => downloadCsv('exception-center.csv', state.exceptions));
        document.getElementById('exceptionForm')?.addEventListener('submit', async event => {
            event.preventDefault();
            const form = event.currentTarget;
            try {
                const data = await request('/exceptions', { method: 'POST', body: JSON.stringify(serializeForm(form)) });
                form.reset();
                form.elements.amount.value = '0';
                window.XBFSCorporateUX?.clearFormDirty(form);
                notify(`Exception ${data.reference_code} created.`);
                await loadExceptions();
            } catch (error) {
                showError(error);
            }
        });
        loadExceptions();
    }

    // -------------------------------------------------------------------------
    // AUDIT CENTER
    // -------------------------------------------------------------------------
    async function loadAudit() {
        try {
            const search = document.getElementById('auditSearch')?.value || '';
            const action = document.getElementById('auditAction')?.value || '';
            const data = await request(`/audit?${new URLSearchParams({ search, action, limit: '200' })}`);
            state.audit = data.events || [];
            renderAudit();
            setText('auditTotal', Number(data.summary?.total || 0));
            setText('audit24h', Number(data.summary?.last_24h || 0));
            setText('auditUsers', Number(data.summary?.users || 0));
            setText('auditResources', Number(data.summary?.resource_types || 0));
        } catch (error) {
            showError(error);
        }
    }

    function summarizeChange(event) {
        const before = event.before || {};
        const after = event.after || {};
        const changed = Object.keys(after).filter(key => JSON.stringify(after[key]) !== JSON.stringify(before[key]));
        if (!changed.length) return 'Event recorded';
        return changed.slice(0, 4).map(key => `${key}: ${String(after[key] ?? '-').slice(0, 60)}`).join(' · ');
    }

    function renderAudit() {
        const body = document.getElementById('auditBody');
        if (!body) return;
        if (!state.audit.length) {
            body.innerHTML = '<tr><td colspan="7"><div class="xb-empty-state"><div><i class="fa-solid fa-magnifying-glass"></i><strong>No audit events found</strong><p>Try another search or perform a controlled workflow action.</p></div></div></td></tr>';
            return;
        }
        body.innerHTML = state.audit.map(event => `
            <tr>
                <td class="xb-nowrap">${formatDate(event.created_at, true)}</td>
                <td><strong>${escapeHtml(event.user_name || event.username || 'System')}</strong><br><small class="xb-text-muted">${escapeHtml(event.ip_address || '')}</small></td>
                <td>${statusBadge('info', event.action_name)}</td>
                <td><strong>${escapeHtml(event.resource_type)}</strong><br><small class="xb-mono xb-text-muted">${escapeHtml(event.resource_id || '-')}</small></td>
                <td>${escapeHtml(event.department_name || '-')}</td>
                <td class="xb-mono">${escapeHtml(event.request_id || '-')}</td>
                <td title="${escapeHtml(JSON.stringify(event.after || {}))}">${escapeHtml(summarizeChange(event))}</td>
            </tr>
        `).join('');
    }

    function initAudit() {
        let timer;
        document.getElementById('auditRefresh')?.addEventListener('click', loadAudit);
        ['auditSearch', 'auditAction'].forEach(id => document.getElementById(id)?.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(loadAudit, 300);
        }));
        document.getElementById('auditExport')?.addEventListener('click', () => downloadCsv('operational-audit.csv', state.audit));
        loadAudit();
    }

    // -------------------------------------------------------------------------
    // INTEGRATION CENTER
    // -------------------------------------------------------------------------
    async function loadIntegrations() {
        try {
            const data = await request('/integrations');
            state.integrations = data.integrations || [];
            renderIntegrations(data.runs || []);
        } catch (error) {
            showError(error);
        }
    }

    function providerIcon(provider) {
        if (provider === 'sage-intacct') return 'fa-building-columns';
        if (provider === 'microsoft-entra') return 'fa-id-card';
        return 'fa-robot';
    }

    function renderIntegrations(runs) {
        const cards = document.getElementById('integrationCards');
        const body = document.getElementById('integrationRunBody');
        if (cards) {
            cards.innerHTML = state.integrations.map(integration => `
                <article class="xb-panel">
                    <div class="xb-panel__body xb-stack">
                        <div class="xb-actions" style="justify-content:space-between">
                            <span class="xb-metric-card__icon"><i class="fa-solid ${providerIcon(integration.provider)}"></i></span>
                            ${statusBadge(integration.ready ? 'active' : 'failed', integration.ready ? 'Ready' : 'Configuration required')}
                        </div>
                        <div><h2 style="margin:0;font-size:18px">${escapeHtml(integration.name)}</h2><p class="xb-text-muted" style="font-size:12px;line-height:1.5">${integration.ready ? 'Required configuration is present.' : `Missing: ${(integration.missing || []).map(escapeHtml).join(', ')}`}</p></div>
                        <div class="xb-actions">
                            <button class="xb-button xb-button--secondary" type="button" data-integration-operation="configuration_check" data-integration-provider="${integration.provider}"><i class="fa-solid fa-list-check"></i> Check configuration</button>
                            ${integration.provider === 'sage-intacct' && integration.ready ? `
                                <button class="xb-button xb-button--primary" type="button" data-integration-operation="connection_test" data-integration-provider="${integration.provider}"><i class="fa-solid fa-plug-circle-check"></i> Test connection</button>
                            ` : ''}
                        </div>
                    </div>
                </article>
            `).join('');
        }
        if (body) {
            body.innerHTML = runs.length ? runs.map(run => `
                <tr><td>${formatDate(run.created_at, true)}</td><td>${escapeHtml(run.provider)}</td><td>${escapeHtml(run.operation)}</td><td>${escapeHtml(run.requested_by_name || 'System')}</td><td>${Number(run.records_processed || 0)}</td><td>${Number(run.warnings_count || 0)}</td><td>${Number(run.errors_count || 0)}</td><td>${statusBadge(run.status)}</td><td>${escapeHtml(run.summary || '-')}</td></tr>
            `).join('') : '<tr><td colspan="9"><div class="xb-empty-state"><div><i class="fa-solid fa-plug"></i><strong>No integration runs</strong><p>Run a configuration check to create the first auditable integration event.</p></div></div></td></tr>';
        }
    }

    async function runIntegrationCheck(provider, operation = 'configuration_check') {
        try {
            const data = await request(`/integrations/${provider}/runs`, {
                method: 'POST',
                body: JSON.stringify({ operation })
            });
            notify(data.summary, data.status === 'failed' ? 'warning' : 'success');
            await loadIntegrations();
        } catch (error) {
            showError(error);
        }
    }

    function initIntegrations() {
        document.getElementById('integrationRefresh')?.addEventListener('click', loadIntegrations);
        document.getElementById('integrationCards')?.addEventListener('click', event => {
            const button = event.target.closest('[data-integration-operation]');
            if (button) {
                runIntegrationCheck(
                    button.dataset.integrationProvider,
                    button.dataset.integrationOperation
                );
            }
        });
        loadIntegrations();
    }

    // -------------------------------------------------------------------------
    // REPORT CENTER
    // -------------------------------------------------------------------------
    async function loadReports() {
        try {
            const data = await request('/reports');
            state.reports = data.reports || [];
            state.reportDelivery = data.delivery || {};
            renderReports();
        } catch (error) {
            showError(error);
        }
    }

    function renderReports() {
        const body = document.getElementById('reportBody');
        const total = state.reports.length;
        const active = state.reports.filter(report => Boolean(report.active)).length;
        const due = state.reports.filter(report => report.active && report.next_run_at && new Date(report.next_run_at) <= new Date()).length;
        setText('reportTotal', total);
        setText('reportActive', active);
        setText('reportDue', due);
        if (!body) return;
        body.innerHTML = total ? state.reports.map(report => `
            <tr>
                <td><strong>${escapeHtml(report.name)}</strong></td>
                <td>${escapeHtml(report.report_type.replace(/_/g, ' '))}</td>
                <td>${escapeHtml(report.frequency)} at ${String(report.delivery_hour).padStart(2, '0')}:00</td>
                <td>${escapeHtml((report.recipients || []).join(', '))}</td>
                <td>${statusBadge('info', report.format)}</td>
                <td class="xb-nowrap">${formatDate(report.next_run_at, true)}</td>
                <td>${report.last_status ? statusBadge(report.last_status) : '-'}</td>
                <td><button class="xb-button" type="button" data-report-toggle="${report.id}" data-active="${report.active ? '1' : '0'}">${report.active ? '<i class="fa-solid fa-pause"></i> Pause' : '<i class="fa-solid fa-play"></i> Enable'}</button></td>
                <td><div class="xb-actions xb-actions--compact"><button class="xb-button" type="button" data-report-run="${report.id}" title="Generate now"><i class="fa-solid fa-bolt"></i></button>${report.output_available ? `<button class="xb-button" type="button" data-report-download="${report.id}" data-report-name="${escapeHtml(report.name)}" data-report-format="${escapeHtml(report.format)}" title="Download latest output"><i class="fa-solid fa-download"></i></button>` : ''}</div></td>
            </tr>
        `).join('') : '<tr><td colspan="9"><div class="xb-empty-state"><div><i class="fa-solid fa-file-circle-plus"></i><strong>No scheduled reports</strong><p>Create a recurring report schedule for governance and operational monitoring.</p></div></div></td></tr>';
    }


    async function runReport(id) {
        try {
            const data = await request(`/reports/${id}/run`, { method: 'POST', body: '{}' });
            notify(data.message || 'Report generated.', data.delivered ? 'success' : 'info');
            await loadReports();
        } catch (error) {
            showError(error);
        }
    }

    async function downloadReport(id, name, format) {
        try {
            const response = await fetch(`${API_URL}/corporate/reports/${id}/download-latest`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || 'Report output could not be downloaded.');
            }
            const blob = await response.blob();
            const href = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = href;
            anchor.download = `${String(name || 'corporate-report').replace(/[^a-zA-Z0-9._-]+/g, '-')}.${format || 'csv'}`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(href);
        } catch (error) {
            showError(error);
        }
    }

    async function toggleReport(id, active) {
        try {
            await request(`/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ active: !active }) });
            notify(active ? 'Report paused.' : 'Report enabled.');
            await loadReports();
        } catch (error) {
            showError(error);
        }
    }

    function initReports() {
        document.getElementById('reportRefresh')?.addEventListener('click', loadReports);
        document.getElementById('reportBody')?.addEventListener('click', event => {
            const toggleButton = event.target.closest('[data-report-toggle]');
            if (toggleButton) {
                toggleReport(toggleButton.dataset.reportToggle, toggleButton.dataset.active === '1');
                return;
            }
            const runButton = event.target.closest('[data-report-run]');
            if (runButton) {
                runReport(runButton.dataset.reportRun);
                return;
            }
            const downloadButton = event.target.closest('[data-report-download]');
            if (downloadButton) {
                downloadReport(
                    downloadButton.dataset.reportDownload,
                    downloadButton.dataset.reportName,
                    downloadButton.dataset.reportFormat
                );
            }
        });
        document.getElementById('reportRunDue')?.addEventListener('click', async () => {
            try {
                const data = await request('/reports/run-due', { method: 'POST', body: '{}' });
                notify(data.message, 'info');
                await loadReports();
            } catch (error) {
                showError(error);
            }
        });
        document.getElementById('reportForm')?.addEventListener('submit', async event => {
            event.preventDefault();
            const form = event.currentTarget;
            const payload = serializeForm(form);
            try {
                await request('/reports', { method: 'POST', body: JSON.stringify(payload) });
                form.reset();
                form.elements.delivery_hour.value = 8;
                form.elements.timezone.value = 'America/Phoenix';
                window.XBFSCorporateUX?.clearFormDirty(form);
                notify('Scheduled report created.');
                await loadReports();
            } catch (error) {
                showError(error);
            }
        });
        loadReports();
    }

    // -------------------------------------------------------------------------
    // GOVERNANCE CENTER
    // -------------------------------------------------------------------------
    async function loadGovernance() {
        try {
            const data = await request('/governance/approval-matrix');
            state.governance = data.rules || [];
            renderGovernance();
        } catch (error) {
            showError(error);
        }
    }

    function renderGovernance() {
        const body = document.getElementById('governanceBody');
        if (!body) return;
        body.innerHTML = state.governance.length ? state.governance.map(rule => `
            <tr>
                <td><strong>${escapeHtml(rule.workflow_type.replace(/_/g, ' '))}</strong></td>
                <td>${escapeHtml(rule.department_name || rule.entity_code || 'Global')}</td>
                <td>${escapeHtml(rule.preparer_role)}</td>
                <td>${escapeHtml(rule.reviewer_role)}</td>
                <td>${escapeHtml(rule.approver_role)}</td>
                <td>${Number(rule.approval_levels || 1)}</td>
                <td>${Number(rule.sla_hours || 0)} hours</td>
                <td>${rule.separation_of_duties ? 'Separation of duties' : 'Same actor allowed'}<br><small class="xb-text-muted">${rule.require_rejection_comment ? 'Rejection comment required' : 'Comment optional'}</small></td>
                <td>${statusBadge(rule.active ? 'active' : 'paused', rule.active ? 'Active' : 'Inactive')}</td>
            </tr>
        `).join('') : '<tr><td colspan="9"><div class="xb-empty-state"><div><i class="fa-solid fa-scale-balanced"></i><strong>No governance rules</strong><p>Create the first approval matrix rule.</p></div></div></td></tr>';
    }

    function initGovernance() {
        document.getElementById('governanceRefresh')?.addEventListener('click', loadGovernance);
        document.getElementById('governanceForm')?.addEventListener('submit', async event => {
            event.preventDefault();
            const form = event.currentTarget;
            const payload = serializeForm(form);
            try {
                await request('/governance/approval-matrix', { method: 'POST', body: JSON.stringify(payload) });
                window.XBFSCorporateUX?.clearFormDirty(form);
                notify('Governance rule saved.');
                await loadGovernance();
            } catch (error) {
                showError(error);
            }
        });
        loadGovernance();
    }

    const initializers = {
        close: initCloseCenter,
        exceptions: initExceptions,
        audit: initAudit,
        integrations: initIntegrations,
        reports: initReports,
        governance: initGovernance
    };

    initializers[center]?.();
})();
