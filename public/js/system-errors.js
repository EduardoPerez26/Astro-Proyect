let systemErrorRows = [];
let systemErrorsAutoRefreshTimer = null;
let systemErrorsRequestAbort = null;

const SYSTEM_ERROR_AUTO_REFRESH_MS = 30000;

const systemErrorsState = {
    loading: false
};

document.addEventListener('DOMContentLoaded', () => {
    const refreshButton = document.getElementById('refreshSystemErrors');
    const clearButton = document.getElementById('clearSystemErrorFilters');
    const autoRefresh = document.getElementById('systemErrorsAutoRefresh');

    refreshButton?.addEventListener('click', () => loadSystemErrors());
    clearButton?.addEventListener('click', clearSystemErrorFilters);
    autoRefresh?.addEventListener('change', toggleSystemErrorsAutoRefresh);

    ['systemErrorsSearch', 'systemErrorsStatus', 'systemErrorsSeverity', 'systemErrorsMethod', 'systemErrorsLimit']
        .forEach(id => {
            const element = document.getElementById(id);
            if (!element) return;

            const eventName = element.tagName === 'INPUT' ? 'input' : 'change';
            element.addEventListener(eventName, debounceSystemErrors(loadSystemErrors, element.tagName === 'INPUT' ? 350 : 0));
        });

    document.getElementById('systemErrorsBody')
        ?.addEventListener('click', onSystemErrorsTableClick);

    guardSystemErrorsAdminAccess();
    loadSystemErrors();
});

function guardSystemErrorsAdminAccess() {
    try {
        const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
        if (usuario?.rol && !['superadmin', 'admin'].includes(String(usuario.rol).toLowerCase())) {
            Swal.fire({
                icon: 'error',
                title: 'Access denied',
                text: 'Only administrators can view system errors.'
            }).then(() => {
                window.location.href = '/views/tiendas';
            });
        }
    } catch {
        // Backend authorization remains the source of truth.
    }
}

async function loadSystemErrors() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('systemErrorsBody');
    const button = document.getElementById('refreshSystemErrors');

    if (!token) {
        window.location.href = '/';
        return;
    }

    if (!window.API_URL || window.isOfflineMode?.() === true) {
        renderSystemErrorsUnavailable('The API is not available.');
        return;
    }

    if (systemErrorsState.loading && systemErrorsRequestAbort) {
        systemErrorsRequestAbort.abort();
    }

    systemErrorsRequestAbort = new AbortController();
    systemErrorsState.loading = true;

    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing';
    }

    if (tbody && !systemErrorRows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="system-errors-loading">Loading errors...</td></tr>';
    }

    try {
        const data = await requestSystemErrors(buildSystemErrorsQuery(), {
            signal: systemErrorsRequestAbort.signal
        });

        systemErrorRows = data.errores || [];
        renderSystemErrorsSummary(data.summary || {});
        renderSystemErrorsTable(systemErrorRows);
        openLinkedSystemErrorOnce();

        const updated = document.getElementById('systemErrorsUpdated');
        if (updated) {
            updated.textContent = `Updated ${formatSystemErrorDate(new Date().toISOString(), true)}`;
        }
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('System error screen load failed:', error);
        renderSystemErrorsUnavailable(error.message || 'System errors could not be loaded.');
    } finally {
        systemErrorsState.loading = false;
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fa-solid fa-rotate"></i> Refresh';
        }
    }
}


function openLinkedSystemErrorOnce() {
    const params = new URLSearchParams(window.location.search);
    const errorId = params.get('error_id');

    if (!errorId || openLinkedSystemErrorOnce.opened === errorId) return;

    openLinkedSystemErrorOnce.opened = errorId;
    setTimeout(() => openSystemErrorDetail(errorId), 150);
}

function buildSystemErrorsQuery() {
    const params = new URLSearchParams();
    params.set('status', getSystemErrorInputValue('systemErrorsStatus', 'open'));
    params.set('severity', getSystemErrorInputValue('systemErrorsSeverity', 'all'));
    params.set('limit', getSystemErrorInputValue('systemErrorsLimit', '50'));

    const search = getSystemErrorInputValue('systemErrorsSearch', '').trim();
    const method = getSystemErrorInputValue('systemErrorsMethod', '').trim();

    if (search) params.set('q', search);
    if (method) params.set('method', method);

    return `/notificaciones/system-errors?${params.toString()}`;
}

async function requestSystemErrors(path, options = {}) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${window.API_URL}${path}`, {
        credentials: 'include',
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(options.headers || {})
        }
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
        throw new Error(data.message || data.mensaje || 'Request failed');
    }

    return data;
}

function renderSystemErrorsSummary(summary) {
    setSystemErrorText('systemErrorsOpen', summary.abiertos || 0);
    setSystemErrorText('systemErrorsCritical', summary.criticos_abiertos || 0);
    setSystemErrorText('systemErrorsTotal', summary.total || 0);
    setSystemErrorText('systemErrorsResolved', summary.resueltos || 0);
}

function renderSystemErrorsTable(rows) {
    const tbody = document.getElementById('systemErrorsBody');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="system-errors-loading">No errors match the selected filters.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(error => {
        const severity = getSystemErrorSeverity(error);
        const isResolved = Boolean(error.resolved_at);
        const route = error.normalized_path || error.request_path || '-';
        const originalRoute = error.request_path && error.request_path !== route ? error.request_path : '';
        const method = error.method || '-';
        const statusCode = error.status_code || '-';
        const statusClass = isResolved ? 'is-resolved' : 'is-open';

        return `
            <tr data-error-id="${escapeSystemErrorHtml(error.id)}">
                <td data-label="Severity">
                    <span class="system-error-pill is-${escapeSystemErrorHtml(severity.key)}">
                        <i class="fa-solid ${escapeSystemErrorHtml(severity.icon)}"></i>
                        ${escapeSystemErrorHtml(severity.label)}
                    </span>
                </td>
                <td data-label="Route">
                    <span class="system-error-route">
                        <strong title="${escapeSystemErrorHtml(route)}">${escapeSystemErrorHtml(method)} ${escapeSystemErrorHtml(route)}</strong>
                        <small>${escapeSystemErrorHtml(statusCode)}${originalRoute ? ` / ${escapeSystemErrorHtml(originalRoute)}` : ''}</small>
                    </span>
                </td>
                <td data-label="Error">
                    <span class="system-error-message" title="${escapeSystemErrorHtml(error.error_message || '')}">
                        ${escapeSystemErrorHtml(error.error_message || 'No message')}
                    </span>
                    <span class="system-error-copy">
                        <small>${escapeSystemErrorHtml(error.error_name || 'Error')} ${error.error_code ? `/ ${escapeSystemErrorHtml(error.error_code)}` : ''}</small>
                    </span>
                </td>
                <td data-label="User / IP">
                    <span class="system-error-copy">
                        <strong>${escapeSystemErrorHtml(error.user_label || 'Unknown user')}</strong>
                        <small>${escapeSystemErrorHtml(error.ip_address || 'IP unavailable')}</small>
                    </span>
                </td>
                <td data-label="Occurrences"><strong>${Number(error.occurrences || 0).toLocaleString('en-US')}</strong></td>
                <td data-label="Last seen">${formatSystemErrorDate(error.last_seen_at)}</td>
                <td data-label="Status">
                    <span class="system-error-status ${statusClass}">${isResolved ? 'Resolved' : 'Open'}</span>
                    ${isResolved ? renderSystemErrorResolutionMeta(error) : ''}
                </td>
                <td data-label="Actions">
                    <span class="system-error-actions-cell">
                        <button class="system-error-table-action" type="button" data-error-detail="${escapeSystemErrorHtml(error.id)}" title="View detail">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button class="system-error-table-action" type="button" data-error-copy="${escapeSystemErrorHtml(error.id)}" title="Copy technical summary">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                        ${isResolved ? `
                            <button class="system-error-table-action is-reopen" type="button" data-error-reopen="${escapeSystemErrorHtml(error.id)}" title="Reopen error">
                                <i class="fa-solid fa-rotate-left"></i>
                            </button>
                        ` : `
                            <button class="system-error-table-action is-resolve" type="button" data-error-resolve="${escapeSystemErrorHtml(error.id)}" title="Mark resolved">
                                <i class="fa-solid fa-check"></i>
                            </button>
                        `}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

function renderSystemErrorResolutionMeta(error) {
    return `
        <span class="system-error-resolution">
            <small>By ${escapeSystemErrorHtml(formatSystemErrorResolvedBy(error))}</small>
            <small>${escapeSystemErrorHtml(formatSystemErrorDate(error.resolved_at, true))}</small>
        </span>
    `;
}

function formatSystemErrorResolvedBy(error) {
    if (!error || !error.resolved_at) return '-';
    return error.resolved_by_nombre || (error.resolved_by ? `User #${error.resolved_by}` : 'Unknown admin');
}

function renderSystemErrorsUnavailable(message) {
    const tbody = document.getElementById('systemErrorsBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="system-errors-loading">
                ${escapeSystemErrorHtml(message || 'System errors could not be loaded.')}
            </td>
        </tr>
    `;
}

async function onSystemErrorsTableClick(event) {
    const detailButton = event.target.closest('[data-error-detail]');
    const copyButton = event.target.closest('[data-error-copy]');
    const resolveButton = event.target.closest('[data-error-resolve]');
    const reopenButton = event.target.closest('[data-error-reopen]');

    if (detailButton) {
        await openSystemErrorDetail(detailButton.dataset.errorDetail);
        return;
    }

    if (copyButton) {
        await copySystemErrorSummary(copyButton.dataset.errorCopy);
        return;
    }

    if (resolveButton) {
        await resolveSystemError(resolveButton.dataset.errorResolve, resolveButton);
        return;
    }

    if (reopenButton) {
        await reopenSystemError(reopenButton.dataset.errorReopen, reopenButton);
    }
}

async function openSystemErrorDetail(errorId) {
    const cached = systemErrorRows.find(item => String(item.id) === String(errorId));
    let error = cached;

    try {
        const data = await requestSystemErrors(`/notificaciones/system-errors/${encodeURIComponent(errorId)}`);
        error = data.error || cached;
    } catch (requestError) {
        if (!error) throw requestError;
    }

    if (!error) return;

    const isResolved = Boolean(error.resolved_at);
    const route = error.request_path || error.normalized_path || '-';
    const normalizedRoute = error.normalized_path || route;
    const technicalPayload = {
        hash: error.error_hash,
        method: error.method,
        route: error.request_path,
        normalizedRoute: error.normalized_path,
        statusCode: error.status_code,
        errorName: error.error_name,
        errorCode: error.error_code,
        message: error.error_message,
        query: error.query_params,
        body: error.body_snapshot,
        response: error.response_snapshot,
        metadata: error.metadata,
        resolution: {
            resolvedBy: error.resolved_by_nombre || null,
            resolvedAt: error.resolved_at || null,
            notes: error.resolution_notes || null
        },
        stack: error.stack_trace
    };

    await Swal.fire({
        title: '',
        width: 1040,
        padding: 0,
        confirmButtonText: 'Close',
        showCancelButton: !isResolved,
        cancelButtonText: 'Mark resolved',
        buttonsStyling: true,
        customClass: {
            popup: 'system-error-detail-popup',
            htmlContainer: 'system-error-detail-html',
            actions: 'system-error-detail-actions',
            confirmButton: 'system-error-detail-confirm',
            cancelButton: 'system-error-detail-cancel'
        },
        html: `
            <div class="system-error-detail-modal">
                <header class="system-error-detail-header">
                    <span class="system-error-detail-header-icon" aria-hidden="true">
                        <i class="fa-solid fa-bug"></i>
                    </span>
                    <div>
                        <span class="system-error-detail-kicker">Backend incident</span>
                        <h2 class="system-error-detail-title">System error detail</h2>
                        <span class="system-error-detail-route-line" title="${escapeSystemErrorHtml(error.method || '-')} ${escapeSystemErrorHtml(route)}">
                            ${escapeSystemErrorHtml(error.method || '-')} ${escapeSystemErrorHtml(route)}
                        </span>
                    </div>
                </header>

                <div class="system-error-detail-body">
                    <section class="system-error-detail-alert ${isResolved ? 'is-resolved' : ''}">
                        <div class="system-error-detail-alert-text">
                            <span>Error message</span>
                            <strong>${escapeSystemErrorHtml(error.error_message || 'No message')}</strong>
                        </div>
                        <div class="system-error-detail-alert-meta">
                            <span class="system-error-detail-chip ${isResolved ? 'is-resolved' : 'is-open'}">
                                <i class="fa-solid ${isResolved ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
                                ${isResolved ? 'Resolved' : 'Open'}
                            </span>
                            <span class="system-error-detail-chip is-method">${escapeSystemErrorHtml(error.status_code || '-')}</span>
                            <span class="system-error-detail-chip is-method">${escapeSystemErrorHtml(error.method || '-')}</span>
                        </div>
                    </section>

                    <div class="system-error-detail-layout">
                        <section class="system-error-detail-section">
                            <div class="system-error-detail-section-header">
                                <h3>Request context</h3>
                                <span>Runtime data</span>
                            </div>
                            <div class="system-error-detail-grid">
                                ${renderSystemErrorDetailCard('Route', `${error.method || '-'} ${route}`, 'is-wide')}
                                ${renderSystemErrorDetailCard('Normalized route', normalizedRoute, 'is-wide')}
                                ${renderSystemErrorDetailCard('Status', `${error.status_code || '-'} / ${isResolved ? 'Resolved' : 'Open'}`)}
                                ${renderSystemErrorDetailCard('Occurrences', Number(error.occurrences || 0).toLocaleString('en-US'))}
                                ${renderSystemErrorDetailCard('User', error.user_label || 'Unknown user')}
                                ${renderSystemErrorDetailCard('IP address', error.ip_address || '-')}
                                ${renderSystemErrorDetailCard('First seen', formatSystemErrorDate(error.first_seen_at))}
                                ${renderSystemErrorDetailCard('Last seen', formatSystemErrorDate(error.last_seen_at))}
                            </div>
                        </section>

                        <section class="system-error-detail-section">
                            <div class="system-error-detail-section-header">
                                <h3>Resolution</h3>
                                <span>Admin tracking</span>
                            </div>
                            <div class="system-error-detail-stack">
                                ${renderSystemErrorDetailCard('Resolved by', formatSystemErrorResolvedBy(error))}
                                ${renderSystemErrorDetailCard('Resolved at', formatSystemErrorDate(error.resolved_at))}
                                ${renderSystemErrorDetailCard('Resolution notes', error.resolution_notes || '-', 'is-wide')}
                                ${renderSystemErrorDetailCard('Error name', error.error_name || '-')}
                                ${renderSystemErrorDetailCard('Error code', error.error_code || '-')}
                                ${renderSystemErrorDetailCard('Hash', error.error_hash || '-', 'is-wide')}
                            </div>
                        </section>
                    </div>

                    <details class="system-error-detail-technical" open>
                        <summary>Technical payload</summary>
                        <pre class="system-error-detail-pre">${escapeSystemErrorHtml(JSON.stringify(technicalPayload, null, 2))}</pre>
                    </details>
                </div>
            </div>
        `
    }).then(async result => {
        if (result.dismiss === Swal.DismissReason.cancel && !isResolved) {
            await resolveSystemError(error.id);
        }
    });
}

function renderSystemErrorDetailCard(label, value, extraClass = '') {
    return `
        <div class="system-error-detail-card ${escapeSystemErrorHtml(extraClass)}">
            <span>${escapeSystemErrorHtml(label)}</span>
            <strong>${escapeSystemErrorHtml(value || '-')}</strong>
        </div>
    `;
}

async function resolveSystemError(errorId, button = null) {
    const result = await Swal.fire({
        icon: 'question',
        title: 'Mark error as resolved?',
        input: 'textarea',
        inputLabel: 'Resolution notes',
        inputPlaceholder: 'Example: Fixed missing database column and redeployed backend.',
        inputAttributes: { maxlength: 500 },
        showCancelButton: true,
        confirmButtonText: 'Mark resolved',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#147644'
    });

    if (!result.isConfirmed) return;

    const data = await updateSystemErrorStatus(
        `/notificaciones/system-errors/${encodeURIComponent(errorId)}/resolved`,
        { notes: result.value || '' },
        button
    );

    if (!data) return;

    const resolvedBy = data.resolved_by_nombre || data.error?.resolved_by_nombre || 'Unknown admin';
    const resolvedAt = data.resolved_at || data.error?.resolved_at;

    await Swal.fire({
        icon: 'success',
        title: 'Error marked as resolved',
        html: `
            <div class="system-error-resolution-confirm">
                <span>Resolved by</span>
                <strong>${escapeSystemErrorHtml(resolvedBy)}</strong>
                <small>${escapeSystemErrorHtml(formatSystemErrorDate(resolvedAt))}</small>
            </div>
        `,
        timer: 2600,
        showConfirmButton: false
    });

    await loadSystemErrors();
}

async function reopenSystemError(errorId, button = null) {
    const result = await Swal.fire({
        icon: 'warning',
        title: 'Reopen this error?',
        text: 'The error will return to the open incident list.',
        showCancelButton: true,
        confirmButtonText: 'Reopen',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#92400e'
    });

    if (!result.isConfirmed) return;

    const data = await updateSystemErrorStatus(
        `/notificaciones/system-errors/${encodeURIComponent(errorId)}/reopen`,
        {},
        button
    );

    if (!data) return;

    await Swal.fire({
        icon: 'success',
        title: 'Error reopened',
        timer: 1400,
        showConfirmButton: false
    });

    await loadSystemErrors();
}

async function updateSystemErrorStatus(path, body, button) {
    if (button) button.disabled = true;

    try {
        return await requestSystemErrors(path, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        });
    } catch (error) {
        console.error('System error status update failed:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Update failed',
            text: error.message || 'The error status could not be updated.'
        });
        return null;
    } finally {
        if (button) button.disabled = false;
    }
}

async function copySystemErrorSummary(errorId) {
    const error = systemErrorRows.find(item => String(item.id) === String(errorId));
    if (!error) return;

    const summary = [
        `System error #${error.id}`,
        `Status: ${error.resolved_at ? 'Resolved' : 'Open'}`,
        `HTTP: ${error.status_code || '-'}`,
        `Route: ${error.method || '-'} ${error.request_path || '-'}`,
        `User: ${error.user_label || '-'}`,
        `IP: ${error.ip_address || '-'}`,
        `Occurrences: ${error.occurrences || 0}`,
        `First seen: ${formatSystemErrorDate(error.first_seen_at)}`,
        `Last seen: ${formatSystemErrorDate(error.last_seen_at)}`,
        `Resolved by: ${formatSystemErrorResolvedBy(error)}`,
        `Resolved at: ${formatSystemErrorDate(error.resolved_at)}`,
        `Resolution notes: ${error.resolution_notes || '-'}`,
        `Message: ${error.error_message || '-'}`,
        `Hash: ${error.error_hash || '-'}`
    ].join('\n');

    try {
        await navigator.clipboard.writeText(summary);
        await Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'Copied',
            showConfirmButton: false,
            timer: 1500
        });
    } catch {
        await Swal.fire({
            title: 'Technical summary',
            input: 'textarea',
            inputValue: summary,
            inputAttributes: { readonly: true },
            confirmButtonText: 'Close'
        });
    }
}

function clearSystemErrorFilters() {
    setSystemErrorInputValue('systemErrorsSearch', '');
    setSystemErrorInputValue('systemErrorsStatus', 'open');
    setSystemErrorInputValue('systemErrorsSeverity', 'all');
    setSystemErrorInputValue('systemErrorsMethod', '');
    setSystemErrorInputValue('systemErrorsLimit', '50');
    loadSystemErrors();
}

function toggleSystemErrorsAutoRefresh(event) {
    if (systemErrorsAutoRefreshTimer) {
        clearInterval(systemErrorsAutoRefreshTimer);
        systemErrorsAutoRefreshTimer = null;
    }

    if (event.target.checked) {
        systemErrorsAutoRefreshTimer = setInterval(loadSystemErrors, SYSTEM_ERROR_AUTO_REFRESH_MS);
    }
}

function getSystemErrorSeverity(error) {
    const status = Number(error.status_code || 0);

    if (status >= 500) {
        return { key: 'critical', label: 'Critical', icon: 'fa-bug' };
    }

    if (status === 413) {
        return { key: 'upload', label: 'Upload', icon: 'fa-file-circle-exclamation' };
    }

    if (status >= 400) {
        return { key: 'client', label: 'Client', icon: 'fa-circle-info' };
    }

    return { key: 'server', label: 'Server', icon: 'fa-server' };
}

function getSystemErrorInputValue(id, fallback = '') {
    const element = document.getElementById(id);
    return element ? element.value : fallback;
}

function setSystemErrorInputValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value;
}

function setSystemErrorText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = Number(value || 0).toLocaleString('en-US');
}

function formatSystemErrorDate(value, short = false) {
    if (!value) return '-';

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString('en-US', short
        ? { hour: '2-digit', minute: '2-digit' }
        : { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function debounceSystemErrors(callback, wait = 250) {
    let timer = null;

    return (...args) => {
        if (!wait) {
            callback(...args);
            return;
        }

        clearTimeout(timer);
        timer = setTimeout(() => callback(...args), wait);
    };
}

function escapeSystemErrorHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
