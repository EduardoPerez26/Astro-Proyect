(function () {
    'use strict';

    const PM_API = '/property-management';
    const PREPAID_API = '/prepaids';
    const ITEMS_PER_PAGE = 10;
    const MONTH_NAMES = [
        '',
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December'
    ];

    const TABLE_TITLES = {
        '': 'All department documents',
        schedule: 'Editable schedules',
        prepaidSchedule: 'Prepaid schedules',
        source: 'Source files'
    };

    let schedules = [];
    let prepaidSchedules = [];
    let documents = [];
    let currentPage = 1;
    let searchText = '';
    let currentKind = '';
    let fileType = '';
    let dateFrom = '';
    let dateTo = '';

    document.addEventListener('DOMContentLoaded', function () {
        bindControls();
        loadServerDocuments();
    });

    function bindControls() {
        document
            .getElementById('pmDocsRefreshBtn')
            ?.addEventListener('click', loadServerDocuments);

        document
            .getElementById('pmTableRefreshBtn')
            ?.addEventListener('click', loadServerDocuments);

        document
            .getElementById('pmDocumentSearchInput')
            ?.addEventListener('input', function (event) {
                searchText = normalize(event.target.value);
                currentPage = 1;
                renderDocuments();
            });

        document
            .getElementById('pmDocumentKindFilter')
            ?.addEventListener('change', function (event) {
                setKindFilter(event.target.value || '');
            });

        document
            .getElementById('pmFileTypeFilter')
            ?.addEventListener('change', function (event) {
                fileType = event.target.value || '';
                currentPage = 1;
                renderDocuments();
            });

        document
            .getElementById('pmDateFromFilter')
            ?.addEventListener('change', function (event) {
                dateFrom = event.target.value || '';
                currentPage = 1;
                renderDocuments();
            });

        document
            .getElementById('pmDateToFilter')
            ?.addEventListener('change', function (event) {
                dateTo = event.target.value || '';
                currentPage = 1;
                renderDocuments();
            });

        document
            .getElementById('pmClearFiltersBtn')
            ?.addEventListener('click', clearFilters);

        document.querySelectorAll('[data-pm-document-tab]').forEach(tab => {
            tab.addEventListener('click', function () {
                setKindFilter(tab.dataset.pmDocumentTab || '');
            });
        });

        document
            .getElementById('pmDocsPrevBtn')
            ?.addEventListener('click', function () {
                if (currentPage <= 1) return;
                currentPage -= 1;
                renderDocuments();
            });

        document
            .getElementById('pmDocsNextBtn')
            ?.addEventListener('click', function () {
                const totalPages = Math.ceil(getFilteredItems().length / ITEMS_PER_PAGE);
                if (currentPage >= totalPages) return;
                currentPage += 1;
                renderDocuments();
            });

        document
            .getElementById('pmUnifiedDocumentsBody')
            ?.addEventListener('click', handleTableAction);
    }

    async function loadServerDocuments() {
        setLoading(true);
        setStatus('Loading server documents...', 'info');

        try {
            const [schedulePayload, prepaidPayload, documentPayload] = await Promise.all([
                apiJson('/schedules'),
                prepaidApiJson('/schedules?saved=1'),
                apiJson('/documents')
            ]);

            schedules = Array.isArray(schedulePayload.schedules) ? schedulePayload.schedules : [];
            prepaidSchedules = Array.isArray(prepaidPayload.schedules) ? prepaidPayload.schedules : [];
            documents = Array.isArray(documentPayload.documents) ? documentPayload.documents : [];
            currentPage = 1;
            populateFileTypes();
            renderDocuments();
            setStatus(`Loaded ${schedules.length} schedules, ${prepaidSchedules.length} saved prepaid schedules, and ${documents.length} source files.`, 'success');
        } catch (error) {
            schedules = [];
            prepaidSchedules = [];
            documents = [];
            renderDocuments();
            setStatus(error.message || 'Server documents could not be loaded.', 'error');
            showSwal('error', 'Could not load documents', error.message || 'Server documents could not be loaded.');
        } finally {
            setLoading(false);
        }
    }

    function renderDocuments() {
        const tbody = document.getElementById('pmUnifiedDocumentsBody');
        const table = document.getElementById('pmDocumentsTable');
        const emptyState = document.getElementById('pmDocsEmptyState');
        const title = document.getElementById('pmDocumentsTableTitle');
        const filtered = getFilteredItems();
        const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));

        updateCounts();
        updateTabs();
        if (title) title.textContent = TABLE_TITLES[currentKind] || TABLE_TITLES[''];

        if (currentPage > totalPages) currentPage = totalPages;

        if (!tbody || !table || !emptyState) return;

        if (!filtered.length) {
            table.hidden = true;
            table.style.setProperty('display', 'none', 'important');
            emptyState.hidden = false;
            emptyState.style.setProperty('display', 'block', 'important');
            tbody.innerHTML = '';
            updatePagination(0);
            return;
        }

        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);

        table.hidden = false;
        table.style.setProperty('display', 'table', 'important');
        emptyState.hidden = true;
        emptyState.style.setProperty('display', 'none', 'important');
        tbody.innerHTML = pageItems.map(renderDocumentRow).join('');
        updatePagination(filtered.length);
    }

    function renderDocumentRow(item) {
        const isSchedule = ['schedule', 'prepaidSchedule'].includes(item.kind);
        const iconClass = isSchedule
            ? 'property-docs-schedule-icon'
            : 'property-docs-file-icon';
        const icon = isSchedule ? 'fa-file-pen' : 'fa-file-excel';
        const actions = item.kind === 'schedule'
            ? `
            <button class="action-btn edit" type="button" data-schedule-edit="${escapeHtml(item.rawId)}" title="Edit schedule">
                <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
            </button>
            <button class="action-btn download" type="button" data-schedule-download="${escapeHtml(item.rawId)}" title="Download schedule">
                <i class="fa-solid fa-download" aria-hidden="true"></i>
            </button>
            <button class="action-btn delete" type="button" data-schedule-delete="${escapeHtml(item.rawId)}" title="Delete schedule">
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
            </button>
        `
            : item.kind === 'prepaidSchedule'
                ? `
            <button class="action-btn edit" type="button" data-prepaid-open="${escapeHtml(item.rawId)}" title="Open prepaid schedule">
                <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
            </button>
            <button class="action-btn download" type="button" data-prepaid-download="${escapeHtml(item.rawId)}" title="Download prepaid schedule">
                <i class="fa-solid fa-download" aria-hidden="true"></i>
            </button>
            <button class="action-btn delete" type="button" data-prepaid-delete="${escapeHtml(item.rawId)}" title="Delete prepaid schedule">
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
            </button>
        `
            : `
            <button class="action-btn view" type="button" data-document-view="${escapeHtml(item.rawId)}" title="Preview file">
                <i class="fa-solid fa-eye" aria-hidden="true"></i>
            </button>
            <button class="action-btn download" type="button" data-document-download="${escapeHtml(item.rawId)}" title="Download">
                <i class="fa-solid fa-download" aria-hidden="true"></i>
            </button>
            <button class="action-btn delete" type="button" data-document-delete="${escapeHtml(item.rawId)}" title="Delete file">
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
            </button>
        `;

        return `
        <tr>
            <td>${escapeHtml(item.displayId)}</td>
            <td>
                <div class="file-cell">
                    <div class="file-icon ${iconClass}">
                        <i class="fa-solid ${icon}" aria-hidden="true"></i>
                    </div>
                    <div class="file-info">
                        <span class="file-name">${escapeHtml(item.name)}</span>
                        <span class="file-meta">${escapeHtml(item.meta)}</span>
                    </div>
                </div>
            </td>
            <td>${escapeHtml(item.category)}</td>
            <td>${escapeHtml(item.period)}</td>
            <td>
                <div class="property-docs-detail">
                    <strong>${escapeHtml(item.detailsPrimary)}</strong>
                    <span>${escapeHtml(item.detailsSecondary)}</span>
                </div>
            </td>
            <td><span class="status-badge ${escapeHtml(item.statusClass)}">${escapeHtml(item.statusLabel)}</span></td>
            <td>${escapeHtml(formatDateTime(item.date))}</td>
            <td>
                <div class="action-buttons">${actions}</div>
            </td>
        </tr>
    `;
    }

    function getFilteredItems() {
        const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
        const toDate = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;

        return getAllItems().filter(item => {
            if (currentKind && item.kind !== currentKind) return false;
            if (fileType && currentKind !== 'source' && item.kind !== 'source') return false;
            if (fileType && item.kind === 'source' && item.fileType !== fileType) return false;
            if (searchText && !item.searchText.includes(searchText)) return false;

            const itemDate = parseDateValue(item.date);
            if (fromDate && itemDate && itemDate < fromDate) return false;
            if (toDate && itemDate && itemDate > toDate) return false;

            return true;
        });
    }

    function getAllItems() {
        const scheduleItems = schedules.map(schedule => {
            const period = formatPeriod(schedule.periodo_mes, schedule.periodo_anio);
            const updated = schedule.fecha_actualizacion || schedule.fecha_creacion;
            const status = String(schedule.estado || 'draft').toLowerCase();
            const name = schedule.nombre || 'Schedule 2026';
            const user = schedule.usuario_nombre || 'Property Management';
            const stores = Number(schedule.total_tiendas || 0);
            const rows = Number(schedule.total_filas || 0);
            const balance = formatCurrency(schedule.balance_total || 0);

            return {
                kind: 'schedule',
                rawId: schedule.id,
                displayId: `S-${schedule.id}`,
                name,
                meta: `${user} saved schedule`,
                category: 'Schedule',
                period,
                detailsPrimary: `${stores} stores`,
                detailsSecondary: `${rows} rows / ${balance}`,
                statusClass: status === 'draft' ? 'draft' : 'saved',
                statusLabel: status === 'draft' ? 'Draft' : toTitleCase(status),
                date: updated,
                searchText: normalize([
                    name,
                    user,
                    'schedule',
                    period,
                    stores,
                    rows,
                    balance,
                    status
                ].join(' '))
            };
        });

        const prepaidItems = prepaidSchedules.map(schedule => {
            const period = formatPeriod(null, schedule.schedule_year || schedule.tax_year);
            const updated = schedule.updated_at || schedule.generated_at || schedule.created_at;
            const status = String(schedule.status || 'SOURCE_LOADED').toLowerCase();
            const name = schedule.title || 'Prepaid amortization schedule';
            const brand = schedule.brand || 'Property Management';
            const expected = formatCurrency(schedule.expected_total || 0);
            const difference = formatCurrency(schedule.difference_total || 0);

            return {
                kind: 'prepaidSchedule',
                rawId: schedule.id,
                displayId: `P-${schedule.id}`,
                name,
                meta: `${brand} saved prepaid schedule`,
                category: 'Prepaid schedule',
                period,
                detailsPrimary: expected,
                detailsSecondary: `Difference ${difference}`,
                statusClass: status === 'validated' ? 'saved' : status === 'difference' ? 'warning' : 'loaded',
                statusLabel: toTitleCase(status.replace(/_/g, ' ')),
                date: updated,
                searchText: normalize([
                    name,
                    brand,
                    'prepaid schedule',
                    period,
                    expected,
                    difference,
                    status
                ].join(' '))
            };
        });

        const sourceItems = documents.map(document => {
            const period = formatPeriod(document.periodo_mes, document.periodo_anio);
            const label = document.tipo_label || document.tipo_documento || 'Source file';
            const name = document.nombre_original || 'Property Management document';
            const size = formatFileSize(document.tamano_bytes);
            const state = document.tiene_archivo ? 'Server file' : 'Metadata only';

            return {
                kind: 'source',
                rawId: document.id,
                displayId: `D-${document.id}`,
                fileType: String(document.tipo_documento || ''),
                name,
                meta: `${label} / ${period}`,
                category: label,
                period,
                detailsPrimary: size,
                detailsSecondary: state,
                statusClass: 'loaded',
                statusLabel: 'Loaded',
                date: document.fecha_carga || document.fecha_actualizacion,
                searchText: normalize([
                    name,
                    label,
                    document.tipo_documento,
                    period,
                    size,
                    state
                ].join(' '))
            };
        });

        return [...scheduleItems, ...prepaidItems, ...sourceItems].sort((a, b) => {
            const dateA = parseDateValue(a.date)?.getTime() || 0;
            const dateB = parseDateValue(b.date)?.getTime() || 0;
            if (dateA !== dateB) return dateB - dateA;
            return String(b.displayId).localeCompare(String(a.displayId));
        });
    }

    function updateCounts() {
        const allItems = getAllItems();
        const allCount = document.getElementById('pmAllDocumentsCount');
        const scheduleCount = document.getElementById('pmSchedulesCount');
        const prepaidCount = document.getElementById('pmPrepaidSchedulesCount');
        const sourceCount = document.getElementById('pmSourceFilesCount');

        if (allCount) allCount.textContent = allItems.length;
        if (scheduleCount) scheduleCount.textContent = allItems.filter(item => item.kind === 'schedule').length;
        if (prepaidCount) prepaidCount.textContent = allItems.filter(item => item.kind === 'prepaidSchedule').length;
        if (sourceCount) sourceCount.textContent = allItems.filter(item => item.kind === 'source').length;
    }

    function updateTabs() {
        document.querySelectorAll('[data-pm-document-tab]').forEach(tab => {
            const active = (tab.dataset.pmDocumentTab || '') === currentKind;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        const kindSelect = document.getElementById('pmDocumentKindFilter');
        const typeSelect = document.getElementById('pmFileTypeFilter');
        if (kindSelect && kindSelect.value !== currentKind) {
            kindSelect.value = currentKind;
        }
        if (typeSelect) {
            typeSelect.disabled = currentKind && currentKind !== 'source';
        }
    }

    function updatePagination(total) {
        const pagination = document.getElementById('pmDocsPagination');
        const showingFrom = document.getElementById('pmShowingFrom');
        const showingTo = document.getElementById('pmShowingTo');
        const totalItems = document.getElementById('pmTotalItems');
        const currentPageEl = document.getElementById('pmDocsCurrentPage');
        const prev = document.getElementById('pmDocsPrevBtn');
        const next = document.getElementById('pmDocsNextBtn');
        const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
        const from = total ? ((currentPage - 1) * ITEMS_PER_PAGE) + 1 : 0;
        const to = Math.min(currentPage * ITEMS_PER_PAGE, total);

        if (!pagination) return;

        pagination.style.display = total ? 'flex' : 'none';
        if (showingFrom) showingFrom.textContent = from;
        if (showingTo) showingTo.textContent = to;
        if (totalItems) totalItems.textContent = total;
        if (currentPageEl) currentPageEl.textContent = currentPage;
        if (prev) prev.disabled = currentPage <= 1;
        if (next) next.disabled = currentPage >= totalPages;
    }

    function setKindFilter(kind) {
        currentKind = kind;
        currentPage = 1;
        renderDocuments();
    }

    function clearFilters() {
        const search = document.getElementById('pmDocumentSearchInput');
        const kind = document.getElementById('pmDocumentKindFilter');
        const type = document.getElementById('pmFileTypeFilter');
        const from = document.getElementById('pmDateFromFilter');
        const to = document.getElementById('pmDateToFilter');

        if (search) search.value = '';
        if (kind) kind.value = '';
        if (type) type.value = '';
        if (from) from.value = '';
        if (to) to.value = '';

        searchText = '';
        currentKind = '';
        fileType = '';
        dateFrom = '';
        dateTo = '';
        currentPage = 1;
        renderDocuments();
    }

    function populateFileTypes() {
        const select = document.getElementById('pmFileTypeFilter');
        if (!select) return;

        const selected = fileType;
        const types = Array.from(
            new Map(documents.map(document => [
                document.tipo_documento,
                document.tipo_label || document.tipo_documento
            ]).filter(([value]) => value)).entries()
        ).sort((a, b) => String(a[1]).localeCompare(String(b[1])));

        select.innerHTML = [
            '<option value="">All types</option>',
            ...types.map(([value, label]) =>
                `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
            )
        ].join('');
        select.value = types.some(([value]) => value === selected) ? selected : '';
        fileType = select.value;
    }

    async function handleTableAction(event) {
        const scheduleButton = event.target.closest('[data-schedule-edit]');
        const scheduleDownloadButton = event.target.closest('[data-schedule-download]');
        const scheduleDeleteButton = event.target.closest('[data-schedule-delete]');
        const prepaidOpenButton = event.target.closest('[data-prepaid-open]');
        const prepaidDownloadButton = event.target.closest('[data-prepaid-download]');
        const prepaidDeleteButton = event.target.closest('[data-prepaid-delete]');
        const viewButton = event.target.closest('[data-document-view]');
        const downloadButton = event.target.closest('[data-document-download]');
        const documentDeleteButton = event.target.closest('[data-document-delete]');

        if (scheduleButton) {
            const id = scheduleButton.dataset.scheduleEdit;
            if (id) {
                window.location.href = `/views/departments/property-management?schedule=${encodeURIComponent(id)}`;
            }
            return;
        }

        if (scheduleDownloadButton) {
            await downloadSchedule(scheduleDownloadButton.dataset.scheduleDownload, scheduleDownloadButton);
            return;
        }

        if (scheduleDeleteButton) {
            await deleteSchedule(scheduleDeleteButton.dataset.scheduleDelete, scheduleDeleteButton);
            return;
        }

        if (prepaidOpenButton) {
            const id = prepaidOpenButton.dataset.prepaidOpen;
            window.location.href = id
                ? `/views/departments/prepaid-amortization?schedule=${encodeURIComponent(id)}`
                : '/views/departments/prepaid-amortization';
            return;
        }

        if (prepaidDownloadButton) {
            await downloadPrepaidSchedule(prepaidDownloadButton.dataset.prepaidDownload, prepaidDownloadButton);
            return;
        }

        if (prepaidDeleteButton) {
            await deletePrepaidSchedule(prepaidDeleteButton.dataset.prepaidDelete, prepaidDeleteButton);
            return;
        }

        if (viewButton) {
            await viewDocument(viewButton.dataset.documentView, viewButton);
            return;
        }

        if (downloadButton) {
            await downloadDocument(downloadButton.dataset.documentDownload, downloadButton);
            return;
        }

        if (documentDeleteButton) {
            await deleteDocument(documentDeleteButton.dataset.documentDelete, documentDeleteButton);
        }
    }

    async function downloadSchedule(id, button = null) {
        if (button) button.disabled = true;

        try {
            const apiBase = String(window.API_URL || '').replace(/\/$/, '');
            const token = localStorage.getItem('token');

            if (!apiBase) throw new Error('API_URL is not configured.');
            if (!token) throw new Error('Your session expired. Sign in again.');

            const response = await fetch(
                `${apiBase}${PM_API}/schedules/${encodeURIComponent(id)}/export`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!response.ok) {
                const contentType = response.headers.get('content-type') || '';
                const data = contentType.includes('application/json')
                    ? await response.json()
                    : null;
                throw new Error(data?.message || 'Schedule could not be downloaded.');
            }

            const disposition = response.headers.get('content-disposition') || '';
            const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
            const simpleName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
            const filename = encodedName
                ? decodeURIComponent(encodedName)
                : (simpleName || 'Property-Management-Schedule.xlsx');

            const blob = await response.blob();
            downloadBlob(blob, filename);
        } catch (error) {
            showSwal('error', 'Download failed', error.message || 'Schedule could not be downloaded.');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function downloadPrepaidSchedule(id, button = null) {
        if (button) button.disabled = true;

        try {
            const response = await prepaidApiFetch(`/${encodeURIComponent(id)}/export`);

            if (!response.ok) {
                const contentType = response.headers.get('content-type') || '';
                const data = contentType.includes('application/json')
                    ? await response.json()
                    : null;
                throw new Error(data?.message || 'Prepaid schedule could not be downloaded.');
            }

            const disposition = response.headers.get('content-disposition') || '';
            const filename = decodeDispositionFilename(disposition) || `prepaid-schedule-${id}.xlsx`;
            const blob = await response.blob();
            downloadBlob(blob, filename);
        } catch (error) {
            showSwal('error', 'Download failed', error.message || 'Prepaid schedule could not be downloaded.');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function deletePrepaidSchedule(id, button = null) {
        const confirmed = await confirmDelete(
            'Delete prepaid schedule?',
            'This saved prepaid schedule and its workbook will be permanently removed.'
        );

        if (!confirmed) return;
        if (button) button.disabled = true;

        try {
            await prepaidApiJson(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
            prepaidSchedules = prepaidSchedules.filter(schedule => String(schedule.id) !== String(id));
            renderDocuments();
            showSwal('success', 'Deleted', 'Prepaid schedule deleted successfully.');
        } catch (error) {
            showSwal('error', 'Delete failed', error.message || 'Prepaid schedule could not be deleted.');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function deleteSchedule(id, button = null) {
        const confirmed = await confirmDelete(
            'Delete schedule?',
            'This saved schedule will be permanently removed from the server.'
        );

        if (!confirmed) return;
        if (button) button.disabled = true;

        try {
            await apiJson(`/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
            schedules = schedules.filter(schedule => String(schedule.id) !== String(id));
            renderDocuments();
            showSwal('success', 'Deleted', 'Schedule deleted successfully.');
        } catch (error) {
            showSwal('error', 'Delete failed', error.message || 'Schedule could not be deleted.');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function deleteDocument(id, button = null) {
        const confirmed = await confirmDelete(
            'Delete source file?',
            'This uploaded file will be permanently removed from the server.'
        );

        if (!confirmed) return;
        if (button) button.disabled = true;

        try {
            await apiJson(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
            documents = documents.filter(document => String(document.id) !== String(id));
            populateFileTypes();
            renderDocuments();
            showSwal('success', 'Deleted', 'Source file deleted successfully.');
        } catch (error) {
            showSwal('error', 'Delete failed', error.message || 'Source file could not be deleted.');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function confirmDelete(title, text) {
        if (!window.Swal) {
            showSwal('warning', title, text);
            return false;
        }

        const result = await window.Swal.fire({
            icon: 'warning',
            title,
            text,
            showCancelButton: true,
            confirmButtonText: 'Delete',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#c81e1e',
            cancelButtonColor: '#102a43'
        });

        return result.isConfirmed;
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function safeFilename(value) {
        return String(value || 'download')
            .trim()
            .replace(/[\\/:*?"<>|]+/g, '-')
            .replace(/\s+/g, ' ')
            .slice(0, 120);
    }

    async function downloadDocument(id, button = null) {
        if (button) button.disabled = true;

        try {
            const { blob, filename } = await fetchDocumentBlob(id);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            link.href = url;
            link.download = filename || `property-management-document-${id}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            showSwal('error', 'Download failed', error.message || 'Document could not be downloaded.');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function viewDocument(id, button = null) {
        const viewer = window.open('', '_blank');

        if (!viewer) {
            showSwal('warning', 'Popup blocked', 'Allow popups to view the document in a new window.');
            return;
        }

        if (button) button.disabled = true;
        writeViewerLoading(viewer);

        try {
            const file = await fetchDocumentBlob(id);
            await renderDocument(viewer, file);
        } catch (error) {
            writeViewerError(viewer, error.message || 'Document could not be opened.');
            showSwal('error', 'Preview failed', error.message || 'Document could not be opened.');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function fetchDocumentBlob(id) {
        const response = await apiFetch(`/documents/${encodeURIComponent(id)}/download`);

        if (!response.ok) {
            const payload = await readJsonResponse(response);
            throw new Error(payload.message || 'Document could not be loaded');
        }

        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition') || '';

        return {
            blob,
            filename: decodeDispositionFilename(disposition) || `property-management-document-${id}`,
            mimeType: blob.type || response.headers.get('Content-Type') || ''
        };
    }

    async function renderDocument(viewer, file) {
        const filename = file.filename || 'Property Management document';
        const lowerName = filename.toLowerCase();
        const isSpreadsheet = /\.(xlsx|xls|csv)$/i.test(lowerName) ||
            /spreadsheet|excel|csv/i.test(file.mimeType || '');

        if (isSpreadsheet && window.XLSX) {
            const buffer = await file.blob.arrayBuffer();
            const workbook = window.XLSX.read(buffer, {
                type: 'array',
                cellDates: true,
                raw: true
            });
            const sheetName = workbook.SheetNames?.[0];
            const sheet = sheetName ? workbook.Sheets[sheetName] : null;

            if (!sheet) {
                writeViewerError(viewer, 'The workbook does not contain a readable sheet.');
                return;
            }

            const rows = window.XLSX.utils.sheet_to_json(sheet, {
                header: 1,
                defval: '',
                raw: false
            }).slice(0, 500);
            const maxColumns = Math.max(1, ...rows.map(row => row.length));
            const table = `
                <div class="viewer-meta">${escapeHtml(sheetName)} - showing first ${rows.length} rows</div>
                <div class="viewer-table-wrap">
                    <table>
                        <tbody>
                            ${rows.map((row, rowIndex) => `
                                <tr>
                                    ${Array.from({ length: maxColumns }, (_, index) => {
                const tag = rowIndex === 0 ? 'th' : 'td';
                return `<${tag}>${escapeHtml(row[index] ?? '')}</${tag}>`;
            }).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            writeViewer(viewer, filename, table);
            return;
        }

        const url = URL.createObjectURL(file.blob);
        const escapedUrl = escapeHtml(url);
        const escapedName = escapeHtml(filename);
        let body;

        if (/^image\//i.test(file.mimeType)) {
            body = `<img class="viewer-media" src="${escapedUrl}" alt="${escapedName}">`;
        } else if (/pdf/i.test(file.mimeType) || /\.pdf$/i.test(lowerName)) {
            body = `<iframe class="viewer-frame" src="${escapedUrl}" title="${escapedName}"></iframe>`;
        } else if (/text|json|xml|html/i.test(file.mimeType) || /\.(txt|csv|json|xml|html)$/i.test(lowerName)) {
            const text = await file.blob.text();
            body = `<pre class="viewer-text">${escapeHtml(text.slice(0, 200000))}</pre>`;
        } else {
            body = `
                <div class="viewer-empty">
                    This file type cannot be previewed in the browser.
                    <br>
                    <a href="${escapedUrl}" download="${escapedName}">Download file</a>
                </div>
            `;
        }

        writeViewer(viewer, filename, body);
    }

    function writeViewerLoading(viewer) {
        writeViewer(viewer, 'Loading document...', '<div class="viewer-empty">Preparing preview...</div>');
    }

    function writeViewerError(viewer, message) {
        writeViewer(viewer, 'Document preview', `<div class="viewer-empty is-error">${escapeHtml(message)}</div>`);
    }

    function writeViewer(viewer, title, body) {
        viewer.document.open();
        viewer.document.write(`<!doctype html>
            <html lang="en">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>${escapeHtml(title)}</title>
                    <style>
                        body { margin: 0; background: #eef4f8; color: #082033; font-family: Arial, sans-serif; }
                        header { position: sticky; top: 0; z-index: 2; padding: 16px 20px; border-bottom: 1px solid #cbd9e6; background: #ffffff; }
                        h1 { margin: 0; font-size: 18px; font-weight: 900; }
                        main { padding: 16px; }
                        .viewer-meta { margin-bottom: 10px; color: #415a70; font-size: 12px; font-weight: 800; }
                        .viewer-table-wrap { overflow: auto; border: 1px solid #cbd9e6; border-radius: 8px; background: #ffffff; }
                        table { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 12px; }
                        th, td { padding: 8px 10px; border-right: 1px solid #e1ebf3; border-bottom: 1px solid #e1ebf3; white-space: nowrap; }
                        th { position: sticky; top: 0; background: #102a43; color: #ffffff; text-align: left; }
                        .viewer-frame { width: 100%; height: calc(100vh - 96px); border: 1px solid #cbd9e6; border-radius: 8px; background: #ffffff; }
                        .viewer-media { display: block; max-width: 100%; height: auto; margin: 0 auto; border-radius: 8px; background: #ffffff; }
                        .viewer-text, .viewer-empty { padding: 18px; border: 1px solid #cbd9e6; border-radius: 8px; background: #ffffff; color: #173a59; font-size: 13px; font-weight: 700; }
                        .viewer-empty.is-error { border-color: #f0c9c9; background: #fff8f8; color: #9f1d1d; }
                    </style>
                </head>
                <body>
                    <header><h1>${escapeHtml(title)}</h1></header>
                    <main>${body}</main>
                </body>
            </html>`);
        viewer.document.close();
    }

    async function apiJson(path, options = {}) {
        const response = await apiFetch(path, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            },
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        const payload = await readJsonResponse(response);

        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || 'The Property Management server request failed');
        }

        return payload;
    }

    async function apiFetch(path, options = {}) {
        return authenticatedFetch(`${PM_API}${path}`, options);
    }

    async function prepaidApiJson(path, options = {}) {
        const response = await prepaidApiFetch(path, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            },
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        const payload = await readJsonResponse(response);

        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || 'The Prepaid server request failed');
        }

        return payload;
    }

    async function prepaidApiFetch(path, options = {}) {
        return authenticatedFetch(`${PREPAID_API}${path}`, options);
    }

    async function authenticatedFetch(path, options = {}) {
        const apiBase = String(window.API_URL || '').replace(/\/$/, '');
        const token = localStorage.getItem('token');

        if (!apiBase) throw new Error('API_URL is not configured');
        if (!token) throw new Error('Your session token was not found. Sign in again.');

        return fetch(`${apiBase}${path}`, {
            ...options,
            headers: {
                ...(options.headers || {}),
                Authorization: `Bearer ${token}`
            }
        });
    }

    async function readJsonResponse(response) {
        const text = await response.text();
        if (!text) return {};

        try {
            return JSON.parse(text);
        } catch {
            return { success: false, message: text };
        }
    }

    function setLoading(isLoading) {
        const loading = document.getElementById('pmDocsLoadingState');
        const table = document.getElementById('pmDocumentsTable');
        const empty = document.getElementById('pmDocsEmptyState');
        const pagination = document.getElementById('pmDocsPagination');

        if (loading) loading.style.display = isLoading ? 'block' : 'none';
        if (table) table.style.display = isLoading ? 'none' : table.style.display;
        if (empty && isLoading) {
            empty.hidden = true;
            empty.style.setProperty('display', 'none', 'important');
        }
        if (pagination && isLoading) pagination.style.display = 'none';
    }

    function setStatus(message, type) {
        const status = document.getElementById('pmDocsStatus');
        if (!status) return;

        status.textContent = message;
        status.classList.toggle('is-success', type === 'success');
        status.classList.toggle('is-error', type === 'error');

        if (type === 'success' || type === 'error') {
            showSwalToast(
                type === 'success' ? 'success' : 'error',
                type === 'success' ? 'Documents loaded' : 'Action needed',
                message
            );
        }
    }

    function showSwal(icon, title, text) {
        if (!window.Swal) return;

        window.Swal.fire({
            icon,
            title,
            text,
            confirmButtonText: 'OK',
            confirmButtonColor: '#102a43'
        });
    }

    function showSwalToast(icon, title, text) {
        if (!window.Swal || !text) return;

        window.Swal.fire({
            toast: true,
            position: 'top-end',
            icon,
            title,
            text,
            showConfirmButton: false,
            timer: 4500,
            timerProgressBar: true
        });
    }

    function formatPeriod(month, year) {
        const normalizedYear = year || '2026';
        const normalizedMonth = Number(month || 0);

        return normalizedMonth ? `${MONTH_NAMES[normalizedMonth]} ${normalizedYear}` : String(normalizedYear);
    }

    function formatDateTime(value) {
        if (!value) return 'No date';
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return String(value);

        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric'
        }).format(date);
    }

    function formatFileSize(value) {
        const bytes = Number(value || 0);
        if (!bytes) return '0 KB';
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(Number(value || 0));
    }

    function toTitleCase(value) {
        return String(value || '')
            .replace(/[_-]+/g, ' ')
            .replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    }

    function parseDateValue(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function decodeDispositionFilename(disposition) {
        const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (encoded) return decodeURIComponent(encoded[1]);

        const plain = disposition.match(/filename="?([^"]+)"?/i);
        return plain ? plain[1] : '';
    }

    function normalize(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }
})();
