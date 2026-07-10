// =========================================================
// PREPAID PTAX FRONTEND
// Bill source upload -> amortization schedule -> monthly GL validation.
// =========================================================

const API_URL = window.API_URL || '/api';

const state = {
    schedules: [],
    selectedScheduleId: null,
    selectedSchedule: null,
    sourceRows: [],
    bills: [],
    months: []
};

const els = {
    billSourceUploadForm: document.getElementById('billSourceUploadForm'),
    glUploadForm: document.getElementById('glUploadForm'),
    scheduleList: document.getElementById('scheduleList'),
    glScheduleSelect: document.getElementById('glScheduleSelect'),
    refreshSchedulesBtn: document.getElementById('refreshSchedulesBtn'),
    applyFiltersBtn: document.getElementById('applyFiltersBtn'),
    filterYear: document.getElementById('filterYear'),
    filterBrand: document.getElementById('filterBrand'),
    exportScheduleBtn: document.getElementById('exportScheduleBtn'),
    generateScheduleBtn: document.getElementById('generateScheduleBtn'),
    selectedScheduleTitle: document.getElementById('selectedScheduleTitle'),
    selectedScheduleSubtitle: document.getElementById('selectedScheduleSubtitle'),
    sourceRows: document.getElementById('sourceRows'),
    scheduleRows: document.getElementById('scheduleRows'),
    comparisonRows: document.getElementById('comparisonRows'),
    differenceRows: document.getElementById('differenceRows'),
    kpiSourceRows: document.getElementById('kpiSourceRows'),
    kpiIncludedRows: document.getElementById('kpiIncludedRows'),
    kpiExpected: document.getElementById('kpiExpected'),
    kpiDifference: document.getElementById('kpiDifference')
};

let isUploadingBillSource = false;
let isUploadingGl = false;

function getToken() {
    return localStorage.getItem('token') || localStorage.getItem('authToken') || '';
}

function authHeaders(json = true) {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
}

async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: options.headers || authHeaders(options.body instanceof FormData ? false : true)
    });

    if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
            const data = await response.json();
            message = data.message || data.mensaje || message;
        } catch (_) {}
        throw new Error(message);
    }

    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('application/json') ? response.json() : response;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function money(value) {
    return Number(value || 0).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function shortDate(value) {
    if (!value) return '-';
    const text = String(value);
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

function statusBadge(status) {
    const normalized = String(status || 'PENDING_GL').toUpperCase();
    const labels = {
        SOURCE_LOADED: 'Source loaded',
        GENERATED: 'Generated',
        VALIDATED: 'Validated',
        DIFFERENCE: 'Difference',
        PENDING_GL: 'Pending GL',
        MATCHED: 'Matched',
        MISSING_GL: 'Missing GL'
    };
    return `<span class="status-badge status-${normalized.toLowerCase().replace(/_/g, '-')}">${labels[normalized] || normalized}</span>`;
}

function showToast(message, type = 'info') {
    if (window.Swal) {
        window.Swal.fire({
            icon: type === 'error' ? 'error' : type === 'success' ? 'success' : 'info',
            title: message,
            timer: type === 'error' ? 4400 : 2500,
            showConfirmButton: false
        });
        return;
    }
    console[type === 'error' ? 'error' : 'log'](message);
}

function showDifferenceModal(data) {
    const rows = data.difference_rows || [];
    if (!rows.length) {
        showToast(`GL ${data.period_code}: all expected amounts matched.`, 'success');
        return;
    }

    const table = `
        <div class="prepaid-difference-modal-table">
            <table>
                <thead>
                    <tr>
                        <th>Store</th>
                        <th>Payee</th>
                        <th>Doc</th>
                        <th>Expected</th>
                        <th>Actual GL</th>
                        <th>Difference</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.slice(0, 80).map(row => `
                        <tr>
                            <td>${escapeHtml(row.store_number)}</td>
                            <td>${escapeHtml(row.payee || '')}</td>
                            <td>${escapeHtml(row.doc_number || '')}</td>
                            <td>${money(row.expected_amount)}</td>
                            <td>${money(row.gl_actual_amount)}</td>
                            <td class="${Math.abs(Number(row.difference || 0)) > 0.01 ? 'danger-text' : ''}">${money(row.difference)}</td>
                            <td>${escapeHtml(row.status)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${rows.length > 80 ? `<p>Showing 80 of ${rows.length} differences.</p>` : ''}
        </div>
    `;

    if (window.Swal) {
        window.Swal.fire({
            icon: 'warning',
            title: `Differences found in ${data.period_code}`,
            html: table,
            width: 'min(1040px, 94vw)',
            confirmButtonText: 'Review table'
        });
        return;
    }

    showToast(`${rows.length} differences found in ${data.period_code}.`, 'error');
}

async function confirmAction(title, text) {
    if (!window.Swal) return window.confirm(`${title}\n${text || ''}`);
    const result = await window.Swal.fire({
        icon: 'question',
        title,
        text,
        showCancelButton: true,
        confirmButtonText: 'Continue',
        cancelButtonText: 'Cancel'
    });
    return result.isConfirmed;
}

function renderKpis(summary = {}) {
    els.kpiSourceRows.textContent = Number(state.selectedSchedule?.source_row_count || state.sourceRows.length || 0).toLocaleString('en-US');
    els.kpiIncludedRows.textContent = Number(state.selectedSchedule?.included_row_count || state.sourceRows.filter(row => Number(row.include_in_schedule) === 1).length || 0).toLocaleString('en-US');
    els.kpiExpected.textContent = money(summary.expected_total || state.months.reduce((sum, row) => sum + Number(row.expected_amount || 0), 0));
    els.kpiDifference.textContent = money(summary.difference_total || state.months.reduce((sum, row) => sum + Number(row.difference || 0), 0));
}

function renderScheduleList() {
    if (!state.schedules.length) {
        els.scheduleList.innerHTML = '<div class="empty-card">No prepaid schedules found.</div>';
        if (els.glScheduleSelect) els.glScheduleSelect.value = '';
        return;
    }

    els.scheduleList.innerHTML = state.schedules.map(schedule => {
        const selected = Number(schedule.id) === Number(state.selectedScheduleId) ? 'selected' : '';
        return `
            <button type="button" class="schedule-card ${selected}" data-schedule-id="${schedule.id}">
                <div>
                    <strong>${escapeHtml(schedule.title)}</strong>
                    <span>${escapeHtml(schedule.brand)} - PTAX ${escapeHtml(schedule.tax_year || '')} - ${escapeHtml(shortDate(schedule.amortization_start))} to ${escapeHtml(shortDate(schedule.amortization_end))}</span>
                    <small>${escapeHtml(schedule.source_file_name || '')}</small>
                </div>
                <div class="schedule-card-stats">
                    ${statusBadge(schedule.status)}
                    <span>${Number(schedule.included_row_count || 0)} bills</span>
                    <span>${Number(schedule.generated_month_count || 0)} months</span>
                    <span>${money(schedule.difference_total || 0)}</span>
                </div>
            </button>
        `;
    }).join('');

    if (els.glScheduleSelect && state.selectedScheduleId) {
        els.glScheduleSelect.value = String(state.selectedScheduleId);
    }
}

function renderSourceRows(rows) {
    if (!rows.length) {
        els.sourceRows.innerHTML = '<tr><td colspan="8" class="empty-cell">No source bills loaded.</td></tr>';
        return;
    }

    els.sourceRows.innerHTML = rows.map(row => `
        <tr>
            <td>${escapeHtml(row.source_row_number)}</td>
            <td>${escapeHtml(row.store_number)}</td>
            <td>${escapeHtml(row.payee || '')}</td>
            <td>${escapeHtml(row.doc_number || '')}</td>
            <td>${escapeHtml(shortDate(row.doc_date || row.posted_date))}</td>
            <td>${escapeHtml(row.tax_year || '')}</td>
            <td class="number">${money(row.amount_paid)}</td>
            <td>${escapeHtml(row.memo_description || '')}</td>
        </tr>
    `).join('');
}

function renderBillRows(rows) {
    if (!rows.length) {
        els.scheduleRows.innerHTML = '<tr><td colspan="12" class="empty-cell">No generated amortization yet.</td></tr>';
        return;
    }

    els.scheduleRows.innerHTML = rows.map(row => `
        <tr>
            <td>${escapeHtml(row.store_number)}</td>
            <td>${escapeHtml(row.payee || '')}</td>
            <td>${escapeHtml(row.doc_number || '')}</td>
            <td>${escapeHtml(shortDate(row.bill_date))}</td>
            <td>${escapeHtml(row.tax_year || '')}</td>
            <td class="number">${money(row.amount_paid)}</td>
            <td>${escapeHtml(shortDate(row.amortization_start))}</td>
            <td>${escapeHtml(shortDate(row.amortization_end))}</td>
            <td class="number">${Number(row.total_months || 0)}</td>
            <td class="number">${money(row.monthly_amount)}</td>
            <td>${escapeHtml(row.prepaid_account || '')}</td>
            <td>${escapeHtml(row.expense_account || '')}</td>
        </tr>
    `).join('');
}

function renderMonthRows(rows) {
    const empty = '<tr><td colspan="8" class="empty-cell">No monthly validation loaded.</td></tr>';
    if (!rows.length) {
        els.comparisonRows.innerHTML = empty;
        els.differenceRows.innerHTML = empty;
        return;
    }

    const template = row => `
        <tr>
            <td>${escapeHtml(row.period_code)}</td>
            <td>${escapeHtml(row.store_number)}</td>
            <td>${escapeHtml(row.payee || '')}</td>
            <td>${escapeHtml(row.doc_number || '')}</td>
            <td class="number">${money(row.expected_amount)}</td>
            <td class="number">${money(row.gl_actual_amount)}</td>
            <td class="number ${Math.abs(Number(row.difference || 0)) > 0.01 ? 'danger-text' : ''}">${money(row.difference)}</td>
            <td>${statusBadge(row.status)}</td>
        </tr>
    `;

    els.comparisonRows.innerHTML = rows.map(template).join('');

    const differences = rows.filter(row => ['DIFFERENCE', 'MISSING_GL'].includes(String(row.status).toUpperCase()));
    els.differenceRows.innerHTML = differences.length
        ? differences.map(template).join('')
        : '<tr><td colspan="8" class="empty-cell">No differences found.</td></tr>';
}

async function loadSchedules() {
    const params = new URLSearchParams();
    if (els.filterYear.value) params.set('year', els.filterYear.value);
    if (els.filterBrand.value) params.set('brand', els.filterBrand.value.trim());
    const data = await apiFetch(`/prepaids/schedules?${params.toString()}`);
    state.schedules = data.schedules || [];
    renderScheduleList();
}

async function loadScheduleDetail(scheduleId) {
    const detail = await apiFetch(`/prepaids/${scheduleId}`);
    state.selectedScheduleId = Number(scheduleId);
    state.selectedSchedule = detail.schedule;
    state.sourceRows = detail.source_rows || [];
    state.bills = detail.bills || detail.rows || [];
    state.months = detail.months || detail.comparison_rows || [];

    els.selectedScheduleTitle.textContent = detail.schedule?.title || 'Schedule Detail';
    els.selectedScheduleSubtitle.textContent = `${detail.schedule?.brand || ''} - PTAX ${detail.schedule?.tax_year || ''} - ${shortDate(detail.schedule?.amortization_start)} to ${shortDate(detail.schedule?.amortization_end)} - ${detail.schedule?.status || ''}`;
    els.exportScheduleBtn.disabled = false;
    els.generateScheduleBtn.disabled = !state.sourceRows.length;
    if (els.glScheduleSelect) els.glScheduleSelect.value = String(scheduleId);

    renderKpis(detail.summary || {});
    renderSourceRows(state.sourceRows);
    renderBillRows(state.bills);
    renderMonthRows(state.months);
    renderScheduleList();
}

async function handleBillSourceUpload(event) {
    event?.preventDefault();
    if (isUploadingBillSource) return;
    const fileInput = els.billSourceUploadForm?.querySelector('input[type="file"]');
    if (!fileInput?.files?.length) return;
    if (!els.billSourceUploadForm.checkValidity()) {
        els.billSourceUploadForm.reportValidity();
        return;
    }

    isUploadingBillSource = true;
    const formData = new FormData(els.billSourceUploadForm);

    try {
        const data = await apiFetch('/prepaids/upload-bill-source', {
            method: 'POST',
            body: formData,
            headers: authHeaders(false)
        });
        showToast(`Imported ${data.extracted_rows} PTAX bills. Generating schedule...`, 'success');
        const generated = await apiFetch(`/prepaids/${data.schedule_id}/generate`, {
            method: 'POST',
            headers: authHeaders(true)
        });
        showToast(`Schedule generated: ${generated.inserted_bills} bills and ${generated.inserted_months} monthly rows.`, 'success');
        await loadSchedules();
        await loadScheduleDetail(data.schedule_id);
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        isUploadingBillSource = false;
    }
}

async function generateSchedule() {
    if (!state.selectedScheduleId) return;

    const confirmed = await confirmAction(
        'Generate amortization schedule?',
        'This will rebuild monthly expected amounts from the included bills.'
    );
    if (!confirmed) return;

    try {
        const data = await apiFetch(`/prepaids/${state.selectedScheduleId}/generate`, {
            method: 'POST',
            headers: authHeaders(true)
        });
        showToast(`Generated ${data.inserted_bills} bills and ${data.inserted_months} monthly rows.`, 'success');
        await loadSchedules();
        await loadScheduleDetail(state.selectedScheduleId);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function handleGlUpload(event) {
    event?.preventDefault();
    if (isUploadingGl) return;
    const fileInput = els.glUploadForm?.querySelector('input[type="file"]');
    if (!fileInput?.files?.length) return;
    if (!state.selectedScheduleId) {
        showToast('Select a schedule before uploading the monthly GL.', 'error');
        fileInput.value = '';
        updateDropName(fileInput);
        return;
    }
    if (els.glScheduleSelect) els.glScheduleSelect.value = String(state.selectedScheduleId);
    if (!els.glUploadForm.checkValidity()) {
        els.glUploadForm.reportValidity();
        return;
    }

    isUploadingGl = true;
    const formData = new FormData(els.glUploadForm);

    try {
        const data = await apiFetch('/prepaids/upload-gl', {
            method: 'POST',
            body: formData,
            headers: authHeaders(false)
        });
        if (Number(data.differences || 0) > 0 || Number(data.missing_gl || 0) > 0) {
            showDifferenceModal(data);
        } else {
            showToast(`GL ${data.period_code}: all expected amounts matched.`, 'success');
        }
        if (state.selectedScheduleId) await loadScheduleDetail(state.selectedScheduleId);
        await loadSchedules();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        isUploadingGl = false;
    }
}

function updateDropName(input) {
    const drop = input.closest('[data-file-drop]');
    const name = drop?.querySelector('.file-drop-name');
    if (!name) return;
    name.textContent = input.files?.[0]?.name || 'No file selected';
}

function bindAutoDrop(form, handler) {
    const input = form?.querySelector('input[type="file"]');
    const drop = form?.querySelector('[data-file-drop]');
    if (!input || !drop) return;

    input.addEventListener('change', () => {
        updateDropName(input);
        handler();
    });

    ['dragenter', 'dragover'].forEach(type => {
        drop.addEventListener(type, event => {
            event.preventDefault();
            drop.classList.add('is-dragging');
        });
    });

    ['dragleave', 'drop'].forEach(type => {
        drop.addEventListener(type, event => {
            event.preventDefault();
            drop.classList.remove('is-dragging');
        });
    });

    drop.addEventListener('drop', event => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return;
        input.files = files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

function handleScheduleClick(event) {
    const card = event.target.closest('[data-schedule-id]');
    if (!card) return;
    loadScheduleDetail(card.dataset.scheduleId).catch(error => showToast(error.message, 'error'));
}

function handleTabs(event) {
    const button = event.target.closest('.tab-button');
    if (!button) return;

    document.querySelectorAll('.tab-button').forEach(tab => tab.classList.remove('active'));
    button.classList.add('active');

    const active = button.dataset.tab;
    document.getElementById('sourceTab').classList.toggle('hidden', active !== 'source');
    document.getElementById('scheduleTab').classList.toggle('hidden', active !== 'schedule');
    document.getElementById('comparisonTab').classList.toggle('hidden', active !== 'comparison');
    document.getElementById('differencesTab').classList.toggle('hidden', active !== 'differences');
}

function exportCurrentSchedule() {
    if (!state.selectedScheduleId) return;
    window.open(`${API_URL}/prepaids/${state.selectedScheduleId}/export`, '_blank');
}

function init() {
    els.billSourceUploadForm?.addEventListener('submit', handleBillSourceUpload);
    els.glUploadForm?.addEventListener('submit', handleGlUpload);
    els.scheduleList?.addEventListener('click', handleScheduleClick);
    els.generateScheduleBtn?.addEventListener('click', generateSchedule);
    els.refreshSchedulesBtn?.addEventListener('click', () => loadSchedules().catch(error => showToast(error.message, 'error')));
    els.applyFiltersBtn?.addEventListener('click', () => loadSchedules().catch(error => showToast(error.message, 'error')));
    els.exportScheduleBtn?.addEventListener('click', exportCurrentSchedule);
    document.querySelector('.prepaid-tabs')?.addEventListener('click', handleTabs);
    bindAutoDrop(els.billSourceUploadForm, handleBillSourceUpload);
    bindAutoDrop(els.glUploadForm, handleGlUpload);
    loadSchedules().catch(error => showToast(error.message, 'error'));
}

init();
