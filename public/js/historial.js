let comparaciones = [];
let comparacionesFiltradas = [];

document.addEventListener('DOMContentLoaded', async () => {
    configurarFiltrosComparaciones();
    await Promise.all([
        cargarRestaurantsHistorial(),
        cargarComparaciones()
    ]);
});

function configurarFiltrosComparaciones() {
    ['searchInput', 'filterRestaurant', 'filterStatus', 'filterDesde', 'filterHasta']
        .forEach(id => {
            const element = document.getElementById(id);
            if (!element) return;
            element.addEventListener(id === 'searchInput' ? 'input' : 'change', aplicarFiltrosComparaciones);
        });
}

async function cargarRestaurantsHistorial() {
    const token = localStorage.getItem('token');
    const select = document.getElementById('filterRestaurant');
    if (!token || !select) return;

    try {
        const response = await fetch(`${window.API_URL}/restaurantes`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));
        const restaurantes = data.restaurantes || (Array.isArray(data) ? data : []);
        if (!response.ok) return;

        select.insertAdjacentHTML('beforeend', restaurantes.map(restaurante =>
            `<option value="${restaurante.id}">${escapeHistoryHtml(restaurante.nombre)}</option>`
        ).join(''));
    } catch (error) {
        console.warn('Filter restaurants could not be loaded:', error);
    }
}

async function cargarComparaciones() {
    const token = localStorage.getItem('token');
    const loading = document.getElementById('historyLoading');
    const errorBox = document.getElementById('historyError');

    if (!token) {
        window.location.href = '/';
        return;
    }

    if (loading) loading.hidden = false;
    if (errorBox) errorBox.hidden = true;

    try {
        const response = await fetch(`${window.API_URL}/comparaciones`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.message || data.mensaje || 'History could not be loaded');
        }

        comparaciones = data.comparaciones || [];
        renderEstadisticasComparaciones(data.estadisticas || {});
        aplicarFiltrosComparaciones();
    } catch (error) {
        console.error('Error loading comparisons:', error);
        comparaciones = [];
        renderGruposComparaciones([]);
        if (errorBox) {
            errorBox.hidden = false;
            errorBox.querySelector('p').textContent = error.message;
        }
    } finally {
        if (loading) loading.hidden = true;
    }
}

function aplicarFiltrosComparaciones() {
    const search = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
    const restaurante = document.getElementById('filterRestaurant')?.value || '';
    const estado = document.getElementById('filterStatus')?.value || '';
    const desde = document.getElementById('filterDesde')?.value || '';
    const hasta = document.getElementById('filterHasta')?.value || '';

    comparacionesFiltradas = comparaciones.filter(item => {
        const texto = [
            item.restaurante_nombre,
            item.restaurante_codigo,
            item.usuario_nombre,
            item.archivo_referencia_nombre,
            item.fecha_operacion
        ].join(' ').toLowerCase();
        const fechaComparacion = normalizarFechaHistorial(item.fecha_comparacion);

        return (!search || texto.includes(search)) &&
            (!restaurante || String(item.restaurante_id) === restaurante) &&
            (!estado || item.estado === estado) &&
            (!desde || fechaComparacion >= desde) &&
            (!hasta || fechaComparacion <= hasta);
    });

    renderGruposComparaciones(comparacionesFiltradas);
}

function renderEstadisticasComparaciones(stats) {
    setHistoryText('statTotal', stats.total || 0);
    setHistoryText('statCambios', stats.con_cambios || 0);
    setHistoryText('statSinCambios', stats.sin_cambios || 0);
    setHistoryText('statStores', stats.tiendas_con_diferencias || 0);
}

function renderGruposComparaciones(items) {
    const container = document.getElementById('comparisonHistoryGroups');
    const empty = document.getElementById('historyEmpty');
    if (!container || !empty) return;

    empty.hidden = items.length > 0;
    if (!items.length) {
        container.innerHTML = '';
        return;
    }

    const grupos = items.reduce((mapa, item) => {
        const fecha = normalizarFechaHistorial(item.fecha_comparacion);
        if (!mapa.has(fecha)) mapa.set(fecha, []);
        mapa.get(fecha).push(item);
        return mapa;
    }, new Map());

    container.innerHTML = [...grupos.entries()].map(([fecha, registros]) => `
        <section class="comparison-date-group">
            <header class="comparison-date-header">
                <div class="comparison-date-icon"><i class="fa-solid fa-calendar-day"></i></div>
                <div>
                    <span>COMPARISON DATE</span>
                    <h2>${formatearDiaHistorial(fecha)}</h2>
                </div>
                <strong>${registros.length} ${registros.length === 1 ? 'comparison' : 'comparisons'}</strong>
            </header>
            <div class="comparison-date-list">
                ${registros.map(renderComparacionItem).join('')}
            </div>
        </section>
    `).join('');
}

function renderComparacionItem(item) {
    const estado = getStatusComparacion(item.estado);
    const deleteButton = puedeDeleteComparaciones()
        ? `<button class="comparison-delete-button" type="button" onclick="eliminarComparacion(${item.id})" title="Delete comparison">
                <i class="fa-solid fa-trash"></i>
                
           </button>`
        : '';
    return `
        <article class="comparison-history-item ${estado.clase}">
            <div class="comparison-brand-icon"><i class="fa-solid ${getRestaurantIcon(item.restaurante_codigo)}"></i></div>
            <div class="comparison-main">
                <div class="comparison-title-line">
                    <h3>${escapeHistoryHtml(item.restaurante_nombre)}</h3>
                    <span class="comparison-status ${estado.clase}">${estado.texto}</span>
                </div>
                <p>Operating period: <strong>${formatearFechaCorta(item.fecha_operacion)}</strong></p>
                <small>${escapeHistoryHtml(item.usuario_nombre || 'Deleted user')} / ${formatearHoraHistorial(item.fecha_comparacion)}</small>
            </div>
            <div class="comparison-metrics">
                <div><strong>${item.tiendas_comparadas}</strong><span>Stores reviewed</span></div>
                <div><strong>${item.tiendas_con_diferencias}</strong><span>Stores with changes</span></div>
                <div><strong>${item.total_diferencias}</strong><span>Differences</span></div>
                <div><strong>${formatHistoryMoney(item.monto_diferencia_absoluta)}</strong><span>Absolute variance</span></div>
            </div>
            <div class="comparison-item-actions">
                <button class="comparison-detail-button" type="button" onclick="verComparacion(${item.id})">
                    <i class="fa-solid fa-eye"></i>
                    
                </button>
                ${deleteButton}
            </div>
        </article>
    `;
}

function puedeDeleteComparaciones() {
    try {
        return JSON.parse(localStorage.getItem('usuario') || '{}').rol === 'admin';
    } catch {
        return false;
    }
}

async function eliminarComparacion(id) {
    const comparison = comparaciones.find(item => Number(item.id) === Number(id));
    if (!comparison) return;

    const confirmation = await Swal.fire({
        icon: 'warning',
        title: 'Delete comparison',
        html: `The record for <strong>${escapeHistoryHtml(comparison.restaurante_nombre)}</strong> and all its differences will be deleted.<br><small>This action does not delete the file or the reconciliation.</small>`,
        showCancelButton: true,
        confirmButtonText: 'Yes, delete',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#b4232f'
    });
    if (!confirmation.isConfirmed) return;

    try {
        const response = await fetch(`${window.API_URL}/comparaciones/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
            throw new Error(data.message || data.mensaje || 'The comparison could not be deleted');
        }

        await cargarComparaciones();
        await Swal.fire({
            icon: 'success',
            title: 'Comparison deleted',
            timer: 1500,
            showConfirmButton: false
        });
    } catch (error) {
        await Swal.fire({ icon: 'error', title: 'Could not delete', text: error.message });
    }
}

async function verComparacion(id) {
    const token = localStorage.getItem('token');
    const modal = document.getElementById('comparisonDetailModal');
    const body = document.getElementById('comparisonDetailBody');
    if (!token || !modal || !body) return;

    modal.classList.add('active');
    body.innerHTML = '<div class="comparison-detail-loading"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading differences...</p></div>';

    try {
        const response = await fetch(`${window.API_URL}/comparaciones/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'The detail could not be loaded');
        }

        renderDetalleComparacion(data.comparacion, data.diferencias || []);
    } catch (error) {
        body.innerHTML = `<div class="comparison-detail-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>${escapeHistoryHtml(error.message)}</p></div>`;
    }
}

function renderDetalleComparacion(comparacion, diferencias) {
    const body = document.getElementById('comparisonDetailBody');
    const title = document.getElementById('comparisonDetailTitle');
    const subtitle = document.getElementById('comparisonDetailSubtitle');
    const estado = getStatusComparacion(comparacion.estado);
    if (!body) return;

    if (title) title.textContent = `${comparacion.restaurante_nombre} / ${formatearFechaCorta(comparacion.fecha_operacion)}`;
    if (subtitle) subtitle.textContent = `${formatearFechaCompleta(comparacion.fecha_comparacion)} / ${comparacion.usuario_nombre || 'Deleted user'}`;

    const resumen = `
        <div class="comparison-detail-summary">
            <div><span>Result</span><strong class="comparison-status ${estado.clase}">${estado.texto}</strong></div>
            <div><span>Stores compared</span><strong>${comparacion.tiendas_comparadas || 0}</strong></div>
            <div><span>Stores with changes</span><strong>${comparacion.tiendas_con_diferencias || 0}</strong></div>
            <div><span>Differences</span><strong>${comparacion.total_diferencias || 0}</strong></div>
        </div>
    `;

    if (!diferencias.length) {
        body.innerHTML = `${resumen}<div class="comparison-detail-empty"><i class="fa-solid fa-circle-check"></i><p>No amount differences were detected in this comparison.</p></div>`;
        return;
    }

    body.innerHTML = `${resumen}
        <div class="comparison-detail-table-wrap">
            <table class="comparison-detail-table">
                <thead><tr><th>Store</th><th>Concept</th><th>Previous</th><th>New</th><th>Difference</th></tr></thead>
                <tbody>${diferencias.map(item => `
                    <tr>
                        <td>${escapeHistoryHtml(item.tienda)}</td>
                        <td>${escapeHistoryHtml(etiquetaDiferencia(item))}</td>
                        <td>${item.valor_anterior === null ? '--' : formatHistoryMoney(item.valor_anterior)}</td>
                        <td>${item.valor_nuevo === null ? '--' : formatHistoryMoney(item.valor_nuevo)}</td>
                        <td class="${Number(item.diferencia) < 0 ? 'negative' : 'positive'}">${item.diferencia === null ? '--' : formatHistorySignedMoney(item.diferencia)}</td>
                    </tr>
                `).join('')}</tbody>
            </table>
        </div>`;
}

function cerrarDetalleComparacion() {
    document.getElementById('comparisonDetailModal')?.classList.remove('active');
}

function limpiarFiltros() {
    ['searchInput', 'filterRestaurant', 'filterStatus', 'filterDesde', 'filterHasta']
        .forEach(id => {
            const element = document.getElementById(id);
            if (element) element.value = '';
        });
    aplicarFiltrosComparaciones();
}

function exportarHistorial() {
    if (!comparacionesFiltradas.length) {
        Swal.fire({ icon: 'warning', title: 'No comparisons', text: 'There is no data to export.' });
        return;
    }

    const rows = comparacionesFiltradas.map(item => [
        item.id,
        item.fecha_comparacion,
        item.restaurante_nombre,
        item.fecha_operacion,
        getStatusComparacion(item.estado).texto,
        item.tiendas_comparadas,
        item.tiendas_con_diferencias,
        item.total_diferencias,
        item.monto_diferencia_absoluta,
        item.usuario_nombre || ''
    ]);
    const headers = ['ID', 'Comparison date', 'Restaurant', 'Operating date', 'Result', 'Stores compared', 'Stores with changes', 'Differences', 'Absolute variance', 'User'];
    const csv = [headers, ...rows]
        .map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
        .join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `comparison-history-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
}

function getStatusComparacion(estado) {
    return {
        primera_carga: { texto: 'First upload', clase: 'first' },
        sin_cambios: { texto: 'No changes', clase: 'equal' },
        con_cambios: { texto: 'With differences', clase: 'changed' },
        referencia_incompatible: { texto: 'Incompatible reference', clase: 'warning' }
    }[estado] || { texto: estado || 'Recorded', clase: 'neutral' };
}

function getRestaurantIcon(codigo) {
    return {
        'taco-bell': 'fa-bell',
        popeyes: 'fa-drumstick-bite',
        'burger-king': 'fa-burger'
    }[codigo] || 'fa-store';
}

function etiquetaDiferencia(item) {
    if (item.tipo === 'tienda_nueva') return 'Store added to the file';
    if (item.tipo === 'tienda_eliminada') return 'Store removed from the file';
    return String(item.campo || 'Amount')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replaceAll('_', ' ')
        .replace(/^./, letra => letra.toUpperCase());
}

function normalizarFechaHistorial(value) {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) return String(value).slice(0, 10);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatearDiaHistorial(value) {
    const date = new Date(`${value}T12:00:00`);
    return date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatearHoraHistorial(value) {
    return new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatearFechaCompleta(value) {
    return new Date(value).toLocaleString('en-US', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatearFechaCorta(value) {
    if (!value) return 'No date';
    return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatHistoryMoney(value) {
    return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatHistorySignedMoney(value) {
    return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', signDisplay: 'always' });
}

function setHistoryText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = Number(value || 0).toLocaleString('en-US');
}

function escapeHistoryHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

window.verComparacion = verComparacion;
window.eliminarComparacion = eliminarComparacion;
window.cerrarDetalleComparacion = cerrarDetalleComparacion;
window.limpiarFiltros = limpiarFiltros;
window.exportarHistorial = exportarHistorial;
