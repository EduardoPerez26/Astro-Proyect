// ============================================
// RUTAS DE CONCILIACIONES
// ============================================

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verificarToken, esAdmin } = require('../middleware/auth.middleware');

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
            notas
        } = req.body;
        
        if (!restaurante_id || !template_id || !fecha_conciliacion || !datos_extraidos) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos'
            });
        }
        
        // Calcular estadisticas
        const datos = Array.isArray(datos_extraidos) ? datos_extraidos : [];
        const total_conceptos = datos.length;
        const conceptos_ok = datos.filter(d => Math.abs(d.diferencia || 0) < 0.01).length;
        const conceptos_diferencia = total_conceptos - conceptos_ok;
        const monto_total_diferencia = datos.reduce((sum, d) => sum + Math.abs(d.diferencia || 0), 0);
        
        const [result] = await pool.query(
            `INSERT INTO conciliaciones 
             (restaurante_id, template_id, usuario_id, fecha_conciliacion, periodo_inicio, periodo_fin,
              datos_extraidos, total_conceptos, conceptos_ok, conceptos_diferencia, monto_total_diferencia, notas, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'borrador')`,
            [
                restaurante_id,
                template_id,
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
            message: 'Error al crear conciliacion'
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
