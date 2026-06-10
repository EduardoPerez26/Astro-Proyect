// ============================================
// HISTORIAL DE VALIDACIONES
// ============================================

window.API_URL

let validaciones = [];
let validacionesFiltradas = [];
let paginaActual = 1;
const porPagina = 15;
const ITEMS_POR_PAGINA = 15;

// ============================================
// INICIALIZACION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    cargarValidaciones();
    configurarFiltros();
});

// ============================================
// CARGAR VALIDACIONES
// ============================================

async function cargarValidaciones() {
    const tbody = document.getElementById('validacionesBody');
    const emptyState = document.getElementById('emptyState');
    const loadingState = document.getElementById('loadingState');
    const table = document.getElementById('validacionesTable');

    loadingState.style.display = 'block';
    table.style.display = 'none';
    emptyState.style.display = 'none';

    const token = localStorage.getItem('token');
    const modoOffline = localStorage.getItem('modoOffline');

    if (modoOffline) {
        validaciones = generarDatosEjemplo();
        actualizarEstadisticas();
        mostrarValidaciones();
        loadingState.style.display = 'none';
        return;
    }

    try {
        const response = await fetch(`${window.API_URL}/validaciones`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Error al cargar validaciones');
        }

        const data = await response.json();
        validaciones = data.validaciones || [];
        validaciones = validaciones.map(v => ({
            ...v,
            archivo_id: Number(v.archivo_id || 0),
            usuario_id: Number(v.usuario_id || 0),
            total_errores: Number(v.total_errores || 0),
            duracion_segundos: Number(v.duracion_segundos || 0)
        }));
        actualizarEstadisticas();
        mostrarValidaciones();

    } catch (error) {
        console.error('Error cargando validaciones:', error);
        validaciones = generarDatosEjemplo();
        actualizarEstadisticas();
        mostrarValidaciones();
    } finally {
        loadingState.style.display = 'none';
    }
}

// ============================================
// ESTADISTICAS
// ============================================

function actualizarEstadisticas() {
    const exitosas = validaciones.filter(v => v.resultado === 'exitoso').length;
    const conErrores = validaciones.filter(v => v.resultado === 'con_errores').length;
    const fallidas = validaciones.filter(v => v.resultado === 'fallido').length;

    const tiempos = validaciones
        .filter(v => v.duracion_segundos !== null && v.duracion_segundos !== undefined)
        .map(v => Number(v.duracion_segundos));

    const tiempoPromedio =
        tiempos.length > 0
            ? (
                tiempos.reduce((a, b) => a + b, 0) /
                tiempos.length
            ).toFixed(1)
            : 0;

    document.getElementById('statExitosas').textContent = exitosas;
    document.getElementById('statConErrores').textContent = conErrores;
    document.getElementById('statFallidas').textContent = fallidas;
    document.getElementById('statTiempoPromedio').textContent = tiempoPromedio + 's';
}

// ============================================
// MOSTRAR VALIDACIONES
// ============================================

function mostrarValidaciones() {
    const tbody = document.getElementById('validacionesBody');
    const emptyState = document.getElementById('emptyState');
    const table = document.getElementById('validacionesTable');

    validacionesFiltradas = aplicarFiltros(validaciones);

    const total = validacionesFiltradas.length;
    const totalPaginas = Math.ceil(total / porPagina);
    const inicio = (paginaActual - 1) * porPagina;
    const fin = inicio + porPagina;
    const paginadas = validacionesFiltradas.slice(inicio, fin);

    if (paginadas.length === 0) {
        table.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    table.style.display = 'table';
    emptyState.style.display = 'none';

    tbody.innerHTML = paginadas.map(val => `
        <tr>
            <td>${val.id}</td>
            <td>
                <div class="file-cell">
                    <div class="file-icon">
                        <i class="fa-solid fa-file-excel"></i>
                    </div>
                    <span>${val.archivo_nombre || 'Archivo #' + val.archivo_id}</span>
                </div>
            </td>
            <td><span class="status-badge procesando">${formatearTipo(val.tipo_validacion)}</span></td>
            <td><span class="status-badge ${val.resultado === 'exitoso' ? 'validado' : val.resultado === 'con_errores' ? 'pendiente' : 'error'}">${formatearResultado(val.resultado)}</span></td>
            <td>
                <span class="status-badge ${val.total_errores > 0 ? 'error' : 'validado'}">
                    ${val.total_errores || 0} errores
                </span>
            </td>
            <td>
    ${val.duracion_segundos !== null &&
            val.duracion_segundos !== undefined
            ? Number(val.duracion_segundos).toFixed(2) + 's'
            : '-'
        }
</td>
            <td>
                <div class="user-cell">
                    <div class="user-avatar">${(val.usuario_nombre || 'U').charAt(0).toUpperCase()}</div>
                    <span>${val.usuario_nombre || 'Usuario #' + val.usuario_id}</span>
                </div>
            </td>
            <td>${formatearFecha(val.fecha_validacion)}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view" onclick="verErrores(${val.id})" 
                            ${val.total_errores === 0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} 
                            title="${val.total_errores > 0 ? 'Ver errores' : 'Sin errores'}">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    actualizarPaginacion(totalPaginas);
}

// ============================================
// FILTROS
// ============================================

function configurarFiltros() {
    const searchInput = document.getElementById('searchInput');
    const filterResultado = document.getElementById('filterResultado');
    const filterTipo = document.getElementById('filterTipo');
    const filterFecha = document.getElementById('filterFecha');

    [searchInput, filterResultado, filterTipo, filterFecha].forEach(el => {
        if (el) {
            el.addEventListener('change', () => {
                paginaActual = 1;
                mostrarValidaciones();
            });
            if (el.type === 'text') {
                el.addEventListener('input', () => {
                    paginaActual = 1;
                    mostrarValidaciones();
                });
            }
        }
    });
}

function aplicarFiltros(vals) {
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const resultado = document.getElementById('filterResultado')?.value || '';
    const tipo = document.getElementById('filterTipo')?.value || '';
    const fecha = document.getElementById('filterFecha')?.value || '';

    return vals.filter(val => {
        if (search) {
            const archivo = (val.archivo_nombre || '').toLowerCase();
            const usuario = (val.usuario_nombre || '').toLowerCase();
            if (!archivo.includes(search) && !usuario.includes(search)) {
                return false;
            }
        }

        if (resultado && val.resultado !== resultado) {
            return false;
        }

        if (tipo && val.tipo_validacion !== tipo) {
            return false;
        }

        if (fecha) {
            const fechaVal = new Date(val.fecha_validacion).toISOString().split('T')[0];
            if (fechaVal !== fecha) return false;
        }

        return true;
    });
}

function limpiarFiltros() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterResultado').value = '';
    document.getElementById('filterTipo').value = '';
    document.getElementById('filterFecha').value = '';
    paginaActual = 1;
    mostrarValidaciones();
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

    const total = validacionesFiltradas.length;
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
    mostrarValidaciones();
}

// ============================================
// VER ERRORES
// ============================================

function verErrores(id) {
    const val = validaciones.find(v => v.id === id);
    if (!val || !val.detalle_errores) return;

    const modalBody = document.getElementById('modalBody');
    let errores = [];

    try {
        errores = typeof val.detalle_errores === 'string'
            ? JSON.parse(val.detalle_errores)
            : val.detalle_errores;
    } catch {
        errores = [{ mensaje: val.detalle_errores }];
    }

    if (!Array.isArray(errores)) {
        errores = [errores];
    }

    modalBody.innerHTML = `
        <div style="margin-bottom: 16px;">
            <strong>Archivo:</strong> ${val.archivo_nombre || 'Archivo #' + val.archivo_id}<br>
            <strong>Tipo:</strong> ${formatearTipo(val.tipo_validacion)}<br>
            <strong>Total errores:</strong> ${val.total_errores}
        </div>
        <ul class="error-list">
            ${errores.map(err => `
                <li class="error-item">
                    <i class="fa-solid fa-times-circle"></i>
                    <div class="error-text">
                        ${err.mensaje || err.message || err}
                        ${err.ubicacion || err.celda ? `<div class="error-location">Ubicacion: ${err.ubicacion || err.celda}</div>` : ''}
                    </div>
                </li>
            `).join('')}
        </ul>
    `;

    document.getElementById('modalErrores').classList.add('active');
}

function cerrarModal() {
    document.getElementById('modalErrores').classList.remove('active');
}

// ============================================
// EXPORTAR
// ============================================

function exportarHistorial() {
    const filtradas = aplicarFiltros(validaciones);

    if (filtradas.length === 0) {
        Swal.fire({
            icon: 'warning',
            title: 'Sin datos',
            text: 'No hay validaciones para exportar'
        });
        return;
    }

    // Crear CSV
    const headers = ['ID', 'Archivo', 'Tipo', 'Resultado', 'Errores', 'Duracion', 'Usuario', 'Fecha'];
    const rows = filtradas.map(v => [
        v.id,
        v.archivo_nombre || 'Archivo #' + v.archivo_id,
        v.tipo_validacion,
        v.resultado,
        v.total_errores,
        v.duracion_segundos || '',
        v.usuario_nombre || 'Usuario #' + v.usuario_id,
        new Date(v.fecha_validacion).toLocaleString()
    ]);

    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial-validaciones-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

    Swal.fire({
        icon: 'success',
        title: 'Exportado',
        text: 'El historial se ha exportado correctamente',
        timer: 2000,
        showConfirmButton: false
    });
}

// ============================================
// UTILIDADES
// ============================================

function formatearTipo(tipo) {
    const tipos = {
        'formato': 'Formato',
        'datos': 'Datos',
        'formulas': 'Formulas',
        'completa': 'Completa'
    };
    return tipos[tipo] || tipo;
}

function formatearResultado(resultado) {
    const resultados = {
        'exitoso': 'Exitoso',
        'con_errores': 'Con errores',
        'fallido': 'Fallido'
    };
    return resultados[resultado] || resultado;
}

function formatearFecha(fecha) {
    if (!fecha) return '-';
    return new Date(fecha).toLocaleString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function generarDatosEjemplo() {
    return [
        {
            id: 1,
            archivo_id: 1,
            archivo_nombre: 'Daily Sales Taco Bell 05-26 2026.xlsx',
            usuario_id: 1,
            usuario_nombre: 'Administrador',
            tipo_validacion: 'completa',
            resultado: 'exitoso',
            total_errores: 0,
            detalle_errores: null,
            duracion_segundos: 2.45,
            fecha_validacion: '2026-05-26T10:35:00'
        },
        {
            id: 2,
            archivo_id: 2,
            archivo_nombre: 'Conciliation BK May 2026.xlsx',
            usuario_id: 2,
            usuario_nombre: 'Usuario1',
            tipo_validacion: 'formato',
            resultado: 'con_errores',
            total_errores: 3,
            detalle_errores: [
                { mensaje: 'Columna "NET SALES" no encontrada', ubicacion: 'Hoja: Sales' },
                { mensaje: 'Formato de fecha invalido', ubicacion: 'Celda B5' },
                { mensaje: 'Valor negativo no permitido', ubicacion: 'Celda G12' }
            ],
            duracion_segundos: 1.82,
            fecha_validacion: '2026-05-25T14:20:00'
        },
        {
            id: 3,
            archivo_id: 3,
            archivo_nombre: 'Popeyes Weekly Report.xlsx',
            usuario_id: 3,
            usuario_nombre: 'Supervisor',
            tipo_validacion: 'datos',
            resultado: 'fallido',
            total_errores: 15,
            detalle_errores: [
                { mensaje: 'Archivo corrupto o formato no soportado' }
            ],
            duracion_segundos: 0.35,
            fecha_validacion: '2026-05-24T09:05:00'
        },
        {
            id: 4,
            archivo_id: 4,
            archivo_nombre: 'KFC Monthly Sales.xlsx',
            usuario_id: 1,
            usuario_nombre: 'Administrador',
            tipo_validacion: 'formulas',
            resultado: 'exitoso',
            total_errores: 0,
            detalle_errores: null,
            duracion_segundos: 3.21,
            fecha_validacion: '2026-05-20T16:50:00'
        },
        {
            id: 5,
            archivo_id: 1,
            archivo_nombre: 'Daily Sales Taco Bell 05-26 2026.xlsx',
            usuario_id: 1,
            usuario_nombre: 'Administrador',
            tipo_validacion: 'datos',
            resultado: 'con_errores',
            total_errores: 2,
            detalle_errores: [
                { mensaje: 'Tienda 28841: Total no coincide con suma de conceptos', ubicacion: 'Fila 5' },
                { mensaje: 'Tienda 29423: Valor de impuesto incorrecto', ubicacion: 'Fila 12' }
            ],
            duracion_segundos: 4.15,
            fecha_validacion: '2026-05-26T10:32:00'
        }
    ];
}

// Cerrar modal con Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cerrarModal();
    }
});
