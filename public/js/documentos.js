// ============================================
// GESTION DE DOCUMENTOS
// ============================================

const API_URL = localStorage.getItem('apiUrl') || 'http://localhost:3001/api';

let documentos = [];
let paginaActual = 1;
const porPagina = 10;
let documentoSeleccionado = null;

// ============================================
// INICIALIZACION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
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
        // Datos de ejemplo en modo offline
        documentos = generarDatosEjemplo();
        mostrarDocumentos();
        loadingState.style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/archivos`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Error al cargar documentos');
        }
        
        const data = await response.json();
        documentos = data.archivos || [];
        mostrarDocumentos();
        
    } catch (error) {
        console.error('Error cargando documentos:', error);
        // Mostrar datos de ejemplo si falla
        documentos = generarDatosEjemplo();
        mostrarDocumentos();
    } finally {
        loadingState.style.display = 'none';
    }
}

// ============================================
// MOSTRAR DOCUMENTOS EN TABLA
// ============================================

function mostrarDocumentos() {
    const tbody = document.getElementById('documentosBody');
    const emptyState = document.getElementById('emptyState');
    const table = document.getElementById('documentosTable');
    
    // Aplicar filtros
    let filtrados = aplicarFiltros(documentos);
    
    // Paginacion
    const total = filtrados.length;
    const totalPaginas = Math.ceil(total / porPagina);
    const inicio = (paginaActual - 1) * porPagina;
    const fin = inicio + porPagina;
    const paginados = filtrados.slice(inicio, fin);
    
    if (paginados.length === 0) {
        table.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    table.style.display = 'table';
    emptyState.style.display = 'none';
    
    tbody.innerHTML = paginados.map(doc => `
        <tr>
            <td>${doc.id}</td>
            <td>
                <div class="file-info">
                    <div class="file-icon">
                        <i class="fa-solid fa-file-excel"></i>
                    </div>
                    <div>
                        <div class="file-name">${doc.nombre_original}</div>
                        <div class="file-sheets">${doc.numero_hojas || 1} hoja(s)</div>
                    </div>
                </div>
            </td>
            <td>${doc.restaurante_nombre || doc.restaurante || '-'}</td>
            <td>${doc.nombres_hojas || '-'}</td>
            <td>${formatearTamano(doc.tamano_bytes)}</td>
            <td><span class="badge badge-${doc.estado}">${formatearEstado(doc.estado)}</span></td>
            <td>${doc.usuario_nombre || doc.subido_por || '-'}</td>
            <td>${formatearFecha(doc.fecha_subida)}</td>
            <td>
                <div class="actions-cell">
                    <button class="btn-icon view" onclick="verDetalles(${doc.id})" title="Ver detalles">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                    <button class="btn-icon download" onclick="descargarArchivo(${doc.id})" title="Descargar">
                        <i class="fa-solid fa-download"></i>
                    </button>
                    <button class="btn-icon delete" onclick="eliminarArchivo(${doc.id})" title="Eliminar">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Actualizar paginacion
    actualizarPaginacion(totalPaginas);
}

// ============================================
// FILTROS
// ============================================

function configurarFiltros() {
    const searchInput = document.getElementById('searchInput');
    const filterRestaurante = document.getElementById('filterRestaurante');
    const filterEstado = document.getElementById('filterEstado');
    const filterFechaDesde = document.getElementById('filterFechaDesde');
    const filterFechaHasta = document.getElementById('filterFechaHasta');
    
    [searchInput, filterRestaurante, filterEstado, filterFechaDesde, filterFechaHasta].forEach(el => {
        if (el) {
            el.addEventListener('change', () => {
                paginaActual = 1;
                mostrarDocumentos();
            });
            if (el.type === 'text') {
                el.addEventListener('input', () => {
                    paginaActual = 1;
                    mostrarDocumentos();
                });
            }
        }
    });
}

function aplicarFiltros(docs) {
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const restaurante = document.getElementById('filterRestaurante')?.value || '';
    const estado = document.getElementById('filterEstado')?.value || '';
    const fechaDesde = document.getElementById('filterFechaDesde')?.value || '';
    const fechaHasta = document.getElementById('filterFechaHasta')?.value || '';
    
    return docs.filter(doc => {
        // Filtro de busqueda
        if (search && !doc.nombre_original.toLowerCase().includes(search)) {
            return false;
        }
        
        // Filtro de restaurante
        if (restaurante && doc.restaurante_id !== restaurante && doc.restaurante?.toLowerCase() !== restaurante) {
            return false;
        }
        
        // Filtro de estado
        if (estado && doc.estado !== estado) {
            return false;
        }
        
        // Filtro de fecha desde
        if (fechaDesde) {
            const fechaDoc = new Date(doc.fecha_subida);
            if (fechaDoc < new Date(fechaDesde)) return false;
        }
        
        // Filtro de fecha hasta
        if (fechaHasta) {
            const fechaDoc = new Date(doc.fecha_subida);
            if (fechaDoc > new Date(fechaHasta + 'T23:59:59')) return false;
        }
        
        return true;
    });
}

function limpiarFiltros() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterRestaurante').value = '';
    document.getElementById('filterEstado').value = '';
    document.getElementById('filterFechaDesde').value = '';
    document.getElementById('filterFechaHasta').value = '';
    paginaActual = 1;
    mostrarDocumentos();
}

// ============================================
// PAGINACION
// ============================================

function actualizarPaginacion(totalPaginas) {
    const pageInfo = document.getElementById('pageInfo');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    
    pageInfo.textContent = `Pagina ${paginaActual} de ${totalPaginas || 1}`;
    btnPrev.disabled = paginaActual <= 1;
    btnNext.disabled = paginaActual >= totalPaginas;
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
    
    documentoSeleccionado = doc;
    
    const modalBody = document.getElementById('modalBody');
    const modalTitulo = document.getElementById('modalTitulo');
    
    modalTitulo.textContent = doc.nombre_original;
    
    modalBody.innerHTML = `
        <div class="detail-row">
            <span class="detail-label">ID:</span>
            <span class="detail-value">${doc.id}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Archivo:</span>
            <span class="detail-value">${doc.nombre_original}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Restaurante:</span>
            <span class="detail-value">${doc.restaurante_nombre || doc.restaurante || '-'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Tamano:</span>
            <span class="detail-value">${formatearTamano(doc.tamano_bytes)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Hojas:</span>
            <span class="detail-value">${doc.nombres_hojas || '-'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Estado:</span>
            <span class="detail-value"><span class="badge badge-${doc.estado}">${formatearEstado(doc.estado)}</span></span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Subido por:</span>
            <span class="detail-value">${doc.usuario_nombre || doc.subido_por || '-'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Fecha subida:</span>
            <span class="detail-value">${formatearFecha(doc.fecha_subida, true)}</span>
        </div>
        ${doc.notas ? `
        <div class="detail-row">
            <span class="detail-label">Notas:</span>
            <span class="detail-value">${doc.notas}</span>
        </div>
        ` : ''}
    `;
    
    document.getElementById('modalDetalles').classList.add('active');
}

function cerrarModal() {
    document.getElementById('modalDetalles').classList.remove('active');
    documentoSeleccionado = null;
}

async function descargarArchivo(id) {
    const token = localStorage.getItem('token');
    const modoOffline = localStorage.getItem('modoOffline');
    
    if (modoOffline) {
        Swal.fire({
            icon: 'info',
            title: 'Modo offline',
            text: 'La descarga no esta disponible en modo offline'
        });
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/archivos/${id}/descargar`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Error al descargar');
        
        const blob = await response.blob();
        const doc = documentos.find(d => d.id === id);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc?.nombre_original || 'archivo.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        
    } catch (error) {
        console.error('Error descargando:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo descargar el archivo'
        });
    }
}

async function eliminarArchivo(id) {
    const result = await Swal.fire({
        title: 'Eliminar documento',
        text: 'Esta accion no se puede deshacer. El archivo y todos sus datos seran eliminados.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'Si, eliminar',
        cancelButtonText: 'Cancelar'
    });
    
    if (!result.isConfirmed) return;
    
    const token = localStorage.getItem('token');
    const modoOffline = localStorage.getItem('modoOffline');
    
    if (modoOffline) {
        documentos = documentos.filter(d => d.id !== id);
        mostrarDocumentos();
        Swal.fire('Eliminado', 'El documento ha sido eliminado (modo offline)', 'success');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/archivos/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Error al eliminar');
        
        documentos = documentos.filter(d => d.id !== id);
        mostrarDocumentos();
        
        Swal.fire({
            icon: 'success',
            title: 'Eliminado',
            text: 'El documento ha sido eliminado',
            timer: 2000,
            showConfirmButton: false
        });
        
    } catch (error) {
        console.error('Error eliminando:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo eliminar el archivo'
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

function formatearEstado(estado) {
    const estados = {
        'pendiente': 'Pendiente',
        'validado': 'Validado',
        'con_errores': 'Con errores',
        'procesado': 'Procesado'
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
    return d.toLocaleDateString('es-ES', opciones);
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
            subido_por: 'Administrador',
            fecha_subida: '2026-05-26T10:30:00'
        },
        {
            id: 2,
            nombre_original: 'Conciliation BK May 2026.xlsx',
            restaurante: 'Burger King',
            restaurante_nombre: 'Burger King',
            numero_hojas: 2,
            nombres_hojas: 'Datos, Resumen',
            tamano_bytes: 189440,
            estado: 'pendiente',
            subido_por: 'Usuario1',
            fecha_subida: '2026-05-25T14:15:00'
        },
        {
            id: 3,
            nombre_original: 'Popeyes Weekly Report.xlsx',
            restaurante: 'Popeyes',
            restaurante_nombre: 'Popeyes',
            numero_hojas: 4,
            nombres_hojas: 'Week1, Week2, Week3, Week4',
            tamano_bytes: 512000,
            estado: 'con_errores',
            subido_por: 'Supervisor',
            fecha_subida: '2026-05-24T09:00:00',
            notas: 'Revisar errores en semana 3'
        },
        {
            id: 4,
            nombre_original: 'KFC Monthly Sales.xlsx',
            restaurante: 'KFC',
            restaurante_nombre: 'KFC',
            numero_hojas: 1,
            nombres_hojas: 'Sales',
            tamano_bytes: 98304,
            estado: 'procesado',
            subido_por: 'Administrador',
            fecha_subida: '2026-05-20T16:45:00'
        }
    ];
}

// Cerrar modal con Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cerrarModal();
    }
});
