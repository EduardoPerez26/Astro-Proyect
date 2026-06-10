// Sistema de validacion principal
const VALIDATOR_API_URL = window.API_URL;
let conceptColumnIndex = 0;
let currentValidator = null;
let currentArchivoId =
    localStorage.getItem('archivo_id') || null; // ID del archivo cargado

const conceptColumnSelect = document.getElementById('conceptColumnSelect');
const validationStatus = document.getElementById('validationStatus');
const validateBtn = document.getElementById('validateBtn');
const restaurantSelect = document.getElementById('restaurantSelect');

// Mapa de validadores disponibles
const validators = {
    'taco-bell': () => window.TacoBellValidator,
    'burger-king': () => window.BurgerKingValidator,
    'popeyes': () => window.PopeyesValidator,
    'kfc': () => window.KFCValidator
};

function setValidator(restaurantId) {

    console.log('restaurantId recibido:', restaurantId);
    console.log('validators disponibles:', Object.keys(validators));

    const getValidator = validators[restaurantId];

    if (getValidator) {
        currentValidator = getValidator();

        console.log('Validador cargado:', currentValidator.name);

        updateValidationStatus(
            `Validador: ${currentValidator.name} - Presiona "Validar" para verificar los conceptos`,
            ''
        );
    } else {
        console.error('No existe validador para:', restaurantId);

        currentValidator = null;

        updateValidationStatus(
            'Selecciona un restaurante para validar',
            ''
        );
    }
}

function normalizeConcept(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function updateValidationStatus(message, statusClass = '') {
    if (!validationStatus) return;
    validationStatus.textContent = message;
    validationStatus.className = 'validation-status';
    if (statusClass) {
        validationStatus.classList.add(statusClass);
    }
}

function validateConcepts() {
    if (!currentValidator) {
        Swal.fire({
            title: 'Sin validador',
            text: 'Primero selecciona un restaurante para validar.',
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

    if (typeof rowValidation === 'undefined') {
        window.rowValidation = [];
    } else {
        rowValidation = [];
    }

    if (typeof tableData === 'undefined' || !tableData.length) {
        updateValidationStatus('No hay datos para validar.', 'alert');
        return;
    }

    const expectedConcepts = currentValidator.expectedConcepts;
    const conceptMap = new Map(expectedConcepts.map(concept => [normalizeConcept(concept), concept]));
    const foundConcepts = new Set();
    const unknownRows = [];
    const columnCount = tableData[0].length || 1;

    for (let i = 0; i < tableData.length; i++) {
        const conceptCell = tableData[i][conceptColumnIndex];

        if (!conceptCell) {
            continue;
        }

        const ignoredConcepts = [
            'MEMO',
            'CONCEPT',
            'CONCEPTO'
        ];

        if (
            ignoredConcepts.includes(
                String(conceptCell).trim().toUpperCase()
            )
        ) {
            continue;
        }

        const normalizedConcept = normalizeConcept(conceptCell);

        if (!normalizedConcept) {
            continue;
        }

        if (conceptMap.has(normalizedConcept)) {
            foundConcepts.add(normalizedConcept);
        } else {
            rowValidation[i] = 'unknown';
            unknownRows.push(conceptCell);
        }
    }

    const missingConcepts = expectedConcepts.filter(concept => !foundConcepts.has(normalizeConcept(concept)));

    if (missingConcepts.length) {
        missingConcepts.forEach(concept => {
            const newRow = new Array(columnCount).fill('');
            newRow[conceptColumnIndex] = concept;
            tableData.push(newRow);
            rowValidation[tableData.length - 1] = 'missing';
        });
    }

    let message = '';
    let statusClass = 'success';

    if (missingConcepts.length) {
        message += `Faltan conceptos: ${missingConcepts.join(', ')}. Se agregaron filas vacias para ellos.`;
        statusClass = 'alert';
    }

    if (unknownRows.length) {
        if (message) {
            message += ' ';
        }
        const unknownUnique = [...new Set(unknownRows)];
        message += `Conceptos no reconocidos: ${unknownUnique.join(', ')}.`;
        statusClass = 'alert';
    }

    if (!message) {
        message = `${currentValidator.name}: Todos los conceptos validos estan presentes.`;
    }

    updateValidationStatus(message, statusClass);

    // Construir HTML para la alerta
    let alertHtml = '';

    if (missingConcepts.length) {
        alertHtml += `
            <div style="text-align:left; margin-bottom: 16px;">
                <h4 style="color: #dc2626; font-size: 16px; font-weight: 600; margin-bottom: 8px;">
                    <i class="fa-solid fa-circle-exclamation" style="margin-right: 8px;"></i>
                    Conceptos Faltantes (${missingConcepts.length})
                </h4>
                <ul style="list-style: none; padding: 0; margin: 0; max-height: 150px; overflow-y: auto;">
                    ${missingConcepts.map(c => `
                        <li style="padding: 6px 12px; background: #fef2f2; border-left: 3px solid #dc2626; margin-bottom: 4px; border-radius: 4px; font-size: 14px;">
                            ${c}
                        </li>
                    `).join('')}
                </ul>
                <p style="font-size: 12px; color: #6b7280; margin-top: 8px;">
                    Se agregaron filas vacias para estos conceptos al final de la tabla.
                </p>
            </div>
        `;
    }

    if (unknownRows.length) {
        const unknownUnique = [...new Set(unknownRows)];
        alertHtml += `
            <div style="text-align:left;">
                <h4 style="color: #f59e0b; font-size: 16px; font-weight: 600; margin-bottom: 8px;">
                    <i class="fa-solid fa-triangle-exclamation" style="margin-right: 8px;"></i>
                    Conceptos No Reconocidos (${unknownUnique.length})
                </h4>
                <ul style="list-style: none; padding: 0; margin: 0; max-height: 150px; overflow-y: auto;">
                    ${unknownUnique.map(c => `
                        <li style="padding: 6px 12px; background: #fffbeb; border-left: 3px solid #f59e0b; margin-bottom: 4px; border-radius: 4px; font-size: 14px;">
                            ${c}
                        </li>
                    `).join('')}
                </ul>
                <p style="font-size: 12px; color: #6b7280; margin-top: 8px;">
                    Estos conceptos estan en el archivo pero no en la lista de validacion.
                </p>
            </div>
        `;
    }

    if (statusClass === 'alert') {
        Swal.fire({
            title: `Validacion ${currentValidator.name}`,
            html: alertHtml,
            icon: 'warning',
            background: '#ffffff',
            color: '#1e293b',
            confirmButtonColor: '#2563eb',
            confirmButtonText: 'Entendido',
            width: '550px',
            backdrop: `rgba(0,0,0,0.4)`,
            customClass: {
                popup: 'custom-alert',
                title: 'custom-title',
                confirmButton: 'custom-confirm',
                cancelButton: 'custom-cancel'
            }
        });
    } else {
        Swal.fire({
            title: `Validacion ${currentValidator.name}`,
            html: `
                <div style="text-align: center;">
                    <i class="fa-solid fa-circle-check" style="font-size: 48px; color: #22c55e; margin-bottom: 16px;"></i>
                    <p style="font-size: 16px; color: #1e293b;">Todos los conceptos validos estan presentes.</p>
                    <p style="font-size: 14px; color: #6b7280;">${expectedConcepts.length} conceptos verificados</p>
                </div>
            `,
            icon: null,
            background: '#ffffff',
            color: '#1e293b',
            confirmButtonColor: '#22c55e',
            timer: 2500,
            showConfirmButton: false,
            backdrop: `rgba(0,0,0,0.4)`,
            customClass: {
                popup: 'custom-alert',
                title: 'custom-title',
                confirmButton: 'custom-confirm',
                cancelButton: 'custom-cancel'
            }
        });
    }

    // Guardar historial de validacion en la base de datos
    guardarHistorialValidacion({
        tipoValidacion: 'conceptos',
        resultado: statusClass === 'success' ? 'exitoso' : (missingConcepts.length > 0 ? 'con_errores' : 'con_advertencias'),
        totalErrores: missingConcepts.length + unknownRows.length,
        detalleErrores: {
            faltantes: missingConcepts,
            noReconocidos: [...new Set(unknownRows)]
        }
    });
}

// Event listeners
if (conceptColumnSelect) {
    conceptColumnSelect.addEventListener('change', function () {
        conceptColumnIndex = Number(this.value);
    });
}

if (restaurantSelect) {
    restaurantSelect.addEventListener('change', function () {
        setValidator(this.value);
    });

    // Cargar validador inicial si hay uno seleccionado
    if (restaurantSelect.value) {
        setValidator(restaurantSelect.value);
    }
}

if (validateBtn) {
    validateBtn.addEventListener('click', function () {
        if (typeof workbook === 'undefined' || !workbook || typeof tableData === 'undefined' || !tableData.length) {
            Swal.fire({
                title: 'Sin archivo',
                text: 'Primero sube un archivo Excel para validar.',
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
        validateConcepts();
        if (typeof renderTable === 'function') {
            renderTable();
        }
    });
}

// Cargar validador desde URL si viene especificado
function loadValidatorFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const restaurant = urlParams.get('restaurant');
    if (restaurant && validators[restaurant]) {
        setValidator(restaurant);
        if (restaurantSelect) {
            restaurantSelect.value = restaurant;
        }
    }
}

// Inicializar al cargar la pagina
document.addEventListener('DOMContentLoaded', loadValidatorFromURL);

// ============================================
// GUARDAR HISTORIAL DE VALIDACION
// ============================================
// ============================================
// GUARDAR HISTORIAL DE VALIDACION
// ============================================
async function guardarHistorialValidacion(validacionData) {
    const token = localStorage.getItem('token');

    console.log('====================================');
    console.log('DEBUG VALIDACION');
    console.log({
        token,
        modoOffline: localStorage.getItem('modoOffline'),
        currentArchivoId
    });

    console.log(
        'EVAL:',
        '!token =', !token,
        '| modoOffline =', localStorage.getItem('modoOffline'),
        '| !currentArchivoId =', !currentArchivoId
    );

    const bloquear =
        !token ||
        localStorage.getItem('modoOffline') ||
        !currentArchivoId;

    console.log('BLOQUEAR =', bloquear);

    if (bloquear) {
        console.log('[v0] Historial no guardado');
        return;
    }

    console.log('VA A HACER FETCH');

    try {

        const payload = {
            archivo_id: currentArchivoId,
            tipo_validacion: validacionData.tipoValidacion || 'conceptos',
            resultado: validacionData.resultado || 'exitoso',
            total_errores: validacionData.totalErrores || 0,
            detalle_errores: JSON.stringify(
                validacionData.detalleErrores || {}
            ),
            duracion_segundos: validacionData.duracion || 0
        };

        console.log('POST URL:', `${VALIDATOR_API_URL}/validaciones`);
        console.log('PAYLOAD:', payload);

        const response = await fetch(
            `${window.API_URL}/validaciones`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            }
        );

        console.log('STATUS:', response.status);
        console.log('OK:', response.ok);

        const responseText = await response.text();

        console.log('RESPONSE:', responseText);

        if (!response.ok) {
            console.warn(
                'No se pudo guardar el historial de validacion'
            );
            return;
        }

        console.log(
            'Historial guardado correctamente'
        );

    } catch (error) {

        console.error(
            'Error guardando historial:',
            error
        );

    }

    console.log('====================================');
}

// Funcion para establecer el ID del archivo actual
function setCurrentArchivoId(id) {
    currentArchivoId = id;

    if (id) {
        localStorage.setItem('archivo_id', id);
    }

    console.log('[VALIDADOR] archivo_id:', currentArchivoId);
}

function normalizeConcept(concept) {
    return String(concept || '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\s*-\s*/g, ' - ')
        .toUpperCase();
}



