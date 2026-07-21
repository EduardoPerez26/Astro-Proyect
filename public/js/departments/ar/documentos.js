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
// UTILIDADES DE SEGURIDAD
// ============================================

/**
 * Escapa texto HTML para evitar XSS
 * @param {string} text - Texto a escapar
 * @returns {string} Texto escapado seguro
 */
function escapeDocumentoHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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
    const canExport =
        window.AppPermissions?.can('documentos', 'exportar') === true;
    const canDelete =
        window.AppPermissions?.can('documentos', 'eliminar') === true;

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
<button class="action-btn view" onclick="administrarCicloDocumento(${doc.id})" title="Version and approval history">
    <i class="fa-solid fa-code-branch"></i>
</button>
                    <button class="action-btn download" onclick="descargarArchivo(${doc.id})" title="Download" ${canExport ? '' : 'hidden'}>
                        <i class="fa-solid fa-download"></i>
                    </button>
                    <button class="action-btn delete" onclick="eliminarArchivo(${doc.id})" title="Delete" ${canDelete ? '' : 'hidden'}>
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
    if (!window.AppPermissions?.can('documentos', 'exportar')) return;
    if (selectedDocument?.id) descargarArchivo(selectedDocument.id);
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
    if (!window.AppPermissions?.can('documentos', 'exportar')) return;
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
    if (!window.AppPermissions?.can('documentos', 'eliminar')) return;
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


function escaparCicloDocumento(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function fechaCicloDocumento(value) {
    if (!value) return 'Not recorded';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return escaparCicloDocumento(value);
    return parsed.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function administrarCicloDocumento(id) {
    const token = localStorage.getItem('token');
    const canEdit = window.AppPermissions?.can('documentos', 'editar') === true;
    const canCreate = window.AppPermissions?.can('documentos', 'crear') === true;

    try {
        const response = await fetch(`${window.API_URL}/corporate/documents/${id}/lifecycle`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.success === false) {
            throw new Error(data.message || 'The document history could not be loaded.');
        }

        const versions = Array.isArray(data.versions) ? data.versions : [];
        const events = Array.isArray(data.events) ? data.events : [];
        const latest = versions[0] || null;
        const currentStatus = latest?.workflow_status || documentos.find(item => Number(item.id) === Number(id))?.estado || 'uploaded';

        const versionRows = versions.length
            ? versions.map(version => `
                <article class="corporate-lifecycle-version">
                    <div>
                        <strong>Version ${Number(version.version_number || 1)}</strong>
                        <span class="status-badge ${escaparCicloDocumento(version.workflow_status)}">${escaparCicloDocumento(formatearStatus(version.workflow_status))}</span>
                    </div>
                    <small>${escaparCicloDocumento(version.source_filename || 'Registered file')} · ${fechaCicloDocumento(version.created_at)}</small>
                    <small>Owner: ${escaparCicloDocumento(version.owner_name || 'Not assigned')}</small>
                    ${version.file_hash ? `<code title="SHA-256">${escaparCicloDocumento(String(version.file_hash).slice(0, 20))}…</code>` : ''}
                </article>
            `).join('')
            : '<p class="corporate-lifecycle-empty">No version history has been recorded yet.</p>';

        const eventRows = events.length
            ? events.slice(0, 12).map(event => `
                <li>
                    <span class="corporate-lifecycle-dot"></span>
                    <div>
                        <strong>${escaparCicloDocumento(formatearStatus(event.new_status || event.event_type))}</strong>
                        <small>${escaparCicloDocumento(event.actor_name || 'System')} · ${fechaCicloDocumento(event.created_at)}</small>
                        ${event.notes ? `<p>${escaparCicloDocumento(event.notes)}</p>` : ''}
                    </div>
                </li>
            `).join('')
            : '<li class="corporate-lifecycle-empty">No workflow events have been registered.</li>';

        const controls = canEdit ? `
            <section class="corporate-lifecycle-controls">
                <div class="corporate-lifecycle-field">
                    <label for="documentWorkflowStatus">New status</label>
                    <select id="documentWorkflowStatus" class="swal2-select">
                        ${[
                            ['draft', 'Draft'],
                            ['uploaded', 'Uploaded'],
                            ['under_review', 'Under review'],
                            ['changes_requested', 'Changes requested'],
                            ['approved', 'Approved'],
                            ['posted', 'Posted'],
                            ['archived', 'Archived'],
                            ['rejected', 'Rejected']
                        ].map(([value, label]) => `<option value="${value}" ${value === currentStatus ? 'selected' : ''}>${label}</option>`).join('')}
                    </select>
                </div>
                <div class="corporate-lifecycle-field">
                    <label for="documentWorkflowNotes">Decision comment</label>
                    <textarea id="documentWorkflowNotes" class="swal2-textarea" maxlength="5000" placeholder="Add review evidence, approval notes, or a rejection reason."></textarea>
                </div>
                ${canCreate ? '<div class="corporate-lifecycle-secondary-action"><button type="button" id="createDocumentVersion" class="corporate-inline-action"><i class="fa-solid fa-plus"></i> Create draft version</button></div>' : ''}
            </section>
        ` : '';

        const result = await Swal.fire({
            title: `Document #${Number(id)} lifecycle`,
            width: 900,
            customClass: {
                popup: 'corporate-lifecycle-popup',
                htmlContainer: 'corporate-lifecycle-html',
                actions: 'corporate-lifecycle-actions'
            },
            html: `
                <div class="corporate-lifecycle-shell">
                    <section>
                        <header><span>VERSIONS</span><strong>${versions.length}</strong></header>
                        <div class="corporate-lifecycle-versions">${versionRows}</div>
                    </section>
                    <section>
                        <header><span>RECENT ACTIVITY</span><strong>${events.length}</strong></header>
                        <ol class="corporate-lifecycle-events">${eventRows}</ol>
                    </section>
                    ${controls}
                </div>
            `,
            showCancelButton: true,
            showConfirmButton: canEdit,
            confirmButtonText: 'Update workflow',
            cancelButtonText: 'Close',
            confirmButtonColor: '#17191c',
            focusConfirm: false,
            didOpen: () => {
                const createButton = document.getElementById('createDocumentVersion');
                createButton?.addEventListener('click', async () => {
                    const versionPrompt = await Swal.fire({
                        title: 'Create draft version',
                        input: 'textarea',
                        inputLabel: 'Version notes',
                        inputPlaceholder: 'Describe why a new version is required.',
                        showCancelButton: true,
                        confirmButtonText: 'Create version',
                        confirmButtonColor: '#17191c'
                    });
                    if (!versionPrompt.isConfirmed) return;

                    const versionResponse = await fetch(`${window.API_URL}/corporate/documents/${id}/versions`, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ comments: versionPrompt.value || '' })
                    });
                    const versionData = await versionResponse.json().catch(() => ({}));
                    if (!versionResponse.ok || versionData.success === false) {
                        await Swal.fire('Version not created', versionData.message || 'The new version could not be created.', 'error');
                        return;
                    }
                    await Swal.fire('Version created', `Draft version ${versionData.version_number} is ready.`, 'success');
                    administrarCicloDocumento(id);
                });
            },
            preConfirm: () => {
                const status = document.getElementById('documentWorkflowStatus')?.value || '';
                const notes = document.getElementById('documentWorkflowNotes')?.value.trim() || '';
                if (['changes_requested', 'rejected'].includes(status) && !notes) {
                    Swal.showValidationMessage('A comment is required when requesting changes or rejecting a document.');
                    return false;
                }
                return { status, notes };
            }
        });

        if (!result.isConfirmed || !result.value) return;

        const updateResponse = await fetch(`${window.API_URL}/corporate/documents/${id}/transition`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(result.value)
        });
        const updateData = await updateResponse.json().catch(() => ({}));
        if (!updateResponse.ok || updateData.success === false) {
            throw new Error(updateData.message || 'The document workflow could not be updated.');
        }

        const localDocument = documentos.find(item => Number(item.id) === Number(id));
        if (localDocument) localDocument.estado = updateData.status;
        mostrarDocumentos();

        await Swal.fire({
            icon: 'success',
            title: 'Workflow updated',
            text: `The document is now ${formatearStatus(updateData.status).toLowerCase()}.`,
            timer: 1800,
            showConfirmButton: false
        });
    } catch (error) {
        console.error('Document lifecycle error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Lifecycle unavailable',
            text: error.message || 'The document history could not be loaded.'
        });
    }
}

window.administrarCicloDocumento = administrarCicloDocumento;

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
        'procesado': 'Processed',
        'draft': 'Draft',
        'uploaded': 'Uploaded',
        'under_review': 'Under review',
        'changes_requested': 'Changes requested',
        'approved': 'Approved',
        'posted': 'Posted',
        'archived': 'Archived',
        'rejected': 'Rejected'
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
            text: 'The XLSX library was not loaded. Refresh the page or verify that SheetJS is enabled in the shared layout.'
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
