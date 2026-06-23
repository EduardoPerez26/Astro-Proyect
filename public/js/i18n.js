// Sistema de internacionalizacion (ES <-> EN) en tiempo de ejecucion.
// Traduce el DOM sin modificar la logica de la aplicacion.
// El contenido base esta en espanol; cuando el idioma es "en" se traduce el DOM
// y el contenido dinamico (tablas, SweetAlert, etc.) mediante un MutationObserver.
(function () {
    'use strict';

    var STORAGE_KEY = 'appLang';

    // Diccionario de coincidencia EXACTA (texto completo del nodo, sin espacios extra).
    var DICT = {
        // ----- Navegacion / generico -----
        'General': 'General',
        'Tiendas': 'Stores',
        'Documentos': 'Documents',
        'Historial': 'History',
        'Administracion': 'Administration',
        'Dashboard': 'Dashboard',
        'Usuarios': 'Users',
        'Usuario': 'User',
        'Control de restaurantes': 'Restaurant Control',
        'Cerrar sesion': 'Log out',
        'Cerrar sesión': 'Log out',
        'Si, cerrar sesion': 'Yes, log out',
        'Estas seguro que deseas cerrar sesion?': 'Are you sure you want to log out?',
        'Acceso denegado': 'Access denied',
        'No tienes permisos para acceder a esta seccion.': 'You do not have permission to access this section.',
        'Rol': 'Role',
        'Panel': 'Panel',
        'Administrador': 'Administrator',
        'Supervisor': 'Supervisor',
        'Cancelar': 'Cancel',
        'Volver': 'Back',
        'Guardar': 'Save',
        'Eliminar': 'Delete',
        'Error': 'Error',
        'Cerrar': 'Close',
        'Descargar': 'Download',
        'Exportar': 'Export',
        'Limpiar': 'Clear',
        'Todos': 'All',
        'Activo': 'Active',
        'Inactivo': 'Inactive',
        'Activos': 'Active',
        'Inactivos': 'Inactive',
        'Email': 'Email',
        'Estado': 'Status',
        'Acciones': 'Actions',
        'Fecha': 'Date',
        'Departamento': 'Department',
        'Departamentos': 'Departments',
        'Codigo': 'Code',
        'Restaurante': 'Restaurant',
        'Restaurante:': 'Restaurant:',
        'Desde': 'From',
        'Hasta': 'To',
        'Desde:': 'From:',
        'Hasta:': 'To:',
        'Buscar': 'Search',
        'Buscar:': 'Search:',
        'Estado:': 'Status:',
        'Rol:': 'Role:',
        'Departamento:': 'Department:',
        'Pendiente': 'Pending',
        'Validado': 'Validated',
        'Con errores': 'With errors',
        'Procesado': 'Processed',
        'Seleccionar...': 'Select...',
        'Disponible': 'Available',
        'En preparación': 'In preparation',
        'En preparacion': 'In preparation',
        'Deshabilitado': 'Disabled',
        'Selecciona un restaurante...': 'Select a restaurant...',
        'de': 'of',
        'Mostrando': 'Showing',
        'documentos': 'documents',
        'Got it': 'Got it',

        // ----- Menu lateral (abrir/cerrar) -----
        'Abrir/cerrar menu': 'Open/close menu',
        'Abrir menu': 'Open menu',

        // ----- Login -----
        'Iniciar sesión | Conciliación+': 'Sign in | Conciliación+',
        'Acerca del sistema': 'About the system',
        'Control financiero': 'Financial control',
        'Centraliza tus archivos, valida diferencias y mantén cada conciliación lista para revisión.': 'Centralize your files, validate differences and keep every reconciliation ready for review.',
        'Acceso seguro': 'Secure access',
        'Bienvenido de nuevo': 'Welcome back',
        'Ingresa tus credenciales para continuar al sistema.': 'Enter your credentials to continue to the system.',
        'Contraseña': 'Password',
        'Ingresa tu usuario': 'Enter your username',
        'Ingresa tu contraseña': 'Enter your password',
        'Iniciar sesión': 'Sign in',
        'Mostrar contraseña': 'Show password',
        '¿Problemas para ingresar? Contacta a tu administrador.': 'Trouble signing in? Contact your administrator.',
        'Completa los campos': 'Complete the fields',
        'Ingresa tu usuario y contraseña para continuar.': 'Enter your username and password to continue.',
        '¡Bienvenido!': 'Welcome!',
        'No pudimos iniciar sesión': 'We could not sign you in',
        'Sin conexión con el servidor': 'No connection to the server',
        'Reintentar': 'Retry',
        'Modo sin conexión': 'Offline mode',
        'Modo offline': 'Offline mode',
        'En modo offline usa: admin / admin123': 'In offline mode use: admin / admin123',
        'Ocultar contraseña': 'Hide password',
        'El usuario o la contraseña no son correctos.': 'The username or password is incorrect.',
        'Usuario o contraseña incorrectos': 'Incorrect username or password',
        'Usuario o contrasena incorrectos': 'Incorrect username or password',
        'No pudimos validar tus credenciales en este momento.': 'We could not validate your credentials at this time.',
        'Verifica que el servidor esté disponible e inténtalo nuevamente.': 'Make sure the server is available and try again.',
        'El usuario está desactivado': 'The user is deactivated',
        'El usuario está bloqueado': 'The user is blocked',

        // ----- Tiendas -----
        'Operaciones contables': 'Accounting operations',
        'Módulos de conciliación': 'Reconciliation modules',
        'Selecciona una cadena para cargar sus fuentes, revisar diferencias y preparar el archivo contable del día.': 'Select a chain to load its sources, review differences and prepare the accounting file for the day.',
        'Resumen de marcas': 'Brand summary',
        'Marcas configuradas': 'Configured brands',
        'Flujos disponibles': 'Available flows',
        'Operación disponible': 'Operation available',
        'Todos los flujos disponibles': 'All flows available',
        'No encontramos esa marca': 'We could not find that brand',
        'Prueba con otro nombre o cambia el filtro de disponibilidad.': 'Try another name or change the availability filter.',
        'Los formatos y reglas contables se aplican automáticamente según la marca seleccionada.': 'Accounting formats and rules are applied automatically based on the selected brand.',

        // ----- StoreCard -----
        'Flujo de conciliación': 'Reconciliation flow',
        'Archivos requeridos': 'Required files',
        'Iniciar conciliación': 'Start reconciliation',
        'No disponible': 'Not available',
        'Acceso deshabilitado': 'Access disabled',
        'Concilia ventas, medios de pago, depósitos y movimientos EBT en un flujo guiado.': 'Reconcile sales, payment methods, deposits and EBT movements in a guided flow.',
        'La configuración contable está en revisión antes de habilitar nuevas conciliaciones.': 'The accounting configuration is under review before enabling new reconciliations.',
        'Procesa el archivo operativo principal y prepara las salidas contables del periodo.': 'Process the main operating file and prepare the accounting outputs for the period.',
        'El acceso a este flujo fue deshabilitado por un administrador.': 'Access to this flow was disabled by an administrator.',
        '3 fuentes de datos': '3 data sources',
        '1 fuente de datos': '1 data source',
        'Configuración pausada': 'Configuration paused',

        // ----- Documentos -----
        'Todos los archivos Excel subidos al sistema': 'All Excel files uploaded to the system',
        'Buscar archivo': 'Search file',
        'Nombre o restaurante...': 'Name or restaurant...',
        'Lista de documentos': 'Document list',
        'ID': 'ID',
        'Archivo': 'File',
        'Tamano': 'Size',
        'Subido por': 'Uploaded by',
        'No hay documentos': 'No documents',
        'No se encontraron documentos con los filtros seleccionados': 'No documents found with the selected filters',
        'Cargando...': 'Loading...',
        'Obteniendo documentos del servidor': 'Fetching documents from the server',
        'EXPEDIENTE DIGITAL': 'DIGITAL FILE',
        'Detalle del documento': 'Document detail',
        'Información y trazabilidad del archivo seleccionado': 'Information and traceability of the selected file',
        'La descarga no esta disponible en modo offline': 'Download is not available in offline mode',
        'No se pudo descargar': 'Could not download',
        'Eliminar documento': 'Delete document',
        'Esta accion no se puede deshacer. El archivo y todos sus datos seran eliminados.': 'This action cannot be undone. The file and all its data will be deleted.',
        'Si, eliminar': 'Yes, delete',
        'Eliminado': 'Deleted',
        'El documento ha sido eliminado': 'The document has been deleted',
        'No se pudo eliminar el archivo': 'The file could not be deleted',

        // ----- Historial -----
        'CONTROL DE REVISIONES': 'REVIEW CONTROL',
        'Historial de comparaciones': 'Comparison history',
        'Consulta cuándo cambió un archivo, qué tiendas fueron afectadas y cuáles montos se modificaron.': 'Check when a file changed, which stores were affected and which amounts were modified.',
        'Exportar resumen': 'Export summary',
        'Resumen de comparaciones': 'Comparison summary',
        'Comparaciones': 'Comparisons',
        'Con diferencias': 'With differences',
        'Sin cambios': 'No changes',
        'Tiendas afectadas': 'Affected stores',
        'Restaurante, usuario o fecha...': 'Restaurant, user or date...',
        'Resultado': 'Result',
        'Primera carga': 'First load',
        'Referencia incompatible': 'Incompatible reference',
        'Cargando comparaciones...': 'Loading comparisons...',
        'Historial no disponible': 'History not available',
        'Sin comparaciones': 'No comparisons',
        'No hay registros para los filtros seleccionados.': 'No records for the selected filters.',
        'DETALLE DE DIFERENCIAS': 'DIFFERENCE DETAIL',
        'Comparacion': 'Comparison',
        'Eliminar comparación': 'Delete comparison',
        'Sí, eliminar': 'Yes, delete',
        'Comparación eliminada': 'Comparison deleted',
        'No se pudo eliminar': 'Could not delete',
        'No hay datos para exportar.': 'No data to export.',

        // ----- Conciliacion -----
        'Libro de conciliación de ventas': 'Sales reconciliation ledger',
        'Carga fuentes operativas, valida diferencias y prepara el asiento para revisión contable.': 'Load operating sources, validate differences and prepare the entry for accounting review.',
        'Seleccion': 'Selection',
        'Define restaurante, template y fecha de trabajo.': 'Define restaurant, template and working date.',
        'Template': 'Template',
        'Selecciona primero un restaurante': 'Select a restaurant first',
        'Selecciona una fecha': 'Select a date',
        'Archivos': 'Files',
        'Los campos cambian segun el restaurante seleccionado.': 'The fields change based on the selected restaurant.',
        'Selecciona restaurante': 'Select restaurant',
        'Archivo principal': 'Main file',
        'Requerido': 'Required',
        'Eliminar archivo principal': 'Remove main file',
        'Todas las fechas': 'All dates',
        'Opcional': 'Optional',
        'Archivo EBT': 'EBT file',
        'Eliminar archivo EBT': 'Remove EBT file',
        'Eliminar Sales Detail Export': 'Remove Sales Detail Export',
        'archivo.xlsx': 'file.xlsx',
        'Revision': 'Review',
        'Revisa totales, filtra tiendas y exporta el resultado.': 'Review totals, filter stores and export the result.',
        'Conceptos': 'Concepts',
        'Correctos': 'Correct',
        'Con Diferencia': 'With difference',
        'Sin diferencias': 'No differences',
        'O/S balanceado': 'O/S balanced',
        'Total Diferencia': 'Total difference',
        'CONTROL DE CAMBIOS': 'CHANGE CONTROL',
        'Comparar con la última conciliación': 'Compare with the last reconciliation',
        'Busca una referencia del mismo restaurante y fecha antes de guardar.': 'Look for a reference from the same restaurant and date before saving.',
        'Comparar ahora': 'Compare now',
        'Tienda': 'Store',
        'Todas las tiendas': 'All stores',
        'Nombre tienda': 'Store name',
        'Buscar sucursal...': 'Search branch...',
        'Detalle de Conciliacion': 'Reconciliation detail',
        'Exportar CSV Intacct': 'Export Intacct CSV',
        'Guardar conciliacion': 'Save reconciliation',
        'CONTROL DE CONCILIACIONES': 'RECONCILIATION CONTROL',
        'Comparación contable': 'Accounting comparison',
        'Revisa los montos guardados y los nuevos antes de continuar.': 'Review the saved and new amounts before continuing.',
        'Cerrar comparación': 'Close comparison',
        'Esta consulta no modifica ni reemplaza archivos.': 'This query does not modify or replace files.',
        'Elegir otro archivo': 'Choose another file',
        'Usar este archivo': 'Use this file',
        'Selecciona el restaurante': 'Select the restaurant',
        'Debes elegir el restaurante antes de cargar y comparar el archivo.': 'You must choose the restaurant before uploading and comparing the file.',
        'El archivo no cambió': 'The file did not change',
        'Procesar de todos modos': 'Process anyway',
        'Guardar y procesar': 'Save and process',
        'No se procesó el archivo': 'The file was not processed',
        'Debes elegir el restaurante antes de cargar el archivo.': 'You must choose the restaurant before uploading the file.',
        'No se pudo comparar': 'Could not compare',
        'Puedes elegir otro archivo o continuar sin compararlo.': 'You can choose another file or continue without comparing it.',
        'Usar sin comparar': 'Use without comparing',
        'Comparación disponible en línea': 'Comparison available online',
        'El sistema necesita consultar la última conciliación guardada en el servidor.': 'The system needs to query the last reconciliation saved on the server.',
        'Comparación no disponible': 'Comparison not available',
        'No se pudo validar la conciliación': 'Could not validate the reconciliation',
        'Sin datos': 'No data',
        'Primero debes cargar un archivo': 'You must upload a file first',
        'Sin conciliación': 'No reconciliation',
        'Primero genera la conciliación': 'Generate the reconciliation first',
        'Guardar conciliación': 'Save reconciliation',
        '¿Dónde deseas guardar el archivo?': 'Where do you want to save the file?',
        'Archivo descargado': 'File downloaded',
        'Archivo descargado y conciliación registrada': 'File downloaded and reconciliation recorded',
        'Sesión expirada': 'Session expired',
        'Restaurante requerido': 'Restaurant required',
        'Selecciona un restaurante': 'Select a restaurant',
        'Guardando...': 'Saving...',
        'Subiendo conciliación': 'Uploading reconciliation',

        // ----- Dashboard administrativo -----
        'CONTROL GENERAL DEL SISTEMA': 'GENERAL SYSTEM CONTROL',
        'Dashboard administrativo': 'Administrative dashboard',
        'Supervisa accesos, actividad de usuarios, archivos y movimientos recientes.': 'Monitor access, user activity, files and recent movements.',
        'Sin actualizar': 'Not updated',
        'Actualizar': 'Refresh',
        'Resumen administrativo': 'Administrative summary',
        'Usuarios activos': 'Active users',
        '0 registrados': '0 registered',
        'Sesiones activas': 'Active sessions',
        '0 inicios hoy': '0 logins today',
        'Archivos hoy': 'Files today',
        '0 en los ultimos 7 dias': '0 in the last 7 days',
        'Validaciones hoy': 'Validations today',
        '0 con incidencias': '0 with issues',
        'Departamentos activos': 'Active departments',
        'TRAZABILIDAD': 'TRACEABILITY',
        'Movimientos recientes': 'Recent movements',
        'Movimiento': 'Movement',
        'Detalle': 'Detail',
        'Cargando movimientos...': 'Loading movements...',
        'SEGURIDAD': 'SECURITY',
        'Inicios de sesion': 'Logins',
        'Cargando sesiones...': 'Loading sessions...',
        'USO DEL SISTEMA': 'SYSTEM USAGE',
        'Actividad por usuario': 'Activity by user',
        'Sesiones': 'Sessions',
        'Ultimo acceso': 'Last access',
        'Cargando actividad...': 'Loading activity...',
        'Dashboard no disponible': 'Dashboard not available',

        // ----- Usuarios -----
        'Administracion de Usuarios': 'User Administration',
        'Gestiona los usuarios del sistema': 'Manage system users',
        'Nuevo Usuario': 'New User',
        'Nuevo departamento': 'New department',
        'Administracion de acceso': 'Access administration',
        'Total Usuarios': 'Total Users',
        'Administradores': 'Administrators',
        'Nombre, email o usuario...': 'Name, email or user...',
        'Fecha registro': 'Registration date',
        'Cargando usuarios...': 'Loading users...',
        'Mostrando 0 usuarios': 'Showing 0 users',
        'ESTRUCTURA DE ACCESO': 'ACCESS STRUCTURE',
        'Departamentos de la organizacion': 'Organization departments',
        'Clasifica a los usuarios por area. Las ventanas y la pantalla inicial se asignan unicamente desde Permisos.': 'Classify users by area. Windows and the initial screen are assigned only from Permissions.',
        'departamentos': 'departments',
        'Cargando departamentos...': 'Loading departments...',
        'Nombre completo': 'Full name',
        'Ej: Juan Perez': 'E.g. John Doe',
        'Ej: juan@empresa.com': 'E.g. john@company.com',
        'Ej: jperez': 'E.g. jdoe',
        'Contrasena': 'Password',
        'Minimo 6 caracteres': 'Minimum 6 characters',
        'Deja vacio para mantener la contrasena actual': 'Leave empty to keep the current password',
        'Campos requeridos': 'Required fields',
        'Por favor completa todos los campos obligatorios.': 'Please complete all required fields.',
        'Contrasena requerida': 'Password required',
        'Debes ingresar una contrasena para el nuevo usuario.': 'You must enter a password for the new user.',
        'Los cambios se guardaron correctamente.': 'Changes were saved successfully.',
        'Usuario eliminado': 'User deleted',
        'Datos requeridos': 'Data required',
        'Escribe el nombre y codigo del departamento.': 'Enter the department name and code.',
        'No se pudo guardar': 'Could not save',
        'No se pudo cambiar el estado': 'Could not change the status',
        'Eliminar departamento': 'Delete department',
        'Eliminar definitivamente': 'Delete permanently',
        'Departamento desactivado': 'Department deactivated',
        'Departamento eliminado': 'Department deleted',

        // ----- Permisos -----
        'Configuracion de Permisos': 'Permissions Settings',
        'Asigna permisos de acceso a las secciones del sistema': 'Assign access permissions to system sections',
        'Ventana inicial': 'Initial window',
        'Selecciona la pantalla que vera este usuario al iniciar sesion.': 'Select the screen this user will see when logging in.',
        'Restablecer': 'Reset',
        'Guardar Permisos': 'Save Permissions',
        'Usuario no especificado': 'User not specified',
        'No se especifico el usuario a configurar.': 'The user to configure was not specified.',
        'Usuario no encontrado': 'User not found',
        'Permisos restablecidos': 'Permissions reset',
        'Se restauraron los permisos originales.': 'The original permissions were restored.',
        'Selecciona una ventana': 'Select a window',
        'El usuario debe tener acceso al menos a Tiendas, Documentos o Historial.': 'The user must have access to at least Stores, Documents or History.',
        'Permisos guardados': 'Permissions saved',
        'Los permisos se actualizaron correctamente.': 'Permissions were updated successfully.',

        // ----- Control de restaurantes -----
        'Acceso exclusivo para administradores': 'Administrator-only access',
        'Disponibilidad de restaurantes': 'Restaurant availability',
        'Habilita o deshabilita el acceso a cada flujo usando el estado que ya existe en la base de datos. No se crean tablas ni configuraciones adicionales.': 'Enable or disable access to each flow using the status that already exists in the database. No additional tables or configurations are created.',
        'Actualizar estados': 'Refresh statuses',
        'Resumen operativo': 'Operational summary',
        'Restaurantes': 'Restaurants',
        'Disponibles': 'Available',
        'Con restricción': 'With restriction',
        'Estado por restaurante': 'Status by restaurant',
        'Usa el botón de cada fila para permitir o bloquear su conciliación.': 'Use the button on each row to allow or block its reconciliation.',
        'Aplicación inmediata': 'Immediate application',
        'Consultando restaurantes...': 'Querying restaurants...',
        'Acceso restringido': 'Restricted access',
        'Solo un administrador puede habilitar o deshabilitar restaurantes.': 'Only an administrator can enable or disable restaurants.',

        // ----- Editor -----
        'Editor Excel - Sistema de Inventario': 'Excel Editor - Inventory System',
        'Editor de Excel': 'Excel Editor',
        'Sube y modifica tus hojas con una experiencia clara y profesional': 'Upload and edit your sheets with a clear and professional experience',
        'Subir Excel': 'Upload Excel',
        'Usar template': 'Use template',
        'Seleccionar Plantilla': 'Select Template',
        'Sin plantilla': 'No template',
        'Hoja:': 'Sheet:',
        'Columna:': 'Column:',
        'Validar': 'Validate',
        'Archivo:': 'File:',
        'Sin archivo': 'No file',
        'Hoja: ---': 'Sheet: ---',
        'Formulas: 0': 'Formulas: 0',
        'Validacion pendiente - Sube un archivo para comenzar': 'Validation pending - Upload a file to start',
        'Sube un archivo Excel': 'Upload an Excel file',
        'Formatos compatibles: .xlsx y .xls': 'Compatible formats: .xlsx and .xls',
        'Selecciona una plantilla': 'Select a template',
        'Primero debes seleccionar el archivo de plantilla (.xlsx) usando el boton "Seleccionar Plantilla".': 'You must first select the template file (.xlsx) using the "Select Template" button.',
        'Procesando...': 'Processing...',
        'Plantilla aplicada': 'Template applied',
        'Error al aplicar plantilla': 'Error applying template',
        'Primero selecciona un archivo Excel.': 'First select an Excel file.',
        'Guardar archivo': 'Save file',
        'Donde deseas guardar el archivo?': 'Where do you want to save the file?',
        'El Excel se descargo correctamente.': 'The Excel was downloaded successfully.',
        'Sesion expirada': 'Session expired',
        'Por favor inicia sesion nuevamente': 'Please sign in again',
        'Restaurante no seleccionado': 'Restaurant not selected',
        'Por favor selecciona un restaurante antes de guardar': 'Please select a restaurant before saving',
        'Subiendo archivo al servidor': 'Uploading file to the server',
        'Archivo guardado': 'File saved',
        'Error al guardar': 'Error saving',
        'Sin validador': 'No validator',
        'Primero selecciona un restaurante para validar.': 'First select a restaurant to validate.',
        'Entendido': 'Got it',
        'Primero sube un archivo Excel para validar.': 'First upload an Excel file to validate.',
        'Cargando plantilla...': 'Loading template...',
        'Plantilla cargada': 'Template loaded',
        'No se pudo cargar la plantilla:': 'Could not load the template:',

        // ----- Inicio (redireccion) -----
        'Redirigiendo a Tiendas': 'Redirecting to Stores',
        'Continuar a Tiendas': 'Continue to Stores'
    };

    // Reemplazo por SUBCADENA para textos dinamicos (concatenaciones con variables).
    // Se aplica solo cuando no hubo coincidencia exacta. Frases distintivas/seguras.
    var PHRASES = [
        ['Sistema de Conciliación', 'Reconciliation System'],
        ['Administrador', 'Administrator'],
        ['Supervisor', 'Supervisor'],
        ['flujos no disponibles', 'flows unavailable'],
        ['flujo no disponible', 'flow unavailable'],
        ['La comparación debe completarse antes de generar el template.', 'The comparison must be completed before generating the template.'],
        ['No se guardó ningún cambio.', 'No changes were saved.'],
        ['La comparación quedará pendiente hasta registrarlo en el servidor.', 'The comparison will remain pending until it is recorded on the server.'],
        ['Validacion', 'Validation'],
        ['Hola,', 'Hello,'],
        ['Mostrando', 'Showing'],
        ['usuarios', 'users']
    ];
    // Ordenar por longitud descendente para evitar reemplazos parciales.
    PHRASES.sort(function (a, b) { return b[0].length - a[0].length; });

    var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1 };
    var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

    var currentLang = 'es';
    var observer = null;

    function getLang() {
        try { return localStorage.getItem(STORAGE_KEY) || 'es'; } catch (e) { return 'es'; }
    }

    function normalize(s) {
        return s.replace(/\s+/g, ' ').trim();
    }

    // Traduce un string. Devuelve el original si no hay traduccion.
    function translate(text) {
        if (!text) return text;
        var key = normalize(text);
        if (!key) return text;
        if (Object.prototype.hasOwnProperty.call(DICT, key)) {
            var lead = text.match(/^\s*/)[0];
            var trail = text.match(/\s*$/)[0];
            return lead + DICT[key] + trail;
        }
        // Reemplazo por subcadena para textos dinamicos.
        var out = text;
        var changed = false;
        for (var i = 0; i < PHRASES.length; i++) {
            if (out.indexOf(PHRASES[i][0]) !== -1) {
                out = out.split(PHRASES[i][0]).join(PHRASES[i][1]);
                changed = true;
            }
        }
        return changed ? out : text;
    }

    function isInsideSkipped(node) {
        var el = node.parentNode;
        while (el && el.nodeType === 1) {
            if (SKIP_TAGS[el.tagName] || el.hasAttribute('data-no-i18n')) return true;
            el = el.parentNode;
        }
        return false;
    }

    function walk(node) {
        if (!node) return;
        if (node.nodeType === 3) { // texto
            if (isInsideSkipped(node)) return;
            var nv = translate(node.nodeValue);
            if (nv !== node.nodeValue) node.nodeValue = nv;
            return;
        }
        if (node.nodeType !== 1) return; // solo elementos
        if (SKIP_TAGS[node.tagName] || node.hasAttribute('data-no-i18n')) return;

        for (var i = 0; i < ATTRS.length; i++) {
            if (node.hasAttribute(ATTRS[i])) {
                var v = node.getAttribute(ATTRS[i]);
                var t = translate(v);
                if (t !== v) node.setAttribute(ATTRS[i], t);
            }
        }
        if (node.tagName === 'INPUT' && (node.type === 'button' || node.type === 'submit') && node.value) {
            var tv = translate(node.value);
            if (tv !== node.value) node.value = tv;
        }
        var child = node.firstChild;
        while (child) {
            var next = child.nextSibling;
            walk(child);
            child = next;
        }
    }

    function translateDocument() {
        if (document.title) {
            var tt = translate(document.title);
            if (tt !== document.title) document.title = tt;
        }
        if (document.body) walk(document.body);
    }

    function startObserver() {
        if (observer || !window.MutationObserver) return;
        observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var m = mutations[i];
                if (m.type === 'childList') {
                    for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
                } else if (m.type === 'characterData') {
                    if (!isInsideSkipped(m.target)) {
                        var nv = translate(m.target.nodeValue);
                        if (nv !== m.target.nodeValue) m.target.nodeValue = nv;
                    }
                } else if (m.type === 'attributes' && m.target.nodeType === 1) {
                    var attr = m.attributeName;
                    if (ATTRS.indexOf(attr) !== -1 && m.target.hasAttribute(attr)) {
                        var v = m.target.getAttribute(attr);
                        var t = translate(v);
                        if (t !== v) m.target.setAttribute(attr, t);
                    }
                }
            }
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ATTRS
        });
    }

    function updateToggleLabels() {
        var nextLabel = currentLang === 'en' ? 'ES' : 'EN';
        var titleLabel = currentLang === 'en' ? 'Cambiar a español' : 'Switch to English';
        var toggles = document.querySelectorAll('[data-lang-toggle]');
        for (var i = 0; i < toggles.length; i++) {
            var labelEl = toggles[i].querySelector('[data-lang-label]') || toggles[i];
            labelEl.textContent = nextLabel;
            toggles[i].setAttribute('title', titleLabel);
            toggles[i].setAttribute('aria-label', titleLabel);
        }
    }

    function setLanguage(lang) {
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
        // Recargar para volver al contenido base (es) o aplicar traduccion (en) de forma limpia.
        window.location.reload();
    }

    function wireToggles() {
        var toggles = document.querySelectorAll('[data-lang-toggle]');
        for (var i = 0; i < toggles.length; i++) {
            if (toggles[i].__i18nWired) continue;
            toggles[i].__i18nWired = true;
            toggles[i].setAttribute('data-no-i18n', '');
            toggles[i].addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                setLanguage(currentLang === 'en' ? 'es' : 'en');
            });
        }
        updateToggleLabels();
    }

    function init() {
        currentLang = getLang();
        document.documentElement.setAttribute('lang', currentLang);
        if (currentLang === 'en') {
            translateDocument();
            startObserver();
        }
        wireToggles();
    }

    // API publica
    window.appI18n = {
        getLang: getLang,
        setLanguage: setLanguage,
        translate: translate
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
