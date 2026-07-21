(function () {
    const root = document.querySelector('[data-corporate-center]');
    if (!root) return;

    const center = root.dataset.corporateCenter;
    const API = `${String(window.API_URL || '').replace(/\/$/, '')}/corporate`;
    const token = localStorage.getItem('token');
    const state = {
        audit: [],
        reports: []
    };

    // Smooth, unified transition: any table body or metric/panel region in a
    // corporate center briefly fades in whenever its content is replaced
    // (skeleton -> data, or refresh -> new data), with no per-view wiring.
    const fadeObserver = new MutationObserver(mutations => {
        const seen = new Set();
        for (const mutation of mutations) {
            const el = mutation.target;
            if (seen.has(el)) continue;
            seen.add(el);
            el.classList.remove('xb-fade-in');
            void el.offsetWidth;
            el.classList.add('xb-fade-in');
        }
    });
    root.querySelectorAll('tbody, .xb-metric-grid, .xb-panel__body').forEach(el => {
        fadeObserver.observe(el, { childList: true });
    });

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
        body.innerHTML = state.audit.map((event, index) => `
            <tr>
                <td class="xb-nowrap">${formatDate(event.created_at, true)}</td>
                <td><strong>${escapeHtml(event.user_name || event.username || 'System')}</strong><br><small class="xb-text-muted">${escapeHtml(event.ip_address || '')}</small></td>
                <td>${statusBadge('info', event.action_name)}</td>
                <td><strong>${escapeHtml(event.resource_type)}</strong><br><small class="xb-mono xb-text-muted">${escapeHtml(event.resource_id || '-')}</small></td>
                <td>${escapeHtml(event.department_name || '-')}</td>
                <td class="xb-mono">${escapeHtml(event.request_id || '-')}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span title="${escapeHtml(JSON.stringify(event.after || {}))}">${escapeHtml(summarizeChange(event))}</span>
                        <button class="xb-button" type="button" data-audit-diff="${index}" title="View before/after">
                            <i class="fa-solid fa-code-compare"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function buildAuditDiffRows(before = {}, after = {}) {
        const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
        return keys
            .map(key => ({
                key,
                before: before ? before[key] : undefined,
                after: after ? after[key] : undefined,
                changed: JSON.stringify(before ? before[key] : undefined) !== JSON.stringify(after ? after[key] : undefined)
            }))
            .sort((a, b) => Number(b.changed) - Number(a.changed));
    }

    function formatAuditDiffValue(value) {
        if (value === undefined) return '<span class="xb-text-muted">-</span>';
        if (value === null) return '<span class="xb-text-muted">null</span>';
        if (typeof value === 'object') return escapeHtml(JSON.stringify(value));
        return escapeHtml(String(value));
    }

    function openAuditDiff(index) {
        const event = state.audit[index];
        const modal = document.getElementById('auditDiffModal');
        const title = document.getElementById('auditDiffTitle');
        const subtitle = document.getElementById('auditDiffSubtitle');
        const body = document.getElementById('auditDiffBody');
        if (!event || !modal || !body) return;

        if (title) title.textContent = `${event.action_name || 'Event'} · ${event.resource_type || ''}`;
        if (subtitle) {
            subtitle.textContent = `${formatDate(event.created_at, true)} · ${event.user_name || event.username || 'System'}`;
        }

        const rows = buildAuditDiffRows(event.before, event.after);
        body.innerHTML = rows.length
            ? `<div class="xb-table-wrap"><table class="comparison-detail-table">
                <thead><tr><th>Field</th><th>Previous</th><th>New</th></tr></thead>
                <tbody>${rows.map(row => `
                    <tr>
                        <td>${escapeHtml(row.key)}</td>
                        <td>${formatAuditDiffValue(row.before)}</td>
                        <td>${formatAuditDiffValue(row.after)}</td>
                    </tr>
                `).join('')}</tbody>
            </table></div>`
            : '<div class="xb-empty-state"><div><i class="fa-solid fa-circle-check"></i><strong>No field-level changes recorded for this event</strong></div></div>';

        modal.classList.add('active');
    }

    function closeAuditDiff() {
        document.getElementById('auditDiffModal')?.classList.remove('active');
    }

    function initAudit() {
        let timer;
        document.getElementById('auditRefresh')?.addEventListener('click', loadAudit);
        ['auditSearch', 'auditAction'].forEach(id => document.getElementById(id)?.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(loadAudit, 300);
        }));
        document.getElementById('auditExport')?.addEventListener('click', () => downloadCsv('operational-audit.csv', state.audit));
        document.getElementById('auditBody')?.addEventListener('click', event => {
            const button = event.target.closest('[data-audit-diff]');
            if (!button) return;
            openAuditDiff(Number(button.dataset.auditDiff));
        });
        document.getElementById('auditDiffClose')?.addEventListener('click', closeAuditDiff);
        document.getElementById('auditDiffModal')?.addEventListener('click', event => {
            if (event.target.id === 'auditDiffModal') closeAuditDiff();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeAuditDiff();
        });
        loadAudit();
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

    function applyReportTemplate(button) {
        const form = document.getElementById('reportForm');
        if (!form) return;
        if (button.dataset.reportTemplate) form.elements.report_type.value = button.dataset.reportTemplate;
        if (button.dataset.name) form.elements.name.value = button.dataset.name;
        if (button.dataset.frequency) form.elements.frequency.value = button.dataset.frequency;
        if (button.dataset.format) form.elements.format.value = button.dataset.format;
        form.elements.name.focus();
        notify('Template applied. Add recipients and create the schedule.', 'info');
    }

    function initReports() {
        document.getElementById('reportRefresh')?.addEventListener('click', loadReports);
        document.getElementById('reportTemplates')?.addEventListener('click', event => {
            const button = event.target.closest('[data-report-template]');
            if (button) applyReportTemplate(button);
        });
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

    const initializers = {
        audit: initAudit,
        reports: initReports
    };

    initializers[center]?.();
})();
