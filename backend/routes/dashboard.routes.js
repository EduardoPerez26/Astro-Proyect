const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verificarToken } = require('../middleware/auth.middleware');

const PERIODOS = {
    '30d': 30,
    '12m': 365,
    all: null
};

function obtenerFechaDesde(periodo) {
    const dias = PERIODOS[periodo];

    if (!dias) {
        return null;
    }

    const fecha = new Date();
    fecha.setHours(0, 0, 0, 0);
    fecha.setDate(fecha.getDate() - dias);
    return fecha;
}

function numero(valor) {
    return Number(valor || 0);
}

router.get('/resumen', verificarToken, async (req, res) => {
    try {
        const periodo = Object.hasOwn(PERIODOS, req.query.periodo)
            ? req.query.periodo
            : '12m';
        const fechaDesde = obtenerFechaDesde(periodo);
        const filtroArchivos = fechaDesde
            ? 'WHERE a.fecha_subida >= ?'
            : '';
        const condicionRestaurante = fechaDesde
            ? 'AND a.fecha_subida >= ?'
            : '';
        const filtroValidaciones = fechaDesde
            ? 'WHERE hv.fecha_validacion >= ?'
            : '';
        const formatoTendencia = periodo === '30d'
            ? '%Y-%m-%d'
            : '%Y-%m';
        const parametros = fechaDesde ? [fechaDesde] : [];

        const [
            [resumenRows],
            [restaurantesActivosRows],
            [tendenciaRows],
            [restaurantesRows],
            [actividadRows],
            [validacionesRows]
        ] = await Promise.all([
            pool.query(
                `SELECT
                    COUNT(*) AS total_archivos,
                    COALESCE(SUM(a.estado = 'validado'), 0) AS validados,
                    COALESCE(SUM(a.estado = 'con_errores'), 0) AS con_errores,
                    COALESCE(SUM(a.estado = 'pendiente'), 0) AS pendientes,
                    COALESCE(SUM(a.estado = 'procesado'), 0) AS procesados,
                    COUNT(DISTINCT a.restaurante_id) AS restaurantes_con_actividad,
                    COALESCE(SUM(a.tamano_bytes), 0) AS total_bytes
                 FROM archivos_excel a
                 ${filtroArchivos}`,
                parametros
            ),
            pool.query(
                `SELECT COUNT(*) AS total
                 FROM restaurantes
                 WHERE activo = TRUE`
            ),
            pool.query(
                `SELECT
                    DATE_FORMAT(a.fecha_subida, '${formatoTendencia}') AS periodo,
                    COUNT(*) AS total,
                    COALESCE(SUM(a.estado = 'validado'), 0) AS validados,
                    COALESCE(SUM(a.estado = 'con_errores'), 0) AS con_errores
                 FROM archivos_excel a
                 ${filtroArchivos}
                 GROUP BY periodo
                 ORDER BY periodo ASC`,
                parametros
            ),
            pool.query(
                `SELECT
                    r.id,
                    r.nombre,
                    r.codigo,
                    r.icono,
                    COUNT(a.id) AS total_archivos,
                    COALESCE(SUM(a.estado = 'validado'), 0) AS validados,
                    COALESCE(SUM(a.estado = 'con_errores'), 0) AS con_errores,
                    COALESCE(SUM(a.estado = 'pendiente'), 0) AS pendientes,
                    MAX(a.fecha_subida) AS ultima_actividad
                 FROM restaurantes r
                 LEFT JOIN archivos_excel a
                    ON a.restaurante_id = r.id
                    ${condicionRestaurante}
                 WHERE r.activo = TRUE
                 GROUP BY r.id, r.nombre, r.codigo, r.icono
                 ORDER BY total_archivos DESC, r.nombre ASC`,
                parametros
            ),
            pool.query(
                `SELECT
                    a.id,
                    a.nombre_original,
                    a.estado,
                    a.tamano_bytes,
                    a.fecha_subida,
                    r.nombre AS restaurante_nombre,
                    r.codigo AS restaurante_codigo,
                    u.nombre_completo AS usuario_nombre
                 FROM archivos_excel a
                 LEFT JOIN restaurantes r ON r.id = a.restaurante_id
                 LEFT JOIN usuarios u ON u.id = a.usuario_id
                 ${filtroArchivos}
                 ORDER BY a.fecha_subida DESC, a.id DESC
                 LIMIT 8`,
                parametros
            ),
            pool.query(
                `SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(hv.resultado = 'exitoso'), 0) AS exitosas,
                    COALESCE(SUM(hv.resultado = 'con_errores'), 0) AS con_errores,
                    COALESCE(SUM(hv.resultado = 'fallido'), 0) AS fallidas,
                    COALESCE(SUM(hv.total_errores), 0) AS total_errores,
                    AVG(hv.duracion_segundos) AS tiempo_promedio
                 FROM historial_validaciones hv
                 ${filtroValidaciones}`,
                parametros
            )
        ]);

        const resumen = resumenRows[0] || {};
        const validaciones = validacionesRows[0] || {};
        const totalArchivos = numero(resumen.total_archivos);
        const validados = numero(resumen.validados);

        res.json({
            success: true,
            periodo,
            generado_en: new Date().toISOString(),
            resumen: {
                total_archivos: totalArchivos,
                validados,
                con_errores: numero(resumen.con_errores),
                pendientes: numero(resumen.pendientes),
                procesados: numero(resumen.procesados),
                restaurantes_activos: numero(
                    restaurantesActivosRows[0]?.total
                ),
                restaurantes_con_actividad: numero(
                    resumen.restaurantes_con_actividad
                ),
                total_bytes: numero(resumen.total_bytes),
                tasa_validacion: totalArchivos
                    ? Math.round((validados / totalArchivos) * 1000) / 10
                    : 0,
                total_validaciones: numero(validaciones.total),
                errores_detectados: numero(validaciones.total_errores),
                tiempo_promedio_validacion: validaciones.tiempo_promedio === null
                    ? null
                    : numero(validaciones.tiempo_promedio)
            },
            tendencia: tendenciaRows.map(row => ({
                periodo: row.periodo,
                total: numero(row.total),
                validados: numero(row.validados),
                con_errores: numero(row.con_errores)
            })),
            restaurantes: restaurantesRows.map(row => ({
                ...row,
                total_archivos: numero(row.total_archivos),
                validados: numero(row.validados),
                con_errores: numero(row.con_errores),
                pendientes: numero(row.pendientes)
            })),
            actividad_reciente: actividadRows
        });
    } catch (error) {
        console.error('Error cargando resumen del dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'No se pudo cargar el resumen del dashboard'
        });
    }
});

module.exports = router;
