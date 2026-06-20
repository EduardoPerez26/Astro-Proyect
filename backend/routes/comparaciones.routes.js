const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verificarToken } = require('../middleware/auth.middleware');

function errorHistorial(error, res) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) {
        return res.status(503).json({
            success: false,
            code: 'HISTORIAL_COMPARACIONES_NO_INSTALADO',
            message: 'Ejecuta la migracion SQL del historial de comparaciones.'
        });
    }

    return res.status(500).json({
        success: false,
        message: 'No se pudo consultar el historial de comparaciones'
    });
}

router.get('/', verificarToken, async (req, res) => {
    try {
        const {
            restaurante_id,
            estado,
            fecha_desde,
            fecha_hasta,
            busqueda
        } = req.query;
        const condiciones = ['1 = 1'];
        const parametros = [];

        if (restaurante_id) {
            condiciones.push('ca.restaurante_id = ?');
            parametros.push(restaurante_id);
        }
        if (estado) {
            condiciones.push('ca.estado = ?');
            parametros.push(estado);
        }
        if (fecha_desde) {
            condiciones.push('DATE(ca.fecha_comparacion) >= ?');
            parametros.push(fecha_desde);
        }
        if (fecha_hasta) {
            condiciones.push('DATE(ca.fecha_comparacion) <= ?');
            parametros.push(fecha_hasta);
        }
        if (busqueda?.trim()) {
            condiciones.push(`(
                r.nombre LIKE ? OR r.codigo LIKE ? OR
                u.nombre_completo LIKE ? OR
                EXISTS (
                    SELECT 1 FROM comparacion_diferencias cd
                    WHERE cd.comparacion_id = ca.id AND cd.tienda LIKE ?
                )
            )`);
            const termino = `%${busqueda.trim()}%`;
            parametros.push(termino, termino, termino, termino);
        }

        const [comparaciones] = await pool.query(
            `SELECT ca.id,
                    ca.restaurante_id,
                    ca.usuario_id,
                    ca.archivo_referencia_id,
                    ca.conciliacion_id,
                    ca.fecha_operacion,
                    ca.estado,
                    ca.tiendas_comparadas,
                    ca.tiendas_con_diferencias,
                    ca.total_diferencias,
                    ca.monto_diferencia_absoluta,
                    ca.fecha_comparacion,
                    r.nombre AS restaurante_nombre,
                    r.codigo AS restaurante_codigo,
                    u.nombre_completo AS usuario_nombre,
                    a.nombre_original AS archivo_referencia_nombre
             FROM comparaciones_archivos ca
             JOIN restaurantes r ON r.id = ca.restaurante_id
             LEFT JOIN usuarios u ON u.id = ca.usuario_id
             LEFT JOIN archivos_excel a ON a.id = ca.archivo_referencia_id
             WHERE ${condiciones.join(' AND ')}
             ORDER BY ca.fecha_comparacion DESC, ca.id DESC
             LIMIT 500`,
            parametros
        );

        const [estadisticasRows] = await pool.query(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(estado = 'con_cambios'), 0) AS con_cambios,
                    COALESCE(SUM(estado = 'sin_cambios'), 0) AS sin_cambios,
                    COALESCE(SUM(estado = 'primera_carga'), 0) AS primeras_cargas,
                    COALESCE(SUM(tiendas_con_diferencias), 0) AS tiendas_con_diferencias
             FROM comparaciones_archivos`
        );

        const estadisticas = estadisticasRows[0] || {};
        res.json({
            success: true,
            comparaciones: comparaciones.map(item => ({
                ...item,
                tiendas_comparadas: Number(item.tiendas_comparadas || 0),
                tiendas_con_diferencias: Number(item.tiendas_con_diferencias || 0),
                total_diferencias: Number(item.total_diferencias || 0),
                monto_diferencia_absoluta: Number(item.monto_diferencia_absoluta || 0)
            })),
            estadisticas: {
                total: Number(estadisticas.total || 0),
                con_cambios: Number(estadisticas.con_cambios || 0),
                sin_cambios: Number(estadisticas.sin_cambios || 0),
                primeras_cargas: Number(estadisticas.primeras_cargas || 0),
                tiendas_con_diferencias: Number(estadisticas.tiendas_con_diferencias || 0)
            }
        });
    } catch (error) {
        console.error('Error listando comparaciones:', error);
        return errorHistorial(error, res);
    }
});

router.get('/:id', verificarToken, async (req, res) => {
    try {
        const [comparaciones] = await pool.query(
            `SELECT ca.*,
                    r.nombre AS restaurante_nombre,
                    r.codigo AS restaurante_codigo,
                    u.nombre_completo AS usuario_nombre,
                    a.nombre_original AS archivo_referencia_nombre
             FROM comparaciones_archivos ca
             JOIN restaurantes r ON r.id = ca.restaurante_id
             LEFT JOIN usuarios u ON u.id = ca.usuario_id
             LEFT JOIN archivos_excel a ON a.id = ca.archivo_referencia_id
             WHERE ca.id = ?
             LIMIT 1`,
            [req.params.id]
        );

        if (!comparaciones.length) {
            return res.status(404).json({
                success: false,
                message: 'Comparacion no encontrada'
            });
        }

        const [diferencias] = await pool.query(
            `SELECT id, tienda, fecha_operacion, tipo, campo,
                    valor_anterior, valor_nuevo, diferencia
             FROM comparacion_diferencias
             WHERE comparacion_id = ?
             ORDER BY tienda, tipo, campo, id`,
            [req.params.id]
        );

        res.json({
            success: true,
            comparacion: comparaciones[0],
            diferencias: diferencias.map(item => ({
                ...item,
                valor_anterior: item.valor_anterior === null ? null : Number(item.valor_anterior),
                valor_nuevo: item.valor_nuevo === null ? null : Number(item.valor_nuevo),
                diferencia: item.diferencia === null ? null : Number(item.diferencia)
            }))
        });
    } catch (error) {
        console.error('Error consultando comparacion:', error);
        return errorHistorial(error, res);
    }
});

module.exports = router;
