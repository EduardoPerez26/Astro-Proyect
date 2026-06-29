(function () {
    'use strict';

    const STORAGE_KEY = 'xbfs.propertyManagement.requests.v1';
    const SCHEDULE_HEADERS = [
        'Entry / Payee',
        'Location',
        'Entity',
        'GL Acct',
        'Reference Info.',
        'STATE',
        'Date',
        'Amount Paid',
        'Prior Yr End Balance Forward',
        'PAID \nP01.26',
        'COLLECTED P01.26',
        'PAID P02.26',
        'COLLECTED P02.26',
        'PAID P03.26',
        'COLLECTED P03.26',
        'PAID P04.26',
        'COLLECTED P04.26',
        'PAID P05.26',
        'COLLECTED P05.26',
        'COLLECTED P06.26',
        'ACCRUAL P06.26',
        'COLLECTED P07.26',
        'ACCRUAL P07.26',
        'COLLECTED P08.26',
        'ACCRUAL P08.26',
        'COLLECTED P09.26',
        'ACCRUAL P09.26',
        'COLLECTED P10.26',
        'ACCRUAL P10.26',
        'COLLECTED P11.26',
        'ACCRUAL P11.26',
        'COLLECTED P12.26',
        'ACCRUAL P12.26',
        'YTD BAL',
        'YTD BAL \nPER STORE',
        'QUARTER REVIEW'
    ];
    const MONTH_ROW = [
        '', '', '', '', '', '', '', '', '',
        'January', 'January',
        'February', 'February',
        'March', 'March',
        'April', 'April',
        'May', 'May',
        'June', 'June',
        'July', 'July',
        'August', 'August',
        'September', 'September',
        'October', 'October',
        'November', 'November',
        'December', 'December',
        '',
        'Balance as of selected period',
        ''
    ];
    const PAID_COL_BY_MONTH = { 1: 9, 2: 11, 3: 13, 4: 15, 5: 17 };
    const COLLECTED_COL_BY_MONTH = {
        1: 10,
        2: 12,
        3: 14,
        4: 16,
        5: 18,
        6: 19,
        7: 21,
        8: 23,
        9: 25,
        10: 27,
        11: 29,
        12: 31
    };
    const ACCRUAL_COL_BY_MONTH = {
        6: 20,
        7: 22,
        8: 24,
        9: 26,
        10: 28,
        11: 30,
        12: 32
    };
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
    const PM_API = '/property-management';
    const STAGES = ['intake', 'review', 'approval', 'completed'];
    const STAGE_LABELS = {
        intake: 'Intake',
        review: 'Review',
        approval: 'Approval',
        completed: 'Completed'
    };
    const ENTITY_KEYWORDS = [
        ['AMARJEET', 'AI'],
        ['EAST BAY', 'EB'],
        ['QS RESTAURANTS', 'QR'],
        ['QS ENTERPRISES', 'QE'],
        ['ISHAR', 'II'],
        ['RITURAJ', 'RI'],
        ['SINGH', 'SI'],
        ['GOLDENGATE', 'GGB'],
        ['GOLDEN STATE', 'GSCB'],
        ['GOLD CROWN FOODS', 'GCF'],
        ['GOLD CROWN ENT', 'GCE'],
        ['GRASS VALLEY', 'GVB'],
        ['HOPEWELL', 'HB'],
        ['NORCAL II', 'N2B'],
        ['NORCAL', 'NB'],
        ['EVERFRESH', 'EF'],
        ['SAMRAT', 'SM'],
        ['SRS MILPITAS', 'SF'],
        ['HARSHRAJ', 'HI']
    ];

    let requests = [];
    let searchTerm = '';
    let stageFilter = '';
    let scheduleRows = [];
    let scheduleStoreCount = 0;
    let currentScheduleId = null;
    let linkedDocumentIds = [];
    let savedSchedules = [];
    let propertyDocuments = [];
    let scheduleFilters = {
        search: '',
        store: '',
        entity: '',
        month: '',
        rowType: ''
    };

    document.addEventListener('DOMContentLoaded', function () {
        requests = loadRequests();

        document
            .getElementById('propertyRequestForm')
            ?.addEventListener('submit', handleSubmit);

        document
            .getElementById('pmSearchInput')
            ?.addEventListener('input', function (event) {
                searchTerm = normalize(event.target.value);
                render();
            });

        document
            .getElementById('pmStageFilter')
            ?.addEventListener('change', function (event) {
                stageFilter = event.target.value;
                render();
            });

        document
            .getElementById('propertyManagementBoard')
            ?.addEventListener('click', handleBoardClick);

        document
            .getElementById('pmBuildScheduleBtn')
            ?.addEventListener('click', buildScheduleFromFiles);

        document
            .getElementById('pmExportScheduleBtn')
            ?.addEventListener('click', exportScheduleWorkbook);

        document
            .getElementById('pmClearScheduleBtn')
            ?.addEventListener('click', clearScheduleBuilder);

        document
            .getElementById('pmSaveScheduleBtn')
            ?.addEventListener('click', saveCurrentSchedule);

        document
            .getElementById('pmLoadScheduleBtn')
            ?.addEventListener('click', loadSelectedSchedule);

        document
            .getElementById('pmRefreshSavedBtn')
            ?.addEventListener('click', refreshPersistedData);

        document
            .getElementById('pmDocsRefreshBtn')
            ?.addEventListener('click', refreshPersistedData);

        document
            .querySelectorAll('[data-pm-tab-target]')
            .forEach(button => button.addEventListener('click', handleWorkspaceTabClick));

        document
            .getElementById('pmAddMonthBtn')
            ?.addEventListener('click', addMonthlyActivity);

        document
            .getElementById('pmAddStoreRowBtn')
            ?.addEventListener('click', addManualStoreRow);

        document
            .getElementById('pmScheduleTable')
            ?.addEventListener('focusout', handleScheduleCellEdit);

        document
            .querySelectorAll('[data-pm-filter]')
            .forEach(element => {
                const eventName = element.tagName === 'INPUT' ? 'input' : 'change';
                element.addEventListener(eventName, handleScheduleFilterChange);
            });

        document
            .getElementById('pmClearScheduleFiltersBtn')
            ?.addEventListener('click', clearScheduleFilters);

        document
            .getElementById('pmAlertStack')
            ?.addEventListener('click', handleAlertDismiss);

        document
            .getElementById('pmDocumentsList')
            ?.addEventListener('click', handleDocumentDownload);

        document
            .getElementById('pmDepartmentDocumentsTab')
            ?.addEventListener('click', handleDepartmentDocumentsAction);

        setDefaultMonthDate();
        render();
        refreshPersistedData().finally(openScheduleFromQuery);
    });

    async function buildScheduleFromFiles() {
        const generalLedgerInput = document.getElementById('pmGeneralLedgerFile');
        const dimensionInput = document.getElementById('pmDimensionFile');

        setScheduleStatus('Reading reports...', 'info');

        try {
            if (!window.XLSX) {
                throw new Error('The spreadsheet library is not available. Refresh the page and try again.');
            }

            const generalLedgerRows = await readWorkbookRows(generalLedgerInput, 'General Ledger report');
            const dimensionRows = await readWorkbookRows(dimensionInput, 'Dimension balances report');
            const dimensionByStore = parseDimensionBalances(dimensionRows);
            const ledger = parseGeneralLedger(generalLedgerRows);
            const result = buildScheduleRows(ledger, dimensionByStore);

            scheduleRows = result.rows;
            scheduleStoreCount = result.storeCount;
            currentScheduleId = null;
            setDefaultScheduleName();

            if (!scheduleRows.length) {
                throw new Error('No store rows were found in the uploaded reports.');
            }

            const documentResult = await saveUploadedScheduleDocuments(result);
            linkedDocumentIds = documentResult.ids;
            renderSchedulePreview(result);
            setScheduleStatus(
                documentResult.warning
                    ? `Schedule ready, but documents were not saved: ${documentResult.warning}`
                    : `Schedule ready: ${result.storeCount} stores and ${scheduleRows.length} rows.`,
                documentResult.warning ? 'warning' : 'success'
            );
        } catch (error) {
            console.error('Property Management schedule error:', error);
            scheduleRows = [];
            scheduleStoreCount = 0;
            currentScheduleId = null;
            linkedDocumentIds = [];
            renderSchedulePreview({ rows: [], storeCount: 0, totalBalance: 0 });
            setScheduleStatus(error.message || 'The schedule could not be built.', 'error');
        }
    }

    async function readWorkbookRows(input, label) {
        const file = input?.files?.[0];
        if (!file) {
            throw new Error(`${label} is required.`);
        }

        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, {
            type: 'array',
            cellDates: true,
            raw: true
        });
        const firstSheetName = workbook.SheetNames?.[0];
        const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;

        if (!sheet) {
            throw new Error(`${label} does not contain a readable sheet.`);
        }

        return window.XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: '',
            raw: true
        });
    }

    function parseDimensionBalances(rows) {
        const headerIndex = findHeaderRow(rows, ['Account', 'Location', 'Opening balance']);
        if (headerIndex < 0) {
            throw new Error('The Dimension balances report does not have the expected headers.');
        }

        const headers = rows[headerIndex].map(normalizeHeader);
        const accountIndex = findHeaderIndex(headers, 'account');
        const locationIndex = findHeaderIndex(headers, 'location');
        const openingIndex = findHeaderIndex(headers, 'opening balance');
        const periodIndex = findHeaderIndex(headers, 'period balance');
        const closingIndex = findHeaderIndex(headers, 'closing balance');
        const stores = new Map();

        rows.slice(headerIndex + 1).forEach(row => {
            const location = cleanLocation(row[locationIndex]);
            const account = String(row[accountIndex] || '').trim();

            if (!location || account !== '241000') return;

            stores.set(location, {
                location,
                openingBalance: parseMoney(row[openingIndex]) || 0,
                periodBalance: parseMoney(row[periodIndex]) || 0,
                closingBalance: parseMoney(row[closingIndex]) || 0
            });
        });

        return stores;
    }

    function parseGeneralLedger(rows) {
        const headerIndex = findHeaderRow(rows, ['Posted dt.', 'Location', 'Debit', 'Credit']);
        if (headerIndex < 0) {
            throw new Error('The General Ledger report does not have the expected headers.');
        }

        const headers = rows[headerIndex].map(normalizeHeader);
        const indexes = {
            posted: findHeaderIndex(headers, 'posted dt'),
            docDate: findHeaderIndex(headers, 'doc dt'),
            doc: findHeaderIndex(headers, 'doc'),
            memo: findHeaderIndex(headers, 'memo description'),
            location: findHeaderIndex(headers, 'location'),
            debit: findHeaderIndex(headers, 'debit'),
            credit: findHeaderIndex(headers, 'credit')
        };
        const transactions = [];

        rows.slice(headerIndex + 1).forEach(row => {
            const location = cleanLocation(row[indexes.location]);
            const postedDate = parseDateValue(row[indexes.posted]);
            const memo = String(row[indexes.memo] || row[indexes.doc] || '').trim();
            const debit = parseMoney(row[indexes.debit]);
            const credit = parseMoney(row[indexes.credit]);

            if (!location || !postedDate || (!debit && !credit)) return;
            if (/total|grand total/i.test(location) || /total|grand total/i.test(memo)) return;

            transactions.push({
                location,
                postedDate,
                docDate: parseDateValue(row[indexes.docDate]) || postedDate,
                memo: memo || 'Sales Tax',
                debit: debit || 0,
                credit: credit || 0,
                entity: inferEntity(memo, location),
                state: /CALIFORNIA| CA /i.test(` ${memo} `) || credit ? 'CA' : ''
            });
        });

        return transactions;
    }

    function buildScheduleRows(transactions, dimensionByStore) {
        const byStore = new Map();

        transactions.forEach(transaction => {
            if (!byStore.has(transaction.location)) byStore.set(transaction.location, []);
            byStore.get(transaction.location).push(transaction);
        });

        dimensionByStore.forEach((value, location) => {
            if (!byStore.has(location)) byStore.set(location, []);
        });

        const rows = [];
        const locations = Array.from(byStore.keys()).sort(naturalSort);

        locations.forEach(location => {
            const storeTransactions = byStore.get(location) || [];
            const opening = dimensionByStore.get(location)?.openingBalance || 0;
            const entity = inferStoreEntity(storeTransactions, location);
            const state = storeTransactions.some(item => item.state === 'CA') ? 'CA' : '';
            const summary = emptyScheduleRow();

            summary[0] = 'Sales Tax';
            summary[1] = location;
            summary[2] = entity;
            summary[3] = 241000;
            summary[5] = state;
            summary[8] = roundMoney(opening);

            storeTransactions
                .filter(item => item.credit)
                .forEach(item => {
                    const month = item.postedDate.getMonth() + 1;
                    const collectedColumn = COLLECTED_COL_BY_MONTH[month];

                    if (collectedColumn === undefined) return;
                    summary[collectedColumn] = roundMoney((summary[collectedColumn] || 0) - Math.abs(item.credit));
                });

            summary[33] = sumRowBalance(summary);

            const paymentRows = storeTransactions
                .filter(item => item.debit)
                .sort((a, b) => a.postedDate - b.postedDate || a.memo.localeCompare(b.memo))
                .map(item => buildPaymentRow(item, entity, state));
            const groupRows = [summary, ...paymentRows];
            const storeTotal = roundMoney(groupRows.reduce((total, row) => total + (row[33] || 0), 0));
            const totalRow = groupRows[groupRows.length - 1];

            totalRow[34] = storeTotal;
            groupRows.forEach(row => {
                if (String(row[0] || '').includes('Q1 RETURN')) {
                    row[35] = roundMoney(storeTotal - (summary[16] || 0));
                }
            });

            rows.push(...groupRows);
        });

        return {
            rows,
            storeCount: locations.length,
            totalBalance: roundMoney(rows.reduce((total, row) => total + (row[34] || 0), 0))
        };
    }

    function buildPaymentRow(transaction, fallbackEntity, fallbackState) {
        const row = emptyScheduleRow();
        const month = transaction.postedDate.getMonth() + 1;
        const paidColumn = PAID_COL_BY_MONTH[month];

        row[0] = transaction.memo;
        row[1] = transaction.location;
        row[2] = transaction.entity || fallbackEntity;
        row[3] = 241000;
        row[5] = transaction.state || fallbackState;
        row[6] = transaction.postedDate;
        row[7] = roundMoney(transaction.debit);

        if (paidColumn !== undefined) {
            row[paidColumn] = roundMoney(transaction.debit);
        }

        row[33] = sumRowBalance(row);
        return row;
    }

    function emptyScheduleRow() {
        return Array.from({ length: SCHEDULE_HEADERS.length }, () => '');
    }

    function sumRowBalance(row) {
        let total = 0;
        for (let index = 8; index <= 32; index += 1) {
            total += Number(row[index] || 0);
        }
        return roundMoney(total);
    }

    function renderSchedulePreview(result) {
        const preview = document.getElementById('pmSchedulePreview');
        const table = document.getElementById('pmScheduleTable');
        const exportButton = document.getElementById('pmExportScheduleBtn');
        const saveButton = document.getElementById('pmSaveScheduleBtn');

        if (!preview || !table || !exportButton) return;

        if (!result.rows.length) {
            preview.hidden = true;
            exportButton.disabled = true;
            if (saveButton) saveButton.disabled = true;
            table.innerHTML = '';
            setText('pmScheduleStores', 0);
            setText('pmScheduleRows', 0);
            setText('pmScheduleBalance', formatCurrency(0));
            setText('pmScheduleFilterCount', 'Showing all rows');
            populateScheduleFilterOptions([]);
            updateMonthEditor();
            return;
        }

        preview.hidden = false;
        exportButton.disabled = false;
        if (saveButton) saveButton.disabled = false;
        setText('pmScheduleStores', result.storeCount);
        setText('pmScheduleRows', result.rows.length);
        setText('pmScheduleBalance', formatCurrency(result.totalBalance));
        populateScheduleFilterOptions(result.rows);

        const filtered = getFilteredScheduleRows(result.rows);
        const visibleRows = filtered.rows;
        updateScheduleFilterCount(filtered.rows.length, result.rows.length, visibleRows.length);
        table.innerHTML = `
            <thead>
                <tr>
                    ${SCHEDULE_HEADERS.map(header => `<th>${escapeHtml(header).replace(/\n/g, '<br>')}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${visibleRows.length
                    ? visibleRows.map(item => renderScheduleTableRow(item.row, item.index)).join('')
                    : renderEmptyScheduleRows()}
            </tbody>
        `;
        updateMonthEditor();
    }

    function renderScheduleTableRow(row, rowIndex) {
        const isSummary = row[0] === 'Sales Tax';

        return `
            <tr class="${isSummary ? 'is-store-summary' : ''}">
                ${row.map((value, index) => {
                    const isNumber = typeof value === 'number';
                    const editable = isEditableScheduleColumn(index);
                    const display = value instanceof Date
                        ? formatDateForDisplay(value)
                        : isNumber
                            ? formatNumber(value)
                            : value;

                    return `
                        <td
                            class="${[
                                isNumber ? 'is-number' : '',
                                editable ? 'is-editable' : ''
                            ].filter(Boolean).join(' ')}"
                            ${editable ? 'contenteditable="true"' : ''}
                            data-row-index="${rowIndex}"
                            data-column-index="${index}"
                        >${escapeHtml(display)}</td>
                    `;
                }).join('')}
            </tr>
        `;
    }

    function renderEmptyScheduleRows() {
        return `
            <tr>
                <td class="pm-table-empty" colspan="${SCHEDULE_HEADERS.length}">
                    No rows match the selected filters.
                </td>
            </tr>
        `;
    }

    function handleScheduleFilterChange(event) {
        const key = event.currentTarget.dataset.pmFilter;
        if (!key || !(key in scheduleFilters)) return;

        scheduleFilters[key] = event.currentTarget.value || '';
        renderSchedulePreview(getScheduleResult());
    }

    function clearScheduleFilters() {
        scheduleFilters = {
            search: '',
            store: '',
            entity: '',
            month: '',
            rowType: ''
        };

        document.querySelectorAll('[data-pm-filter]').forEach(element => {
            element.value = '';
        });

        renderSchedulePreview(getScheduleResult());
        showPmAlert({
            type: 'info',
            title: 'Filters cleared',
            message: 'The full schedule is visible again.'
        });
    }

    function getFilteredScheduleRows(rows) {
        const search = normalize(scheduleFilters.search);
        const store = scheduleFilters.store;
        const entity = scheduleFilters.entity;
        const month = Number(scheduleFilters.month || 0);
        const rowType = scheduleFilters.rowType;

        return {
            rows: rows
                .map((row, index) => ({ row, index }))
                .filter(item => {
                    if (store && String(item.row[1] || '') !== store) return false;
                    if (entity && String(item.row[2] || '') !== entity) return false;
                    if (month && !rowHasMonthActivity(item.row, month)) return false;
                    if (rowType && !rowMatchesType(item.row, rowType)) return false;
                    if (search && !getRowSearchText(item.row).includes(search)) return false;
                    return true;
                })
        };
    }

    function populateScheduleFilterOptions(rows) {
        const storeSelect = document.getElementById('pmScheduleStoreFilter');
        const entitySelect = document.getElementById('pmScheduleEntityFilter');

        populateFilterSelect(
            storeSelect,
            getUniqueValues(rows, 1).sort(naturalSort),
            'All stores',
            scheduleFilters.store
        );
        populateFilterSelect(
            entitySelect,
            getUniqueValues(rows, 2).sort(naturalSort),
            'All entities',
            scheduleFilters.entity
        );
    }

    function populateFilterSelect(select, values, defaultLabel, selectedValue) {
        if (!select) return;

        select.innerHTML = [
            `<option value="">${escapeHtml(defaultLabel)}</option>`,
            ...values.map(value =>
                `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
            )
        ].join('');

        select.value = values.includes(selectedValue) ? selectedValue : '';
        if (select.value !== selectedValue) {
            const key = select.dataset.pmFilter;
            if (key && key in scheduleFilters) scheduleFilters[key] = '';
        }
    }

    function updateScheduleFilterCount(filteredCount, totalCount, visibleCount) {
        const label = filteredCount === totalCount
            ? `Showing ${Math.min(visibleCount, totalCount)} of ${totalCount} rows`
            : `Showing ${visibleCount} of ${filteredCount} filtered rows`;

        setText('pmScheduleFilterCount', label);
    }

    function getUniqueValues(rows, columnIndex) {
        return Array.from(
            new Set(rows.map(row => String(row[columnIndex] || '').trim()).filter(Boolean))
        );
    }

    function getRowSearchText(row) {
        return normalize(row.map(value => {
            if (value instanceof Date) return formatDateForDisplay(value);
            return String(value ?? '');
        }).join(' '));
    }

    function rowHasMonthActivity(row, month) {
        const columns = [
            PAID_COL_BY_MONTH[month],
            COLLECTED_COL_BY_MONTH[month],
            ACCRUAL_COL_BY_MONTH[month]
        ].filter(index => index !== undefined);
        const dateValue = row[6] instanceof Date ? row[6] : parseDateValue(row[6]);
        const hasDateInMonth = dateValue && dateValue.getMonth() + 1 === month;

        return hasDateInMonth || columns.some(index => Number(row[index] || 0));
    }

    function rowMatchesType(row, type) {
        const isSummary = row[0] === 'Sales Tax';
        const isManual = String(row[4] || '').toLowerCase() === 'manual entry';
        const hasActivity = rowHasAnyActivity(row);

        if (type === 'summary') return isSummary;
        if (type === 'detail') return !isSummary;
        if (type === 'manual') return isManual;
        if (type === 'activity') return hasActivity;

        return true;
    }

    function rowHasAnyActivity(row) {
        for (let index = 8; index <= 32; index += 1) {
            if (Number(row[index] || 0)) return true;
        }

        return Boolean(Number(row[7] || 0));
    }

    function exportScheduleWorkbook() {
        if (!scheduleRows.length || !window.XLSX) return;

        const year = getScheduleYear(scheduleRows);
        const entities = Array.from(
            new Set(scheduleRows.map(row => row[2]).filter(Boolean))
        ).sort();
        const aoa = [
            ['COMPANY NAME: Quikserve Burger King', 'Prepared by:', 'Property Management'],
            [`COMPANY: ${entities.join(', ') || 'Property Management'}`],
            ['GL ACCOUNT NAME: SALES TAX PAYABLE'],
            ['GL ACCOUNT #: 241000'],
            [`YEAR: ${year}`],
            MONTH_ROW,
            SCHEDULE_HEADERS,
            ...scheduleRows
        ];
        const worksheet = window.XLSX.utils.aoa_to_sheet(aoa);
        const workbook = window.XLSX.utils.book_new();

        worksheet['!cols'] = [
            { wch: 72 }, { wch: 13 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 9 },
            { wch: 12 }, { wch: 13 }, { wch: 18 },
            ...Array.from({ length: 24 }, () => ({ wch: 14 })),
            { wch: 14 }, { wch: 16 }, { wch: 16 }
        ];
        worksheet['!autofilter'] = { ref: `A7:AJ${aoa.length}` };

        window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule 2026');
        window.XLSX.writeFile(workbook, `Property Management - Schedule 2026 ${timestampForFile()}.xlsx`);
    }

    function clearScheduleBuilder() {
        const generalLedgerInput = document.getElementById('pmGeneralLedgerFile');
        const dimensionInput = document.getElementById('pmDimensionFile');

        if (generalLedgerInput) generalLedgerInput.value = '';
        if (dimensionInput) dimensionInput.value = '';

        scheduleRows = [];
        scheduleStoreCount = 0;
        currentScheduleId = null;
        linkedDocumentIds = [];
        scheduleFilters = {
            search: '',
            store: '',
            entity: '',
            month: '',
            rowType: ''
        };
        document.querySelectorAll('[data-pm-filter]').forEach(element => {
            element.value = '';
        });
        renderSchedulePreview({ rows: [], storeCount: 0, totalBalance: 0 });
        setDefaultScheduleName();
        setScheduleStatus('Upload both reports to build the Schedule 2026 table.', 'info');
    }

    async function refreshPersistedData() {
        await Promise.all([
            loadSavedSchedules(),
            loadPropertyDocuments()
        ]);
        renderDepartmentDocumentsTab();
    }

    function handleWorkspaceTabClick(event) {
        switchWorkspaceTab(event.currentTarget.dataset.pmTabTarget || 'editor');
    }

    function switchWorkspaceTab(target) {
        const next = target === 'documents' ? 'documents' : 'editor';

        document.querySelectorAll('[data-pm-tab-target]').forEach(button => {
            const isActive = button.dataset.pmTabTarget === next;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', String(isActive));
        });

        [
            ['editor', 'pmEditorTab'],
            ['documents', 'pmDepartmentDocumentsTab']
        ].forEach(([key, id]) => {
            const panel = document.getElementById(id);
            if (!panel) return;

            const isActive = key === next;
            panel.hidden = !isActive;
            panel.classList.toggle('is-active', isActive);
        });

        if (next === 'documents') {
            renderDepartmentDocumentsTab();
        }
    }

    async function saveUploadedScheduleDocuments(result) {
        const generalLedgerInput = document.getElementById('pmGeneralLedgerFile');
        const dimensionInput = document.getElementById('pmDimensionFile');
        const files = [
            {
                input: generalLedgerInput,
                type: 'general_ledger',
                label: 'General Ledger report'
            },
            {
                input: dimensionInput,
                type: 'dimension_balances',
                label: 'Dimension balances report'
            }
        ];
        const ids = [];

        try {
            for (const item of files) {
                const file = item.input?.files?.[0];
                if (!file) continue;

                const saved = await uploadPropertyDocument(file, item.type, {
                    label: item.label,
                    storeCount: result.storeCount,
                    rowCount: result.rows.length,
                    totalBalance: result.totalBalance
                });

                if (saved?.id) ids.push(saved.id);
            }

            await loadPropertyDocuments();
            return { ids, warning: '' };
        } catch (error) {
            console.warn('Property Management source documents were not saved:', error);
            return {
                ids,
                warning: error.message || 'The server could not store the documents'
            };
        }
    }

    async function uploadPropertyDocument(file, type, metadata) {
        const formData = new FormData();

        formData.append('document', file);
        formData.append('tipo_documento', type);
        formData.append('periodo_anio', String(getScheduleYear(scheduleRows)));
        formData.append('periodo_mes', String(getLatestScheduleMonth(scheduleRows) || ''));
        formData.append('metadata_json', JSON.stringify(metadata || {}));

        const response = await apiFetch('/documents', {
            method: 'POST',
            body: formData
        });
        const payload = await readJsonResponse(response);

        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || 'Document could not be saved');
        }

        return payload.document || null;
    }

    async function loadPropertyDocuments() {
        const list = document.getElementById('pmDocumentsList');
        if (!list) return;

        try {
            const payload = await apiJson('/documents');
            propertyDocuments = payload.documents || [];
            renderPropertyDocuments(propertyDocuments);
            renderDepartmentDocumentsTab();
        } catch (error) {
            propertyDocuments = [];
            list.innerHTML = `<div class="pm-empty-state">${escapeHtml(error.message || 'Documents could not be loaded')}</div>`;
            renderDepartmentDocumentsTab();
        }
    }

    function renderPropertyDocuments(documents) {
        const list = document.getElementById('pmDocumentsList');
        if (!list) return;

        if (!documents.length) {
            list.innerHTML = '<div class="pm-empty-state">No Property Management documents saved yet.</div>';
            return;
        }

        list.innerHTML = documents.map(document => {
            const uploadedAt = formatDateTime(document.fecha_carga);
            const size = formatFileSize(document.tamano_bytes);

            return `
                <article class="pm-document-item">
                    <div>
                        <strong title="${escapeHtml(document.nombre_original)}">${escapeHtml(document.nombre_original)}</strong>
                        <small>${escapeHtml([
                            document.tipo_label || document.tipo_documento,
                            uploadedAt,
                            size
                        ].filter(Boolean).join(' - '))}</small>
                        <span>${escapeHtml(document.tipo_label || document.tipo_documento)} · ${escapeHtml(uploadedAt)} · ${escapeHtml(size)}</span>
                    </div>
                    <div class="pm-table-actions">
                        <button
                            type="button"
                            class="pm-document-download"
                            data-pm-document-view="${escapeHtml(document.id)}"
                        >
                            View
                        </button>
                        <button
                            type="button"
                            class="pm-document-download"
                            data-pm-document-download="${escapeHtml(document.id)}"
                        >
                            Download
                        </button>
                    </div>
                </article>
            `;
        }).join('');
    }

    async function handleDocumentDownload(event) {
        const button = event.target.closest('[data-pm-document-view], [data-pm-document-download]');
        if (!button) return;

        const id = button.dataset.pmDocumentView || button.dataset.pmDocumentDownload;
        if (!id) return;

        if (button.dataset.pmDocumentView) {
            await viewPropertyDocument(id, button);
            return;
        }

        await downloadPropertyDocument(id, button);
    }

    async function downloadPropertyDocument(id, button = null) {
        if (button) button.disabled = true;

        try {
            const { blob, filename } = await fetchPropertyDocumentBlob(id);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            link.href = url;
            link.download = filename || `property-management-document-${id}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            setScheduleStatus(error.message || 'Document could not be downloaded.', 'error');
            showServerResult('error', 'Download failed', error.message || 'Document could not be downloaded.');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function viewPropertyDocument(id, button = null) {
        const viewer = window.open('', '_blank');

        if (!viewer) {
            showServerResult('warning', 'Popup blocked', 'Allow popups to view the document in a new window.');
            return;
        }

        if (button) button.disabled = true;
        writeDocumentViewerLoading(viewer);

        try {
            const file = await fetchPropertyDocumentBlob(id);
            await renderDocumentInWindow(viewer, file);
        } catch (error) {
            writeDocumentViewerError(viewer, error.message || 'Document could not be opened.');
            setScheduleStatus(error.message || 'Document could not be opened.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function fetchPropertyDocumentBlob(id) {
        const response = await apiFetch(`/documents/${encodeURIComponent(id)}/download`);

        if (!response.ok) {
            const payload = await readJsonResponse(response);
            throw new Error(payload.message || 'Document could not be loaded');
        }

        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition') || '';
        const filename = decodeDispositionFilename(disposition) || `property-management-document-${id}`;

        return {
            blob,
            filename,
            mimeType: blob.type || response.headers.get('Content-Type') || ''
        };
    }

    function writeDocumentViewerLoading(viewer) {
        viewer.document.open();
        viewer.document.write(getViewerShell('Loading document...', '<div class="viewer-empty">Preparing preview...</div>'));
        viewer.document.close();
    }

    function writeDocumentViewerError(viewer, message) {
        viewer.document.open();
        viewer.document.write(getViewerShell('Document preview', `<div class="viewer-empty is-error">${escapeHtml(message)}</div>`));
        viewer.document.close();
    }

    async function renderDocumentInWindow(viewer, file) {
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
                writeDocumentViewerError(viewer, 'The workbook does not contain a readable sheet.');
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

            viewer.document.open();
            viewer.document.write(getViewerShell(filename, table));
            viewer.document.close();
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

        viewer.document.open();
        viewer.document.write(getViewerShell(filename, body));
        viewer.document.close();
    }

    function getViewerShell(title, body) {
        return `<!doctype html>
            <html lang="en">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>${escapeHtml(title)}</title>
                    <style>
                        body {
                            margin: 0;
                            background: #eef4f8;
                            color: #082033;
                            font-family: Arial, sans-serif;
                        }
                        header {
                            position: sticky;
                            top: 0;
                            z-index: 2;
                            padding: 16px 20px;
                            border-bottom: 1px solid #cbd9e6;
                            background: #ffffff;
                        }
                        h1 {
                            margin: 0;
                            font-size: 18px;
                            font-weight: 900;
                        }
                        main {
                            padding: 16px;
                        }
                        .viewer-meta {
                            margin-bottom: 10px;
                            color: #415a70;
                            font-size: 12px;
                            font-weight: 800;
                        }
                        .viewer-table-wrap {
                            overflow: auto;
                            border: 1px solid #cbd9e6;
                            border-radius: 8px;
                            background: #ffffff;
                        }
                        table {
                            width: max-content;
                            min-width: 100%;
                            border-collapse: collapse;
                            font-size: 12px;
                        }
                        th, td {
                            padding: 8px 10px;
                            border-right: 1px solid #e1ebf3;
                            border-bottom: 1px solid #e1ebf3;
                            white-space: nowrap;
                        }
                        th {
                            position: sticky;
                            top: 0;
                            background: #102a43;
                            color: #ffffff;
                            text-align: left;
                        }
                        .viewer-frame {
                            width: 100%;
                            height: calc(100vh - 96px);
                            border: 1px solid #cbd9e6;
                            border-radius: 8px;
                            background: #ffffff;
                        }
                        .viewer-media {
                            display: block;
                            max-width: 100%;
                            height: auto;
                            margin: 0 auto;
                            border-radius: 8px;
                            background: #ffffff;
                        }
                        .viewer-text,
                        .viewer-empty {
                            padding: 18px;
                            border: 1px solid #cbd9e6;
                            border-radius: 8px;
                            background: #ffffff;
                            color: #173a59;
                            font-size: 13px;
                            font-weight: 700;
                        }
                        .viewer-empty.is-error {
                            border-color: #f0c9c9;
                            background: #fff8f8;
                            color: #9f1d1d;
                        }
                    </style>
                </head>
                <body>
                    <header><h1>${escapeHtml(title)}</h1></header>
                    <main>${body}</main>
                </body>
            </html>`;
    }

    function renderDepartmentDocumentsTab() {
        renderDepartmentSchedulesTable();
        renderDepartmentFilesTable();
    }

    function renderDepartmentSchedulesTable() {
        const tbody = document.getElementById('pmDepartmentSchedulesTable');
        if (!tbody) return;

        if (!savedSchedules.length) {
            tbody.innerHTML = '<tr><td class="pm-doc-empty" colspan="7">No saved Property Management schedules yet.</td></tr>';
            return;
        }

        tbody.innerHTML = savedSchedules.map(schedule => {
            const period = schedule.periodo_mes
                ? `${MONTH_NAMES[schedule.periodo_mes]} ${schedule.periodo_anio}`
                : String(schedule.periodo_anio || '2026');

            return `
                <tr>
                    <td>
                        <div class="pm-document-name">
                            <strong>${escapeHtml(schedule.nombre || 'Schedule 2026')}</strong>
                            <span>${escapeHtml(schedule.usuario_nombre || 'Property Management')}</span>
                        </div>
                    </td>
                    <td>${escapeHtml(period)}</td>
                    <td>${escapeHtml(schedule.total_tiendas || 0)}</td>
                    <td>${escapeHtml(schedule.total_filas || 0)}</td>
                    <td>${escapeHtml(formatCurrency(schedule.balance_total || 0))}</td>
                    <td>${escapeHtml(formatDateTime(schedule.fecha_actualizacion))}</td>
                    <td>
                        <div class="pm-table-actions">
                            <button
                                type="button"
                                class="pm-table-action is-primary"
                                data-pm-schedule-edit="${escapeHtml(schedule.id)}"
                            >
                                <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
                                Edit
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function formatScheduleOptionLabel(schedule, updatedAt, monthLabel) {
        return [
            schedule.nombre || 'Schedule 2026',
            `${monthLabel || ''}${schedule.periodo_anio || 2026}`.trim(),
            updatedAt
        ].filter(Boolean).join(' - ');
    }

    function renderDepartmentFilesTable() {
        const tbody = document.getElementById('pmDepartmentFilesTable');
        if (!tbody) return;

        if (!propertyDocuments.length) {
            tbody.innerHTML = '<tr><td class="pm-doc-empty" colspan="5">No uploaded Property Management documents yet.</td></tr>';
            return;
        }

        tbody.innerHTML = propertyDocuments.map(document => `
            <tr>
                <td>
                    <div class="pm-document-name">
                        <strong>${escapeHtml(document.nombre_original)}</strong>
                        <span>${escapeHtml(document.periodo_anio || '2026')}</span>
                    </div>
                </td>
                <td>${escapeHtml(document.tipo_label || document.tipo_documento)}</td>
                <td>${escapeHtml(formatFileSize(document.tamano_bytes))}</td>
                <td>${escapeHtml(formatDateTime(document.fecha_carga))}</td>
                <td>
                    <div class="pm-table-actions">
                        <button
                            type="button"
                            class="pm-table-action is-primary"
                            data-pm-document-view="${escapeHtml(document.id)}"
                        >
                            <i class="fa-solid fa-eye" aria-hidden="true"></i>
                            View
                        </button>
                        <button
                            type="button"
                            class="pm-table-action"
                            data-pm-document-download="${escapeHtml(document.id)}"
                        >
                            <i class="fa-solid fa-download" aria-hidden="true"></i>
                            Download
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    async function handleDepartmentDocumentsAction(event) {
        const editButton = event.target.closest('[data-pm-schedule-edit]');
        const viewButton = event.target.closest('[data-pm-document-view]');
        const downloadButton = event.target.closest('[data-pm-document-download]');

        if (editButton) {
            await openScheduleForEditing(editButton.dataset.pmScheduleEdit);
            return;
        }

        if (viewButton) {
            await viewPropertyDocument(viewButton.dataset.pmDocumentView, viewButton);
            return;
        }

        if (downloadButton) {
            await downloadPropertyDocument(downloadButton.dataset.pmDocumentDownload, downloadButton);
        }
    }

    async function openScheduleForEditing(id) {
        if (!id) return;

        const opened = await loadScheduleById(id, {
            successMessage: 'Schedule opened in the editor tab.'
        });
        if (!opened) return;

        switchWorkspaceTab('editor');
        document.getElementById('pmSchedulePreview')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }

    async function openScheduleFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const scheduleId = params.get('schedule');

        if (!scheduleId) return;

        const opened = await loadScheduleById(scheduleId, {
            successMessage: 'Schedule opened from Property Documents.'
        });

        if (opened) {
            switchWorkspaceTab('editor');
            const cleanUrl = `${window.location.pathname}`;
            window.history.replaceState({}, '', cleanUrl);
        }
    }

    async function loadSavedSchedules() {
        const select = document.getElementById('pmSavedScheduleSelect');
        if (!select) return;

        try {
            const payload = await apiJson('/schedules');
            const schedules = payload.schedules || [];
            savedSchedules = schedules;

            select.innerHTML = schedules.length
                ? [
                    '<option value="">Select a saved schedule...</option>',
                    ...schedules.map(schedule => {
                        const updatedAt = formatDateTime(schedule.fecha_actualizacion);
                        const month = schedule.periodo_mes
                            ? `${MONTH_NAMES[schedule.periodo_mes]} `
                            : '';
                        const label = `${schedule.nombre} · ${month}${schedule.periodo_anio} · ${updatedAt}`;

                        return `<option value="${escapeHtml(schedule.id)}">${escapeHtml(formatScheduleOptionLabel(schedule, updatedAt, month))}</option>`;
                    })
                ].join('')
                : '<option value="">No saved schedules yet</option>';

            if (currentScheduleId) select.value = String(currentScheduleId);
            renderDepartmentDocumentsTab();
        } catch (error) {
            savedSchedules = [];
            select.innerHTML = `<option value="">${escapeHtml(error.message || 'Saved schedules could not be loaded')}</option>`;
            renderDepartmentDocumentsTab();
        }
    }

    async function saveCurrentSchedule() {
        if (!scheduleRows.length) {
            setScheduleStatus('Build or open a schedule before saving.', 'error');
            return;
        }

        const saveButton = document.getElementById('pmSaveScheduleBtn');
        const result = getScheduleResult();
        const payload = {
            nombre: getScheduleName(),
            periodo_anio: getScheduleYear(scheduleRows),
            periodo_mes: getLatestScheduleMonth(scheduleRows),
            rows: serializeScheduleRows(scheduleRows),
            headers: SCHEDULE_HEADERS,
            total_tiendas: result.storeCount,
            total_filas: result.rows.length,
            balance_total: result.totalBalance,
            estado: 'draft',
            documentIds: linkedDocumentIds
        };

        if (saveButton) saveButton.disabled = true;
        setScheduleStatus('Saving Property Management schedule...', 'info');
        showServerLoading('Saving schedule', 'Property Management data is being saved on the server.');

        try {
            const path = currentScheduleId
                ? `/schedules/${encodeURIComponent(currentScheduleId)}`
                : '/schedules';
            const method = currentScheduleId ? 'PUT' : 'POST';
            const response = await apiJson(path, {
                method,
                body: payload
            });

            currentScheduleId = response.schedule?.id || currentScheduleId;
            await loadSavedSchedules();
            renderDepartmentDocumentsTab();
            setScheduleStatus('Schedule saved in Property Management database tables.', 'success');
            showServerResult(
                'success',
                'Saved on server',
                'The schedule was saved in the Property Management database.'
            );
        } catch (error) {
            setScheduleStatus(error.message || 'Schedule could not be saved.', 'error');
            showServerResult('error', 'Save failed', error.message || 'Schedule could not be saved.');
        } finally {
            if (saveButton) saveButton.disabled = !scheduleRows.length;
        }
    }

    async function loadSelectedSchedule() {
        const select = document.getElementById('pmSavedScheduleSelect');
        const id = select?.value;

        if (!id) {
            setScheduleStatus('Select a saved Property Management schedule to open.', 'error');
            return;
        }

        await loadScheduleById(id, {
            successMessage: 'Saved schedule opened. You can edit it and save new monthly activity.'
        });
    }

    async function loadScheduleById(id, options = {}) {
        setScheduleStatus('Opening saved schedule...', 'info');

        try {
            const payload = await apiJson(`/schedules/${encodeURIComponent(id)}`);
            const schedule = payload.schedule || {};
            const data = schedule.datos_json || {};

            scheduleRows = normalizeLoadedScheduleRows(data.rows || []);
            scheduleStoreCount = countScheduleStores(scheduleRows);
            currentScheduleId = schedule.id;
            linkedDocumentIds = Array.isArray(payload.documentIds) ? payload.documentIds : [];

            const nameInput = document.getElementById('pmScheduleName');
            if (nameInput) nameInput.value = schedule.nombre || 'Schedule 2026';

            renderSchedulePreview(getScheduleResult());
            const message = options.successMessage || 'Saved schedule opened. You can edit it and save new monthly activity.';
            setScheduleStatus(message, 'success');
            showServerResult('success', 'Schedule opened', message);
            return true;
        } catch (error) {
            setScheduleStatus(error.message || 'Saved schedule could not be opened.', 'error');
            showServerResult('error', 'Open failed', error.message || 'Saved schedule could not be opened.');
            return false;
        }
    }

    function addMonthlyActivity() {
        const store = document.getElementById('pmMonthStoreSelect')?.value || '';
        const month = Number(document.getElementById('pmMonthSelect')?.value || 0);
        const collected = parseMoney(document.getElementById('pmMonthCollected')?.value);
        const paidOrAccrual = parseMoney(document.getElementById('pmMonthPaid')?.value);
        const dateValue = document.getElementById('pmMonthDate')?.value || '';
        const memo = document.getElementById('pmMonthMemo')?.value.trim() || `${MONTH_NAMES[month]} update`;
        const summaryRow = findStoreSummaryRow(store);

        if (!scheduleRows.length || !summaryRow) {
            setScheduleStatus('Open a schedule and choose a valid store first.', 'error');
            return;
        }

        if (!month || !COLLECTED_COL_BY_MONTH[month]) {
            setScheduleStatus('Choose a valid month.', 'error');
            return;
        }

        if (!collected && !paidOrAccrual) {
            setScheduleStatus('Enter a collected, paid, or accrual amount.', 'error');
            return;
        }

        const collectedColumn = COLLECTED_COL_BY_MONTH[month];
        if (collected) {
            const normalizedCollected = collected > 0 ? -Math.abs(collected) : collected;
            summaryRow[collectedColumn] = roundMoney(Number(summaryRow[collectedColumn] || 0) + normalizedCollected);
        }

        if (paidOrAccrual) {
            const paidColumn = PAID_COL_BY_MONTH[month];
            const accrualColumn = ACCRUAL_COL_BY_MONTH[month];

            if (paidColumn !== undefined) {
                insertRowForStore(store, createManualStoreRow({
                    summaryRow,
                    store,
                    month,
                    amount: paidOrAccrual,
                    dateValue,
                    memo
                }));
            } else if (accrualColumn !== undefined) {
                summaryRow[accrualColumn] = roundMoney(Number(summaryRow[accrualColumn] || 0) + paidOrAccrual);
            }
        }

        recalculateScheduleRows();
        renderSchedulePreview(getScheduleResult());
        clearMonthInputs();
        setScheduleStatus(`${MONTH_NAMES[month]} activity was added to store ${store}. Save the schedule to keep it in the database.`, 'success');
    }

    function addManualStoreRow() {
        const store = document.getElementById('pmMonthStoreSelect')?.value || '';
        const month = Number(document.getElementById('pmMonthSelect')?.value || 0);
        const collected = parseMoney(document.getElementById('pmMonthCollected')?.value);
        const paidOrAccrual = parseMoney(document.getElementById('pmMonthPaid')?.value);
        const dateValue = document.getElementById('pmMonthDate')?.value || '';
        const memo = document.getElementById('pmMonthMemo')?.value.trim() || `${MONTH_NAMES[month]} manual row`;
        const summaryRow = findStoreSummaryRow(store);

        if (!scheduleRows.length || !summaryRow) {
            setScheduleStatus('Open a schedule and choose a valid store first.', 'error');
            return;
        }

        if (!month || !COLLECTED_COL_BY_MONTH[month]) {
            setScheduleStatus('Choose a valid month.', 'error');
            return;
        }

        if (!memo.trim()) {
            setScheduleStatus('Enter a reference before adding a row.', 'error');
            return;
        }

        insertRowForStore(store, createManualStoreRow({
            summaryRow,
            store,
            month,
            amount: paidOrAccrual || 0,
            collected: collected || 0,
            dateValue,
            memo
        }));

        recalculateScheduleRows();
        renderSchedulePreview(getScheduleResult());
        clearMonthInputs();
        setScheduleStatus(`A new row was added inside store ${store}. Save the schedule to keep it in the database.`, 'success');
    }

    function handleScheduleCellEdit(event) {
        const cell = event.target.closest('td[data-row-index][data-column-index]');
        if (!cell || !cell.classList.contains('is-editable')) return;

        const rowIndex = Number(cell.dataset.rowIndex);
        const columnIndex = Number(cell.dataset.columnIndex);
        const row = scheduleRows[rowIndex];

        if (!row) return;

        row[columnIndex] = parseEditableScheduleValue(cell.textContent, columnIndex);
        recalculateScheduleRows();
        renderSchedulePreview(getScheduleResult());
        setScheduleStatus('Table updated. Save the schedule to keep these changes.', 'info');
    }

    function createManualStoreRow({ summaryRow, store, month, amount, collected = 0, dateValue, memo }) {
        const row = emptyScheduleRow();
        const paidColumn = PAID_COL_BY_MONTH[month];
        const accrualColumn = ACCRUAL_COL_BY_MONTH[month];
        const collectedColumn = COLLECTED_COL_BY_MONTH[month];
        const parsedDate = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();

        row[0] = memo;
        row[1] = store;
        row[2] = summaryRow[2] || '';
        row[3] = 241000;
        row[4] = 'Manual entry';
        row[5] = summaryRow[5] || '';
        row[6] = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
        row[7] = roundMoney(amount);

        if (paidColumn !== undefined) {
            row[paidColumn] = roundMoney(amount);
        } else if (accrualColumn !== undefined) {
            row[accrualColumn] = roundMoney(amount);
        }

        if (collected && collectedColumn !== undefined) {
            row[collectedColumn] = roundMoney(collected > 0 ? -Math.abs(collected) : collected);
        }

        row[33] = sumRowBalance(row);
        return row;
    }

    function insertRowForStore(store, row) {
        const lastStoreIndex = findLastStoreRowIndex(store);
        const insertAt = lastStoreIndex >= 0 ? lastStoreIndex + 1 : scheduleRows.length;

        scheduleRows.splice(insertAt, 0, row);
    }

    function findLastStoreRowIndex(store) {
        const normalizedStore = String(store || '');

        for (let index = scheduleRows.length - 1; index >= 0; index -= 1) {
            if (String(scheduleRows[index][1] || '') === normalizedStore) return index;
        }

        return -1;
    }

    function findStoreSummaryRow(store) {
        return scheduleRows.find(row =>
            row[0] === 'Sales Tax' &&
            String(row[1] || '') === String(store || '')
        );
    }

    function getScheduleResult() {
        recalculateScheduleRows();
        return {
            rows: scheduleRows,
            storeCount: countScheduleStores(scheduleRows),
            totalBalance: getScheduleTotalBalance(scheduleRows)
        };
    }

    function recalculateScheduleRows() {
        const groups = new Map();

        scheduleRows.forEach((row, index) => {
            const store = String(row[1] || '').trim();
            if (!store) return;
            if (!groups.has(store)) groups.set(store, []);
            groups.get(store).push(index);
            row[33] = sumRowBalance(row);
            row[34] = '';
            row[35] = '';
        });

        groups.forEach(indexes => {
            const total = roundMoney(indexes.reduce(
                (sum, index) => sum + Number(scheduleRows[index][33] || 0),
                0
            ));
            const lastIndex = indexes[indexes.length - 1];
            const summary = indexes.map(index => scheduleRows[index]).find(row => row[0] === 'Sales Tax');

            scheduleRows[lastIndex][34] = total;
            indexes.forEach(index => {
                const row = scheduleRows[index];
                if (String(row[0] || '').includes('Q1 RETURN')) {
                    row[35] = roundMoney(total - Number(summary?.[16] || 0));
                }
            });
        });

        scheduleStoreCount = groups.size;
    }

    function countScheduleStores(rows) {
        return new Set(rows.map(row => String(row[1] || '').trim()).filter(Boolean)).size;
    }

    function getScheduleTotalBalance(rows) {
        return roundMoney(rows.reduce((total, row) => total + Number(row[34] || 0), 0));
    }

    function getLatestScheduleMonth(rows) {
        for (let month = 12; month >= 1; month -= 1) {
            const collectedColumn = COLLECTED_COL_BY_MONTH[month];
            const paidColumn = PAID_COL_BY_MONTH[month];
            const accrualColumn = ACCRUAL_COL_BY_MONTH[month];
            const hasData = rows.some(row =>
                Number(row[collectedColumn] || 0) ||
                Number(row[paidColumn] || 0) ||
                Number(row[accrualColumn] || 0)
            );

            if (hasData) return month;
        }

        return null;
    }

    function updateMonthEditor() {
        const editor = document.getElementById('pmMonthEditor');
        const storeSelect = document.getElementById('pmMonthStoreSelect');
        if (!editor || !storeSelect) return;

        const stores = Array.from(
            new Set(scheduleRows.map(row => String(row[1] || '').trim()).filter(Boolean))
        ).sort(naturalSort);

        editor.hidden = !stores.length;
        storeSelect.innerHTML = stores.map(store =>
            `<option value="${escapeHtml(store)}">${escapeHtml(store)}</option>`
        ).join('');
    }

    function clearMonthInputs() {
        ['pmMonthCollected', 'pmMonthPaid', 'pmMonthMemo'].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });
    }

    function setDefaultScheduleName() {
        const input = document.getElementById('pmScheduleName');
        if (input) input.value = `Schedule ${getScheduleYear(scheduleRows) || 2026}`;
    }

    function getScheduleName() {
        const value = document.getElementById('pmScheduleName')?.value.trim();
        return value || `Schedule ${getScheduleYear(scheduleRows) || 2026}`;
    }

    function setDefaultMonthDate() {
        const input = document.getElementById('pmMonthDate');
        if (input && !input.value) input.value = new Date().toISOString().slice(0, 10);
    }

    function serializeScheduleRows(rows) {
        return rows.map(row => row.map(value =>
            value instanceof Date ? value.toISOString() : value
        ));
    }

    function normalizeLoadedScheduleRows(rows) {
        return rows.map(row => {
            const normalized = emptyScheduleRow();

            for (let index = 0; index < normalized.length; index += 1) {
                const value = Array.isArray(row) ? row[index] : '';
                normalized[index] = normalizeLoadedScheduleValue(value, index);
            }

            return normalized;
        });
    }

    function normalizeLoadedScheduleValue(value, columnIndex) {
        if (value === null || value === undefined) return '';
        if (columnIndex === 6) {
            return parseDateValue(value) || value;
        }
        if (isNumericScheduleColumn(columnIndex)) {
            const parsed = parseMoney(value);
            return parsed === null ? '' : roundMoney(parsed);
        }

        return value;
    }

    function parseEditableScheduleValue(value, columnIndex) {
        const text = String(value || '').trim();
        if (!text) return '';
        if (columnIndex === 6) return parseDateValue(text) || text;
        if (isNumericScheduleColumn(columnIndex)) {
            const parsed = parseMoney(text);
            return parsed === null ? '' : roundMoney(parsed);
        }

        return text;
    }

    function isNumericScheduleColumn(index) {
        return index === 3 || (index >= 7 && index <= 35);
    }

    function isEditableScheduleColumn(index) {
        return index >= 0 && index <= 32;
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
        const apiBase = String(window.API_URL || '').replace(/\/$/, '');
        const token = localStorage.getItem('token');

        if (!apiBase) throw new Error('API_URL is not configured');
        if (!token) throw new Error('Your session token was not found. Sign in again.');

        return fetch(`${apiBase}${PM_API}${path}`, {
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

    function setScheduleStatus(message, type) {
        const status = document.getElementById('pmScheduleStatus');
        if (!status) return;

        status.textContent = message;
        status.classList.toggle('is-error', type === 'error');
        status.classList.toggle('is-success', type === 'success');
        status.classList.toggle('is-warning', type === 'warning');

        if (['error', 'success', 'warning'].includes(type)) {
            showPmAlert({
                type,
                title: getAlertTitle(type),
                message
            });
        }
    }

    function showServerLoading(title, message) {
        if (!window.Swal) {
            showPmAlert({ type: 'info', title, message, timeout: 0 });
            return;
        }

        window.Swal.fire({
            title,
            text: message,
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => window.Swal.showLoading()
        });
    }

    function showServerResult(type, title, message) {
        if (!window.Swal) {
            showPmAlert({ type, title, message });
            return;
        }

        window.Swal.fire({
            icon: type === 'warning' ? 'warning' : type === 'error' ? 'error' : 'success',
            title,
            text: message,
            confirmButtonText: 'OK',
            confirmButtonColor: '#102a43'
        });
    }

    function showPmAlert({ type = 'info', title = 'Notice', message = '', timeout = 6500 }) {
        const stack = document.getElementById('pmAlertStack');
        if (!stack || !message) return;

        const alert = document.createElement('article');
        const id = `pm-alert-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const icon = getAlertIcon(type);

        alert.className = `pm-alert is-${type}`;
        alert.id = id;
        alert.setAttribute('role', type === 'error' ? 'alert' : 'status');
        alert.innerHTML = `
            <i class="fa-solid ${icon}" aria-hidden="true"></i>
            <div>
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(message)}</span>
            </div>
            <button type="button" data-pm-alert-close="${escapeHtml(id)}" aria-label="Close alert">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
        `;

        stack.prepend(alert);

        while (stack.children.length > 4) {
            stack.lastElementChild?.remove();
        }

        if (timeout) {
            window.setTimeout(() => {
                document.getElementById(id)?.remove();
            }, timeout);
        }
    }

    function handleAlertDismiss(event) {
        const button = event.target.closest('[data-pm-alert-close]');
        if (!button) return;

        document.getElementById(button.dataset.pmAlertClose)?.remove();
    }

    function getAlertTitle(type) {
        if (type === 'success') return 'Done';
        if (type === 'error') return 'Action needed';
        if (type === 'warning') return 'Check this';
        return 'Notice';
    }

    function getAlertIcon(type) {
        if (type === 'success') return 'fa-circle-check';
        if (type === 'error') return 'fa-triangle-exclamation';
        if (type === 'warning') return 'fa-circle-exclamation';
        return 'fa-circle-info';
    }

    function findHeaderRow(rows, requiredLabels) {
        const normalizedLabels = requiredLabels.map(normalizeHeader);

        return rows.findIndex(row => {
            const normalizedRow = row.map(normalizeHeader);
            return normalizedLabels.every(label =>
                normalizedRow.some(cell => cell.includes(label))
            );
        });
    }

    function findHeaderIndex(headers, label) {
        const normalizedLabel = normalizeHeader(label);
        return headers.findIndex(header => header.includes(normalizedLabel));
    }

    function parseMoney(value) {
        if (typeof value === 'number') return value;
        if (value instanceof Date) return null;

        const text = String(value ?? '').trim();
        if (!text || /^nan$/i.test(text)) return null;

        const negative = /^\(.*\)$/.test(text);
        const cleaned = text.replace(/[$,()]/g, '').trim();
        const number = Number(cleaned);

        if (!Number.isFinite(number)) return null;
        return negative ? -number : number;
    }

    function parseDateValue(value) {
        if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
        if (typeof value === 'number') {
            const parsed = window.XLSX?.SSF?.parse_date_code?.(value);
            if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
        }

        const text = String(value || '').trim();
        if (!text) return null;

        const parts = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (parts) {
            return new Date(Number(parts[3]), Number(parts[1]) - 1, Number(parts[2]));
        }

        const date = new Date(text);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function cleanLocation(value) {
        const text = String(value ?? '').trim();
        if (!text || /^nan$/i.test(text)) return '';
        if (/total|grand total|balance forward/i.test(text)) return '';
        return text;
    }

    function inferStoreEntity(transactions, location) {
        const fromTransaction = transactions.map(item => item.entity).find(Boolean);
        return fromTransaction || inferEntity('', location);
    }

    function inferEntity(memo, location) {
        const text = String(memo || '').toUpperCase();
        const q1Match = text.match(/Q1 RETURN\s+([A-Z0-9]{2,5})\b/);

        if (q1Match) return normalizeEntityCode(q1Match[1]);

        for (const [keyword, entity] of ENTITY_KEYWORDS) {
            if (text.includes(keyword)) return entity;
        }

        const locationText = String(location || '').toUpperCase();
        if (locationText.endsWith('GS')) return 'GSCB';
        if (locationText.endsWith('N2B')) return 'N2B';

        return '';
    }

    function normalizeEntityCode(code) {
        const normalized = String(code || '').toUpperCase();
        const aliases = {
            EBR: 'EB',
            QCI: 'QE',
            QES: 'QE',
            GSC: 'GSCB'
        };
        return aliases[normalized] || normalized;
    }

    function naturalSort(a, b) {
        return String(a).localeCompare(String(b), undefined, {
            numeric: true,
            sensitivity: 'base'
        });
    }

    function roundMoney(value) {
        return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(Number(value || 0));
    }

    function formatNumber(value) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Number(value || 0));
    }

    function formatDateForDisplay(value) {
        if (!(value instanceof Date)) return '';
        return `${String(value.getMonth() + 1).padStart(2, '0')}/${String(value.getDate()).padStart(2, '0')}/${value.getFullYear()}`;
    }

    function timestampForFile() {
        const now = new Date();
        return [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0')
        ].join('-');
    }

    function getScheduleYear(rows) {
        const date = rows.flat().find(value => value instanceof Date);
        return date ? date.getFullYear() : new Date().getFullYear();
    }

    function loadRequests() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function saveRequests() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
        } catch (error) {
            console.warn('Property Management requests could not be saved:', error);
        }
    }

    function handleSubmit(event) {
        event.preventDefault();

        const form = event.currentTarget;
        const title = document.getElementById('pmRequestTitle')?.value.trim();
        const property = document.getElementById('pmPropertyName')?.value.trim();

        if (!title || !property) return;

        requests.unshift({
            id: `pm-${Date.now()}`,
            title,
            property,
            category: document.getElementById('pmCategory')?.value || 'Other',
            priority: document.getElementById('pmPriority')?.value || 'Normal',
            dueDate: document.getElementById('pmDueDate')?.value || '',
            notes: document.getElementById('pmNotes')?.value.trim() || '',
            stage: 'intake',
            createdAt: new Date().toISOString()
        });

        saveRequests();
        form.reset();
        render();
    }

    function handleBoardClick(event) {
        const button = event.target.closest('[data-pm-action]');
        if (!button) return;

        const id = button.dataset.requestId;
        const action = button.dataset.pmAction;
        const request = requests.find(item => item.id === id);
        if (!request) return;

        if (action === 'next') {
            moveRequest(request, 1);
        } else if (action === 'previous') {
            moveRequest(request, -1);
        } else if (action === 'complete') {
            request.stage = 'completed';
        } else if (action === 'delete') {
            requests = requests.filter(item => item.id !== id);
        }

        saveRequests();
        render();
    }

    function moveRequest(request, direction) {
        const index = STAGES.indexOf(request.stage);
        const nextIndex = Math.min(
            STAGES.length - 1,
            Math.max(0, index + direction)
        );
        request.stage = STAGES[nextIndex] || 'intake';
    }

    function getVisibleRequests() {
        return requests.filter(request => {
            const matchesStage = !stageFilter || request.stage === stageFilter;
            const text = normalize([
                request.title,
                request.property,
                request.category,
                request.priority,
                request.notes
            ].join(' '));

            return matchesStage && (!searchTerm || text.includes(searchTerm));
        });
    }

    function render() {
        const visibleRequests = getVisibleRequests();

        STAGES.forEach(stage => {
            const list = document.querySelector(`[data-stage-list="${stage}"]`);
            const count = document.querySelector(`[data-stage-count="${stage}"]`);
            const stageRequests = visibleRequests.filter(request => request.stage === stage);

            if (count) count.textContent = String(stageRequests.length);
            if (!list) return;

            list.innerHTML = stageRequests.length
                ? stageRequests.map(renderRequestCard).join('')
                : `<div class="pm-stage-empty">No ${escapeHtml(STAGE_LABELS[stage].toLowerCase())} requests</div>`;
        });

        renderMetrics();
    }

    function renderMetrics() {
        const open = requests.filter(request => request.stage !== 'completed').length;
        const completed = requests.filter(request => request.stage === 'completed').length;
        const due = requests.filter(request =>
            request.stage !== 'completed' && isDueThisWeek(request.dueDate)
        ).length;

        setText('pmOpenCount', open);
        setText('pmDueCount', due);
        setText('pmCompletedCount', completed);
    }

    function renderRequestCard(request) {
        const stageIndex = STAGES.indexOf(request.stage);
        const canMovePrevious = stageIndex > 0;
        const canMoveNext = stageIndex >= 0 && stageIndex < STAGES.length - 1;
        const priorityClass = request.priority === 'Urgent' ? 'is-urgent' : '';

        return `
            <article class="pm-request-card" data-request-card="${escapeHtml(request.id)}">
                <div>
                    <h3>${escapeHtml(request.title)}</h3>
                    <p>${escapeHtml(request.property)}</p>
                </div>
                <div class="pm-request-meta">
                    <span>${escapeHtml(request.category)}</span>
                    <span class="${priorityClass}">${escapeHtml(request.priority)}</span>
                    ${request.dueDate ? `<span>Due ${escapeHtml(formatDate(request.dueDate))}</span>` : ''}
                </div>
                ${request.notes ? `<p>${escapeHtml(request.notes)}</p>` : ''}
                <div class="pm-request-actions">
                    ${canMovePrevious ? actionButton('previous', request.id, 'Back') : ''}
                    ${canMoveNext ? actionButton('next', request.id, 'Next', 'is-primary') : ''}
                    ${request.stage !== 'completed' ? actionButton('complete', request.id, 'Complete') : ''}
                    ${actionButton('delete', request.id, 'Delete', 'is-danger')}
                </div>
            </article>
        `;
    }

    function actionButton(action, id, label, className = '') {
        return `
            <button
                type="button"
                class="pm-card-action ${className}"
                data-pm-action="${action}"
                data-request-id="${escapeHtml(id)}"
            >
                ${escapeHtml(label)}
            </button>
        `;
    }

    function isDueThisWeek(value) {
        if (!value) return false;

        const due = new Date(`${value}T00:00:00`);
        if (Number.isNaN(due.getTime())) return false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const weekEnd = new Date(today);
        weekEnd.setDate(today.getDate() + 7);

        return due >= today && due <= weekEnd;
    }

    function formatDate(value) {
        if (!value) return '';
        const [year, month, day] = value.split('-');
        return month && day && year ? `${month}/${day}/${year}` : value;
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

    function decodeDispositionFilename(disposition) {
        const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (encoded) return decodeURIComponent(encoded[1]);

        const plain = disposition.match(/filename="?([^"]+)"?/i);
        return plain ? plain[1] : '';
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value);
    }

    function normalize(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function normalizeHeader(value) {
        return normalize(value)
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
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
