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
        'JANUARY PAID \nP01.26',
        'JANUARY COLLECTED P01.26',
        'FEBRUARY PAID P02.26',
        'FEBRUARY COLLECTED P02.26',
        'MARCH PAID P03.26',
        'MARCH COLLECTED P03.26',
        'APRIL PAID P04.26',
        'APRIL COLLECTED P04.26',
        'MAY PAID P05.26',
        'MAY COLLECTED P05.26',
        'JUNE PAID P06.26',
        'JUNE COLLECTED P06.26',
        'JULY PAID P07.26',
        'JULY COLLECTED P07.26',
        'AUGUST PAID P08.26',
        'AUGUST COLLECTED P08.26',
        'SEPTEMBER PAID P09.26',
        'SEPEMBER COLLECTED P09.26',
        'OCTOBER PAID P10.26',
        'OCTOBER COLLECTED P10.26',
        'NOVEMBER PAID P11.26',
        'NOVEMBER COLLECTED P11.26',
        'DECEMBER PAID P12.26',
        'DECEMBER COLLECTED P12.26',
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
    const PAID_COL_BY_MONTH = {
        1: 9,
        2: 11,
        3: 13,
        4: 15,
        5: 17,
        6: 19,
        7: 21,
        8: 23,
        9: 25,
        10: 27,
        11: 29,
        12: 31
    };
    const COLLECTED_COL_BY_MONTH = {
        1: 10,
        2: 12,
        3: 14,
        4: 16,
        5: 18,
        6: 20,
        7: 22,
        8: 24,
        9: 26,
        10: 28,
        11: 30,
        12: 32
    };
    const ACCRUAL_COL_BY_MONTH = {};
    const IMPORT_REFERENCE_PREFIX = 'Imported monthly GL';
    const MONTH_ALIASES = [
        [1, ['JANUARY', 'JAN']],
        [2, ['FEBRUARY', 'FEB']],
        [3, ['MARCH', 'MAR']],
        [4, ['APRIL', 'APR']],
        [5, ['MAY']],
        [6, ['JUNE', 'JUN']],
        [7, ['JULY', 'JUL']],
        [8, ['AUGUST', 'AUG']],
        [9, ['SEPTEMBER', 'SEPT', 'SEP']],
        [10, ['OCTOBER', 'OCT']],
        [11, ['NOVEMBER', 'NOV']],
        [12, ['DECEMBER', 'DEC']]
    ];
    const QUARTER_MONTHS = {
        1: [1, 2, 3],
        2: [4, 5, 6],
        3: [7, 8, 9],
        4: [10, 11, 12]
    };


    function createPredefinedScheduleRows() {
        return PREDEFINED_SCHEDULE_BASE_ROWS.map(row => {
            const normalized = emptyScheduleRow();

            for (let index = 0; index < normalized.length; index += 1) {
                normalized[index] = row[index] ?? '';
            }

            return normalized;
        });
    }

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

    let orgChartEntityByLocation = new Map();
    let propertyEntities = [];
    let editingEntityId = null;
    let requests = [];
    let searchTerm = '';
    let stageFilter = '';
    let scheduleRows = [];
    let scheduleStoreCount = 0;
    let currentScheduleId = null;
    let linkedDocumentIds = [];
    let pendingSourceDocuments = [];

    let isLoadingDimensionBalance = false;
    let isImportingMonthlyFiles = false;

    let savedSchedules = [];
    let propertyDocuments = [];
    let selectedQuarterReview = 1;
    let quarterStoreModalState = {
        storeKey: '',
        quarter: '',
        search: '',
        entity: '',
        status: ''
    };
    let scheduleFilters = {
        search: '',
        store: '',
        entity: '',
        month: '',
        rowType: ''
    };

    function initializeUploadDropzone(inputId, dropzoneSelector) {
        const input = document.getElementById(inputId);
        const dropzone = document.querySelector(dropzoneSelector);

        if (!input || !dropzone) return;

        const setDragState = (isDragging) => {
            dropzone.classList.toggle('is-dragover', isDragging);
        };

        dropzone.addEventListener('dragenter', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragState(true);
        });

        dropzone.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragState(true);

            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'copy';
            }
        });

        dropzone.addEventListener('dragleave', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (event.relatedTarget && dropzone.contains(event.relatedTarget)) {
                return;
            }

            setDragState(false);
        });

        dropzone.addEventListener('drop', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragState(false);

            const files = event.dataTransfer?.files;
            if (!files?.length) return;

            const dataTransfer = new DataTransfer();
            Array.from(files).forEach(file => dataTransfer.items.add(file));

            input.files = dataTransfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

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
            .getElementById('pmDimensionBalanceFile')
            ?.addEventListener('change', handleDimensionBalanceFileChange);

        document
            .getElementById('pmMonthlyLedgerFile')
            ?.addEventListener('change', handleMonthlyLedgerFileChange);

        document
            .getElementById('pmClearDimensionBalanceFileBtn')
            ?.addEventListener('click', clearDimensionBalanceFile);

        document
            .getElementById('pmClearMonthlyLedgerFileBtn')
            ?.addEventListener('click', clearMonthlyLedgerFiles);





        document
            .getElementById('pmSaveScheduleBtn')
            ?.addEventListener('click', saveCurrentSchedule);

        document
            .getElementById('pmLoadScheduleBtn')
            ?.addEventListener('click', loadSelectedSchedule);


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

        document
            .getElementById('pmQuarterReviewCards')
            ?.addEventListener('click', handleQuarterReviewCardClick);

        document
            .getElementById('pmManageEntitiesBtn')
            ?.addEventListener('click', openEntitiesModal);

        document
            .querySelectorAll('[data-pm-close-entities]')
            .forEach(button => button.addEventListener('click', closeEntitiesModal));

        document
            .getElementById('pmImportEntitiesBtn')
            ?.addEventListener('click', importEntitiesFromFile);

        document
            .getElementById('pmEntityForm')
            ?.addEventListener('submit', saveEntityFromForm);

        document
            .getElementById('pmClearEntityFormBtn')
            ?.addEventListener('click', clearEntityForm);

        document
            .getElementById('pmEntitiesTableBody')
            ?.addEventListener('click', handleEntityTableAction);

        document
            .getElementById('pmChooseEntitiesFileBtn')
            ?.addEventListener('click', function () {
                document.getElementById('pmEntitiesImportFile')?.click();
            });

        document
            .getElementById('pmEntitiesImportFile')
            ?.addEventListener('change', updateSelectedEntitiesFileName);

        document
            .getElementById('pmToggleEntityFormBtn')
            ?.addEventListener('click', function () {
                showEntityForm('add');
            });

        document
            .getElementById('pmCancelEntityFormBtn')
            ?.addEventListener('click', function () {
                clearEntityForm();
                hideEntityForm();
            });

        document
            .getElementById('pmStoreQuarterOverview')
            ?.addEventListener('click', handleStoreQuarterOverviewClick);

        document
            .querySelectorAll('[data-pm-close-quarter-store]')
            .forEach(button => button.addEventListener('click', closeQuarterStoreModal));

        document
            .getElementById('pmQuarterModalSearch')
            ?.addEventListener('input', handleQuarterModalFilterChange);

        document
            .getElementById('pmQuarterModalQuarter')
            ?.addEventListener('change', handleQuarterModalFilterChange);

        document
            .getElementById('pmQuarterModalEntity')
            ?.addEventListener('change', handleQuarterModalFilterChange);

        document
            .getElementById('pmQuarterModalStatus')
            ?.addEventListener('change', handleQuarterModalFilterChange);

        document
            .getElementById('pmQuarterModalClearFiltersBtn')
            ?.addEventListener('click', clearQuarterModalFilters);


        initializeUploadDropzone('pmDimensionBalanceFile', 'label[for="pmDimensionBalanceFile"]');
        initializeUploadDropzone('pmMonthlyLedgerFile', 'label[for="pmMonthlyLedgerFile"]');

        updateUploadFileLabel(
            'pmDimensionBalanceFile',
            'pmDimensionBalanceFileName',
            'pmClearDimensionBalanceFileBtn'
        );

        updateUploadFileLabel(
            'pmMonthlyLedgerFile',
            'pmMonthlyLedgerFileName',
            'pmClearMonthlyLedgerFileBtn'
        );

        setDefaultMonthDate();
        initializePredefinedSchedule({ showStatus: false });
        render();
        refreshPersistedData().finally(openScheduleFromQuery);
        loadPropertyEntities();
    });

    function updateEntitiesImportVisibility() {
        const importCard = document.getElementById('pmEntitiesImportCard');

        if (!importCard) return;

        importCard.hidden = propertyEntities.length > 0;
    }

    function updateEntitiesCountLabel() {
        const label = document.getElementById('pmEntitiesCountLabel');

        if (!label) return;

        label.textContent = propertyEntities.length
            ? `${propertyEntities.length} entities loaded.`
            : 'No entities loaded.';
    }

    function showEntityForm(mode = 'add') {
        const card = document.getElementById('pmEntityFormCard');
        const title = document.getElementById('pmEntityFormTitle');

        if (!card) return;

        card.hidden = false;

        if (title) {
            title.textContent = mode === 'edit'
                ? 'Edit entity'
                : 'Add entity';
        }

        card.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
        });
    }

    function hideEntityForm() {
        const card = document.getElementById('pmEntityFormCard');

        if (!card) return;

        card.hidden = true;
    }

    function updateSelectedEntitiesFileName() {
        const input = document.getElementById('pmEntitiesImportFile');
        const label = document.getElementById('pmEntitiesImportFileName');
        const file = input?.files?.[0];

        if (!label) return;

        label.textContent = file
            ? file.name
            : 'No file selected';
    }

    async function loadPropertyEntities() {
        try {
            const payload = await apiJson('/entities');
            propertyEntities = payload.entities || [];

            orgChartEntityByLocation = new Map(
                propertyEntities.map(item => [
                    String(item.location || '').trim(),
                    String(item.entity_code || '').trim().toUpperCase()
                ])
            );

            renderEntitiesModalTable();
            updateEntitiesImportVisibility();
            updateEntitiesCountLabel();

            applyOrgChartEntitiesToScheduleRows();
            renderSchedulePreview(getScheduleResult());
        } catch (error) {
            console.warn('Property entities could not be loaded:', error);
            propertyEntities = [];
            orgChartEntityByLocation = new Map();

            renderEntitiesModalTable();
            updateEntitiesImportVisibility();
            updateEntitiesCountLabel();
        }
    }

    function openEntitiesModal() {
        document.body.classList.add('pm-modal-open');
        document.getElementById('pmEntitiesModal')?.removeAttribute('hidden');
        hideEntityForm();
        renderEntitiesModalTable();
        updateEntitiesImportVisibility();
        updateEntitiesCountLabel();
    }

    function closeEntitiesModal() {
        document.body.classList.remove('pm-modal-open');
        document.getElementById('pmEntitiesModal')?.setAttribute('hidden', '');
    }

    function renderEntitiesModalTable() {
        const tbody = document.getElementById('pmEntitiesTableBody');
        if (!tbody) return;

        if (!propertyEntities.length) {
            tbody.innerHTML = `
            <tr>
                <td colspan="6" class="pm-entities-empty">
                    No entities loaded.
                </td>
            </tr>
        `;
            return;
        }

        tbody.innerHTML = propertyEntities.map(entity => `
        <tr>
            <td>
                <strong>${escapeHtml(entity.location || '')}</strong>
            </td>
            <td>
                <span class="pm-entity-chip">${escapeHtml(entity.entity_code || '')}</span>
            </td>
            <td>${escapeHtml(entity.brand || '')}</td>
            <td>${escapeHtml(entity.entity_legal_name || '')}</td>
            <td>${escapeHtml(entity.other_id || '')}</td>
            <td>
    <div class="pm-entity-row-actions">
        <button
            type="button"
            class="pm-icon-btn"
            data-pm-edit-entity="${escapeHtml(entity.id)}"
            title="Edit"
            aria-label="Edit entity"
        >
            <i class="fa-solid fa-pen" aria-hidden="true"></i>
        </button>

        <button
            type="button"
            class="pm-icon-btn is-danger"
            data-pm-delete-entity="${escapeHtml(entity.id)}"
            title="Delete"
            aria-label="Delete entity"
        >
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
        </button>
    </div>
</td>
        </tr>
    `).join('');
    }

    function updateSelectedEntitiesFileName() {
        const input = document.getElementById('pmEntitiesImportFile');
        const label = document.getElementById('pmEntitiesImportFileName');
        const file = input?.files?.[0];

        if (!label) return;

        label.textContent = file
            ? file.name
            : 'No file selected';
    }

    async function importEntitiesFromFile() {
        const input = document.getElementById('pmEntitiesImportFile');
        const file = input?.files?.[0];

        if (!file) {
            setScheduleStatus('Choose the ENTITIES ORG CHART file first.', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('orgChart', file);

        setScheduleStatus('Importing entities...', 'info');

        try {
            const response = await apiFetch('/entities/import', {
                method: 'POST',
                body: formData
            });

            const payload = await readJsonResponse(response);

            if (!response.ok || payload.success === false) {
                throw new Error(payload.message || 'Entities could not be imported');
            }

            if (input) input.value = '';
            updateSelectedEntitiesFileName();

            await loadPropertyEntities();
            hideEntityForm();

            setScheduleStatus(`Entities imported: ${payload.imported}`, 'success');
        } catch (error) {
            setScheduleStatus(error.message || 'Entities could not be imported.', 'error');
        }
    }

    async function saveEntityFromForm(event) {
        event.preventDefault();

        const id = document.getElementById('pmEntityId')?.value || '';
        const payload = {
            location: document.getElementById('pmEntityLocation')?.value || '',
            entity_code: document.getElementById('pmEntityCode')?.value || '',
            brand: document.getElementById('pmEntityBrand')?.value || '',
            entity_legal_name: document.getElementById('pmEntityLegalName')?.value || '',
            entity_short_name: document.getElementById('pmEntityShortName')?.value || '',
            other_id: document.getElementById('pmEntityOtherId')?.value || ''
        };

        const path = id ? `/entities/${encodeURIComponent(id)}` : '/entities';
        const method = id ? 'PUT' : 'POST';

        try {
            await apiJson(path, {
                method,
                body: payload
            });

            clearEntityForm();
            await loadPropertyEntities();
            hideEntityForm();

            setScheduleStatus('Entity saved.', 'success');
        } catch (error) {
            setScheduleStatus(error.message || 'Entity could not be saved.', 'error');
        }
    }

    function clearEntityForm() {
        editingEntityId = null;

        [
            'pmEntityId',
            'pmEntityLocation',
            'pmEntityCode',
            'pmEntityBrand',
            'pmEntityLegalName',
            'pmEntityShortName',
            'pmEntityOtherId'
        ].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });

        const title = document.getElementById('pmEntityFormTitle');

        if (title) {
            title.textContent = 'Add entity';
        }
    }
    async function handleEntityTableAction(event) {
        const editButton = event.target.closest('[data-pm-edit-entity]');
        const deleteButton = event.target.closest('[data-pm-delete-entity]');

        if (editButton) {
            const entity = propertyEntities.find(item =>
                String(item.id) === String(editButton.dataset.pmEditEntity)
            );

            if (!entity) return;

            editingEntityId = entity.id;

            document.getElementById('pmEntityId').value = entity.id;
            document.getElementById('pmEntityLocation').value = entity.location || '';
            document.getElementById('pmEntityCode').value = entity.entity_code || '';
            document.getElementById('pmEntityBrand').value = entity.brand || '';
            document.getElementById('pmEntityLegalName').value = entity.entity_legal_name || '';
            document.getElementById('pmEntityShortName').value = entity.entity_short_name || '';
            document.getElementById('pmEntityOtherId').value = entity.other_id || '';

            showEntityForm('edit');

            return;
        }

        if (deleteButton) {
            const id = deleteButton.dataset.pmDeleteEntity;

            if (!confirm('Delete this entity mapping?')) return;

            try {
                await apiJson(`/entities/${encodeURIComponent(id)}`, {
                    method: 'DELETE'
                });

                await loadPropertyEntities();
                setScheduleStatus('Entity deleted.', 'success');
            } catch (error) {
                setScheduleStatus(error.message || 'Entity could not be deleted.', 'error');
            }
        }
    }

    function getEntityByLocation(location, fallback = '') {
        const clean = String(location || '').trim();

        if (!clean) {
            return normalizeEntityCode(fallback);
        }

        const fromDatabase = orgChartEntityByLocation.get(clean);

        if (fromDatabase) {
            return normalizeEntityCode(fromDatabase);
        }

        const fallbackEntity = normalizeEntityCode(fallback);

        if (fallbackEntity) {
            return fallbackEntity;
        }

        return normalizeEntityCode(clean.slice(-2));
    }

    function applyOrgChartEntitiesToScheduleRows() {
        if (!scheduleRows.length) return;

        scheduleRows.forEach(row => {
            const location = String(row[1] || '').trim();
            if (!location) return;

            row[2] = getEntityByLocation(location, row[2]);
        });

        recalculateScheduleRows();
    }


    function initializePredefinedSchedule(options = {}) {
        const { showStatus = true } = options;

        scheduleRows = [];
        scheduleStoreCount = 0;
        currentScheduleId = null;
        linkedDocumentIds = [];
        pendingSourceDocuments = [];
        setDefaultScheduleName();
        renderSchedulePreview({ rows: [], storeCount: 0, totalBalance: 0 });

        if (showStatus) {
            setScheduleStatus(
                'Schedule layout ready. Upload the Dimension Balance report first, then import JAN, FEB, MAR, etc.',
                'info'
            );
        }
    }

    function updateUploadFileLabel(inputId, labelId, clearButtonId) {
        const input = document.getElementById(inputId);
        const label = document.getElementById(labelId);
        const button = document.getElementById(clearButtonId);
        const files = Array.from(input?.files || []);

        if (label) {
            if (!files.length) {
                label.innerHTML = `<span class="pm-upload-file-empty">No ${input?.multiple ? 'files' : 'file'} selected</span>`;
            } else {
                const visibleFiles = files.slice(0, 3);
                const hiddenCount = Math.max(files.length - visibleFiles.length, 0);
                const fileChips = visibleFiles.map(file => `
                    <span class="pm-upload-file-chip" title="${escapeHtml(file.name)}">
                        <i class="fa-solid fa-file-excel" aria-hidden="true"></i>
                        <span>${escapeHtml(file.name)}</span>
                    </span>
                `).join('');
                const countBadge = files.length > 1
                    ? `<span class="pm-upload-file-count">
                        <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
                        ${files.length} files selected
                    </span>`
                    : '';
                const moreBadge = hiddenCount
                    ? `<span class="pm-upload-file-more">+${hiddenCount} more</span>`
                    : '';

                label.innerHTML = `${countBadge}${fileChips}${moreBadge}`;
            }
        }

        if (button) {
            button.disabled = !files.length;
        }
    }

    async function handleDimensionBalanceFileChange() {
        updateUploadFileLabel(
            'pmDimensionBalanceFile',
            'pmDimensionBalanceFileName',
            'pmClearDimensionBalanceFileBtn'
        );

        const input = document.getElementById('pmDimensionBalanceFile');

        if (!input?.files?.length) return;

        await loadDimensionBalanceSchedule();
    }

    async function handleMonthlyLedgerFileChange() {
        updateUploadFileLabel(
            'pmMonthlyLedgerFile',
            'pmMonthlyLedgerFileName',
            'pmClearMonthlyLedgerFileBtn'
        );

        const input = document.getElementById('pmMonthlyLedgerFile');

        if (!input?.files?.length) return;

        if (!scheduleRows.length) {
            setScheduleStatus(
                'Monthly files selected. Upload the Dimension Balance report first.',
                'warning'
            );
            return;
        }

        await importMonthlyLedgerFile();
    }

    async function importPendingMonthlyFilesAfterDimension() {
        const monthlyInput = document.getElementById('pmMonthlyLedgerFile');

        if (!monthlyInput?.files?.length) return;
        if (!scheduleRows.length) return;

        await importMonthlyLedgerFile();
    }

    function clearDimensionBalanceFile() {
        const dimensionInput = document.getElementById('pmDimensionBalanceFile');
        const monthlyInput = document.getElementById('pmMonthlyLedgerFile');

        if (dimensionInput) dimensionInput.value = '';
        if (monthlyInput) monthlyInput.value = '';

        updateUploadFileLabel(
            'pmDimensionBalanceFile',
            'pmDimensionBalanceFileName',
            'pmClearDimensionBalanceFileBtn'
        );

        updateUploadFileLabel(
            'pmMonthlyLedgerFile',
            'pmMonthlyLedgerFileName',
            'pmClearMonthlyLedgerFileBtn'
        );

        scheduleRows = [];
        scheduleStoreCount = 0;
        currentScheduleId = null;
        linkedDocumentIds = [];
        pendingSourceDocuments = [];

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

        renderSchedulePreview({
            rows: [],
            storeCount: 0,
            totalBalance: 0
        });

        setDefaultScheduleName();

        setScheduleStatus(
            'Dimension Balance file removed. Upload it again to generate the schedule.',
            'info'
        );
    }

    async function clearMonthlyLedgerFiles() {
        const monthlyInput = document.getElementById('pmMonthlyLedgerFile');

        if (monthlyInput) monthlyInput.value = '';

        updateUploadFileLabel(
            'pmMonthlyLedgerFile',
            'pmMonthlyLedgerFileName',
            'pmClearMonthlyLedgerFileBtn'
        );

        pendingSourceDocuments = pendingSourceDocuments.filter(item =>
            item.type !== 'monthly_ledger' &&
            item.type !== 'monthly_ledger_files'
        );

        const dimensionInput = document.getElementById('pmDimensionBalanceFile');

        if (dimensionInput?.files?.length) {
            await loadDimensionBalanceSchedule({
                importMonthlyFiles: false
            });

            setScheduleStatus(
                'Monthly files removed. Schedule rebuilt using only the Dimension Balance report.',
                'info'
            );

            return;
        }

        setScheduleStatus('Monthly files removed.', 'info');
    }

    async function loadDimensionBalanceSchedule(options = {}) {
        if (isLoadingDimensionBalance) return;

        const { importMonthlyFiles = true } = options;
        const input = document.getElementById('pmDimensionBalanceFile');
        const file = input?.files?.[0];

        if (!file) {
            setScheduleStatus('Choose the Dimension Balance report first.', 'error');
            return;
        }

        isLoadingDimensionBalance = true;

        showPmLoading('Reading Dimension Balance report...');
        setScheduleStatus('Reading Dimension Balance report...', 'info');

        try {
            if (!window.XLSX) {
                throw new Error('The spreadsheet library is not available. Refresh the page and try again.');
            }

            const rows = await readWorkbookRows(input, 'Dimension Balance report');
            const result = buildScheduleFromDimensionBalance(rows);

            scheduleRows = result.rows;
            scheduleStoreCount = result.storeCount;
            currentScheduleId = null;
            linkedDocumentIds = [];
            pendingSourceDocuments = [];

            setDefaultScheduleName();
            recalculateScheduleRows();

            renderSchedulePreview(getScheduleResult());
            setScheduleStatus(
                `Dimension Balance loaded: ${result.storeCount} stores with opening balances.`,
                'success'
            );

            if (importMonthlyFiles) {
                await importPendingMonthlyFilesAfterDimension();
            }
        } catch (error) {
            console.error('Dimension Balance import error:', error);

            scheduleRows = [];
            scheduleStoreCount = 0;
            currentScheduleId = null;
            linkedDocumentIds = [];
            pendingSourceDocuments = [];

            renderSchedulePreview({ rows: [], storeCount: 0, totalBalance: 0 });
            setScheduleStatus(error.message || 'The Dimension Balance report could not be loaded.', 'error');
        } finally {
            isLoadingDimensionBalance = false;
            hidePmLoading();
        }
    }

    function buildScheduleFromDimensionBalance(rows) {
        const headerIndex = findHeaderRow(rows, ['Account', 'Account name', 'Location', 'Opening balance']);

        if (headerIndex < 0) {
            throw new Error('The Dimension Balance report must include Account, Account name, Location, and Opening balance (USD).');
        }

        const headers = rows[headerIndex].map(normalizeHeader);
        const accountIndex = findHeaderIndex(headers, 'account');
        const accountNameIndex = findHeaderIndex(headers, 'account name');
        const locationIndex = findHeaderIndex(headers, 'location');
        const openingIndex = findHeaderIndex(headers, 'opening balance');

        if ([accountIndex, accountNameIndex, locationIndex, openingIndex].some(index => index < 0)) {
            throw new Error('The Dimension Balance report is missing one of the required columns: Account, Account name, Location, Opening balance (USD).');
        }

        const stores = new Map();

        rows.slice(headerIndex + 1).forEach(row => {
            const account = String(row[accountIndex] ?? '').trim();
            const accountName = String(row[accountNameIndex] ?? '').trim();
            const location = cleanLocation(row[locationIndex]);
            const openingBalance = parseMoney(row[openingIndex]);

            if (!account || !location) return;
            if (account !== '241000' && !/sales\s+tax\s+payable/i.test(accountName)) return;

            const current = stores.get(location) || {
                account,
                accountName,
                location,
                openingBalance: 0
            };

            current.account = current.account || account;
            current.accountName = current.accountName || accountName;
            current.openingBalance = roundMoney(current.openingBalance + Number(openingBalance || 0));
            stores.set(location, current);
        });

        const dimensionRows = Array.from(stores.values()).sort((a, b) => naturalSort(a.location, b.location));

        if (!dimensionRows.length) {
            throw new Error('No account 241000 store rows were found in the Dimension Balance report.');
        }

        const schedule = dimensionRows.map(item => {
            const row = emptyScheduleRow();

            row[0] = formatDimensionAccountName(item.accountName);
            row[1] = item.location;
            row[2] = '';
            row[3] = normalizeAccountNumber(item.account);
            row[4] = 'Imported from Dimension Balance';
            row[5] = '';
            row[8] = roundMoney(item.openingBalance || 0);
            row[33] = sumRowBalance(row);

            return row;
        });

        return {
            rows: schedule,
            storeCount: countScheduleStores(schedule),
            totalBalance: roundMoney(schedule.reduce((sum, row) => sum + Number(row[8] || 0), 0)),
            account: dimensionRows[0]?.account || '241000',
            accountName: dimensionRows[0]?.accountName || 'SALES TAX PAYABLE'
        };
    }

    function formatDimensionAccountName(accountName) {
        const text = String(accountName || '').trim();
        if (/sales\s+tax\s+payable/i.test(text)) return 'Sales Tax';
        return text || 'Sales Tax';
    }

    function normalizeAccountNumber(account) {
        const text = String(account ?? '').trim();
        return /^\d+$/.test(text) ? Number(text) : text;
    }

    function parseScheduleTemplateRows(rows) {
        const headerIndex = findHeaderRow(rows, ['Entry / Payee', 'Location', 'YTD BAL']);

        if (headerIndex < 0) {
            throw new Error('The selected workbook does not look like the Schedule 2026 template. The header row was not found.');
        }

        const parsedRows = rows
            .slice(headerIndex + 1)
            .filter(row => rowHasScheduleContent(row))
            .map(row => {
                const normalized = emptyScheduleRow();

                for (let index = 0; index < normalized.length; index += 1) {
                    normalized[index] = normalizeLoadedScheduleValue(row[index], index);
                }

                return normalized;
            });

        if (!parsedRows.length || !parsedRows.some(row => row[0] === 'Sales Tax' && row[1])) {
            throw new Error('No store rows were found in the Schedule 2026 template.');
        }

        parsedRows.forEach(row => {
            if (!row[3] && row[1]) row[3] = 241000;
        });

        scheduleRows = parsedRows;
        recalculateScheduleRows();

        return {
            rows: scheduleRows,
            storeCount: countScheduleStores(scheduleRows),
            totalBalance: getScheduleTotalBalance(scheduleRows)
        };
    }

    function rowHasScheduleContent(row) {
        if (!Array.isArray(row)) return false;

        const entry = String(row[0] ?? '').trim();
        const location = String(row[1] ?? '').trim();
        const account = String(row[3] ?? '').trim();
        const hasNumbers = row.slice(7, 35).some(value => parseMoney(value) !== null);

        if (!entry && !location && !account && !hasNumbers) return false;
        if (/^entry\s*\/\s*payee$/i.test(entry)) return false;
        if (/^company name:/i.test(entry)) return false;
        if (/^gl account/i.test(entry)) return false;
        if (/^year:/i.test(entry)) return false;

        return Boolean(entry || location || account || hasNumbers);
    }

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

        return readWorkbookRowsFromFile(file, label);
    }

    async function readWorkbookRowsFromFile(file, label) {
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
            posted: findAnyHeaderIndex(headers, ['posted dt', 'posted date', 'date']),
            docDate: findAnyHeaderIndex(headers, ['doc dt', 'doc date']),
            doc: findAnyHeaderIndex(headers, ['doc', 'document']),
            memo: findAnyHeaderIndex(headers, [
                'memo description',
                'memo/description',
                'memo',
                'description',
                'entry / payee',
                'entry payee'
            ]),
            location: findAnyHeaderIndex(headers, ['location', 'store']),
            account: findAnyHeaderIndex(headers, ['gl acct', 'gl account', 'account']),
            debit: findAnyHeaderIndex(headers, ['debit']),
            credit: findAnyHeaderIndex(headers, ['credit'])
        };

        const transactions = [];

        rows.slice(headerIndex + 1).forEach(row => {
            const location = cleanLocation(getRowValue(row, indexes.location));
            const postedDate = parseDateValue(getRowValue(row, indexes.posted));

            const memo = String(
                getRowValue(row, indexes.memo) ||
                getRowValue(row, indexes.doc) ||
                ''
            ).trim();

            const account = getRowValue(row, indexes.account);

            let debit = parseMoney(getRowValue(row, indexes.debit));
            let credit = parseMoney(getRowValue(row, indexes.credit));

            const normalizedPayment = normalizeSalesTaxReturnPayment({
                memo,
                account,
                debit,
                credit,
                postedDate
            });

            debit = normalizedPayment.debit;
            credit = normalizedPayment.credit;

            const taxPeriodMonth =
                normalizedPayment.taxPeriodMonth ||
                inferTaxPeriodMonth(memo, postedDate);

            const paymentMonth =
                normalizedPayment.paymentMonth ||
                inferPaymentMonth(memo, postedDate, taxPeriodMonth);

            if (!location || !postedDate || (!debit && !credit)) return;
            if (/total|grand total/i.test(location) || /total|grand total/i.test(memo)) return;

            transactions.push({
                location,
                postedDate,
                docDate: parseDateValue(getRowValue(row, indexes.docDate)) || postedDate,
                memo: memo || 'Sales Tax',
                debit: debit || 0,
                credit: credit || 0,
                taxPeriodMonth,
                paymentMonth,
                entity: inferEntity(memo, location),
                state: /CALIFORNIA| CA /i.test(` ${memo} `) || credit ? 'CA' : ''
            });
        });

        return transactions;
    }

    function normalizeSalesTaxReturnPayment(transaction) {
        const memo = normalizeMemoForMonthParsing(transaction.memo);
        const account = String(transaction.account || '').replace(/[^\d]/g, '');

        const debit = Number(transaction.debit || 0);
        const credit = Number(transaction.credit || 0);

        const isSalesTax =
            account === '241000' ||
            memo.includes('SALES TAX');

        const isPayment =
            /\bQ[1-4]\s+RETURN\b/.test(memo) ||
            /\bRETURN\s+PAYMENT\b/.test(memo) ||
            /\bMONTHLY\s+PREPAYMENT\b/.test(memo) ||
            /\bPREPAYMENT\b/.test(memo) ||
            /\b\(\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\s+PAID\s*\)/.test(memo);

        if (!isSalesTax || !isPayment) {
            return transaction;
        }

        const taxPeriodMonth = inferTaxPeriodMonth(transaction.memo, transaction.postedDate);
        const paymentMonth = inferPaymentMonth(transaction.memo, transaction.postedDate, taxPeriodMonth);

        if (debit) {
            return {
                ...transaction,
                debit: Math.abs(debit),
                credit: 0,
                taxPeriodMonth,
                paymentMonth
            };
        }

        if (credit) {
            return {
                ...transaction,
                debit: Math.abs(credit),
                credit: 0,
                taxPeriodMonth,
                paymentMonth
            };
        }

        return {
            ...transaction,
            taxPeriodMonth,
            paymentMonth
        };
    }

    function findAnyHeaderIndex(headers, labels) {
        for (const label of labels) {
            const index = findHeaderIndex(headers, label);

            if (index >= 0) {
                return index;
            }
        }

        return -1;
    }

    function getRowValue(row, index) {
        return index >= 0 ? row[index] : '';
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
                    const month = getTransactionTaxPeriodMonth(item);
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
            applyQuarterReviewToGroup(groupRows, summary);

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
        const month = getTransactionPaymentMonth(transaction);
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

    function getTransactionTaxPeriodMonth(transaction) {
        const month = normalizeScheduleMonth(transaction?.taxPeriodMonth);
        if (month) return month;

        return getDateMonth(transaction?.postedDate);
    }

    function getTransactionPaymentMonth(transaction) {
        const month = normalizeScheduleMonth(transaction?.paymentMonth);
        if (month) return month;

        return getDateMonth(transaction?.postedDate) || getNextMonth(getTransactionTaxPeriodMonth(transaction));
    }

    function inferTaxPeriodMonth(memo, fallbackDate = null) {
        const text = normalizeMemoForMonthParsing(memo);
        const periodMatch = text.match(/\b20\d{2}\s*[.\-/]\s*(0?[1-9]|1[0-2])\b/);

        if (periodMatch) return normalizeScheduleMonth(periodMatch[1]);

        const monthMention = findMonthMentions(text)
            .find(mention => !isPaidMonthMention(text, mention));

        if (monthMention) return monthMention.month;

        const quarterMatch = text.match(/\bQ([1-4])\s+RETURN\b/);
        if (quarterMatch) return Number(quarterMatch[1]) * 3;

        return getDateMonth(fallbackDate);
    }

    function inferPaymentMonth(memo, fallbackDate = null, taxPeriodMonth = null) {
        const text = normalizeMemoForMonthParsing(memo);
        const paidMention = findMonthMentions(text)
            .find(mention => isPaidMonthMention(text, mention));

        if (paidMention) return paidMention.month;

        return getDateMonth(fallbackDate) || getNextMonth(taxPeriodMonth);
    }

    function normalizeMemoForMonthParsing(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase();
    }

    function findMonthMentions(text) {
        const mentions = [];

        MONTH_ALIASES.forEach(([month, aliases]) => {
            aliases.forEach(alias => {
                const regex = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'g');
                let match = regex.exec(text);

                while (match) {
                    mentions.push({
                        month,
                        index: match.index,
                        end: match.index + match[0].length,
                        length: match[0].length
                    });
                    match = regex.exec(text);
                }
            });
        });

        return mentions.sort((a, b) => a.index - b.index || b.length - a.length);
    }

    function isPaidMonthMention(text, mention) {
        const after = text.slice(mention.end, mention.end + 24);
        return /^\s*(?:\)|-|:)?\s*(?:PAID|PAYMENT)\b/.test(after);
    }

    function normalizeScheduleMonth(value) {
        const month = Number(value);
        return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
    }

    function getDateMonth(value) {
        const date = value instanceof Date ? value : parseDateValue(value);
        return date ? date.getMonth() + 1 : null;
    }

    function getNextMonth(month) {
        const normalized = normalizeScheduleMonth(month);
        if (!normalized) return null;
        return normalized === 12 ? 1 : normalized + 1;
    }

    function normalizeMonthlyLedgerTransaction(transaction, sourceName = '') {
        if (!transaction?.debit) return transaction;

        const sourcePaymentMonth = getPaymentMonthFromMonthlySource(sourceName);
        if (!sourcePaymentMonth) return transaction;

        const memoHasTaxPeriod = hasExplicitTaxPeriodMonth(transaction.memo);

        if (memoHasTaxPeriod) {
            return transaction;
        }

        const taxPeriodMonth = getPreviousMonth(sourcePaymentMonth);

        if (!taxPeriodMonth) return transaction;

        return {
            ...transaction,
            taxPeriodMonth,
            paymentMonth: sourcePaymentMonth
        };
    }

    function getPaymentMonthFromMonthlySource(sourceName = '') {
        const text = normalizeMemoForMonthParsing(sourceName);

        const numericMonth = text.match(
            /\b(?:20\d{2}[-_.\s]*)?(0?[1-9]|1[0-2])\s*[-_.\s]*(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\b/
        );

        if (numericMonth) {
            return normalizeScheduleMonth(numericMonth[1]);
        }

        const mentions = findMonthMentions(text);

        return mentions.length
            ? mentions[mentions.length - 1].month
            : null;
    }

    function hasExplicitTaxPeriodMonth(memo = '') {
        const text = normalizeMemoForMonthParsing(memo);

        if (/\b20\d{2}\s*[.\-/]\s*(0?[1-9]|1[0-2])\b/.test(text)) {
            return true;
        }

        return findMonthMentions(text)
            .some(mention => !isPaidMonthMention(text, mention));
    }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function applyQuarterReviewToGroup(groupRows, summaryRow) {
        if (!summaryRow) return;

        Object.keys(QUARTER_MONTHS).forEach(quarterText => {
            const quarter = Number(quarterText);
            const targetRow = findQuarterReviewTargetRow(groupRows, quarter);

            if (!targetRow) return;

            targetRow[35] = calculateQuarterReviewBalance(groupRows, summaryRow, quarter);
        });
    }

    function findQuarterReviewTargetRow(groupRows, quarter) {
        const quarterReturnPattern = new RegExp(`\\bQ${quarter}\\s+RETURN\\b`, 'i');
        const quarterEndMonth = quarter * 3;

        return groupRows.find(row => quarterReturnPattern.test(String(row[0] || ''))) ||
            groupRows.find(row => getScheduleRowTaxPeriodMonth(row) === quarterEndMonth) ||
            null;
    }

    function calculateQuarterReviewBalance(groupRows, summaryRow, quarter) {
        return getQuarterGroupTotals(groupRows, summaryRow, quarter).difference;
    }

    function getQuarterGroupTotals(groupRows, summaryRow, quarter) {
        const months = QUARTER_MONTHS[quarter] || [];

        const collectedTotal = months.reduce((sum, month) => {
            const column = COLLECTED_COL_BY_MONTH[month];
            return column === undefined ? sum : sum + Number(summaryRow[column] || 0);
        }, 0);

        const paidTotal = months.reduce((sum, taxMonth) => {
            return sum + getPaidForTaxMonth(groupRows, summaryRow, taxMonth);
        }, 0);

        return {
            collected: roundMoney(collectedTotal),
            paid: roundMoney(paidTotal),
            difference: roundMoney(collectedTotal + paidTotal)
        };
    }

    function getPaidForTaxMonth(groupRows, summaryRow, taxMonth) {
        return roundMoney(groupRows.reduce((sum, row) => {
            if (!row || row === summaryRow || row[0] === 'Sales Tax') return sum;

            const rowTaxMonth = getScheduleRowTaxPeriodMonth(row);

            // Lo importante es el periodo fiscal, no la columna visible.
            // Si la fila corresponde a marzo fiscal, entra en APR PAID (MAR).
            if (rowTaxMonth !== taxMonth) return sum;

            return sum + getScheduleRowPaymentAmountForTaxMonth(row, taxMonth);
        }, 0));
    }

    function getScheduleRowPaymentAmountForTaxMonth(row, taxMonth) {
        const amountPaid = parseMoney(row?.[7]);

        // Prioridad 1: Amount Paid.
        // Esta es la fuente más confiable para el detalle.
        if (amountPaid !== null) return amountPaid;

        // Prioridad 2: columna del mes pagado esperado.
        // Ejemplo: taxMonth 3 = March, expected paid month = April.
        const expectedPaidMonth = getNextMonth(taxMonth);
        const expectedPaidColumn = PAID_COL_BY_MONTH[expectedPaidMonth];
        const expectedColumnAmount = parseMoney(row?.[expectedPaidColumn]);

        if (expectedColumnAmount !== null) return expectedColumnAmount;

        // Prioridad 3: cualquier columna PAID de la fila.
        return Object.values(PAID_COL_BY_MONTH).reduce((sum, column) => {
            return sum + Number(row?.[column] || 0);
        }, 0);
    }

    function getScheduleRowPaymentAmountFromColumn(row, paidColumn) {
        const columnAmount = parseMoney(row?.[paidColumn]);

        if (columnAmount) return columnAmount;

        return getScheduleRowPaymentAmount(row);
    }

    function getScheduleRowTaxPeriodMonth(row) {
        const explicitMonth = inferTaxPeriodMonthFromMemo(row?.[0]);
        if (explicitMonth) return explicitMonth;

        const fallbackMonth = inferTaxPeriodMonthFromMemo(row?.[4]);
        if (fallbackMonth) return fallbackMonth;

        if (isSchedulePaymentRow(row)) {
            const paidMonth = getScheduleRowPaidMonth(row);
            const postedMonth = getDateMonth(row?.[6]);

            if (paidMonth && postedMonth && paidMonth === postedMonth) {
                return paidMonth;
            }

            return getPreviousMonth(paidMonth);
        }

        return getDateMonth(row?.[6]);
    }

    function inferTaxPeriodMonthFromMemo(memo) {
        const text = normalizeMemoForMonthParsing(memo);

        const periodMatch = text.match(/\b20\d{2}\s*[.\-/]\s*(0?[1-9]|1[0-2])\b/);
        if (periodMatch) return normalizeScheduleMonth(periodMatch[1]);

        const monthMention = findMonthMentions(text)
            .find(mention => !isPaidMonthMention(text, mention));

        if (monthMention) return monthMention.month;

        const quarterMatch = text.match(/\bQ([1-4])\s+RETURN\b/);
        if (quarterMatch) return Number(quarterMatch[1]) * 3;

        return null;
    }

    function isSchedulePaymentRow(row) {
        if (!row || row[0] === 'Sales Tax') return false;

        const amountPaid = parseMoney(row?.[7]);
        if (amountPaid) return true;

        return Object.values(PAID_COL_BY_MONTH).some(column =>
            Number(row?.[column] || 0)
        );
    }

    function getScheduleRowPaidMonth(row) {
        for (const [monthText, column] of Object.entries(PAID_COL_BY_MONTH)) {
            if (Number(row?.[column] || 0)) return Number(monthText);
        }

        return getDateMonth(row?.[6]);
    }

    function getPreviousMonth(month) {
        const normalized = normalizeScheduleMonth(month);

        if (!normalized) return null;

        return normalized === 1 ? 12 : normalized - 1;
    }

    function getScheduleRowPaymentMonth(row) {
        const taxPeriodMonth = getScheduleRowTaxPeriodMonth(row);
        return inferPaymentMonth(row?.[0], row?.[6], taxPeriodMonth);
    }

    function getScheduleRowPaymentAmount(row) {
        const amountPaid = parseMoney(row?.[7]);
        if (amountPaid) return amountPaid;

        return Object.values(PAID_COL_BY_MONTH).reduce((sum, column) =>
            sum + Number(row?.[column] || 0), 0);
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

        if (!preview || !table) return;

        if (!result.rows.length) {
            preview.hidden = true;
            if (exportButton) exportButton.disabled = true;
            if (saveButton) saveButton.disabled = true;
            table.innerHTML = '';
            setText('pmScheduleStores', 0);
            setText('pmScheduleRows', 0);
            setText('pmScheduleBalance', formatCurrency(0));
            setText('pmScheduleFilterCount', 'Showing all rows');
            renderQuarterReviewCards([]);
            renderStoreQuarterOverview([]);
            populateScheduleFilterOptions([]);
            updateMonthEditor();
            return;
        }

        preview.hidden = false;
        if (exportButton) exportButton.disabled = false;
        if (saveButton) saveButton.disabled = false;
        setText('pmScheduleStores', result.storeCount);
        setText('pmScheduleRows', result.rows.length);
        setText('pmScheduleBalance', formatCurrency(result.totalBalance));
        renderQuarterReviewCards(result.rows);
        renderStoreQuarterOverview(result.rows);
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

    function renderQuarterReviewCards(rows) {
        const container = document.getElementById('pmQuarterReviewCards');

        if (!container) return;

        if (!rows || !rows.length) {
            container.innerHTML = '';
            return;
        }

        const cards = getQuarterReviewCards(rows);

        if (!cards.some(card => card.activeStores > 0)) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = cards.map(card => {
            const isBalanced = Math.abs(card.difference) <= 0.01;

            return `
            <article class="pm-quarter-card ${isBalanced ? 'is-balanced' : 'is-open'}">
                <div class="pm-quarter-head">
                    <span>${escapeHtml(card.label)}</span>
                    <strong>${escapeHtml(formatCurrency(card.difference))}</strong>
                </div>

                <dl>
                    <div>
                        <dt>Collected</dt>
                        <dd>${escapeHtml(formatCurrency(card.collected))}</dd>
                    </div>
                    <div>
                        <dt>Paid next month</dt>
                        <dd>${escapeHtml(formatCurrency(card.paid))}</dd>
                    </div>
                    <div>
                        <dt>Stores off</dt>
                        <dd>${escapeHtml(`${card.openStores}/${card.activeStores}`)}</dd>
                    </div>
                </dl>

                <button
                    type="button"
                    class="pm-quarter-detail-button"
                    data-quarter-review="${escapeHtml(card.quarter)}"
                >
                    View stores
                </button>
            </article>
        `;
        }).join('');
    }

    function handleQuarterReviewCardClick(event) {
        const button = event.target.closest('[data-quarter-review]');
        if (!button) return;

        const quarter = Number(button.dataset.quarterReview || 0);

        openQuarterStoreModal({
            quarter,
            storeKey: ''
        });
    }

    function renderStoreQuarterOverview(rows) {
        const tbody = document.getElementById('pmStoreQuarterOverview');
        if (!tbody) return;

        const storeRows = getStoreQuarterOverviewRows(rows);

        if (!storeRows.length) {
            tbody.innerHTML = `
            <tr>
                <td colspan="8" class="pm-table-empty">
                    No quarter data loaded.
                </td>
            </tr>
        `;
            return;
        }

        tbody.innerHTML = storeRows.map(item => {
            const status = item.quarters.some(quarter => Math.abs(quarter.difference) > 0.01)
                ? 'Needs Review'
                : 'Balanced';

            return `
            <tr>
                <td><strong>${escapeHtml(item.store)}</strong></td>
                <td>${escapeHtml(item.entity || '')}</td>
                ${item.quarters.map(quarter => `
                    <td class="${Math.abs(quarter.difference) > 0.01 ? 'is-open' : 'is-balanced'}">
                        ${escapeHtml(formatCurrency(quarter.difference))}
                    </td>
                `).join('')}
                <td>
                    <span class="pm-quarter-status ${status === 'Balanced' ? 'is-balanced' : 'is-open'}">
                        ${escapeHtml(status)}
                    </span>
                </td>
                <td>
                    <button
                        type="button"
                        class="pm-store-detail-button"
                        data-store-quarter-key="${escapeHtml(item.key)}"
                    >
                        Details
                    </button>
                </td>
            </tr>
        `;
        }).join('');
    }

    function getStoreQuarterOverviewRows(rows) {
        const groups = groupScheduleRowsByStore(rows);
        const result = [];

        groups.forEach((groupRows, key) => {
            const summaryRow = groupRows.find(row => row[0] === 'Sales Tax');

            if (!summaryRow) return;

            const store = String(summaryRow[1] || '').trim();
            const entity = getScheduleRowEntity(summaryRow) || String(summaryRow[2] || '').trim();

            const quarters = Object.keys(QUARTER_MONTHS).map(quarterText => {
                const quarter = Number(quarterText);
                const totals = getQuarterGroupTotals(groupRows, summaryRow, quarter);

                return {
                    quarter,
                    label: `Q${quarter} ${getQuarterLabel(quarter)}`,
                    collected: totals.collected,
                    paid: totals.paid,
                    difference: totals.difference,
                    hasActivity: Boolean(totals.collected || totals.paid)
                };
            });

            const hasAnyActivity = quarters.some(quarter => quarter.hasActivity);

            if (!hasAnyActivity) return;

            result.push({
                key,
                store,
                entity,
                quarters,
                totalDifference: roundMoney(
                    quarters.reduce((sum, quarter) => sum + Number(quarter.difference || 0), 0)
                )
            });
        });

        return result.sort((a, b) =>
            naturalSort(a.store, b.store) || naturalSort(a.entity, b.entity)
        );
    }

    function handleStoreQuarterOverviewClick(event) {
        const button = event.target.closest('[data-store-quarter-key]');
        if (!button) return;

        openQuarterStoreModal({
            storeKey: button.dataset.storeQuarterKey || '',
            quarter: ''
        });
    }

    function openQuarterStoreModal(options = {}) {
        quarterStoreModalState = {
            storeKey: options.storeKey || '',
            quarter: options.quarter ? String(options.quarter) : '',
            search: '',
            entity: '',
            status: ''
        };

        document.body.classList.add('pm-modal-open');
        document.getElementById('pmQuarterStoreModal')?.removeAttribute('hidden');

        syncQuarterModalFilterInputs();
        populateQuarterModalEntityFilter();
        renderQuarterStoreModal();
    }

    function closeQuarterStoreModal() {
        document.body.classList.remove('pm-modal-open');
        document.getElementById('pmQuarterStoreModal')?.setAttribute('hidden', '');
    }

    function handleQuarterModalFilterChange() {
        quarterStoreModalState.search = document.getElementById('pmQuarterModalSearch')?.value || '';
        quarterStoreModalState.quarter = document.getElementById('pmQuarterModalQuarter')?.value || '';
        quarterStoreModalState.entity = document.getElementById('pmQuarterModalEntity')?.value || '';
        quarterStoreModalState.status = document.getElementById('pmQuarterModalStatus')?.value || '';

        renderQuarterStoreModal();
    }

    function clearQuarterModalFilters() {
        quarterStoreModalState = {
            ...quarterStoreModalState,
            search: '',
            quarter: quarterStoreModalState.storeKey ? '' : '',
            entity: '',
            status: ''
        };

        syncQuarterModalFilterInputs();
        renderQuarterStoreModal();
    }

    function syncQuarterModalFilterInputs() {
        const searchInput = document.getElementById('pmQuarterModalSearch');
        const quarterSelect = document.getElementById('pmQuarterModalQuarter');
        const entitySelect = document.getElementById('pmQuarterModalEntity');
        const statusSelect = document.getElementById('pmQuarterModalStatus');

        if (searchInput) searchInput.value = quarterStoreModalState.search || '';
        if (quarterSelect) quarterSelect.value = quarterStoreModalState.quarter || '';
        if (entitySelect) entitySelect.value = quarterStoreModalState.entity || '';
        if (statusSelect) statusSelect.value = quarterStoreModalState.status || '';
    }

    function populateQuarterModalEntityFilter() {
        const select = document.getElementById('pmQuarterModalEntity');
        if (!select) return;

        const rows = getStoreQuarterOverviewRows(scheduleRows);
        const entities = Array.from(
            new Set(rows.map(row => row.entity).filter(Boolean))
        ).sort(naturalSort);

        select.innerHTML = [
            '<option value="">All entities</option>',
            ...entities.map(entity => `
            <option value="${escapeHtml(entity)}">${escapeHtml(entity)}</option>
        `)
        ].join('');

        select.value = entities.includes(quarterStoreModalState.entity)
            ? quarterStoreModalState.entity
            : '';
    }

    function renderQuarterStoreModal() {
        const title = document.getElementById('pmQuarterStoreTitle');
        const subtitle = document.getElementById('pmQuarterStoreSubtitle');
        const summary = document.getElementById('pmQuarterModalSummary');
        const tbody = document.getElementById('pmQuarterModalTableBody');

        if (!tbody) return;

        const rows = getFilteredQuarterStoreModalRows();

        const selectedStore = getStoreQuarterOverviewRows(scheduleRows)
            .find(row => row.key === quarterStoreModalState.storeKey);

        if (title) {
            title.textContent = selectedStore
                ? `Store ${selectedStore.store} / ${selectedStore.entity || ''}`
                : 'Quarter review by store';
        }

        if (subtitle) {
            subtitle.textContent = selectedStore
                ? 'Review all quarter activity for this store.'
                : 'Review quarter activity across all stores.';
        }

        const totalCollected = roundMoney(rows.reduce((sum, row) => sum + Number(row.collected || 0), 0));
        const totalPaid = roundMoney(rows.reduce((sum, row) => sum + Number(row.paid || 0), 0));
        const totalDifference = roundMoney(rows.reduce((sum, row) => sum + Number(row.difference || 0), 0));
        const openCount = rows.filter(row => Math.abs(row.difference) > 0.01).length;

        if (summary) {
            summary.innerHTML = `
            <article>
                <span>Rows</span>
                <strong>${escapeHtml(rows.length)}</strong>
            </article>
            <article>
                <span>Collected</span>
                <strong>${escapeHtml(formatCurrency(totalCollected))}</strong>
            </article>
            <article>
                <span>Paid next month</span>
                <strong>${escapeHtml(formatCurrency(totalPaid))}</strong>
            </article>
            <article class="${Math.abs(totalDifference) > 0.01 ? 'is-open' : 'is-balanced'}">
                <span>Difference</span>
                <strong>${escapeHtml(formatCurrency(totalDifference))}</strong>
            </article>
            <article>
                <span>Needs Review</span>
                <strong>${escapeHtml(openCount)}</strong>
            </article>
        `;
        }

        if (!rows.length) {
            tbody.innerHTML = `
            <tr>
                <td colspan="7" class="pm-table-empty">
                    No rows match the selected filters.
                </td>
            </tr>
        `;
            return;
        }

        tbody.innerHTML = rows.map(row => {
            const isOpen = Math.abs(row.difference) > 0.01;

            return `
            <tr>
                <td><strong>${escapeHtml(row.store)}</strong></td>
                <td>${escapeHtml(row.entity || '')}</td>
                <td>${escapeHtml(row.label)}</td>
                <td>${escapeHtml(formatCurrency(row.collected))}</td>
                <td>${escapeHtml(formatCurrency(row.paid))}</td>
                <td class="${isOpen ? 'is-open' : 'is-balanced'}">
                    ${escapeHtml(formatCurrency(row.difference))}
                </td>
                <td>
                    <span class="pm-quarter-status ${isOpen ? 'is-open' : 'is-balanced'}">
                        ${isOpen ? 'Needs Review' : 'Balanced'}
                    </span>
                </td>
            </tr>
        `;
        }).join('');
    }

    function getFilteredQuarterStoreModalRows() {
        const search = normalize(quarterStoreModalState.search);
        const quarterFilter = Number(quarterStoreModalState.quarter || 0);
        const entityFilter = quarterStoreModalState.entity;
        const statusFilter = quarterStoreModalState.status;
        const storeKeyFilter = quarterStoreModalState.storeKey;

        const storeRows = getStoreQuarterOverviewRows(scheduleRows);
        const rows = [];

        storeRows.forEach(storeRow => {
            if (storeKeyFilter && storeRow.key !== storeKeyFilter) return;
            if (entityFilter && storeRow.entity !== entityFilter) return;

            const searchText = normalize([
                storeRow.store,
                storeRow.entity
            ].join(' '));

            if (search && !searchText.includes(search)) return;

            storeRow.quarters.forEach(quarter => {
                const isOpen = Math.abs(quarter.difference) > 0.01;

                if (!quarter.hasActivity) return;
                if (quarterFilter && quarter.quarter !== quarterFilter) return;
                if (statusFilter === 'open' && !isOpen) return;
                if (statusFilter === 'balanced' && isOpen) return;

                rows.push({
                    key: storeRow.key,
                    store: storeRow.store,
                    entity: storeRow.entity,
                    quarter: quarter.quarter,
                    label: quarter.label,
                    collected: quarter.collected,
                    paid: quarter.paid,
                    difference: quarter.difference
                });
            });
        });

        return rows.sort((a, b) =>
            naturalSort(a.store, b.store) ||
            naturalSort(a.entity, b.entity) ||
            a.quarter - b.quarter
        );
    }

    function getQuarterReviewDetailRows(rows, quarter) {
        const groups = groupScheduleRowsByStore(rows);
        const months = QUARTER_MONTHS[quarter] || [];
        const detailRows = [];

        groups.forEach((groupRows, store) => {
            const summaryRow = groupRows.find(row => row[0] === 'Sales Tax');
            if (!summaryRow) return;

            const entity = String(summaryRow[2] || groupRows.find(row => row[2])?.[2] || '').trim();

            const collectedByMonth = months.map(month => {
                const column = COLLECTED_COL_BY_MONTH[month];
                return column === undefined ? 0 : roundMoney(Number(summaryRow[column] || 0));
            });

            const paidByMonth = months.map(month =>
                getPaidForTaxMonth(groupRows, summaryRow, month)
            );

            const collected = roundMoney(collectedByMonth.reduce((sum, value) => sum + Number(value || 0), 0));
            const paid = roundMoney(paidByMonth.reduce((sum, value) => sum + Number(value || 0), 0));
            const difference = roundMoney(collected + paid);
            const hasActivity = Boolean(collected || paid);

            if (!hasActivity) return;

            detailRows.push({
                store,
                entity,
                collectedByMonth,
                paidByMonth,
                collected,
                paid,
                difference,
                status: Math.abs(difference) <= 0.01 ? 'Balanced' : 'Needs Review'
            });
        });

        return detailRows.sort((a, b) => {
            const differenceCompare = Math.abs(b.difference) - Math.abs(a.difference);
            if (differenceCompare) return differenceCompare;

            return naturalSort(a.store, b.store);
        });
    }


    function renderQuarterMoneyCell(value) {
        const number = Number(value || 0);

        return `
        <td class="is-number ${number < -0.01 ? 'is-negative' : number > 0.01 ? 'is-positive' : ''}">
            ${escapeHtml(formatCurrency(number))}
        </td>
    `;
    }

    function getShortMonthName(month) {
        return MONTH_NAMES[month]?.slice(0, 3) || `M${month}`;
    }

    function getPaidHeaderForTaxMonth(taxMonth) {
        const paidMonth = getNextMonth(taxMonth);
        const taxLabel = getShortMonthName(taxMonth).toUpperCase();
        const paidLabel = getShortMonthName(paidMonth).toUpperCase();

        if (taxMonth === 12) {
            return `${paidLabel} PAID NEXT YEAR (${taxLabel})`;
        }

        return `${paidLabel} PAID (${taxLabel})`;
    }

    function getQuarterReviewCards(rows) {
        const groups = groupScheduleRowsByStore(rows);

        return Object.keys(QUARTER_MONTHS).map(quarterText => {
            const quarter = Number(quarterText);
            const totals = {
                collected: 0,
                paid: 0,
                difference: 0,
                activeStores: 0,
                openStores: 0
            };

            groups.forEach(groupRows => {
                const summaryRow = groupRows.find(row => row[0] === 'Sales Tax');
                if (!summaryRow) return;

                const groupTotals = getQuarterGroupTotals(groupRows, summaryRow, quarter);
                const hasActivity = Boolean(groupTotals.collected || groupTotals.paid);

                totals.collected = roundMoney(totals.collected + groupTotals.collected);
                totals.paid = roundMoney(totals.paid + groupTotals.paid);
                totals.difference = roundMoney(totals.difference + groupTotals.difference);

                if (hasActivity) totals.activeStores += 1;
                if (hasActivity && Math.abs(groupTotals.difference) > 0.01) totals.openStores += 1;
            });

            return {
                quarter,
                label: `Q${quarter} ${getQuarterLabel(quarter)}`,
                ...totals
            };
        });
    }

    function groupScheduleRowsByStore(rows) {
        const groups = new Map();

        rows.forEach(row => {
            const store = String(row[1] || '').trim();

            if (!store) return;

            const key = getScheduleRowGroupKey(row);

            if (!groups.has(key)) {
                groups.set(key, []);
            }

            groups.get(key).push(row);
        });

        return groups;
    }

    function getQuarterLabel(quarter) {
        const months = QUARTER_MONTHS[quarter] || [];
        const first = MONTH_NAMES[months[0]]?.slice(0, 3) || '';
        const last = MONTH_NAMES[months[months.length - 1]]?.slice(0, 3) || '';

        return first && last ? `${first}-${last}` : '';
    }

    function renderScheduleTableRow(row, rowIndex) {
        const isSummary = row[0] === 'Sales Tax';

        return `
            <tr class="${isSummary ? 'is-store-summary' : ''}">
                ${row.map((value, index) => {
            const isNumber = typeof value === 'number';
            const isGeneralNumber = index === 3; // GL Acct should not look like an amount
            const editable = isEditableScheduleColumn(index);
            const display = value instanceof Date
                ? formatDateForDisplay(value)
                : isNumber
                    ? (isGeneralNumber ? formatGeneralNumber(value) : formatNumber(value))
                    : value;

            return `
                        <td
                            class="${[
                    isNumber && !isGeneralNumber ? 'is-number' : '',
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

    function applyScheduleNumberFormats(worksheet, rowCount) {
        const numberFormat = '#,##0.00;(#,##0.00);-';

        for (let rowIndex = 7; rowIndex < rowCount; rowIndex += 1) {
            const glAccountAddress = window.XLSX.utils.encode_cell({
                r: rowIndex,
                c: 3
            });

            const glAccountCell = worksheet[glAccountAddress];

            if (glAccountCell && typeof glAccountCell.v === 'number') {
                glAccountCell.z = 'General';
            }

            for (let columnIndex = 7; columnIndex <= 35; columnIndex += 1) {
                const cellAddress = window.XLSX.utils.encode_cell({
                    r: rowIndex,
                    c: columnIndex
                });

                const cell = worksheet[cellAddress];

                if (!cell || typeof cell.v !== 'number') continue;

                cell.z = numberFormat;

                cell.s = {
                    ...(cell.s || {}),
                    numFmt: numberFormat
                };
            }
        }
    }

    function exportScheduleWorkbook() {
        if (!scheduleRows.length || !window.XLSX) return;

        const year = getScheduleYear(scheduleRows);
        const entities = Array.from(
            new Set(scheduleRows.map(row => row[2]).filter(Boolean))
        ).sort();

        const aoa = [
            [
                'COMPANY NAME: Quikserve Burger King',
                '',
                'Prepared by:',
                'Properties Dpmt / Property Management'
            ],
            [`COMPANY: ${entities.join(', ') || 'Property Management'}`],
            ['GL ACCOUNT NAME: SALES TAX PAYABLE'],
            ['GL ACCOUNT #: 241000'],
            [`YEAR: ${year}`],
            MONTH_ROW,
            SCHEDULE_HEADERS,
            ...scheduleRows
        ];

        const worksheet = window.XLSX.utils.aoa_to_sheet(aoa, {
            cellDates: true
        });

        const workbook = window.XLSX.utils.book_new();

        worksheet['!cols'] = [
            { wch: 72 },
            { wch: 13 },
            { wch: 10 },
            { wch: 10 },
            { wch: 18 },
            { wch: 9 },
            { wch: 12 },
            { wch: 13 },
            { wch: 18 },
            ...Array.from({ length: 24 }, () => ({ wch: 15 })),
            { wch: 14 },
            { wch: 18 },
            { wch: 18 }
        ];

        worksheet['!rows'] = [
            { hpt: 15 },
            { hpt: 15 },
            { hpt: 15 },
            { hpt: 18 },
            { hpt: 15 },
            { hpt: 55 },
            { hpt: 110 },
            ...Array.from({ length: Math.max(aoa.length - 7, 1) }, () => ({ hpt: 18 }))
        ];

        worksheet['!merges'] = [
            {
                s: { r: 3, c: 0 },
                e: { r: 3, c: 4 }
            }
        ];

        worksheet['!autofilter'] = {
            ref: `A7:AJ${aoa.length}`
        };

        applyCompletedScheduleWorkbookStyle(worksheet, aoa.length);

        window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule 2026');

        window.XLSX.writeFile(
            workbook,
            `Property Management - Schedule 2026 ${timestampForFile()}.xlsx`,
            {
                cellStyles: true,
                bookType: 'xlsx'
            }
        );
    }

    function applyCompletedScheduleWorkbookStyle(worksheet, rowCount) {
        const lastColumn = SCHEDULE_HEADERS.length - 1;
        const latestMonth = getLatestScheduleMonth(scheduleRows);

        const colors = {
            dark: '3F3F3F',
            black: '000000',
            white: 'FFFFFF',
            yellow: 'FFFF00',
            paleYellow: 'FFFDE9',
            paleGreen: 'E2F0D9',
            blue: '4472C4',
            lightBlue: 'DDEBF7',
            gridBlue: '00B0F0',
            gridLight: 'D9EAF7',
            dataGray: 'D9D9D9',
            magenta: 'C000C0',
            text: '000000'
        };

        const thinBlueBorder = createBorder(colors.gridBlue);
        const thinLightBorder = createBorder(colors.gridLight);

        const metaStyle = {
            font: {
                name: 'Arial',
                sz: 8,
                bold: true,
                color: { rgb: colors.black }
            },
            alignment: {
                vertical: 'center'
            }
        };

        const glAccountStyle = {
            fill: {
                patternType: 'solid',
                fgColor: { rgb: colors.yellow }
            },
            font: {
                name: 'Arial',
                sz: 11,
                bold: true,
                color: { rgb: colors.black }
            },
            alignment: {
                vertical: 'center'
            }
        };

        const monthHeaderStyle = {
            fill: {
                patternType: 'solid',
                fgColor: { rgb: colors.dark }
            },
            font: {
                name: 'Arial',
                sz: 8,
                color: { rgb: colors.white }
            },
            alignment: {
                horizontal: 'center',
                vertical: 'center',
                wrapText: true
            }
        };

        const columnHeaderStyle = {
            fill: {
                patternType: 'solid',
                fgColor: { rgb: colors.dark }
            },
            font: {
                name: 'Arial',
                sz: 8,
                bold: true,
                color: { rgb: colors.white }
            },
            alignment: {
                horizontal: 'center',
                vertical: 'center',
                wrapText: true
            },
            border: thinBlueBorder
        };

        const leftDataStyle = {
            fill: {
                patternType: 'solid',
                fgColor: { rgb: colors.dataGray }
            },
            font: {
                name: 'Arial',
                sz: 8,
                color: { rgb: colors.black }
            },
            alignment: {
                vertical: 'center',
                wrapText: false
            },
            border: thinBlueBorder
        };

        const amountDataStyle = {
            fill: {
                patternType: 'solid',
                fgColor: { rgb: colors.white }
            },
            font: {
                name: 'Arial',
                sz: 8,
                color: { rgb: colors.black }
            },
            alignment: {
                horizontal: 'right',
                vertical: 'center'
            },
            border: thinLightBorder
        };

        const selectedMonthDataStyle = {
            ...amountDataStyle,
            fill: {
                patternType: 'solid',
                fgColor: { rgb: colors.paleYellow }
            }
        };

        const ytdStyle = {
            fill: {
                patternType: 'solid',
                fgColor: { rgb: colors.dark }
            },
            font: {
                name: 'Arial',
                sz: 8,
                bold: true,
                color: { rgb: colors.white }
            },
            alignment: {
                horizontal: 'right',
                vertical: 'center'
            },
            border: thinBlueBorder
        };

        const ytdPerStoreHeaderStyle = {
            fill: {
                patternType: 'solid',
                fgColor: { rgb: colors.blue }
            },
            font: {
                name: 'Arial',
                sz: 8,
                bold: true,
                color: { rgb: colors.white }
            },
            alignment: {
                horizontal: 'center',
                vertical: 'center',
                wrapText: true
            },
            border: thinBlueBorder
        };

        const ytdPerStoreDataStyle = {
            fill: {
                patternType: 'solid',
                fgColor: { rgb: colors.paleGreen }
            },
            font: {
                name: 'Arial',
                sz: 8,
                color: { rgb: colors.black }
            },
            alignment: {
                horizontal: 'right',
                vertical: 'center'
            },
            border: thinBlueBorder
        };

        const quarterStyle = {
            fill: {
                patternType: 'solid',
                fgColor: { rgb: colors.paleGreen }
            },
            font: {
                name: 'Arial',
                sz: 8,
                color: { rgb: colors.black }
            },
            alignment: {
                horizontal: 'center',
                vertical: 'center',
                wrapText: true
            },
            border: thinLightBorder
        };

        // Top metadata rows
        setRangeStyle(worksheet, 0, 0, 4, lastColumn, metaStyle);

        // GL account yellow row
        setRangeStyle(worksheet, 3, 0, 3, 4, glAccountStyle);

        // Month row, equivalent to row 6 in Excel
        setRangeStyle(worksheet, 5, 0, 5, 8, {
            fill: {
                patternType: 'solid',
                fgColor: { rgb: colors.white }
            },
            font: {
                name: 'Arial',
                sz: 8,
                color: { rgb: colors.black }
            }
        });

        setRangeStyle(worksheet, 5, 9, 5, 32, monthHeaderStyle);
        setRangeStyle(worksheet, 5, 33, 5, 33, ytdStyle);
        setRangeStyle(worksheet, 5, 34, 5, 34, ytdPerStoreHeaderStyle);
        setRangeStyle(worksheet, 5, 35, 5, 35, quarterStyle);

        // Header row, equivalent to row 7 in Excel
        setRangeStyle(worksheet, 6, 0, 6, 33, columnHeaderStyle);
        setRangeStyle(worksheet, 6, 34, 6, 34, ytdPerStoreHeaderStyle);
        setRangeStyle(worksheet, 6, 35, 6, 35, quarterStyle);

        // Data rows
        for (let rowIndex = 7; rowIndex < rowCount; rowIndex += 1) {
            const entryCell = getWorksheetCell(worksheet, rowIndex, 0);
            const entry = String(entryCell?.v || '');

            const isSummaryRow = entry === 'Sales Tax';

            for (let columnIndex = 0; columnIndex <= lastColumn; columnIndex += 1) {
                let styleToApply = amountDataStyle;

                if (columnIndex <= 8) {
                    styleToApply = leftDataStyle;
                }

                if (columnIndex === 33) {
                    styleToApply = ytdStyle;
                }

                if (columnIndex === 34) {
                    styleToApply = ytdPerStoreDataStyle;
                }

                if (columnIndex === 35) {
                    styleToApply = quarterStyle;
                }

                if (
                    latestMonth &&
                    (
                        columnIndex === PAID_COL_BY_MONTH[latestMonth] ||
                        columnIndex === COLLECTED_COL_BY_MONTH[latestMonth]
                    )
                ) {
                    styleToApply = selectedMonthDataStyle;
                }

                setCellStyle(worksheet, rowIndex, columnIndex, styleToApply);

                if (isSummaryRow) {
                    applyCellStylePatch(worksheet, rowIndex, columnIndex, {
                        font: {
                            name: 'Arial',
                            sz: 8,
                            bold: true,
                            color: {
                                rgb: columnIndex === 33
                                    ? colors.white
                                    : colors.black
                            }
                        }
                    });
                }
            }

            // Entity and GL Account magenta, like the completed workbook
            applyCellStylePatch(worksheet, rowIndex, 2, {
                font: {
                    name: 'Arial',
                    sz: 8,
                    bold: true,
                    color: { rgb: colors.magenta }
                }
            });

            applyCellStylePatch(worksheet, rowIndex, 3, {
                font: {
                    name: 'Arial',
                    sz: 8,
                    bold: true,
                    color: { rgb: colors.magenta }
                }
            });
        }

        applyScheduleNumberFormats(worksheet, rowCount);
    }

    function createBorder(rgb) {
        return {
            top: {
                style: 'thin',
                color: { rgb }
            },
            bottom: {
                style: 'thin',
                color: { rgb }
            },
            left: {
                style: 'thin',
                color: { rgb }
            },
            right: {
                style: 'thin',
                color: { rgb }
            }
        };
    }

    function getWorksheetCell(worksheet, rowIndex, columnIndex) {
        const address = window.XLSX.utils.encode_cell({
            r: rowIndex,
            c: columnIndex
        });

        return worksheet[address];
    }

    function ensureWorksheetCell(worksheet, rowIndex, columnIndex) {
        const address = window.XLSX.utils.encode_cell({
            r: rowIndex,
            c: columnIndex
        });

        if (!worksheet[address]) {
            worksheet[address] = {
                t: 's',
                v: ''
            };
        }

        return worksheet[address];
    }

    function setCellStyle(worksheet, rowIndex, columnIndex, style) {
        const cell = ensureWorksheetCell(worksheet, rowIndex, columnIndex);
        cell.s = cloneExcelStyle(style);
    }

    function applyCellStylePatch(worksheet, rowIndex, columnIndex, patch) {
        const cell = ensureWorksheetCell(worksheet, rowIndex, columnIndex);

        cell.s = deepMergeExcelStyle(
            cell.s || {},
            cloneExcelStyle(patch)
        );
    }

    function setRangeStyle(worksheet, startRow, startCol, endRow, endCol, style) {
        for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
            for (let columnIndex = startCol; columnIndex <= endCol; columnIndex += 1) {
                setCellStyle(worksheet, rowIndex, columnIndex, style);
            }
        }
    }

    function cloneExcelStyle(style) {
        return JSON.parse(JSON.stringify(style || {}));
    }

    function deepMergeExcelStyle(target, source) {
        const output = {
            ...target
        };

        Object.keys(source || {}).forEach(key => {
            const sourceValue = source[key];
            const targetValue = output[key];

            if (
                sourceValue &&
                typeof sourceValue === 'object' &&
                !Array.isArray(sourceValue) &&
                targetValue &&
                typeof targetValue === 'object' &&
                !Array.isArray(targetValue)
            ) {
                output[key] = deepMergeExcelStyle(targetValue, sourceValue);
            } else {
                output[key] = sourceValue;
            }
        });

        return output;
    }



    function clearScheduleBuilder() {
        const dimensionInput = document.getElementById('pmDimensionBalanceFile');
        const monthlyInput = document.getElementById('pmMonthlyLedgerFile');

        if (dimensionInput) dimensionInput.value = '';
        if (monthlyInput) monthlyInput.value = '';

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

        initializePredefinedSchedule({ showStatus: true });
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

    async function saveUploadedScheduleDocuments() {
    return {
        ids: [],
        warning: ''
    };
}

    function addPendingSourceDocument(file, type, metadata = {}) {
        if (!file) return;

        const key = [
            type,
            file.name,
            file.size,
            file.lastModified
        ].join('|');

        const exists = pendingSourceDocuments.some(item => item.key === key);

        if (exists) return;

        pendingSourceDocuments.push({
            key,
            file,
            type,
            metadata
        });
    }

    async function uploadPendingSourceDocuments() {
        const uploadedIds = [];

        for (const item of pendingSourceDocuments) {
            const saved = await uploadPropertyDocument(item.file, item.type, item.metadata);

            if (saved?.id) {
                uploadedIds.push(saved.id);
            }
        }

        pendingSourceDocuments = [];

        if (uploadedIds.length) {
            linkedDocumentIds.push(...uploadedIds);
            linkedDocumentIds = Array.from(new Set(linkedDocumentIds.map(Number).filter(Boolean)));
        }

        return uploadedIds;
    }

    async function askScheduleSaveDestination() {
        if (window.Swal) {
            const result = await Swal.fire({
                title: '¿Qué quieres hacer?',
                text: 'Puedes descargar el Excel sin guardar archivos en servidor, o subir el schedule y sus archivos a la base de datos.',
                icon: 'question',
                showCancelButton: true,
                showDenyButton: true,
                confirmButtonText: 'Subir a servidor',
                denyButtonText: 'Descargar Excel',
                cancelButtonText: 'Cancelar',
                reverseButtons: true
            });

            if (result.isConfirmed) return 'server';
            if (result.isDenied) return 'download';

            return 'cancel';
        }

        const upload = confirm(
            'Aceptar = Subir a servidor\nCancelar = Descargar Excel'
        );

        return upload ? 'server' : 'download';
    }

    async function uploadPropertyDocument() {
    throw new Error('Source file uploads are disabled for Property Management. Only schedules are saved.');
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
    async function askScheduleSaveAction() {
        if (window.Swal) {
            const result = await Swal.fire({
                title: '¿Qué quieres hacer?',
                text: 'Puedes descargar el Excel o guardar solo el schedule en el servidor. Los archivos fuente no se subirán.',
                icon: 'question',
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonText: 'Subir schedule',
                denyButtonText: 'Descargar Excel',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#102a43',
                denyButtonColor: '#244c6b',
                cancelButtonColor: '#64748b',
                reverseButtons: true
            });

            if (result.isConfirmed) return 'server';
            if (result.isDenied) return 'download';

            return 'cancel';
        }

        const saveServer = confirm(
            'Aceptar = Subir solo el schedule al servidor\nCancelar = Descargar Excel'
        );

        return saveServer ? 'server' : 'download';
    }

    async function saveCurrentSchedule() {
        if (!scheduleRows.length) {
            setScheduleStatus('Build or open a schedule before saving.', 'error');
            return;
        }

        const action = await askScheduleSaveAction();

        if (action === 'cancel') {
            setScheduleStatus('Save cancelled.', 'info');
            return;
        }

        if (action === 'download') {
            exportScheduleWorkbook();
            setScheduleStatus(
                'Schedule downloaded. Nothing was uploaded to the server.',
                'success'
            );
            return;
        }

        const saveButton = document.getElementById('pmSaveScheduleBtn');
        const result = getScheduleResult();

        if (saveButton) saveButton.disabled = true;

        setScheduleStatus('Saving schedule on server. Source files will not be uploaded.', 'info');

        showServerLoading(
            'Saving schedule',
            'Only the schedule data will be saved. Source files will not be uploaded.'
        );

        try {
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
                documentIds: []
            };

            const path = currentScheduleId
                ? `/schedules/${encodeURIComponent(currentScheduleId)}`
                : '/schedules';

            const method = currentScheduleId ? 'PUT' : 'POST';

            const response = await apiJson(path, {
                method,
                body: payload
            });

            currentScheduleId = response.schedule?.id || currentScheduleId;
            linkedDocumentIds = [];

            await loadSavedSchedules();

            setScheduleStatus(
                'Schedule saved on server. No source files were uploaded.',
                'success'
            );

            showServerResult(
                'success',
                'Schedule saved',
                'Only the schedule was saved on the server. Source files were not uploaded.'
            );
        } catch (error) {
            setScheduleStatus(error.message || 'Schedule could not be saved.', 'error');

            showServerResult(
                'error',
                'Save failed',
                error.message || 'Schedule could not be saved.'
            );
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

    async function importMonthlyLedgerFile() {
        if (isImportingMonthlyFiles) return;

        const input = document.getElementById('pmMonthlyLedgerFile');
        const files = Array.from(input?.files || []);

        if (!scheduleRows.length) {
            setScheduleStatus('Load the Dimension Balance report first so the schedule has the store rows and opening balances.', 'error');
            return;
        }

        if (!files.length) {
            setScheduleStatus('Choose one or more monthly files first, for example JAN.xls and FEB.xls.', 'error');
            return;
        }

        isImportingMonthlyFiles = true;

        showPmLoading(`Reading ${files.length} monthly file${files.length === 1 ? '' : 's'}...`);
        setScheduleStatus(`Reading ${files.length} monthly file${files.length === 1 ? '' : 's'}...`, 'info');

        const importedResults = [];
        const failedFiles = [];

        try {
            for (const file of files) {
                try {
                    const rows = await readWorkbookRowsFromFile(file, file.name || 'Monthly report');
                    const transactions = parseGeneralLedger(rows);
                    const result = applyMonthlyLedgerTransactions(transactions, file.name);

                    importedResults.push({ file, result });

                } catch (fileError) {
                    failedFiles.push(`${file.name}: ${fileError.message || 'could not be imported'}`);
                    console.error(`Monthly GL import error for ${file.name}:`, fileError);
                }
            }

            renderSchedulePreview(getScheduleResult());
            if (!importedResults.length) {
                setScheduleStatus(
                    failedFiles.length
                        ? `No monthly files were imported. ${failedFiles.join(' ')}`
                        : 'No monthly files were imported.',
                    'error'
                );
                return;
            }
        } finally {
            isImportingMonthlyFiles = false;
            hidePmLoading();
        }

        const importedMonthNumbers = Array.from(new Set(
            importedResults.flatMap(item => item.result.months || [])
        )).sort((a, b) => a - b);
        const updatedStoreCount = importedResults.reduce((total, item) => total + (item.result.storeCount || 0), 0);
        const paymentRowCount = importedResults.reduce((total, item) => total + (item.result.paymentRows || 0), 0);
        const fileNames = importedResults.map(item => item.file.name).join(', ');
        const messages = [
            `${importedResults.length} file${importedResults.length === 1 ? '' : 's'} imported: ${fileNames}.`,
            importedMonthNumbers.length
                ? `Months updated: ${importedMonthNumbers.map(month => MONTH_NAMES[month]).join(', ')}.`
                : '',
            `${updatedStoreCount} store updates processed, ${paymentRowCount} payment rows added.`,
            failedFiles.length ? `Some files failed: ${failedFiles.join(' ')}` : '',
            pendingSourceDocuments.length
                ? `${pendingSourceDocuments.length} source file(s) pending. They will only be uploaded if you choose "Subir a servidor".`
                : '',
            'Save the schedule to download or upload it.'
        ].filter(Boolean);

        setScheduleStatus(
            messages.join(' '),
            failedFiles.length || documentWarnings.length ? 'warning' : 'success'
        );
    }

    function applyMonthlyLedgerTransactions(transactions, sourceName = '') {
        const usableTransactions = transactions
            .filter(item =>
                item?.location && item?.postedDate && (item.debit || item.credit)
            )
            .map(transaction =>
                normalizeMonthlyLedgerTransaction(transaction, sourceName)
            );

        if (!usableTransactions.length) {
            throw new Error('The monthly file does not contain usable transactions.');
        }

        const entityByStore = buildMonthlyEntityByStore(usableTransactions);

        const normalizedTransactions = usableTransactions.map(transaction => {
            const store = String(transaction.location || '').trim();
            const explicitEntity = getTransactionEntity(transaction);
            const resolvedEntity = explicitEntity || entityByStore.get(store) || '';

            return resolvedEntity
                ? { ...transaction, entity: resolvedEntity }
                : transaction;
        });

        const summaryMonths = new Set();
        const paymentMonths = new Set();
        const affectedStores = new Set();
        const collectedByStoreMonth = new Map();
        const paymentRows = [];
        const paymentRemovalKeys = new Set();
        const summaryClearKeys = new Set();

        normalizedTransactions.forEach(transaction => {
            const taxPeriodMonth = getTransactionTaxPeriodMonth(transaction);
            const paymentMonth = getTransactionPaymentMonth(transaction);
            const store = String(transaction.location || '').trim();
            const entity = getTransactionEntity(transaction);
            const storeEntityKey = getStoreEntityKey(store, entity);

            if (transaction.credit && taxPeriodMonth) {
                summaryMonths.add(taxPeriodMonth);
                summaryClearKeys.add(`${storeEntityKey}||${taxPeriodMonth}`);
            }

            if (transaction.debit && paymentMonth) {
                paymentMonths.add(paymentMonth);
            }
        });

        clearStoreSummaryMonthValuesForKeys(summaryClearKeys);

        normalizedTransactions.forEach(transaction => {
            const month = getTransactionTaxPeriodMonth(transaction);
            const summaryRow = findOrCreateStoreSummaryRow(transaction);
            const store = String(transaction.location || '').trim();
            const entity = getTransactionEntity(transaction) || getScheduleRowEntity(summaryRow);
            const storeEntityKey = getStoreEntityKey(store, entity);

            affectedStores.add(storeEntityKey);

            if (transaction.credit) {
                const key = `${storeEntityKey}||${month}`;
                const current = Number(collectedByStoreMonth.get(key) || 0);

                collectedByStoreMonth.set(
                    key,
                    roundMoney(current - Math.abs(transaction.credit))
                );
            }

            if (transaction.debit) {
                const paymentRow = createImportedPaymentRow(
                    {
                        ...transaction,
                        entity
                    },
                    summaryRow,
                    sourceName
                );

                paymentRows.push(paymentRow);

                const paymentTaxMonth = getScheduleRowTaxPeriodMonth(paymentRow);
                const paymentEntity = getScheduleRowEntity(paymentRow) || entity;
                const paymentKey = getImportedPaymentKey(
                    paymentRow[1],
                    paymentEntity,
                    paymentTaxMonth
                );

                paymentRemovalKeys.add(paymentKey);
            }
        });

        collectedByStoreMonth.forEach((amount, key) => {
            const [store, entity, monthText] = key.split('||');
            const month = Number(monthText);
            const collectedColumn = COLLECTED_COL_BY_MONTH[month];
            const summaryRow = findStoreSummaryRow(store, entity);

            if (!summaryRow || collectedColumn === undefined) return;

            summaryRow[collectedColumn] = roundMoney(amount);
        });

        removeImportedRowsForPaymentKeys(paymentRemovalKeys);

        paymentRows
            .sort(compareScheduleRowsForInsert)
            .forEach(row => insertRowForStore(row[1], row));

        recalculateScheduleRows();

        return {
            months: Array.from(new Set([...summaryMonths, ...paymentMonths])).sort((a, b) => a - b),
            taxPeriodMonths: Array.from(summaryMonths).sort((a, b) => a - b),
            paymentMonths: Array.from(paymentMonths).sort((a, b) => a - b),
            storeCount: affectedStores.size,
            collectedEntries: collectedByStoreMonth.size,
            paymentRows: paymentRows.length
        };
    }

    function buildMonthlyEntityByStore(transactions) {
        const entityByStore = new Map();
        const mixedStores = new Set();

        transactions.forEach(transaction => {
            const store = String(transaction.location || '').trim();
            const entity = getTransactionEntity(transaction);

            if (!store || !entity) return;

            const current = entityByStore.get(store);

            if (!current) {
                entityByStore.set(store, entity);
                return;
            }

            if (current !== entity) {
                mixedStores.add(store);
            }
        });

        mixedStores.forEach(store => {
            entityByStore.delete(store);
            console.warn(
                `Store ${store} has multiple entities in the same monthly file. Sales Tax rows without entity cannot be assigned automatically.`
            );
        });

        return entityByStore;
    }

    function clearStoreSummaryMonthValuesForKeys(keys) {
        if (!keys || !keys.size) return 0;

        let cleared = 0;

        keys.forEach(key => {
            const [store, entity, monthText] = key.split('||');
            const month = Number(monthText);
            const summaryRow = findStoreSummaryRow(store, entity);

            if (!summaryRow) return;

            const collectedColumn = COLLECTED_COL_BY_MONTH[month];
            const accrualColumn = ACCRUAL_COL_BY_MONTH[month];

            if (collectedColumn !== undefined) {
                summaryRow[collectedColumn] = '';
                cleared += 1;
            }

            if (accrualColumn !== undefined) {
                summaryRow[accrualColumn] = '';
            }
        });

        return cleared;
    }

    function getImportedPaymentKey(store, entity, taxPeriodMonth) {
        return [
            String(store || '').trim(),
            normalizeEntityCode(entity || ''),
            Number(taxPeriodMonth || 0)
        ].join('||');
    }

    function removeImportedRowsForPaymentKeys(paymentKeys) {
        if (!paymentKeys || !paymentKeys.size) return 0;

        const originalLength = scheduleRows.length;

        scheduleRows = scheduleRows.filter(row => {
            const reference = String(row[4] || '');
            const isImported = reference.startsWith(IMPORT_REFERENCE_PREFIX);

            if (!isImported) return true;

            const store = String(row[1] || '').trim();
            const entity = getScheduleRowEntity(row);
            const taxPeriodMonth = getScheduleRowTaxPeriodMonth(row);
            const key = getImportedPaymentKey(store, entity, taxPeriodMonth);

            return !paymentKeys.has(key);
        });

        return originalLength - scheduleRows.length;
    }



    function findOrCreateStoreSummaryRow(transaction) {
        const store = String(transaction.location || '').trim();
        const entity = getTransactionEntity(transaction);

        let summaryRow = findStoreSummaryRow(store, entity);

        if (summaryRow) {
            if (!summaryRow[2] && entity) {
                summaryRow[2] = entity;
            }

            if (!summaryRow[5]) {
                summaryRow[5] = transaction.state || '';
            }

            return summaryRow;
        }

        summaryRow = emptyScheduleRow();
        summaryRow[0] = 'Sales Tax';
        summaryRow[1] = store;
        summaryRow[2] = entity || transaction.entity || inferEntity(transaction.memo, store);
        summaryRow[3] = 241000;
        summaryRow[4] = 'Auto-created from monthly GL';
        summaryRow[5] = transaction.state || '';
        summaryRow[8] = 0;
        summaryRow[33] = sumRowBalance(summaryRow);

        scheduleRows.push(summaryRow);

        return summaryRow;
    }

    function createImportedPaymentRow(transaction, summaryRow, sourceName = '') {
        const row = buildPaymentRow(
            transaction,
            summaryRow?.[2] || transaction.entity || '',
            summaryRow?.[5] || transaction.state || ''
        );
        const taxPeriodMonth = getTransactionTaxPeriodMonth(transaction);
        const paymentMonth = getTransactionPaymentMonth(transaction);
        const taxPeriodLabel = MONTH_NAMES[taxPeriodMonth] || MONTH_NAMES[paymentMonth] || 'Monthly';
        const paymentLabel = paymentMonth && paymentMonth !== taxPeriodMonth
            ? ` paid in ${MONTH_NAMES[paymentMonth]}`
            : '';

        row[4] = `${IMPORT_REFERENCE_PREFIX} ${taxPeriodLabel}${paymentLabel}${sourceName ? ` - ${sourceName}` : ''}`;

        return row;
    }

    function getImportedPaymentKey(store, entity, taxPeriodMonth) {
        return [
            String(store || '').trim(),
            normalizeEntityCode(entity || ''),
            Number(taxPeriodMonth || 0)
        ].join('||');
    }

    function removeImportedRowsForPaymentKeys(paymentKeys) {
        if (!paymentKeys || !paymentKeys.size) return 0;

        const originalLength = scheduleRows.length;

        scheduleRows = scheduleRows.filter(row => {
            const reference = String(row[4] || '');
            const isImported = reference.startsWith(IMPORT_REFERENCE_PREFIX);

            if (!isImported) return true;

            const store = String(row[1] || '').trim();
            const entity = getScheduleRowEntity(row);
            const taxPeriodMonth = getScheduleRowTaxPeriodMonth(row);
            const key = getImportedPaymentKey(store, entity, taxPeriodMonth);

            return !paymentKeys.has(key);
        });

        return originalLength - scheduleRows.length;
    }

    function removeImportedRowsForMonths(months) {
        const monthSet = new Set(months.map(Number));
        const originalLength = scheduleRows.length;

        scheduleRows = scheduleRows.filter(row => {
            const reference = String(row[4] || '');
            const taxPeriodMonth = getScheduleRowTaxPeriodMonth(row);
            const isImported = reference.startsWith(IMPORT_REFERENCE_PREFIX);

            return !(isImported && monthSet.has(taxPeriodMonth));
        });

        return originalLength - scheduleRows.length;
    }

    function clearStoreSummaryMonthValues(months) {
        const monthSet = new Set(months.map(Number));

        scheduleRows.forEach(row => {
            if (row[0] !== 'Sales Tax') return;

            monthSet.forEach(month => {
                const collectedColumn = COLLECTED_COL_BY_MONTH[month];
                const accrualColumn = ACCRUAL_COL_BY_MONTH[month];

                if (collectedColumn !== undefined) row[collectedColumn] = '';
                if (accrualColumn !== undefined) row[accrualColumn] = '';
            });
        });
    }

    function compareScheduleRowsForInsert(a, b) {
        const storeCompare = naturalSort(a[1], b[1]);
        if (storeCompare) return storeCompare;

        const dateA = parseDateValue(a[6]);
        const dateB = parseDateValue(b[6]);
        const timeA = dateA ? dateA.getTime() : 0;
        const timeB = dateB ? dateB.getTime() : 0;

        if (timeA !== timeB) return timeA - timeB;
        return String(a[0] || '').localeCompare(String(b[0] || ''));
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
        const entity = getScheduleRowEntity(row);
        const lastStoreIndex = findLastStoreRowIndex(store, entity);
        const insertAt = lastStoreIndex >= 0 ? lastStoreIndex + 1 : scheduleRows.length;

        scheduleRows.splice(insertAt, 0, row);
    }

    function findLastStoreRowIndex(store, entity = '') {
        const normalizedStore = String(store || '').trim();
        const normalizedEntity = normalizeEntityCode(entity);

        for (let index = scheduleRows.length - 1; index >= 0; index -= 1) {
            const row = scheduleRows[index];
            const rowStore = String(row[1] || '').trim();
            const rowEntity = getScheduleRowEntity(row);

            if (rowStore !== normalizedStore) continue;

            if (!normalizedEntity || rowEntity === normalizedEntity) {
                return index;
            }
        }

        return -1;
    }

    function findStoreSummaryRow(store, entity = '') {
        const normalizedStore = String(store || '').trim();
        const normalizedEntity = normalizeEntityCode(entity);

        if (!normalizedStore) return null;

        if (normalizedEntity) {
            const exactRow = scheduleRows.find(row =>
                row[0] === 'Sales Tax' &&
                String(row[1] || '').trim() === normalizedStore &&
                getScheduleRowEntity(row) === normalizedEntity
            );

            if (exactRow) return exactRow;

            const emptyEntityRow = scheduleRows.find(row =>
                row[0] === 'Sales Tax' &&
                String(row[1] || '').trim() === normalizedStore &&
                !getScheduleRowEntity(row)
            );

            if (emptyEntityRow) return emptyEntityRow;

            return null;
        }

        return scheduleRows.find(row =>
            row[0] === 'Sales Tax' &&
            String(row[1] || '').trim() === normalizedStore
        ) || null;
    }

    function recalculateScheduleRows() {
        const groups = new Map();

        scheduleRows.forEach((row, index) => {
            const store = String(row[1] || '').trim();

            if (!store) return;

            const key = getScheduleRowGroupKey(row);

            if (!groups.has(key)) {
                groups.set(key, []);
            }

            groups.get(key).push(index);
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
            const groupRows = indexes.map(index => scheduleRows[index]);
            const summary = groupRows.find(row => row[0] === 'Sales Tax');

            scheduleRows[lastIndex][34] = total;
            applyQuarterReviewToGroup(groupRows, summary);
        });

        scheduleStoreCount = groups.size;
    }

    function getScheduleResult() {
        recalculateScheduleRows();
        return {
            rows: scheduleRows,
            storeCount: countScheduleStores(scheduleRows),
            totalBalance: getScheduleTotalBalance(scheduleRows)
        };
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

    function showPmLoading(message = 'Files are uploading...') {
        const stack = document.getElementById('pmAlertStack');
        if (!stack) return;

        hidePmLoading();

        const alert = document.createElement('article');
        alert.className = 'pm-alert is-info pm-loading-alert';
        alert.id = 'pm-loading-alert';
        alert.setAttribute('role', 'status');
        alert.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
            <div>
                <strong>Uploading files</strong>
                <span>${escapeHtml(message)}</span>
            </div>
        `;

        stack.prepend(alert);
    }

    function hidePmLoading() {
        document.getElementById('pm-loading-alert')?.remove();
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
        if (window.Swal && message) {
            window.Swal.fire({
                toast: true,
                position: 'top-end',
                icon: type === 'warning' ? 'warning' : type === 'error' ? 'error' : type === 'success' ? 'success' : 'info',
                title,
                text: message,
                showConfirmButton: false,
                timer: timeout || 4500,
                timerProgressBar: true
            });
            return;
        }

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

        const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (iso) {
            return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
        }

        const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (slash) {
            const first = Number(slash[1]);
            const second = Number(slash[2]);
            const year = Number(slash[3]);

            // DD/MM/YYYY: 30/04/2026
            if (first > 12 && second <= 12) {
                return new Date(year, second - 1, first);
            }

            // MM/DD/YYYY: 04/30/2026
            if (second > 12 && first <= 12) {
                return new Date(year, first - 1, second);
            }

            // Caso ambiguo: 02/03/2026.
            // Mantengo formato US porque muchas fechas de Excel salen MM/DD/YYYY.
            return new Date(year, first - 1, second);
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

    function getTransactionEntity(transaction) {
        const location = transaction?.location;
        const fallback =
            transaction?.entity ||
            inferEntity(transaction?.memo, transaction?.location);

        return getEntityByLocation(location, fallback);
    }

    function getScheduleRowEntity(row) {
        const location = row?.[1];
        const fallback =
            row?.[2] ||
            inferEntity(`${row?.[0] || ''} ${row?.[4] || ''}`, row?.[1]);

        return getEntityByLocation(location, fallback);
    }

    function getStoreEntityKey(store, entity) {
        return [
            String(store || '').trim(),
            normalizeEntityCode(entity || '')
        ].join('||');
    }

    function getScheduleRowGroupKey(row) {
        return getStoreEntityKey(row?.[1], getScheduleRowEntity(row));
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

    function formatAccountingNumber(value, options = {}) {
        const number = Number(value || 0);
        const rounded = Math.round(number * 100) / 100;
        const isNegative = rounded < 0;
        const formatter = new Intl.NumberFormat('en-US', {
            ...(options.currency ? {
                style: 'currency',
                currency: 'USD'
            } : {}),
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        const formatted = formatter.format(Math.abs(rounded || 0));

        return isNegative ? `(${formatted})` : formatted;
    }

    function formatCurrency(value) {
        return formatAccountingNumber(value, { currency: true });
    }

    function formatNumber(value) {
        return formatAccountingNumber(value);
    }

    function formatGeneralNumber(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) return String(value ?? '');
        if (Number.isInteger(number)) return String(number);

        return String(number).replace(/\.0+$/, '');
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


