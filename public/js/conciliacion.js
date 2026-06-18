// ============================================
// SISTEMA DE CONCILIACION
// ============================================

window.API_URL
// Estado global
let restaurantes = [];
let templates = [];
let templateActual = null;
let datosExtraidos = [];
let valoresEsperados = {};
let salesFile = null;
let ebtFile = null;
let salesDetailFile = null;
let currentRestaurantConfig = null;
let salesWorkbook = null;
let ebtWorkbook = null;
let salesDetailWorkbook = null;
let editandoIndex = -1;
let workbook = null;
let fechaConciliacionActual = null;
let ebtPorTienda = {};
let salesRows = [];
let salesDetailRows = [];
let fechaSeleccionada = null;
let fechaEBTSeleccionada = '';
let fechaSalesDetailSeleccionada = '';

let filtroStore = '';
let filtroStoreName = '';

let fechaSalesSeleccionada = null;

function resetSelectFecha(selectId, texto = 'Todas las fechas') {
    const select = document.getElementById(selectId);

    if (select) {
        select.innerHTML = `<option value="">${texto}</option>`;
    }
}

function setUploadCardStatus(inputId, type = '', message = '') {
    const input =
        document.getElementById(inputId);
    const card =
        input?.closest('.upload-card');

    if (!card) return;

    let status =
        card.querySelector('.upload-status');
    const removeButton =
        card.querySelector('.upload-remove-btn');

    if (!status) {
        status = document.createElement('div');
        status.className = 'upload-status';
        card.appendChild(status);
    }

    card.dataset.status = type;
    status.textContent = message;

    if (removeButton) {
        removeButton.hidden = !type;
    }
}

function limpiarResultadosCargados() {
    datosExtraidos = [];

    const head =
        document.getElementById('conciliacionTableHead');
    const body =
        document.getElementById('conciliacionBody');
    const results =
        document.getElementById('resultsSection');

    if (head) head.innerHTML = '';
    if (body) body.innerHTML = '';
    if (results) results.style.display = 'none';
}

function eliminarArchivoIndividual(tipo) {
    if (tipo === 'sales') {
        salesFile = null;
        salesWorkbook = null;
        salesRows = [];
        workbook = null;
        fechaSalesSeleccionada = null;

        const input =
            document.getElementById('salesFile');

        if (input) input.value = '';

        resetSelectFecha(
            'salesDateFilter',
            'Todas las fechas'
        );

        setUploadCardStatus('salesFile');
        limpiarResultadosCargados();
        return;
    }

    if (tipo === 'salesDetail') {
        salesDetailFile = null;
        salesDetailWorkbook = null;
        salesDetailRows = [];
        fechaSalesDetailSeleccionada = '';

        const input =
            document.getElementById('salesDetailFile');

        if (input) input.value = '';

        resetSelectFecha(
            'salesDetailDateFilter',
            'Todas las fechas'
        );

        setUploadCardStatus('salesDetailFile');
    }

    if (tipo === 'ebt') {
        ebtFile = null;
        ebtWorkbook = null;
        ebtPorTienda = {};
        fechaEBTSeleccionada = '';

        const input =
            document.getElementById('ebtFile');

        if (input) input.value = '';

        resetSelectFecha(
            'ebtDateFilter',
            'Todas las fechas'
        );

        setUploadCardStatus('ebtFile');
    }

    if (
        salesWorkbook &&
        currentRestaurantConfig
    ) {
        generarConciliacionDesdeTemplate();
    }
}

function limpiarArchivosExtraTacoBell() {
    salesDetailFile = null;
    salesDetailWorkbook = null;
    salesDetailRows = [];
    fechaSalesDetailSeleccionada = '';

    ebtFile = null;
    ebtWorkbook = null;
    ebtPorTienda = {};
    fechaEBTSeleccionada = '';

    const salesDetailInput =
        document.getElementById('salesDetailFile');
    const ebtInput =
        document.getElementById('ebtFile');

    if (salesDetailInput) {
        salesDetailInput.value = '';
    }

    if (ebtInput) {
        ebtInput.value = '';
    }

    resetSelectFecha(
        'salesDetailDateFilter',
        'Todas las fechas'
    );

    resetSelectFecha(
        'ebtDateFilter',
        'Todas las fechas'
    );

    setUploadCardStatus('salesDetailFile');
    setUploadCardStatus('ebtFile');
}

function actualizarUploadsPorRestaurante(codigo) {
    const mostrarExtras =
        codigo === 'taco-bell';
    const badge =
        document.getElementById('uploadModeBadge');

    document
        .querySelectorAll('.taco-bell-extra-upload')
        .forEach(card => {
            card.style.display = mostrarExtras ? '' : 'none';
        });

    if (badge) {
        const texto =
            codigo === 'taco-bell'
                ? 'Taco Bell: 3 archivos'
                : codigo === 'popeyes'
                    ? 'Popeyes: 1 archivo'
                    : 'Selecciona restaurante';

        badge.textContent = texto;
        badge.dataset.mode = codigo || 'empty';
    }

    if (!mostrarExtras) {
        limpiarArchivosExtraTacoBell();
    }
}

// ============================================
// INICIALIZACION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Verificar autenticacion
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    // Establecer fecha actual
    document.getElementById('fechaConciliacion').valueAsDate = new Date();

    // Cargar restaurantes
    await cargarRestaurantes();

    actualizarUploadsPorRestaurante('');

    // Verificar si viene un restaurante en la URL
    const urlParams = new URLSearchParams(window.location.search);
    const restauranteId = urlParams.get('restaurante');
    if (restauranteId) {
        document.getElementById('selectRestaurante').value = restauranteId;
        await onRestauranteChange();
    }

    // Event listeners
    initEventListeners();
});

function initEventListeners() {

    // ==========================
    // Restaurante
    // ==========================

    const restauranteSelect =
        document.getElementById(
            'selectRestaurante'
        );

    if (restauranteSelect) {

        restauranteSelect.addEventListener(
            'change',
            onRestauranteChange
        );

    }

    // ==========================
    // Template
    // ==========================

    const templateSelect =
        document.getElementById(
            'selectTemplate'
        );

    if (templateSelect) {

        templateSelect.addEventListener(
            'change',
            onTemplateChange
        );

    }

    // ==========================
    // Fecha
    // ==========================

    const fechaInput =
        document.getElementById(
            'fechaConciliacion'
        );

    if (fechaInput) {

        fechaInput.addEventListener(
            'change',
            () => {

                fechaSeleccionada =
                    fechaInput.value;

                if (
                    salesWorkbook &&
                    currentRestaurantConfig
                ) {

                    generarConciliacionDesdeTemplate();

                }

            }
        );

    }

    // ==========================
    // SALES FILE
    // ==========================

    const salesInput =
        document.getElementById(
            'salesFile'
        );

    if (salesInput) {

        salesInput.addEventListener(
            'change',
            async (e) => {

                const file =
                    e.target.files[0];

                if (!file) return;

                salesFile = file;

                try {

                    const buffer =
                        await file.arrayBuffer();

                    const codigo =
                        document
                            .getElementById('selectRestaurante')
                            ?.selectedOptions[0]
                            ?.dataset?.codigo;

                    try {

                        salesWorkbook = XLSX.read(buffer, {
                            type: 'array',
                            raw: false,
                            cellDates: true
                        });

                    } catch (error) {

                        if (codigo === 'burger-king') {

                            console.warn(
                                'Burger King no se pudo leer como Excel. Intentando leer como texto CSV...',
                                error
                            );

                            const texto = await file.text();

                            const separador =
                                texto.includes('\t')
                                    ? '\t'
                                    : texto.includes(';')
                                        ? ';'
                                        : ',';

                            const filas = texto
                                .split(/\r?\n/)
                                .filter(linea => linea.trim() !== '')
                                .map(linea =>
                                    linea
                                        .split(separador)
                                        .map(celda =>
                                            celda
                                                .replace(/^"|"$/g, '')
                                                .trim()
                                        )
                                );

                            const hoja = XLSX.utils.aoa_to_sheet(filas);

                            salesWorkbook = XLSX.utils.book_new();

                            XLSX.utils.book_append_sheet(
                                salesWorkbook,
                                hoja,
                                'Sales POS'
                            );

                        } else {

                            console.error(error);

                            Swal.fire(
                                'Archivo no compatible',
                                'Este archivo viene protegido o con formato no compatible.',
                                'error'
                            );

                            setUploadCardStatus(
                                'salesFile',
                                'error',
                                'Archivo protegido o formato no compatible'
                            );

                            return;

                        }

                    }



                    salesWorkbook.SheetNames.forEach(name => {

                        const ws =
                            salesWorkbook.Sheets[name];

                        const rows =
                            XLSX.utils.sheet_to_json(
                                ws,
                                {
                                    header: 1
                                }
                            );

                    });

                    workbook =
                        salesWorkbook;

                    const sheetName =
                        detectarHojaOrigen(
                            salesWorkbook
                        );

                    const sheet =
                        salesWorkbook.Sheets[
                        sheetName
                        ];


                    const headersRequeridos =
                        ['popeyes', 'burger-king'].includes(codigo)
                            ? [
                                'Accounting Date',
                                'Unit Number',
                                'Account'
                            ]
                            : [
                                'Store',
                                'Date'
                            ];

                    const campoFecha =
                        ['popeyes', 'burger-king'].includes(codigo)
                            ? 'Accounting Date'
                            : 'Date';

                    salesRows =
                        leerFilasExcel(
                            sheet,
                            headersRequeridos,
                            0
                        );


                    cargarFechasEnFiltro(
                        salesRows,
                        'salesDateFilter',
                        campoFecha
                    );

                    setUploadCardStatus(
                        'salesFile',
                        'loaded',
                        `${file.name} cargado (${salesRows.length} filas)`
                    );

                    generarConciliacionDesdeTemplate();

                } catch (error) {

                    console.error(error);

                    setUploadCardStatus(
                        'salesFile',
                        'error',
                        'No se pudo leer el archivo'
                    );

                    Swal.fire(
                        'Error',
                        'No se pudo leer el archivo Sales',
                        'error'
                    );

                }

            }
        );

    }

    // ==========================
    // SALES DETAIL FILE
    // ==========================

    const salesDetailInput =
        document.getElementById(
            'salesDetailFile'
        );

    if (salesDetailInput) {

        salesDetailInput.addEventListener(
            'change',
            async (e) => {

                const file =
                    e.target.files[0];

                if (!file) return;

                salesDetailFile = file;

                try {

                    const buffer =
                        await file.arrayBuffer();

                    salesDetailWorkbook =
                        XLSX.read(
                            buffer,
                            {
                                type: 'array'
                            }
                        );

                    const sheetName =
                        typeof detectarHojaSalesDetail === 'function'
                            ? detectarHojaSalesDetail(
                                salesDetailWorkbook
                            )
                            : salesDetailWorkbook.SheetNames[0];

                    const sheet =
                        salesDetailWorkbook.Sheets[
                        sheetName
                        ];

                    salesDetailRows =
                        leerFilasExcel(
                            sheet,
                            ['Store Number', 'Business Date'],
                            ''
                        );

                    if (!salesDetailRows.length) {
                        throw new Error(
                            'No se encontraron filas validas'
                        );
                    }

                    cargarFechasEnFiltro(
                        salesDetailRows,
                        'salesDetailDateFilter',
                        'Business Date'
                    );

                    const tiendasPrincipales = new Set(
                        salesRows
                            .map(row =>
                                typeof claveTiendaTacoBell === 'function'
                                    ? claveTiendaTacoBell(row.Store)
                                    : String(row.Store || '')
                            )
                            .filter(Boolean)
                    );

                    const tiendasDetalle = new Set(
                        salesDetailRows
                            .map(row =>
                                typeof claveTiendaTacoBell === 'function'
                                    ? claveTiendaTacoBell(row['Store Number'])
                                    : String(row['Store Number'] || '')
                            )
                            .filter(Boolean)
                    );

                    const tiendasNuevas =
                        [...tiendasDetalle]
                            .filter(store =>
                                !tiendasPrincipales.has(store)
                            )
                            .length;

                    setUploadCardStatus(
                        'salesDetailFile',
                        'loaded',
                        `${file.name} cargado (${salesDetailRows.length} filas, ${tiendasNuevas} tiendas nuevas)`
                    );

                    if (
                        salesWorkbook &&
                        currentRestaurantConfig
                    ) {

                        generarConciliacionDesdeTemplate();

                    }

                } catch (error) {

                    console.error(error);

                    setUploadCardStatus(
                        'salesDetailFile',
                        'error',
                        error.message || 'No se pudo leer el archivo'
                    );

                    Swal.fire(
                        'Error',
                        error.message || 'No se pudo leer el Sales Detail Export',
                        'error'
                    );

                }

            }
        );

    }

    // ==========================
    // EBT FILE
    // ==========================

    const ebtInput =
        document.getElementById(
            'ebtFile'
        );

    if (ebtInput) {

        ebtInput.addEventListener(
            'change',
            async (e) => {

                const file =
                    e.target.files[0];

                if (!file) return;

                ebtFile = file;

                const buffer =
                    await file.arrayBuffer();

                ebtWorkbook =
                    XLSX.read(
                        buffer,
                        { type: 'array' }
                    );

                const hoja =
                    obtenerHojaPorNombre(
                        ebtWorkbook,
                        [
                            'Net Sales',
                            'EBT AMOUNTS'
                        ]
                    );

                if (!hoja) {

                    Swal.fire(
                        'Error',
                        'No existe la hoja Net Sales o EBT AMOUNTS',
                        'error'
                    );

                    return;
                }

                const rows =
                    leerFilasExcel(
                        hoja,
                        ['Funded Date'],
                        ''
                    );

                cargarFechasEnFiltro(
                    rows,
                    'ebtDateFilter',
                    'Funded Date'
                );

                setUploadCardStatus(
                    'ebtFile',
                    'loaded',
                    `${file.name} cargado (${rows.length} filas)`
                );

                procesarEBT();

                if (salesWorkbook) {

                    generarConciliacionDesdeTemplate();

                }

            }
        );

    }


    // ==========================
    // Drag & Drop
    // ==========================

    const dropZone =
        document.getElementById(
            'dropZone'
        );

    if (dropZone && salesInput) {

        dropZone.addEventListener(
            'click',
            () => salesInput.click()
        );

        dropZone.addEventListener(
            'dragover',
            (e) => {

                e.preventDefault();

                dropZone.classList.add(
                    'dragover'
                );

            }
        );

        dropZone.addEventListener(
            'dragleave',
            () => {

                dropZone.classList.remove(
                    'dragover'
                );

            }
        );

        dropZone.addEventListener(
            'drop',
            async (e) => {

                e.preventDefault();

                dropZone.classList.remove(
                    'dragover'
                );

                const file =
                    e.dataTransfer.files[0];

                if (!file)
                    return;

                salesInput.files =
                    e.dataTransfer.files;

                salesInput.dispatchEvent(
                    new Event('change')
                );

            }
        );

    }

    // ==========================
    // Botones
    // ==========================

    document
        .getElementById(
            'btnRemoveFile'
        )
        ?.addEventListener(
            'click',
            removerArchivo
        );

    document
        .getElementById('removeSalesFile')
        ?.addEventListener(
            'click',
            () => eliminarArchivoIndividual('sales')
        );

    document
        .getElementById('removeSalesDetailFile')
        ?.addEventListener(
            'click',
            () => eliminarArchivoIndividual('salesDetail')
        );

    document
        .getElementById('removeEbtFile')
        ?.addEventListener(
            'click',
            () => eliminarArchivoIndividual('ebt')
        );

    document
        .getElementById(
            'btnGuardar'
        )
        ?.addEventListener(
            'click',
            saveConciliacion
        );

    document
        .getElementById(
            'btnExportPdf'
        )
        ?.addEventListener(
            'click',
            exportarPDF
        );

    document
        .getElementById(
            'btnHistorial'
        )
        ?.addEventListener(
            'click',
            abrirHistorial
        );


    document
        .getElementById('filterStore')
        ?.addEventListener('input', (e) => {

            filtroStore = e.target.value
                .trim()
                .toLowerCase();

            renderTablaSucursales();

        });

    document
        .getElementById('filterStoreName')
        ?.addEventListener('input', (e) => {

            filtroStoreName = e.target.value
                .trim()
                .toLowerCase();

            renderTablaSucursales();

        });

    document
        .getElementById('filterStoreSelect')
        ?.addEventListener('change', (e) => {

            filtroStore = e.target.value;

            renderTablaSucursales();

        });

    document
        .getElementById('filterStore')
        ?.addEventListener(
            'change',
            e => {

                filtroStore =
                    e.target.value;

                renderTablaSucursales();

            }
        );
    document
        .getElementById('ebtDateFilter')
        ?.addEventListener(
            'change',
            e => {

                fechaEBTSeleccionada =
                    e.target.value;

                procesarEBT();

                if (salesWorkbook) {

                    generarConciliacionDesdeTemplate();

                }

            }
        );

    document
        .getElementById('salesDetailDateFilter')
        ?.addEventListener(
            'change',
            e => {

                fechaSalesDetailSeleccionada =
                    e.target.value;

                if (
                    salesWorkbook &&
                    currentRestaurantConfig
                ) {

                    generarConciliacionDesdeTemplate();

                }

            }
        );

    document.querySelectorAll('.tab-btn')
        .forEach(btn => {

            btn.addEventListener('click', () => {

                document
                    .querySelectorAll('.tab-btn')
                    .forEach(b => b.classList.remove('active'));

                btn.classList.add('active');

                activeTab =
                    btn.dataset.tab;

                renderActiveTab();

            });

        });

    document.querySelectorAll('.tab-btn').forEach(btn => {

        btn.addEventListener('click', () => {

            document
                .querySelectorAll('.tab-btn')
                .forEach(b => b.classList.remove('active'));

            btn.classList.add('active');

            const tab = btn.dataset.tab;
        });

    });

    document
        .getElementById('btnExportCsv')
        ?.addEventListener(
            'click',
            exportarTabActualCSV
        );

}

// ============================================
// CARGA DE DATOS
// ============================================

async function cargarRestaurantes() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${window.API_URL}/restaurantes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            restaurantes = data.restaurantes || data;
            renderRestaurantes();
        }
    } catch (error) {
        console.log(restaurantes);
        console.error('Error cargando restaurantes:', error);
        Swal.fire('Error', 'No se pudieron cargar los restaurantes', 'error');
    }
}

function renderRestaurantes() {

    const select =
        document.getElementById(
            'selectRestaurante'
        );

    select.innerHTML =
        '<option value="">Selecciona un restaurante...</option>';

    restaurantes
        .filter(r =>
            [
                'taco-bell',
                'popeyes',
                'burger-king'
            ].includes(r.codigo)
        )
        .forEach(r => {

            select.innerHTML += `
                <option
                    value="${r.id}"
                    data-codigo="${r.codigo || ''}"
                >
                    ${r.nombre}
                </option>
            `;

        });

}

async function cargarTemplates(restauranteId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${window.API_URL}/conciliaciones/templates?restaurante_id=${restauranteId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            templates = data.templates || [];
            renderTemplates();
        }
    } catch (error) {
        console.error('Error cargando templates:', error);
    }
}

function renderTemplates() {
    const select = document.getElementById('selectTemplate');
    select.disabled = templates.length === 0;

    if (templates.length === 0) {
        select.innerHTML = '<option value="">No hay templates disponibles</option>';
        return;
    }

    select.innerHTML = '<option value="">Selecciona un template...</option>';
    templates.forEach(t => {
        const defaultLabel = t.es_default ? ' (Por defecto)' : '';
        select.innerHTML += `<option value="${t.id}" ${t.es_default ? 'selected' : ''}>${t.nombre}${defaultLabel}</option>`;
    });

    // Si hay uno por defecto, seleccionarlo automaticamente
    const defaultTemplate = templates.find(t => t.es_default);
    if (defaultTemplate) {
        select.value = defaultTemplate.id;
        onTemplateChange();
    }
}


async function cargarValoresEsperados() {
    const restauranteId = document.getElementById('selectRestaurante').value;
    const fecha = document.getElementById('fechaConciliacion').value;

    if (!restauranteId || !fecha) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${window.API_URL}/conciliaciones/valores-esperados/${restauranteId}/${fecha}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            valoresEsperados = data.valores || {};

            // Re-renderizar si ya hay datos extraidos
            if (datosExtraidos.length > 0) {
                renderTablaSucursales();
            }
        }
    } catch (error) {
        console.error('Error cargando valores esperados:', error);
    }
}

// ============================================
// EVENT HANDLERS
// ============================================

async function onRestauranteChange() {

    const select =
        document.getElementById(
            'selectRestaurante'
        );

    const restauranteId =
        select.value;

    const codigo =
        select.selectedOptions[0]
            ?.dataset?.codigo;

    currentRestaurantConfig =
        window.RestaurantConfigs?.[
        codigo
        ] || null;

    actualizarUploadsPorRestaurante(codigo);

    const tacoTabs =
        document.getElementById(
            'tacoBellTabs'
        );

    const popeyesTabs =
        document.getElementById(
            'popeyesTabs'
        );

    const burgerKingTabs =
        document.getElementById(
            'burgerKingTabs'
        );

    if (tacoTabs)
        tacoTabs.style.display = 'none';

    if (popeyesTabs)
        popeyesTabs.style.display = 'none';

    if (burgerKingTabs)
        burgerKingTabs.style.display = 'none';

    if (codigo === 'burger-king') {

        activeTab = 'conciliation';

        if (burgerKingTabs)
            burgerKingTabs.style.display = 'flex';

    }

    if (codigo === 'taco-bell') {

        activeTab = 'dailySales';

        if (tacoTabs)
            tacoTabs.style.display = 'flex';

    }

    if (codigo === 'popeyes') {

        activeTab = 'conciliation';

        if (popeyesTabs)
            popeyesTabs.style.display = 'flex';

    }

    document
        .querySelectorAll('#tacoBellTabs .tab-btn, #popeyesTabs .tab-btn, #burgerKingTabs .tab-btn')
        .forEach(btn => {

            btn.classList.toggle(
                'active',
                btn.dataset.tab === activeTab
            );

        });


    if (!restauranteId) {

        document.getElementById(
            'selectTemplate'
        ).disabled = true;

        document.getElementById(
            'selectTemplate'
        ).innerHTML =
            '<option value="">Selecciona primero un restaurante</option>';

        templateActual = null;

        return;
    }

    await cargarTemplates(
        restauranteId
    );

    await cargarValoresEsperados();
}

function onTemplateChange() {

    const templateId =
        document.getElementById(
            'selectTemplate'
        ).value;

    templateActual =
        templates.find(
            t => t.id == templateId
        ) || null;

    if (
        workbook &&
        templateActual
    ) {

        extraerDatos();

    }

}

function onFechaChange() {
    cargarValoresEsperados();
}

// ============================================
// PROCESAMIENTO DE ARCHIVO
// ============================================

async function procesarArchivo(file) {

    try {

        const buffer =
            await file.arrayBuffer();

        workbook =
            XLSX.read(
                buffer,
                {
                    type: 'array'
                }
            );

        salesWorkbook =
            workbook;

        console.log(
            'Workbook cargado:',
            workbook.SheetNames
        );

        if (templateActual) {

            extraerDatos();

        }

    } catch (error) {

        console.error(error);

        Swal.fire(
            'Error',
            'No se pudo leer el archivo',
            'error'
        );

    }

}

function combineTemplateWithUserExcel(
    templateWorkbook,
    userWorkbook
) {

    const resultWorkbook =
        XLSX.utils.book_new();

    // Copiar hojas usuario
    userWorkbook.SheetNames.forEach(
        sheetName => {

            XLSX.utils.book_append_sheet(
                resultWorkbook,
                userWorkbook.Sheets[
                sheetName
                ],
                sheetName
            );

        }
    );

    // Agregar Conciliation del template
    if (
        templateWorkbook.Sheets[
        'Conciliation'
        ]
    ) {

        XLSX.utils.book_append_sheet(
            resultWorkbook,
            templateWorkbook.Sheets[
            'Conciliation'
            ],
            'Conciliation'
        );

        console.log(
            'Conciliation copiada desde template'
        );

    } else {

        console.warn(
            'Template sin hoja Conciliation'
        );

    }

    return resultWorkbook;
}

function removerArchivo() {
    archivoActual = null;
    salesFile = null;
    ebtFile = null;
    salesDetailFile = null;
    workbook = null;
    salesWorkbook = null;
    ebtWorkbook = null;
    salesDetailWorkbook = null;
    datosExtraidos = [];
    salesRows = [];
    salesDetailRows = [];
    ebtPorTienda = {};

    const dropZone =
        document.getElementById('dropZone');

    if (dropZone) {
        dropZone.style.display = 'block';
    }

    document.getElementById('fileLoaded').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';

    [
        'salesFile',
        'salesDetailFile',
        'ebtFile'
    ].forEach(id => {

        const input =
            document.getElementById(id);

        if (input) {
            input.value = '';
        }

        setUploadCardStatus(id);

    });
}

function extraerDatos() {
    if (!workbook || !templateActual) return;

    datosExtraidos = [];

    // ============================================
    // DETECTAR DAILY SALES AUTOMATICAMENTE
    // ============================================
    // Si existe la hoja Conciliation, usarla
    if (currentRestaurantConfig) {

        console.log(
            'Generando conciliación desde configuración'
        );

        generarConciliacionDesdeTemplate();
        return;

        const config = templateActual.configuracion;

        let sheetName;

        if (typeof config.hoja === 'number') {
            sheetName = workbook.SheetNames[config.hoja];
        } else if (typeof config.hoja === 'string') {
            sheetName = config.hoja;
        } else {
            sheetName = workbook.SheetNames[0];
        }

        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
            Swal.fire(
                'Error',
                `No se encontró la hoja "${config.hoja}" en el archivo`,
                'error'
            );
            return;
        }

        config.conceptos.forEach(concepto => {

            let valorExcel = 0;

            if (concepto.celdaValor) {

                const cell = sheet[concepto.celdaValor];

                valorExcel = cell
                    ? parseFloat(
                        String(cell.v || cell.w || 0)
                            .replace(/[$,]/g, '')
                    ) || 0
                    : 0;

            } else if (concepto.fila && config.columnas.valor) {

                const cellRef =
                    config.columnas.valor + concepto.fila;

                const cell = sheet[cellRef];

                valorExcel = cell
                    ? parseFloat(
                        String(cell.v || cell.w || 0)
                            .replace(/[$,]/g, '')
                    ) || 0
                    : 0;
            }

            const esperadoInfo =
                valoresEsperados[concepto.nombre] || {};

            const valorEsperado =
                esperadoInfo.valor || 0;

            datosExtraidos.push({
                concepto: concepto.nombre,
                valorExcel,
                valorEsperado,
                diferencia: valorExcel - valorEsperado,
                tipo: concepto.tipo || 'moneda'
            });

        });

        document.getElementById(
            'resultsSection'
        ).style.display = 'block';

        renderTablaSucursales();
        actualizarResumen();
    }

    function extraerDailySales() {

        const conciliationSheet =
            workbook.Sheets['Conciliation'];

        if (!conciliationSheet) {
            throw new Error(
                'No se encontró la hoja Conciliation'
            );
        }

        const conciliationRows =
            XLSX.utils.sheet_to_json(
                conciliationSheet,
                { defval: 0 }
            );

        console.log(
            'Filas conciliación:',
            conciliationRows.length
        );



        const rowsLimpios =
            conciliationRows.filter(
                row =>
                    row['Store'] &&
                    String(row['Store']).trim() !== ''
            );

        console.log('TOTAL FILAS:', conciliationRows.length);
        console.log('FILAS LIMPIAS:', rowsLimpios.length);
        console.log(rowsLimpios[0]);

        datosExtraidos = rowsLimpios.map(row => ({

            store: row['Store'] || '',

            salesTax: row['Sales TAX'] || 0,

            grossSalesPos: row['Gross Sales POS'] || 0,

            discounts: row['Discounts'] || 0,

            promo: row['Promo'] || 0,

            donations: row['Donations'] || 0,

            netSales: row['Net Sales'] || 0,

            gcSold: row['GC Sold'] || 0,

            paidOut: row['Paid Out'] || 0,

            paidIn: row['Paid In'] || 0,

            donation: row['Donation'] || 0,

            totalRevenue: row['Total Revenue'] || 0,

            mastercard: row['Mastercard'] || 0,

            visa: row['Visa'] || 0,

            discover: row['Discover'] || 0,

            amex: row['Amex'] || 0,

            debit: row['Debit'] || 0,

            ebt: row['EBT'] || 0,

            gcRedeem: row['GC Redeem'] || 0,

            acctCash: row['Acct Cash'] || 0,

            deposits: row['Deposits'] || 0,

            gh: row['GH'] || 0,

            uber: row['Uber'] || 0,

            dd: row['DD'] || 0,

            ccTotals: row['CC Totals'] || 0,

            paymentsTotal: row['Payments Total'] || 0,

            osSlash: row['O/S'] || 0,

            os: row['OS'] || 0,

            deposit1: row['Deposit 1'] || 0,

            deposit2: row['Deposit 2'] || 0,

            deposit3: row['Deposit 3'] || 0,

            cashPlusMinus: row['Cash +/-'] || 0,

            cashExpected: row['Cash Expected'] || 0,

            difference: row['Difference'] || 0

        }));

        console.log('DESPUES DEL MAP');
        console.log(datosExtraidos.length);
        console.log(datosExtraidos[0]);

        renderTablaSucursales();
    }

}


function normalizarFecha(fecha) {

    if (!fecha) return '';

    // Fecha serial de Excel
    if (typeof fecha === 'number') {

        const excelEpoch =
            new Date(
                Date.UTC(1899, 11, 30)
            );

        const d =
            new Date(
                excelEpoch.getTime() +
                fecha * 86400000
            );

        return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(
            d.getUTCDate()
        ).padStart(2, '0')}/${d.getUTCFullYear()}`;
    }

    // Texto o Date normal
    const d =
        fecha instanceof Date
            ? fecha
            : new Date(fecha);

    if (isNaN(d)) {
        return '';
    }

    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(
        d.getDate()
    ).padStart(2, '0')}/${d.getFullYear()}`;
}


function generarConciliacionDesdeTemplate() {

    if (!currentRestaurantConfig) {

        Swal.fire(
            'Error',
            'No existe configuración para el restaurante seleccionado',
            'error'
        );

        return;
    }

    const codigo =
        document.getElementById(
            'selectRestaurante'
        )
            .selectedOptions[0]
            ?.dataset?.codigo;


    switch (codigo) {

        case 'taco-bell':
            return generarConciliacionTacoBell();

        case 'popeyes':
            return procesarPopeyes();

        case 'burger-king':
            return generarConciliacionBurgerKing();

        default:

            Swal.fire(
                'Error',
                `Restaurante no configurado: ${codigo}`,
                'error'
            );

    }

}
// ============================================
// RENDERIZADO
// ============================================





function actualizarResumen() {

    const total =
        datosExtraidos.length;

    const diferencias =
        datosExtraidos.filter(
            x => Math.abs(x.difference || 0) > 0.01
        ).length;

    const montoTotal =
        datosExtraidos.reduce(
            (s, x) => s + Math.abs(x.difference || 0),
            0
        );

    document.getElementById(
        'totalConceptos'
    ).textContent = total;

    document.getElementById(
        'conceptosOk'
    ).textContent = total - diferencias;

    document.getElementById(
        'conceptosDiferencia'
    ).textContent = diferencias;

    document.getElementById(
        'totalDiferencia'
    ).textContent =
        formatMoney(montoTotal);
}

// ============================================
// MODAL EDITAR VALOR
// ============================================

function abrirModalEditar(index) {
    editandoIndex = index;
    const dato = datosExtraidos[index];

    document.getElementById('editConcepto').value = dato.concepto;
    document.getElementById('editValorExcel').value = formatMoney(dato.valorExcel);
    document.getElementById('editValorEsperado').value = dato.valorEsperado;

    document.getElementById('modalEditarValor').classList.add('active');
}

function cerrarModalEditar() {
    document.getElementById('modalEditarValor').classList.remove('active');
    editandoIndex = -1;
}

function guardarValorEsperado() {
    if (editandoIndex < 0) return;

    const nuevoValor = parseFloat(document.getElementById('editValorEsperado').value) || 0;
    datosExtraidos[editandoIndex].valorEsperado = nuevoValor;
    datosExtraidos[editandoIndex].diferencia = datosExtraidos[editandoIndex].valorExcel - nuevoValor;

    // Actualizar en memoria de valores esperados
    const concepto = datosExtraidos[editandoIndex].concepto;
    valoresEsperados[concepto] = { valor: nuevoValor, fuente: 'manual' };

    cerrarModalEditar();
    renderTablaSucursales();
    actualizarResumen();
}

// ============================================
// GUARDAR CONCILIACION
// ============================================

// ============================================
// HISTORIAL
// ============================================

async function abrirHistorial() {
    document.getElementById('modalHistorial').classList.add('active');

    try {
        const token = localStorage.getItem('token');
        const restauranteId = document.getElementById('selectRestaurante').value;

        let url = `${API_URL}/conciliaciones`;
        if (restauranteId) url += `?restaurante_id=${restauranteId}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            renderHistorial(data.conciliaciones || []);
        }
    } catch (error) {
        console.error('Error cargando historial:', error);
    }
}

function renderHistorial(conciliaciones) {
    const tbody = document.getElementById('historialBody');

    if (conciliaciones.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center" style="padding: 40px; color: var(--gray-500);">
                    No hay conciliaciones registradas
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = conciliaciones.map(c => {
        const estadoClass = c.estado === 'completada' ? 'validado' :
            c.estado === 'aprobada' ? 'validado' :
                c.estado === 'rechazada' ? 'error' : 'pendiente';

        return `
            <tr>
                <td>${formatDate(c.fecha_conciliacion)}</td>
                <td>${c.restaurante_nombre}</td>
                <td>${c.total_conceptos} (${c.conceptos_ok} OK)</td>
                <td>${formatMoney(c.monto_total_diferencia)}</td>
                <td><span class="status-badge ${estadoClass}">${c.estado}</span></td>
                <td>
                    <button class="action-btn view" onclick="verConciliacion(${c.id})" title="Ver detalle">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function cerrarModalHistorial() {
    document.getElementById('modalHistorial').classList.remove('active');
}

async function verConciliacion(id) {
    // Cargar y mostrar una conciliacion existente
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${window.API_URL}/conciliaciones/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const c = data.conciliacion;

            // Setear valores
            document.getElementById('selectRestaurante').value = c.restaurante_id;
            await cargarTemplates(c.restaurante_id);
            document.getElementById('selectTemplate').value = c.template_id;
            document.getElementById('fechaConciliacion').value = c.fecha_conciliacion.split('T')[0];
            document.getElementById('notasConciliacion').value = c.notas || '';

            templateActual = templates.find(t => t.id == c.template_id);
            datosExtraidos = c.datos_extraidos;

            // Mostrar resultados
            document.getElementById('resultsSection').style.display = 'block';
            document.getElementById('dropZone').style.display = 'none';
            document.getElementById('fileLoaded').style.display = 'none';

            renderTablaSucursales();
            actualizarResumen();
            cerrarModalHistorial();
        }
    } catch (error) {
        console.error('Error cargando conciliacion:', error);
    }
}

// ============================================
// EXPORTAR PDF
// ============================================

function exportarPDF() {
    // Implementacion basica con window.print
    const restaurante = document.getElementById('selectRestaurante').selectedOptions[0]?.text || '';
    const fecha = document.getElementById('fechaConciliacion').value;

    const printContent = `
        <html>
        <head>
            <title>Conciliacion - ${restaurante} - ${fecha}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { font-size: 24px; margin-bottom: 5px; }
                h2 { font-size: 16px; color: #666; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
                th { background: #f5f5f5; }
                .text-right { text-align: right; }
                .positivo { color: green; }
                .negativo { color: red; }
                .totals { font-weight: bold; background: #f9f9f9; }
            </style>
        </head>
        <body>
            <h1>Reporte de Conciliacion</h1>
            <h2>${restaurante} - ${fecha}</h2>
            <table>
                <thead>
                    <tr>
                        <th>Concepto</th>
                        <th class="text-right">Valor Excel</th>
                        <th class="text-right">Valor Esperado</th>
                        <th class="text-right">Diferencia</th>
                    </tr>
                </thead>
                <tbody>
                    ${datosExtraidos.map(d => `
                        <tr>
                            <td>${d.concepto}</td>
                            <td class="text-right">${formatMoney(d.valorExcel)}</td>
                            <td class="text-right">${formatMoney(d.valorEsperado)}</td>
                            <td class="text-right ${d.diferencia > 0 ? 'positivo' : d.diferencia < 0 ? 'negativo' : ''}">${formatMoney(d.diferencia)}</td>
                        </tr>
                    `).join('')}
                    <tr class="totals">
                        <td>TOTAL</td>
                        <td class="text-right">${formatMoney(datosExtraidos.reduce((s, d) => s + d.valorExcel, 0))}</td>
                        <td class="text-right">${formatMoney(datosExtraidos.reduce((s, d) => s + d.valorEsperado, 0))}</td>
                        <td class="text-right">${formatMoney(datosExtraidos.reduce((s, d) => s + d.diferencia, 0))}</td>
                    </tr>
                </tbody>
            </table>
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
}

// ============================================
// UTILIDADES
// ============================================

function formatMoney(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(value || 0);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function normalizarEncabezado(valor) {
    return String(valor ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function leerFilasExcel(
    sheet,
    encabezadosRequeridos = [],
    defval = 0
) {

    if (!sheet) return [];

    const matrix =
        XLSX.utils.sheet_to_json(
            sheet,
            {
                header: 1,
                defval: ''
            }
        );

    const requeridos =
        encabezadosRequeridos.map(
            normalizarEncabezado
        );

    let headerIndex = 0;

    if (requeridos.length) {

        const encontrado =
            matrix.findIndex(row => {

                const headers =
                    row.map(
                        normalizarEncabezado
                    );

                return requeridos.every(
                    h => headers.includes(h)
                );

            });

        if (encontrado >= 0) {
            headerIndex = encontrado;
        }

    }

    return XLSX.utils.sheet_to_json(
        sheet,
        {
            range: headerIndex,
            defval
        }
    );
}

function obtenerHojaPorNombre(
    book,
    nombres
) {

    if (!book) return null;

    const normalizados =
        nombres.map(
            normalizarEncabezado
        );

    const sheetName =
        book.SheetNames.find(name =>
            normalizados.includes(
                normalizarEncabezado(name)
            )
        );

    return sheetName
        ? book.Sheets[sheetName]
        : null;
}


function detectarHojaOrigen(
    book = workbook
) {

    if (
        currentRestaurantConfig?.sourceSheet &&
        book.SheetNames.includes(
            currentRestaurantConfig.sourceSheet
        )
    ) {

        return currentRestaurantConfig.sourceSheet;

    }

    return book.SheetNames[0];

}

function renderTablaSucursales() {

    const thead = document.getElementById('conciliacionTableHead');
    const tbody = document.getElementById('conciliacionBody');

    thead.innerHTML = '';
    tbody.innerHTML = '';

    const codigo =
        document
            .getElementById('selectRestaurante')
            ?.selectedOptions?.[0]
            ?.dataset?.codigo;

    const columnasConfiguradas =
        codigo === 'popeyes' &&
            currentRestaurantConfig?.conciliationColumns?.length
            ? currentRestaurantConfig.conciliationColumns
            : currentRestaurantConfig?.tableColumns;

    if (
        !currentRestaurantConfig ||
        !columnasConfiguradas ||
        columnasConfiguradas.length === 0
    ) {
        console.error(
            'No hay columnas configuradas',
            currentRestaurantConfig
        );
        return;
    }

    const columnas =
        columnasConfiguradas ||
        Object.keys(currentRestaurantConfig.columns).map(key => ({
            key,
            label: currentRestaurantConfig.columns[key]
        }));

    // ==========================
    // HEADERS
    // ==========================

    const headerRow = document.createElement('tr');

    columnas.forEach(col => {

        const th = document.createElement('th');
        th.textContent = col.label;

        headerRow.appendChild(th);

    });

    thead.appendChild(headerRow);

    // ==========================
    // BODY
    // ==========================

    const filasFiltradas = datosExtraidos.filter(row => {

        const nombre =
            String(
                row.unitName ||
                row.storeName ||
                ''
            ).toLowerCase();

        const cumpleStore =
            !filtroStore ||
            String(row.store) === String(filtroStore);

        const cumpleNombre =
            !filtroStoreName ||
            nombre.includes(filtroStoreName);

        return cumpleStore && cumpleNombre;

    });

    filasFiltradas.forEach(row => {

        const tr = document.createElement('tr');

        columnas.forEach(col => {

            const td = document.createElement('td');

            let valor = row[col.key];

            if (typeof valor === 'number') {

                if (Math.abs(valor) < 0.000001) {
                    valor = 0;
                }

                td.textContent =
                    valor.toLocaleString(
                        'en-US',
                        {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }
                    );

                td.classList.add('text-right');
            } else {

                td.textContent = valor ?? '';

            }

            tr.appendChild(td);

        });

        tbody.appendChild(tr);

    });

}

function actualizarTotales() {

    const totalSalesTax =
        datosExtraidos.reduce(
            (s, r) => s + (r.salesTax || 0),
            0
        );

    const totalNetSales =
        datosExtraidos.reduce(
            (s, r) => s + (r.netSales || 0),
            0
        );

    const totalDifference =
        datosExtraidos.reduce(
            (s, r) => s + (r.difference || 0),
            0
        );

    const totalExcel =
        document.getElementById('totalExcel');

    const totalEsperado =
        document.getElementById('totalEsperado');

    const totalDiff =
        document.getElementById('totalDiff');

    if (totalExcel)
        totalExcel.textContent =
            formatMoney(totalSalesTax);

    if (totalEsperado)
        totalEsperado.textContent =
            formatMoney(totalNetSales);

    if (totalDiff)
        totalDiff.textContent =
            formatMoney(totalDifference);

}


function procesarEBT() {

    if (!ebtWorkbook) {
        return;
    }

    const hoja =
        obtenerHojaPorNombre(
            ebtWorkbook,
            [
                'Net Sales',
                'EBT AMOUNTS'
            ]
        );

    if (!hoja) {
        return;
    }

    const rows =
        leerFilasExcel(
            hoja,
            ['Funded Date'],
            ''
        );

    if (!rows.length) {
        return;
    }

    const fechas =
        rows
            .map(r =>
                normalizarFecha(
                    r['Funded Date']
                )
            )
            .filter(Boolean);

    if (!fechas.length) {
        return;
    }

    let fechaTexto;

    if (fechaEBTSeleccionada) {

        fechaTexto =
            normalizarFecha(
                fechaEBTSeleccionada
            );

    } else {

        fechaTexto =
            fechas
                .sort(
                    (a, b) => new Date(b) - new Date(a)
                )[0];

    }

    console.log(
        'Fecha EBT usada:',
        fechaTexto
    );

    ebtPorTienda = {};

    rows.forEach(row => {

        const fecha =
            normalizarFecha(
                row['Funded Date']
            );

        if (fecha !== fechaTexto) {
            return;
        }

        const siteName =
            row['Site Name'] || '';

        const match =
            String(siteName).match(
                /#(\d+)/
            );

        const store =
            Number(
                row.LOCATION ||
                row.Location ||
                match?.[1]
            );

        if (!store) {
            return;
        }

        const amount =
            Number(
                row[
                'Processed Transaction Amount'
                ]
            ) || 0;

        ebtPorTienda[store] =
            (ebtPorTienda[store] || 0)
            + amount;

    });

}

function obtenerEBTPorStore(
    store
) {

    return (
        ebtPorTienda[
        Number(store)
        ] || 0
    );

}



document
    .getElementById(
        'salesDateFilter'
    )
    .addEventListener(
        'change',
        e => {

            fechaSalesSeleccionada =
                e.target.value;

            generarConciliacionDesdeTemplate();
        }
    );

function cargarFechasEnFiltro(
    rows,
    selectId,
    campoFecha = 'Date'
) {

    const select =
        document.getElementById(selectId);

    if (!select) return;

    const fechas = [
        ...new Set(
            rows
                .map(row =>
                    normalizarFecha(
                        row[campoFecha]
                    )
                )
                .filter(Boolean)
        )
    ];

    fechas.sort((a, b) => {

        const fechaA = new Date(a);
        const fechaB = new Date(b);

        return fechaB - fechaA;

    });

    select.innerHTML =
        '<option value="">Selecciona fecha</option>';

    fechas.forEach(fecha => {

        select.innerHTML += `
            <option value="${fecha}">
                ${fecha}
            </option>
        `;

    });

}

function obtenerFechaFila(row) {

    return (
        row['Date'] ||
        row['Accounting Date'] ||
        row['Business Date'] ||
        row['Sales Date'] ||
        null
    );

}

function cargarFiltroTiendas() {

    const select =
        document.getElementById(
            'filterStoreSelect'
        );

    if (!select) return;

    const tiendas =
        [...new Set(
            datosExtraidos.map(
                row => row.store
            )
        )]
            .filter(Boolean)
            .sort();

    select.innerHTML =
        '<option value="">Todas las tiendas</option>';

    tiendas.forEach(store => {

        const row =
            datosExtraidos.find(
                r => r.store == store
            );

        const nombre =
            row?.unitName || '';

        select.innerHTML += `
            <option value="${store}">
                ${store} - ${nombre}
            </option>
        `;

    });

}
function llenarFiltroTiendas() {

    const select =
        document.getElementById('filterStore');

    const tiendas = [
        ...new Set(
            datosExtraidos
                .map(r => r.store)
                .filter(Boolean)
        )
    ];


    if (!select) return;

    select.innerHTML =
        '<option value="">Todas las tiendas</option>';

    tiendas.forEach(store => {

        select.innerHTML += `
            <option value="${store}">
                ${store}
            </option>
        `;
    });
}

function saveConciliacion() {

    if (!workbook) {
        Swal.fire({
            icon: 'warning',
            title: 'Sin datos',
            text: 'Primero debes cargar un archivo'
        });
        return;
    }

    Swal.fire({
        title: 'Guardar conciliación',
        text: '¿Dónde deseas guardar el archivo?',
        icon: 'question',
        showCancelButton: true,
        showDenyButton: !localStorage.getItem('modoOffline'),
        confirmButtonText:
            '<i class="fa-solid fa-download"></i> Descargar',
        denyButtonText:
            '<i class="fa-solid fa-cloud-arrow-up"></i> Guardar en servidor',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#2563eb',
        denyButtonColor: '#10b981'
    }).then((result) => {

        if (result.isConfirmed) {

            const workbookFinal =
                generarWorkbookConConciliacion();

            XLSX.writeFile(
                workbookFinal,
                `conciliacion-${Date.now()}.xlsx`
            );

            Swal.fire({
                icon: 'success',
                title: 'Archivo descargado',
                timer: 1500,
                showConfirmButton: false
            });

        } else if (result.isDenied) {

            guardarConciliacionServidor();

        }
    });
}
async function guardarConciliacionServidor() {

    const token = localStorage.getItem('token');

    const restaurante =
        document
            .getElementById('selectRestaurante')
            ?.selectedOptions[0]
            ?.dataset?.codigo;

    if (!token) {
        Swal.fire({
            icon: 'error',
            title: 'Sesión expirada'
        });

        return;
    }

    if (!restaurante) {
        Swal.fire({
            icon: 'warning',
            title: 'Restaurante requerido',
            text: 'Selecciona un restaurante'
        });

        return;
    }

    Swal.fire({
        title: 'Guardando...',
        text: 'Subiendo conciliación',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    if (!datosExtraidos.length) {

        Swal.fire({
            icon: 'warning',
            title: 'Sin conciliación',
            text: 'Primero genera la conciliación'
        });

        return;
    }

    try {


        const workbookFinal =
            generarWorkbookConConciliacion();

        const wbout = XLSX.write(
            workbookFinal,
            {
                bookType: 'xlsx',
                type: 'array'
            }
        );

        const blob = new Blob(
            [wbout],
            {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
        );

        const formData = new FormData();

        formData.append(
            'archivo',
            blob,
            `conciliacion-${Date.now()}.xlsx`
        );

        formData.append(
            'restaurante_id',
            restaurante
        );

        formData.append(
            'procesar_datos',
            'true'
        );

        const response = await fetch(
            `${window.API_URL}/archivos/subir`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: formData
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || 'Error al guardar'
            );
        }

        Swal.fire({
            icon: 'success',
            title: 'Conciliación guardada',
            html: `
                <p>La conciliación se guardó correctamente.</p>
                <p style="margin-top:10px;">
                    ID: ${data.archivo.id}
                </p>
            `
        });

    } catch (error) {

        console.error(error);

        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message
        });
    }
}

function obtenerNombreHojaUnico(
    workbookDestino,
    nombreBase
) {

    const limite =
        31;

    const limpiar =
        String(nombreBase || 'Sheet')
            .replace(/[\\/?*\[\]:]/g, '-')
            .slice(0, limite);

    let nombre =
        limpiar || 'Sheet';

    let contador = 2;

    while (
        workbookDestino.SheetNames.includes(
            nombre
        )
    ) {

        const sufijo =
            ` ${contador++}`;

        nombre =
            limpiar
                .slice(
                    0,
                    limite - sufijo.length
                ) + sufijo;

    }

    return nombre;
}

function esHojaGeneradaConciliacion(nombre) {

    const generadas =
        [
            'Conciliation',
            'Tax Review',
            'Daily Sales RED',
            'Statistical Delivery',
            'Daily Sales 03-14',
            'Daily Sales 03-10',
            'Daily Sales Taco Bell  RED',
            'Daily Sales Taco Bell 03-14 202',
            'Daily Sales Taco Bell 03-10 202',
            'Daily Sales Popeyes Red',
            'Daily Sales Popeyes 04-04-2026',
            'Tax Analysis',
            'Discrepancies',
            'Template to CSV'
        ];

    return generadas.some(
        item =>
            normalizarEncabezado(item) ===
            normalizarEncabezado(nombre)
    );
}

function anexarHojasFuente(
    workbookDestino,
    workbookFuente,
    options = {}
) {

    if (!workbookFuente) return;

    workbookFuente.SheetNames.forEach(
        (sheetName, index) => {

            if (
                options.omitirGeneradas &&
                esHojaGeneradaConciliacion(
                    sheetName
                )
            ) {
                return;
            }

            const nombreBase =
                options.renombrar
                    ? options.renombrar(
                        sheetName,
                        index
                    )
                    : sheetName;

            const nombreDestino =
                obtenerNombreHojaUnico(
                    workbookDestino,
                    nombreBase
                );

            XLSX.utils.book_append_sheet(
                workbookDestino,
                workbookFuente.Sheets[sheetName],
                nombreDestino
            );

        }
    );
}

function generarWorkbookConConciliacion() {

    const nuevoWorkbook = XLSX.utils.book_new();

    const codigo =
        document
            .getElementById('selectRestaurante')
            ?.selectedOptions[0]
            ?.dataset?.codigo;

    const esTacoBell =
        codigo === 'taco-bell';

    anexarHojasFuente(
        nuevoWorkbook,
        salesWorkbook || workbook,
        {
            omitirGeneradas: true,
            renombrar: (sheetName, index) =>
                esTacoBell && index === 0
                    ? 'Sales Concepts'
                    : sheetName
        }
    );

    anexarHojasFuente(
        nuevoWorkbook,
        salesDetailWorkbook,
        {
            omitirGeneradas: true,
            renombrar: (sheetName, index) =>
                esTacoBell && index === 0
                    ? 'Sales Lone Star'
                    : sheetName
        }
    );

    anexarHojasFuente(
        nuevoWorkbook,
        ebtWorkbook,
        {
            omitirGeneradas: true,
            renombrar: (sheetName, index) =>
                esTacoBell && index === 0
                    ? 'EBT AMOUNTS'
                    : sheetName
        }
    );

    // Crear datos de conciliación usando configuración dinámica
    const columnas =
        currentRestaurantConfig?.conciliationColumns ||
        currentRestaurantConfig?.tableColumns ||
        [];

    // ======================================
    // CONCILIATION
    // ======================================

    const wsConciliation =
        XLSX.utils.aoa_to_sheet(
            [
                columnas.map(col => col.label),
                ...datosExtraidos.map(row =>
                    columnas.map(col =>
                        row[col.key] ?? ''
                    )
                )
            ]
        );

    XLSX.utils.book_append_sheet(
        nuevoWorkbook,
        wsConciliation,
        'Conciliation'
    );

    // ======================================
    // TAX REVIEW
    // ======================================

    const taxReviewExportData =
        codigo === 'popeyes'
            ? popeyesTaxReviewData
            : taxReviewData;

    if (taxReviewExportData?.length) {

        const wsTaxReview =
            XLSX.utils.json_to_sheet(
                taxReviewExportData
            );

        XLSX.utils.book_append_sheet(
            nuevoWorkbook,
            wsTaxReview,
            'Tax Review'
        );

    }

    // ======================================
    // DAILY SALES RED
    // ======================================

    const dailySalesRedExportData =
        codigo === 'popeyes'
            ? popeyesDailySalesRedData
            : dailySalesREDData;

    if (dailySalesRedExportData?.length) {

        const wsDailySalesRED =
            XLSX.utils.json_to_sheet(
                dailySalesRedExportData
            );

        XLSX.utils.book_append_sheet(
            nuevoWorkbook,
            wsDailySalesRED,
            codigo === 'popeyes'
                ? 'Daily Sales Popeyes Red'
                : 'Daily Sales RED'
        );

    }

    // ======================================
    // STATISTICAL DELIVERY
    // ======================================

    if (statisticalDeliveryData?.length) {

        const wsStatisticalDelivery =
            XLSX.utils.json_to_sheet(
                statisticalDeliveryData
            );

        XLSX.utils.book_append_sheet(
            nuevoWorkbook,
            wsStatisticalDelivery,
            'Statistical Delivery'
        );

    }

    // ======================================
    // DAILY SALES 03-14
    // ======================================

    const dailySales0314ExportData =
        codigo === 'popeyes'
            ? popeyesDailySales0404Data
            : dailySales0314Data;

    if (dailySales0314ExportData?.length) {

        const ws0314 =
            XLSX.utils.json_to_sheet(
                dailySales0314ExportData
            );

        XLSX.utils.book_append_sheet(
            nuevoWorkbook,
            ws0314,
            codigo === 'popeyes'
                ? 'Daily Sales Popeyes 04-04-2026'
                : 'Daily Sales 03-14'
        );

    }

    // ======================================
    // DAILY SALES 03-10
    // ======================================

    if (dailySales0310Data?.length) {

        const ws0310 =
            XLSX.utils.json_to_sheet(
                dailySales0310Data
            );

        XLSX.utils.book_append_sheet(
            nuevoWorkbook,
            ws0310,
            'Daily Sales 03-10'
        );

    }

    return nuevoWorkbook;
}

function limpiarDecimal(valor) {

    const numero = Number(valor) || 0;

    if (Math.abs(numero) < 0.000001) {
        return 0;
    }

    return Number(numero.toFixed(2));
}

function renderActiveTab() {

    const codigo =
        document.getElementById(
            'selectRestaurante'
        )
            ?.selectedOptions?.[0]
            ?.dataset?.codigo;

    // =====================
    // POPEYES
    // =====================

    if (codigo === 'popeyes') {

        switch (activeTab) {

            case 'conciliation':
                renderConciliation();
                break;

            case 'taxReview':
                renderTaxReview();
                break;

            case 'dailySalesRed':
                renderDailySalesRed();
                break;

            case 'dailySales0404':
                renderDailySales0404();
                break;
        }

        return;
    }


    if (codigo === 'burger-king') {

        switch (activeTab) {

            case 'summary':
                renderBurgerKingSummary();
                break;

            case 'conciliation':
            case 'dailySales':
                renderBurgerKingConciliation();
                break;

            case 'taxAnalysis':
            case 'taxReview':
                renderBurgerKingTaxAnalysis();
                break;

            case 'discrepancies':
                renderBurgerKingDiscrepancies();
                break;

            case 'templateCsv':
            case 'template':
                renderBurgerKingTemplateCsv();
                break;

            default:
                renderBurgerKingConciliation();
                break;
        }

        return;
    }

    // =====================
    // TACO BELL
    // =====================

    switch (activeTab) {

        case 'dailySales':
            renderTablaSucursales();
            break;

        case 'dailySalesRed':
            renderDailySalesRED();
            break;

        case 'taxReview':
            renderTaxReview();
            break;

        case 'statisticalDelivery':
            renderStatisticalDelivery();
            break;

        case 'dailySales0314':
            renderDailySales0314();
            break;

        case 'dailySales0310':
            renderDailySales0310();
            break;
    }
}

function normalizarNombreColumnaCSV(columna) {
    return String(columna || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function serializarValorCSV(valor, columna) {
    const nombreColumna =
        normalizarNombreColumnaCSV(columna);
    const columnasImporte = new Set([
        'debit',
        'credit'
    ]);
    const columnasNumericas = new Set([
        'lineno',
        'account',
        'acctno',
        'locationid',
        'store',
        'storenumber'
    ]);

    if (
        valor === null ||
        valor === undefined ||
        valor === ''
    ) {
        return '';
    }

    if (columnasImporte.has(nombreColumna)) {
        const numero = Number(valor);

        return Number.isFinite(numero)
            ? numero.toFixed(2)
            : '';
    }

    if (
        typeof valor === 'number' ||
        columnasNumericas.has(nombreColumna)
    ) {
        const numero = Number(valor);

        if (Number.isFinite(numero)) {
            return String(numero);
        }
    }

    const texto = String(valor);

    if (!/[",\r\n]/.test(texto)) {
        return texto;
    }

    return `"${texto.replace(/"/g, '""')}"`;
}

function descargarCSV(data, nombreArchivo) {

    if (!data || !data.length) {
        alert('No hay datos para exportar');
        return;
    }

    const columnas = Object.keys(data[0]);

    let csv = columnas.join(',') + '\r\n';

    data.forEach(row => {

        const valores = columnas.map(col => {

            return serializarValorCSV(
                row[col],
                col
            );

        });

        csv += valores.join(',') + '\r\n';

    });

    const blob = new Blob(
        [csv],
        { type: 'text/csv;charset=utf-8;' }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');

    link.href = url;
    link.download = `${nombreArchivo}.csv`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);

}

function exportarTabActualCSV() {

    const codigo =
        document
            .getElementById('selectRestaurante')
            ?.selectedOptions?.[0]
            ?.dataset?.codigo;

    if (codigo === 'burger-king') {

        switch (activeTab) {

            case 'summary':
                descargarCSV(
                    burgerKingSummaryData,
                    'BurgerKingSummary'
                );
                break;

            case 'conciliation':
            case 'dailySales':
                descargarCSV(
                    burgerKingConciliationData,
                    'BurgerKingConciliation'
                );
                break;

            case 'taxAnalysis':
            case 'taxReview':
                descargarCSV(
                    burgerKingTaxAnalysisData,
                    'BurgerKingTaxAnalysis'
                );
                break;

            case 'discrepancies':
                descargarCSV(
                    burgerKingDiscrepanciesData,
                    'BurgerKingDiscrepancies'
                );
                break;

            case 'templateCsv':
            case 'template':
                descargarCSV(
                    burgerKingTemplateCsvData,
                    'BurgerKingTemplateToCSV'
                );
                break;

            default:
                descargarCSV(
                    burgerKingConciliationData,
                    'BurgerKingConciliation'
                );
        }

        return;
    }

    if (codigo === 'popeyes') {

        switch (activeTab) {

            case 'conciliation':
                descargarCSV(
                    popeyesConciliationData,
                    'PopeyesConciliation'
                );
                break;

            case 'taxReview':
                descargarCSV(
                    popeyesTaxReviewData,
                    'PopeyesTaxReview'
                );
                break;

            case 'dailySalesRed':
                descargarCSV(
                    popeyesDailySalesRedData,
                    'DailySalesPopeyesRed'
                );
                break;

            case 'dailySales0404':
                descargarCSV(
                    popeyesDailySales0404Data,
                    'DailySalesPopeyes0404'
                );
                break;

            default:
                alert('Selecciona una pestana');
        }

        return;
    }

    if (false && codigo === 'burger-king') {

        switch (activeTab) {

            case 'burgerKingConciliation':
                descargarCSV(
                    burgerKingConciliationData,
                    'BurgerKingConciliation'
                );
                break;

            case 'burgerKingTaxAnalysis':
                descargarCSV(
                    burgerKingTaxAnalysisData,
                    'BurgerKingTaxAnalysis'
                );
                break;

            case 'burgerKingDiscrepancies':
                descargarCSV(
                    burgerKingDiscrepanciesData,
                    'BurgerKingDiscrepancies'
                );
                break;

            case 'burgerKingTemplateCsv':
                descargarCSV(
                    burgerKingTemplateCsvData,
                    'BurgerKingTemplateToCSV'
                );
                break;

            default:
                alert('Selecciona una pestaña');
        }

        return;
    }

    switch (activeTab) {

        case 'taxReview':
            descargarCSV(
                taxReviewData,
                'TaxReview'
            );
            break;

        case 'dailySalesRed':
            descargarCSV(
                dailySalesREDData,
                'DailySalesRED'
            );
            break;

        case 'statisticalDelivery':
            descargarCSV(
                statisticalDeliveryData,
                'StatisticalDelivery'
            );
            break;

        case 'dailySales0314':
            descargarCSV(
                dailySales0314Data,
                'DailySales0314'
            );
            break;

        case 'dailySales0310':
            descargarCSV(
                dailySales0310Data,
                'DailySales0310'
            );
            break;

        default:
            alert('Selecciona una pestaña');
    }

}




