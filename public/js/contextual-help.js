(function () {
    'use strict';

    // Contenido por ruta. window.location.pathname sin querystring ni slash final.
    const HELP_CONTENT = {
        '/views/tiendas': {
            title: 'Reconciliation modules',
            summary: 'Elige una marca para cargar sus fuentes de datos y preparar el archivo contable diario.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Seleccionar una marca (Taco Bell, Burger King, Popeyes...) para iniciar su conciliación.',
                        'Ver cuántas fuentes de datos requiere cada marca y su estado de habilitación.',
                        'Revisar diferencias antes de generar el archivo contable.'
                    ]
                },
                {
                    heading: 'Tips',
                    items: [
                        'Una marca deshabilitada significa que su configuración contable está en revisión.',
                        'El badge muestra cuántas fuentes de datos (Sales, EBT, etc.) necesita cada flujo.'
                    ]
                }
            ]
        },
        '/views/documentos': {
            title: 'Documents',
            summary: 'Todos los archivos Excel subidos al sistema, con su estado dentro del flujo documental.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Buscar un archivo por nombre o restaurante.',
                        'Filtrar por restaurante o por estado (borrador, en revisión, aprobado, archivado...).',
                        'Exportar el listado filtrado a CSV.'
                    ]
                },
                {
                    heading: 'Tips',
                    items: [
                        'Los estados "Legacy" corresponden a documentos migrados antes del flujo actual.',
                        'Cada documento conserva versiones inmutables: nada se sobrescribe.'
                    ]
                }
            ]
        },
        '/views/historial': {
            title: 'Comparison history',
            summary: 'Consulta cuándo cambió un archivo, qué tiendas se vieron afectadas y qué montos se modificaron.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Buscar por restaurante, usuario o fecha.',
                        'Ver cuántas comparaciones tuvieron diferencias frente a las que quedaron iguales.',
                        'Exportar un resumen de la actividad de comparación.'
                    ]
                },
                {
                    heading: 'Tips',
                    items: [
                        'Este historial es la fuente de verdad para auditar cambios en archivos ya procesados.'
                    ]
                }
            ]
        },
        '/views/departments/dashboard-property': {
            title: 'Property schedules',
            summary: 'Punto de entrada a los cronogramas de Property Management y Prepaid Amortization.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Elegir entre el módulo de cronogramas estándar o el de amortización de prepagos.',
                        'Ver el total de cronogramas guardados, el período más reciente y el saldo total.'
                    ]
                }
            ]
        },
        '/views/departments/prepaid-amortization': {
            title: 'Prepaid Amortization',
            summary: 'Controla el calendario de amortización de gastos prepagados.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Registrar un nuevo prepago y su cronograma de amortización.',
                        'Ver el saldo pendiente por período.'
                    ]
                }
            ]
        },
        '/views/departments/property-management-documents': {
            title: 'Property Documents',
            summary: 'Cronogramas y archivos fuente guardados para Property Management.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Buscar por cronograma, archivo, tipo o período.',
                        'Filtrar por categoría: cronogramas, cronogramas de prepago o archivos fuente.',
                        'Filtrar por rango de fechas y tipo de archivo.'
                    ]
                }
            ]
        },
        '/views/departments/property-management': {
            title: 'Property Management',
            summary: 'Carga reportes fuente, abre cronogramas guardados y revisa el sales tax payable antes de exportar.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Subir el Dimension Balance report (obligatorio) para generar el cronograma por tienda.',
                        'Agregar archivos mensuales adicionales al cronograma.',
                        'Cambiar a Prepaid Bills o a Documents desde los accesos rápidos del encabezado.'
                    ]
                }
            ]
        },
        '/views/approval-center': {
            title: 'Approval Center',
            summary: 'Revisa y aprueba solicitudes pendientes de tu área.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Filtrar por departamento, tipo o estado.',
                        'Aprobar o rechazar con un comentario de auditoría.'
                    ]
                }
            ]
        },
        '/views/report-center': {
            title: 'Reports Center',
            summary: 'Genera, programa y exporta reportes corporativos.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Correr un reporte por tienda, departamento o rango de fechas.',
                        'Guardar una configuración como entrega programada.',
                        'Exportar resultados a Excel conservando el formato.'
                    ]
                },
                {
                    heading: 'Tips',
                    items: [
                        'Usa "Saved views" para volver a correr un reporte sin reingresar filtros.',
                        'Los reportes programados se envían por correo automáticamente.'
                    ]
                }
            ]
        },
        '/views/dashboard-admin': {
            title: 'Admin dashboard',
            summary: 'Vista consolidada de usuarios, departamentos, documentos, validaciones y actividad administrativa.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Ver la carga de trabajo de los últimos 7 días de un vistazo.',
                        'Saltar directo a Usuarios, Tiendas u otros módulos con los accesos rápidos.',
                        'Activar auto-refresh para mantener los datos en vivo.'
                    ]
                }
            ]
        },
        '/views/system-center': {
            title: 'System Center',
            summary: 'Monitorea la salud de las integraciones en tiempo real.',
            sections: [
                {
                    heading: 'Qué significa cada estado',
                    items: [
                        'Online: la integración respondió correctamente.',
                        'Warning: respondió, pero con datos incompletos, sin configurar o con lentitud.',
                        'Offline: no respondió dentro del tiempo límite.'
                    ]
                },
                {
                    heading: 'Tips',
                    items: [
                        'Los administradores reciben una notificación y un correo cuando una integración cambia de estado.'
                    ]
                }
            ]
        },
        '/views/audit-center': {
            title: 'Audit Center',
            summary: 'Historial inmutable de acciones sensibles en la plataforma.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Buscar acciones por usuario, módulo o fecha.',
                        'Exportar el registro de auditoría para revisiones externas.'
                    ]
                }
            ]
        },
        '/views/usuarios': {
            title: 'Users and departments',
            summary: 'Administra identidades, roles operativos, asignación de departamentos y estado de cuenta.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Crear un nuevo usuario o un nuevo departamento.',
                        'Editar el rol, departamento y estado de una cuenta existente.',
                        'Ir a Permisos para ajustar el acceso granular de una cuenta.'
                    ]
                }
            ]
        },
        '/views/permisos': {
            title: 'Access policy editor',
            summary: 'Configura visibilidad de módulos, acciones operativas y el workspace inicial de una cuenta.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Activar o desactivar módulos visibles para la cuenta seleccionada.',
                        'Definir qué acciones puede ejecutar dentro de cada módulo.',
                        'Guardar la política y volver al directorio de usuarios.'
                    ]
                },
                {
                    heading: 'Tips',
                    items: [
                        'Sigue el principio de menor privilegio: otorga solo lo que el rol necesita.'
                    ]
                }
            ]
        },
        '/views/restaurantes': {
            title: 'Restaurant availability',
            summary: 'Habilita o deshabilita el acceso a cada flujo de conciliación (solo administradores).',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Activar o restringir un restaurante usando el control de cada fila.',
                        'Ver el total de restaurantes disponibles frente a los restringidos.',
                        'Refrescar los estados para confirmar el cambio aplicado.'
                    ]
                },
                {
                    heading: 'Tips',
                    items: [
                        'Los cambios se aplican de inmediato, sin tablas ni configuración adicional.'
                    ]
                }
            ]
        },
        '/views/system-errors': {
            title: 'System error center',
            summary: 'Rastrea incidentes del backend, inspecciona el contexto de la falla y documenta su resolución.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Ver errores abiertos, críticos (HTTP 500+), totales y resueltos.',
                        'Refrescar la lista para ver los incidentes más recientes.'
                    ]
                }
            ]
        },
        '/views/perfil': {
            title: 'Profile & Security',
            summary: 'Administra tu información de cuenta, foto de perfil y preferencias de seguridad.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Actualizar tu foto de perfil.',
                        'Cambiar tu contraseña y revisar el estado de tu cuenta.',
                        'Ver tu nivel de acceso y departamento asignado.'
                    ]
                }
            ]
        },
        '/views/chat': {
            title: 'Chat',
            summary: 'Mensajería interna del equipo.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Buscar una conversación existente.',
                        'Iniciar un nuevo chat con el botón "+".'
                    ]
                }
            ]
        },
        '/views/conciliacion': {
            title: 'Conciliación',
            summary: 'Concilia movimientos entre el sistema y los reportes de tienda.',
            sections: [
                {
                    heading: 'Qué puedes hacer aquí',
                    items: [
                        'Comparar el libro mayor contra los documentos subidos.',
                        'Marcar partidas como conciliadas o en excepción.'
                    ]
                }
            ]
        }
    };

    // Se muestra cuando la ruta actual no está en HELP_CONTENT.
    const DEFAULT_HELP = {
        title: 'Ayuda',
        summary: 'Todavía no hay una guía específica para esta página.',
        sections: [
            {
                heading: '¿Necesitas ayuda?',
                items: [
                    'Usa el asistente de chat en la esquina inferior derecha para preguntas puntuales.',
                    'Contacta a tu administrador si algo no se ve correcto.'
                ]
            }
        ]
    };

    function currentHelp() {
        var path = window.location.pathname.replace(/\/+$/, '') || '/';
        return HELP_CONTENT[path] || DEFAULT_HELP;
    }

    function renderSections(sections) {
        return sections.map(function (section) {
            var items = section.items.map(function (item) {
                return '<li>' + item + '</li>';
            }).join('');
            return (
                '<div class="contextual-help-section">' +
                    '<h4>' + section.heading + '</h4>' +
                    '<ul>' + items + '</ul>' +
                '</div>'
            );
        }).join('');
    }

    function init() {
        var help = currentHelp();

        var root = document.createElement('div');
        root.className = 'contextual-help';
        root.innerHTML =
            '<button type="button" class="contextual-help-toggle" id="contextualHelpToggle" ' +
                'aria-haspopup="dialog" aria-expanded="false" aria-controls="contextualHelpPanel" ' +
                'aria-label="Abrir ayuda de esta página" title="Ayuda">' +
                '<i class="fa-solid fa-circle-question" aria-hidden="true"></i>' +
            '</button>' +
            '<div class="contextual-help-backdrop" id="contextualHelpBackdrop" hidden></div>' +
            '<aside class="contextual-help-panel" id="contextualHelpPanel" role="dialog" ' +
                'aria-modal="true" aria-labelledby="contextualHelpTitle" hidden>' +
                '<header class="contextual-help-header">' +
                    '<div>' +
                        '<span class="contextual-help-eyebrow">Guía de la página</span>' +
                        '<h3 id="contextualHelpTitle">' + help.title + '</h3>' +
                    '</div>' +
                    '<button type="button" class="contextual-help-close" id="contextualHelpClose" aria-label="Cerrar ayuda">' +
                        '<i class="fa-solid fa-xmark" aria-hidden="true"></i>' +
                    '</button>' +
                '</header>' +
                '<div class="contextual-help-body">' +
                    '<p class="contextual-help-summary">' + help.summary + '</p>' +
                    renderSections(help.sections) +
                '</div>' +
            '</aside>';

        document.body.appendChild(root);

        var toggle = root.querySelector('#contextualHelpToggle');
        var panel = root.querySelector('#contextualHelpPanel');
        var backdrop = root.querySelector('#contextualHelpBackdrop');
        var closeBtn = root.querySelector('#contextualHelpClose');
        var hideTimer = null;

        function open() {
            clearTimeout(hideTimer);
            panel.hidden = false;
            backdrop.hidden = false;
            requestAnimationFrame(function () {
                panel.classList.add('is-open');
                backdrop.classList.add('is-open');
            });
            toggle.setAttribute('aria-expanded', 'true');
            document.addEventListener('keydown', onKeydown);
        }

        function close() {
            panel.classList.remove('is-open');
            backdrop.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
            document.removeEventListener('keydown', onKeydown);
            hideTimer = setTimeout(function () {
                panel.hidden = true;
                backdrop.hidden = true;
            }, 220);
        }

        function onKeydown(event) {
            if (event.key === 'Escape') close();
        }

        toggle.addEventListener('click', function () {
            if (panel.classList.contains('is-open')) close(); else open();
        });
        closeBtn.addEventListener('click', close);
        backdrop.addEventListener('click', close);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
