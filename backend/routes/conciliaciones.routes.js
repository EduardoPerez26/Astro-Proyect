// ============================================
// RUTAS DE CONCILIACIONES
// ============================================

const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { pool } = require('../config/database');
const { verificarToken, esAdmin } = require('../middleware/auth.middleware');
const {
    registrarComparacion,
    vincularComparacion
} = require('../services/comparaciones.service');

const CAMPOS_IDENTIDAD_CONCILIACION = new Set([
    'store',
    'storeName',
    'unitName',
    'unitNumber',
    'locationId',
    'date',
    'accountingDate',
    'deptId',
    'acctNo',
    'journal',
    'description',
    'memo'
]);

const CAMPOS_COMPARACION_POR_RESTAURANTE = {
    'taco-bell': [
        'salesTax', 'grossSalesPos', 'discounts', 'promo', 'donations',
        'netSales', 'gcSold', 'paidOut', 'paidIn', 'totalRevenue',
        'mastercard', 'visa', 'discover', 'amex', 'debit', 'ebt',
        'gcRedeem', 'acctCash', 'deposits', 'gh', 'uber', 'dd',
        'ccTotals', 'paymentsTotal', 'oS', 'os', 'deposit1', 'deposit2',
        'deposit3', 'cashPlusMinus', 'cashExpected', 'difference'
    ],
    popeyes: [
        'food', 'beverages', 'other', 'serviceFee', 'salesOther',
        'deliveryFee', 'deliveryTips', 'totalTips', 'discounts',
        'discountsPromo', 'netSales', 'salesTax', 'taxExemptSales',
        'caCrv', 'gcSold', 'paidOut', 'donations', 'nonRedeemable',
        'totalRevenue', 'amex', 'amexPrpd', 'amexKiosk', 'totalCC',
        'doorDash', 'grubHub', 'uberEats', 'doorDashShortage',
        'uberShortage', 'postmates', 'ebt', 'kiosk', 'giftCardRedeemed',
        'onlineCatering', 'ezCater', 'wlTips', 'cashDepositCalculated',
        'delTotals', 'paymentsTotal', 'overShort', 'totalDiscounts',
        'cashDeposit', 'cashHandlingDebit', 'cashHandlingCredit',
        'cashExpected', 'difference'
    ],
    'burger-king': [
        'foodSales', 'bevSales', 'nonFood', 'coupons', 'surcharge',
        'bagCharge', 'wlTips', 'discounts', 'netSales', 'salesTax',
        'gcSold', 'paidOut', 'donations', 'donationDiscounts',
        'totalRevenue', 'amex', 'visa', 'mastercard', 'discover', 'ebt',
        'dd', 'gh', 'uber', 'wlPayments', 'bkApp', 'gcRedeem',
        'cashDeposit', 'instore', 'paypal', 'venmo', 'kiosk', 'ccTotals',
        'cashExpected', 'paymentsTotal', 'openChecks', 'oS',
        'cashOsCredit', 'cashOsDebit', 'cashDifference'
    ]
};

function obtenerTiendaConciliacion(fila = {}) {
    return String(
        fila.store ??
        fila.locationId ??
        fila.unitNumber ??
        fila.Store ??
        ''
    ).trim();
}

function normalizarFechaConciliacionFila(valor, fechaPredeterminada) {
    const texto = String(valor || fechaPredeterminada || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);

    const fechaUsa = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (fechaUsa) {
        return `${fechaUsa[3]}-${fechaUsa[1].padStart(2, '0')}-${fechaUsa[2].padStart(2, '0')}`;
    }

    return texto;
}

function parsearNotasArchivo(valor) {
    if (!valor) return {};
    if (typeof valor === 'object' && !Buffer.isBuffer(valor)) return valor;

    try {
        return JSON.parse(String(valor));
    } catch {
        return {};
    }
}

function extraerDatosComparacionArchivo(archivoBlob) {
    if (!archivoBlob) return [];

    const contenido = Buffer.isBuffer(archivoBlob)
        ? archivoBlob
        : Buffer.from(archivoBlob);
    const workbook = XLSX.read(contenido, { type: 'buffer' });
    const sheet = workbook.Sheets._Comparacion;

    if (!sheet) return [];

    return XLSX.utils.sheet_to_json(sheet, {
        defval: 0,
        raw: true
    });
}

function crearMapaConciliacion(filas, fechaPredeterminada) {
    return new Map(filas.map(fila => {
        const tienda = obtenerTiendaConciliacion(fila);
        const fecha = normalizarFechaConciliacionFila(
            fila.date ?? fila.accountingDate,
            fechaPredeterminada
        );

        return [`${tienda}::${fecha}`, { fila, tienda, fecha }];
    }).filter(([, registro]) => registro.tienda));
}

function obtenerMontoComparable(valor) {
    if (typeof valor === 'number') {
        return Number.isFinite(valor) ? valor : null;
    }

    if (typeof valor !== 'string') return null;
    const limpio = valor.trim().replaceAll(',', '');
    if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null;
    const numero = Number(limpio);
    return Number.isFinite(numero) ? numero : null;
}

function compararDatosConciliacion(
    datosAnteriores,
    datosNuevos,
    fecha,
    codigoRestaurante
) {
    const anteriores = Array.isArray(datosAnteriores) ? datosAnteriores : [];
    const nuevos = Array.isArray(datosNuevos) ? datosNuevos : [];
    const mapaAnterior = crearMapaConciliacion(anteriores, fecha);
    const mapaNuevo = crearMapaConciliacion(nuevos, fecha);
    const claves = [...new Set([
        ...mapaAnterior.keys(),
        ...mapaNuevo.keys()
    ])].filter(Boolean);
    const diferencias = [];

    claves.forEach(clave => {
        const registroAnterior = mapaAnterior.get(clave);
        const registroNuevo = mapaNuevo.get(clave);
        const anterior = registroAnterior?.fila;
        const nuevo = registroNuevo?.fila;
        const tienda = registroNuevo?.tienda || registroAnterior?.tienda || '';
        const fechaTienda = registroNuevo?.fecha || registroAnterior?.fecha || fecha;

        if (!anterior || !nuevo) {
            diferencias.push({
                tienda,
                fecha: fechaTienda,
                tipo: anterior ? 'tienda_eliminada' : 'tienda_nueva',
                cambios: []
            });
            return;
        }

        const campos = CAMPOS_COMPARACION_POR_RESTAURANTE[codigoRestaurante] ||
            [...new Set([...Object.keys(anterior), ...Object.keys(nuevo)])];
        const cambios = campos.flatMap(campo => {
            if (CAMPOS_IDENTIDAD_CONCILIACION.has(campo)) return [];

            const montoAnterior = obtenerMontoComparable(anterior[campo]);
            const montoNuevo = obtenerMontoComparable(nuevo[campo]);
            if (montoAnterior === null && montoNuevo === null) return [];

            const valorAnterior = montoAnterior ?? 0;
            const valorNuevo = montoNuevo ?? 0;
            const diferencia = valorNuevo - valorAnterior;
            if (Math.abs(diferencia) < 0.005) return [];

            return [{
                campo,
                anterior: valorAnterior,
                nuevo: valorNuevo,
                diferencia
            }];
        });

        if (cambios.length) {
            diferencias.push({
                tienda,
                fecha: fechaTienda,
                tipo: 'montos_diferentes',
                cambios
            });
        }
    });

    return {
        tiendasComparadas: claves.length,
        tiendasConDiferencias: diferencias.length,
        diferencias
    };
}

// ============================================
// GET /api/conciliaciones/templates
// ============================================
// Lista templates de un restaurante
router.get('/templates', verificarToken, async (req, res) => {
    try {
        const { restaurante_id } = req.query;
        
        let query = `
            SELECT t.*, r.nombre as restaurante_nombre, r.codigo as restaurante_codigo
            FROM templates_conciliacion t
            JOIN restaurantes r ON t.restaurante_id = r.id
            WHERE t.activo = TRUE
        `;
        const params = [];
        
        if (restaurante_id) {
            query += ' AND t.restaurante_id = ?';
            params.push(restaurante_id);
        }
        
        query += ' ORDER BY t.es_default DESC, t.nombre';
        
        const [templates] = await pool.query(query, params);
        
        // Parsear configuracion JSON
        const templatesFormateados = templates.map(t => ({
            ...t,
            configuracion: typeof t.configuracion === 'string' 
                ? JSON.parse(t.configuracion) 
                : t.configuracion
        }));
        
        res.json({
            success: true,
            templates: templatesFormateados
        });
        
    } catch (error) {
        console.error('Error al listar templates:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener templates'
        });
    }
});

// ============================================
// GET /api/conciliaciones/templates/:id
// ============================================
router.get('/templates/:id', verificarToken, async (req, res) => {
    try {
        const [templates] = await pool.query(
            `SELECT t.*, r.nombre as restaurante_nombre
             FROM templates_conciliacion t
             JOIN restaurantes r ON t.restaurante_id = r.id
             WHERE t.id = ?`,
            [req.params.id]
        );
        
        if (templates.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Template no encontrado'
            });
        }
        
        const template = templates[0];
        template.configuracion = typeof template.configuracion === 'string'
            ? JSON.parse(template.configuracion)
            : template.configuracion;
        
        res.json({
            success: true,
            template
        });
        
    } catch (error) {
        console.error('Error al obtener template:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener template'
        });
    }
});

// ============================================
// POST /api/conciliaciones/templates
// ============================================
// Crear nuevo template (solo admin)
router.post('/templates', verificarToken, esAdmin, async (req, res) => {
    try {
        const { restaurante_id, nombre, descripcion, configuracion, es_default } = req.body;
        
        if (!restaurante_id || !nombre || !configuracion) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos'
            });
        }
        
        // Si es default, quitar default de otros templates del mismo restaurante
        if (es_default) {
            await pool.query(
                'UPDATE templates_conciliacion SET es_default = FALSE WHERE restaurante_id = ?',
                [restaurante_id]
            );
        }
        
        const [result] = await pool.query(
            `INSERT INTO templates_conciliacion (restaurante_id, nombre, descripcion, configuracion, es_default)
             VALUES (?, ?, ?, ?, ?)`,
            [
                restaurante_id,
                nombre,
                descripcion || null,
                JSON.stringify(configuracion),
                es_default || false
            ]
        );
        
        res.status(201).json({
            success: true,
            message: 'Template creado',
            id: result.insertId
        });
        
    } catch (error) {
        console.error('Error al crear template:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear template'
        });
    }
});

// ============================================
// PUT /api/conciliaciones/templates/:id
// ============================================
router.put('/templates/:id', verificarToken, esAdmin, async (req, res) => {
    try {
        const { nombre, descripcion, configuracion, es_default, activo } = req.body;
        
        const updates = [];
        const params = [];
        
        if (nombre !== undefined) {
            updates.push('nombre = ?');
            params.push(nombre);
        }
        if (descripcion !== undefined) {
            updates.push('descripcion = ?');
            params.push(descripcion);
        }
        if (configuracion !== undefined) {
            updates.push('configuracion = ?');
            params.push(JSON.stringify(configuracion));
        }
        if (es_default !== undefined) {
            updates.push('es_default = ?');
            params.push(es_default);
        }
        if (activo !== undefined) {
            updates.push('activo = ?');
            params.push(activo);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No hay campos para actualizar'
            });
        }
        
        params.push(req.params.id);
        
        await pool.query(
            `UPDATE templates_conciliacion SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
        
        res.json({
            success: true,
            message: 'Template actualizado'
        });
        
    } catch (error) {
        console.error('Error al actualizar template:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar template'
        });
    }
});

// ============================================
// GET /api/conciliaciones
// ============================================
// Lista conciliaciones
router.get('/', verificarToken, async (req, res) => {
    try {
        const { restaurante_id, estado, fecha_inicio, fecha_fin } = req.query;
        
        let query = `
            SELECT c.*, 
                   r.nombre as restaurante_nombre,
                   t.nombre as template_nombre,
                   u.nombre_completo as usuario_nombre
            FROM conciliaciones c
            JOIN restaurantes r ON c.restaurante_id = r.id
            JOIN templates_conciliacion t ON c.template_id = t.id
            JOIN usuarios u ON c.usuario_id = u.id
            WHERE 1=1
        `;
        const params = [];
        
        if (restaurante_id) {
            query += ' AND c.restaurante_id = ?';
            params.push(restaurante_id);
        }
        if (estado) {
            query += ' AND c.estado = ?';
            params.push(estado);
        }
        if (fecha_inicio) {
            query += ' AND c.fecha_conciliacion >= ?';
            params.push(fecha_inicio);
        }
        if (fecha_fin) {
            query += ' AND c.fecha_conciliacion <= ?';
            params.push(fecha_fin);
        }
        
        query += ' ORDER BY c.fecha_conciliacion DESC, c.id DESC';
        
        const [conciliaciones] = await pool.query(query, params);
        
        // Parsear datos JSON
        const conciliacionesFormateadas = conciliaciones.map(c => ({
            ...c,
            datos_extraidos: typeof c.datos_extraidos === 'string'
                ? JSON.parse(c.datos_extraidos)
                : c.datos_extraidos
        }));
        
        res.json({
            success: true,
            conciliaciones: conciliacionesFormateadas
        });
        
    } catch (error) {
        console.error('Error al listar conciliaciones:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener conciliaciones'
        });
    }
});

// ============================================
// POST /api/conciliaciones/comparar-existente
// ============================================
// Compara por restaurante, tienda y fecha usando reglas propias de cada marca.
router.post('/comparar-existente', verificarToken, async (req, res) => {
    try {
        const {
            restaurante_id,
            fecha_conciliacion,
            datos_extraidos
        } = req.body;

        if (!restaurante_id || !fecha_conciliacion || !Array.isArray(datos_extraidos)) {
            return res.status(400).json({
                success: false,
                message: 'Faltan datos para comparar la conciliación'
            });
        }

        const [restaurantes] = await pool.query(
            'SELECT id, codigo, nombre FROM restaurantes WHERE id = ? LIMIT 1',
            [restaurante_id]
        );

        if (!restaurantes.length) {
            return res.status(404).json({
                success: false,
                message: 'Restaurante no encontrado'
            });
        }

        const restaurante = restaurantes[0];
        const fechaBuscada = normalizarFechaConciliacionFila(
            fecha_conciliacion,
            fecha_conciliacion
        );
        const [candidatos] = await pool.query(
            `SELECT id, notas
             FROM archivos_excel
             WHERE restaurante_id = ?
             ORDER BY id DESC
             LIMIT 200`,
            [restaurante_id]
        );
        const referencia = candidatos.find(candidato => {
            const notas = parsearNotasArchivo(candidato.notas);
            const fechaReferencia = normalizarFechaConciliacionFila(
                notas.fecha_conciliacion,
                notas.fecha_conciliacion
            );

            return notas.tipo === 'conciliacion_generada' &&
                fechaReferencia === fechaBuscada;
        });

        if (!referencia) {
            const resultado = {
                tiendasComparadas: datos_extraidos.length,
                tiendasConDiferencias: 0,
                diferencias: []
            };
            const comparacionId = await registrarComparacion({
                restauranteId: restaurante_id,
                usuarioId: req.usuario.id,
                fechaOperacion: fechaBuscada,
                estado: 'primera_carga',
                datosNuevos: datos_extraidos,
                resultado
            });

            return res.json({
                success: true,
                existe: false,
                restaurante: restaurante.codigo,
                comparacionId,
                historialDisponible: Boolean(comparacionId),
                ...resultado
            });
        }

        const [archivos] = await pool.query(
            `SELECT id, archivo_blob
             FROM archivos_excel
             WHERE id = ?
             LIMIT 1`,
            [referencia.id]
        );
        const datosAnteriores = extraerDatosComparacionArchivo(
            archivos[0]?.archivo_blob
        );

        if (!datosAnteriores.length) {
            const resultado = {
                tiendasComparadas: datos_extraidos.length,
                tiendasConDiferencias: 0,
                diferencias: []
            };
            const comparacionId = await registrarComparacion({
                restauranteId: restaurante_id,
                usuarioId: req.usuario.id,
                archivoReferenciaId: referencia.id,
                fechaOperacion: fechaBuscada,
                estado: 'referencia_incompatible',
                datosNuevos: datos_extraidos,
                resultado
            });

            return res.json({
                success: true,
                existe: false,
                referenciaIncompatible: true,
                archivoAnteriorId: referencia.id,
                restaurante: restaurante.codigo,
                comparacionId,
                historialDisponible: Boolean(comparacionId),
                ...resultado
            });
        }

        const resultado = compararDatosConciliacion(
            datosAnteriores,
            datos_extraidos,
            fecha_conciliacion,
            restaurante.codigo
        );
        const comparacionId = await registrarComparacion({
            restauranteId: restaurante_id,
            usuarioId: req.usuario.id,
            archivoReferenciaId: referencia.id,
            fechaOperacion: fechaBuscada,
            estado: resultado.tiendasConDiferencias
                ? 'con_cambios'
                : 'sin_cambios',
            datosNuevos: datos_extraidos,
            resultado
        });

        res.json({
            success: true,
            existe: true,
            archivoAnteriorId: referencia.id,
            restaurante: restaurante.codigo,
            comparacionId,
            historialDisponible: Boolean(comparacionId),
            ...resultado
        });
    } catch (error) {
        console.error('Error comparando conciliación existente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al comparar la conciliación existente'
        });
    }
});

// ============================================
// GET /api/conciliaciones/:id
// ============================================
router.get('/:id', verificarToken, async (req, res) => {
    try {
        const [conciliaciones] = await pool.query(
            `SELECT c.*, 
                    r.nombre as restaurante_nombre,
                    t.nombre as template_nombre,
                    t.configuracion as template_config,
                    u.nombre_completo as usuario_nombre
             FROM conciliaciones c
             JOIN restaurantes r ON c.restaurante_id = r.id
             JOIN templates_conciliacion t ON c.template_id = t.id
             JOIN usuarios u ON c.usuario_id = u.id
             WHERE c.id = ?`,
            [req.params.id]
        );
        
        if (conciliaciones.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Conciliacion no encontrada'
            });
        }
        
        const conciliacion = conciliaciones[0];
        conciliacion.datos_extraidos = typeof conciliacion.datos_extraidos === 'string'
            ? JSON.parse(conciliacion.datos_extraidos)
            : conciliacion.datos_extraidos;
        conciliacion.template_config = typeof conciliacion.template_config === 'string'
            ? JSON.parse(conciliacion.template_config)
            : conciliacion.template_config;
        
        res.json({
            success: true,
            conciliacion
        });
        
    } catch (error) {
        console.error('Error al obtener conciliacion:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener conciliacion'
        });
    }
});

// ============================================
// POST /api/conciliaciones
// ============================================
// Crear nueva conciliacion
router.post('/', verificarToken, async (req, res) => {
    try {
        const {
            restaurante_id,
            template_id,
            fecha_conciliacion,
            periodo_inicio,
            periodo_fin,
            datos_extraidos,
            notas,
            comparacion_id
        } = req.body;
        
        if (!restaurante_id || !fecha_conciliacion || !datos_extraidos) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos'
            });
        }

        let templateId = Number(template_id) || null;

        if (templateId) {
            const [templateSolicitado] = await pool.query(
                `SELECT id
                 FROM templates_conciliacion
                 WHERE id = ? AND restaurante_id = ?
                 LIMIT 1`,
                [templateId, restaurante_id]
            );

            if (!templateSolicitado.length) templateId = null;
        }

        if (!templateId) {
            const [templatesDisponibles] = await pool.query(
                `SELECT id
                 FROM templates_conciliacion
                 WHERE restaurante_id = ?
                 ORDER BY es_default DESC, id ASC
                 LIMIT 1`,
                [restaurante_id]
            );

            if (templatesDisponibles.length) {
                templateId = templatesDisponibles[0].id;
            } else {
                const [templateCreado] = await pool.query(
                    `INSERT INTO templates_conciliacion
                     (restaurante_id, nombre, descripcion, configuracion, es_default)
                     VALUES (?, ?, ?, ?, TRUE)`,
                    [
                        restaurante_id,
                        'Template automático de conciliación',
                        'Configuración interna para historial y comparación',
                        JSON.stringify({ generadoPorSistema: true })
                    ]
                );
                templateId = templateCreado.insertId;
            }
        }
        
        // Calcular estadisticas
        const datos = Array.isArray(datos_extraidos) ? datos_extraidos : [];
        const total_conceptos = datos.length;
        const conceptos_ok = datos.filter(d => Math.abs(d.diferencia || 0) < 0.01).length;
        const conceptos_diferencia = total_conceptos - conceptos_ok;
        const monto_total_diferencia = datos.reduce((sum, d) => sum + Math.abs(d.diferencia || 0), 0);

        const [existentes] = await pool.query(
            `SELECT id
             FROM conciliaciones
             WHERE restaurante_id = ?
               AND DATE(fecha_conciliacion) = DATE(?)
             ORDER BY id DESC
             LIMIT 1`,
            [restaurante_id, fecha_conciliacion]
        );

        if (existentes.length) {
            const conciliacionId = existentes[0].id;

            await pool.query(
                `UPDATE conciliaciones
                 SET template_id = ?,
                     usuario_id = ?,
                     fecha_conciliacion = ?,
                     periodo_inicio = ?,
                     periodo_fin = ?,
                     datos_extraidos = ?,
                     total_conceptos = ?,
                     conceptos_ok = ?,
                     conceptos_diferencia = ?,
                     monto_total_diferencia = ?,
                     notas = ?,
                     estado = 'borrador'
                 WHERE id = ?`,
                [
                    templateId,
                    req.usuario.id,
                    fecha_conciliacion,
                    periodo_inicio || null,
                    periodo_fin || null,
                    JSON.stringify(datos_extraidos),
                    total_conceptos,
                    conceptos_ok,
                    conceptos_diferencia,
                    monto_total_diferencia,
                    notas || null,
                    conciliacionId
                ]
            );

            await vincularComparacion(
                Number(comparacion_id) || null,
                conciliacionId,
                req.usuario.id
            );

            return res.json({
                success: true,
                message: 'Conciliación actualizada',
                id: conciliacionId,
                actualizada: true,
                stats: {
                    total_conceptos,
                    conceptos_ok,
                    conceptos_diferencia,
                    monto_total_diferencia
                }
            });
        }
        
        const [result] = await pool.query(
            `INSERT INTO conciliaciones 
             (restaurante_id, template_id, usuario_id, fecha_conciliacion, periodo_inicio, periodo_fin,
              datos_extraidos, total_conceptos, conceptos_ok, conceptos_diferencia, monto_total_diferencia, notas, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'borrador')`,
            [
                restaurante_id,
                templateId,
                req.usuario.id,
                fecha_conciliacion,
                periodo_inicio || null,
                periodo_fin || null,
                JSON.stringify(datos_extraidos),
                total_conceptos,
                conceptos_ok,
                conceptos_diferencia,
                monto_total_diferencia,
                notas || null
            ]
        );

        await vincularComparacion(
            Number(comparacion_id) || null,
            result.insertId,
            req.usuario.id
        );
        
        res.status(201).json({
            success: true,
            message: 'Conciliacion creada',
            id: result.insertId,
            stats: {
                total_conceptos,
                conceptos_ok,
                conceptos_diferencia,
                monto_total_diferencia
            }
        });
        
    } catch (error) {
        console.error('Error al crear conciliacion:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear conciliacion',
            code: error.code || 'CONCILIACION_DB_ERROR'
        });
    }
});

// ============================================
// PUT /api/conciliaciones/:id
// ============================================
router.put('/:id', verificarToken, async (req, res) => {
    try {
        const { datos_extraidos, estado, notas } = req.body;
        
        const updates = [];
        const params = [];
        
        if (datos_extraidos !== undefined) {
            const datos = Array.isArray(datos_extraidos) ? datos_extraidos : [];
            const total_conceptos = datos.length;
            const conceptos_ok = datos.filter(d => Math.abs(d.diferencia || 0) < 0.01).length;
            const conceptos_diferencia = total_conceptos - conceptos_ok;
            const monto_total_diferencia = datos.reduce((sum, d) => sum + Math.abs(d.diferencia || 0), 0);
            
            updates.push('datos_extraidos = ?', 'total_conceptos = ?', 'conceptos_ok = ?', 
                        'conceptos_diferencia = ?', 'monto_total_diferencia = ?');
            params.push(JSON.stringify(datos_extraidos), total_conceptos, conceptos_ok, 
                       conceptos_diferencia, monto_total_diferencia);
        }
        
        if (estado !== undefined) {
            updates.push('estado = ?');
            params.push(estado);
        }
        
        if (notas !== undefined) {
            updates.push('notas = ?');
            params.push(notas);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No hay campos para actualizar'
            });
        }
        
        params.push(req.params.id);
        
        await pool.query(
            `UPDATE conciliaciones SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
        
        res.json({
            success: true,
            message: 'Conciliacion actualizada'
        });
        
    } catch (error) {
        console.error('Error al actualizar conciliacion:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar conciliacion'
        });
    }
});

// ============================================
// GET /api/conciliaciones/valores-esperados
// ============================================
router.get('/valores-esperados/:restaurante_id/:fecha', verificarToken, async (req, res) => {
    try {
        const { restaurante_id, fecha } = req.params;
        
        const [valores] = await pool.query(
            `SELECT concepto, valor, fuente
             FROM valores_esperados
             WHERE restaurante_id = ? AND fecha = ?`,
            [restaurante_id, fecha]
        );
        
        // Convertir a objeto para facil acceso
        const valoresMap = {};
        valores.forEach(v => {
            valoresMap[v.concepto] = {
                valor: parseFloat(v.valor),
                fuente: v.fuente
            };
        });
        
        res.json({
            success: true,
            valores: valoresMap
        });
        
    } catch (error) {
        console.error('Error al obtener valores esperados:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener valores esperados'
        });
    }
});

// ============================================
// POST /api/conciliaciones/valores-esperados
// ============================================
router.post('/valores-esperados', verificarToken, async (req, res) => {
    try {
        const { restaurante_id, fecha, valores } = req.body;
        
        if (!restaurante_id || !fecha || !valores || !Array.isArray(valores)) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos'
            });
        }
        
        // Insertar o actualizar cada valor
        for (const v of valores) {
            await pool.query(
                `INSERT INTO valores_esperados (restaurante_id, fecha, concepto, valor, fuente, usuario_id)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE valor = VALUES(valor), fuente = VALUES(fuente)`,
                [restaurante_id, fecha, v.concepto, v.valor, v.fuente || 'manual', req.usuario.id]
            );
        }
        
        res.json({
            success: true,
            message: 'Valores guardados'
        });
        
    } catch (error) {
        console.error('Error al guardar valores esperados:', error);
        res.status(500).json({
            success: false,
            message: 'Error al guardar valores esperados'
        });
    }
});

module.exports = router;
