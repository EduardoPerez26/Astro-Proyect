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
let codigoRestauranteCargado = '';
const revisionActualPorTipo = {};
const comparacionActualPorTipo = {};
let comparacionConciliacionActual = {
    clave: '',
    resultado: null,
    aprobada: true
};

function etiquetaTipoRevision(tipo) {
    return {
        sales: 'Archivo principal',
        salesDetail: 'Sales Detail',
        ebt: 'EBT'
    }[tipo] || tipo;
}

function inputIdPorTipoRevision(tipo) {
    return {
        sales: 'salesFile',
        salesDetail: 'salesDetailFile',
        ebt: 'ebtFile'
    }[tipo] || 'salesFile';
}

function analizarNombreRevision(nombre = '') {
    const match = String(nombre).match(
        /^XB-REV-([a-zA-Z]+)-V(\d+)-([a-f0-9]{16})--(.+)$/i
    );

    if (!match) return null;

    return {
        tipo: match[1],
        version: Number(match[2]),
        hash: match[3].toLowerCase(),
        nombreOriginal: match[4]
    };
}

function analizarRevisionArchivo(archivo) {
    try {
        const notas = typeof archivo?.notas === 'string'
            ? JSON.parse(archivo.notas)
            : archivo?.notas;

        if (notas?.tipo === 'revision_fuente') {
            return {
                tipo: notas.fuente,
                version: Number(notas.revision),
                hash: String(notas.hash || '').toLowerCase(),
                nombreOriginal: notas.nombreOriginal || archivo.nombre_original
            };
        }
    } catch {
        // Compatibilidad con las revisiones antiguas guardadas en el nombre.
    }

    return analizarNombreRevision(archivo?.nombre_original);
}

async function hashTextoRevision(texto) {
    const bytes = new TextEncoder().encode(texto);

    if (window.crypto?.subtle) {
        const digest = await window.crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)]
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    let hashA = 2166136261;
    let hashB = 2246822519;
    bytes.forEach(byte => {
        hashA = Math.imul(hashA ^ byte, 16777619);
        hashB = Math.imul(hashB ^ byte, 3266489917);
    });

    return [hashA, hashB, hashA ^ hashB, hashA + hashB]
        .map(value => (value >>> 0).toString(16).padStart(8, '0'))
        .join('');
}

async function calcularHuellaRevision(file) {
    const buffer = await file.arrayBuffer();

    try {
        const book = XLSX.read(buffer, {
            type: 'array',
            raw: false,
            cellDates: false
        });
        const contenido = book.SheetNames.map(nombreHoja => {
            const filas = XLSX.utils.sheet_to_json(
                book.Sheets[nombreHoja],
                { header: 1, raw: false, defval: '' }
            );
            return [nombreHoja, filas];
        });

        return hashTextoRevision(JSON.stringify(contenido));
    } catch {
        const bytes = new Uint8Array(buffer);
        let binario = '';
        const bloque = 8192;

        for (let index = 0; index < bytes.length; index += bloque) {
            binario += String.fromCharCode(...bytes.subarray(index, index + bloque));
        }

        return hashTextoRevision(binario);
    }
}

async function cargarRevisionesServidor(tipo, restauranteId, token) {
    const response = await fetch(`${window.API_URL}/archivos`, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
        throw new Error('No se pudo consultar el historial de revisiones');
    }

    const data = await response.json();
    const archivos = Array.isArray(data) ? data : (data.archivos || []);

    return archivos
        .map(archivo => ({
            archivo,
            revision: analizarRevisionArchivo(archivo)
        }))
        .filter(item =>
            item.revision?.tipo === tipo &&
            String(item.archivo.restaurante_id) === String(restauranteId)
        )
        .sort((a, b) =>
            b.revision.version - a.revision.version ||
            Number(b.archivo.id) - Number(a.archivo.id)
        );
}

async function guardarRevisionServidor(file, tipo, version, hash, codigo, token) {
    const formData = new FormData();

    formData.append('archivo', file, file.name);
    formData.append('restaurante_id', codigo);
    formData.append('procesar_datos', 'false');
    formData.append('es_revision_fuente', 'true');
    formData.append('tipo_fuente', tipo);
    formData.append('revision', String(version));
    formData.append('hash_contenido', hash);

    const response = await fetch(`${window.API_URL}/archivos/subir`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || 'No se pudo guardar la revisión');
    }

    return data.archivo?.id;
}

function cargarRevisionesLocales(codigo, tipo) {
    try {
        const todas = JSON.parse(localStorage.getItem('sourceFileRevisions') || '{}');
        return todas[`${codigo}:${tipo}`] || [];
    } catch {
        return [];
    }
}

function guardarRevisionLocal(codigo, tipo, revision) {
    const todas = JSON.parse(localStorage.getItem('sourceFileRevisions') || '{}');
    const key = `${codigo}:${tipo}`;
    todas[key] = [...(todas[key] || []), revision].slice(-20);
    localStorage.setItem('sourceFileRevisions', JSON.stringify(todas));
}

function textoRevisionActual(tipo) {
    const version = revisionActualPorTipo[tipo];
    return version ? ` · Revisión V${String(version).padStart(3, '0')}` : '';
}

async function validarRevisionAntesDeProcesar(file, tipo) {
    const inputId = inputIdPorTipoRevision(tipo);
    const select = document.getElementById('selectRestaurante');
    const restauranteId = select?.value;
    const codigo = select?.selectedOptions?.[0]?.dataset?.codigo;

    if (!restauranteId || !codigo) {
        await Swal.fire({
            icon: 'warning',
            title: 'Selecciona el restaurante',
            text: 'Debes elegir el restaurante antes de cargar y comparar el archivo.'
        });
        return false;
    }

    setUploadCardStatus(inputId, 'checking', 'Comparando con la última revisión...');

    try {
        const hash = await calcularHuellaRevision(file);
        const token = localStorage.getItem('token');
        const offline = localStorage.getItem('modoOffline') === 'true';
        let revisiones = [];

        if (offline || !token) {
            revisiones = cargarRevisionesLocales(codigo, tipo)
                .map(revision => ({ revision }))
                .sort((a, b) => b.revision.version - a.revision.version);
        } else {
            revisiones = await cargarRevisionesServidor(tipo, restauranteId, token);
        }

        const ultima = revisiones[0]?.revision || null;
        const sinCambios =
            String(ultima?.hash || '').slice(0, 16) === hash.slice(0, 16);

        if (sinCambios) {
            revisionActualPorTipo[tipo] = ultima.version;
            const result = await Swal.fire({
                icon: 'info',
                title: 'El archivo no cambió',
                html: `<strong>${etiquetaTipoRevision(tipo)}</strong><br>Coincide con la revisión V${String(ultima.version).padStart(3, '0')}.`,
                showCancelButton: true,
                confirmButtonText: 'Procesar de todos modos',
                cancelButtonText: 'Cancelar'
            });

            if (!result.isConfirmed) setUploadCardStatus(inputId);
            return result.isConfirmed;
        }

        const nuevaVersion = (ultima?.version || 0) + 1;
        const result = await Swal.fire({
            icon: ultima ? 'warning' : 'info',
            title: ultima ? 'Cambio detectado' : 'Primera revisión',
            html: ultima
                ? `El contenido de <strong>${etiquetaTipoRevision(tipo)}</strong> cambió respecto a V${String(ultima.version).padStart(3, '0')}.<br>Se guardará como <strong>V${String(nuevaVersion).padStart(3, '0')}</strong> antes de procesarlo.`
                : `No existe una revisión anterior de <strong>${etiquetaTipoRevision(tipo)}</strong>.<br>Se guardará como <strong>V001</strong>.`,
            showCancelButton: true,
            confirmButtonText: 'Guardar y procesar',
            cancelButtonText: 'Cancelar'
        });

        if (!result.isConfirmed) {
            setUploadCardStatus(inputId);
            return false;
        }

        setUploadCardStatus(inputId, 'checking', `Guardando revisión V${String(nuevaVersion).padStart(3, '0')}...`);

        if (offline || !token) {
            guardarRevisionLocal(codigo, tipo, {
                version: nuevaVersion,
                hash: hash.slice(0, 16),
                nombreOriginal: file.name,
                fecha: new Date().toISOString()
            });
        } else {
            await guardarRevisionServidor(
                file,
                tipo,
                nuevaVersion,
                hash,
                codigo,
                token
            );
        }

        revisionActualPorTipo[tipo] = nuevaVersion;
        return true;
    } catch (error) {
        console.error('Error verificando revisión:', error);
        setUploadCardStatus(inputId, 'error', 'No se pudo verificar la revisión');
        await Swal.fire({
            icon: 'error',
            title: 'No se procesó el archivo',
            text: `${error.message}. La comparación debe completarse antes de generar el template.`
        });
        return false;
    }
}

function analizarReferenciaComparacion(archivo) {
    try {
        const notas = typeof archivo?.notas === 'string'
            ? JSON.parse(archivo.notas)
            : archivo?.notas;

        if (notas?.tipo === 'referencia_comparacion') {
            return {
                tipo: notas.fuente,
                hash: String(notas.hash || '').toLowerCase(),
                nombreOriginal: notas.nombreOriginal || archivo.nombre_original,
                resumen: notas.resumen || null,
                fecha: archivo.fecha_actualizacion || archivo.fecha_subida || null
            };
        }

        // La ultima revision del sistema anterior puede servir como referencia inicial.
        if (notas?.tipo === 'revision_fuente') {
            return {
                tipo: notas.fuente,
                hash: String(notas.hash || '').toLowerCase(),
                nombreOriginal: notas.nombreOriginal || archivo.nombre_original,
                resumen: null,
                fecha: archivo.fecha_actualizacion || archivo.fecha_subida || null
            };
        }
    } catch {
        // Continua con el formato historico basado en el nombre.
    }

    const anterior = analizarNombreRevision(archivo?.nombre_original);
    return anterior
        ? {
            tipo: anterior.tipo,
            hash: anterior.hash,
            nombreOriginal: anterior.nombreOriginal,
            resumen: null,
            fecha: archivo.fecha_actualizacion || archivo.fecha_subida || null
        }
        : null;
}

function resumirWorkbookParaComparacion(book) {
    const hojas = book.SheetNames.map(nombre => {
        const filas = XLSX.utils.sheet_to_json(
            book.Sheets[nombre],
            { header: 1, raw: false, defval: '' }
        );
        const columnas = filas.reduce(
            (maximo, fila) => Math.max(maximo, fila.length),
            0
        );
        const celdasConDatos = filas.reduce(
            (total, fila) => total + fila.filter(valor => valor !== '').length,
            0
        );

        return {
            nombre,
            filas: filas.length,
            columnas,
            celdasConDatos
        };
    });

    return {
        totalHojas: hojas.length,
        totalFilas: hojas.reduce((total, hoja) => total + hoja.filas, 0),
        totalCeldas: hojas.reduce((total, hoja) => total + hoja.celdasConDatos, 0),
        hojas
    };
}

async function analizarContenidoParaComparacion(file) {
    const buffer = await file.arrayBuffer();

    try {
        const book = XLSX.read(buffer, {
            type: 'array',
            raw: false,
            cellDates: false
        });
        const contenido = book.SheetNames.map(nombreHoja => {
            const filas = XLSX.utils.sheet_to_json(
                book.Sheets[nombreHoja],
                { header: 1, raw: false, defval: '' }
            );
            return [nombreHoja, filas];
        });

        return {
            hash: await hashTextoRevision(JSON.stringify(contenido)),
            resumen: resumirWorkbookParaComparacion(book)
        };
    } catch {
        const bytes = new Uint8Array(buffer);
        let binario = '';

        for (let index = 0; index < bytes.length; index += 8192) {
            binario += String.fromCharCode(...bytes.subarray(index, index + 8192));
        }

        return {
            hash: await hashTextoRevision(binario),
            resumen: { totalHojas: 0, totalFilas: 0, totalCeldas: 0, hojas: [] }
        };
    }
}

async function cargarReferenciaComparacionServidor(tipo, restauranteId, token) {
    const response = await fetch(`${window.API_URL}/archivos`, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
        throw new Error('No se pudo consultar el archivo anterior');
    }

    const data = await response.json();
    const archivos = Array.isArray(data) ? data : (data.archivos || []);

    return archivos
        .filter(archivo => String(archivo.restaurante_id) === String(restauranteId))
        .map(archivo => ({
            archivo,
            referencia: analizarReferenciaComparacion(archivo)
        }))
        .filter(item => item.referencia?.tipo === tipo)
        .sort((a, b) => Number(b.archivo.id) - Number(a.archivo.id))[0]
        ?.referencia || null;
}

async function guardarReferenciaComparacionServidor(file, tipo, analisis, codigo, token) {
    const formData = new FormData();
    formData.append('archivo', file, file.name);
    formData.append('restaurante_id', codigo);
    formData.append('procesar_datos', 'false');
    formData.append('es_referencia_comparacion', 'true');
    formData.append('tipo_fuente', tipo);
    formData.append('hash_contenido', analisis.hash);
    formData.append('resumen_contenido', JSON.stringify(analisis.resumen));

    const response = await fetch(`${window.API_URL}/archivos/subir`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || 'No se pudo actualizar el archivo anterior');
    }

    return data.archivo?.id;
}

function cargarReferenciaComparacionLocal(codigo, tipo) {
    try {
        const referencias = JSON.parse(
            localStorage.getItem('sourceFileComparisons') || '{}'
        );
        const actual = referencias[`${codigo}:${tipo}`];
        if (actual) return actual;

        const anteriores = JSON.parse(
            localStorage.getItem('sourceFileRevisions') || '{}'
        );
        const historial = anteriores[`${codigo}:${tipo}`] || [];
        return historial[historial.length - 1] || null;
    } catch {
        return null;
    }
}

function guardarReferenciaComparacionLocal(codigo, tipo, referencia) {
    const todas = JSON.parse(
        localStorage.getItem('sourceFileComparisons') || '{}'
    );
    todas[`${codigo}:${tipo}`] = referencia;
    localStorage.setItem('sourceFileComparisons', JSON.stringify(todas));
}

async function obtenerReferenciaComparacion(codigo, tipo, restauranteId, token, offline) {
    const referenciaLocal = cargarReferenciaComparacionLocal(codigo, tipo);

    if (offline || !token) return referenciaLocal;

    try {
        const referenciaServidor = await cargarReferenciaComparacionServidor(
            tipo,
            restauranteId,
            token
        );

        if (referenciaServidor) {
            guardarReferenciaComparacionLocal(codigo, tipo, referenciaServidor);
            return referenciaServidor;
        }

        return referenciaLocal;
    } catch (error) {
        if (referenciaLocal) {
            console.warn('Usando referencia local porque el servidor no respondió:', error);
            return referenciaLocal;
        }

        throw error;
    }
}

async function guardarReferenciaConfirmada(
    file,
    tipo,
    analisis,
    codigo,
    token,
    offline
) {
    guardarReferenciaComparacionLocal(codigo, tipo, {
        hash: analisis.hash,
        nombreOriginal: file.name,
        resumen: analisis.resumen,
        fecha: new Date().toISOString()
    });

    if (offline || !token) return true;

    try {
        await guardarReferenciaComparacionServidor(
            file,
            tipo,
            analisis,
            codigo,
            token
        );
        return true;
    } catch (error) {
        console.error('No se pudo sincronizar la referencia con el servidor:', error);
        return false;
    }
}

function textoComparacionActual(tipo) {
    return {
        igual: ' · Sin cambios',
        actualizado: ' · Archivo actualizado',
        primero: ' · Primera carga'
    }[comparacionActualPorTipo[tipo]?.estado] || '';
}

function detalleResumenComparacion(resumen) {
    if (!resumen?.totalHojas) return 'Contenido verificado';
    const hojas = resumen.totalHojas === 1 ? '1 hoja' : `${resumen.totalHojas} hojas`;
    return `${hojas} · ${resumen.totalFilas.toLocaleString('es-MX')} filas`;
}

function setComparisonCardStatus(inputId, estado = '', titulo = '', detalle = '') {
    const input = document.getElementById(inputId);
    const card = input?.closest('.upload-card');
    if (!card) return;

    let panel = card.querySelector('.comparison-status');

    if (!estado) {
        panel?.remove();
        delete card.dataset.comparison;
        return;
    }

    if (!panel) {
        panel = document.createElement('div');
        panel.className = 'comparison-status';
        panel.setAttribute('aria-live', 'polite');
        card.appendChild(panel);
    }

    const iconos = {
        comprobando: 'fa-spinner fa-spin',
        igual: 'fa-circle-check',
        actualizado: 'fa-arrows-rotate',
        primero: 'fa-file-circle-plus',
        aviso: 'fa-triangle-exclamation'
    };

    card.dataset.comparison = estado;
    panel.replaceChildren();

    const icono = document.createElement('i');
    icono.className = `fa-solid ${iconos[estado] || 'fa-circle-info'}`;
    const texto = document.createElement('span');
    const encabezado = document.createElement('strong');
    encabezado.textContent = titulo;
    const descripcion = document.createElement('small');
    descripcion.textContent = detalle;

    texto.append(encabezado, descripcion);
    panel.append(icono, texto);
}

async function validarArchivoAntesDeProcesar(file, tipo) {
    const inputId = inputIdPorTipoRevision(tipo);
    const select = document.getElementById('selectRestaurante');
    const restauranteId = select?.value;
    const codigo = select?.selectedOptions?.[0]?.dataset?.codigo;

    if (!restauranteId || !codigo) {
        await Swal.fire({
            icon: 'warning',
            title: 'Selecciona el restaurante',
            text: 'Debes elegir el restaurante antes de cargar el archivo.'
        });
        return false;
    }

    setUploadCardStatus(inputId, 'checking', 'Leyendo archivo...');
    setComparisonCardStatus(
        inputId,
        'comprobando',
        'Comprobando cambios',
        'Comparando con el último archivo cargado'
    );

    try {
        const analisis = await analizarContenidoParaComparacion(file);
        const token = localStorage.getItem('token');
        const offline = localStorage.getItem('modoOffline') === 'true';
        const referencia = offline || !token
            ? cargarReferenciaComparacionLocal(codigo, tipo)
            : await cargarReferenciaComparacionServidor(tipo, restauranteId, token);
        const sinCambios = Boolean(referencia?.hash) &&
            String(referencia.hash).slice(0, 16) === analisis.hash.slice(0, 16);

        if (sinCambios) {
            comparacionActualPorTipo[tipo] = {
                estado: 'igual',
                resumen: analisis.resumen
            };
            setComparisonCardStatus(
                inputId,
                'igual',
                'Sin cambios',
                `Coincide con el archivo anterior · ${detalleResumenComparacion(analisis.resumen)}`
            );
            return true;
        }

        setUploadCardStatus(inputId, 'checking', 'Actualizando referencia...');

        if (offline || !token) {
            guardarReferenciaComparacionLocal(codigo, tipo, {
                hash: analisis.hash,
                nombreOriginal: file.name,
                resumen: analisis.resumen,
                fecha: new Date().toISOString()
            });
        } else {
            await guardarReferenciaComparacionServidor(
                file,
                tipo,
                analisis,
                codigo,
                token
            );
        }

        const estado = referencia ? 'actualizado' : 'primero';
        comparacionActualPorTipo[tipo] = {
            estado,
            resumen: analisis.resumen
        };
        setComparisonCardStatus(
            inputId,
            estado,
            referencia ? 'Archivo actualizado' : 'Primera carga',
            referencia
                ? `Se detectaron cambios · ${detalleResumenComparacion(analisis.resumen)}`
                : `Se creó la referencia inicial · ${detalleResumenComparacion(analisis.resumen)}`
        );
        return true;
    } catch (error) {
        console.error('Error comparando archivo:', error);
        setComparisonCardStatus(
            inputId,
            'aviso',
            'Comparación no disponible',
            'El archivo se procesará, pero no se pudo comparar con el anterior'
        );
        return true;
    }
}

function escaparHtmlComparacion(valor = '') {
    return String(valor)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatearFechaReferencia(fecha) {
    if (!fecha) return 'Fecha no disponible';
    const valor = new Date(fecha);
    if (Number.isNaN(valor.getTime())) return 'Fecha no disponible';

    return valor.toLocaleString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function tarjetaArchivoComparacion(titulo, nombre, resumen, fecha, vacia = false) {
    if (vacia) {
        return `
            <article class="file-compare-card is-empty">
                <span class="file-compare-eyebrow">${escaparHtmlComparacion(titulo)}</span>
                <i class="fa-solid fa-folder-open"></i>
                <strong>No hay archivo anterior</strong>
                <small>Este archivo será la referencia inicial.</small>
            </article>
        `;
    }

    return `
        <article class="file-compare-card">
            <span class="file-compare-eyebrow">${escaparHtmlComparacion(titulo)}</span>
            <div class="file-compare-name">
                <i class="fa-solid fa-file-excel"></i>
                <strong>${escaparHtmlComparacion(nombre || 'Archivo Excel')}</strong>
            </div>
            <dl>
                <div><dt>Hojas</dt><dd>${Number(resumen?.totalHojas || 0).toLocaleString('es-MX')}</dd></div>
                <div><dt>Filas</dt><dd>${Number(resumen?.totalFilas || 0).toLocaleString('es-MX')}</dd></div>
                <div><dt>Celdas</dt><dd>${Number(resumen?.totalCeldas || 0).toLocaleString('es-MX')}</dd></div>
            </dl>
            <small>${escaparHtmlComparacion(fecha || '')}</small>
        </article>
    `;
}

function filaCambioComparacion(etiqueta, anterior, nuevo) {
    const previo = Number(anterior || 0);
    const actual = Number(nuevo || 0);
    const diferencia = actual - previo;
    const cambio = diferencia === 0
        ? 'Sin cambio'
        : `${diferencia > 0 ? '+' : ''}${diferencia.toLocaleString('es-MX')}`;
    const clase = diferencia === 0 ? 'is-same' : 'is-changed';

    return `
        <div class="file-compare-change ${clase}">
            <span>${escaparHtmlComparacion(etiqueta)}</span>
            <strong>${previo.toLocaleString('es-MX')} → ${actual.toLocaleString('es-MX')}</strong>
            <em>${cambio}</em>
        </div>
    `;
}

function crearVistaComparacionArchivo(referencia, file, analisis, estado) {
    const configuracion = {
        primero: {
            etiqueta: 'PRIMERA CARGA',
            titulo: 'No existe un archivo anterior',
            texto: 'Revisa el archivo seleccionado y confirma que deseas usarlo.'
        },
        igual: {
            etiqueta: 'SIN CAMBIOS',
            titulo: 'El contenido es el mismo',
            texto: 'No se guardará otra copia. Puedes continuar con este archivo.'
        },
        actualizado: {
            etiqueta: 'ARCHIVO DIFERENTE',
            titulo: 'Se encontraron cambios',
            texto: 'Revisa las diferencias y confirma si deseas reemplazar la referencia anterior.'
        }
    }[estado];
    const resumenAnterior = referencia?.resumen;
    const puedeMostrarCambios = Boolean(referencia && resumenAnterior);

    return `
        <div class="file-comparison-view" data-result="${estado}">
            <div class="file-comparison-result">
                <span>${configuracion.etiqueta}</span>
                <strong>${configuracion.titulo}</strong>
                <p>${configuracion.texto}</p>
            </div>

            <div class="file-comparison-grid">
                ${tarjetaArchivoComparacion(
                    'Último archivo usado',
                    referencia?.nombreOriginal,
                    resumenAnterior,
                    referencia ? formatearFechaReferencia(referencia.fecha) : '',
                    !referencia
                )}
                <div class="file-comparison-arrow" aria-hidden="true">
                    <i class="fa-solid fa-arrow-right"></i>
                </div>
                ${tarjetaArchivoComparacion(
                    'Archivo seleccionado',
                    file.name,
                    analisis.resumen,
                    'Seleccionado ahora'
                )}
            </div>

            ${puedeMostrarCambios ? `
                <div class="file-comparison-changes">
                    <h4>Resumen de diferencias</h4>
                    ${filaCambioComparacion(
                        'Hojas',
                        resumenAnterior.totalHojas,
                        analisis.resumen.totalHojas
                    )}
                    ${filaCambioComparacion(
                        'Filas',
                        resumenAnterior.totalFilas,
                        analisis.resumen.totalFilas
                    )}
                    ${filaCambioComparacion(
                        'Celdas con datos',
                        resumenAnterior.totalCeldas,
                        analisis.resumen.totalCeldas
                    )}
                </div>
            ` : referencia ? `
                <div class="file-comparison-legacy-note">
                    <i class="fa-solid fa-circle-info"></i>
                    <span>El archivo anterior pertenece al sistema previo. Se comparó todo su contenido, pero no tiene un resumen de filas y hojas.</span>
                </div>
            ` : ''}
        </div>
    `;
}

function abrirVentanaComparacion(
    html,
    textoConfirmar,
    titulo = 'Comparación de conciliaciones',
    subtitulo = 'Revisa las diferencias antes de continuar.'
) {
    const dialog = document.getElementById('fileComparisonDialog');
    const content = document.getElementById('fileComparisonContent');
    const confirmButton = document.getElementById('fileComparisonConfirm');
    const cancelButton = document.getElementById('fileComparisonCancel');
    const closeButton = document.getElementById('fileComparisonClose');
    const titleElement = document.getElementById('fileComparisonTitle');
    const subtitleElement = dialog?.querySelector('.file-comparison-window-header p');

    if (!dialog || !content || !confirmButton || !cancelButton || !closeButton) {
        return Promise.resolve(false);
    }

    content.innerHTML = html;
    confirmButton.textContent = textoConfirmar;
    if (titleElement) titleElement.textContent = titulo;
    if (subtitleElement) subtitleElement.textContent = subtitulo;

    return new Promise(resolve => {
        let resuelta = false;

        const finalizar = confirmada => {
            if (resuelta) return;
            resuelta = true;
            confirmButton.removeEventListener('click', confirmar);
            cancelButton.removeEventListener('click', cancelar);
            closeButton.removeEventListener('click', cancelar);
            dialog.removeEventListener('cancel', cancelarConEscape);
            if (dialog.open) dialog.close();
            resolve(confirmada);
        };
        const confirmar = () => finalizar(true);
        const cancelar = () => finalizar(false);
        const cancelarConEscape = event => {
            event.preventDefault();
            finalizar(false);
        };

        confirmButton.addEventListener('click', confirmar);
        cancelButton.addEventListener('click', cancelar);
        closeButton.addEventListener('click', cancelar);
        dialog.addEventListener('cancel', cancelarConEscape);
        dialog.showModal();
    });
}

async function revisarArchivoConVistaPrevia(file, tipo) {
    const inputId = inputIdPorTipoRevision(tipo);
    const select = document.getElementById('selectRestaurante');
    const restauranteId = select?.value;
    const codigo = select?.selectedOptions?.[0]?.dataset?.codigo;

    if (!restauranteId || !codigo) {
        await Swal.fire({
            icon: 'warning',
            title: 'Selecciona el restaurante',
            text: 'Debes elegir el restaurante antes de cargar el archivo.'
        });
        return false;
    }

    setUploadCardStatus(inputId, 'checking', 'Preparando comparación...');
    setComparisonCardStatus(
        inputId,
        'comprobando',
        'Revisando archivo',
        'Leyendo hojas, filas y contenido'
    );

    try {
        const analisis = await analizarContenidoParaComparacion(file);
        const token = localStorage.getItem('token');
        const offline = localStorage.getItem('modoOffline') === 'true';
        const referencia = offline || !token
            ? cargarReferenciaComparacionLocal(codigo, tipo)
            : await cargarReferenciaComparacionServidor(tipo, restauranteId, token);
        const sinCambios = Boolean(referencia?.hash) &&
            String(referencia.hash).slice(0, 16) === analisis.hash.slice(0, 16);
        const estado = !referencia
            ? 'primero'
            : sinCambios
                ? 'igual'
                : 'actualizado';

        const decision = await abrirVentanaComparacion(
            crearVistaComparacionArchivo(referencia, file, analisis, estado),
            estado === 'actualizado'
                ? 'Usar archivo nuevo'
                : 'Usar este archivo'
        );

        if (!decision) {
            delete comparacionActualPorTipo[tipo];
            setUploadCardStatus(inputId);
            return false;
        }

        if (estado !== 'igual') {
            setUploadCardStatus(inputId, 'checking', 'Guardando archivo de referencia...');

            if (offline || !token) {
                guardarReferenciaComparacionLocal(codigo, tipo, {
                    hash: analisis.hash,
                    nombreOriginal: file.name,
                    resumen: analisis.resumen,
                    fecha: new Date().toISOString()
                });
            } else {
                await guardarReferenciaComparacionServidor(
                    file,
                    tipo,
                    analisis,
                    codigo,
                    token
                );
            }
        }

        comparacionActualPorTipo[tipo] = {
            estado,
            resumen: analisis.resumen
        };
        setComparisonCardStatus(
            inputId,
            estado,
            estado === 'igual'
                ? 'Archivo verificado'
                : estado === 'actualizado'
                    ? 'Archivo nuevo aprobado'
                    : 'Archivo inicial aprobado',
            estado === 'igual'
                ? 'Es igual al último archivo usado'
                : `${detalleResumenComparacion(analisis.resumen)} · Listo para procesar`
        );
        return true;
    } catch (error) {
        console.error('Error comparando archivo:', error);
        const decision = await Swal.fire({
            icon: 'warning',
            title: 'No se pudo comparar',
            text: 'Puedes elegir otro archivo o continuar sin compararlo.',
            showCancelButton: true,
            confirmButtonText: 'Usar sin comparar',
            cancelButtonText: 'Elegir otro archivo'
        });

        if (!decision.isConfirmed) {
            setUploadCardStatus(inputId);
            return false;
        }

        setComparisonCardStatus(
            inputId,
            'aviso',
            'Usado sin comparación',
            'No fue posible consultar el archivo anterior'
        );
        return true;
    }
}

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

    if (!type) {
        setComparisonCardStatus(inputId);
    }

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
        delete revisionActualPorTipo.sales;
        delete comparacionActualPorTipo.sales;
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
        delete revisionActualPorTipo.salesDetail;
        delete comparacionActualPorTipo.salesDetail;
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
        delete revisionActualPorTipo.ebt;
        delete comparacionActualPorTipo.ebt;
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
    delete revisionActualPorTipo.salesDetail;
    delete revisionActualPorTipo.ebt;
    delete comparacionActualPorTipo.salesDetail;
    delete comparacionActualPorTipo.ebt;
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
        window.location.href = '/';
        return;
    }

    // Establecer fecha actual
    document.getElementById('fechaConciliacion').valueAsDate = new Date();

    // Cargar catalogo de restaurantes activos
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
                        `${file.name} cargado (${salesRows.length} filas)${textoComparacionActual('sales')}`
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
                        `${file.name} cargado (${salesDetailRows.length} filas, ${tiendasNuevas} tiendas nuevas)${textoComparacionActual('salesDetail')}`
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
                    `${file.name} cargado (${rows.length} filas)${textoComparacionActual('ebt')}`
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

    if (
        codigoRestauranteCargado &&
        codigo !== codigoRestauranteCargado
    ) {
        removerArchivo();
    }

    codigoRestauranteCargado = codigo || '';

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
    Object.keys(revisionActualPorTipo)
        .forEach(tipo => delete revisionActualPorTipo[tipo]);
    Object.keys(comparacionActualPorTipo)
        .forEach(tipo => delete comparacionActualPorTipo[tipo]);
    archivoActual = null;
    salesFile = null;
    ebtFile = null;
    salesDetailFile = null;
    workbook = null;
    salesWorkbook = null;
    ebtWorkbook = null;
    salesDetailWorkbook = null;
    datosExtraidos = [];
    fechaConciliacionActual = null;
    comparacionConciliacionActual = {
        clave: '',
        resultado: null,
        aprobada: true
    };
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





function obtenerCodigoRestauranteActual() {
    return document
        .getElementById('selectRestaurante')
        ?.selectedOptions?.[0]
        ?.dataset?.codigo || '';
}

function esColumnaOS(columna) {
    const codigo = obtenerCodigoRestauranteActual();
    const claveOriginal = String(columna?.key || '');
    const etiquetaOriginal = String(columna?.label || '').trim();

    // Taco Bell tiene dos columnas distintas: "O/S" (oS) y "OS" (os).
    // Solo la primera representa la diferencia que debe auditarse.
    if (codigo === 'taco-bell') {
        return (
            claveOriginal === 'oS' ||
            etiquetaOriginal.toUpperCase() === 'O/S'
        );
    }

    const clave = claveOriginal
        .toLowerCase()
        .replace(/[^a-z]/g, '');
    const etiqueta = etiquetaOriginal
        .toLowerCase()
        .replace(/[^a-z]/g, '');

    return (
        clave === 'os' ||
        clave === 'osslash' ||
        clave === 'overshort' ||
        etiqueta === 'os' ||
        etiqueta === 'overshort'
    );
}

function obtenerValoresOS(row) {
    const codigo = obtenerCodigoRestauranteActual();
    const claves = codigo === 'taco-bell'
        ? ['oS']
        : ['oS', 'os', 'osSlash', 'overShort'];

    return claves
        .filter(key => row?.[key] !== undefined)
        .map(key => Number(row[key]))
        .filter(Number.isFinite);
}

function esDiferenciaOSValor(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) && Math.abs(numero) > 0.005;
}

function tieneDiferenciaOS(row) {
    return obtenerValoresOS(row)
        .some(esDiferenciaOSValor);
}

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

    const diferenciasOS =
        datosExtraidos.filter(tieneDiferenciaOS).length;

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

    const statusCard =
        document.getElementById('osStatusCard');
    const statusText =
        document.getElementById('osDifferenceStatus');
    const statusMeta =
        document.getElementById('osDifferenceMeta');
    const statusIcon =
        document.getElementById('osStatusIcon');
    const hayDiferenciasOS = diferenciasOS > 0;

    if (statusCard) {
        statusCard.classList.toggle(
            'has-difference',
            hayDiferenciasOS
        );
        statusCard.classList.toggle(
            'is-clear',
            !hayDiferenciasOS
        );
    }

    if (statusText) {
        statusText.textContent = hayDiferenciasOS
            ? 'Con diferencias'
            : 'Sin diferencias';
    }

    if (statusMeta) {
        statusMeta.textContent = hayDiferenciasOS
            ? `${diferenciasOS} tienda${diferenciasOS === 1 ? '' : 's'} con O/S`
            : 'O/S balanceado';
    }

    if (statusIcon) {
        statusIcon.className = hayDiferenciasOS
            ? 'fa-solid fa-triangle-exclamation'
            : 'fa-solid fa-scale-balanced';
    }
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

        if (esColumnaOS(col)) {
            th.classList.add('os-column-header');
        }

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
            const columnaOS = esColumnaOS(col);
            const valorNumericoOS = Number(valor);

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

            if (
                columnaOS &&
                Number.isFinite(valorNumericoOS)
            ) {
                const tieneDiferencia =
                    esDiferenciaOSValor(valorNumericoOS);

                td.classList.add(
                    tieneDiferencia
                        ? 'os-difference'
                        : 'os-balanced'
                );

                if (tieneDiferencia) {
                    td.title = 'Diferencia O/S detectada';
                    tr.classList.add('os-row-difference');
                    tr.title = 'Esta tienda tiene una diferencia en O/S';
                }
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

function construirNombreArchivo(tipoArchivo, extension) {
    const select = document.getElementById('selectRestaurante');
    const option = select?.selectedOptions?.[0];
    const codigo = option?.dataset?.codigo || '';
    const nombres = {
        'taco-bell': 'Taco_Bell',
        'burger-king': 'Burger_King',
        'popeyes': 'Popeyes'
    };
    const restaurante = nombres[codigo] || String(option?.textContent || 'Restaurante')
        .trim()
        .replace(/\s+-\s+.*$/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    const fecha = new Date();
    const fechaGuardado = [
        fecha.getFullYear(),
        String(fecha.getMonth() + 1).padStart(2, '0'),
        String(fecha.getDate()).padStart(2, '0')
    ].join('-');
    const tipo = String(tipoArchivo || 'Conciliacion')
        .replace(/Taco\s*Bell|Burger\s*King|Popeyes/gi, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'Conciliacion';

    return `${restaurante}_${fechaGuardado}_${tipo}.${extension}`;
}

function obtenerFechaConciliacionBD() {
    const valor =
        fechaConciliacionActual ||
        datosExtraidos[0]?.date ||
        document.getElementById('fechaConciliacion')?.value ||
        '';
    const texto = String(valor).trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);

    const fechaUsa = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (fechaUsa) {
        return `${fechaUsa[3]}-${fechaUsa[1].padStart(2, '0')}-${fechaUsa[2].padStart(2, '0')}`;
    }

    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return '';

    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function etiquetaCampoConciliacion(campo) {
    const columnas = [
        ...(currentRestaurantConfig?.conciliationColumns || []),
        ...(currentRestaurantConfig?.tableColumns || [])
    ];
    const configurada = columnas.find(columna => columna.key === campo)?.label;
    if (configurada?.trim()) return configurada;

    return String(campo)
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replaceAll('_', ' ')
        .replace(/^./, letra => letra.toUpperCase());
}

function crearVistaDiferenciasConciliacion(resultado) {
    const codigo = obtenerCodigoRestauranteActual();
    const nombreRestaurante = {
        'taco-bell': 'Taco Bell',
        popeyes: 'Popeyes',
        'burger-king': 'Burger King'
    }[codigo] || codigo;
    const filas = resultado.diferencias.flatMap(diferencia => {
        if (diferencia.tipo === 'tienda_nueva') {
            return [{
                tienda: diferencia.tienda,
                concepto: 'Tienda nueva en el archivo',
                anterior: '—',
                nuevo: 'Incluida',
                diferencia: 'Nueva'
            }];
        }

        if (diferencia.tipo === 'tienda_eliminada') {
            return [{
                tienda: diferencia.tienda,
                concepto: 'Tienda no incluida en el archivo nuevo',
                anterior: 'Incluida',
                nuevo: '—',
                diferencia: 'Retirada'
            }];
        }

        return diferencia.cambios.map(cambio => ({
            tienda: diferencia.tienda,
            concepto: etiquetaCampoConciliacion(cambio.campo),
            anterior: Number(cambio.anterior).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }),
            nuevo: Number(cambio.nuevo).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }),
            diferencia: Number(cambio.diferencia).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
                signDisplay: 'always'
            })
        }));
    });
    const visibles = filas.slice(0, 250);

    return `
        <div class="file-comparison-view reconciliation-comparison" data-result="actualizado">
            <div class="file-comparison-result">
                <span>DIFERENCIAS</span>
                <strong>${escaparHtmlComparacion(nombreRestaurante)} · ${escaparHtmlComparacion(obtenerFechaConciliacionBD())}</strong>
                <p>Ya existe una conciliación para esta fecha y algunos montos cambiaron.</p>
            </div>

            <div class="reconciliation-comparison-summary">
                <div><strong>${resultado.tiendasComparadas}</strong><span>Tiendas comparadas</span></div>
                <div><strong>${resultado.tiendasConDiferencias}</strong><span>Tiendas con cambios</span></div>
                <div><strong>${filas.length}</strong><span>Montos diferentes</span></div>
            </div>

            <div class="reconciliation-diff-wrapper">
                <table class="reconciliation-diff-table">
                    <thead>
                        <tr>
                            <th>Tienda</th>
                            <th>Concepto</th>
                            <th>Anterior</th>
                            <th>Nuevo</th>
                            <th>Diferencia</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${visibles.map(fila => `
                            <tr>
                                <td>${escaparHtmlComparacion(fila.tienda)}</td>
                                <td>${escaparHtmlComparacion(fila.concepto)}</td>
                                <td>${escaparHtmlComparacion(fila.anterior)}</td>
                                <td>${escaparHtmlComparacion(fila.nuevo)}</td>
                                <td>${escaparHtmlComparacion(fila.diferencia)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            ${filas.length > visibles.length
                ? `<p class="reconciliation-diff-more">Se muestran 250 de ${filas.length} diferencias.</p>`
                : ''}
        </div>
    `;
}

async function compararConciliacionConBD() {
    const token = localStorage.getItem('token');
    const offline = localStorage.getItem('modoOffline') === 'true';
    const restauranteId = document.getElementById('selectRestaurante')?.value;
    const fecha = obtenerFechaConciliacionBD();

    if (offline) return true;
    if (!token || !restauranteId || !fecha || !datosExtraidos.length) return false;

    try {
        const huella = await hashTextoRevision(JSON.stringify(datosExtraidos));
        const clave = `${restauranteId}:${fecha}:${huella.slice(0, 16)}`;

        if (
            comparacionConciliacionActual.clave === clave &&
            comparacionConciliacionActual.resultado
        ) {
            if (!comparacionConciliacionActual.resultado.tiendasConDiferencias) {
                return true;
            }
            if (comparacionConciliacionActual.aprobada) return true;
        } else {
            const response = await fetch(
                `${window.API_URL}/conciliaciones/comparar-existente`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        restaurante_id: restauranteId,
                        fecha_conciliacion: fecha,
                        datos_extraidos: datosExtraidos
                    })
                }
            );
            const resultado = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(resultado.message || 'No se pudo comparar la conciliación');
            }

            comparacionConciliacionActual = {
                clave,
                resultado,
                aprobada: !resultado.tiendasConDiferencias
            };

            if (!resultado.existe || !resultado.tiendasConDiferencias) {
                return true;
            }
        }

        const resultado = comparacionConciliacionActual.resultado;
        const decision = await abrirVentanaComparacion(
            crearVistaDiferenciasConciliacion(resultado),
            'Continuar con datos nuevos',
            'Cambios contra la conciliación guardada',
            'Comparación por tienda y fecha con las reglas de esta marca.'
        );
        comparacionConciliacionActual.aprobada = decision;
        return decision;
    } catch (error) {
        console.error('Error comparando conciliación:', error);
        await Swal.fire({
            icon: 'error',
            title: 'No se pudo validar la conciliación',
            text: `${error.message}. No se guardó ningún cambio.`
        });
        return false;
    }
}

async function registrarConciliacionEnBD() {
    const token = localStorage.getItem('token');
    const restauranteId = document.getElementById('selectRestaurante')?.value;
    const templateId = document.getElementById('selectTemplate')?.value;
    const fecha = obtenerFechaConciliacionBD();

    if (!token || !restauranteId || !templateId || !fecha) {
        throw new Error('Faltan restaurante, template o fecha para registrar la conciliación');
    }

    const response = await fetch(`${window.API_URL}/conciliaciones`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            restaurante_id: restauranteId,
            template_id: templateId,
            fecha_conciliacion: fecha,
            periodo_inicio: fecha,
            periodo_fin: fecha,
            datos_extraidos: datosExtraidos,
            notas: 'Generada desde el módulo de conciliación'
        })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || 'No se pudo registrar la conciliación');
    }

    comparacionConciliacionActual = {
        clave: '',
        resultado: null,
        aprobada: true
    };
    return data;
}

async function saveConciliacion() {

    if (!workbook) {
        Swal.fire({
            icon: 'warning',
            title: 'Sin datos',
            text: 'Primero debes cargar un archivo'
        });
        return;
    }

    if (!datosExtraidos.length) {
        await Swal.fire({
            icon: 'warning',
            title: 'Sin conciliación',
            text: 'Primero genera la conciliación'
        });
        return;
    }

    const comparacionAprobada = await compararConciliacionConBD();
    if (!comparacionAprobada) return;

    Swal.fire({
        title: 'Guardar conciliación',
        text: '¿Dónde deseas guardar el archivo?',
        icon: 'question',
        showCancelButton: true,
        showDenyButton: localStorage.getItem('modoOffline') !== 'true',
        confirmButtonText:
            '<i class="fa-solid fa-download"></i> Descargar',
        denyButtonText:
            '<i class="fa-solid fa-cloud-arrow-up"></i> Guardar en servidor',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#2563eb',
        denyButtonColor: '#10b981'
    }).then(async (result) => {

        if (result.isConfirmed) {

            let registro = null;
            let errorRegistro = null;

            if (localStorage.getItem('modoOffline') !== 'true') {
                try {
                    registro = await registrarConciliacionEnBD();
                } catch (error) {
                    errorRegistro = error;
                    console.error('No se registró la conciliación:', error);
                }
            }

            const workbookFinal =
                generarWorkbookConConciliacion();

            XLSX.writeFile(
                workbookFinal,
                construirNombreArchivo('Conciliacion', 'xlsx')
            );

            Swal.fire(errorRegistro
                ? {
                    icon: 'warning',
                    title: 'Archivo descargado',
                    text: `${errorRegistro.message}. La comparación quedará pendiente hasta registrarlo en el servidor.`
                }
                : {
                    icon: 'success',
                    title: 'Archivo descargado y conciliación registrada',
                    text: registro?.id ? `Registro contable ID: ${registro.id}` : '',
                    timer: 1800,
                    showConfirmButton: false
                });

        } else if (result.isDenied) {

            await guardarConciliacionServidor();

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

        const registroConciliacion =
            await registrarConciliacionEnBD();


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
            construirNombreArchivo('Conciliacion', 'xlsx')
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
                    Archivo ID: ${data.archivo.id}<br>
                    Registro contable ID: ${registroConciliacion.id}
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

    if (esTacoBell) {
        anexarHojasFuente(
            nuevoWorkbook,
            salesDetailWorkbook,
            {
                omitirGeneradas: true,
                renombrar: (sheetName, index) =>
                    index === 0
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
                    index === 0
                        ? 'EBT AMOUNTS'
                        : sheetName
            }
        );
    }

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

    const agregarHojaDatos = (data, nombre) => {
        if (!Array.isArray(data) || !data.length) return;

        XLSX.utils.book_append_sheet(
            nuevoWorkbook,
            XLSX.utils.json_to_sheet(data),
            obtenerNombreHojaUnico(nuevoWorkbook, nombre)
        );
    };

    // Cada restaurante exporta exclusivamente sus propias hojas generadas.
    if (codigo === 'taco-bell') {
        agregarHojaDatos(taxReviewData, 'Tax Review');
        agregarHojaDatos(prepararDatosIntacct(dailySalesREDData), 'Daily Sales RED');
        agregarHojaDatos(prepararDatosIntacct(statisticalDeliveryData), 'Statistical Delivery');
        agregarHojaDatos(prepararDatosIntacct(dailySales0314Data), 'Daily Sales 03-14');
        agregarHojaDatos(prepararDatosIntacct(dailySales0310Data), 'Daily Sales 03-10');
    } else if (codigo === 'popeyes') {
        agregarHojaDatos(popeyesTaxReviewData, 'Tax Review');
        agregarHojaDatos(prepararDatosIntacct(popeyesDailySalesRedData), 'Daily Sales Popeyes Red');
        agregarHojaDatos(prepararDatosIntacct(popeyesDailySales0404Data), 'Daily Sales Popeyes 04-04-2026');
    } else if (codigo === 'burger-king') {
        agregarHojaDatos(burgerKingSummaryData, 'Summary');
        agregarHojaDatos(burgerKingTaxAnalysisData, 'Tax Analysis');
        agregarHojaDatos(burgerKingDiscrepanciesData, 'Discrepancies');
        agregarHojaDatos(prepararDatosIntacct(burgerKingTemplateCsvData), 'Template to CSV');
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

const COLUMNAS_INTACCT = [
    'LINE_NO',
    'JOURNAL',
    'DATE',
    'DESCRIPTION',
    'MEMO',
    'DEPT_ID',
    'ACCT_NO',
    'LOCATION_ID',
    'DEBIT',
    'CREDIT'
];

function normalizarFechaIntacct(valor) {
    if (valor === null || valor === undefined || valor === '') return '';

    if (typeof valor === 'number' && Number.isFinite(valor)) {
        const fecha = new Date(Date.UTC(1899, 11, 30) + valor * 86400000);
        return `${String(fecha.getUTCMonth() + 1).padStart(2, '0')}/${String(fecha.getUTCDate()).padStart(2, '0')}/${fecha.getUTCFullYear()}`;
    }

    const texto = String(valor).trim();
    const fechaUsa = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (fechaUsa) {
        return `${fechaUsa[1].padStart(2, '0')}/${fechaUsa[2].padStart(2, '0')}/${fechaUsa[3]}`;
    }

    const fechaIso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (fechaIso) {
        return `${fechaIso[2].padStart(2, '0')}/${fechaIso[3].padStart(2, '0')}/${fechaIso[1]}`;
    }

    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return '';

    return `${String(fecha.getMonth() + 1).padStart(2, '0')}/${String(fecha.getDate()).padStart(2, '0')}/${fecha.getFullYear()}`;
}

function obtenerPrimerValor(row, claves, predeterminado = '') {
    for (const clave of claves) {
        if (row?.[clave] !== undefined && row?.[clave] !== null && row?.[clave] !== '') {
            return row[clave];
        }
    }

    return predeterminado;
}

function descripcionIntacctPredeterminada(row) {
    const memo = String(obtenerPrimerValor(row, ['memo', 'MEMO'], ''));
    if (/statistical delivery/i.test(memo)) return 'Statistical Delivery Sales';

    return obtenerCodigoRestauranteActual() === 'taco-bell'
        ? 'POS Data Upload Sabretooth'
        : 'POS Data Upload DC Central';
}

function prepararDatosIntacct(data) {
    if (!Array.isArray(data)) return [];

    const fechaPredeterminada = normalizarFechaIntacct(
        fechaConciliacionActual || obtenerFechaConciliacionBD()
    );

    return data
        .map(row => {
            const debit = Number(obtenerPrimerValor(row, ['debit', 'DEBIT'], 0)) || 0;
            const credit = Number(obtenerPrimerValor(row, ['credit', 'CREDIT'], 0)) || 0;

            return {
                row,
                debit,
                credit
            };
        })
        .filter(item => Math.abs(item.debit) >= 0.005 || Math.abs(item.credit) >= 0.005)
        .map((item, index) => {
            const { row, debit, credit } = item;

            return {
                LINE_NO: index + 1,
                JOURNAL: String(obtenerPrimerValor(row, ['journal', 'JOURNAL'], 'SJ')).trim() || 'SJ',
                DATE: normalizarFechaIntacct(
                    obtenerPrimerValor(row, ['date', 'DATE'], fechaPredeterminada)
                ) || fechaPredeterminada,
                DESCRIPTION: String(
                    obtenerPrimerValor(
                        row,
                        ['description', 'DESCRIPTION'],
                        descripcionIntacctPredeterminada(row)
                    )
                ).trim(),
                MEMO: String(obtenerPrimerValor(row, ['memo', 'MEMO'], '')).trim(),
                DEPT_ID: String(
                    obtenerPrimerValor(
                        row,
                        ['deptId', 'departmentId', 'description2', 'DEPT_ID'],
                        ''
                    )
                ).trim(),
                ACCT_NO: obtenerPrimerValor(row, ['acctNo', 'account', 'ACCT_NO'], ''),
                LOCATION_ID: obtenerPrimerValor(
                    row,
                    ['locationId', 'store', 'LOCATION_ID'],
                    ''
                ),
                DEBIT: Math.abs(debit) >= 0.005 ? debit : '',
                CREDIT: Math.abs(credit) >= 0.005 ? credit : ''
            };
        });
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
        Swal.fire({
            icon: 'warning',
            title: 'Sin datos para exportar',
            text: 'Genera la conciliación antes de descargar el archivo.'
        });
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
    link.download = construirNombreArchivo(nombreArchivo, 'csv');

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);

}

function descargarCSVIntacct(data, nombreArchivo) {
    const datosIntacct = prepararDatosIntacct(data);

    if (datosIntacct.length && Object.keys(datosIntacct[0]).join('|') !== COLUMNAS_INTACCT.join('|')) {
        Swal.fire({
            icon: 'error',
            title: 'Estructura Intacct inválida',
            text: 'No se descargó el archivo porque sus columnas no coinciden con el template.'
        });
        return;
    }

    descargarCSV(datosIntacct, nombreArchivo);
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
                descargarCSVIntacct(
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
                descargarCSVIntacct(
                    popeyesDailySalesRedData,
                    'DailySalesPopeyesRed'
                );
                break;

            case 'dailySales0404':
                descargarCSVIntacct(
                    popeyesDailySales0404Data,
                    'DailySalesPopeyes0404'
                );
                break;

            default:
                Swal.fire({
                    icon: 'info',
                    title: 'Selecciona una pestaña',
                    text: 'Elige la vista que deseas exportar.'
                });
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
                Swal.fire({
                    icon: 'info',
                    title: 'Selecciona una pestaña',
                    text: 'Elige la vista que deseas exportar.'
                });
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
            descargarCSVIntacct(
                dailySalesREDData,
                'DailySalesRED'
            );
            break;

        case 'statisticalDelivery':
            descargarCSVIntacct(
                statisticalDeliveryData,
                'StatisticalDelivery'
            );
            break;

        case 'dailySales0314':
            descargarCSVIntacct(
                dailySales0314Data,
                'DailySales0314'
            );
            break;

        case 'dailySales0310':
            descargarCSVIntacct(
                dailySales0310Data,
                'DailySales0310'
            );
            break;

        default:
            Swal.fire({
                icon: 'info',
                title: 'Selecciona una pestaña',
                text: 'Elige la vista que deseas exportar.'
            });
    }

}




