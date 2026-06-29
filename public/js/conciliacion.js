

window.API_URL
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
let ebtPorStore = {};
let salesRows = [];
let salesDetailRows = [];
let selectedEbtDate = '';
let selectedServerEbtId = '';
let tbSavedReconciliationBase = null;
let tbSavedReconciliationsDisponibles = [];
let ebtDocumentosDisponibles = [];
let selectedSalesDetailDate = '';

let filtroStore = '';
let filtroStoreName = '';

let selectedSalesDate = null;
let codigoRestaurantCargado = '';
const revisionActualPorTipo = {};
const comparacionActualPorTipo = {};
let comparacionConciliacionActual = {
    clave: '',
    resultado: null,
    aprobada: true
};

function etiquetaTipoReview(tipo) {
    return {
        sales: 'Main file',
        salesDetail: 'Sales Detail',
        ebt: 'EBT'
    }[tipo] || tipo;
}

function inputIdPorTipoReview(tipo) {
    return {
        sales: 'salesFile',
        salesDetail: 'salesDetailFile',
        ebt: 'ebtFile'
    }[tipo] || 'salesFile';
}

function analizarNombreReview(nombre = '') {
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

function analizarReviewArchivo(archivo) {
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
    }

    return analizarNombreReview(archivo?.nombre_original);
}

async function hashTextoReview(texto) {
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

async function calcularHuellaReview(file) {
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

        return hashTextoReview(JSON.stringify(contenido));
    } catch {
        const bytes = new Uint8Array(buffer);
        let binario = '';
        const bloque = 8192;

        for (let index = 0; index < bytes.length; index += bloque) {
            binario += String.fromCharCode(...bytes.subarray(index, index + bloque));
        }

        return hashTextoReview(binario);
    }
}

async function cargarReviewesServidor(tipo, restauranteId, token) {
    const response = await fetch(`${window.API_URL}/archivos`, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
        throw new Error('Revision history could not be loaded');
    }

    const data = await response.json();
    const archivos = Array.isArray(data) ? data : (data.archivos || []);

    return archivos
        .map(archivo => ({
            archivo,
            revision: analizarReviewArchivo(archivo)
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

async function guardarReviewServidor(file, tipo, version, hash, codigo, token) {
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
        throw new Error(data.message || 'The revision could not be saved');
    }

    return data.archivo?.id;
}

function cargarReviewesLocales(codigo, tipo) {
    try {
        const todas = JSON.parse(localStorage.getItem('sourceFileReviews') || '{}');
        return todas[`${codigo}:${tipo}`] || [];
    } catch {
        return [];
    }
}

function guardarReviewLocal(codigo, tipo, revision) {
    const todas = JSON.parse(localStorage.getItem('sourceFileReviews') || '{}');
    const key = `${codigo}:${tipo}`;
    todas[key] = [...(todas[key] || []), revision].slice(-20);
    localStorage.setItem('sourceFileReviews', JSON.stringify(todas));
}

function textoReviewActual(tipo) {
    const version = revisionActualPorTipo[tipo];
    return version ? ` / Revision V${String(version).padStart(3, '0')}` : '';
}

async function validarReviewAntesDeProcesar(file, tipo) {
    const inputId = inputIdPorTipoReview(tipo);
    const select = document.getElementById('selectRestaurant');
    const restauranteId = select?.value;
    const codigo = select?.selectedOptions?.[0]?.dataset?.codigo;

    if (!restauranteId || !codigo) {
        await Swal.fire({
            icon: 'warning',
            title: 'Select the restaurant',
            text: 'Choose the restaurant before uploading and comparing the file.'
        });
        return false;
    }

    setUploadCardStatus(inputId, 'checking', 'Comparing with the latest revision...');

    try {
        const hash = await calcularHuellaReview(file);
        const token = localStorage.getItem('token');
        const offline = localStorage.getItem('modoOffline') === 'true';
        let revisiones = [];

        if (offline || !token) {
            revisiones = cargarReviewesLocales(codigo, tipo)
                .map(revision => ({ revision }))
                .sort((a, b) => b.revision.version - a.revision.version);
        } else {
            revisiones = await cargarReviewesServidor(tipo, restauranteId, token);
        }

        const ultima = revisiones[0]?.revision || null;
        const sinCambios =
            String(ultima?.hash || '').slice(0, 16) === hash.slice(0, 16);

        if (sinCambios) {
            revisionActualPorTipo[tipo] = ultima.version;
            const result = await Swal.fire({
                icon: 'info',
                title: 'The file did not change',
                html: `<strong>${etiquetaTipoReview(tipo)}</strong><br>It matches revision V${String(ultima.version).padStart(3, '0')}.`,
                showCancelButton: true,
                confirmButtonText: 'Procesar de todos modos',
                cancelButtonText: 'Cancel'
            });

            if (!result.isConfirmed) setUploadCardStatus(inputId);
            return result.isConfirmed;
        }

        const nuevaVersion = (ultima?.version || 0) + 1;
        const result = await Swal.fire({
            icon: ultima ? 'warning' : 'info',
            title: ultima ? 'Change detected' : 'First revision',
            html: ultima
                ? `The contents of <strong>${etiquetaTipoReview(tipo)}</strong> changed compared with V${String(ultima.version).padStart(3, '0')}.<br>It will be saved as <strong>V${String(nuevaVersion).padStart(3, '0')}</strong> before processing.`
                : `No previous revision exists for <strong>${etiquetaTipoReview(tipo)}</strong>.<br>It will be saved as <strong>V001</strong>.`,
            showCancelButton: true,
            confirmButtonText: 'Save y procesar',
            cancelButtonText: 'Cancel'
        });

        if (!result.isConfirmed) {
            setUploadCardStatus(inputId);
            return false;
        }

        setUploadCardStatus(inputId, 'checking', `Saving revision V${String(nuevaVersion).padStart(3, '0')}...`);

        if (offline || !token) {
            guardarReviewLocal(codigo, tipo, {
                version: nuevaVersion,
                hash: hash.slice(0, 16),
                nombreOriginal: file.name,
                fecha: new Date().toISOString()
            });
        } else {
            await guardarReviewServidor(
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
        console.error('Error verifying revision:', error);
        setUploadCardStatus(inputId, 'error', 'The revision could not be verified');
        await Swal.fire({
            icon: 'error',
            title: 'The file was not processed',
            text: `${error.message}. The comparison must finish before generating the template.`
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
    }

    const anterior = analizarNombreReview(archivo?.nombre_original);
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
            hash: await hashTextoReview(JSON.stringify(contenido)),
            resumen: resumirWorkbookParaComparacion(book)
        };
    } catch {
        const bytes = new Uint8Array(buffer);
        let binario = '';

        for (let index = 0; index < bytes.length; index += 8192) {
            binario += String.fromCharCode(...bytes.subarray(index, index + 8192));
        }

        return {
            hash: await hashTextoReview(binario),
            resumen: { totalHojas: 0, totalFilas: 0, totalCeldas: 0, hojas: [] }
        };
    }
}

async function cargarReferenciaComparacionServidor(tipo, restauranteId, token) {
    const response = await fetch(`${window.API_URL}/archivos`, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
        throw new Error('The previous file could not be loaded');
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
        throw new Error(data.message || 'The previous file could not be updated');
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
            localStorage.getItem('sourceFileReviews') || '{}'
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
            console.warn('Using local reference because the server did not respond:', error);
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
        console.error('The reference could not be synchronized with the server:', error);
        return false;
    }
}

function textoComparacionActual(tipo) {
    return {
        igual: ' / No changes',
        actualizado: ' / File updated',
        primero: ' · Primera carga'
    }[comparacionActualPorTipo[tipo]?.estado] || '';
}

function detalleResumenComparacion(resumen) {
    if (!resumen?.totalHojas) return 'Contenido verificado';
    const hojas = resumen.totalHojas === 1 ? '1 sheet' : `${resumen.totalHojas} sheets`;
    return `${hojas} / ${resumen.totalFilas.toLocaleString('en-US')} rows`;
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
    const inputId = inputIdPorTipoReview(tipo);
    const select = document.getElementById('selectRestaurant');
    const restauranteId = select?.value;
    const codigo = select?.selectedOptions?.[0]?.dataset?.codigo;

    if (!restauranteId || !codigo) {
        await Swal.fire({
            icon: 'warning',
            title: 'Select the restaurant',
            text: 'Choose the restaurant before uploading the file.'
        });
        return false;
    }

    setUploadCardStatus(inputId, 'checking', 'Reading file...');
    setComparisonCardStatus(
        inputId,
        'comprobando',
        'Comprobando cambios',
        'Comparing with the latest uploaded file'
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
                'No changes',
                `Matches the previous file / ${detalleResumenComparacion(analisis.resumen)}`
            );
            return true;
        }

        setUploadCardStatus(inputId, 'checking', 'Updating reference...');

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
            referencia ? 'File updated' : 'First upload',
            referencia
                ? `Changes detected / ${detalleResumenComparacion(analisis.resumen)}`
                : `Initial reference created / ${detalleResumenComparacion(analisis.resumen)}`
        );
        return true;
    } catch (error) {
        console.error('Error comparing file:', error);
        setComparisonCardStatus(
            inputId,
            'aviso',
            'Comparison unavailable',
            'The file will be processed, but it could not be compared with the previous one'
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
    if (!fecha) return 'Date unavailable';
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
                <strong>No previous file</strong>
                <small>This file will become the initial reference.</small>
            </article>
        `;
    }

    return `
        <article class="file-compare-card">
            <span class="file-compare-eyebrow">${escaparHtmlComparacion(titulo)}</span>
            <div class="file-compare-name">
                <i class="fa-solid fa-file-excel"></i>
                <strong>${escaparHtmlComparacion(nombre || 'Excel file')}</strong>
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
        ? 'No change'
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
            titulo: 'No previous file exists',
            texto: 'Review the selected file and confirm that you want to use it.'
        },
        igual: {
            etiqueta: 'NO CHANGES',
            titulo: 'The content is the same',
            texto: 'Another copy will not be saved. You can continue with this file.'
        },
        actualizado: {
            etiqueta: 'DIFFERENT FILE',
            titulo: 'Changes found',
            texto: 'Review the differences and confirm whether you want to replace the previous reference.'
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
        'Latest file used',
        referencia?.nombreOriginal,
        resumenAnterior,
        referencia ? formatearFechaReferencia(referencia.fecha) : '',
        !referencia
    )}
                <div class="file-comparison-arrow" aria-hidden="true">
                    <i class="fa-solid fa-arrow-right"></i>
                </div>
                ${tarjetaArchivoComparacion(
        'Selected file',
        file.name,
        analisis.resumen,
        'Selected now'
    )}
            </div>

            ${puedeMostrarCambios ? `
                <div class="file-comparison-changes">
                    <h4>Difference summary</h4>
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
                    <span>The previous file belongs to the old system. Its full contents were compared, but no sheet or row summary is available.</span>
                </div>
            ` : ''}
        </div>
    `;
}

function abrirVentanaComparacion(
    html,
    textoConfirmar,
    titulo = 'Reconciliation comparison',
    subtitulo = 'Review differences before continuing.',
    opciones = {}
) {
    const dialog = document.getElementById('fileComparisonDialog');
    const content = document.getElementById('fileComparisonContent');
    const confirmButton = document.getElementById('fileComparisonConfirm');
    const cancelButton = document.getElementById('fileComparisonCancel');
    const closeButton = document.getElementById('fileComparisonClose');
    const titleElement = document.getElementById('fileComparisonTitle');
    const subtitleElement = dialog?.querySelector('.file-comparison-window-header p');
    const helpElement = document.getElementById('fileComparisonHelpText');

    if (!dialog || !content || !confirmButton || !cancelButton || !closeButton) {
        return Promise.resolve(false);
    }

    content.innerHTML = html;
    confirmButton.textContent = textoConfirmar;
    cancelButton.hidden = Boolean(opciones.ocultarCancel);
    dialog.dataset.size = opciones.compacto ? 'compacto' : 'amplio';
    if (titleElement) titleElement.textContent = titulo;
    if (subtitleElement) subtitleElement.textContent = subtitulo;
    if (helpElement) {
        helpElement.textContent = opciones.textoAyuda ||
            'Reconciliation will not continue until you confirm the file.';
    }

    return new Promise(resolve => {
        let resuelta = false;

        const finalizar = confirmada => {
            if (resuelta) return;
            resuelta = true;
            confirmButton.removeEventListener('click', confirmar);
            cancelButton.removeEventListener('click', cancelar);
            closeButton.removeEventListener('click', cancelar);
            dialog.removeEventListener('cancel', cancelarConEscape);
            cancelButton.hidden = false;
            delete dialog.dataset.size;
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
    const inputId = inputIdPorTipoReview(tipo);
    const select = document.getElementById('selectRestaurant');
    const restauranteId = select?.value;
    const codigo = select?.selectedOptions?.[0]?.dataset?.codigo;

    if (!restauranteId || !codigo) {
        await Swal.fire({
            icon: 'warning',
            title: 'Select the restaurant',
            text: 'Choose the restaurant before uploading the file.'
        });
        return false;
    }

    setUploadCardStatus(inputId, 'checking', 'Preparing comparison...');
    setComparisonCardStatus(
        inputId,
        'comprobando',
        'Reviewing file',
        'Reading sheets, rows, and content'
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
                ? 'Use new file'
                : 'Use this file'
        );

        if (!decision) {
            delete comparacionActualPorTipo[tipo];
            setUploadCardStatus(inputId);
            return false;
        }

        if (estado !== 'igual') {
            setUploadCardStatus(inputId, 'checking', 'Saving reference file...');

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
                ? 'File verified'
                : estado === 'actualizado'
                    ? 'New file approved'
                    : 'Initial file approved',
            estado === 'igual'
                ? 'Matches the latest file used'
                : `${detalleResumenComparacion(analisis.resumen)} / Ready to process`
        );
        return true;
    } catch (error) {
        console.error('Error comparing file:', error);
        const decision = await Swal.fire({
            icon: 'warning',
            title: 'Could not compare',
            text: 'You can choose another file or continue without comparing it.',
            showCancelButton: true,
            confirmButtonText: 'Usar sin comparar',
            cancelButtonText: 'Choose another file'
        });

        if (!decision.isConfirmed) {
            setUploadCardStatus(inputId);
            return false;
        }

        setComparisonCardStatus(
            inputId,
            'aviso',
            'Used without comparison',
            'The previous file could not be loaded'
        );
        return true;
    }
}

function resetSelectFecha(selectId, texto = 'All dates') {
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
        selectedSalesDate = null;
        limpiarBaseConciliacionTacoBellGuardada();

        const input =
            document.getElementById('salesFile');

        if (input) input.value = '';

        resetSelectFecha(
            'salesDateFilter',
            'All dates'
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
        selectedSalesDetailDate = '';

        const input =
            document.getElementById('salesDetailFile');

        if (input) input.value = '';

        resetSelectFecha(
            'salesDetailDateFilter',
            'All dates'
        );

        setUploadCardStatus('salesDetailFile');
    }

    if (tipo === 'ebt') {
        delete revisionActualPorTipo.ebt;
        delete comparacionActualPorTipo.ebt;
        ebtFile = null;
        ebtWorkbook = null;
        ebtPorStore = {};
        selectedEbtDate = '';

        const input =
            document.getElementById('ebtFile');

        if (input) input.value = '';

        resetSelectFecha(
            'ebtDateFilter',
            'All dates'
        );

        selectedServerEbtId = '';

        const savedEbtSelect =
            document.getElementById('savedEbtFileSelect');

        if (savedEbtSelect) {
            savedEbtSelect.value = '';
        }

        setUploadCardStatus('ebtFile');

        if (tbSavedReconciliationBase?.datosOriginales?.length) {
            recalcularTacoBellGuardadaConEbtSiAplica();
            return;
        }
    }

    if (
        salesWorkbook &&
        currentRestaurantConfig
    ) {
        generarConciliacionDesdeTemplate();
    }
}

function limpiarFilesExtraTacoBell() {
    delete revisionActualPorTipo.salesDetail;
    delete revisionActualPorTipo.ebt;
    delete comparacionActualPorTipo.salesDetail;
    delete comparacionActualPorTipo.ebt;
    salesDetailFile = null;
    salesDetailWorkbook = null;
    salesDetailRows = [];
    selectedSalesDetailDate = '';

    ebtFile = null;
    ebtWorkbook = null;
    ebtPorStore = {};
    selectedEbtDate = '';
    selectedServerEbtId = '';

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

    const savedEbtSelect =
        document.getElementById('savedEbtFileSelect');

    if (savedEbtSelect) {
        savedEbtSelect.value = '';
    }

    resetSelectFecha(
        'salesDetailDateFilter',
        'All dates'
    );

    resetSelectFecha(
        'ebtDateFilter',
        'All dates'
    );

    setUploadCardStatus('salesDetailFile');
    setUploadCardStatus('ebtFile');
    limpiarBaseConciliacionTacoBellGuardada();
}

function actualizarUploadsPorRestaurant(codigo) {
    const mostrarExtras =
        codigo === 'taco-bell';
    const badge =
        document.getElementById('uploadModeBadge');

    document
        .querySelectorAll('.taco-bell-extra-upload, .taco-bell-extra-control')
        .forEach(card => {
            card.style.display = mostrarExtras ? '' : 'none';
        });

    if (badge) {
        const texto =
            codigo === 'taco-bell'
                ? 'Taco Bell: 3 files + Tax Rate'
                : codigo === 'popeyes'
                    ? 'Popeyes: 1 file + Tax Rate'
                    : codigo === 'burger-king'
                        ? 'Burger King: 1 file + Tax Rate'
                        : 'Select restaurant';

        badge.textContent = texto;
        badge.dataset.mode = codigo || 'empty';
    }

    if (!mostrarExtras) {
        limpiarFilesExtraTacoBell();
    }
}


document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return;
    }

    await cargarRestaurants();

    actualizarUploadsPorRestaurant('');

    const urlParams = new URLSearchParams(window.location.search);
    const restauranteId = urlParams.get('restaurante');
    if (restauranteId) {
        document.getElementById('selectRestaurant').value = restauranteId;
        await onRestaurantChange();
    }

    initEventListeners();
});

function initEventListeners() {

    const restauranteSelect =
        document.getElementById(
            'selectRestaurant'
        );

    if (restauranteSelect) {

        restauranteSelect.addEventListener(
            'change',
            onRestaurantChange
        );

    }

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
                limpiarBaseConciliacionTacoBellGuardada();

                try {

                    const buffer =
                        await file.arrayBuffer();

                    const codigo =
                        document
                            .getElementById('selectRestaurant')
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
                                'Unsupported file',
                                'This file is protected or uses an unsupported format.',
                                'error'
                            );

                            setUploadCardStatus(
                                'salesFile',
                                'error',
                                'Protected file or unsupported format'
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


                    const headersRequireds =
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
                            headersRequireds,
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
                        `${file.name} loaded (${salesRows.length} rows)${textoComparacionActual('sales')}`
                    );

                    generarConciliacionDesdeTemplate();

                } catch (error) {

                    console.error(error);

                    setUploadCardStatus(
                        'salesFile',
                        'error',
                        'The file could not be read'
                    );

                    Swal.fire(
                        'Error',
                        'The Sales file could not be read',
                        'error'
                    );

                }

            }
        );

    }

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
                            'No valid rows were found'
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
                                typeof claveStoreTacoBell === 'function'
                                    ? claveStoreTacoBell(row.Store)
                                    : String(row.Store || '')
                            )
                            .filter(Boolean)
                    );

                    const tiendasDetalle = new Set(
                        salesDetailRows
                            .map(row =>
                                typeof claveStoreTacoBell === 'function'
                                    ? claveStoreTacoBell(row['Store Number'])
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
                        `${file.name} loaded (${salesDetailRows.length} rows, ${tiendasNuevas} new stores)${textoComparacionActual('salesDetail')}`
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
                        error.message || 'The file could not be read'
                    );

                    Swal.fire(
                        'Error',
                        error.message || 'The Sales Detail Export could not be read',
                        'error'
                    );

                }

            }
        );

    }
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

                try {
                    await cargarEbtDesdeArchivo(
                        file,
                        {
                            origen: 'local'
                        }
                    );
                } catch (error) {
                    console.error(error);

                    ebtFile = null;
                    ebtWorkbook = null;
                    ebtPorStore = {};
                    selectedServerEbtId = '';

                    setUploadCardStatus(
                        'ebtFile',
                        'error',
                        error.message || 'The EBT file could not be read'
                    );

                    Swal.fire(
                        'Error',
                        error.message || 'The EBT file could not be read',
                        'error'
                    );
                }

            }
        );

    }

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
        .getElementById('btnUploadEbtOnly')
        ?.addEventListener(
            'click',
            subirEbtIndependiente
        );

    document
        .getElementById('btnRefreshEbtFiles')
        ?.addEventListener(
            'click',
            () => cargarFilesEbtGuardados()
        );

    document
        .getElementById('savedEbtFileSelect')
        ?.addEventListener(
            'change',
            loadSelectedSavedEbt
        );

    document
        .getElementById('btnRefreshTbReconciliations')
        ?.addEventListener(
            'click',
            () => cargarConciliacionesTacoBellGuardadas()
        );

    document
        .getElementById('btnLoadTbReconciliation')
        ?.addEventListener(
            'click',
            cargarConciliacionTacoBellSeleccionada
        );

    document
        .getElementById('savedTbReconciliationSelect')
        ?.addEventListener(
            'change',
            event => {
                if (event.target.value) {
                    cargarConciliacionTacoBellSeleccionada();
                }
            }
        );

    document
        .getElementById(
            'btnSave'
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

                selectedEbtDate =
                    e.target.value;

                procesarEBT();

                if (recalcularTacoBellGuardadaConEbtSiAplica()) {
                    return;
                }

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

                selectedSalesDetailDate =
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

    document
        .getElementById('btnCompararConciliacion')
        ?.addEventListener('click', ejecutarComparacionManual);

}


async function cargarRestaurants() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${window.API_URL}/restaurantes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            restaurantes = data.restaurantes || data;
            renderRestaurants();
        }
    } catch (error) {
        console.log(restaurantes);
        console.error('Error loading restaurants:', error);
        Swal.fire('Error', 'Restaurants could not be loaded', 'error');
    }
}

function renderRestaurants() {

    const select =
        document.getElementById(
            'selectRestaurant'
        );

    select.innerHTML =
        '<option value="">Select a restaurant...</option>';

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
        console.error('Error loading templates:', error);
    }
}

function renderTemplates() {
    const select = document.getElementById('selectTemplate');
    select.disabled = templates.length === 0;

    if (templates.length === 0) {
        select.innerHTML = '<option value="">No templates available</option>';
        return;
    }

    select.innerHTML = '<option value="">Select a template...</option>';
    templates.forEach(t => {
        const defaultLabel = t.es_default ? ' (Default)' : '';
        select.innerHTML += `<option value="${t.id}" ${t.es_default ? 'selected' : ''}>${t.nombre}${defaultLabel}</option>`;
    });

    // Select the default template automatically when one exists.
    const defaultTemplate = templates.find(t => t.es_default);
    if (defaultTemplate) {
        select.value = defaultTemplate.id;
        onTemplateChange();
    }
}


async function cargarValoresEsperados() {
    const restauranteId = document.getElementById('selectRestaurant').value;
    const fecha = obtenerFechaConciliacionBD();

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
        console.error('Error loading expected values:', error);
    }
}


async function onRestaurantChange() {

    const select =
        document.getElementById(
            'selectRestaurant'
        );

    const restauranteId =
        select.value;

    const codigo =
        select.selectedOptions[0]
            ?.dataset?.codigo;

    if (
        codigoRestaurantCargado &&
        codigo !== codigoRestaurantCargado
    ) {
        removerArchivo();
    }

    codigoRestaurantCargado = codigo || '';

    currentRestaurantConfig =
        window.RestaurantConfigs?.[
        codigo
        ] || null;

    actualizarUploadsPorRestaurant(codigo);

    await cargarFilesEbtGuardados();
    await cargarConciliacionesTacoBellGuardadas();

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

    if (typeof actualizarPanelTaxBurgerKing === 'function') {
        actualizarPanelTaxBurgerKing(codigo);
    }

    if (typeof actualizarPanelTaxTacoBell === 'function') {
        actualizarPanelTaxTacoBell(codigo);
    }

    if (typeof actualizarPanelTaxPopeyes === 'function') {
        actualizarPanelTaxPopeyes(codigo);
    }

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
            '<option value="">Select a restaurant first</option>';

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
            'The file could not be read',
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

    // Copy user sheets.
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
    invalidarComparacionConciliacion();
    salesRows = [];
    salesDetailRows = [];
    ebtPorStore = {};
    selectedEbtDate = '';
    selectedSalesDetailDate = '';
    selectedServerEbtId = '';
    limpiarBaseConciliacionTacoBellGuardada();

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

    const savedEbtSelect =
        document.getElementById('savedEbtFileSelect');

    if (savedEbtSelect) {
        savedEbtSelect.value = '';
    }
}

function extraerDatos() {
    if (!workbook || !templateActual) return;

    datosExtraidos = [];
    if (currentRestaurantConfig) {

        console.log(
            'Generating reconciliation from configuration'
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
                `Sheet "${config.hoja}" was not found in the file`,
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
                'The Conciliation sheet was not found'
            );
        }

        const conciliationRows =
            XLSX.utils.sheet_to_json(
                conciliationSheet,
                { defval: 0 }
            );

        console.log(
            'Reconciliation rows:',
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
            'No configuration exists for the selected restaurant',
            'error'
        );

        return;
    }

    const codigo =
        document.getElementById(
            'selectRestaurant'
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
                `Restaurant no configurado: ${codigo}`,
                'error'
            );

    }

}


function obtenerCodigoRestaurantActual() {
    return document
        .getElementById('selectRestaurant')
        ?.selectedOptions?.[0]
        ?.dataset?.codigo || '';
}

function esColumnaOS(columna) {
    const codigo = obtenerCodigoRestaurantActual();
    const claveOriginal = String(columna?.key || '');
    const etiquetaOriginal = String(columna?.label || '').trim();

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
    const codigo = obtenerCodigoRestaurantActual();
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
        'totalConcepts'
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
            ? 'With differences'
            : 'No differences';
    }

    if (statusMeta) {
        statusMeta.textContent = hayDiferenciasOS
            ? `${diferenciasOS} store${diferenciasOS === 1 ? '' : 's'} with O/S`
            : 'O/S balanceado';
    }

    if (statusIcon) {
        statusIcon.className = hayDiferenciasOS
            ? 'fa-solid fa-triangle-exclamation'
            : 'fa-solid fa-scale-balanced';
    }
}


function abrirModalEdit(index) {
    editandoIndex = index;
    const dato = datosExtraidos[index];

    document.getElementById('editConcepto').value = dato.concepto;
    document.getElementById('editValorExcel').value = formatMoney(dato.valorExcel);
    document.getElementById('editValorEsperado').value = dato.valorEsperado;

    document.getElementById('modalEditValor').classList.add('active');
}

function cerrarModalEdit() {
    document.getElementById('modalEditValor').classList.remove('active');
    editandoIndex = -1;
}

function guardarValorEsperado() {
    if (editandoIndex < 0) return;

    const nuevoValor = parseFloat(document.getElementById('editValorEsperado').value) || 0;
    datosExtraidos[editandoIndex].valorEsperado = nuevoValor;
    datosExtraidos[editandoIndex].diferencia = datosExtraidos[editandoIndex].valorExcel - nuevoValor;
    invalidarComparacionConciliacion();

    // Refresh en memoria de valores esperados
    const concepto = datosExtraidos[editandoIndex].concepto;
    valoresEsperados[concepto] = { valor: nuevoValor, fuente: 'manual' };

    cerrarModalEdit();
    renderTablaSucursales();
    actualizarResumen();
}

async function abrirHistorial() {
    document.getElementById('modalHistorial').classList.add('active');

    try {
        const token = localStorage.getItem('token');
        const restauranteId = document.getElementById('selectRestaurant').value;

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
        console.error('Error loading history:', error);
    }
}

function renderHistorial(conciliaciones) {
    const tbody = document.getElementById('historialBody');

    if (conciliaciones.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center" style="padding: 40px; color: var(--gray-500);">
                    No reconciliations registered
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
                    <button class="action-btn view" onclick="verConciliacion(${c.id})" title="View detail">
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
    // Load and show an existing reconciliation.
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${window.API_URL}/conciliaciones/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const c = data.conciliacion;

            // Set values.
            document.getElementById('selectRestaurant').value = c.restaurante_id;
            await cargarTemplates(c.restaurante_id);
            document.getElementById('selectTemplate').value = c.template_id;
            fechaConciliacionActual = c.fecha_conciliacion
                ? String(c.fecha_conciliacion).split('T')[0]
                : null;
            document.getElementById('notasConciliacion').value = c.notas || '';

            templateActual = templates.find(t => t.id == c.template_id);
            datosExtraidos = c.datos_extraidos;

            // Show results.
            document.getElementById('resultsSection').style.display = 'block';
            document.getElementById('dropZone').style.display = 'none';
            document.getElementById('fileLoaded').style.display = 'none';

            renderTablaSucursales();
            actualizarResumen();
            cerrarModalHistorial();
        }
    } catch (error) {
        console.error('Error loading reconciliation:', error);
    }
}

function exportarPDF() {
    // Basic implementation with window.print.
    const restaurante = document.getElementById('selectRestaurant').selectedOptions[0]?.text || '';
    const fecha = obtenerFechaConciliacionBD() || obtenerFechaParaNombreArchivo();

    const printContent = `
        <html>
        <head>
            <title>Reconciliation - ${restaurante} - ${fecha}</title>
            <style>
                body { font-family: Inter, sans-serif; padding: 20px; }
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
            <h1>Reconciliation Report</h1>
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
    encabezadosRequireds = [],
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
        encabezadosRequireds.map(
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
            .getElementById('selectRestaurant')
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
            'No columns configured',
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
                    tr.title = 'This store has an O/S difference';
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

    if (selectedEbtDate) {

        fechaTexto =
            normalizarFecha(
                selectedEbtDate
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

    ebtPorStore = {};

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

        ebtPorStore[store] =
            (ebtPorStore[store] || 0)
            + amount;

    });

}

function obtenerEBTPorStore(
    store
) {

    return (
        ebtPorStore[
        Number(store)
        ] || 0
    );

}



document
    .getElementById('salesDateFilter')
    ?.addEventListener('change', async e => {
        selectedSalesDate = e.target.value;
        fechaConciliacionActual = e.target.value;

        invalidarComparacionConciliacion();

        await cargarValoresEsperados();

        generarConciliacionDesdeTemplate();

        // Mantiene visible la fecha después de recalcular
        setTimeout(() => {
            const select = document.getElementById('salesDateFilter');
            if (select && selectedSalesDate) {
                select.value = selectedSalesDate;
            }
        }, 0);
    });

function getSelectedFilterDate(selectId) {
    if (selectId === 'salesDateFilter') {
        return selectedSalesDate || '';
    }

    if (selectId === 'salesDetailDateFilter') {
        return selectedSalesDetailDate || '';
    }

    if (selectId === 'ebtDateFilter') {
        return selectedEbtDate || '';
    }

    return '';
}

function saveSelectedFilterDate(selectId, fecha) {
    if (selectId === 'salesDateFilter') {
        selectedSalesDate = fecha;
    }

    if (selectId === 'salesDetailDateFilter') {
        selectedSalesDetailDate = fecha;
    }

    if (selectId === 'ebtDateFilter') {
        selectedEbtDate = fecha;
    }
}

function cargarFechasEnFiltro(
    rows,
    selectId,
    campoFecha = 'Date'
) {
    const select = document.getElementById(selectId);

    if (!select) return;

    const fechaAnterior =
        select.value ||
        getSelectedFilterDate(selectId) ||
        '';

    const fechaAnteriorNormalizada =
        fechaAnterior && typeof normalizarFecha === 'function'
            ? normalizarFecha(fechaAnterior)
            : fechaAnterior;

    const fechas = [
        ...new Set(
            rows
                .map(row =>
                    typeof normalizarFecha === 'function'
                        ? normalizarFecha(row[campoFecha])
                        : row[campoFecha]
                )
                .filter(Boolean)
        )
    ];

    fechas.sort((a, b) => {
        const fechaA = new Date(a);
        const fechaB = new Date(b);
        return fechaB - fechaA;
    });

    select.innerHTML = '';

    const optionDefault = document.createElement('option');
    optionDefault.value = '';
    optionDefault.textContent = 'Select date';
    select.appendChild(optionDefault);

    let fechaEncontrada = '';

    fechas.forEach(fecha => {
        const option = document.createElement('option');
        option.value = fecha;
        option.textContent = fecha;

        const fechaNormalizada =
            typeof normalizarFecha === 'function'
                ? normalizarFecha(fecha)
                : fecha;

        if (
            fechaAnteriorNormalizada &&
            fechaNormalizada === fechaAnteriorNormalizada
        ) {
            option.selected = true;
            fechaEncontrada = fecha;
        }

        select.appendChild(option);
    });

    if (fechaEncontrada) {
        select.value = fechaEncontrada;
        saveSelectedFilterDate(selectId, fechaEncontrada);
    }
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

function cargarFiltroStores() {

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
        '<option value="">All stores</option>';

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
function llenarFiltroStores() {

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
        '<option value="">All stores</option>';

    tiendas.forEach(store => {

        select.innerHTML += `
            <option value="${store}">
                ${store}
            </option>
        `;
    });
}

function obtenerFechaParaNombreArchivo() {
    const valor =
        fechaConciliacionActual ||
        datosExtraidos[0]?.date ||
        '';

    const texto = String(valor).trim();

    // Si ya viene como YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
        return texto.slice(0, 10);
    }

    // Si viene como MM/DD/YYYY
    const fechaUsa = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (fechaUsa) {
        return `${fechaUsa[3]}-${fechaUsa[1].padStart(2, '0')}-${fechaUsa[2].padStart(2, '0')}`;
    }

    // Si viene como objeto Date o texto convertible a fecha
    const fecha = new Date(valor);
    if (!Number.isNaN(fecha.getTime())) {
        return [
            fecha.getFullYear(),
            String(fecha.getMonth() + 1).padStart(2, '0'),
            String(fecha.getDate()).padStart(2, '0')
        ].join('-');
    }

    // Respaldo si no encuentra fecha válida
    const hoy = new Date();
    return [
        hoy.getFullYear(),
        String(hoy.getMonth() + 1).padStart(2, '0'),
        String(hoy.getDate()).padStart(2, '0')
    ].join('-');
}

function construirNombreArchivo(tipoArchivo, extension) {
    const select = document.getElementById('selectRestaurant');
    const option = select?.selectedOptions?.[0];
    const codigo = option?.dataset?.codigo || '';

    const nombres = {
        'taco-bell': 'Daily_Sales_Taco_Bell',
        'burger-king': 'Daily_Sales_Burger_King',
        'popeyes': 'Daily_Sales_Popeyes'
    };

    const restaurante = nombres[codigo] || String(option?.textContent || 'Restaurant')
        .trim()
        .replace(/\s+-\s+.*$/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    const fechaGuardado = obtenerFechaParaNombreArchivo();

    const tipo = String(tipoArchivo || 'Reconciliation')
        .replace(/Taco\s*Bell|Burger\s*King|Popeyes/gi, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'Reconciliation';

    return `${restaurante}_${fechaGuardado}_${tipo}.${extension}`;
}

function obtenerFechaConciliacionBD() {
    const valor =
        fechaConciliacionActual ||
        datosExtraidos[0]?.date ||
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
    const codigo = obtenerCodigoRestaurantActual();
    const nombreRestaurant = {
        'taco-bell': 'Taco Bell',
        popeyes: 'Popeyes',
        'burger-king': 'Burger King'
    }[codigo] || codigo;
    const filas = resultado.diferencias.flatMap(diferencia => {
        if (diferencia.tipo === 'tienda_nueva') {
            return [{
                tienda: diferencia.tienda,
                concepto: 'New store in the file',
                anterior: '—',
                nuevo: 'Incluida',
                diferencia: 'Nueva'
            }];
        }

        if (diferencia.tipo === 'tienda_eliminada') {
            return [{
                tienda: diferencia.tienda,
                concepto: 'Store not included in the new file',
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
                <span>DIFFERENCES</span>
                <strong>${escaparHtmlComparacion(nombreRestaurant)} / ${escaparHtmlComparacion(obtenerFechaConciliacionBD())}</strong>
                <p>A reconciliation already exists for this date and some amounts changed.</p>
            </div>

            <div class="reconciliation-comparison-summary">
                <div><strong>${resultado.tiendasComparadas}</strong><span>Compared stores</span></div>
                <div><strong>${resultado.tiendasConDiferencias}</strong><span>Stores with changes</span></div>
                <div><strong>${filas.length}</strong><span>Different amounts</span></div>
            </div>

            <div class="reconciliation-reading-guide">
                <div><span>PREVIOUS</span><p>Amount from the saved reconciliation.</p></div>
                <i class="fa-solid fa-arrow-right"></i>
                <div><span>NEW</span><p>Amount from the file you just processed.</p></div>
                <i class="fa-solid fa-equals"></i>
                <div><span>DIFFERENCE</span><p>Change that will be recorded if you continue.</p></div>
            </div>

            <div class="reconciliation-diff-wrapper">
                <table class="reconciliation-diff-table">
                    <thead>
                        <tr>
                            <th>Store</th>
                            <th>Concept</th>
                            <th>Previous</th>
                            <th>New</th>
                            <th>Difference</th>
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
            ? `<p class="reconciliation-diff-more">Showing 250 of ${filas.length} differences.</p>`
            : ''}
        </div>
    `;
}

function invalidarComparacionConciliacion() {
    comparacionConciliacionActual = {
        clave: '',
        resultado: null,
        aprobada: true
    };
    actualizarPanelComparacion(
        'pendiente',
        'Compare before saving',
        'The system will review the same restaurant, store, and date against the latest saved reconciliation.'
    );
}

function actualizarPanelComparacion(estado, titulo, detalle) {
    const panel = document.getElementById('conciliationComparisonPanel');
    const icon = document.getElementById('conciliationComparisonIcon');
    const title = document.getElementById('conciliationComparisonTitle');
    const text = document.getElementById('conciliationComparisonText');
    const button = document.getElementById('btnCompararConciliacion');
    const iconos = {
        pendiente: 'fa-code-compare',
        cargando: 'fa-spinner fa-spin',
        igual: 'fa-circle-check',
        cambios: 'fa-triangle-exclamation',
        primera: 'fa-file-circle-plus',
        error: 'fa-circle-xmark'
    };

    if (panel) panel.dataset.state = estado;
    if (icon) icon.className = `fa-solid ${iconos[estado] || iconos.pendiente}`;
    if (title) title.textContent = titulo;
    if (text) text.textContent = detalle;
    if (button && estado !== 'cargando') {
        button.innerHTML = estado === 'pendiente' || estado === 'pending'
            ? '<i class="fa-solid fa-magnifying-glass-chart"></i> Compare now'
            : '<i class="fa-solid fa-eye"></i> View result';
    }
}

function crearVistaResumenComparacionConciliacion(resultado) {
    const codigo = obtenerCodigoRestaurantActual();
    const restaurante = {
        'taco-bell': 'Taco Bell',
        popeyes: 'Popeyes',
        'burger-king': 'Burger King'
    }[codigo] || codigo;
    const esIncompatible = Boolean(resultado.referenciaIncompatible);
    const esPrimera = !resultado.existe;
    const configuracion = esIncompatible
        ? {
            estado: 'actualizado',
            etiqueta: 'INCOMPATIBLE REFERENCE',
            titulo: 'The previous file has no comparable data',
            texto: 'The current reconciliation will be kept as a new reference for future comparisons.',
            icono: 'fa-triangle-exclamation'
        }
        : esPrimera
            ? {
                estado: 'actualizado',
                etiqueta: 'FIRST COMPARISON',
                titulo: 'No previous reconciliation exists for this date',
                texto: 'There are no previous amounts to compare against. You can continue normally.',
                icono: 'fa-file-circle-plus'
            }
            : {
                estado: 'igual',
                etiqueta: 'NO DIFFERENCES',
                titulo: 'Amounts match the saved reconciliation',
                texto: 'All configured stores and concepts for this restaurant were reviewed.',
                icono: 'fa-circle-check'
            };

    return `
        <div class="file-comparison-view reconciliation-comparison" data-result="${configuracion.estado}">
            <div class="file-comparison-result">
                <span>${configuracion.etiqueta}</span>
                <strong><i class="fa-solid ${configuracion.icono}"></i> ${configuracion.titulo}</strong>
                <p>${configuracion.texto}</p>
            </div>
            <div class="reconciliation-comparison-context">
                <div><span>Restaurant</span><strong>${escaparHtmlComparacion(restaurante)}</strong></div>
                <i class="fa-solid fa-arrow-right"></i>
                <div><span>Operating date</span><strong>${escaparHtmlComparacion(obtenerFechaConciliacionBD())}</strong></div>
            </div>
            <div class="reconciliation-comparison-summary">
                <div><strong>${Number(resultado.tiendasComparadas || datosExtraidos.length)}</strong><span>Reviewed stores</span></div>
                <div><strong>${Number(resultado.tiendasConDiferencias || 0)}</strong><span>Stores with changes</span></div>
                <div><strong>0</strong><span>Different amounts</span></div>
            </div>
            <div class="reconciliation-comparison-next-step">
                <i class="fa-solid fa-circle-info"></i>
                <div>
                    <strong>${esPrimera ? 'What is next?' : 'Result verified'}</strong>
                    <p>${esPrimera
            ? 'Save this reconciliation to use it as the reference the next time you process the same date.'
            : 'You can close this window and continue; the query was already recorded in history.'}</p>
                </div>
            </div>
        </div>`;
}

async function consultarComparacionConciliacion() {
    const token = localStorage.getItem('token');
    const restauranteId = document.getElementById('selectRestaurant')?.value;
    const fecha = obtenerFechaConciliacionBD();

    if (!token) throw new Error('The session is not available');
    if (!restauranteId) throw new Error('Select a restaurant');
    if (!fecha) throw new Error('Select the reconciliation date');
    if (!datosExtraidos.length) throw new Error('Generate the reconciliation first to get the amounts');

    const huella = await hashTextoReview(JSON.stringify(datosExtraidos));
    const clave = `${restauranteId}:${fecha}:${huella.slice(0, 16)}`;
    if (
        comparacionConciliacionActual.clave === clave &&
        comparacionConciliacionActual.resultado
    ) {
        return comparacionConciliacionActual.resultado;
    }

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
        throw new Error(resultado.message || resultado.mensaje || 'The reconciliation could not be compared');
    }

    comparacionConciliacionActual = {
        clave,
        resultado,
        aprobada: !resultado.tiendasConDiferencias
    };
    return resultado;
}

async function ejecutarComparacionManual() {
    const button = document.getElementById('btnCompararConciliacion');
    if (localStorage.getItem('modoOffline') === 'true') {
        await Swal.fire({
            icon: 'info',
            title: 'Comparison available online',
            text: 'The system needs to query the latest reconciliation saved on the server.'
        });
        return;
    }

    try {
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Comparing';
        }
        actualizarPanelComparacion(
            'cargando',
            'Comparing store by store',
            'Looking for the saved reconciliation for the same restaurant and date...'
        );
        const resultado = await consultarComparacionConciliacion();
        const tieneCambios = Number(resultado.tiendasConDiferencias || 0) > 0;

        if (tieneCambios) {
            actualizarPanelComparacion(
                'cambios',
                'Differences found',
                `${resultado.tiendasConDiferencias} store(s) have different amounts. Open the result to review them.`
            );
        } else if (resultado.referenciaIncompatible) {
            actualizarPanelComparacion(
                'error',
                'The previous reference is not compatible',
                'The saved file does not contain the internal sheet needed to compare amounts.'
            );
        } else if (!resultado.existe) {
            actualizarPanelComparacion(
                'primera',
                'This is the first reconciliation for the date',
                'No previous reference exists; the result will be available for the next review.'
            );
        } else {
            actualizarPanelComparacion(
                'igual',
                'No differences found',
                `${resultado.tiendasComparadas} store(s) match the saved reconciliation.`
            );
        }

        await abrirVentanaComparacion(
            tieneCambios
                ? crearVistaDiferenciasConciliacion(resultado)
                : crearVistaResumenComparacionConciliacion(resultado),
            'Close result',
            'Comparison result',
            'Comparison by restaurant, store, and operating date.',
            {
                ocultarCancel: true,
                compacto: !tieneCambios,
                textoAyuda: 'This query does not modify or replace any file.'
            }
        );
    } catch (error) {
        console.error('Manual comparison error:', error);
        actualizarPanelComparacion('error', 'Could not compare', error.message);
        await Swal.fire({ icon: 'warning', title: 'Comparison unavailable', text: error.message });
    } finally {
        if (button) button.disabled = false;
    }
}

async function compararConciliacionConBD() {
    if (localStorage.getItem('modoOffline') === 'true') return true;

    try {
        const resultado = await consultarComparacionConciliacion();
        if (!resultado.tiendasConDiferencias) return true;
        if (comparacionConciliacionActual.aprobada) return true;

        const decision = await abrirVentanaComparacion(
            crearVistaDiferenciasConciliacion(resultado),
            'Continue with new data',
            'Confirm detected changes',
            'Review different stores and amounts before saving.'
        );
        comparacionConciliacionActual.aprobada = decision;
        return decision;
    } catch (error) {
        console.error('Error comparing reconciliation:', error);
        actualizarPanelComparacion('error', 'Could not compare', error.message);
        await Swal.fire({
            icon: 'error',
            title: 'Could not validate reconciliation',
            text: `${error.message}. No changes were saved.`
        });
        return false;
    }
}

async function registrarConciliacionEnBD() {
    const token = localStorage.getItem('token');
    const restauranteId = document.getElementById('selectRestaurant')?.value;
    const templateId = document.getElementById('selectTemplate')?.value;
    const fecha = obtenerFechaConciliacionBD();

    if (!token || !restauranteId || !templateId || !fecha) {
        throw new Error('Restaurant, template, or date is missing to register the reconciliation');
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
            comparacion_id: comparacionConciliacionActual.resultado?.comparacionId || null,
            notas: 'Generated from the reconciliation module'
        })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        console.error('ERROR BACKEND REGISTRO:', data);
        throw new Error(
            data.message ||
            data.mensaje ||
            'The reconciliation could not be registered'
        );
    }

    comparacionConciliacionActual = {
        clave: '',
        resultado: null,
        aprobada: true
    };
    return data;
}

async function saveConciliacion() {

    const permiteBaseGuardadaTacoBell =
        obtenerCodigoRestaurantActual() === 'taco-bell' &&
        tbSavedReconciliationBase?.datosOriginales?.length &&
        datosExtraidos.length;

    if (!workbook && !permiteBaseGuardadaTacoBell) {
        Swal.fire({
            icon: 'warning',
            title: 'No data',
            text: 'Upload a file first or load a saved Taco Bell reconciliation'
        });
        return;
    }

    if (!datosExtraidos.length) {
        await Swal.fire({
            icon: 'warning',
            title: 'No reconciliation',
            text: 'Generate the reconciliation first'
        });
        return;
    }

    const comparacionAprobada = await compararConciliacionConBD();

    if (!comparacionAprobada) return;

    Swal.fire({
        title: 'Save reconciliation',
        text: 'Where do you want to save the file?',
        icon: 'question',
        showCancelButton: true,
        showDenyButton: localStorage.getItem('modoOffline') !== 'true',
        confirmButtonText:
            '<i class="fa-solid fa-download"></i> Download',
        denyButtonText:
            '<i class="fa-solid fa-cloud-arrow-up"></i> Save to server',
        cancelButtonText: 'Cancel',
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
                    console.error('The reconciliation was not registered:', error);
                }
            }

            const workbookFinal =
                generarWorkbookConConciliacion();

            XLSX.writeFile(
                workbookFinal,
                construirNombreArchivo('Reconciliation', 'xlsx')
            );

            Swal.fire(errorRegistro
                ? {
                    icon: 'warning',
                    title: 'File downloaded',
                    text: `${errorRegistro.message}. The comparison will remain pending until it is registered on the server.`
                }
                : {
                    icon: 'success',
                    title: 'File downloaded and reconciliation registered',
                    text: registro?.id ? `Accounting record ID: ${registro.id}` : '',
                    timer: 1800,
                    showConfirmButton: false
                });

        } else if (result.isDenied) {

            await guardarConciliacionServidor();

        }
    });
}

function obtenerExtensionArchivo(nombre = '') {
    const partes = String(nombre).split('.');
    return partes.length > 1
        ? partes.pop().toLowerCase()
        : 'xlsx';
}

// INICIO CAMBIO EBT INDEPENDIENTE

function getSelectedEbtRestaurant() {
    const select = document.getElementById('selectRestaurant');
    const option = select?.selectedOptions?.[0];

    return {
        id: select?.value || '',
        codigo: option?.dataset?.codigo || '',
        nombre: String(option?.textContent || '').trim()
    };
}

function leerNotasArchivoEbt(doc) {
    try {
        return typeof doc?.notas === 'string'
            ? JSON.parse(doc.notas)
            : doc?.notas || {};
    } catch {
        return {};
    }
}

function normalizarFechaIsoEbt(valor) {
    if (!valor) return '';

    const texto = String(valor).trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
        return texto.slice(0, 10);
    }

    const fechaUsa = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (fechaUsa) {
        return `${fechaUsa[3]}-${fechaUsa[1].padStart(2, '0')}-${fechaUsa[2].padStart(2, '0')}`;
    }

    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return '';

    return [
        fecha.getFullYear(),
        String(fecha.getMonth() + 1).padStart(2, '0'),
        String(fecha.getDate()).padStart(2, '0')
    ].join('-');
}

function obtenerFechaEbtParaServidor(rows = []) {
    const selectedValue =
        selectedEbtDate ||
        document.getElementById('ebtDateFilter')?.value ||
        '';

    if (selectedValue) {
        return normalizarFechaIsoEbt(selectedValue);
    }

    const fechas = rows
        .map(row => normalizarFechaIsoEbt(normalizarFecha(row['Funded Date'])))
        .filter(Boolean)
        .sort((a, b) => new Date(b) - new Date(a));

    return fechas[0] || '';
}

function construirNombreArchivoEbtIndependiente(fecha, extension) {
    const restaurante = getSelectedEbtRestaurant();
    const nombres = {
        'taco-bell': 'Daily_Sales_Taco_Bell',
        'burger-king': 'Daily_Sales_Burger_King',
        'popeyes': 'Daily_Sales_Popeyes'
    };

    const nombreRestaurant = nombres[restaurante.codigo] || restaurante.nombre
        .replace(/\s+-\s+.*$/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'Restaurant';

    return `${nombreRestaurant}_${fecha}_EBT.${extension || 'xlsx'}`;
}

function esArchivoEbtGuardado(doc, restauranteCodigo) {
    const notas = leerNotasArchivoEbt(doc);
    const nombre = String(doc?.nombre_original || '');

    const mismoRestaurant =
        doc?.restaurante_codigo === restauranteCodigo ||
        doc?.codigo === restauranteCodigo ||
        String(doc?.restaurante || '').toLowerCase().includes(
            String(restauranteCodigo || '').replace('-', ' ').toLowerCase()
        );

    const esEbt =
        notas.tipoDocumento === 'ebt' ||
        notas.fuente === 'ebt' ||
        /_EBT\./i.test(nombre);

    const esArchivoOperativo =
        notas.tipo !== 'revision_fuente' &&
        notas.tipo !== 'referencia_comparacion';

    return mismoRestaurant && esEbt && esArchivoOperativo && doc.archivoExiste !== false;
}

function textoOptionEbtGuardado(doc) {
    const notas = leerNotasArchivoEbt(doc);
    const fecha =
        normalizarFechaIsoEbt(notas.fecha) ||
        normalizarFechaIsoEbt(notas.fecha_conciliacion) ||
        normalizarFechaIsoEbt(doc.periodo_fecha) ||
        'no date';

    const nombreOriginal =
        notas.nombreOriginal ||
        doc.nombre_original ||
        `File #${doc.id}`;

    return `${fecha} - ${nombreOriginal}`;
}

async function cargarFilesEbtGuardados(seleccionarId = '') {
    const select = document.getElementById('savedEbtFileSelect');
    if (!select) return;

    const token = localStorage.getItem('token');
    const restaurante = getSelectedEbtRestaurant();

    select.disabled = true;
    select.innerHTML = '<option value="">Select a saved EBT file...</option>';
    ebtDocumentosDisponibles = [];

    if (!token || !restaurante.codigo) {
        return;
    }

    try {
        const response = await fetch(`${window.API_URL}/archivos`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Saved EBT files could not be loaded');
        }

        const data = await response.json().catch(() => []);
        const archivos = Array.isArray(data) ? data : (data.archivos || []);

        ebtDocumentosDisponibles = archivos
            .filter(doc => esArchivoEbtGuardado(doc, restaurante.codigo))
            .sort((a, b) => {
                const fechaA = normalizarFechaIsoEbt(
                    leerNotasArchivoEbt(a).fecha || a.periodo_fecha
                );
                const fechaB = normalizarFechaIsoEbt(
                    leerNotasArchivoEbt(b).fecha || b.periodo_fecha
                );

                return (
                    new Date(fechaB || 0) - new Date(fechaA || 0) ||
                    Number(b.id) - Number(a.id)
                );
            });

        ebtDocumentosDisponibles.forEach(doc => {
            const option = document.createElement('option');
            option.value = String(doc.id);
            option.textContent = textoOptionEbtGuardado(doc);
            select.appendChild(option);
        });

        select.disabled = ebtDocumentosDisponibles.length === 0;

        if (seleccionarId) {
            select.value = String(seleccionarId);
            selectedServerEbtId = String(seleccionarId);
        }
    } catch (error) {
        console.error(error);
        select.innerHTML = '<option value="">Saved EBT files could not be loaded</option>';
    }
}

function extraerRowsEbtDesdeWorkbook(book) {
    const hoja = obtenerHojaPorNombre(
        book,
        [
            'Net Sales',
            'EBT AMOUNTS'
        ]
    );

    if (!hoja) {
        throw new Error('The Net Sales or EBT AMOUNTS sheet does not exist');
    }

    const rows = leerFilasExcel(
        hoja,
        ['Funded Date'],
        ''
    );

    if (!rows.length) {
        throw new Error('No valid rows were found in the EBT file');
    }

    return rows;
}

async function cargarEbtDesdeArchivo(file, opciones = {}) {
    const { origen = 'local', documento = null } = opciones;

    ebtFile = file;
    selectedServerEbtId =
        origen === 'servidor' && documento?.id
            ? String(documento.id)
            : '';

    if (origen !== 'servidor') {
        const select = document.getElementById('savedEbtFileSelect');
        if (select) select.value = '';
    }

    const buffer = await file.arrayBuffer();
    ebtWorkbook = XLSX.read(
        buffer,
        {
            type: 'array'
        }
    );

    const rows = extraerRowsEbtDesdeWorkbook(ebtWorkbook);

    cargarFechasEnFiltro(
        rows,
        'ebtDateFilter',
        'Funded Date'
    );

    setUploadCardStatus(
        'ebtFile',
        'loaded',
        `${file.name} loaded (${rows.length} rows)${origen === 'servidor' ? ' from documents' : ''}${textoComparacionActual('ebt')}`
    );

    procesarEBT();

    if (recalcularTacoBellGuardadaConEbtSiAplica()) {
        return rows;
    }

    if (salesWorkbook && currentRestaurantConfig) {
        generarConciliacionDesdeTemplate();
    }
    return rows;
}

async function loadSelectedSavedEbt() {
    const select = document.getElementById('savedEbtFileSelect');
    const id = select?.value || '';

    if (!id) {
        selectedServerEbtId = '';
        return;
    }

    const token = localStorage.getItem('token');
    const documento = ebtDocumentosDisponibles.find(doc => String(doc.id) === String(id));

    if (!token || !documento) {
        Swal.fire({
            icon: 'warning',
            title: 'EBT unavailable',
            text: 'Refresh the saved EBT file list and try again.'
        });
        return;
    }

    try {
        Swal.fire({
            title: 'Loading EBT...',
            text: 'Reading the saved file',
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
            throw new Error(data.message || 'The saved EBT file could not be downloaded');
        }

        const blob = await response.blob();
        const notas = leerNotasArchivoEbt(documento);
        const nombre =
            notas.nombreOriginal ||
            documento.nombre_original ||
            `EBT_${id}.xlsx`;

        let archivo;

        try {
            archivo = new File(
                [blob],
                nombre,
                {
                    type: blob.type || documento.tipo_mime || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                }
            );
        } catch {
            archivo = blob;
            archivo.name = nombre;
        }

        await cargarEbtDesdeArchivo(
            archivo,
            {
                origen: 'servidor',
                documento
            }
        );

        Swal.close();
    } catch (error) {
        console.error(error);
        setUploadCardStatus('ebtFile', 'error', error.message || 'The EBT file could not be loaded');
        Swal.fire({
            icon: 'error',
            title: 'The EBT file could not be loaded',
            text: error.message || 'Try another EBT file.'
        });
    }
}

function limpiarBaseConciliacionTacoBellGuardada() {
    tbSavedReconciliationBase = null;
    tbSavedReconciliationsDisponibles = [];

    const select = document.getElementById('savedTbReconciliationSelect');
    if (select) {
        select.disabled = true;
        select.value = '';
        select.innerHTML = '<option value="">Select a saved reconciliation...</option>';
    }
}

function obtenerNombreArchivoConciliacionGuardada(archivo = {}) {
    return String(
        archivo.nombre_original ||
        archivo.nombreOriginal ||
        archivo.nombre_servidor ||
        ''
    ).trim();
}

function obtenerFechaArchivoConciliacionGuardada(archivo = {}) {
    const notas = leerNotasConciliacion(archivo);
    const nombre = obtenerNombreArchivoConciliacionGuardada(archivo);
    const fechaEnNombre = nombre.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';

    return (
        normalizarFechaIsoEbt(notas.fecha) ||
        normalizarFechaIsoEbt(notas.fecha_conciliacion) ||
        normalizarFechaIsoEbt(archivo.periodo_fecha) ||
        normalizarFechaIsoEbt(fechaEnNombre) ||
        ''
    );
}

function esArchivoConciliacionTacoBellGuardado(archivo = {}, restaurante = {}) {
    const notas = leerNotasConciliacion(archivo);
    const nombre = obtenerNombreArchivoConciliacionGuardada(archivo);
    const codigo = restaurante.codigo || restaurante;
    const restauranteId = restaurante.id || '';

    const mismoRestaurant =
        String(archivo.restaurante_id || '') === String(restauranteId || '') ||
        archivo.restaurante_codigo === codigo ||
        archivo.codigo === codigo ||
        String(archivo.restaurante || '').toLowerCase().includes(
            String(codigo || '').replace('-', ' ').toLowerCase()
        );

    const esEbt =
        notas.tipoDocumento === 'ebt' ||
        notas.fuente === 'ebt' ||
        /_EBT\./i.test(nombre);

    const esConciliacion =
        notas.tipoDocumento === 'conciliacion' ||
        /_(Conciliacion|Reconciliation)\./i.test(nombre);

    return (
        mismoRestaurant &&
        esConciliacion &&
        !esEbt &&
        archivo.archivoExiste !== false
    );
}

function buscarConciliacionParaArchivoTacoBell(archivo, conciliaciones) {
    const notas = leerNotasConciliacion(archivo);
    const conciliacionId =
        notas.conciliacionId ||
        notas.conciliacion_id ||
        notas.conciliacionID ||
        notas.conciliacion;

    if (conciliacionId) {
        const porId = conciliaciones.find(item =>
            String(item.id) === String(conciliacionId)
        );

        if (porId) return porId;
    }

    const fechaArchivo = obtenerFechaArchivoConciliacionGuardada(archivo);

    return conciliaciones
        .filter(item => {
            const fechaConciliacion =
                normalizarFechaIsoEbt(item.fecha_conciliacion) ||
                normalizarFechaIsoEbt(item.periodo_inicio);

            return fechaConciliacion === fechaArchivo;
        })
        .sort((a, b) => Number(b.id) - Number(a.id))[0] || null;
}

async function cargarArchivosConciliacionTacoBellGuardados(token, restaurante) {
    try {
        const response = await fetch(`${window.API_URL}/archivos`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) return [];

        const data = await response.json().catch(() => []);
        const archivos = Array.isArray(data) ? data : (data.archivos || []);

        return archivos
            .filter(archivo =>
                esArchivoConciliacionTacoBellGuardado(archivo, restaurante)
            )
            .sort((a, b) => {
                const fechaA = obtenerFechaArchivoConciliacionGuardada(a);
                const fechaB = obtenerFechaArchivoConciliacionGuardada(b);

                return (
                    new Date(fechaB || 0) - new Date(fechaA || 0) ||
                    Number(b.id) - Number(a.id)
                );
            });
    } catch (error) {
        console.error('Saved Taco Bell reconciliation files could not be loaded:', error);
        return [];
    }
}

function textoOptionConciliacionTacoBellGuardada(conciliacion) {
    const fecha =
        obtenerFechaArchivoConciliacionGuardada(conciliacion.archivoConciliacion) ||
        normalizarFechaIsoEbt(conciliacion.fecha_conciliacion) ||
        'no date';

    const nombreArchivo =
        obtenerNombreArchivoConciliacionGuardada(conciliacion.archivoConciliacion) ||
        `Reconciliation #${conciliacion.id}`;

    return `${nombreArchivo} (${fecha})`;
}

async function cargarConciliacionesTacoBellGuardadas(seleccionarId = '') {
    const select = document.getElementById('savedTbReconciliationSelect');
    if (!select) return;


    const token = localStorage.getItem('token');
    const restaurante = getSelectedEbtRestaurant();

    select.disabled = true;
    select.innerHTML = '<option value="">Select a saved reconciliation...</option>';
    tbSavedReconciliationsDisponibles = [];

    if (!token || restaurante.codigo !== 'taco-bell' || !restaurante.id) {
        return;
    }

    try {
        const response = await fetch(
            `${window.API_URL}/conciliaciones?restaurante_id=${encodeURIComponent(restaurante.id)}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || 'Saved reconciliations could not be loaded');
        }

        const conciliaciones = (data.conciliaciones || [])
            .filter(item =>
                Array.isArray(item.datos_extraidos) &&
                item.datos_extraidos.length > 0
            )
            .sort((a, b) => {
                const fechaA = normalizarFechaIsoEbt(a.fecha_conciliacion);
                const fechaB = normalizarFechaIsoEbt(b.fecha_conciliacion);

                return (
                    new Date(fechaB || 0) - new Date(fechaA || 0) ||
                    Number(b.id) - Number(a.id)
                );
            });

        const archivosConciliacion =
            await cargarArchivosConciliacionTacoBellGuardados(token, restaurante);

        tbSavedReconciliationsDisponibles = archivosConciliacion
            .map(archivo => {
                const conciliacion =
                    buscarConciliacionParaArchivoTacoBell(archivo, conciliaciones);

                if (!conciliacion) return null;

                return {
                    ...conciliacion,
                    archivoConciliacion: archivo,
                    selectorValue: `${conciliacion.id}:${archivo.id || ''}`
                };
            })
            .filter(Boolean);

        if (!tbSavedReconciliationsDisponibles.length) {
            select.innerHTML = '<option value="">No saved Taco Bell reconciliation files found</option>';
            select.disabled = true;
            return;
        }

        tbSavedReconciliationsDisponibles.forEach(item => {
            const option = document.createElement('option');
            option.value = item.selectorValue || String(item.id);
            option.dataset.conciliacionId = String(item.id);
            option.dataset.archivoId = String(item.archivoConciliacion?.id || '');
            option.textContent = textoOptionConciliacionTacoBellGuardada(item);
            select.appendChild(option);
        });

        select.disabled = tbSavedReconciliationsDisponibles.length === 0;

        if (seleccionarId) {
            const option = Array.from(select.options).find(item =>
                item.value === String(seleccionarId) ||
                item.dataset.conciliacionId === String(seleccionarId)
            );

            if (option) select.value = option.value;
        }
    } catch (error) {
        console.error(error);
        select.innerHTML = '<option value="">Saved reconciliations could not be loaded</option>';
    }
}

function normalizarFilaConciliacionTacoBellGuardada(row = {}) {
    const leer = (...claves) => {
        for (const clave of claves) {
            if (row[clave] !== undefined && row[clave] !== null && row[clave] !== '') {
                return row[clave];
            }
        }

        return '';
    };

    const numero = (...claves) => Number(leer(...claves)) || 0;
    const deposit1 = numero('deposit1', 'Deposit 1');
    const deposit2 = numero('deposit2', 'Deposit 2');
    const deposit3 = numero('deposit3', 'Deposit 3');
    const depositsFromParts = deposit1 + deposit2 + deposit3;
    const mastercard = numero('mastercard', 'Mastercard');
    const visa = numero('visa', 'Visa');
    const discover = numero('discover', 'Discover');
    const debit = numero('debit', 'Debit');
    const ccTotalsFromParts = mastercard + visa + discover + debit;
    const acctCash = numero('acctCash', 'Acct Cash', 'cashExpected', 'Cash Expected');
    const ebt = numero('ebt', 'EBT');

    return {
        ...row,
        store: String(leer('store', 'Store', 'locationId', 'LOCATION_ID')).trim(),
        date: leer('date', 'Date', 'accountingDate', 'Accounting Date') || fechaConciliacionActual,
        salesTax: numero('salesTax', 'Sales TAX', 'Sales Tax'),
        grossSalesPos: numero('grossSalesPos', 'Gross Sales POS'),
        discounts: numero('discounts', 'Discounts'),
        promo: numero('promo', 'Promo'),
        donations: numero('donations', 'Donation', 'Donations'),
        netSales: numero('netSales', 'Net Sales'),
        gcSold: numero('gcSold', 'GC Sold'),
        paidOut: numero('paidOut', 'Paid Out'),
        paidIn: numero('paidIn', 'Paid In'),
        donation: numero('donation', 'Donation', 'Donations'),
        totalRevenue: numero('totalRevenue', 'Total Revenue'),
        mastercard,
        visa,
        discover,
        amex: numero('amex', 'Amex', 'AMEX'),
        debit,
        ebt,
        gcRedeem: numero('gcRedeem', 'GC Redeem'),
        acctCash,
        deposit1,
        deposit2,
        deposit3,
        deposits: Math.abs(depositsFromParts) >= 0.005
            ? depositsFromParts
            : numero('deposits', 'Deposits'),
        gh: numero('gh', 'GH'),
        uber: numero('uber', 'Uber'),
        dd: numero('dd', 'DD'),
        ccTotals: Math.abs(ccTotalsFromParts) >= 0.005
            ? ccTotalsFromParts
            : numero('ccTotals', 'CC Totals'),
        paymentsTotal: numero('paymentsTotal', 'Payments Total'),
        os: numero('os', 'OS'),
        oS: numero('oS', 'O/S', 'osSlash'),
        cashPlusMinus: numero('cashPlusMinus', 'Cash +/-'),
        cashExpected: numero('cashExpected', 'Cash Expected') || acctCash,
        difference: numero('difference', 'Difference')
    };
}

function aplicarEbtASavedTacoBellBase() {
    if (!tbSavedReconciliationBase?.datosOriginales?.length) return false;

    datosExtraidos = tbSavedReconciliationBase.datosOriginales.map(baseRow => {
        const row = normalizarFilaConciliacionTacoBellGuardada(baseRow);
        const store = row.store;
        const ebtAnterior = Number(row.ebt || 0);
        const ebtNuevo = limpiarDecimal(obtenerEBTPorStore(store) || 0);
        const acctCashAntesDeEbt =
            Number(row.acctCash || row.cashExpected || 0) + ebtAnterior;
        const acctCash = limpiarDecimal(acctCashAntesDeEbt - ebtNuevo);
        const cashExpected = acctCash;
        const ccTotals = limpiarDecimal(
            Number(row.mastercard || 0) +
            Number(row.visa || 0) +
            Number(row.discover || 0) +
            Number(row.debit || 0)
        );
        const deposits = limpiarDecimal(
            Math.abs(Number(row.deposit1 || 0) + Number(row.deposit2 || 0) + Number(row.deposit3 || 0)) >= 0.005
                ? Number(row.deposit1 || 0) + Number(row.deposit2 || 0) + Number(row.deposit3 || 0)
                : Number(row.deposits || 0)
        );
        const totalRevenue = limpiarDecimal(
            Number(row.netSales || 0) +
            Number(row.salesTax || 0) +
            Number(row.gcSold || 0) +
            Number(row.donations || row.donation || 0) +
            Number(row.paidIn || 0) -
            Number(row.paidOut || 0)
        );
        const paymentsTotal = limpiarDecimal(
            Number(row.mastercard || 0) +
            Number(row.visa || 0) +
            Number(row.discover || 0) +
            Number(row.amex || 0) +
            Number(row.debit || 0) +
            Number(row.gcRedeem || 0) +
            acctCash +
            Number(row.gh || 0) +
            Number(row.uber || 0) +
            Number(row.dd || 0) +
            ebtNuevo
        );
        const oS = limpiarDecimal(totalRevenue - paymentsTotal);
        const difference = limpiarDecimal(
            cashExpected -
            deposits +
            Number(row.cashPlusMinus || 0) +
            ebtNuevo
        );

        return {
            ...row,
            ebt: ebtNuevo,
            acctCash,
            cashExpected,
            ccTotals,
            deposits,
            totalRevenue,
            paymentsTotal,
            oS,
            difference
        };
    });

    return true;
}

function regenerarSalidasTacoBellDesdeDatosGuardados() {
    if (!Array.isArray(datosExtraidos) || !datosExtraidos.length) return;

    const results = document.getElementById('resultsSection');
    if (results) results.style.display = 'block';

    if (!activeTab) activeTab = 'dailySales';

    generarTaxReviewTacoBell();
    generarStatisticalDelivery();
    generarDailySalesRED();
    generarDailySales0314();
    generarDailySales0310();
    generarExpectedDepositsTacoBell();
    asegurarPestanaExpectedDepositsTacoBell();
    llenarFiltroStores();
    actualizarResumen();
    actualizarTotales();
    invalidarComparacionConciliacion();
    renderActiveTab();
}

function recalcularTacoBellGuardadaConEbtSiAplica() {
    if (
        obtenerCodigoRestaurantActual() !== 'taco-bell' ||
        !tbSavedReconciliationBase?.datosOriginales?.length
    ) {
        return false;
    }

    if (!aplicarEbtASavedTacoBellBase()) return false;

    regenerarSalidasTacoBellDesdeDatosGuardados();
    setUploadCardStatus(
        'salesFile',
        'loaded',
        `Saved reconciliation #${tbSavedReconciliationBase.id} loaded (${datosExtraidos.length} rows)`
    );

    return true;
}

async function cargarConciliacionTacoBellSeleccionada() {
    const select = document.getElementById('savedTbReconciliationSelect');
    const id = String(select?.value || '').split(':')[0];

    if (!id) {
        await Swal.fire({
            icon: 'warning',
            title: 'Reconciliation required',
            text: 'Select a saved Taco Bell reconciliation first.'
        });
        return;
    }

    await cargarConciliacionTacoBellPorId(id);
}

async function cargarConciliacionTacoBellPorId(id) {
    const token = localStorage.getItem('token');

    if (!token) {
        await Swal.fire({
            icon: 'error',
            title: 'Session expired'
        });
        return;
    }

    try {
        Swal.fire({
            title: 'Loading reconciliation...',
            text: 'Reading the saved Taco Bell reconciliation',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const response = await fetch(`${window.API_URL}/conciliaciones/${id}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || 'The saved reconciliation could not be loaded');
        }

        const conciliacion = data.conciliacion || {};
        const rows = Array.isArray(conciliacion.datos_extraidos)
            ? conciliacion.datos_extraidos
            : [];

        if (!rows.length) {
            throw new Error('The saved reconciliation does not contain rows');
        }

        const fecha =
            normalizarFechaIsoEbt(conciliacion.fecha_conciliacion) ||
            normalizarFechaIsoEbt(conciliacion.periodo_inicio) ||
            '';

        fechaConciliacionActual = fecha;

        if (conciliacion.template_id) {
            const templateSelect = document.getElementById('selectTemplate');
            if (templateSelect) templateSelect.value = String(conciliacion.template_id);
            templateActual =
                templates.find(t => String(t.id) === String(conciliacion.template_id)) ||
                templateActual;
        }

        salesFile = null;
        salesWorkbook = null;
        salesRows = [];
        salesDetailFile = null;
        salesDetailWorkbook = null;
        salesDetailRows = [];
        workbook = null;

        datosExtraidos = rows.map(normalizarFilaConciliacionTacoBellGuardada);
        tbSavedReconciliationBase = {
            id: String(id),
            fecha,
            datosOriginales: datosExtraidos.map(row => ({ ...row }))
        };

        setUploadCardStatus(
            'salesFile',
            'loaded',
            `Saved reconciliation #${id} loaded (${datosExtraidos.length} rows)`
        );
        setUploadCardStatus('salesDetailFile');

        if (ebtWorkbook) {
            recalcularTacoBellGuardadaConEbtSiAplica();
        } else {
            regenerarSalidasTacoBellDesdeDatosGuardados();
        }

        Swal.fire({
            icon: 'success',
            title: 'Reconciliation loaded',
            text: 'You can now load or select the EBT file and save again without uploading Sales or Sales Detail.'
        });
    } catch (error) {
        console.error(error);
        Swal.fire({
            icon: 'error',
            title: 'The reconciliation could not be loaded',
            text: error.message || 'Try another saved reconciliation.'
        });
    }
}

async function subirEbtIndependiente() {
    const token = localStorage.getItem('token');
    const restaurante = getSelectedEbtRestaurant();

    if (!token) {
        Swal.fire({
            icon: 'error',
            title: 'Session expired'
        });
        return;
    }

    if (!restaurante.codigo) {
        Swal.fire({
            icon: 'warning',
            title: 'Restaurant required',
            text: 'Select a restaurant before saving the EBT file.'
        });
        return;
    }

    if (!ebtFile || !ebtWorkbook) {
        Swal.fire({
            icon: 'warning',
            title: 'EBT required',
            text: 'Select an EBT file first.'
        });
        return;
    }

    if (selectedServerEbtId) {
        Swal.fire({
            icon: 'info',
            title: 'EBT already saved',
            text: `EBT file ID: ${selectedServerEbtId}`
        });
        return;
    }

    let rows = [];

    try {
        rows = extraerRowsEbtDesdeWorkbook(ebtWorkbook);
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Invalid EBT',
            text: error.message
        });
        return;
    }

    const fecha = obtenerFechaEbtParaServidor(rows);

    if (!fecha) {
        Swal.fire({
            icon: 'warning',
            title: 'Date required',
            text: 'Select the EBT date before saving it.'
        });
        return;
    }

    const extension = obtenerExtensionArchivo(ebtFile.name);
    const nombreEbt = construirNombreArchivoEbtIndependiente(fecha, extension);

    const decisionEbt = await confirmarReemplazoArchivo({
        token,
        restaurante: restaurante.codigo,
        tipoDocumento: 'ebt',
        fecha,
        nombreArchivo: nombreEbt
    });

    if (!decisionEbt.ok) return;

    try {
        Swal.fire({
            title: 'Saving EBT...',
            text: 'Uploading EBT file',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const data = await subirArchivoConciliacionServidor({
            token,
            restaurante: restaurante.codigo,
            archivo: ebtFile,
            nombreArchivo: nombreEbt,
            procesarDatos: 'false',
            tipoDocumento: 'ebt',
            fecha,
            notas: {
                tipo: 'archivo_ebt_independiente',
                tipoDocumento: 'ebt',
                fuente: 'ebt',
                fecha,
                nombreOriginal: ebtFile.name
            },
            reemplazarSiExiste: Boolean(decisionEbt.archivoReemplazarId),
            archivoReemplazarId: decisionEbt.archivoReemplazarId
        });

        const archivoId = data.archivo?.id || decisionEbt.archivoReemplazarId || '';

        if (archivoId) {
            selectedServerEbtId = String(archivoId);
        }

        await cargarFilesEbtGuardados(archivoId);

        Swal.fire({
            icon: 'success',
            title: 'EBT saved',
            text: archivoId
                ? `EBT file ID: ${archivoId}`
                : 'The EBT file was saved successfully.'
        });
    } catch (error) {
        console.error(error);
        Swal.fire({
            icon: 'error',
            title: 'The EBT file could not be saved',
            text: error.message || 'Try again.'
        });
    }
}

async function subirArchivoConciliacionServidor({
    token,
    restaurante,
    archivo,
    nombreArchivo,
    procesarDatos = 'false',
    tipoDocumento,
    fecha,
    notas = null,
    reemplazarSiExiste = false,
    archivoReemplazarId = null
}) {
    const formData = new FormData();

    formData.append('archivo', archivo, nombreArchivo);
    formData.append('restaurante_id', restaurante);
    formData.append('procesar_datos', String(procesarDatos));

    formData.append('tipo_documento', tipoDocumento);
    formData.append('fecha_conciliacion', fecha);
    formData.append('periodo_fecha', fecha);
    formData.append('reemplazar_si_existe', reemplazarSiExiste ? 'true' : 'false');

    if (archivoReemplazarId) {
        formData.append('archivo_reemplazar_id', String(archivoReemplazarId));
        formData.append('confirmacion_reemplazo', 'REEMPLAZAR');
    }

    if (notas) {
        formData.append(
            'notas',
            typeof notas === 'string'
                ? notas
                : JSON.stringify(notas)
        );
    }

    const response = await fetch(`${window.API_URL}/archivos/subir`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: formData
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(data.message || 'File save failed');
        error.status = response.status;
        error.data = data;
        throw error;
    }

    return data;
}
function leerNotasConciliacion(doc) {
    try {
        return typeof doc.notas === 'string'
            ? JSON.parse(doc.notas)
            : doc.notas || {};
    } catch {
        return {};
    }
}

async function buscarArchivoMismaFechaServidor({
    token,
    restaurante,
    tipoDocumento,
    fecha,
    nombreArchivo = ''
}) {
    const response = await fetch(`${window.API_URL}/archivos`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (!response.ok) return null;

    const data = await response.json().catch(() => []);
    const archivos = Array.isArray(data) ? data : (data.archivos || []);

    return archivos.find(doc => {
        const notas = leerNotasConciliacion(doc);

        const mismoRestaurant =
            doc.restaurante_codigo === restaurante ||
            doc.codigo === restaurante ||
            String(doc.restaurante || '').toLowerCase().includes(
                String(restaurante || '').replace('-', ' ').toLowerCase()
            );

        const mismoTipo =
            notas.tipoDocumento === tipoDocumento ||
            (
                tipoDocumento === 'conciliacion' &&
                String(doc.nombre_original || '').includes('_Conciliacion.')
            ) ||
            (
                tipoDocumento === 'ebt' &&
                String(doc.nombre_original || '').includes('_EBT.')
            );

        const mismaFecha =
            notas.fecha === fecha ||
            String(doc.periodo_fecha || '').slice(0, 10) === fecha ||
            String(doc.nombre_original || '').includes(fecha);

        const mismoNombre =
            nombreArchivo &&
            String(doc.nombre_original || '') === String(nombreArchivo);

        return mismoRestaurant && (mismoNombre || (mismoTipo && mismaFecha));
    }) || null;
}

async function confirmarReemplazoArchivo({
    token,
    restaurante,
    tipoDocumento,
    fecha,
    nombreArchivo
}) {
    const existente = await buscarArchivoMismaFechaServidor({
        token,
        restaurante,
        tipoDocumento,
        fecha,
        nombreArchivo
    });

    if (!existente) {
        return {
            ok: true,
            archivoReemplazarId: null
        };
    }

    const tipoTexto =
        tipoDocumento === 'ebt'
            ? 'EBT'
            : 'Reconciliation';

    const restauranteSeguro = escaparHtmlComparacion(restaurante);
    const tipoSeguro = escaparHtmlComparacion(tipoTexto);
    const archivoActualSeguro =
        escaparHtmlComparacion(existente.nombre_original || '-');
    const archivoNuevoSeguro =
        escaparHtmlComparacion(nombreArchivo || '-');

    const result = await Swal.fire({
        title: `${tipoTexto} ya existe`,
        html: `
            <section class="replacement-file-card">
                <header class="replacement-file-hero">
                    <div>
                        <span class="replacement-file-eyebrow">Existing file</span>
                        <h3>A saved file already exists</h3>
                        <p>Review the information before replacing it.</p>
                    </div>
                </header>

                <div class="replacement-file-summary">
                    <div class="replacement-file-summary-row">
                        <span>Restaurant</span>
                        <strong>${restauranteSeguro}</strong>
                    </div>
                    <div class="replacement-file-summary-row">
                        <span>Type</span>
                        <strong>${tipoSeguro}</strong>
                    </div>
                </div>

                <div class="replacement-file-compare">
                    <article>
                        <span>Current file</span>
                        <strong title="${archivoActualSeguro}">${archivoActualSeguro}</strong>
                    </article>
                    <article>
                        <span>New file</span>
                        <strong title="${archivoNuevoSeguro}">${archivoNuevoSeguro}</strong>
                    </article>
                </div>

                <div class="replacement-file-warning">
                    <strong>If you continue, the current file will be replaced.</strong>
                </div>

                <p class="replacement-file-confirm">
                    Type <strong>REPLACE</strong> to confirm.
                </p>
            </section>
        `,
        input: 'text',
        inputPlaceholder: 'REPLACE',
        showCancelButton: true,
        confirmButtonText: 'Replace file',
        cancelButtonText: 'Cancel',
        buttonsStyling: false,
        customClass: {
            popup: 'replacement-file-dialog',
            title: 'replacement-file-title',
            htmlContainer: 'replacement-file-html',
            input: 'replacement-file-input',
            actions: 'replacement-file-actions',
            confirmButton: 'replacement-file-confirm-button',
            cancelButton: 'replacement-file-cancel-button',
            validationMessage: 'replacement-file-validation'
        },
        preConfirm: value => {
            if (String(value || '').trim().toUpperCase() !== 'REPLACE') {
                Swal.showValidationMessage('You must type REPLACE to continue');
                return false;
            }

            return true;
        }
    });

    return {
        ok: result.isConfirmed,
        archivoReemplazarId: result.isConfirmed
            ? existente.id
            : null
    };
}

async function guardarConciliacionServidor() {
    const token = localStorage.getItem('token');

    const restaurante =
        document
            .getElementById('selectRestaurant')
            ?.selectedOptions[0]
            ?.dataset?.codigo;

    if (!token) {
        Swal.fire({
            icon: 'error',
            title: 'Session expired'
        });
        return;
    }

    if (!restaurante) {
        Swal.fire({
            icon: 'warning',
            title: 'Restaurant required',
            text: 'Select a restaurant'
        });
        return;
    }

    if (!datosExtraidos.length) {
        Swal.fire({
            icon: 'warning',
            title: 'No reconciliation',
            text: 'Generate the reconciliation first'
        });
        return;
    }

    const fecha = obtenerFechaConciliacionBD();

    if (!fecha) {
        Swal.fire({
            icon: 'warning',
            title: 'Date required',
            text: 'Select the reconciliation date before saving.'
        });
        return;
    }

    const nombreConciliacion =
        construirNombreArchivo('Reconciliation', 'xlsx');

    const extensionEbt = ebtFile
        ? obtenerExtensionArchivo(ebtFile.name)
        : 'xlsx';

    const nombreEbt =
        construirNombreArchivo('EBT', extensionEbt);

    const decisionConciliacion = await confirmarReemplazoArchivo({
        token,
        restaurante,
        tipoDocumento: 'conciliacion',
        fecha,
        nombreArchivo: nombreConciliacion
    });

    if (!decisionConciliacion.ok) return;

    let decisionEbt = {
        ok: true,
        archivoReemplazarId: null
    };

    const ebtYaGuardadoId = selectedServerEbtId || '';

    if (ebtFile && !ebtYaGuardadoId) {
        decisionEbt = await confirmarReemplazoArchivo({
            token,
            restaurante,
            tipoDocumento: 'ebt',
            fecha,
            nombreArchivo: nombreEbt
        });

        if (!decisionEbt.ok) return;
    }

    Swal.fire({
        title: 'Saving...',
        text: 'Uploading reconciliation',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

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

        const data = await subirArchivoConciliacionServidor({
            token,
            restaurante,
            archivo: blob,
            nombreArchivo: nombreConciliacion,
            procesarDatos: 'true',
            tipoDocumento: 'conciliacion',
            fecha,
            notas: {
                tipo: 'archivo_conciliacion',
                tipoDocumento: 'conciliacion',
                conciliacionId: registroConciliacion.id,
                ebtArchivoId: ebtYaGuardadoId || null,
                fecha
            },
            reemplazarSiExiste: Boolean(decisionConciliacion.archivoReemplazarId),
            archivoReemplazarId: decisionConciliacion.archivoReemplazarId
        });

        let dataEbt = null;

        if (ebtFile && !ebtYaGuardadoId) {
            dataEbt = await subirArchivoConciliacionServidor({
                token,
                restaurante,
                archivo: ebtFile,
                nombreArchivo: nombreEbt,
                procesarDatos: 'false',
                tipoDocumento: 'ebt',
                fecha,
                notas: {
                    tipo: 'archivo_conciliacion',
                    tipoDocumento: 'ebt',
                    fuente: 'ebt',
                    conciliacionId: registroConciliacion.id,
                    conciliacionArchivoId: data.archivo?.id || null,
                    fecha,
                    nombreOriginal: ebtFile.name
                },
                reemplazarSiExiste: Boolean(decisionEbt.archivoReemplazarId),
                archivoReemplazarId: decisionEbt.archivoReemplazarId
            });
        }

        const ebtMostradoId =
            dataEbt?.archivo?.id ||
            ebtYaGuardadoId ||
            '';

        Swal.fire({
            icon: 'success',
            title: 'Reconciliation saved',
            html: `
                <p>The reconciliation was saved successfully.</p>
                <p style="margin-top:10px;">
                    Reconciliation file ID: ${data.archivo?.id || '-'}<br>
                    ${ebtMostradoId ? `EBT file ID: ${ebtMostradoId}<br>` : ''}
                    Accounting record ID: ${registroConciliacion.id}
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
            .getElementById('selectRestaurant')
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

    const columnas =
        currentRestaurantConfig?.conciliationColumns ||
        currentRestaurantConfig?.tableColumns ||
        [];


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

    // Each restaurant exports only its own generated sheets.
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

        agregarHojaDatos(
            prepararTaxAnalysisBurgerKingSalida(),
            'Tax Analysis'
        );

        agregarHojaDatos(
            prepararDiscrepanciesBurgerKingSalida(),
            'Discrepancies'
        );

        agregarHojaDatos(
            prepararDatosIntacct(burgerKingTemplateCsvData),
            'Template to CSV'
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
            'selectRestaurant'
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
            if (typeof renderTacoBellTaxReview === 'function') {
                renderTacoBellTaxReview();
            } else if (typeof renderTaxReview === 'function') {
                renderTaxReview();
            }
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

        case 'ebtCashExpected':
        case 'expectedDeposits':
        case 'cashExpected':
            renderExpectedDepositsTacoBell();
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

    return obtenerCodigoRestaurantActual() === 'taco-bell'
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

function validarEstructuraCSVExportable(data, opciones = {}) {
    if (!data || !data.length) {
        return { ok: true };
    }

    const primeraFila = data[0];

    if (
        !primeraFila ||
        typeof primeraFila !== 'object' ||
        Array.isArray(primeraFila)
    ) {
        return {
            ok: false,
            title: 'Invalid CSV',
            text: 'The data does not have a valid column structure for export.'
        };
    }

    const columnas = Object.keys(primeraFila);

    if (!columnas.length) {
        return {
            ok: false,
            title: 'Invalid CSV',
            text: 'No columns were found to export.'
        };
    }

    if (
        opciones.intacct &&
        columnas.join('|') !== COLUMNAS_INTACCT.join('|')
    ) {
        return {
            ok: false,
            title: 'Invalid Intacct structure',
            text: 'The file was not downloaded because its columns do not match the template.'
        };
    }

    const filaInvalida = data.findIndex(row =>
        !row ||
        typeof row !== 'object' ||
        Array.isArray(row)
    );

    if (filaInvalida >= 0) {
        return {
            ok: false,
            title: 'Invalid CSV',
            text: `Row ${filaInvalida + 1} does not have a valid structure.`
        };
    }

    return { ok: true };
}

async function validarAntesDeExportCSV(data, opciones = {}) {
    const estructura =
        validarEstructuraCSVExportable(data, opciones);

    if (!estructura.ok) {
        await Swal.fire({
            icon: 'error',
            title: estructura.title,
            text: estructura.text
        });
        return false;
    }

    const puedeValidarConciliacion =
        !opciones.omitirComparacion &&
        localStorage.getItem('modoOffline') !== 'true' &&
        typeof compararConciliacionConBD === 'function' &&
        Array.isArray(datosExtraidos) &&
        datosExtraidos.length > 0;

    if (!puedeValidarConciliacion) {
        return true;
    }

    return await compararConciliacionConBD();
}

async function descargarCSV(data, nombreArchivo, opciones = {}) {

    if (!data || !data.length) {
        Swal.fire({
            icon: 'warning',
            title: 'No data to export',
            text: 'Generate the reconciliation before downloading the file.'
        });
        return;
    }

    if (
        !opciones.omitirValidacion &&
        !(await validarAntesDeExportCSV(data, opciones))
    ) {
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

async function descargarCSVIntacct(data, nombreArchivo) {
    const datosIntacct = prepararDatosIntacct(data);

    if (datosIntacct.length && Object.keys(datosIntacct[0]).join('|') !== COLUMNAS_INTACCT.join('|')) {
        Swal.fire({
            icon: 'error',
            title: 'Invalid Intacct structure',
            text: 'The file was not downloaded because its columns do not match the template.'
        });
        return;
    }

    if (
        !(await validarAntesDeExportCSV(datosIntacct, {
            intacct: true
        }))
    ) {
        return;
    }

    await descargarCSV(datosIntacct, nombreArchivo, {
        omitirValidacion: true
    });
}

async function exportarTabActualCSV() {

    const codigo =
        document
            .getElementById('selectRestaurant')
            ?.selectedOptions?.[0]
            ?.dataset?.codigo;

    if (codigo === 'burger-king') {

        switch (activeTab) {

            case 'summary':
                await descargarCSV(
                    burgerKingSummaryData,
                    'BurgerKingSummary'
                );
                break;

            case 'conciliation':
            case 'dailySales':
                await descargarCSV(
                    burgerKingConciliationData,
                    'BurgerKingConciliation'
                );
                break;

            case 'taxAnalysis':
            case 'taxReview':
                await descargarCSV(
                    burgerKingTaxAnalysisData,
                    'BurgerKingTaxAnalysis'
                );
                break;

            case 'discrepancies':
                await descargarCSV(
                    burgerKingDiscrepanciesData,
                    'BurgerKingDiscrepancies'
                );
                break;

            case 'templateCsv':
            case 'template':
                await descargarCSVIntacct(
                    burgerKingTemplateCsvData,
                    'BurgerKingTemplateToCSV'
                );
                break;

            default:
                await descargarCSV(
                    burgerKingConciliationData,
                    'BurgerKingConciliation'
                );
        }

        return;
    }

    if (codigo === 'popeyes') {

        switch (activeTab) {

            case 'conciliation':
                await descargarCSV(
                    popeyesConciliationData,
                    'PopeyesConciliation'
                );
                break;

            case 'taxReview':
                await descargarCSV(
                    popeyesTaxReviewData,
                    'PopeyesTaxReview'
                );
                break;

            case 'dailySalesRed':
                await descargarCSVIntacct(
                    popeyesDailySalesRedData,
                    'DailySalesPopeyesRed'
                );
                break;

            case 'dailySales0404':
                await descargarCSVIntacct(
                    popeyesDailySales0404Data,
                    'DailySalesPopeyes0404'
                );
                break;

            default:
                Swal.fire({
                    icon: 'info',
                    title: 'Select a tab',
                    text: 'Choose the view you want to export.'
                });
        }

        return;
    }

    if (false && codigo === 'burger-king') {

        switch (activeTab) {

            case 'burgerKingConciliation':
                await descargarCSV(
                    burgerKingConciliationData,
                    'BurgerKingConciliation'
                );
                break;

            case 'burgerKingTaxAnalysis':
                await descargarCSV(
                    burgerKingTaxAnalysisData,
                    'BurgerKingTaxAnalysis'
                );
                break;

            case 'burgerKingDiscrepancies':
                await descargarCSV(
                    burgerKingDiscrepanciesData,
                    'BurgerKingDiscrepancies'
                );
                break;

            case 'burgerKingTemplateCsv':
                await descargarCSV(
                    burgerKingTemplateCsvData,
                    'BurgerKingTemplateToCSV'
                );
                break;

            default:
                Swal.fire({
                    icon: 'info',
                    title: 'Select a tab',
                    text: 'Choose the view you want to export.'
                });
        }

        return;
    }

    switch (activeTab) {

        case 'taxReview':
            await descargarCSV(
                taxReviewData,
                'TaxReview'
            );
            break;

        case 'dailySalesRed':
            await descargarCSVIntacct(
                dailySalesREDData,
                'DailySalesRED'
            );
            break;

        case 'statisticalDelivery':
            await descargarCSVIntacct(
                statisticalDeliveryData,
                'StatisticalDelivery'
            );
            break;

        case 'dailySales0314':
            await descargarCSVIntacct(
                dailySales0314Data,
                'DailySales0314'
            );
            break;

        case 'dailySales0310':
            await descargarCSVIntacct(
                dailySales0310Data,
                'DailySales0310'
            );
            break;

        default:
            Swal.fire({
                icon: 'info',
                title: 'Select a tab',
                text: 'Choose the view you want to export.'
            });
    }

}
