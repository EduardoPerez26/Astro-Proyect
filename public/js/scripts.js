// Configuracion de la API
const API_URL = window.API_URL;

let workbook;
let currentSheetName;
let currentWorksheet;
let tableData = [];
let rowValidation = [];
let cellFormulas = new Map();
let renderUpdateTimer = null;
let isRendering = false;
let archivoActualId = null; // ID del archivo en la base de datos

/* Elementos del DOM */

const excelFile = document.getElementById('excelFile');
const tableContainer = document.getElementById('tableContainer');
const statusText = document.getElementById('status');
const sheetName = document.getElementById('sheetName');
const saveBtn = document.getElementById('saveBtn');
const sheetSelector = document.getElementById('sheetSelector');

/* TABS */

const tabs = document.querySelectorAll('.tab');
const navBtns = document.querySelectorAll('.nav-btn');

/* Events */

if (excelFile) {
    excelFile.addEventListener('change', handleFileUpload);
}

if (saveBtn) {
    saveBtn.addEventListener('click', saveExcelFile);
}

/* Change Tab */

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        tabs.forEach(tab => tab.classList.remove('active'));

        btn.classList.add('active');
        const target = btn.dataset.tab;

        const targetElement = document.getElementById(target);
        if (targetElement) {
            targetElement.classList.add('active');
        }
    });
});


/* Upload Excel File */

async function handleFileUpload(e) {
    const file = e.target.files[0];

    if (!file) return;

    const useTemplate = document.getElementById('useTemplate')?.checked;

    // Si se activo "Usar template"
    if (useTemplate) {
        // Verificar que se haya seleccionado una plantilla
        if (!window.selectedTemplateWorkbook) {
            Swal.fire({
                icon: 'warning',
                title: 'Selecciona una plantilla',
                text: 'Primero debes seleccionar el archivo de plantilla (.xlsx) usando el boton "Seleccionar Plantilla".',
            });
            e.target.value = '';
            return;
        }

        try {
            Swal.fire({
                title: 'Procesando...',
                html: `
                    <p>Aplicando plantilla al archivo</p>
                    <p style="font-size: 12px; color: #666;">Combinando hojas y recalculando formulas...</p>
                `,
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            // Procesar con template (ya no necesita restaurant)
            workbook = await processWithTemplate(file);

            Swal.close();

            Swal.fire({
                icon: 'success',
                title: 'Plantilla aplicada',
                html: `
                    <p>Los datos se combinaron correctamente con la plantilla.</p>
                    <p style="font-size: 13px; color: #666; margin-top: 8px;">
                        Hojas: ${workbook.SheetNames.join(', ')}
                    </p>
                `,
                timer: 3000,
                showConfirmButton: false
            });

        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Error al aplicar plantilla',
                text: error.message || 'No se pudo procesar el archivo con la plantilla',
            });
            e.target.value = '';
            return;
        }
    } else {
        // Carga normal sin template
        const reader = new FileReader();
        const loadPromise = new Promise((resolve, reject) => {
            reader.onload = function (event) {
                const data = new Uint8Array(event.target.result);
                workbook = XLSX.read(data, { type: 'array', cellFormula: true });
                resolve();
            };
            reader.onerror = reject;
        });
        reader.readAsArrayBuffer(file);
        await loadPromise;
    }

    // Continuar con el proceso normal
    window.XLSX_CALC = window.XLSX_CALC || getCalcEngine();
    const calc = getCalcEngine();
    if (!calc) {
        updateValidationStatus('No se encontro el motor xlsx-calc. Las formulas no se recalcularan.', 'alert');
    }

    currentSheetName = workbook.SheetNames[0];
    loadSheet(currentSheetName);

    renderSheetSelector();

    if (statusText) {
        statusText.textContent = file.name + (useTemplate ? ' (con template)' : '');
    }
}

/* Table Render */

function renderTable() {

    if (!tableContainer || isRendering) return;

    isRendering = true;

    if (!tableData.length) {

        tableContainer.innerHTML = `
            <div class="empty">
                <h2>No hay datos</h2>
            </div>
        `;

        isRendering = false;
        return;
    }

    let html = '<table>';

    tableData.forEach((row, rowIndex) => {

        const rowClass = rowValidation[rowIndex] ? ` class="${rowValidation[rowIndex]}-row"` : '';
        html += `<tr${rowClass}>`;

        row.forEach((cell, colIndex) => {
            const formula = cellFormulas.get(`${rowIndex},${colIndex}`);
            const formulaClass = formula ? ' formula-cell' : '';
            const title = formula ? ` title="=${formula}"` : '';
            const displayValue = formatCellValue(cell);

            if (rowIndex === 0) {
                html += `
                    <th
                        contenteditable="true"
                        data-row="${rowIndex}"
                        data-col="${colIndex}"${title}
                        class="${formulaClass.trim()}">
                        ${displayValue}
                    </th>
                `;
            } else {
                html += `
                    <td
                        contenteditable="true"
                        data-row="${rowIndex}"
                        data-col="${colIndex}"${title}
                        class="${formulaClass.trim()}">
                        ${displayValue}
                    </td>
                `;
            }

        });

        html += '</tr>';

    });

    html += '</table>';

    tableContainer.innerHTML = html;

    addCellListeners();
    isRendering = false;

}

function formatCellValue(value) {
    if (value === null || value === undefined || value === '') {
        return '';
    }
    if (typeof value === 'number') {
        // Si es un numero con decimales, limitamos a 2 decimales
        if (!Number.isInteger(value)) {
            return value.toFixed(2);
        }
    }
    return value;
}

/* Cell editing */

function addCellListeners() {

    const editable = document.querySelectorAll('[contenteditable="true"]');

    editable.forEach(cell => {
        // Guardar valor original al enfocar
        cell.addEventListener('focus', function () {
            this.dataset.originalValue = this.innerText;
        });

        cell.addEventListener('blur', function () {
            const row = parseInt(this.dataset.row);
            const col = parseInt(this.dataset.col);
            const newText = this.innerText.trim();
            const originalValue = this.dataset.originalValue || '';

            // Solo procesar si el valor cambio
            if (newText !== originalValue.trim()) {
                tableData[row][col] = newText;
                commitCellChange(row, col, newText);
            }
        });

        // Permitir confirmar con Enter
        cell.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.blur();
            }
        });
    });

}

function cellAddress(row, col) {
    return XLSX.utils.encode_cell({ r: row, c: col });
}

function isNumericValue(value) {
    const trimmed = String(value).trim();
    return trimmed !== '' && !Number.isNaN(Number(trimmed));
}

function commitCellChange(row, col, text) {
    if (!currentWorksheet || !workbook) return;

    const address = cellAddress(row, col);
    const normalized = String(text || '');
    let cell = currentWorksheet[address] || {};

    if (normalized.startsWith('=')) {
        // Es una formula
        cell.f = normalized.slice(1);
        cell.t = 'n';
        cell.v = cell.v !== undefined ? cell.v : 0;
        cellFormulas.set(`${row},${col}`, cell.f);
    } else {
        // Eliminar formula si existia
        if (cell.f) {
            delete cell.f;
            cellFormulas.delete(`${row},${col}`);
        }

        const trimmed = normalized.trim();
        if (trimmed === '') {
            delete currentWorksheet[address];
            cell = null;
        } else if (isNumericValue(trimmed)) {
            cell = { t: 'n', v: Number(trimmed) };
        } else {
            cell = { t: 's', v: trimmed };
        }
    }

    if (cell) {
        currentWorksheet[address] = cell;
        expandWorksheetRef(address);
    }

    // Recalcular formulas del workbook
    evaluateWorkbookFormulas();

    // Actualizar datos de la hoja desde el worksheet recalculado
    updateCurrentSheetData();

    // Actualizar celdas dependientes en el DOM sin re-renderizar toda la tabla
    updateDependentCells(address);

    // Actualizar info de formulas
    refreshFormulaInfo();
}

// Encuentra celdas que tienen formulas que referencian la celda modificada
// Ahora busca en TODAS las hojas del workbook
function findDependentCells(changedAddress, changedSheetName) {
    const dependents = [];

    // Buscar en la hoja actual
    cellFormulas.forEach((formula, key) => {
        // Verificar referencia directa (sin nombre de hoja) o con nombre de hoja actual
        const regexDirect = new RegExp(`\\$?${changedAddress.replace(/([A-Z]+)(\d+)/, '\\$?$1\\$?$2')}(?![0-9A-Z])`, 'i');
        const regexWithSheet = new RegExp(`['"]?${changedSheetName}['"]?!\\$?${changedAddress.replace(/([A-Z]+)(\d+)/, '\\$?$1\\$?$2')}(?![0-9A-Z])`, 'i');

        if (regexDirect.test(formula) || regexWithSheet.test(formula)) {
            const [row, col] = key.split(',').map(Number);
            dependents.push({ row, col, key, sheetName: currentSheetName });
        }
    });

    return dependents;
}

// Encuentra celdas dependientes en OTRAS hojas del workbook
// Busca TODAS las formulas que referencien la hoja modificada (para VLOOKUP, SUMIF, etc.)
function findCrossSheetDependents(changedAddress, changedSheetName) {
    if (!workbook || !workbook.SheetNames) return [];

    const dependents = [];

    workbook.SheetNames.forEach(sheetName => {
        if (sheetName === changedSheetName) return; // Saltar hoja actual

        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) return;

        const range = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : null;
        if (!range) return;

        // Buscar celdas con formulas que referencien la hoja modificada
        for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                const cell = worksheet[addr];

                if (cell && cell.f) {
                    const formula = cell.f;

                    // Verificar si la formula contiene CUALQUIER referencia a la hoja modificada
                    // Esto incluye VLOOKUP, SUMIF, INDEX, MATCH, referencias directas, rangos, etc.
                    const containsSheetRef = formula.includes(changedSheetName + '!') ||
                        formula.includes("'" + changedSheetName + "'!") ||
                        formula.includes('"' + changedSheetName + '"!');

                    if (containsSheetRef) {
                        dependents.push({
                            row: r,
                            col: c,
                            address: addr,
                            sheetName: sheetName,
                            formula: formula
                        });
                    }
                }
            }
        }
    });

    return dependents;
}

// Actualiza las celdas dependientes en el DOM
function updateDependentCells(changedAddress) {
    const dependents = findDependentCells(changedAddress, currentSheetName);

    // Buscar dependientes en otras hojas
    const crossSheetDependents = findCrossSheetDependents(changedAddress, currentSheetName);

    // Recalcular formulas en otras hojas que dependen de esta celda
    if (crossSheetDependents.length > 0) {
        recalculateCrossSheetFormulas(crossSheetDependents);
        showCrossSheetUpdateNotification(crossSheetDependents);
    }

    if (dependents.length === 0) return;

    // Recalcular las formulas de las celdas dependientes en la hoja actual
    if (dependents.length > 0) {
        recalculateDependentFormulas(dependents);

        // Actualizar tableData con los nuevos valores
        updateCurrentSheetData();

        dependents.forEach(({ row, col }) => {
            const cellElement = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);

            if (cellElement) {
                const newValue = tableData[row][col];
                cellElement.innerText = formatCellValue(newValue);

                // Efecto visual para mostrar que la celda se actualizo
                cellElement.classList.add('cell-updated');
                setTimeout(() => {
                    cellElement.classList.remove('cell-updated');
                }, 500);
            }
        });

        // Si hay dependientes de dependientes, necesitamos actualizar recursivamente
        dependents.forEach(({ row, col }) => {
            const depAddress = cellAddress(row, col);
            const nestedDependents = findDependentCells(depAddress, currentSheetName);
            if (nestedDependents.length > 0) {
                recalculateDependentFormulas(nestedDependents);
                updateCurrentSheetData();

                nestedDependents.forEach(({ row: r, col: c }) => {
                    const cellElement = document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
                    if (cellElement) {
                        const newValue = tableData[r][c];
                        cellElement.innerText = formatCellValue(newValue);

                        cellElement.classList.add('cell-updated');
                        setTimeout(() => {
                            cellElement.classList.remove('cell-updated');
                        }, 500);
                    }
                });
            }
        });
    }
}

// Muestra notificacion de celdas actualizadas en otras hojas
function showCrossSheetUpdateNotification(crossSheetDependents) {
    const sheetCounts = {};
    crossSheetDependents.forEach(d => {
        sheetCounts[d.sheetName] = (sheetCounts[d.sheetName] || 0) + 1;
    });

    const message = Object.entries(sheetCounts)
        .map(([sheet, count]) => `${sheet}: ${count} celda(s)`)
        .join(', ');

    // Crear o actualizar notificacion
    let notification = document.getElementById('crossSheetNotification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'crossSheetNotification';
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--primary);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(notification);
    }

    notification.innerHTML = `
        <i class="fa-solid fa-link" style="font-size: 16px;"></i>
        <span>Actualizado en otras hojas: ${message}</span>
    `;
    notification.style.display = 'flex';

    // Ocultar despues de 3 segundos
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Recalcula solo las formulas de celdas especificas
function recalculateDependentFormulas(dependents) {
    dependents.forEach(({ row, col }) => {
        const address = cellAddress(row, col);
        const cell = currentWorksheet[address];
        if (cell && cell.f) {
            const newValue = evaluateFormula(cell.f, currentWorksheet);
            cell.v = newValue;
            currentWorksheet[address] = cell;
        }
    });
}

// Recalcula formulas en otras hojas del workbook
function recalculateCrossSheetFormulas(crossSheetDependents) {
    crossSheetDependents.forEach(({ address, sheetName, formula }) => {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) return;

        const cell = worksheet[address];
        if (cell && cell.f) {
            const newValue = evaluateFormulaWithContext(cell.f, sheetName);

            // Solo actualizar si obtuvimos un valor valido
            if (newValue !== null && !isNaN(newValue)) {
                cell.v = newValue;
                worksheet[address] = cell;
            }
        }
    });
}

// Evalua una formula con contexto de hoja especifica
function evaluateFormulaWithContext(formula, sheetName) {
    try {
        const worksheet = workbook.Sheets[sheetName];
        let evalFormula = formula;

        // Manejar SUMIFS: SUMIFS(sumRange, criteriaRange1, criteria1, ...)
        const sumifsMatch = formula.match(/SUMIFS\s*\(/i);
        if (sumifsMatch) {
            return evaluateSUMIFS(formula, sheetName);
        }

        // Manejar SUMIF: SUMIF(criteriaRange, criteria, sumRange)
        const sumifMatch = formula.match(/SUMIF\s*\(/i);
        if (sumifMatch) {
            return evaluateSUMIF(formula, sheetName);
        }

        // Manejar SUM con referencias a otras hojas
        evalFormula = evalFormula.replace(/SUM\s*\(\s*['"]?([^'"!\s]+)['"]?!([^)]+)\)/gi, (match, refSheet, rangeStr) => {
            const cleanSheet = refSheet.replace(/^['"]|['"]$/g, '');
            return evaluateSUMRange(cleanSheet, rangeStr.trim());
        });

        // Manejar SUM local
        evalFormula = evalFormula.replace(/SUM\s*\(\s*([A-Z]+\d+:[A-Z]+\d+)\s*\)/gi, (match, rangeStr) => {
            return evaluateSUMRange(sheetName, rangeStr.trim());
        });

        // Manejar referencias a otras hojas: 'Sheet'!A1 o Sheet!A1
        evalFormula = evalFormula.replace(/['"]?([^'"!+\-*/(),\s]+)['"]?!\$?([A-Z]+)\$?(\d+)/gi, (match, refSheet, col, row) => {
            const cleanSheet = refSheet.replace(/^['"]|['"]$/g, '').trim();
            const ws = workbook.Sheets[cleanSheet];
            if (ws) {
                const addr = col.toUpperCase() + row;
                const cell = ws[addr];
                if (cell && cell.v !== undefined) {
                    return typeof cell.v === 'number' ? cell.v.toString() : '0';
                }
            }
            return '0';
        });

        // Manejar referencias locales
        evalFormula = evalFormula.replace(/\$?([A-Z]+)\$?(\d+)/gi, (match, col, row) => {
            if (!worksheet) return '0';
            const addr = col.toUpperCase() + row;
            const cell = worksheet[addr];
            if (cell && cell.v !== undefined) {
                return typeof cell.v === 'number' ? cell.v.toString() : '0';
            }
            return '0';
        });

        const result = Function('"use strict"; return (' + evalFormula + ')')();
        return typeof result === 'number' && !isNaN(result) ? result : null;
    } catch (e) {
        return null;
    }
}

// Evalua funcion SUMIFS (con S - multiple criteria)
// Sintaxis: SUMIFS(sum_range, criteria_range1, criteria1, [criteria_range2, criteria2], ...)
function evaluateSUMIFS(formula, currentSheetName) {
    try {
        // Extraer los argumentos de SUMIFS
        const argsMatch = formula.match(/SUMIFS\s*\(\s*(.+)\s*\)/i);
        if (!argsMatch) return null;

        // Parsear los argumentos separados por coma (cuidando las comillas)
        const argsStr = argsMatch[1];
        const args = parseFormulaArgs(argsStr);

        if (args.length < 3) return null;

        // Primer argumento es el rango de suma
        const sumRangeStr = args[0].trim();

        // Parsear rango de suma
        let sumSheet = currentSheetName;
        let sumRange = sumRangeStr;

        if (sumRangeStr.includes('!')) {
            const parts = sumRangeStr.split('!');
            sumSheet = parts[0].replace(/^['"]|['"]$/g, '');
            sumRange = parts[1];
        }

        const sumWorksheet = workbook.Sheets[sumSheet];
        if (!sumWorksheet) return null;

        const sumRangeParsed = parseRange(sumRange);

        // Recopilar los pares de criterio (criteria_range, criteria)
        const criteriaPairs = [];
        for (let i = 1; i < args.length; i += 2) {
            if (i + 1 >= args.length) break;

            const criteriaRangeStr = args[i].trim();
            const criteriaStr = args[i + 1].trim();

            // Parsear rango de criterio
            let critSheet = currentSheetName;
            let critRange = criteriaRangeStr;

            if (criteriaRangeStr.includes('!')) {
                const parts = criteriaRangeStr.split('!');
                critSheet = parts[0].replace(/^['"]|['"]$/g, '');
                critRange = parts[1];
            }

            const criteriaWorksheet = workbook.Sheets[critSheet];
            if (!criteriaWorksheet) return null;

            // Obtener el valor del criterio
            let criteriaValue = criteriaStr.replace(/^["']|["']$/g, '');

            // Si es una referencia de celda con hoja
            if (criteriaValue.includes('!')) {
                const parts = criteriaValue.split('!');
                const cellSheet = workbook.Sheets[parts[0].replace(/^['"]|['"]$/g, '')];
                if (cellSheet) {
                    const cellAddr = parts[1].replace(/\$/g, '');
                    const cell = cellSheet[cellAddr];
                    criteriaValue = cell ? String(cell.v || '') : '';
                }
            } else if (/^\$?[A-Z]+\$?\d+$/i.test(criteriaValue)) {
                // Referencia local
                const ws = workbook.Sheets[currentSheetName];
                const cell = ws ? ws[criteriaValue.replace(/\$/g, '')] : null;
                criteriaValue = cell ? String(cell.v || '') : '';
            }

            criteriaPairs.push({
                worksheet: criteriaWorksheet,
                range: parseRange(critRange),
                value: criteriaValue
            });
        }

        if (criteriaPairs.length === 0) return null;

        let sum = 0;

        // Iterar sobre las filas del primer rango de criterio
        const firstCritRange = criteriaPairs[0].range;

        for (let r = firstCritRange.startRow; r <= Math.min(firstCritRange.endRow, 5000); r++) {
            let allMatch = true;

            // Verificar todos los criterios para esta fila
            for (const { worksheet, range, value } of criteriaPairs) {
                const critAddr = XLSX.utils.encode_cell({ r, c: range.startCol });
                const critCell = worksheet[critAddr];
                const critValue = critCell ? String(critCell.v || '') : '';

                if (critValue.toLowerCase().trim() !== value.toLowerCase().trim()) {
                    allMatch = false;
                    break;
                }
            }

            // Si todos los criterios coinciden, sumar el valor correspondiente
            if (allMatch) {
                const sumAddr = XLSX.utils.encode_cell({ r, c: sumRangeParsed.startCol });
                const sumCell = sumWorksheet[sumAddr];

                if (sumCell && typeof sumCell.v === 'number') {
                    sum += sumCell.v;
                }
            }
        }

        return sum;
    } catch (e) {
        return null;
    }
}

// Parsea los argumentos de una formula separados por coma
function parseFormulaArgs(argsStr) {
    const args = [];
    let current = '';
    let depth = 0;
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < argsStr.length; i++) {
        const char = argsStr[i];

        if ((char === '"' || char === "'") && !inQuote) {
            inQuote = true;
            quoteChar = char;
            current += char;
        } else if (char === quoteChar && inQuote) {
            inQuote = false;
            current += char;
        } else if (char === '(' && !inQuote) {
            depth++;
            current += char;
        } else if (char === ')' && !inQuote) {
            depth--;
            current += char;
        } else if (char === ',' && depth === 0 && !inQuote) {
            args.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    if (current.trim()) {
        args.push(current.trim());
    }

    return args;
}

// Evalua funcion SUMIF
function evaluateSUMIF(formula, currentSheetName) {
    try {
        // Parsear los argumentos de SUMIF: SUMIF(criteriaRange, criteria, sumRange)
        const argsMatch = formula.match(/SUMIF\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/i);
        if (!argsMatch) return null;

        let [, criteriaRangeStr, criteriaStr, sumRangeStr] = argsMatch;

        // Parsear rango de criterios
        let critSheet = currentSheetName;
        let critRange = criteriaRangeStr.trim();

        if (critRange.includes('!')) {
            const parts = critRange.split('!');
            critSheet = parts[0].replace(/^['"]|['"]$/g, '');
            critRange = parts[1];
        }

        // Parsear rango de suma
        let sumSheet = currentSheetName;
        let sumRange = sumRangeStr.trim();

        if (sumRange.includes('!')) {
            const parts = sumRange.split('!');
            sumSheet = parts[0].replace(/^['"]|['"]$/g, '');
            sumRange = parts[1];
        }

        // Obtener el valor del criterio
        let criteriaValue = criteriaStr.trim().replace(/^["']|["']$/g, '');

        // Si es una referencia de celda
        if (/^['"]?[^'"!]*['"]?![A-Z]+\d+$/i.test(criteriaValue)) {
            const parts = criteriaValue.split('!');
            const cellSheet = workbook.Sheets[parts[0].replace(/^['"]|['"]$/g, '')];
            if (cellSheet) {
                const cell = cellSheet[parts[1].replace(/\$/g, '')];
                criteriaValue = cell ? String(cell.v || '') : '';
            }
        } else if (/^\$?[A-Z]+\$?\d+$/i.test(criteriaValue)) {
            const ws = workbook.Sheets[currentSheetName];
            const cell = ws ? ws[criteriaValue.replace(/\$/g, '')] : null;
            criteriaValue = cell ? String(cell.v || '') : '';
        }

        const criteriaWorksheet = workbook.Sheets[critSheet];
        const sumWorksheet = workbook.Sheets[sumSheet];

        if (!criteriaWorksheet || !sumWorksheet) return null;

        // Parsear los rangos
        const critRangeParsed = parseRange(critRange);
        const sumRangeParsed = parseRange(sumRange);

        let sum = 0;

        // Iterar sobre el rango de criterios
        for (let r = critRangeParsed.startRow; r <= Math.min(critRangeParsed.endRow, 5000); r++) {
            const critAddr = XLSX.utils.encode_cell({ r, c: critRangeParsed.startCol });
            const critCell = criteriaWorksheet[critAddr];
            const critValue = critCell ? String(critCell.v || '') : '';

            // Comparar con el criterio
            if (critValue.toLowerCase().trim() === criteriaValue.toLowerCase().trim()) {
                // Obtener el valor correspondiente del rango de suma
                const sumAddr = XLSX.utils.encode_cell({ r, c: sumRangeParsed.startCol });
                const sumCell = sumWorksheet[sumAddr];

                if (sumCell && typeof sumCell.v === 'number') {
                    sum += sumCell.v;
                }
            }
        }

        return sum;
    } catch (e) {
        return null;
    }
}

// Evalua SUM para un rango
function evaluateSUMRange(sheetName, rangeStr) {
    try {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) return '0';

        const range = parseRange(rangeStr);
        let sum = 0;

        for (let r = range.startRow; r <= Math.min(range.endRow, 5000); r++) {
            for (let c = range.startCol; c <= range.endCol; c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                const cell = worksheet[addr];
                if (cell && typeof cell.v === 'number') {
                    sum += cell.v;
                }
            }
        }

        return sum.toString();
    } catch (e) {
        return '0';
    }
}

// Parsea un rango como "A1:B10" o "A:A"
function parseRange(rangeStr) {
    const clean = rangeStr.replace(/\$/g, '').trim();

    // Rango con filas: A1:B10
    const rowMatch = clean.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/i);
    if (rowMatch) {
        return {
            startCol: XLSX.utils.decode_col(rowMatch[1]),
            startRow: parseInt(rowMatch[2]) - 1,
            endCol: XLSX.utils.decode_col(rowMatch[3]),
            endRow: parseInt(rowMatch[4]) - 1
        };
    }

    // Rango de columna completa: A:A
    const colMatch = clean.match(/([A-Z]+):([A-Z]+)/i);
    if (colMatch) {
        return {
            startCol: XLSX.utils.decode_col(colMatch[1]),
            startRow: 0,
            endCol: XLSX.utils.decode_col(colMatch[2]),
            endRow: 5000
        };
    }

    return { startCol: 0, startRow: 0, endCol: 0, endRow: 0 };
}

function getCalcEngine() {
    if (typeof window.XLSX_CALC === 'function') return window.XLSX_CALC;
    if (typeof window.xlsx_calc === 'function') return window.xlsx_calc;
    if (typeof window.xlsxCalc === 'function') return window.xlsxCalc;
    if (typeof window.XLSXCalc === 'function') return window.XLSXCalc;
    if (typeof window.xlscalc === 'function') return window.xlscalc;
    if (typeof window.xlsxc === 'function') return window.xlsxc;
    if (window.XLSX) {
        if (typeof window.XLSX_CALC === 'function') return window.XLSX_CALC;
        if (typeof window.XLSX_Calc === 'function') return window.XLSX_Calc;
        if (typeof window.XLSX.Calc === 'function') return window.XLSX.Calc;
        if (typeof window.XLSX.calc === 'function') return window.XLSX.calc;
        if (window.XLSX.utils && typeof window.XLSX.utils.calc === 'function') return window.XLSX.utils.calc;
    }
    return null;
}

function suppressConsoleDuring(fn) {
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalLog = console.log;
    console.warn = () => { };
    console.error = () => { };
    console.log = () => { };
    try {
        return fn();
    } finally {
        console.warn = originalWarn;
        console.error = originalError;
        console.log = originalLog;
    }
}

function evaluateWorkbookFormulas() {
    if (!workbook) return;

    // Usar el motor de XLSX-calc
    const calc = getCalcEngine();

    if (typeof calc === 'function') {
        try {
            calc(workbook, { continue_after_error: true, log_error: false });
        } catch (error) {
            // Ignorar errores de xlsx-calc
        }
    }
}

// Evalua una formula manualmente
function evaluateFormula(formula, worksheet) {
    try {
        // Reemplazar referencias de celdas con sus valores
        let evalFormula = formula;

        // Manejar funciones SUM
        evalFormula = evalFormula.replace(/SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/gi, (match, startCol, startRow, endCol, endRow) => {
            let sum = 0;
            const startC = XLSX.utils.decode_col(startCol);
            const endC = XLSX.utils.decode_col(endCol);
            const startR = parseInt(startRow) - 1;
            const endR = parseInt(endRow) - 1;

            for (let r = startR; r <= endR; r++) {
                for (let c = startC; c <= endC; c++) {
                    const addr = XLSX.utils.encode_cell({ r, c });
                    const cell = worksheet[addr];
                    if (cell && typeof cell.v === 'number') {
                        sum += cell.v;
                    }
                }
            }
            return sum.toString();
        });

        // Reemplazar referencias individuales de celdas (soporta $A$1, $A1, A$1, A1)
        evalFormula = evalFormula.replace(/\$?([A-Z]+)\$?(\d+)/gi, (match, col, row) => {
            const addr = col.toUpperCase() + row;
            const cell = worksheet[addr];
            if (cell && cell.v !== undefined) {
                return typeof cell.v === 'number' ? cell.v.toString() : `"${cell.v}"`;
            }
            return '0';
        });

        // Evaluar la expresion matematica
        const result = Function('"use strict"; return (' + evalFormula + ')')();
        return typeof result === 'number' ? result : 0;
    } catch (e) {
        console.warn('[v0] Error evaluando formula:', formula, e);
        return 0;
    }
}

function scheduleRender() {
    if (renderUpdateTimer) {
        clearTimeout(renderUpdateTimer);
    }
    renderUpdateTimer = setTimeout(() => {
        renderUpdateTimer = null;
        renderTable();
    }, 50);
}

function expandWorksheetRef(address) {
    if (!currentWorksheet) return;
    const ref = currentWorksheet['!ref'] || address;
    const range = XLSX.utils.decode_range(ref);
    const cell = XLSX.utils.decode_cell(address);

    if (cell.r < range.s.r) range.s.r = cell.r;
    if (cell.c < range.s.c) range.s.c = cell.c;
    if (cell.r > range.e.r) range.e.r = cell.r;
    if (cell.c > range.e.c) range.e.c = cell.c;

    currentWorksheet['!ref'] = XLSX.utils.encode_range(range);
}

function updateCurrentSheetData() {
    if (!currentWorksheet) return;
    const range = XLSX.utils.decode_range(currentWorksheet['!ref'] || 'A1');
    const rows = [];
    cellFormulas.clear();

    for (let r = range.s.r; r <= range.e.r; ++r) {
        const row = [];
        for (let c = range.s.c; c <= range.e.c; ++c) {
            const address = XLSX.utils.encode_cell({ r, c });
            const cell = currentWorksheet[address];
            if (cell) {
                if (cell.f) {
                    cellFormulas.set(`${r},${c}`, cell.f);
                }
                row.push(cell.v !== undefined ? cell.v : '');
            } else {
                row.push('');
            }
        }
        rows.push(row);
    }

    tableData = rows;
    refreshFormulaInfo();
}

/* Save Excel File */

function saveExcelFile() {
    if (!tableData.length || !workbook) {
        Swal.fire({
            title: 'Sin archivo',
            text: 'Primero selecciona un archivo Excel.',
            icon: 'warning',
            confirmButtonColor: '#2563eb',
            background: '#ffffff',
            color: '#1e293b',
            backdrop: `rgba(0,0,0,0.4)`,
            customClass: {
                popup: 'custom-alert',
                title: 'custom-title',
            }
        });

        return;
    }

    // Mostrar opciones de guardado
    Swal.fire({
        title: 'Guardar archivo',
        text: 'Donde deseas guardar el archivo?',
        icon: 'question',
        showCancelButton: true,
        showDenyButton: !localStorage.getItem('modoOffline'),
        confirmButtonText: '<i class="fa-solid fa-download"></i> Descargar',
        denyButtonText: '<i class="fa-solid fa-cloud-arrow-up"></i> Guardar en servidor',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#2563eb',
        denyButtonColor: '#10b981',
    }).then((result) => {
        if (result.isConfirmed) {
            // Descargar localmente
            evaluateWorkbookFormulas();
            XLSX.writeFile(workbook, 'archivo-editado.xlsx');
            Swal.fire({
                title: 'Archivo descargado',
                text: 'El Excel se descargo correctamente.',
                icon: 'success',
                timer: 1800,
                showConfirmButton: false
            });
        } else if (result.isDenied) {
            // Guardar en el servidor
            guardarEnServidor();
        }
    });
}

// Guardar archivo en el servidor (base de datos)
async function guardarEnServidor() {
    const token = localStorage.getItem('token');
    const restaurante = document.getElementById('restaurantSelect')?.value;

    if (!token) {
        Swal.fire({
            icon: 'error',
            title: 'Sesion expirada',
            text: 'Por favor inicia sesion nuevamente',
        }).then(() => {
            window.location.href = '/';
        });
        return;
    }

    if (!restaurante) {
        Swal.fire({
            icon: 'warning',
            title: 'Restaurante no seleccionado',
            text: 'Por favor selecciona un restaurante antes de guardar',
        });
        return;
    }

    // Mostrar loading
    Swal.fire({
        title: 'Guardando...',
        text: 'Subiendo archivo al servidor',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        // Convertir workbook a archivo
        evaluateWorkbookFormulas();
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        // Crear FormData
        const formData = new FormData();
        const nombreArchivo = statusText?.textContent || 'archivo-excel.xlsx';
        formData.append('archivo', blob, nombreArchivo);
        formData.append('restaurante', restaurante);
        formData.append('procesar_datos', 'true');

        const response = await fetch(`${window.API_URL}/archivos/subir`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.success) {
            archivoActualId = data.archivo.id;

            if (typeof setCurrentArchivoId === 'function') {
                setCurrentArchivoId(data.archivo.id);
            }

            localStorage.setItem('archivo_id', data.archivo.id);

            console.log('Archivo ID asignado:', data.archivo.id);

            Swal.fire({
                icon: 'success',
                title: 'Archivo guardado',
                html: `
                    <p>El archivo se guardo correctamente en el servidor.</p>
                    <p style="font-size: 13px; color: #666; margin-top: 10px;">
                        ID: ${data.archivo.id}<br>
                        Registros procesados: ${data.registros_procesados || 0}
                    </p>
                `,
                confirmButtonColor: '#10b981'
            });
        } else {
            throw new Error(data.message || 'Error al guardar');
        }
    } catch (error) {
        console.error('Error guardando archivo:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error al guardar',
            text: error.message || 'No se pudo guardar el archivo en el servidor',
        });
    }
}

function refreshFormulaInfo() {
    const formulaCount = cellFormulas.size;
    const formulaInfo = document.getElementById('formulaInfo');
    if (formulaInfo) {
        formulaInfo.textContent = `Formulas: ${formulaCount}`;
    }
}

/* Mostrar Hojas Disponibles */

function renderSheetSelector() {
    if (!sheetSelector) return;
    sheetSelector.innerHTML = '';

    workbook.SheetNames.forEach(name => {
        const option = document.createElement('option');

        option.value = name;
        option.textContent = name;

        if (name === currentSheetName) {
            option.selected = true;
        }

        sheetSelector.appendChild(option);
    });
}

/* Change Sheet */

if (sheetSelector) {
    sheetSelector.addEventListener('change', function () {
        currentSheetName = this.value;
        loadSheet(currentSheetName);
    });
}

/* Load Sheet Data */

function loadSheet(sheet) {
    currentSheetName = sheet;
    const worksheet = workbook.Sheets[sheet];
    currentWorksheet = worksheet;
    cellFormulas.clear();

    evaluateWorkbookFormulas();
    updateCurrentSheetData();

    if (sheetName) {
        sheetName.textContent = `Hoja: ${sheet}`;
    }

    // Resetear el estado de validación al cargar una nueva hoja
    if (typeof rowValidation !== 'undefined') {
        rowValidation = [];
    }
    updateValidationStatus('Validacion pendiente - Presiona "Validar" para verificar los conceptos', '');

    renderTable();
}
