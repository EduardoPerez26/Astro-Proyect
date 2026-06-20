let comparaciones = [];
let comparacionesFiltradas = [];

document.addEventListener('DOMContentLoaded', async () => {
    configurarFiltrosComparaciones();
    await Promise.all([
        cargarRestaurantesHistorial(),
        cargarComparaciones()
    ]);
});

function configurarFiltrosComparaciones() {
    ['searchInput', 'filterRestaurante', 'filterEstado', 'filterDesde', 'filterHasta']
        .forEach(id => {
            const element = document.getElementById(id);
            if (!element) return;
            element.addEventListener(id === 'searchInput' ? 'input' : 'change', aplicarFiltrosComparaciones);
        });
}

async function cargarRestaurantesHistorial() {
    const token = localStorage.getItem('token');
    const select = document.getElementById('filterRestaurante');
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
        console.warn('No se pudieron cargar los restaurantes del filtro:', error);
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
            throw new Error(data.message || data.mensaje || 'No se pudo cargar el historial');
        }

        comparaciones = data.comparaciones || [];
        renderEstadisticasComparaciones(data.estadisticas || {});
        aplicarFiltrosComparaciones();
    } catch (error) {
        console.error('Error cargando comparaciones:', error);
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
    const restaurante = document.getElementById('filterRestaurante')?.value || '';
    const estado = document.getElementById('filterEstado')?.value || '';
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
    setHistoryText('statTiendas', stats.tiendas_con_diferencias || 0);
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
                    <span>FECHA DE COMPARACION</span>
                    <h2>${formatearDiaHistorial(fecha)}</h2>
                </div>
                <strong>${registros.length} ${registros.length === 1 ? 'comparacion' : 'comparaciones'}</strong>
            </header>
            <div class="comparison-date-list">
                ${registros.map(renderComparacionItem).join('')}
            </div>
        </section>
    `).join('');
}

function renderComparacionItem(item) {
    const estado = getEstadoComparacion(item.estado);
    const deleteButton = puedeEliminarComparaciones()
        ? `<button class="comparison-delete-button" type="button" onclick="eliminarComparacion(${item.id})" title="Eliminar comparación">
                <i class="fa-solid fa-trash"></i>
                Eliminar
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
                <p>Periodo operativo: <strong>${formatearFechaCorta(item.fecha_operacion)}</strong></p>
                <small>${escapeHistoryHtml(item.usuario_nombre || 'Usuario eliminado')} / ${formatearHoraHistorial(item.fecha_comparacion)}</small>
            </div>
            <div class="comparison-metrics">
                <div><strong>${item.tiendas_comparadas}</strong><span>Tiendas revisadas</span></div>
                <div><strong>${item.tiendas_con_diferencias}</strong><span>Tiendas con cambios</span></div>
                <div><strong>${item.total_diferencias}</strong><span>Diferencias</span></div>
                <div><strong>${formatHistoryMoney(item.monto_diferencia_absoluta)}</strong><span>Variacion absoluta</span></div>
            </div>
            <div class="comparison-item-actions">
                <button class="comparison-detail-button" type="button" onclick="verComparacion(${item.id})">
                    <i class="fa-solid fa-arrow-right"></i>
                    Ver detalle
                </button>
                ${deleteButton}
            </div>
        </article>
    `;
}

function puedeEliminarComparaciones() {
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
        title: 'Eliminar comparación',
        html: `Se eliminará el registro de <strong>${escapeHistoryHtml(comparison.restaurante_nombre)}</strong> y todas sus diferencias.<br><small>Esta acción no elimina el archivo ni la conciliación.</small>`,
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
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
            throw new Error(data.message || data.mensaje || 'No se pudo eliminar la comparación');
        }

        await cargarComparaciones();
        await Swal.fire({
            icon: 'success',
            title: 'Comparación eliminada',
            timer: 1500,
            showConfirmButton: false
        });
    } catch (error) {
        await Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: error.message });
    }
}

async function verComparacion(id) {
    const token = localStorage.getItem('token');
    const modal = document.getElementById('comparisonDetailModal');
    const body = document.getElementById('comparisonDetailBody');
    if (!token || !modal || !body) return;

    modal.classList.add('active');
    body.innerHTML = '<div class="comparison-detail-loading"><i class="fa-solid fa-spinner fa-spin"></i><p>Cargando diferencias...</p></div>';

    try {
        const response = await fetch(`${window.API_URL}/comparaciones/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'No se pudo cargar el detalle');
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
    const estado = getEstadoComparacion(comparacion.estado);
    if (!body) return;

    if (title) title.textContent = `${comparacion.restaurante_nombre} / ${formatearFechaCorta(comparacion.fecha_operacion)}`;
    if (subtitle) subtitle.textContent = `${formatearFechaCompleta(comparacion.fecha_comparacion)} / ${comparacion.usuario_nombre || 'Usuario eliminado'}`;

    const resumen = `
        <div class="comparison-detail-summary">
            <div><span>Resultado</span><strong class="comparison-status ${estado.clase}">${estado.texto}</strong></div>
            <div><span>Tiendas comparadas</span><strong>${comparacion.tiendas_comparadas || 0}</strong></div>
            <div><span>Tiendas con cambios</span><strong>${comparacion.tiendas_con_diferencias || 0}</strong></div>
            <div><span>Diferencias</span><strong>${comparacion.total_diferencias || 0}</strong></div>
        </div>
    `;

    if (!diferencias.length) {
        body.innerHTML = `${resumen}<div class="comparison-detail-empty"><i class="fa-solid fa-circle-check"></i><p>No se detectaron diferencias de montos en esta comparacion.</p></div>`;
        return;
    }

    body.innerHTML = `${resumen}
        <div class="comparison-detail-table-wrap">
            <table class="comparison-detail-table">
                <thead><tr><th>Tienda</th><th>Concepto</th><th>Anterior</th><th>Nuevo</th><th>Diferencia</th></tr></thead>
                <tbody>${diferencias.map(item => `
                    <tr>
                        <td>${escapeHistoryHtml(item.tienda)}</td>
                        <td>${escapeHistoryHtml(etiquetaDiferencia(item))}</td>
                        <td>${item.valor_anterior === null ? '—' : formatHistoryMoney(item.valor_anterior)}</td>
                        <td>${item.valor_nuevo === null ? '—' : formatHistoryMoney(item.valor_nuevo)}</td>
                        <td class="${Number(item.diferencia) < 0 ? 'negative' : 'positive'}">${item.diferencia === null ? '—' : formatHistorySignedMoney(item.diferencia)}</td>
                    </tr>
                `).join('')}</tbody>
            </table>
        </div>`;
}

function cerrarDetalleComparacion() {
    document.getElementById('comparisonDetailModal')?.classList.remove('active');
}

function limpiarFiltros() {
    ['searchInput', 'filterRestaurante', 'filterEstado', 'filterDesde', 'filterHasta']
        .forEach(id => {
            const element = document.getElementById(id);
            if (element) element.value = '';
        });
    aplicarFiltrosComparaciones();
}

function exportarHistorial() {
    if (!comparacionesFiltradas.length) {
        Swal.fire({ icon: 'warning', title: 'Sin comparaciones', text: 'No hay datos para exportar.' });
        return;
    }

    const rows = comparacionesFiltradas.map(item => [
        item.id,
        item.fecha_comparacion,
        item.restaurante_nombre,
        item.fecha_operacion,
        getEstadoComparacion(item.estado).texto,
        item.tiendas_comparadas,
        item.tiendas_con_diferencias,
        item.total_diferencias,
        item.monto_diferencia_absoluta,
        item.usuario_nombre || ''
    ]);
    const headers = ['ID', 'Fecha comparacion', 'Restaurante', 'Fecha operativa', 'Resultado', 'Tiendas comparadas', 'Tiendas con cambios', 'Diferencias', 'Variacion absoluta', 'Usuario'];
    const csv = [headers, ...rows]
        .map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
        .join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `historial-comparaciones-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
}

function getEstadoComparacion(estado) {
    return {
        primera_carga: { texto: 'Primera carga', clase: 'first' },
        sin_cambios: { texto: 'Sin cambios', clase: 'equal' },
        con_cambios: { texto: 'Con diferencias', clase: 'changed' },
        referencia_incompatible: { texto: 'Referencia incompatible', clase: 'warning' }
    }[estado] || { texto: estado || 'Registrada', clase: 'neutral' };
}

function getRestaurantIcon(codigo) {
    return {
        'taco-bell': 'fa-bell',
        popeyes: 'fa-drumstick-bite',
        'burger-king': 'fa-burger'
    }[codigo] || 'fa-store';
}

function etiquetaDiferencia(item) {
    if (item.tipo === 'tienda_nueva') return 'Tienda agregada al archivo';
    if (item.tipo === 'tienda_eliminada') return 'Tienda retirada del archivo';
    return String(item.campo || 'Monto')
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
    return date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatearHoraHistorial(value) {
    return new Date(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function formatearFechaCompleta(value) {
    return new Date(value).toLocaleString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatearFechaCorta(value) {
    if (!value) return 'Sin fecha';
    return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
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
