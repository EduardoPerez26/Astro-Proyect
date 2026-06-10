// ============================================
// PROCESADOR DE TEMPLATES EXCEL
// Soporta múltiples hojas y fórmulas entre hojas
// ============================================

// Variables globales para almacenar el template seleccionado
window.selectedTemplateWorkbook = null;
window.selectedTemplateFile = null;

// ============================================
// PROCESAR ARCHIVO CON TEMPLATE - AUTOMATICO
// ============================================

/**
 * Procesa el archivo de datos y lo combina con el template seleccionado.
 * 
 * LOGICA:
 * 1. Para cada hoja que existe en AMBOS (template Y datos): reemplaza los datos
 * 2. Para hojas que solo existen en el template: mantiene las formulas originales
 * 3. Para hojas que solo existen en los datos: las agrega al resultado
 * 4. Recalcula todas las formulas al final
 */
async function processWithTemplate(dataFile) {
    return new Promise((resolve, reject) => {
        // Verificar que hay un template seleccionado
        if (!window.selectedTemplateWorkbook) {
            reject(new Error('No se ha seleccionado un archivo de plantilla.'));
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const dataWorkbook = XLSX.read(data, { type: 'array', cellFormula: true });
                
                console.log('[v0] Hojas en datos:', dataWorkbook.SheetNames);
                console.log('[v0] Hojas en template:', window.selectedTemplateWorkbook.SheetNames);
                
                // Crear workbook resultado
                const resultWorkbook = {
                    SheetNames: [],
                    Sheets: {}
                };
                
                // PASO 1: Procesar hojas del template
                for (const sheetName of window.selectedTemplateWorkbook.SheetNames) {
                    const templateSheet = window.selectedTemplateWorkbook.Sheets[sheetName];
                    const dataSheet = dataWorkbook.Sheets[sheetName];
                    
                    if (dataSheet) {
                        // La hoja existe en ambos: COPIAR DATOS, mantener estructura del template
                        console.log('[v0] Combinando hoja:', sheetName);
                        resultWorkbook.Sheets[sheetName] = combineSheets(templateSheet, dataSheet);
                    } else {
                        // Solo existe en template: copiar completa (con formulas)
                        console.log('[v0] Copiando hoja de template:', sheetName);
                        resultWorkbook.Sheets[sheetName] = deepCopySheet(templateSheet);
                    }
                    resultWorkbook.SheetNames.push(sheetName);
                }
                
                // PASO 2: Agregar hojas que solo existen en datos
                for (const sheetName of dataWorkbook.SheetNames) {
                    if (!resultWorkbook.SheetNames.includes(sheetName)) {
                        console.log('[v0] Agregando hoja de datos:', sheetName);
                        resultWorkbook.Sheets[sheetName] = deepCopySheet(dataWorkbook.Sheets[sheetName]);
                        resultWorkbook.SheetNames.push(sheetName);
                    }
                }
                
                // PASO 3: Recalcular formulas
                recalculateFormulas(resultWorkbook);
                
                console.log('[v0] Resultado final - hojas:', resultWorkbook.SheetNames);
                resolve(resultWorkbook);
                
            } catch (error) {
                console.error('[v0] Error procesando:', error);
                reject(error);
            }
        };
        
        reader.onerror = () => reject(new Error('Error leyendo archivo'));
        reader.readAsArrayBuffer(dataFile);
    });
}

// ============================================
// COMBINAR HOJAS: Template + Datos
// ============================================

/**
 * Combina una hoja del template con datos del archivo de origen.
 * - Mantiene el encabezado del template (fila 1)
 * - Copia los datos del archivo origen (fila 2+)
 * - Preserva formulas del template que no tienen datos
 */
function combineSheets(templateSheet, dataSheet) {
    const result = {};
    
    // Obtener rangos
    const templateRange = XLSX.utils.decode_range(templateSheet['!ref'] || 'A1');
    const dataRange = XLSX.utils.decode_range(dataSheet['!ref'] || 'A1');
    
    // Determinar el rango final (el mayor de ambos)
    const maxCol = Math.max(templateRange.e.c, dataRange.e.c);
    const maxRow = Math.max(templateRange.e.r, dataRange.e.r);
    
    // PASO 1: Copiar encabezado del template (fila 1, index 0)
    for (let c = 0; c <= maxCol; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c: c });
        if (templateSheet[addr]) {
            result[addr] = { ...templateSheet[addr] };
        }
    }
    
    // PASO 2: Copiar datos del archivo de datos (fila 2+)
    for (let r = 1; r <= dataRange.e.r; r++) {
        for (let c = 0; c <= dataRange.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r: r, c: c });
            if (dataSheet[addr]) {
                result[addr] = { ...dataSheet[addr] };
            }
        }
    }
    
    // PASO 3: Copiar formulas del template para celdas vacias
    // (formulas que calculan datos basados en otras celdas/hojas)
    for (let r = 1; r <= templateRange.e.r; r++) {
        for (let c = 0; c <= templateRange.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r: r, c: c });
            // Si el template tiene formula y no hay dato, copiar la formula
            if (templateSheet[addr] && templateSheet[addr].f && !result[addr]) {
                result[addr] = { ...templateSheet[addr] };
            }
        }
    }
    
    // Copiar propiedades de la hoja
    result['!ref'] = `A1:${XLSX.utils.encode_col(maxCol)}${maxRow + 1}`;
    if (templateSheet['!cols']) result['!cols'] = templateSheet['!cols'];
    if (templateSheet['!rows']) result['!rows'] = templateSheet['!rows'];
    if (templateSheet['!merges']) result['!merges'] = templateSheet['!merges'];
    
    return result;
}

// ============================================
// COPIA PROFUNDA DE HOJA
// ============================================

function deepCopySheet(sheet) {
    if (!sheet) return {};
    
    const result = {};
    
    for (const key of Object.keys(sheet)) {
        if (key.startsWith('!')) {
            // Propiedades especiales (!ref, !cols, !rows, etc)
            result[key] = JSON.parse(JSON.stringify(sheet[key]));
        } else {
            // Celdas
            result[key] = { ...sheet[key] };
        }
    }
    
    return result;
}

// ============================================
// RECALCULAR FORMULAS
// ============================================

function recalculateFormulas(workbook) {
    const calc = window.XLSX_CALC || (typeof XLSX_CALC !== 'undefined' ? XLSX_CALC : null);
    
    if (calc && typeof calc === 'function') {
        try {
            calc(workbook, { continue_after_error: true });
            console.log('[v0] Formulas recalculadas');
        } catch (error) {
            console.warn('[v0] Error en recalculo (ignorado):', error.message);
        }
    }
}

// ============================================
// CARGAR TEMPLATE DESDE ARCHIVO
// ============================================

function loadTemplateFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellFormula: true });
                console.log('[v0] Template cargado:', workbook.SheetNames);
                resolve(workbook);
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => reject(new Error('Error leyendo template'));
        reader.readAsArrayBuffer(file);
    });
}

// ============================================
// UI: SELECTOR DE TEMPLATE
// ============================================

function openTemplateSelector() {
    // Crear input file dinamico si no existe
    let templateInput = document.getElementById('templateFileInput');
    
    if (!templateInput) {
        templateInput = document.createElement('input');
        templateInput.type = 'file';
        templateInput.id = 'templateFileInput';
        templateInput.accept = '.xlsx,.xls';
        templateInput.style.display = 'none';
        document.body.appendChild(templateInput);
        
        templateInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                Swal.fire({
                    title: 'Cargando plantilla...',
                    allowOutsideClick: false,
                    didOpen: () => Swal.showLoading()
                });
                
                window.selectedTemplateWorkbook = await loadTemplateFromFile(file);
                window.selectedTemplateFile = file.name;
                
                updateTemplateStatus();
                
                Swal.fire({
                    icon: 'success',
                    title: 'Plantilla cargada',
                    html: `
                        <p><strong>${file.name}</strong></p>
                        <p style="font-size: 13px; color: #666; margin-top: 8px;">
                            Hojas encontradas: ${window.selectedTemplateWorkbook.SheetNames.join(', ')}
                        </p>
                    `,
                    timer: 3000
                });
                
            } catch (error) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'No se pudo cargar la plantilla: ' + error.message
                });
            }
            
            // Reset para permitir seleccionar el mismo archivo
            e.target.value = '';
        });
    }
    
    templateInput.click();
}

function updateTemplateStatus() {
    const statusEl = document.getElementById('templateStatus');
    if (statusEl) {
        if (window.selectedTemplateFile) {
            statusEl.innerHTML = `<i class="fa-solid fa-check-circle" style="color: #10b981;"></i> ${window.selectedTemplateFile}`;
            statusEl.style.display = 'inline-flex';
            statusEl.style.alignItems = 'center';
            statusEl.style.gap = '6px';
        } else {
            statusEl.innerHTML = `<i class="fa-solid fa-circle-xmark" style="color: #ef4444;"></i> Sin plantilla`;
        }
    }
}

function clearSelectedTemplate() {
    window.selectedTemplateWorkbook = null;
    window.selectedTemplateFile = null;
    updateTemplateStatus();
}

// Exponer funciones globalmente
window.processWithTemplate = processWithTemplate;
window.openTemplateSelector = openTemplateSelector;
window.clearSelectedTemplate = clearSelectedTemplate;
window.updateTemplateStatus = updateTemplateStatus;
