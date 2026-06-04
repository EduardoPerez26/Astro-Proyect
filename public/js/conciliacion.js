// ============================================
// SISTEMA DE CONCILIACION
// ============================================

const API_URL = 'http://localhost:3001/api';

// Estado global
let restaurantes = [];
let templates = [];
let templateActual = null;
let datosExtraidos = [];
let valoresEsperados = {};
let archivoActual = null;
let workbook = null;
let editandoIndex = -1;

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
    // Selector de restaurante
    document.getElementById('selectRestaurante').addEventListener('change', onRestauranteChange);

    // Selector de template
    document.getElementById('selectTemplate').addEventListener('change', onTemplateChange);

    // Cambio de fecha
    document.getElementById('fechaConciliacion').addEventListener('change', onFechaChange);

    // Drag and drop
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) procesarArchivo(file);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) procesarArchivo(e.target.files[0]);
    });

    // Botones
    document.getElementById('btnRemoveFile').addEventListener('click', removerArchivo);
    document.getElementById('btnGuardar').addEventListener('click', guardarConciliacion);
    document.getElementById('btnExportPdf').addEventListener('click', exportarPDF);
    document.getElementById('btnHistorial').addEventListener('click', abrirHistorial);
}

// ============================================
// CARGA DE DATOS
// ============================================

async function cargarRestaurantes() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/restaurantes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            restaurantes = data.restaurantes || data;
            renderRestaurantes();
        }
    } catch (error) {
        console.error('Error cargando restaurantes:', error);
        Swal.fire('Error', 'No se pudieron cargar los restaurantes', 'error');
    }
}

function renderRestaurantes() {
    const select = document.getElementById('selectRestaurante');
    select.innerHTML = '<option value="">Selecciona un restaurante...</option>';

    restaurantes.forEach(r => {
        select.innerHTML += `<option value="${r.id}">${r.nombre}</option>`;
    });
}

async function cargarTemplates(restauranteId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/conciliaciones/templates?restaurante_id=${restauranteId}`, {
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
        const response = await fetch(`${API_URL}/conciliaciones/valores-esperados/${restauranteId}/${fecha}`, {
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
    const restauranteId = document.getElementById('selectRestaurante').value;

    if (!restauranteId) {
        document.getElementById('selectTemplate').disabled = true;
        document.getElementById('selectTemplate').innerHTML = '<option value="">Selecciona primero un restaurante</option>';
        templateActual = null;
        return;
    }

    await cargarTemplates(restauranteId);
    await cargarValoresEsperados();
}

function onTemplateChange() {
    const templateId = document.getElementById('selectTemplate').value;
    templateActual = templates.find(t => t.id == templateId) || null;

    // Si hay archivo cargado, re-procesar con el nuevo template
    if (workbook && templateActual) {
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

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
        Swal.fire(
            'Error',
            'Solo se permiten archivos Excel',
            'error'
        );
        return;
    }

    if (!templateActual) {
        Swal.fire(
            'Atención',
            'Selecciona un template primero',
            'warning'
        );
        return;
    }

    archivoActual = file;

    document.getElementById(
        'dropZone'
    ).style.display = 'none';

    document.getElementById(
        'fileLoaded'
    ).style.display = 'flex';

    document.getElementById(
        'fileName'
    ).textContent = file.name;

    document.getElementById(
        'fileSize'
    ).textContent =
        formatBytes(file.size);

    try {

        const fileBuffer =
            await file.arrayBuffer();

        const userWorkbook =
            XLSX.read(
                new Uint8Array(
                    fileBuffer
                ),
                {
                    type: 'array'
                }
            );

        workbook = userWorkbook;

        // Si el archivo ya trae Conciliation
        if (
            userWorkbook.Sheets[
            'Conciliation'
            ]
        ) {

            console.log(
                'Conciliation encontrada'
            );

        } else {

            console.log(
                'Conciliation NO encontrada'
            );

            if (
                templateActual.archivo_template
            ) {

                const response =
                    await fetch(
                        templateActual.archivo_template
                    );

                const templateBuffer =
                    await response.arrayBuffer();

                const templateWorkbook =
                    XLSX.read(
                        new Uint8Array(
                            templateBuffer
                        ),
                        {
                            type: 'array'
                        }
                    );

                workbook =
                    combineTemplateWithUserExcel(
                        templateWorkbook,
                        userWorkbook
                    );
            }
        }

        extraerDatos();

    } catch (error) {

        console.error(
            'Error procesando archivo:',
            error
        );

        Swal.fire(
            'Error',
            error.message,
            'error'
        );

        removerArchivo();
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
    workbook = null;
    datosExtraidos = [];

    document.getElementById('dropZone').style.display = 'block';
    document.getElementById('fileLoaded').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('fileInput').value = '';
}

function extraerDatos() {
    if (!workbook || !templateActual) return;

    datosExtraidos = [];

    // ============================================
    // DETECTAR DAILY SALES AUTOMATICAMENTE
    // ============================================
    // Si existe la hoja Conciliation, usarla
    if (workbook.Sheets['Conciliation']) {

        console.log(
            'Usando hoja Conciliation'
        );

        extraerDailySales();
        return;
    }

    console.log(
        'No existe Conciliation, usando template'
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


function generarConciliacionDesdeTemplate() {

    const salesSheet =
        workbook.Sheets['Sales'];

    if (!salesSheet) {

        Swal.fire(
            'Error',
            'No existe la hoja Sales',
            'error'
        );

        return;
    }

    const salesRows =
        XLSX.utils.sheet_to_json(
            salesSheet,
            {
                defval: 0
            }
        );

    const rowsLimpios =
        salesRows.filter(
            row =>
                row['Store'] &&
                String(row['Store']).trim() !== ''
        );

    console.log(
        'Sales rows:',
        rowsLimpios.length
    );

    datosExtraidos =
        rowsLimpios.map(row => {

            const deposit1 =
                Number(row['Deposit 1']) || 0;

            const deposit2 =
                Number(row['Deposit 2']) || 0;

            const deposit3 =
                Number(row['Deposit 3']) || 0;

            return {

                store:
                    row['Store'] || '',

                salesTax:
                    Number(
                        row['Sales Tax']
                    ) || 0,

                grossSalesPos:
                    Number(
                        row['Gross Sales']
                    ) || 0,

                discounts:
                    Number(
                        row['Discounts']
                    ) || 0,

                promo:
                    Number(
                        row['Promo']
                    ) || 0,

                donations:
                    Number(
                        row['Donation']
                    ) || 0,

                netSales:
                    Number(
                        row['Net Sales']
                    ) || 0,

                gcSold:
                    Number(
                        row['Gift Cards Sold']
                    ) || 0,

                paidOut:
                    Number(
                        row['Paid Out']
                    ) || 0,

                paidIn: 0,

                donation:
                    Number(
                        row['Donation']
                    ) || 0,

                totalRevenue:
                    Number(
                        row['Register Sales']
                    ) || 0,

                mastercard:
                    Number(
                        row['Mastercard']
                    ) || 0,

                visa:
                    Number(
                        row['Visa']
                    ) || 0,

                discover:
                    Number(
                        row['Discover']
                    ) || 0,

                amex:
                    Number(
                        row['Amex']
                    ) || 0,

                debit:
                    Number(
                        row['Debit']
                    ) || 0,

                ebt: 0,

                gcRedeem:
                    Number(
                        row['Gift Card Redeemed']
                    ) || 0,

                acctCash:
                    Number(
                        row['Acct Cash']
                    ) || 0,

                deposit1,
                deposit2,
                deposit3,

                deposits:
                    deposit1 +
                    deposit2 +
                    deposit3,

                gh:
                    Number(
                        row['Grub Hub Payments']
                    ) || 0,

                uber:
                    Number(
                        row['Uber Payments']
                    ) || 0,

                dd:
                    Number(
                        row['DoorDash Payment']
                    ) || 0,

                ccTotals:
                    (Number(row['Visa']) || 0) +
                    (Number(row['Mastercard']) || 0) +
                    (Number(row['Discover']) || 0) +
                    (Number(row['Amex']) || 0),

                paymentsTotal:
                    (Number(row['Visa']) || 0) +
                    (Number(row['Mastercard']) || 0) +
                    (Number(row['Discover']) || 0) +
                    (Number(row['Amex']) || 0) +
                    (Number(row['Debit']) || 0),

                osSlash: 0,

                os: 0,

                cashPlusMinus:
                    Number(
                        row['Cash +/-']
                    ) || 0,

                cashExpected:
                    Number(
                        row['Acct Cash']
                    ) || 0,

                difference:
                    (
                        deposit1 +
                        deposit2 +
                        deposit3
                    ) -
                    (
                        Number(
                            row['Acct Cash']
                        ) || 0
                    )
            };
        });

    console.log(
        'Conciliacion generada:',
        datosExtraidos.length
    );

    document.getElementById(
        'resultsSection'
    ).style.display = 'block';

    renderTablaSucursales();
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

async function guardarConciliacion() {
    const restauranteId = document.getElementById('selectRestaurante').value;
    const templateId = document.getElementById('selectTemplate').value;
    const fecha = document.getElementById('fechaConciliacion').value;
    const notas = document.getElementById('notasConciliacion').value;

    if (!restauranteId || !templateId || !fecha || datosExtraidos.length === 0) {
        Swal.fire('Error', 'Completa todos los campos y sube un archivo', 'warning');
        return;
    }

    try {
        const token = localStorage.getItem('token');

        // Guardar valores esperados
        const valoresArray = datosExtraidos.map(d => ({
            concepto: d.concepto,
            valor: d.valorEsperado,
            fuente: 'manual'
        }));

        await fetch(`${API_URL}/conciliaciones/valores-esperados`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                restaurante_id: restauranteId,
                fecha: fecha,
                valores: valoresArray
            })
        });

        // Guardar conciliacion
        const response = await fetch(`${API_URL}/conciliaciones`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                restaurante_id: restauranteId,
                template_id: templateId,
                fecha_conciliacion: fecha,
                datos_extraidos: datosExtraidos,
                notas: notas
            })
        });

        if (response.ok) {
            const data = await response.json();
            Swal.fire({
                icon: 'success',
                title: 'Conciliacion guardada',
                text: `Se guardaron ${data.stats.total_conceptos} conceptos. ${data.stats.conceptos_diferencia} con diferencias.`,
                timer: 2500,
                showConfirmButton: false
            });
        } else {
            throw new Error('Error al guardar');
        }
    } catch (error) {
        console.error('Error guardando conciliacion:', error);
        Swal.fire('Error', 'No se pudo guardar la conciliacion', 'error');
    }
}

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
        const response = await fetch(`${API_URL}/conciliaciones/${id}`, {
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

function renderTablaSucursales() {

    console.log(
        'renderTablaSucursales',
        datosExtraidos.length
    );

    const tbody =
        document.getElementById(
            'conciliacionBody'
        );

    if (!tbody) {
        console.error(
            'No existe conciliacionBody'
        );
        return;
    }

    tbody.innerHTML =
        datosExtraidos.map(row => `
            <tr>
                <td>${row.store}</td>
                <td>${formatMoney(row.salesTax)}</td>
                <td>${formatMoney(row.grossSalesPos)}</td>
                <td>${formatMoney(row.discounts)}</td>
                <td>${formatMoney(row.promo)}</td>
                <td>${formatMoney(row.donations)}</td>
                <td>${formatMoney(row.netSales)}</td>
                <td>${formatMoney(row.gcSold)}</td>
                <td>${formatMoney(row.paidOut)}</td>
                <td>${formatMoney(row.paidIn)}</td>
                <td>${formatMoney(row.donation)}</td>
                <td>${formatMoney(row.totalRevenue)}</td>
                <td>${formatMoney(row.mastercard)}</td>
                <td>${formatMoney(row.visa)}</td>
                <td>${formatMoney(row.discover)}</td>
                <td>${formatMoney(row.amex)}</td>
                <td>${formatMoney(row.debit)}</td>
                <td>${formatMoney(row.ebt)}</td>
                <td>${formatMoney(row.gcRedeem)}</td>
                <td>${formatMoney(row.acctCash)}</td>
                <td>${formatMoney(row.deposits)}</td>
                <td>${formatMoney(row.gh)}</td>
                <td>${formatMoney(row.uber)}</td>
                <td>${formatMoney(row.dd)}</td>
                <td>${formatMoney(row.ccTotals)}</td>
                <td>${formatMoney(row.paymentsTotal)}</td>
                <td>${formatMoney(row.osSlash)}</td>
                <td>${formatMoney(row.os)}</td>
                <td>${formatMoney(row.deposit1)}</td>
                <td>${formatMoney(row.deposit2)}</td>
                <td>${formatMoney(row.deposit3)}</td>
                <td>${formatMoney(row.cashPlusMinus)}</td>
                <td>${formatMoney(row.cashExpected)}</td>
                <td class="${Math.abs(row.difference) > 0.01
                ? 'difference'
                : 'success'
            }">
                    ${formatMoney(row.difference)}
                </td>
            </tr>
        `).join('');

    const resultsSection =
        document.getElementById(
            'resultsSection'
        );

    if (resultsSection) {
        resultsSection.style.display = 'block';
    }
}
