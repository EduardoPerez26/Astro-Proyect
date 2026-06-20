const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verificarToken, esAdmin } = require('../middleware/auth.middleware');

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

router.get('/admin', verificarToken, esAdmin, async (req, res) => {
    try {
        const [
            [usuariosRows],
            [sesionesRows],
            [archivosRows],
            [validacionesRows],
            [departamentosRows],
            [sesionesRecientes],
            [movimientos],
            [actividadUsuarios]
        ] = await Promise.all([
            pool.query(
                `SELECT COUNT(*) AS total,
                        COALESCE(SUM(activo = TRUE), 0) AS activos,
                        COALESCE(SUM(rol = 'admin'), 0) AS administradores
                 FROM usuarios`
            ),
            pool.query(
                `SELECT COALESCE(SUM(activa = TRUE AND fecha_expiracion > NOW()), 0) AS activas,
                        COALESCE(SUM(DATE(fecha_creacion) = CURDATE()), 0) AS inicios_hoy,
                        COALESCE(SUM(fecha_creacion >= DATE_SUB(NOW(), INTERVAL 7 DAY)), 0) AS inicios_7_dias
                 FROM sesiones`
            ),
            pool.query(
                `SELECT COUNT(*) AS total,
                        COALESCE(SUM(DATE(fecha_subida) = CURDATE()), 0) AS hoy,
                        COALESCE(SUM(fecha_subida >= DATE_SUB(NOW(), INTERVAL 7 DAY)), 0) AS ultimos_7_dias
                 FROM archivos_excel`
            ),
            pool.query(
                `SELECT COUNT(*) AS total,
                        COALESCE(SUM(DATE(fecha_validacion) = CURDATE()), 0) AS hoy,
                        COALESCE(SUM(resultado IN ('con_errores', 'fallido')), 0) AS con_incidencias
                 FROM historial_validaciones`
            ),
            pool.query(
                `SELECT COUNT(*) AS total,
                        COALESCE(SUM(activo = TRUE), 0) AS activos
                 FROM departamentos`
            ),
            pool.query(
                `SELECT s.id,
                        s.ip_address,
                        s.user_agent,
                        s.fecha_creacion,
                        s.fecha_expiracion,
                        (s.activa = TRUE AND s.fecha_expiracion > NOW()) AS activa,
                        u.id AS usuario_id,
                        u.nombre_completo AS usuario_nombre,
                        u.username,
                        u.rol,
                        d.nombre AS departamento_nombre
                 FROM sesiones s
                 JOIN usuarios u ON u.id = s.usuario_id
                 LEFT JOIN departamentos d ON d.id = u.departamento_id
                 ORDER BY s.fecha_creacion DESC, s.id DESC
                 LIMIT 20`
            ),
            pool.query(
                `SELECT movimientos.*
                 FROM (
                    SELECT CONCAT('sesion-', s.id) AS id,
                           'sesion' AS tipo,
                           'Inicio de sesion' AS accion,
                           u.nombre_completo AS usuario_nombre,
                           u.username,
                           s.fecha_creacion AS fecha,
                           CONCAT_WS(' | ', s.ip_address, LEFT(s.user_agent, 90)) AS detalle,
                           IF(s.activa = TRUE AND s.fecha_expiracion > NOW(), 'activo', 'cerrado') AS estado
                    FROM sesiones s
                    JOIN usuarios u ON u.id = s.usuario_id

                    UNION ALL

                    SELECT CONCAT('archivo-', a.id) AS id,
                           'archivo' AS tipo,
                           'Archivo guardado' AS accion,
                           u.nombre_completo AS usuario_nombre,
                           u.username,
                           a.fecha_subida AS fecha,
                           CONCAT_WS(' | ', a.nombre_original, r.nombre) AS detalle,
                           a.estado AS estado
                    FROM archivos_excel a
                    LEFT JOIN usuarios u ON u.id = a.usuario_id
                    LEFT JOIN restaurantes r ON r.id = a.restaurante_id

                    UNION ALL

                    SELECT CONCAT('validacion-', hv.id) AS id,
                           'validacion' AS tipo,
                           'Validacion ejecutada' AS accion,
                           u.nombre_completo AS usuario_nombre,
                           u.username,
                           hv.fecha_validacion AS fecha,
                           CONCAT(hv.tipo_validacion, ' | ', hv.total_errores, ' error(es)') AS detalle,
                           hv.resultado AS estado
                    FROM historial_validaciones hv
                    LEFT JOIN usuarios u ON u.id = hv.usuario_id
                 ) movimientos
                 ORDER BY movimientos.fecha DESC
                 LIMIT 30`
            ),
            pool.query(
                `SELECT u.id,
                        u.nombre_completo AS nombre,
                        u.username,
                        u.rol,
                        u.activo,
                        d.nombre AS departamento_nombre,
                        COUNT(DISTINCT s.id) AS total_sesiones,
                        COUNT(DISTINCT a.id) AS total_archivos,
                        MAX(s.fecha_creacion) AS ultimo_acceso
                 FROM usuarios u
                 LEFT JOIN departamentos d ON d.id = u.departamento_id
                 LEFT JOIN sesiones s ON s.usuario_id = u.id
                 LEFT JOIN archivos_excel a ON a.usuario_id = u.id
                 GROUP BY u.id, u.nombre_completo, u.username, u.rol, u.activo, d.nombre
                 ORDER BY ultimo_acceso DESC, u.nombre_completo ASC
                 LIMIT 12`
            )
        ]);

        const usuarios = usuariosRows[0] || {};
        const sesiones = sesionesRows[0] || {};
        const archivos = archivosRows[0] || {};
        const validaciones = validacionesRows[0] || {};
        const departamentos = departamentosRows[0] || {};

        res.json({
            success: true,
            generado_en: new Date().toISOString(),
            resumen: {
                usuarios_total: numero(usuarios.total),
                usuarios_activos: numero(usuarios.activos),
                administradores: numero(usuarios.administradores),
                sesiones_activas: numero(sesiones.activas),
                inicios_hoy: numero(sesiones.inicios_hoy),
                inicios_7_dias: numero(sesiones.inicios_7_dias),
                archivos_total: numero(archivos.total),
                archivos_hoy: numero(archivos.hoy),
                archivos_7_dias: numero(archivos.ultimos_7_dias),
                validaciones_total: numero(validaciones.total),
                validaciones_hoy: numero(validaciones.hoy),
                validaciones_con_incidencias: numero(validaciones.con_incidencias),
                departamentos_total: numero(departamentos.total),
                departamentos_activos: numero(departamentos.activos)
            },
            sesiones_recientes: sesionesRecientes.map(row => ({
                ...row,
                activa: Boolean(row.activa)
            })),
            movimientos,
            actividad_usuarios: actividadUsuarios.map(row => ({
                ...row,
                total_sesiones: numero(row.total_sesiones),
                total_archivos: numero(row.total_archivos)
            }))
        });
    } catch (error) {
        console.error('Error cargando dashboard administrativo:', error);
        res.status(500).json({
            success: false,
            message: 'No se pudo cargar el dashboard administrativo',
            code: error.code
        });
    }
});

module.exports = router;
