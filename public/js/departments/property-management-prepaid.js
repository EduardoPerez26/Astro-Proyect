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
    importedSourceRowCount: 0,
    sourceDirty: false,
    removedStoreNumbers: new Set(),
    bills: [],
    months: [],
    summary: {}
};

const els = {
    billSourceUploadForm: document.getElementById('billSourceUploadForm'),
    glUploadForm: document.getElementById('glUploadForm'),
    scheduleList: document.getElementById('scheduleList'),
    glScheduleSelect: document.getElementById('glScheduleSelect'),
    refreshSchedulesBtn: document.getElementById('refreshSchedulesBtn'),
    exportScheduleBtn: document.getElementById('exportScheduleBtn'),
    addSourceRowBtn: document.getElementById('addSourceRowBtn'),
    generateScheduleBtn: document.getElementById('generateScheduleBtn'),
    sourceReviewStatus: document.getElementById('sourceReviewStatus'),
    saveScheduleBtn: document.getElementById('saveScheduleBtn'),
    saveScheduleFooter: document.getElementById('saveScheduleFooter'),
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

function sqlDate(value, fallback = '') {
    const normalized = shortDate(value || fallback);
    return normalized === '-' ? '' : normalized;
}

function parseSqlDateParts(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3])
    };
}

function formatSqlDate(date) {
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0')
    ].join('-');
}

function addMonthsMinusOneDay(startDate, monthCount) {
    const parts = parseSqlDateParts(startDate);
    const months = Number(monthCount);
    if (!parts || !Number.isInteger(months) || months < 1) return '';

    const targetMonthIndex = (parts.month - 1) + months;
    const targetYear = parts.year + Math.floor(targetMonthIndex / 12);
    const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const target = new Date(Date.UTC(targetYear, targetMonth, Math.min(parts.day, lastDay)));
    target.setUTCDate(target.getUTCDate() - 1);
    return formatSqlDate(target);
}

function inclusiveMonthCount(startDate, endDate) {
    const start = parseSqlDateParts(startDate);
    const end = parseSqlDateParts(endDate);
    if (!start || !end || String(endDate) < String(startDate)) return 0;
    return ((end.year - start.year) * 12) + (end.month - start.month) + 1;
}

function getRowAmortization(row = {}) {
    const defaultStart = sqlDate(state.selectedSchedule?.amortization_start);
    const defaultEnd = sqlDate(state.selectedSchedule?.amortization_end);
    const start = sqlDate(row.amortization_start, defaultStart);
    const end = sqlDate(row.amortization_end, defaultEnd);
    return {
        start,
        end,
        months: inclusiveMonthCount(start, end),
        isCustom: Boolean(start && end && (start !== defaultStart || end !== defaultEnd))
    };
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

function createDraftRowId(row, index = 0) {
    return String(row?._draft_id || row?.id || row?.source_row_id || `source-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`);
}

function normalizeSourceRows(rows = []) {
    const defaultStart = sqlDate(state.selectedSchedule?.amortization_start);
    const defaultEnd = sqlDate(state.selectedSchedule?.amortization_end);

    return rows.map((row, index) => ({
        ...row,
        _draft_id: createDraftRowId(row, index),
        is_manual: Number(row.is_manual || row.manual_entry || 0),
        amortization_start: sqlDate(row.amortization_start, defaultStart),
        amortization_end: sqlDate(row.amortization_end, defaultEnd)
    }));
}

function updateSourceEditorState() {
    const hasSchedule = Boolean(state.selectedScheduleId);
    const hasRows = state.sourceRows.length > 0;
    const generated = state.bills.length > 0;

    if (els.addSourceRowBtn) {
        els.addSourceRowBtn.classList.toggle('hidden', !hasSchedule);
        els.addSourceRowBtn.disabled = !hasSchedule;
    }

    if (els.generateScheduleBtn) {
        els.generateScheduleBtn.classList.toggle('hidden', !hasSchedule);
        els.generateScheduleBtn.disabled = !hasSchedule || !hasRows;
        els.generateScheduleBtn.innerHTML = generated
            ? '<i class="fa-solid fa-rotate" aria-hidden="true"></i> Regenerate Schedule'
            : '<i class="fa-solid fa-calculator" aria-hidden="true"></i> Generate Schedule';
    }

    if (els.sourceReviewStatus) {
        if (!hasSchedule) {
            els.sourceReviewStatus.textContent = 'Upload a file to review its records before generating.';
            els.sourceReviewStatus.classList.remove('pending');
        } else if (state.sourceDirty) {
            const staleText = generated ? ' The current generated schedule is out of date.' : '';
            els.sourceReviewStatus.textContent = `${state.sourceRows.length} rows ready. Changes will be saved when the schedule is generated.${staleText}`;
            els.sourceReviewStatus.classList.add('pending');
        } else {
            els.sourceReviewStatus.textContent = `${state.sourceRows.length} rows ready to generate.`;
            els.sourceReviewStatus.classList.remove('pending');
        }
    }
}

function markSourceDirty() {
    state.sourceDirty = true;
    if (els.exportScheduleBtn) els.exportScheduleBtn.disabled = true;
    renderKpis(state.summary || {});
    updateSourceEditorState();
}

function renderKpis(summary = {}) {
    const importedCount = Number(state.importedSourceRowCount || state.selectedSchedule?.source_row_count || 0);
    els.kpiSourceRows.textContent = importedCount.toLocaleString('en-US');
    els.kpiIncludedRows.textContent = Number(state.sourceRows.length || 0).toLocaleString('en-US');
    els.kpiExpected.textContent = money(summary.expected_total || state.months.reduce((sum, row) => sum + Number(row.expected_amount || 0), 0));
    els.kpiDifference.textContent = money(summary.difference_total || state.months.reduce((sum, row) => sum + Number(row.difference || 0), 0));
}

function renderScheduleList() {
    if (!els.scheduleList) return;

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
        els.sourceRows.innerHTML = '<tr><td colspan="10" class="empty-cell">No source bills loaded.</td></tr>';
        updateSourceEditorState();
        return;
    }

    els.sourceRows.innerHTML = rows.map((row, index) => {
        const rowKey = createDraftRowId(row, index);
        const period = getRowAmortization(row);
        const manualBadge = Number(row.is_manual || 0) === 1
            ? '<span class="source-manual-badge"><i class="fa-solid fa-pen" aria-hidden="true"></i> Manual</span>'
            : '';
        const periodBadge = period.isCustom
            ? '<span class="source-period-badge custom">Custom</span>'
            : '<span class="source-period-badge">Default</span>';

        return `
            <tr data-source-row-key="${escapeHtml(rowKey)}">
                <td>${escapeHtml(row.source_row_number || index + 1)}</td>
                <td class="strong">${escapeHtml(row.store_number)}</td>
                <td>
                    <span>${escapeHtml(row.payee || '')}</span>
                    ${manualBadge}
                </td>
                <td>${escapeHtml(row.doc_number || '')}</td>
                <td>${escapeHtml(shortDate(row.doc_date || row.posted_date))}</td>
                <td>${escapeHtml(row.tax_year || '')}</td>
                <td class="number">${money(row.amount_paid)}</td>
                <td class="source-amortization-cell">
                    <div class="source-amortization-range">
                        <strong>${escapeHtml(period.start || '-')} <span>→</span> ${escapeHtml(period.end || '-')}</strong>
                        <small>${period.months ? `${period.months} month${period.months === 1 ? '' : 's'}` : 'Invalid period'} ${periodBadge}</small>
                    </div>
                </td>
                <td>${escapeHtml(row.memo_description || '')}</td>
                <td class="source-row-actions">
                    <div class="source-row-action-group" role="group" aria-label="Source row actions">
                        <button
                            type="button"
                            class="source-action-btn source-action-edit"
                            data-edit-source-amortization="${escapeHtml(rowKey)}"
                            title="Change amortization period"
                            aria-label="Change amortization period for row ${escapeHtml(row.source_row_number || index + 1)}"
                        >
                            <i class="fa-solid fa-calendar-days" aria-hidden="true"></i>
                            <span>Edit</span>
                        </button>
                        <button
                            type="button"
                            class="source-action-btn source-action-row"
                            data-remove-source-row="${escapeHtml(rowKey)}"
                            title="Remove only this row"
                            aria-label="Remove only row ${escapeHtml(row.source_row_number || index + 1)}"
                        >
                            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                            <span>Row</span>
                        </button>
                        <button
                            type="button"
                            class="source-action-btn source-action-store"
                            data-remove-source-store="${escapeHtml(row.store_number || '')}"
                            title="Remove every row for store ${escapeHtml(row.store_number || '')}"
                            aria-label="Remove every row for store ${escapeHtml(row.store_number || '')}"
                        >
                            <i class="fa-solid fa-store-slash" aria-hidden="true"></i>
                            <span>Store</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    updateSourceEditorState();
}

function serializeSourceRow(row, index) {
    return {
        id: Number(row.id || row.source_row_id || 0) || null,
        source_row_number: Number(row.source_row_number || index + 1),
        store_number: String(row.store_number || '').trim(),
        payee: String(row.payee || '').trim(),
        doc_number: String(row.doc_number || '').trim(),
        doc_date: shortDate(row.doc_date || row.posted_date) === '-' ? null : shortDate(row.doc_date || row.posted_date),
        posted_date: shortDate(row.posted_date || row.doc_date) === '-' ? null : shortDate(row.posted_date || row.doc_date),
        tax_year: Number(row.tax_year || state.selectedSchedule?.tax_year || 0) || null,
        amount_paid: Number(row.amount_paid || 0),
        memo_description: String(row.memo_description || '').trim(),
        prepaid_account: String(row.prepaid_account || '').trim() || null,
        expense_account: String(row.expense_account || '').trim() || null,
        amortization_start: getRowAmortization(row).start || null,
        amortization_end: getRowAmortization(row).end || null,
        is_manual: Number(row.is_manual || 0)
    };
}

async function persistSourceRows() {
    if (!state.selectedScheduleId) throw new Error('No schedule is selected.');

    const rows = state.sourceRows.map(serializeSourceRow);
    const data = await apiFetch(`/prepaids/${state.selectedScheduleId}/source-rows`, {
        method: 'PUT',
        body: JSON.stringify({
            rows,
            removed_store_numbers: Array.from(state.removedStoreNumbers)
        }),
        headers: authHeaders(true)
    });

    if (Array.isArray(data.source_rows)) {
        state.sourceRows = normalizeSourceRows(data.source_rows);
    }
    state.removedStoreNumbers.clear();
    return data;
}

async function removeSourceStore(storeNumber) {
    const store = String(storeNumber || '').trim();
    if (!store) return;

    const affected = state.sourceRows.filter(row => String(row.store_number || '').trim() === store).length;
    if (!affected) return;

    const confirmed = await confirmAction(
        `Remove store ${store}?`,
        `${affected} row${affected === 1 ? '' : 's'} will be excluded from the schedule that is generated.`
    );
    if (!confirmed) return;

    state.sourceRows = state.sourceRows.filter(row => String(row.store_number || '').trim() !== store);
    state.removedStoreNumbers.add(store);
    markSourceDirty();
    renderSourceRows(state.sourceRows);
    showToast(`Store ${store} removed from the source review.`, 'success');
}

async function removeSourceRow(rowKey) {
    const row = state.sourceRows.find(item => String(item._draft_id) === String(rowKey));
    if (!row) return;

    const confirmed = await confirmAction(
        'Remove this row?',
        `${row.store_number || 'No store'} - ${row.payee || row.doc_number || 'Source record'}`
    );
    if (!confirmed) return;

    state.sourceRows = state.sourceRows.filter(item => String(item._draft_id) !== String(rowKey));
    markSourceDirty();
    renderSourceRows(state.sourceRows);
}


function ensureAmortizationModalStyles() {
    const styleId = 'prepaid-amortization-modal-global-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .swal2-container .swal2-popup.source-amortization-swal {
            width: min(720px, calc(100vw - 32px)) !important;
            max-width: none !important;
            padding: 0 !important;
            overflow: hidden !important;
            border-radius: 22px !important;
            background: #ffffff !important;
            box-shadow: 0 28px 70px rgba(15, 23, 42, 0.28) !important;
        }

        .source-amortization-swal .swal2-title {
            margin: 0 !important;
            padding: 26px 28px 8px !important;
            color: #10233c !important;
            font-size: 27px !important;
            line-height: 1.15 !important;
            font-weight: 900 !important;
            text-align: left !important;
        }

        .source-amortization-swal .swal2-html-container,
        .source-amortization-swal-html {
            margin: 0 !important;
            padding: 0 28px 18px !important;
            overflow: visible !important;
            text-align: left !important;
        }

        .source-amortization-modal-body {
            display: grid !important;
            gap: 16px !important;
            width: 100% !important;
            box-sizing: border-box !important;
            text-align: left !important;
        }

        .source-amortization-summary {
            display: grid !important;
            grid-template-columns: 48px minmax(0, 1fr) !important;
            gap: 14px !important;
            align-items: center !important;
            padding: 16px 18px !important;
            border: 1px solid #d9e5f1 !important;
            border-radius: 16px !important;
            background: linear-gradient(180deg, #f8fbff 0%, #f1f6fc 100%) !important;
            box-sizing: border-box !important;
        }

        .source-amortization-summary-icon {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 46px !important;
            height: 46px !important;
            border-radius: 14px !important;
            background: #10233c !important;
            color: #ffffff !important;
            font-size: 17px !important;
            box-shadow: 0 9px 18px rgba(16, 35, 60, 0.18) !important;
        }

        .source-amortization-summary strong {
            display: block !important;
            margin: 0 0 4px !important;
            color: #17324f !important;
            font-size: 14px !important;
            line-height: 1.4 !important;
            font-weight: 900 !important;
        }

        .source-amortization-summary span {
            display: block !important;
            color: #687d92 !important;
            font-size: 13px !important;
            line-height: 1.4 !important;
        }

        .source-amortization-presets {
            display: grid !important;
            gap: 9px !important;
            padding: 14px 16px !important;
            border: 1px solid #e0e8f1 !important;
            border-radius: 15px !important;
            background: #ffffff !important;
        }

        .source-amortization-presets > span {
            display: block !important;
            color: #40566f !important;
            font-size: 11px !important;
            line-height: 1 !important;
            font-weight: 900 !important;
            letter-spacing: 0.04em !important;
            text-transform: uppercase !important;
        }

        .source-amortization-presets > div {
            display: grid !important;
            grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
            gap: 8px !important;
        }

        .source-amortization-presets button {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
            height: 38px !important;
            margin: 0 !important;
            padding: 0 10px !important;
            border: 1px solid #ccd9e8 !important;
            border-radius: 11px !important;
            background: #ffffff !important;
            color: #40566f !important;
            font-family: inherit !important;
            font-size: 12px !important;
            line-height: 1 !important;
            font-weight: 850 !important;
            white-space: nowrap !important;
            cursor: pointer !important;
            transition: transform 150ms ease, border-color 150ms ease, background 150ms ease, color 150ms ease, box-shadow 150ms ease !important;
        }

        .source-amortization-presets button:hover {
            transform: translateY(-1px) !important;
            border-color: #86aee0 !important;
            background: #f2f7fd !important;
            color: #174d85 !important;
            box-shadow: 0 5px 12px rgba(42, 91, 145, 0.10) !important;
        }

        .source-amortization-presets button.active {
            border-color: #315f94 !important;
            background: #173b63 !important;
            color: #ffffff !important;
            box-shadow: 0 7px 15px rgba(23, 59, 99, 0.20) !important;
        }

        .source-amortization-date-grid {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 14px !important;
        }

        .source-amortization-date-grid label {
            display: grid !important;
            gap: 7px !important;
            margin: 0 !important;
            min-width: 0 !important;
        }

        .source-amortization-date-grid label span {
            color: #40566f !important;
            font-size: 12px !important;
            font-weight: 850 !important;
        }

        .source-amortization-date-grid .swal2-input {
            width: 100% !important;
            min-width: 0 !important;
            height: 48px !important;
            margin: 0 !important;
            padding: 0 14px !important;
            box-sizing: border-box !important;
            border: 1px solid #ccd9e8 !important;
            border-radius: 13px !important;
            background: #fbfdff !important;
            color: #10233c !important;
            font-family: inherit !important;
            font-size: 14px !important;
            box-shadow: inset 0 1px 1px rgba(16, 35, 60, 0.03) !important;
        }

        .source-amortization-date-grid .swal2-input:focus {
            border-color: #7fa8db !important;
            background: #ffffff !important;
            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.13) !important;
            outline: none !important;
        }

        .source-amortization-preview {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            padding: 13px 15px !important;
            border: 1px solid #d6e7fa !important;
            border-radius: 13px !important;
            background: #edf5ff !important;
            color: #245b96 !important;
            font-size: 13px !important;
            line-height: 1.35 !important;
            font-weight: 800 !important;
        }

        .source-amortization-swal .swal2-actions,
        .source-amortization-swal-actions {
            display: flex !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 16px 28px 24px !important;
            gap: 10px !important;
            justify-content: flex-end !important;
            box-sizing: border-box !important;
            border-top: 1px solid #e2ebf4 !important;
            background: #f8fbff !important;
        }

        .source-amortization-confirm-btn,
        .source-amortization-cancel-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 8px !important;
            min-width: 148px !important;
            height: 44px !important;
            margin: 0 !important;
            padding: 0 17px !important;
            border: 1px solid transparent !important;
            border-radius: 12px !important;
            font-family: inherit !important;
            font-size: 13px !important;
            font-weight: 900 !important;
            cursor: pointer !important;
        }

        .source-amortization-confirm-btn {
            background: #0f172a !important;
            color: #ffffff !important;
            box-shadow: 0 8px 18px rgba(15, 23, 42, 0.18) !important;
        }

        .source-amortization-confirm-btn:hover {
            transform: translateY(-1px) !important;
            box-shadow: 0 11px 22px rgba(15, 23, 42, 0.24) !important;
        }

        .source-amortization-cancel-btn {
            border-color: #d7e2ee !important;
            background: #ffffff !important;
            color: #334a63 !important;
        }

        .source-amortization-cancel-btn:hover {
            background: #f3f7fb !important;
        }

        @media (max-width: 620px) {
            .swal2-container .swal2-popup.source-amortization-swal {
                width: calc(100vw - 20px) !important;
                border-radius: 18px !important;
            }

            .source-amortization-swal .swal2-title {
                padding: 22px 18px 8px !important;
                font-size: 23px !important;
            }

            .source-amortization-swal .swal2-html-container,
            .source-amortization-swal-html {
                padding: 0 18px 14px !important;
            }

            .source-amortization-presets > div {
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .source-amortization-presets button:last-child {
                grid-column: 1 / -1 !important;
            }

            .source-amortization-date-grid {
                grid-template-columns: 1fr !important;
            }

            .source-amortization-swal .swal2-actions,
            .source-amortization-swal-actions {
                padding: 14px 18px 20px !important;
                flex-direction: column-reverse !important;
                align-items: stretch !important;
            }

            .source-amortization-confirm-btn,
            .source-amortization-cancel-btn {
                width: 100% !important;
            }
        }
    `;

    document.head.appendChild(style);
}

function sourceAmortizationModalHtml(row, defaults) {
    const months = inclusiveMonthCount(defaults.start, defaults.end);
    return `
        <div class="source-amortization-modal-body">
            <div class="source-amortization-summary">
                <div class="source-amortization-summary-icon">
                    <i class="fa-solid fa-calendar-check" aria-hidden="true"></i>
                </div>
                <div>
                    <strong>${escapeHtml(row.store_number || 'No store')} · ${escapeHtml(row.payee || row.doc_number || 'Payment')}</strong>
                    <span>${money(row.amount_paid)} · ${escapeHtml(row.doc_number || 'No document')}</span>
                </div>
            </div>

            <div class="source-amortization-presets" aria-label="Quick amortization periods">
                <span>Quick period</span>
                <div>
                    ${[3, 6, 12, 18, 24].map(value => `
                        <button type="button" data-amortization-months="${value}">${value} months</button>
                    `).join('')}
                </div>
            </div>

            <div class="source-amortization-date-grid">
                <label>
                    <span>Start date</span>
                    <input id="rowAmortizationStart" class="swal2-input" type="date" value="${escapeHtml(defaults.start)}">
                </label>
                <label>
                    <span>End date</span>
                    <input id="rowAmortizationEnd" class="swal2-input" type="date" value="${escapeHtml(defaults.end)}">
                </label>
            </div>

            <div class="source-amortization-preview" id="rowAmortizationPreview">
                <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
                <span>${months ? `${months} monthly amortization entries will be generated.` : 'Select a valid period.'}</span>
            </div>
        </div>
    `;
}

async function editSourceAmortization(rowKey) {
    const row = state.sourceRows.find(item => String(item._draft_id) === String(rowKey));
    if (!row) return;

    const current = getRowAmortization(row);
    let values;

    if (!window.Swal) {
        const start = window.prompt('Amortization start (YYYY-MM-DD):', current.start)?.trim();
        if (!start) return;
        const end = window.prompt('Amortization end (YYYY-MM-DD):', current.end)?.trim();
        if (!end) return;
        if (!parseSqlDateParts(start) || !parseSqlDateParts(end) || end < start) {
            showToast('Enter a valid amortization period.', 'error');
            return;
        }
        values = { start, end };
    } else {
        ensureAmortizationModalStyles();

        const result = await window.Swal.fire({
            title: 'Edit amortization',
            html: sourceAmortizationModalHtml(row, current),
            width: 'min(720px, calc(100vw - 32px))',
            customClass: {
                popup: 'source-amortization-swal',
                htmlContainer: 'source-amortization-swal-html',
                actions: 'source-amortization-swal-actions',
                confirmButton: 'source-amortization-confirm-btn',
                cancelButton: 'source-amortization-cancel-btn'
            },
            buttonsStyling: false,
            showCancelButton: true,
            confirmButtonText: '<i class="fa-solid fa-check" aria-hidden="true"></i><span>Apply period</span>',
            cancelButtonText: '<i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Cancel</span>',
            focusConfirm: false,
            didOpen: popup => {
                popup.classList.add('source-amortization-swal');
                popup.style.setProperty('width', 'min(720px, calc(100vw - 32px))', 'important');
                popup.style.setProperty('max-width', 'none', 'important');

                const htmlContainer = popup.querySelector('.swal2-html-container');
                const actions = popup.querySelector('.swal2-actions');
                const confirmButton = window.Swal.getConfirmButton?.();
                const cancelButton = window.Swal.getCancelButton?.();
                htmlContainer?.classList.add('source-amortization-swal-html');
                actions?.classList.add('source-amortization-swal-actions');
                confirmButton?.classList.add('source-amortization-confirm-btn');
                cancelButton?.classList.add('source-amortization-cancel-btn');

                const startInput = popup.querySelector('#rowAmortizationStart');
                const endInput = popup.querySelector('#rowAmortizationEnd');
                const preview = popup.querySelector('#rowAmortizationPreview span');

                const updatePreview = () => {
                    const start = startInput?.value || '';
                    const end = endInput?.value || '';
                    const months = inclusiveMonthCount(start, end);
                    if (preview) {
                        preview.textContent = months
                            ? `${months} monthly amortization entries will be generated.`
                            : 'Select a valid period.';
                    }
                };

                popup.querySelectorAll('[data-amortization-months]').forEach(button => {
                    button.addEventListener('click', () => {
                        const months = Number(button.dataset.amortizationMonths);
                        const start = startInput?.value || sqlDate(row.doc_date || row.posted_date) || current.start;
                        if (!start || !startInput || !endInput) return;
                        startInput.value = start;
                        endInput.value = addMonthsMinusOneDay(start, months);
                        popup.querySelectorAll('[data-amortization-months]').forEach(item => item.classList.remove('active'));
                        button.classList.add('active');
                        updatePreview();
                    });
                });

                startInput?.addEventListener('change', updatePreview);
                endInput?.addEventListener('change', updatePreview);
                updatePreview();
            },
            preConfirm: () => {
                const start = document.getElementById('rowAmortizationStart')?.value || '';
                const end = document.getElementById('rowAmortizationEnd')?.value || '';
                if (!parseSqlDateParts(start) || !parseSqlDateParts(end)) {
                    window.Swal.showValidationMessage('Start date and end date are required.');
                    return false;
                }
                if (end < start) {
                    window.Swal.showValidationMessage('Amortization end must be after the start date.');
                    return false;
                }
                return { start, end };
            }
        });

        if (!result.isConfirmed) return;
        values = result.value;
    }

    row.amortization_start = values.start;
    row.amortization_end = values.end;
    markSourceDirty();
    renderSourceRows(state.sourceRows);
    showToast(`Amortization updated to ${inclusiveMonthCount(values.start, values.end)} months.`, 'success');
}

function sourceModalHtml(defaults) {
    return `
        <div class="source-concept-modal-body">
            <p class="source-modal-helper">
                Add the bill details, GL accounts, and amortization period before generating the schedule.
            </p>

            <div class="source-concept-section source-concept-bill-section">
                <div class="source-concept-section-title">
                    <i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i>
                    Bill information
                </div>
                <div class="source-concept-grid source-concept-grid-main">
                    <label><span>Store</span><input id="manualStore" class="swal2-input" value="${escapeHtml(defaults.store_number)}" placeholder="Store number"></label>
                    <label><span>Concept / Payee</span><input id="manualPayee" class="swal2-input" value="${escapeHtml(defaults.payee)}" placeholder="Example: Personal Property Tax"></label>
                    <label><span>Document</span><input id="manualDoc" class="swal2-input" value="${escapeHtml(defaults.doc_number)}" placeholder="Optional document number"></label>
                    <label><span>Bill date</span><input id="manualDate" class="swal2-input" type="date" value="${escapeHtml(defaults.doc_date)}"></label>
                    <label><span>Tax year</span><input id="manualTaxYear" class="swal2-input" type="number" min="2000" max="2100" value="${escapeHtml(defaults.tax_year)}"></label>
                    <label><span>Amount paid</span><input id="manualAmount" class="swal2-input" type="number" min="0.01" step="0.01" value="${escapeHtml(defaults.amount_paid)}" placeholder="0.00"></label>
                </div>
            </div>

            <div class="source-concept-bottom-grid">
                <div class="source-concept-section">
                    <div class="source-concept-section-title">
                        <i class="fa-solid fa-building-columns" aria-hidden="true"></i>
                        GL accounts
                    </div>
                    <div class="source-concept-grid source-concept-grid-stack">
                        <label><span>Prepaid GL</span><input id="manualPrepaidAccount" class="swal2-input" value="${escapeHtml(defaults.prepaid_account)}" placeholder="Optional"></label>
                        <label><span>Expense GL</span><input id="manualExpenseAccount" class="swal2-input" value="${escapeHtml(defaults.expense_account)}" placeholder="Optional"></label>
                    </div>
                </div>

                <div class="source-concept-section">
                    <div class="source-concept-section-title">
                        <i class="fa-solid fa-calendar-range" aria-hidden="true"></i>
                        Amortization period
                    </div>
                    <div class="source-concept-grid source-concept-grid-stack">
                        <label><span>Start date</span><input id="manualStart" class="swal2-input" type="date" value="${escapeHtml(defaults.amortization_start)}"></label>
                        <label><span>End date</span><input id="manualEnd" class="swal2-input" type="date" value="${escapeHtml(defaults.amortization_end)}"></label>
                    </div>
                </div>

                <div class="source-concept-section source-concept-memo-section">
                    <div class="source-concept-section-title">
                        <i class="fa-solid fa-note-sticky" aria-hidden="true"></i>
                        Memo
                    </div>
                    <label class="source-memo-field">
                        <span>Notes or reason</span>
                        <textarea id="manualMemo" class="swal2-textarea" placeholder="Description or reason for the manual concept">${escapeHtml(defaults.memo_description)}</textarea>
                    </label>
                </div>
            </div>
        </div>
    `;
}

async function addManualSourceRow() {
    if (!state.selectedScheduleId) return;

    const defaults = {
        store_number: '',
        payee: '',
        doc_number: '',
        doc_date: shortDate(state.selectedSchedule?.amortization_start) === '-' ? '' : shortDate(state.selectedSchedule?.amortization_start),
        tax_year: state.selectedSchedule?.tax_year || state.selectedSchedule?.schedule_year || new Date().getFullYear(),
        amount_paid: '',
        prepaid_account: state.selectedSchedule?.prepaid_account || '138500',
        expense_account: state.selectedSchedule?.expense_account || '708500',
        amortization_start: shortDate(state.selectedSchedule?.amortization_start) === '-' ? '' : shortDate(state.selectedSchedule?.amortization_start),
        amortization_end: shortDate(state.selectedSchedule?.amortization_end) === '-' ? '' : shortDate(state.selectedSchedule?.amortization_end),
        memo_description: ''
    };

    let values;
    if (!window.Swal) {
        const store = window.prompt('Store number:', '')?.trim();
        if (!store) return;
        const payee = window.prompt('Concept / Payee:', '')?.trim();
        if (!payee) return;
        const amount = Number(window.prompt('Amount paid:', '0'));
        if (!Number.isFinite(amount) || amount <= 0) return;
        values = { ...defaults, store_number: store, payee, amount_paid: amount };
    } else {
        const result = await window.Swal.fire({
            title: 'Add new concept',
            html: sourceModalHtml(defaults),
            width: 'min(1040px, 96vw)',
            customClass: {
                popup: 'source-concept-swal',
                htmlContainer: 'source-concept-swal-html',
                actions: 'source-concept-swal-actions',
                confirmButton: 'source-concept-confirm-btn',
                cancelButton: 'source-concept-cancel-btn'
            },
            buttonsStyling: false,
            showCancelButton: true,
            confirmButtonText: '<i class="fa-solid fa-plus" aria-hidden="true"></i><span>Add row</span>',
            cancelButtonText: '<i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Cancel</span>',
            focusConfirm: false,
            didOpen: popup => {
                popup.style.setProperty('width', 'min(1040px, calc(100vw - 40px))', 'important');
                popup.style.setProperty('max-width', 'none', 'important');
                popup.style.setProperty('min-width', '0', 'important');
            },
            preConfirm: () => {
                const read = id => document.getElementById(id)?.value?.trim() || '';
                const row = {
                    store_number: read('manualStore'),
                    payee: read('manualPayee'),
                    doc_number: read('manualDoc'),
                    doc_date: read('manualDate'),
                    posted_date: read('manualDate'),
                    tax_year: Number(read('manualTaxYear')),
                    amount_paid: Number(read('manualAmount')),
                    prepaid_account: read('manualPrepaidAccount'),
                    expense_account: read('manualExpenseAccount'),
                    amortization_start: read('manualStart'),
                    amortization_end: read('manualEnd'),
                    memo_description: read('manualMemo')
                };

                if (!row.store_number || !row.payee || !row.doc_date || !row.tax_year || !Number.isFinite(row.amount_paid) || row.amount_paid <= 0) {
                    window.Swal.showValidationMessage('Store, concept, bill date, tax year, and an amount greater than zero are required.');
                    return false;
                }
                if (row.amortization_start && row.amortization_end && row.amortization_start > row.amortization_end) {
                    window.Swal.showValidationMessage('Amortization end must be after its start date.');
                    return false;
                }
                return row;
            }
        });
        if (!result.isConfirmed) return;
        values = result.value;
    }

    state.sourceRows.push({
        ...values,
        source_row_number: state.sourceRows.length + 1,
        is_manual: 1,
        _draft_id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    });
    markSourceDirty();
    renderSourceRows(state.sourceRows);
    activateTab('source');
    showToast('Manual concept added. Generate or regenerate the schedule to apply it.', 'success');
}

function handleSourceRowsClick(event) {
    const editButton = event.target.closest('[data-edit-source-amortization]');
    if (editButton) {
        editSourceAmortization(editButton.dataset.editSourceAmortization).catch(error => showToast(error.message, 'error'));
        return;
    }

    const rowButton = event.target.closest('[data-remove-source-row]');
    if (rowButton) {
        removeSourceRow(rowButton.dataset.removeSourceRow).catch(error => showToast(error.message, 'error'));
        return;
    }

    const storeButton = event.target.closest('[data-remove-source-store]');
    if (storeButton) {
        removeSourceStore(storeButton.dataset.removeSourceStore).catch(error => showToast(error.message, 'error'));
    }
}

function renderBillRows(rows) {
    if (!rows.length) {
        els.scheduleRows.innerHTML = '<tr><td colspan="25" class="empty-cell">No generated amortization yet.</td></tr>';
        els.saveScheduleFooter?.classList.add('hidden');
        if (els.saveScheduleBtn) els.saveScheduleBtn.disabled = true;
        return;
    }

    els.saveScheduleFooter?.classList.remove('hidden');
    if (els.saveScheduleBtn) els.saveScheduleBtn.disabled = !state.selectedScheduleId;

    const scheduleYear = Number(state.selectedSchedule?.schedule_year || new Date().getFullYear());
    const monthsByBill = new Map();
    state.months.forEach(month => {
        const billId = Number(month.bill_id);
        if (!monthsByBill.has(billId)) monthsByBill.set(billId, []);
        monthsByBill.get(billId).push(month);
    });

    const storeTotals = new Map();
    rows.forEach(row => {
        const billMonths = monthsByBill.get(Number(row.id)) || [];
        const yearAmortization = billMonths
            .filter(month => Number(month.period_year) === scheduleYear)
            .reduce((total, month) => total + Number(month.expected_amount || 0), 0);
        const endingBalance = Number(row.amount_paid || 0) - yearAmortization;
        storeTotals.set(String(row.store_number || ''), (storeTotals.get(String(row.store_number || '')) || 0) + endingBalance);
    });

    let previousEntity = null;
    const html = [];

    rows.forEach(row => {
        const entity = String(state.selectedSchedule?.metadata_json?.entity || state.selectedSchedule?.brand || 'QCJ');
        if (entity !== previousEntity) {
            html.push(`<tr class="schedule-entity-row"><td colspan="25">Entity: ${escapeHtml(entity)}</td></tr>`);
            previousEntity = entity;
        }

        const billMonths = monthsByBill.get(Number(row.id)) || [];
        const monthValues = Array.from({ length: 12 }, (_, index) => {
            const match = billMonths.find(month => Number(month.period_year) === scheduleYear && Number(month.period_month) === index + 1);
            return match ? Number(match.expected_amount || 0) : 0;
        });
        const ytd = monthValues.reduce((sum, value) => sum + value, 0);
        const amountPaid = Number(row.amount_paid || 0);
        const priorBalance = billMonths
            .filter(month => Number(month.period_year) < scheduleYear)
            .reduce((sum, month) => sum - Number(month.expected_amount || 0), amountPaid);
        const endingBalance = amountPaid - billMonths
            .filter(month => Number(month.period_year) <= scheduleYear)
            .reduce((sum, month) => sum + Number(month.expected_amount || 0), 0);
        const storeEnding = storeTotals.get(String(row.store_number || '')) || 0;

        html.push(`
            <tr>
                <td>${escapeHtml(row.payee || '')}</td>
                <td class="number strong">${escapeHtml(row.store_number || '')}</td>
                <td class="entity-cell">${escapeHtml(entity)}</td>
                <td>${escapeHtml(row.prepaid_account || '')}</td>
                <td>${escapeHtml(row.expense_account || '')}</td>
                <td>${escapeHtml(shortDate(row.bill_date))}</td>
                <td>${escapeHtml(shortDate(row.amortization_start))} - ${escapeHtml(shortDate(row.amortization_end))}</td>
                <td class="number amount-paid">${money(amountPaid)}</td>
                <td class="number prior-balance">${money(Math.max(priorBalance, 0))}</td>
                <td class="number monthly-amount">${money(row.monthly_amount)}</td>
                ${monthValues.map(value => `<td class="number month-amount">${value ? `(${money(value).replace('$', '')})` : '-'}</td>`).join('')}
                <td class="number ytd-amount">${ytd ? `(${money(ytd).replace('$', '')})` : '-'}</td>
                <td class="number ending-balance">${money(Math.max(endingBalance, 0))}</td>
                <td class="number store-balance">${money(Math.max(storeEnding, 0))}</td>
            </tr>
        `);
    });

    const totals = rows.reduce((acc, row) => {
        const billMonths = monthsByBill.get(Number(row.id)) || [];
        acc.amountPaid += Number(row.amount_paid || 0);
        acc.prior += billMonths.filter(month => Number(month.period_year) < scheduleYear)
            .reduce((sum, month) => sum - Number(month.expected_amount || 0), Number(row.amount_paid || 0));
        acc.monthly += Number(row.monthly_amount || 0);
        for (let index = 0; index < 12; index += 1) {
            const month = billMonths.find(item => Number(item.period_year) === scheduleYear && Number(item.period_month) === index + 1);
            acc.months[index] += Number(month?.expected_amount || 0);
        }
        return acc;
    }, { amountPaid: 0, prior: 0, monthly: 0, months: Array(12).fill(0) });
    const totalYtd = totals.months.reduce((sum, value) => sum + value, 0);
    const totalEnding = Math.max(totals.amountPaid - totalYtd - Math.max(totals.amountPaid - totals.prior, 0), 0);

    html.push(`
        <tr class="schedule-total-row">
            <td colspan="7">Total</td>
            <td class="number">${money(totals.amountPaid)}</td>
            <td class="number">${money(Math.max(totals.prior, 0))}</td>
            <td class="number">${money(totals.monthly)}</td>
            ${totals.months.map(value => `<td class="number">${value ? `(${money(value).replace('$', '')})` : '-'}</td>`).join('')}
            <td class="number">${totalYtd ? `(${money(totalYtd).replace('$', '')})` : '-'}</td>
            <td class="number">${money(totalEnding)}</td>
            <td class="number">${money(totalEnding)}</td>
        </tr>
    `);

    els.scheduleRows.innerHTML = html.join('');
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
    const data = await apiFetch('/prepaids/schedules');
    state.schedules = data.schedules || [];
    renderScheduleList();

}

async function loadScheduleDetail(scheduleId) {
    const detail = await apiFetch(`/prepaids/${scheduleId}`);
    state.selectedScheduleId = Number(scheduleId);
    state.selectedSchedule = detail.schedule;
    state.sourceRows = normalizeSourceRows(detail.source_rows || []);
    state.importedSourceRowCount = Number(detail.schedule?.source_row_count || state.sourceRows.filter(row => Number(row.is_manual || 0) !== 1).length || 0);
    state.sourceDirty = false;
    state.removedStoreNumbers.clear();
    state.bills = detail.bills || detail.rows || [];
    state.months = detail.months || detail.comparison_rows || [];
    state.summary = detail.summary || {};

    els.selectedScheduleTitle.textContent = detail.schedule?.title || 'Schedule Detail';
    els.selectedScheduleSubtitle.textContent = `${detail.schedule?.brand || ''} - PTAX ${detail.schedule?.tax_year || ''} - ${shortDate(detail.schedule?.amortization_start)} to ${shortDate(detail.schedule?.amortization_end)} - ${detail.schedule?.status || ''}`;
    els.exportScheduleBtn.disabled = !state.bills.length;
    if (els.glScheduleSelect) els.glScheduleSelect.value = String(scheduleId);

    renderKpis(detail.summary || {});
    renderSourceRows(state.sourceRows);
    renderBillRows(state.bills);
    renderMonthRows(state.months);
    renderScheduleList();
    updateSourceEditorState();
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
        showToast(`Imported ${data.extracted_rows} PTAX bills. Review the rows before generating.`, 'success');
        await loadScheduleDetail(data.schedule_id);
        state.importedSourceRowCount = Number(data.extracted_rows || state.sourceRows.length);
        await loadSchedules();
        activateTab('source');
        updateSourceEditorState();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        isUploadingBillSource = false;
    }
}

async function generateSchedule() {
    if (!state.selectedScheduleId) return;

    if (!state.sourceRows.length) {
        showToast('At least one source row is required to generate the schedule.', 'error');
        return;
    }

    const confirmed = await confirmAction(
        state.bills.length ? 'Regenerate amortization schedule?' : 'Generate amortization schedule?',
        `The schedule will be built from the ${state.sourceRows.length} rows currently shown in Source Rows.`
    );
    if (!confirmed) return;

    const originalHtml = els.generateScheduleBtn?.innerHTML;
    if (els.generateScheduleBtn) {
        els.generateScheduleBtn.disabled = true;
        els.generateScheduleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Saving rows';
    }

    try {
        await persistSourceRows();
        if (els.generateScheduleBtn) {
            els.generateScheduleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Generating';
        }
        const data = await apiFetch(`/prepaids/${state.selectedScheduleId}/generate`, {
            method: 'POST',
            headers: authHeaders(true)
        });
        showToast(`Generated ${data.inserted_bills} bills and ${data.inserted_months} monthly rows.`, 'success');
        await loadScheduleDetail(state.selectedScheduleId);
        await loadSchedules();
        activateTab('schedule');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        if (els.generateScheduleBtn) {
            els.generateScheduleBtn.innerHTML = originalHtml || '<i class="fa-solid fa-calculator" aria-hidden="true"></i> Generate Schedule';
            updateSourceEditorState();
        }
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
    const removeButton = drop?.querySelector('[data-remove-file]');
    const hasFile = Boolean(input.files?.length);
    if (name) name.textContent = hasFile ? input.files[0].name : 'No file selected';
    if (removeButton) removeButton.disabled = !hasFile;
}

function resetBillSourceView() {
    state.selectedScheduleId = null;
    state.selectedSchedule = null;
    state.sourceRows = [];
    state.importedSourceRowCount = 0;
    state.sourceDirty = false;
    state.removedStoreNumbers.clear();
    state.bills = [];
    state.months = [];
    state.summary = {};

    if (els.selectedScheduleTitle) els.selectedScheduleTitle.textContent = 'Schedule Detail';
    if (els.selectedScheduleSubtitle) els.selectedScheduleSubtitle.textContent = 'Upload a paid bill source to generate the schedule.';
    if (els.exportScheduleBtn) els.exportScheduleBtn.disabled = true;
    if (els.generateScheduleBtn) {
        els.generateScheduleBtn.disabled = true;
        els.generateScheduleBtn.classList.add('hidden');
    }
    if (els.addSourceRowBtn) {
        els.addSourceRowBtn.disabled = true;
        els.addSourceRowBtn.classList.add('hidden');
    }
    if (els.saveScheduleBtn) els.saveScheduleBtn.disabled = true;
    els.saveScheduleFooter?.classList.add('hidden');
    if (els.glScheduleSelect) els.glScheduleSelect.value = '';

    renderSourceRows([]);
    renderBillRows([]);
    renderMonthRows([]);
    renderKpis({ expected_total: 0, difference_total: 0 });
    activateTab('source');
    updateSourceEditorState();
}

function resetGlView() {
    state.months = [];
    renderMonthRows([]);
    if (els.kpiDifference) els.kpiDifference.textContent = money(0);
}

function clearSelectedFile(input, onClear) {
    if (!input) return;
    input.value = '';
    updateDropName(input);
    if (typeof onClear === 'function') onClear();
}

function bindAutoDrop(form, handler, onClear) {
    const input = form?.querySelector('input[type="file"]');
    const drop = form?.querySelector('[data-file-drop]');
    const removeButton = form?.querySelector('[data-remove-file]');
    if (!input || !drop) return;

    updateDropName(input);

    input.addEventListener('change', () => {
        updateDropName(input);
        if (input.files?.length) handler();
    });

    removeButton?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        clearSelectedFile(input, onClear);
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

function activateTab(active) {
    document.querySelectorAll('.tab-button').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === active);
    });

    document.getElementById('sourceTab')?.classList.toggle('hidden', active !== 'source');
    document.getElementById('scheduleTab')?.classList.toggle('hidden', active !== 'schedule');
    document.getElementById('comparisonTab')?.classList.toggle('hidden', active !== 'comparison');
    document.getElementById('differencesTab')?.classList.toggle('hidden', active !== 'differences');
}

function handleTabs(event) {
    const button = event.target.closest('.tab-button');
    if (!button) return;
    activateTab(button.dataset.tab);
}

async function saveCurrentSchedule() {
    if (!state.selectedScheduleId || !state.bills.length || els.saveScheduleBtn?.disabled) return;

    const originalHtml = els.saveScheduleBtn.innerHTML;
    els.saveScheduleBtn.disabled = true;
    els.saveScheduleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Saving';

    try {
        const data = await apiFetch(`/prepaids/${state.selectedScheduleId}/save`, {
            method: 'POST',
            headers: authHeaders(true)
        });
        showToast(data.message || 'Schedule saved on the server.', 'success');
        await loadSchedules();
        await loadScheduleDetail(state.selectedScheduleId);
    } catch (error) {
        showToast(error.message || 'The schedule could not be saved.', 'error');
    } finally {
        els.saveScheduleBtn.disabled = !state.selectedScheduleId || !state.bills.length;
        els.saveScheduleBtn.innerHTML = originalHtml;
    }
}

async function exportCurrentSchedule() {
    if (!state.selectedScheduleId || els.exportScheduleBtn?.disabled) return;

    const originalHtml = els.exportScheduleBtn?.innerHTML;
    if (els.exportScheduleBtn) {
        els.exportScheduleBtn.disabled = true;
        els.exportScheduleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Preparing Excel';
    }

    try {
        const response = await apiFetch(`/prepaids/${state.selectedScheduleId}/export`, {
            method: 'GET',
            headers: authHeaders(false)
        });
        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition') || '';
        const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        const quotedName = disposition.match(/filename="([^"]+)"/i)?.[1];
        const plainName = disposition.match(/filename=([^;]+)/i)?.[1]?.trim();
        const filename = encodedName
            ? decodeURIComponent(encodedName)
            : (quotedName || plainName || 'prepaid-schedule.xlsx');

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast('Schedule downloaded successfully.', 'success');
    } catch (error) {
        showToast(error.message || 'The schedule could not be downloaded.', 'error');
    } finally {
        if (els.exportScheduleBtn) {
            els.exportScheduleBtn.disabled = !state.selectedScheduleId;
            els.exportScheduleBtn.innerHTML = originalHtml;
        }
    }
}

function init() {
    els.billSourceUploadForm?.addEventListener('submit', handleBillSourceUpload);
    els.glUploadForm?.addEventListener('submit', handleGlUpload);
    els.scheduleList?.addEventListener('click', handleScheduleClick);
    els.sourceRows?.addEventListener('click', handleSourceRowsClick);
    els.addSourceRowBtn?.addEventListener('click', addManualSourceRow);
    els.generateScheduleBtn?.addEventListener('click', generateSchedule);
    els.saveScheduleBtn?.addEventListener('click', saveCurrentSchedule);
    els.refreshSchedulesBtn?.addEventListener('click', () => loadSchedules().catch(error => showToast(error.message, 'error')));
    els.exportScheduleBtn?.addEventListener('click', exportCurrentSchedule);
    document.querySelector('.prepaid-tabs')?.addEventListener('click', handleTabs);
    bindAutoDrop(els.billSourceUploadForm, handleBillSourceUpload, resetBillSourceView);
    bindAutoDrop(els.glUploadForm, handleGlUpload, resetGlView);
    loadSchedules().catch(error => showToast(error.message, 'error'));
}

init();
