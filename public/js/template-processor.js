
const templateConfig = {
    // ========================================
    // TACO BELL
    // ========================================
    'taco-bell': {
        templateFile: 'template-taco-bell.xlsx',
        sourceSheet: 'Sales',
        preserveFormulas: true,
        replaceSheet: true,
    },

    // ========================================
    // BURGER KING
    // ========================================
    'burger-king': {
        templateFile: 'template-burger-king.xlsx',
        targetSheet: 'Conciliation',
        startRow: 2,
        columnMapping: {
            'A': 'A',  // Codigo
            'B': 'C',  // Fecha (en datos esta en C)
            'C': 'B',  // Sucursal (en datos esta en B)
            'D': 'D',  // Importe
            'E': 'E',  // Metodo pago
            'F': 'G',  // Observaciones (en datos esta en G)
        },
        copySheets: ['Ventas', 'Pagos'],
        transforms: {
            'D': 'number',
            'B': 'date',
        }
    },

    // ========================================
    // POPEYES
    // ========================================
    'popeyes': {
        templateFile: 'template-popeyes.xlsx',
        targetSheet: 'Conciliation',
        startRow: 2,
        columnMapping: {
            'A': 'A',
            'B': 'B',
            'C': 'C',
            'D': 'D',
            'E': 'E',
            'F': 'F',
        },
        copySheets: [],
        transforms: {
            'D': 'number',
        }
    },

    // ========================================
    // KFC
    // ========================================
    'kfc': {
        templateFile: 'template-kfc.xlsx',
        targetSheet: 'Conciliation',
        startRow: 2,
        columnMapping: {
            'A': 'B',  // En KFC los datos vienen con estructura diferente
            'B': 'A',
            'C': 'D',
            'D': 'C',
            'E': 'E',
            'F': 'F',
        },
        copySheets: ['Detalle'],
        transforms: {
            'D': 'number',
            'B': 'date',
        }
    }
};

// ============================================
// FUNCIONES DE PROCESAMIENTO DE TEMPLATES
// ============================================

/**
 * Obtiene la configuracion de un restaurante
 */
function getTemplateConfig(restaurant) {
    return templateConfig[restaurant] || null;
}

/**
 * Convierte letra de columna a indice (A=0, B=1, etc.)
 */
function columnToIndex(col) {
    let index = 0;
    for (let i = 0; i < col.length; i++) {
        index = index * 26 + col.charCodeAt(i) - 64;
    }
    return index - 1;
}

/**
 * Convierte indice a letra de columna (0=A, 1=B, etc.)
 */
function indexToColumn(index) {
    let col = '';
    index++;
    while (index > 0) {
        const mod = (index - 1) % 26;
        col = String.fromCharCode(65 + mod) + col;
        index = Math.floor((index - mod) / 26);
    }
    return col;
}

/**
 * Aplica transformacion a un valor segun el tipo
 */
function applyTransform(value, type) {
    if (value === null || value === undefined || value === '') {
        return value;
    }

    switch (type) {
        case 'number':
            const num = parseFloat(value);
            return isNaN(num) ? value : num;

        case 'date':
            if (typeof value === 'number') {
                // Excel serial date
                return value;
            }
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                // Convertir a serial de Excel
                return (date.getTime() / 86400000) + 25569;
            }
            return value;

        case 'text':
            return String(value);

        case 'uppercase':
            return String(value).toUpperCase();

        case 'lowercase':
            return String(value).toLowerCase();

        default:
            return value;
    }
}

/**
 * Carga un template desde la carpeta /templates/
 */
async function loadTemplate(templateFile) {
    try {
        const response = await fetch(`/templates/${templateFile}`);
        if (!response.ok) {
            throw new Error(`Template no encontrado: ${templateFile}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        return XLSX.read(data, { type: 'array' });
    } catch (error) {
        console.error('Error cargando template:', error);
        throw error;
    }
}

/**
 * Llena el template con los datos del archivo subido
 */
async function fillTemplateWithData(dataWorkbook, restaurant) {

    const config = getTemplateConfig(restaurant);

    if (!config) {
        throw new Error(`No hay configuracion de template para: ${restaurant}`);
    }

    let templateWorkbook;

    try {
        templateWorkbook = await loadTemplate(config.templateFile);
    } catch (error) {
        console.warn('Template no encontrado, usando archivo de datos como base');
        return dataWorkbook;
    }

    // ====================================================
    // TACO BELL
    // ====================================================
    if (restaurant === 'taco-bell') {
        // Para Taco Bell usamos la hoja configurada (sourceSheet)
        // y validamos que exista en el template.
        replaceSalesData(
            templateWorkbook,
            dataWorkbook,
            config.sourceSheet || 'Sales'
        );

        return templateWorkbook;
    }


    // ====================================================
    // RESTO DE RESTAURANTES
    // ====================================================

    const targetSheet =
        templateWorkbook.Sheets[config.targetSheet];

    if (!targetSheet) {
        throw new Error(
            `Hoja "${config.targetSheet}" no encontrada`
        );
    }

    const dataSheet =
        dataWorkbook.Sheets[dataWorkbook.SheetNames[0]];

    const dataRange = XLSX.utils.decode_range(
        dataSheet['!ref'] || 'A1'
    );

    for (let row = 1; row <= dataRange.e.r; row++) {

        const targetRow =
            config.startRow + row - 1;

        for (const [templateCol, dataCol]
            of Object.entries(config.columnMapping)) {

            const dataAddr =
                dataCol + (row + 1);

            const templateAddr =
                templateCol + targetRow;

            const dataCell =
                dataSheet[dataAddr];

            if (!dataCell) continue;

            let value = dataCell.v;

            if (
                config.transforms &&
                config.transforms[templateCol]
            ) {
                value = applyTransform(
                    value,
                    config.transforms[templateCol]
                );
            }

            targetSheet[templateAddr] = {
                t: typeof value === 'number'
                    ? 'n'
                    : 's',
                v: value
            };
        }
    }

    const lastRow =
        config.startRow + dataRange.e.r;

    const lastCol =
        Object.keys(config.columnMapping)
            .sort()
            .pop();

    targetSheet['!ref'] =
        `A1:${lastCol}${lastRow}`;

    if (config.copySheets?.length) {

        for (const sheetName of config.copySheets) {

            if (dataWorkbook.Sheets[sheetName]) {

                if (
                    !templateWorkbook.SheetNames.includes(sheetName)
                ) {
                    templateWorkbook.SheetNames.push(sheetName);
                }

                templateWorkbook.Sheets[sheetName] =
                    dataWorkbook.Sheets[sheetName];
            }
        }
    }

    return templateWorkbook;
}

/**
 * Procesa un archivo con template
 * Esta es la funcion principal que se llama desde el editor
 */
async function processWithTemplate(file, restaurant) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async function (e) {
            try {
                const data = new Uint8Array(e.target.result);
                const dataWorkbook = XLSX.read(data, { type: 'array' });

                // Llenar el template con los datos
                const filledWorkbook =
                    await fillTemplateWithData(
                        dataWorkbook,
                        restaurant
                    );

                filledWorkbook.Workbook =
                    filledWorkbook.Workbook || {};

                filledWorkbook.Workbook.CalcPr = {
                    calcId: "999999",
                    fullCalcOnLoad: true,
                    forceFullCalc: true
                };

                resolve(filledWorkbook);
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = function () {
            reject(new Error('Error leyendo el archivo'));
        };

        reader.readAsArrayBuffer(file);
    });
}

function copySheetData(sourceSheet, targetSheet) {

    const range = XLSX.utils.decode_range(
        sourceSheet['!ref'] || 'A1'
    );

    for (let r = range.s.r; r <= range.e.r; r++) {

        for (let c = range.s.c; c <= range.e.c; c++) {

            const addr =
                XLSX.utils.encode_cell({ r, c });

            const sourceCell =
                sourceSheet[addr];

            if (sourceCell) {

                targetSheet[addr] = {
                    ...sourceCell
                };

            } else {

                delete targetSheet[addr];

            }
        }
    }

    targetSheet['!ref'] =
        sourceSheet['!ref'];
}

function replaceSalesData(templateWorkbook, dataWorkbook, sourceSheetName = 'Sales') {

    const templateSales =
        templateWorkbook.Sheets[sourceSheetName];

    if (!templateSales) {
        throw new Error(`Hoja "${sourceSheetName}" no encontrada en el template`);
    }


    const sourceSheet =
        dataWorkbook.Sheets[dataWorkbook.SheetNames[0]];

    const range =
        XLSX.utils.decode_range(
            sourceSheet['!ref']
        );

    for (let R = range.s.r; R <= range.e.r; R++) {

        for (let C = range.s.c; C <= range.e.c; C++) {

            const addr =
                XLSX.utils.encode_cell({
                    r: R,
                    c: C
                });

            const sourceCell =
                sourceSheet[addr];

            if (sourceCell) {

                templateSales[addr] = {
                    ...sourceCell
                };

            } else {

                delete templateSales[addr];

            }
        }
    }

    templateSales['!ref'] =
        sourceSheet['!ref'];
}

// Exportar para uso global
window.templateConfig = templateConfig;
window.getTemplateConfig = getTemplateConfig;
window.loadTemplate = loadTemplate;
window.fillTemplateWithData = fillTemplateWithData;
window.processWithTemplate = processWithTemplate;
