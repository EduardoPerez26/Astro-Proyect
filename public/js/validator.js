// ================================
// Sistema de validación principal
// ================================

let conceptColumnIndex = 0;
let currentValidator = null;
let currentArchivoId = null;

// Elementos del DOM
const conceptColumnSelect = document.getElementById('conceptColumnSelect');
const validationStatus = document.getElementById('validationStatus');
const validateBtn = document.getElementById('validateBtn');
const restaurantSelect = document.getElementById('restaurantSelect');

// ================================
// Validadores disponibles
// ================================
const validators = {
    'taco-bell': () => window.TacoBellValidator,
    'burger-king': () => window.BurgerKingValidator,
    'popeyes': () => window.PopeyesValidator,
    'kfc': () => window.KFCValidator
};

// ================================
// Funciones auxiliares
// ================================
function setValidator(restaurantId) {
    const getValidator = validators[restaurantId];
    if (getValidator) {
        currentValidator = getValidator();
        console.log(`Validador cargado: ${currentValidator.name}`);
        updateValidationStatus(`Validador: ${currentValidator.name} - Presiona "Validar" para verificar los conceptos`);
    } else {
        currentValidator = null;
        updateValidationStatus('Selecciona un restaurante para validar');
    }
}

function normalizeConcept(value) {
    return String(value || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // eliminar acentos
        .trim().replace(/\s+/g, ' ')
        .toLowerCase();
}

function updateValidationStatus(message, statusClass = '') {
    if (!validationStatus) return;
    validationStatus.textContent = message;
    validationStatus.className = 'validation-status';
    if (statusClass) validationStatus.classList.add(statusClass);
}

// ================================
// Validación de conceptos
// ================================
function validateConcepts() {
    if (!currentValidator) {
        Swal.fire({
            title: 'Sin validador',
            text: 'Primero selecciona un restaurante para validar.',
            icon: 'warning',
            confirmButtonColor: '#2563eb',
            background: '#ffffff',
            color: '#1e293b',
            backdrop: 'rgba(0,0,0,0.4)',
            customClass: { popup: 'custom-alert', title: 'custom-title' }
        });
        return { errores: [], tiempoValidacion: 0 };
    }

    window.rowValidation = [];

    if (!tableData || !tableData.length) {
        updateValidationStatus('No hay datos para validar.', 'alert');
        return { errores: [], tiempoValidacion: 0 };
    }

    const startTime = performance.now();

    const expectedConcepts = currentValidator.expectedConcepts;
    const conceptMap = new Map(expectedConcepts.map(c => [normalizeConcept(c), c]));
    const foundConcepts = new Set();
    const unknownRows = [];
    const columnCount = tableData[0].length || 1;

    for (let i = 0; i < tableData.length; i++) {
        const conceptCell = tableData[i][conceptColumnIndex];
        const normalizedConcept = normalizeConcept(conceptCell);

        if (!normalizedConcept) continue;

        if (conceptMap.has(normalizedConcept)) {
            foundConcepts.add(normalizedConcept);
        } else {
            rowValidation[i] = 'unknown';
            unknownRows.push(conceptCell);
        }
    }

    const missingConcepts = expectedConcepts.filter(c => !foundConcepts.has(normalizeConcept(c)));
    if (missingConcepts.length) {
        missingConcepts.forEach(concept => {
            const newRow = new Array(columnCount).fill('');
            newRow[conceptColumnIndex] = concept;
            tableData.push(newRow);
            rowValidation[tableData.length - 1] = 'missing';
        });
    }

    // Mensaje y alerta
    let message = '';
    let statusClass = 'success';
    if (missingConcepts.length) {
        message += `Faltan conceptos: ${missingConcepts.join(', ')}. Se agregaron filas vacías para ellos. `;
        statusClass = 'alert';
    }
    if (unknownRows.length) {
        const unknownUnique = [...new Set(unknownRows)];
        message += `Conceptos no reconocidos: ${unknownUnique.join(', ')}.`;
        statusClass = 'alert';
    }
    if (!message) {
        message = `${currentValidator.name}: Todos los conceptos válidos están presentes.`;
    }
    updateValidationStatus(message, statusClass);

    const tiempoValidacion = (performance.now() - startTime) / 1000;

    const errores = rowValidation
        .map((status, idx) => status === 'unknown' ? { fila: idx+1, mensaje: tableData[idx][conceptColumnIndex] } : null)
        .filter(Boolean);

    return { errores, tiempoValidacion };
}

// ================================
// Guardar validación en backend
// ================================
async function guardarValidacion({
    archivoActualId,
    tipo_validacion,
    resultado,
    total_errores,
    detalle_errores,
    duracion_segundos
}) {
    try {
        if (!archivoActualId) {
            throw new Error('No hay archivo guardado para asociar la validación');
        }

        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('No existe token de autenticación');
        }

        const payload = {
            archivo_id: archivoActualId,
            tipo_validacion,
            resultado,
            total_errores,
            detalle_errores,
            duracion_segundos
        };

        console.log('Enviando validación:', payload);

        const response = await fetch(`${window.API_URL}/api/validaciones`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('Respuesta no es JSON:', responseText);
            throw new Error(`El servidor devolvió una respuesta inválida (${response.status})`);
        }

        if (!response.ok) {
            throw new Error(data.message || `Error HTTP ${response.status}`);
        }

        if (!data.success) {
            throw new Error(data.message || 'No se pudo guardar la validación');
        }

        console.log('Validación guardada:', data);

        updateValidationStatus('Validación guardada correctamente', 'success');

        Swal.fire({
            icon: 'success',
            title: 'Validación guardada',
            text: 'La validación se guardó correctamente en el servidor',
            confirmButtonColor: '#10b981'
        });

        return data;

    } catch (error) {
        console.error('Error guardando validación:', error);
        updateValidationStatus(`Error: ${error.message}`, 'alert');
        Swal.fire({
            icon: 'error',
            title: 'Error al guardar validación',
            text: error.message,
            confirmButtonColor: '#2563eb'
        });
        throw error;
    }
}

// ================================
// Event listeners
// ================================
if (conceptColumnSelect) {
    conceptColumnSelect.addEventListener('change', () => {
        conceptColumnIndex = Number(conceptColumnSelect.value);
    });
}

if (restaurantSelect) {
    restaurantSelect.addEventListener('change', () => setValidator(restaurantSelect.value));
    if (restaurantSelect.value) setValidator(restaurantSelect.value);
}

if (validateBtn) {
    validateBtn.addEventListener('click', async () => {
        if (!workbook || !tableData?.length) {
            Swal.fire({
                title: 'Sin archivo',
                text: 'Primero sube un archivo Excel para validar.',
                icon: 'warning',
                confirmButtonColor: '#2563eb',
                background: '#ffffff',
                color: '#1e293b',
                backdrop: 'rgba(0,0,0,0.4)',
                customClass: { popup: 'custom-alert', title: 'custom-title' }
            });
            return;
        }

        const { errores, tiempoValidacion } = validateConcepts();

        await guardarValidacion({
            archivoActualId: currentArchivoId,
            tipo_validacion: 'datos',
            resultado: errores.length ? 'con_errores' : 'exitoso',
            total_errores: errores.length,
            detalle_errores: errores,
            duracion_segundos: tiempoValidacion
        });

        if (typeof renderTable === 'function') renderTable();
    });
}

// ================================
// Cargar validador desde URL
// ================================
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const restaurant = urlParams.get('restaurant');
    if (restaurant && validators[restaurant]) {
        setValidator(restaurant);
        if (restaurantSelect) restaurantSelect.value = restaurant;
    }
});