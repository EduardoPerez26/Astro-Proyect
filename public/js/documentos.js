// ============================================
// GESTION DE DOCUMENTOS
// ============================================

window.API_URL

let documentos = [];
let documentosFiltrados = [];
let paginaActual = 1;
const porPagina = 10;
const ITEMS_POR_PAGINA = 10;
let selectedDocument = null;
let categoriaDocumentoActual = 'reconciliations';

const DOCUMENT_CATEGORIES = {
    reconciliations: {
        title: 'Reconciliation files',
        emptyTitle: 'No reconciliation files',
        emptyText: 'No reconciliation files match the selected filters',
        paginationLabel: 'reconciliation files'
    },
    ebt: {
        title: 'EBT files',
        emptyTitle: 'No EBT files',
        emptyText: 'No EBT files match the selected filters',
        paginationLabel: 'EBT files'
    }
};

// ============================================
// INICIALIZACION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    configurarTabsDocumentos();
    cargarDocumentos();
    configurarFiltros();
});

// ============================================
// CARGAR DOCUMENTOS
// ============================================

async function cargarDocumentos() {
    const tbody = document.getElementById('documentosBody');
    const emptyState = document.getElementById('emptyState');
    const loadingState = document.getElementById('loadingState');
    const table = document.getElementById('documentosTable');

    // Mostrar loading
    loadingState.style.display = 'block';
    table.style.display = 'none';
    emptyState.style.display = 'none';

    const token = localStorage.getItem('token');
    const modoOffline = localStorage.getItem('modoOffline');

    if (modoOffline) {
        // Offline sample data.
        documentos = generarDatosEjemplo();
        mostrarDocumentos();
        loadingState.style.display = 'none';
        return;
    }

    try {
        const response = await fetch(`${window.API_URL}/archivos`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Documents could not be loaded');
        }

        const data = await response.json();

        documentos = Array.isArray(data)
            ? data
            : (data.archivos || []);
        mostrarDocumentos();

    } catch (error) {
        console.error('Error loading documents:', error);
        // Show sample data if loading fails.
        documentos = generarDatosEjemplo();
        mostrarDocumentos();
    } finally {
        loadingState.style.display = 'none';
    }
}

// ============================================
// MOSTRAR DOCUMENTOS EN TABLA
// ============================================

function leerNotasDocumento(doc = {}) {
    if (!doc?.notas) return {};

    if (typeof doc.notas === 'object') {
        return doc.notas;
    }

    try {
        return JSON.parse(doc.notas);
    } catch {
        return {};
    }
}

function normalizarCategoriaTexto(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function obtenerCategoriaDocumento(doc = {}) {
    const notas = leerNotasDocumento(doc);
    const nombre = String(doc.nombre_original || doc.nombreOriginal || '');
    const tipo = normalizarCategoriaTexto(notas.tipo);
    const fuente = normalizarCategoriaTexto(notas.fuente);
    const tipoDocumento = normalizarCategoriaTexto(notas.tipoDocumento || notas.tipo_documento);
    const categoria = normalizarCategoriaTexto(notas.categoria);
    const nombreNormalizado = normalizarCategoriaTexto(nombre);

    const esEbt = (
        tipoDocumento === 'ebt' ||
        fuente === 'ebt' ||
        categoria === 'ebt' ||
        tipo.includes('ebt') ||
        /(^|[_\s-])ebt([_.\s-]|$)/i.test(nombre) ||
        /(^|[_\s-])ebt([_.\s-]|$)/i.test(nombreNormalizado)
    );

    return esEbt ? 'ebt' : 'reconciliations';
}

function obtenerConfigCategoriaDocumento() {
    return DOCUMENT_CATEGORIES[categoriaDocumentoActual] || DOCUMENT_CATEGORIES.reconciliations;
}

function filtrarPorCategoriaDocumento(docs) {
    return docs.filter(doc => obtenerCategoriaDocumento(doc) === categoriaDocumentoActual);
}

function actualizarResumenCategorias(docsBase) {
    const counts = docsBase.reduce((acc, doc) => {
        const categoria = obtenerCategoriaDocumento(doc);
        acc[categoria] = (acc[categoria] || 0) + 1;
        return acc;
    }, { reconciliations: 0, ebt: 0 });

    const reconciliationCount = document.getElementById('reconciliationFilesCount');
    const ebtCount = document.getElementById('ebtFilesCount');

    if (reconciliationCount) reconciliationCount.textContent = counts.reconciliations || 0;
    if (ebtCount) ebtCount.textContent = counts.ebt || 0;
}

function actualizarVistaCategoriaDocumento() {
    const config = obtenerConfigCategoriaDocumento();

    document.querySelectorAll('[data-document-tab]').forEach(tab => {
        const active = tab.dataset.documentTab === categoriaDocumentoActual;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    const tableTitle = document.getElementById('documentsTableTitle');
    const emptyTitle = document.getElementById('documentsEmptyTitle');
    const emptyText = document.getElementById('documentsEmptyText');
    const paginationItemsLabel = document.getElementById('paginationItemsLabel');

    if (tableTitle) tableTitle.textContent = config.title;
    if (emptyTitle) emptyTitle.textContent = config.emptyTitle;
    if (emptyText) emptyText.textContent = config.emptyText;
    if (paginationItemsLabel) paginationItemsLabel.textContent = config.paginationLabel;
}

function configurarTabsDocumentos() {
    document.querySelectorAll('[data-document-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            const categoria = tab.dataset.documentTab;
            if (!DOCUMENT_CATEGORIES[categoria] || categoria === categoriaDocumentoActual) return;

            categoriaDocumentoActual = categoria;
            paginaActual = 1;
            mostrarDocumentos();
        });
    });
}

function obtenerInfoReviewFuente(documento = '') {
    const doc = typeof documento === 'object'
        ? documento
        : { nombre_original: documento };
    const etiquetas = {
        sales: 'Main file',
        salesDetail: 'Sales Detail',
        ebt: 'EBT'
    };

    try {
        const notas = leerNotasDocumento(doc);

        if (notas?.tipo === 'referencia_comparacion') {
            return {
                tipo: notas.fuente,
                version: null,
                nombreOriginal: notas.nombreOriginal || doc.nombre_original,
                etiqueta: etiquetas[notas.fuente] || notas.fuente,
                esReferenciaActual: true
            };
        }

        if (notas?.tipo === 'revision_fuente') {
            return {
                tipo: notas.fuente,
                version: Number(notas.revision),
                nombreOriginal: notas.nombreOriginal || doc.nombre_original,
                etiqueta: etiquetas[notas.fuente] || notas.fuente,
                esReferenciaActual: false
            };
        }
    } catch {
        // Continúa con el formato anterior basado en el nombre.
    }

    const match = String(doc.nombre_original || '').match(
        /^XB-REV-([a-zA-Z]+)-V(\d+)-([a-f0-9]{16})--(.+)$/i
    );

    if (!match) return null;

    return {
        tipo: match[1],
        version: Number(match[2]),
        nombreOriginal: match[4],
        etiqueta: etiquetas[match[1]] || match[1],
        esReferenciaActual: false
    };
}

function mostrarDocumentos() {
    const tbody = document.getElementById('documentosBody');
    const emptyState = document.getElementById('emptyState');
    const table = document.getElementById('documentosTable');

    // Aplicar filtros
    const documentosBaseFiltrados = aplicarFiltrosBase(documentos);
    actualizarResumenCategorias(documentosBaseFiltrados);
    actualizarVistaCategoriaDocumento();
    documentosFiltrados = filtrarPorCategoriaDocumento(documentosBaseFiltrados);

    // Paginacion
    const total = documentosFiltrados.length;
    const totalPaginas = Math.ceil(total / porPagina);
    const inicio = (paginaActual - 1) * porPagina;
    const fin = inicio + porPagina;
    const paginados = documentosFiltrados.slice(inicio, fin);

    if (paginados.length === 0) {
        table.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    table.style.display = 'table';
    emptyState.style.display = 'none';

    tbody.innerHTML = paginados.map(doc => {
        const revision = obtenerInfoReviewFuente(doc);
        const categoria = obtenerCategoriaDocumento(doc);
        const nombreVisible = revision?.nombreOriginal || doc.nombre_original;
        let metaVisible = revision
            ? `${revision.etiqueta} - Revision V${String(revision.version).padStart(3, '0')}`
            : (categoria === 'ebt' ? 'EBT file' : `${doc.numero_hojas || 1} sheet(s)`);

        if (revision) {
            metaVisible = revision.esReferenciaActual
                ? `${revision.etiqueta} - Comparison reference`
                : `${revision.etiqueta} - Previous reference`;
        }

        return `
        <tr>
            <td>${doc.id}</td>
            <td>
                <div class="file-cell">
                    <div class="file-icon">
                        <i class="fa-solid fa-file-excel"></i>
                    </div>
                    <div class="file-info">
                        <span class="file-name">${nombreVisible}</span>
                        <span class="file-meta">${metaVisible}</span>
                    </div>
                </div>
            </td>
            <td>${doc.restaurante_nombre || doc.restaurante || '-'}</td>
            <td>${formatearTamano(doc.tamano_bytes)}</td>
            <td><span class="status-badge ${doc.estado}">${formatearStatus(doc.estado)}</span></td>
            <td>
                <div class="user-cell">
                    <div class="user-avatar">${(doc.usuario_nombre || doc.subido_por || 'U').charAt(0).toUpperCase()}</div>
                    <span>${doc.usuario_nombre || doc.subido_por || '-'}</span>
                </div>
            </td>
            <td>${formatearFecha(doc.fecha_subida)}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view" onclick="previsualizarConciliacion(${doc.id})" title="Preview file">
    <i class="fa-solid fa-eye"></i>
</button>

<button class="action-btn view" onclick="verDetalles(${doc.id})" title="View details">
    <i class="fa-solid fa-circle-info"></i>
</button>
                    <button class="action-btn download" onclick="descargarArchivo(${doc.id})" title="Download">
                        <i class="fa-solid fa-download"></i>
                    </button>
                    <button class="action-btn delete" onclick="eliminarArchivo(${doc.id})" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');

    // Refresh paginacion
    actualizarPaginacion(totalPaginas);
}

// ============================================
// FILTROS
// ============================================

function configurarFiltros() {
    const searchInput = document.getElementById('searchInput');
    const filterRestaurant = document.getElementById('filterRestaurant');
    const filterStatus = document.getElementById('filterStatus');
    const filterFechaDesde = document.getElementById('filterFechaDesde');
    const filterFechaHasta = document.getElementById('filterFechaHasta');

    [searchInput, filterRestaurant, filterStatus, filterFechaDesde, filterFechaHasta].forEach(el => {
        if (el) {
            el.addEventListener('change', () => {
                paginaActual = 1;
                mostrarDocumentos();
            });
            if (el === searchInput) {
                el.addEventListener('input', () => {
                    paginaActual = 1;
                    mostrarDocumentos();
                });
            }
        }
    });
}

function aplicarFiltrosBase(docs) {
    const normalizar = value => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    const search = normalizar(document.getElementById('searchInput')?.value);
    const restaurante = document.getElementById('filterRestaurant')?.value || '';
    const estado = document.getElementById('filterStatus')?.value || '';
    const fechaDesde = document.getElementById('filterFechaDesde')?.value || '';
    const fechaHasta = document.getElementById('filterFechaHasta')?.value || '';

    return docs.filter(doc => {
        const revision = obtenerInfoReviewFuente(doc);
        const nombreVisible = revision?.nombreOriginal || doc.nombre_original;
        const textoBusqueda = normalizar([
            nombreVisible,
            doc.restaurante_nombre,
            doc.restaurante_codigo,
            doc.usuario_nombre
        ].filter(Boolean).join(' '));

        // Filtro de busqueda
        if (search && !textoBusqueda.includes(search)) {
            return false;
        }

        // Filtro de restaurante
        if (restaurante) {
            const codigoDocumento = normalizar(
                doc.restaurante_codigo ||
                doc.restaurante ||
                doc.restaurante_nombre
            ).replace(/[^a-z0-9]/g, '');
            const codigoFiltro = normalizar(restaurante)
                .replace(/[^a-z0-9]/g, '');

            if (codigoDocumento !== codigoFiltro) return false;
        }

        // Filtro de estado
        if (estado && doc.estado !== estado) {
            return false;
        }

        // Filtro de fecha desde
        if (fechaDesde) {
            const fechaDoc = new Date(doc.fecha_subida);
            const inicio = new Date(`${fechaDesde}T00:00:00`);
            if (!Number.isNaN(fechaDoc.getTime()) && fechaDoc < inicio) return false;
        }

        // Filtro de fecha hasta
        if (fechaHasta) {
            const fechaDoc = new Date(doc.fecha_subida);
            const fin = new Date(`${fechaHasta}T23:59:59.999`);
            if (!Number.isNaN(fechaDoc.getTime()) && fechaDoc > fin) return false;
        }

        return true;
    });
}

function aplicarFiltros(docs) {
    return filtrarPorCategoriaDocumento(aplicarFiltrosBase(docs));
}

function limpiarFiltros() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterRestaurant').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterFechaDesde').value = '';
    document.getElementById('filterFechaHasta').value = '';
    paginaActual = 1;
    mostrarDocumentos();
}

// ============================================
// PAGINACION
// ============================================

function actualizarPaginacion(totalPaginas) {
    const pagination = document.getElementById('pagination');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    const currentPageEl = document.getElementById('currentPage');
    const showingFrom = document.getElementById('showingFrom');
    const showingTo = document.getElementById('showingTo');
    const totalItems = document.getElementById('totalItems');

    if (!pagination) return;

    const total = documentosFiltrados.length;
    const desde = total > 0 ? ((paginaActual - 1) * ITEMS_POR_PAGINA) + 1 : 0;
    const hasta = Math.min(paginaActual * ITEMS_POR_PAGINA, total);

    if (showingFrom) showingFrom.textContent = desde;
    if (showingTo) showingTo.textContent = hasta;
    if (totalItems) totalItems.textContent = total;
    if (currentPageEl) currentPageEl.textContent = paginaActual;

    if (btnPrev) btnPrev.disabled = paginaActual <= 1;
    if (btnNext) btnNext.disabled = paginaActual >= totalPaginas;

    pagination.style.display = total > 0 ? 'flex' : 'none';
}

function cambiarPagina(direccion) {
    paginaActual += direccion;
    mostrarDocumentos();
}

// ============================================
// ACCIONES
// ============================================

function verDetalles(id) {
    const doc = documentos.find(d => d.id === id);
    if (!doc) return;

    selectedDocument = doc;

    const modalBody = document.getElementById('modalBody');
    const modalTitulo = document.getElementById('modalTitulo');
    const revision = obtenerInfoReviewFuente(doc);
    const categoria = obtenerCategoriaDocumento(doc);
    const nombreVisible = revision?.nombreOriginal || doc.nombre_original;
    const nombreSeguro = escapeDocumentoHtml(nombreVisible);
    const restaurante = escapeDocumentoHtml(doc.restaurante_nombre || doc.restaurante || 'No restaurant');
    const usuario = escapeDocumentoHtml(doc.usuario_nombre || doc.subido_por || 'No user');
    const hojas = escapeDocumentoHtml(doc.nombres_hojas || 'Not specified');
    const estado = escapeDocumentoHtml(formatearStatus(doc.estado));
    const uso = revision
        ? `${revision.esReferenciaActual ? 'Comparison reference' : 'Previous reference'} / ${revision.etiqueta}`
        : (categoria === 'ebt' ? 'EBT file' : 'Reconciliation file');
    const notasVisibles = obtenerNotasVisiblesDocumento(doc);

    modalTitulo.textContent = 'Document detail';
    modalBody.innerHTML = `
        <section class="document-detail-overview">
            <div class="document-detail-file-icon"><i class="fa-solid fa-file-excel"></i></div>
            <div class="document-detail-file-copy">
                <span>REGISTERED FILE</span>
                <h4 title="${nombreSeguro}">${nombreSeguro}</h4>
                <p>${restaurante} / Record #${Number(doc.id)}</p>
            </div>
            <span class="document-detail-status badge badge-${escapeDocumentoHtml(doc.estado)}">${estado}</span>
        </section>

        <section class="document-detail-grid">
            <article><span class="document-detail-card-icon"><i class="fa-solid fa-store"></i></span><div><small>Restaurant</small><strong>${restaurante}</strong></div></article>
            <article><span class="document-detail-card-icon"><i class="fa-solid fa-user"></i></span><div><small>Uploaded by</small><strong>${usuario}</strong></div></article>
            <article><span class="document-detail-card-icon"><i class="fa-solid fa-calendar-day"></i></span><div><small>Upload date</small><strong>${escapeDocumentoHtml(formatearFecha(doc.fecha_subida, true))}</strong></div></article>
            <article><span class="document-detail-card-icon"><i class="fa-solid fa-weight-hanging"></i></span><div><small>Size</small><strong>${escapeDocumentoHtml(formatearTamano(doc.tamano_bytes))}</strong></div></article>
        </section>

        <section class="document-detail-section">
            <header><span>TECHNICAL INFORMATION</span><h4>File data</h4></header>
            <dl class="document-detail-list">
                <div><dt>Identifier</dt><dd>#${Number(doc.id)}</dd></div>
                <div><dt>System use</dt><dd>${escapeDocumentoHtml(uso)}</dd></div>
                <div><dt>Included sheets</dt><dd>${hojas}</dd></div>
            </dl>
        </section>
        ${notasVisibles && !revision ? `
        <section class="document-detail-note">
            <i class="fa-solid fa-note-sticky"></i>
            <div><span>NOTES</span><p>${escapeDocumentoHtml(notasVisibles)}</p></div>
        </section>` : ''}
    `;

    document.getElementById('modalDetalles').classList.add('active');
}

function cerrarModal() {
    document.getElementById('modalDetalles').classList.remove('active');
    selectedDocument = null;
}

function downloadSelectedDocument() {
    if (selectedDocument?.id) descargarArchivo(selectedDocument.id);
}

function escapeDocumentoHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function obtenerNotasVisiblesDocumento(doc = {}) {
    if (!doc.notas) return '';

    if (typeof doc.notas !== 'string') return '';

    const notas = doc.notas.trim();
    if (!notas) return '';

    try {
        JSON.parse(notas);
        return '';
    } catch {
        return notas;
    }
}

async function descargarArchivo(id) {
    const token = localStorage.getItem('token');
    const modoOffline = localStorage.getItem('modoOffline');

    if (modoOffline) {
        Swal.fire({
            icon: 'info',
            title: 'Offline mode',
            text: 'Download is not available in offline mode'
        });
        return;
    }

    try {

        const response = await fetch(`${window.API_URL}/archivos/${id}/descargar`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || 'Download failed');
        }

        const blob = await response.blob();
        const doc = documentos.find(d => d.id === id);
        const revision = obtenerInfoReviewFuente(doc);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = revision?.nombreOriginal || doc?.nombre_original || 'file.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();

    } catch (error) {
        console.error('Download error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Could not download',
            text: error.message || 'The file could not be downloaded'
        });
    }
}

async function eliminarArchivo(id) {
    const result = await Swal.fire({
        title: 'Delete document',
        text: 'This action cannot be undone. The file and all its data will be deleted.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'Yes, delete',
        cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    const token = localStorage.getItem('token');
    const modoOffline = localStorage.getItem('modoOffline');

    if (modoOffline) {
        documentos = documentos.filter(d => d.id !== id);
        mostrarDocumentos();
        Swal.fire('Deleted', 'The document was deleted (offline mode)', 'success');
        return;
    }

    try {
        const response = await fetch(`${window.API_URL}/archivos/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Delete failed');

        documentos = documentos.filter(d => d.id !== id);
        mostrarDocumentos();

        Swal.fire({
            icon: 'success',
            title: 'Deleted',
            text: 'The document was deleted',
            timer: 2000,
            showConfirmButton: false
        });

    } catch (error) {
        console.error('Delete error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'The file could not be deleted'
        });
    }
}

// ============================================
// UTILIDADES
// ============================================

function formatearTamano(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatearStatus(estado) {
    const estados = {
        'pendiente': 'Pending',
        'validado': 'Validated',
        'con_errores': 'With errors',
        'procesado': 'Processed'
    };
    return estados[estado] || estado;
}

function formatearFecha(fecha, conHora = false) {
    if (!fecha) return '-';
    const d = new Date(fecha);
    const opciones = { year: 'numeric', month: 'short', day: 'numeric' };
    if (conHora) {
        opciones.hour = '2-digit';
        opciones.minute = '2-digit';
    }
    return d.toLocaleDateString('en-US', opciones);
}

function generarDatosEjemplo() {
    return [
        {
            id: 1,
            nombre_original: 'Daily Sales Taco Bell 05-26 2026.xlsx',
            restaurante: 'Taco Bell',
            restaurante_nombre: 'Taco Bell',
            numero_hojas: 3,
            nombres_hojas: 'Sales, EBT, Summary',
            tamano_bytes: 245760,
            estado: 'validado',
            subido_por: 'Administrator',
            fecha_subida: '2026-05-26T10:30:00'
        },
        {
            id: 2,
            nombre_original: 'Daily_Sales_Taco_Bell_2026-05-26_EBT.xlsx',
            restaurante: 'Taco Bell',
            restaurante_nombre: 'Taco Bell',
            numero_hojas: 1,
            nombres_hojas: 'EBT',
            tamano_bytes: 14336,
            estado: 'pendiente',
            subido_por: 'Administrator',
            fecha_subida: '2026-05-28T08:10:00',
            notas: JSON.stringify({
                tipo: 'archivo_ebt_independiente',
                tipoDocumento: 'ebt',
                fuente: 'ebt'
            })
        },
        {
            id: 3,
            nombre_original: 'Conciliation BK May 2026.xlsx',
            restaurante: 'Burger King',
            restaurante_nombre: 'Burger King',
            numero_hojas: 2,
            nombres_hojas: 'Data, Summary',
            tamano_bytes: 189440,
            estado: 'pendiente',
            subido_por: 'User1',
            fecha_subida: '2026-05-25T14:15:00'
        },
        {
            id: 4,
            nombre_original: 'Popeyes Weekly Report.xlsx',
            restaurante: 'Popeyes',
            restaurante_nombre: 'Popeyes',
            numero_hojas: 4,
            nombres_hojas: 'Week1, Week2, Week3, Week4',
            tamano_bytes: 512000,
            estado: 'con_errores',
            subido_por: 'Supervisor',
            fecha_subida: '2026-05-24T09:00:00',
            notas: 'Review errors in week 3'
        },
        {
            id: 5,
            nombre_original: 'KFC Monthly Sales.xlsx',
            restaurante: 'KFC',
            restaurante_nombre: 'KFC',
            numero_hojas: 1,
            nombres_hojas: 'Sales',
            tamano_bytes: 98304,
            estado: 'procesado',
            subido_por: 'Administrator',
            fecha_subida: '2026-05-20T16:45:00'
        }
    ];
}

let previewWorkbookActual = null;

async function previsualizarConciliacion(id) {
    const token = localStorage.getItem('token');
    const modoOffline = localStorage.getItem('modoOffline');

    if (modoOffline) {
        Swal.fire({
            icon: 'info',
            title: 'Offline mode',
            text: 'Preview is not available in offline mode'
        });
        return;
    }

    const doc = documentos.find(d => d.id === id);
    if (!doc) return;

    selectedDocument = doc;

    if (typeof XLSX === 'undefined') {
        Swal.fire({
            icon: 'error',
            title: 'Excel cannot be opened',
            text: 'The XLSX library was not loaded. Check that xlsx.full.min.js is included in documentos.astro.'
        });
        return;
    }

    try {
        Swal.fire({
            title: `Opening ${obtenerCategoriaDocumento(doc) === 'ebt' ? 'EBT file' : 'reconciliation'}...`,
            text: 'Reading the Excel file',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const response = await fetch(`${window.API_URL}/archivos/${id}/descargar`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || 'The file could not be opened');
        }

        const buffer = await response.arrayBuffer();

        previewWorkbookActual = XLSX.read(buffer, {
            type: 'array',
            cellDates: false,
            raw: false
        });

        Swal.close();

        abrirPreviewExcel(doc, previewWorkbookActual);

    } catch (error) {
        console.error('Preview open error:', error);

        Swal.fire({
            icon: 'error',
            title: 'Could not open the reconciliation',
            text: error.message || 'Error reading the file'
        });
    }
}

function abrirPreviewExcel(doc, workbook) {
    const modal = document.getElementById('modalPreviewExcel');
    const titulo = document.getElementById('previewTitulo');
    const tabs = document.getElementById('previewSheetTabs');

    if (!modal || !titulo || !tabs) {
        Swal.fire({
            icon: 'error',
            title: 'Preview modal is missing',
            text: 'Check that modalPreviewExcel exists in documentos.astro.'
        });
        return;
    }

    const revision = obtenerInfoReviewFuente(doc);
    const nombreVisible = revision?.nombreOriginal || doc.nombre_original || 'Reconciliation';

    titulo.textContent = nombreVisible;
    tabs.innerHTML = '';

    workbook.SheetNames.forEach((sheetName, index) => {
        const button = document.createElement('button');

        button.type = 'button';
        button.className = `preview-sheet-tab ${index === 0 ? 'active' : ''}`;
        button.textContent = sheetName;
        button.title = sheetName;

        button.addEventListener('click', () => {
            document.querySelectorAll('.preview-sheet-tab').forEach(tab => {
                tab.classList.remove('active');
            });

            button.classList.add('active');
            renderPreviewSheet(sheetName);
        });

        tabs.appendChild(button);
    });

    renderPreviewSheet(workbook.SheetNames[0]);

    modal.classList.add('active');
}

function renderPreviewSheet(sheetName) {
    if (!previewWorkbookActual) return;

    const sheet = previewWorkbookActual.Sheets[sheetName];
    if (!sheet) return;

    document.querySelectorAll('.preview-sheet-tab').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim() === sheetName);
    });

    const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: ''
    });

    const head = document.getElementById('previewExcelHead');
    const body = document.getElementById('previewExcelBody');

    if (!head || !body) return;

    if (!rows.length) {
        head.innerHTML = '';
        body.innerHTML = `
            <tr>
                <td>This sheet has no data to display.</td>
            </tr>
        `;
        return;
    }

    const maxColumns = Math.max(...rows.map(row => row.length));
    const encabezados = rows[0] || [];

    head.innerHTML = `
        <tr>
            ${Array.from({ length: maxColumns }, (_, index) => {
        const valor = encabezados[index] || `Columna ${index + 1}`;
        return `<th>${escapeDocumentoHtml(valor)}</th>`;
    }).join('')}
        </tr>
    `;

    body.innerHTML = rows.slice(1, 500).map(row => `
        <tr>
            ${Array.from({ length: maxColumns }, (_, index) => `
                <td>${escapeDocumentoHtml(row[index] ?? '')}</td>
            `).join('')}
        </tr>
    `).join('');

    if (rows.length > 501) {
        body.innerHTML += `
            <tr>
                <td colspan="${maxColumns}">
                    Showing the first 500 rows of ${rows.length.toLocaleString('en-US')}.
                </td>
            </tr>
        `;
    }
}

function cerrarPreviewExcel() {
    document.getElementById('modalPreviewExcel')?.classList.remove('active');

    document.getElementById('previewSheetTabs').innerHTML = '';
    document.getElementById('previewExcelHead').innerHTML = '';
    document.getElementById('previewExcelBody').innerHTML = '';

    previewWorkbookActual = null;
}

// Close modal con Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cerrarModal();
    }
});
