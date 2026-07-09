const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verificarToken, esAdmin, checkPermission } = require('../middleware/auth.middleware');
const { tokenHash, isSchemaError } = require('../services/securityAudit.service');

const PERIODOS = {
    '30d': 30,
    '12m': 365,
    all: null
};

const TABLAS_ADMIN_BASE_DATOS = [
    {
        nombre: 'auditoria_seguridad',
        titulo: 'Security audit',
        descripcion: 'Sensitive user and session events.',
        icono: 'fa-user-shield',
        orden: 'fecha_creacion',
        columnas: [
            'id',
            'usuario_id',
            'departamento_id',
            'evento',
            'ip_address',
            'detalle',
            'fecha_creacion'
        ]
    }
];

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

async function consultaSegura(sql, params = [], fallback = []) {
    try {
        const [rows] = await pool.query(sql, params);
        return rows;
    } catch (error) {
        if (isSchemaError(error)) {
            return fallback;
        }

        throw error;
    }
}

function escaparIdentificador(nombre) {
    return `\`${String(nombre).replace(/`/g, '``')}\``;
}

function normalizarValorTabla(valor) {
    if (valor instanceof Date) {
        return valor.toISOString();
    }

    if (Buffer.isBuffer(valor)) {
        return `[binary ${valor.length} bytes]`;
    }

    return valor;
}

function normalizarFilaTabla(row) {
    return Object.fromEntries(
        Object.entries(row || {}).map(([clave, valor]) => [
            clave,
            normalizarValorTabla(valor)
        ])
    );
}

function tablaPendiente(config) {
    return {
        nombre: config.nombre,
        titulo: config.titulo,
        descripcion: config.descripcion,
        icono: config.icono,
        existe: false,
        total: 0,
        columnas: [],
        columnas_muestra: [],
        registros: []
    };
}


function expresionColumnaAuditoria(nombresColumnas, columna) {
    return nombresColumnas.has(columna)
        ? `a.${escaparIdentificador(columna)}`
        : 'NULL';
}

async function obtenerRegistrosAuditoriaSeguridad(nombresColumnas) {
    const usuarioId = expresionColumnaAuditoria(nombresColumnas, 'usuario_id');
    const departamentoId = expresionColumnaAuditoria(nombresColumnas, 'departamento_id');
    const evento = expresionColumnaAuditoria(nombresColumnas, 'evento');
    const ipAddress = expresionColumnaAuditoria(nombresColumnas, 'ip_address');
    const detalle = expresionColumnaAuditoria(nombresColumnas, 'detalle');
    const fechaCreacion = expresionColumnaAuditoria(nombresColumnas, 'fecha_creacion');
    const columnaOrden = nombresColumnas.has('fecha_creacion')
        ? 'a.`fecha_creacion` DESC'
        : (nombresColumnas.has('id') ? 'a.`id` DESC' : '1');

    return consultaSegura(
        `SELECT COALESCE(
                    NULLIF(u.nombre_completo, ''),
                    CASE WHEN ${usuarioId} IS NULL THEN NULL ELSE CONCAT('User #', ${usuarioId}) END,
                    'System'
                ) AS usuario_nombre,
                COALESCE(
                    NULLIF(u.username, ''),
                    CASE WHEN ${usuarioId} IS NULL THEN 'system' ELSE CONCAT('user', ${usuarioId}) END,
                    'system'
                ) AS username,
                COALESCE(
                    NULLIF(d.nombre, ''),
                    NULLIF(
                        CASE
                            WHEN JSON_VALID(${detalle})
                            THEN JSON_UNQUOTE(JSON_EXTRACT(${detalle}, '$.departamento'))
                            ELSE NULL
                        END,
                        ''
                    ),
                    CASE
                        WHEN ${departamentoId} IS NULL THEN 'No department'
                        ELSE CONCAT('Dept. ', ${departamentoId})
                    END
                ) AS departamento_nombre,
                COALESCE(NULLIF(${evento}, ''), 'system_event') AS evento,
                COALESCE(NULLIF(${ipAddress}, ''), '-') AS ip_address,
                ${detalle} AS detalle,
                CASE
                    WHEN LOWER(COALESCE(${evento}, '')) IN ('user_logout', 'logout', 'sign_out')
                      OR LOWER(COALESCE(${evento}, '')) LIKE '%logout%'
                    THEN 'cerrado'
                    WHEN LOWER(COALESCE(${evento}, '')) IN ('login_success', 'sign_in', 'signin')
                      AND EXISTS (
                            SELECT 1
                            FROM sesiones s2
                            WHERE s2.usuario_id = ${usuarioId}
                              AND s2.activa = TRUE
                              AND s2.fecha_expiracion > NOW()
                              AND (${ipAddress} IS NULL OR s2.ip_address = ${ipAddress})
                              AND ABS(TIMESTAMPDIFF(SECOND, s2.fecha_creacion, ${fechaCreacion})) <= 10
                            LIMIT 1
                        )
                    THEN 'activo'
                    WHEN LOWER(COALESCE(${evento}, '')) LIKE '%login%'
                      OR LOWER(COALESCE(${evento}, '')) LIKE '%sign_in%'
                    THEN 'cerrado'
                    ELSE 'registrado'
                END AS estado,
                ${fechaCreacion} AS fecha_creacion
         FROM ${escaparIdentificador('auditoria_seguridad')} a
         LEFT JOIN usuarios u ON u.id = ${usuarioId}
         LEFT JOIN departamentos d ON d.id = COALESCE(${departamentoId}, u.departamento_id)
         ORDER BY ${columnaOrden}
         LIMIT 200`,
        [],
        []
    );
}

async function obtenerTablasBaseDatosAdmin() {
    const nombres = TABLAS_ADMIN_BASE_DATOS.map(tabla => tabla.nombre);

    try {
        const [tablasRows] = await pool.query(
            `SELECT TABLE_NAME AS nombre,
                    TABLE_ROWS AS filas_estimadas,
                    CREATE_TIME AS fecha_creacion,
                    UPDATE_TIME AS fecha_actualizacion
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN (?)`,
            [nombres]
        );

        const [columnasRows] = await pool.query(
            `SELECT TABLE_NAME AS tabla,
                    COLUMN_NAME AS nombre,
                    DATA_TYPE AS tipo,
                    COLUMN_KEY AS llave,
                    IS_NULLABLE AS nullable
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN (?)
             ORDER BY TABLE_NAME, ORDINAL_POSITION`,
            [nombres]
        );

        const tablasPorNombre = new Map(
            tablasRows.map(tabla => [tabla.nombre, tabla])
        );
        const columnasPorTabla = columnasRows.reduce((mapa, columna) => {
            if (!mapa.has(columna.tabla)) {
                mapa.set(columna.tabla, []);
            }

            mapa.get(columna.tabla).push(columna);
            return mapa;
        }, new Map());

        return Promise.all(TABLAS_ADMIN_BASE_DATOS.map(async config => {
            const metadata = tablasPorNombre.get(config.nombre);

            if (!metadata) {
                return tablaPendiente(config);
            }

            const columnas = columnasPorTabla.get(config.nombre) || [];
            const nombresColumnas = new Set(columnas.map(columna => columna.nombre));
            const columnasMuestra = config.columnas.filter(columna =>
                nombresColumnas.has(columna)
            );
            const tablaSql = escaparIdentificador(config.nombre);
            const columnaOrden = nombresColumnas.has(config.orden)
                ? config.orden
                : (nombresColumnas.has('id') ? 'id' : columnasMuestra[0]);
            const selectMuestra = columnasMuestra.length
                ? columnasMuestra.map(escaparIdentificador).join(', ')
                : null;

            const conteoRows = await consultaSegura(
                `SELECT COUNT(*) AS total FROM ${tablaSql}`,
                [],
                [{ total: 0 }]
            );
            const columnasMetadata = columnas.map(columna => ({
                nombre: columna.nombre,
                tipo: columna.tipo,
                llave: columna.llave,
                nullable: columna.nullable === 'YES'
            }));

            if (config.nombre === 'auditoria_seguridad') {
                const registrosAuditoria = await obtenerRegistrosAuditoriaSeguridad(nombresColumnas);

                return {
                    nombre: config.nombre,
                    titulo: config.titulo,
                    descripcion: config.descripcion,
                    icono: config.icono,
                    existe: true,
                    total: numero(conteoRows[0]?.total),
                    filas_estimadas: numero(metadata.filas_estimadas),
                    fecha_creacion: normalizarValorTabla(metadata.fecha_creacion),
                    fecha_actualizacion: normalizarValorTabla(metadata.fecha_actualizacion),
                    columnas: columnasMetadata,
                    columnas_muestra: [
                        'usuario_nombre',
                        'username',
                        'departamento_nombre',
                        'evento',
                        'ip_address',
                        'detalle',
                        'estado',
                        'fecha_creacion'
                    ],
                    registros: registrosAuditoria.map(normalizarFilaTabla)
                };
            }

            const registros = selectMuestra
                ? await consultaSegura(
                    `SELECT ${selectMuestra}
                     FROM ${tablaSql}
                     ${columnaOrden ? `ORDER BY ${escaparIdentificador(columnaOrden)} DESC` : ''}
                     LIMIT 10`,
                    [],
                    []
                )
                : [];

            return {
                nombre: config.nombre,
                titulo: config.titulo,
                descripcion: config.descripcion,
                icono: config.icono,
                existe: true,
                total: numero(conteoRows[0]?.total),
                filas_estimadas: numero(metadata.filas_estimadas),
                fecha_creacion: normalizarValorTabla(metadata.fecha_creacion),
                fecha_actualizacion: normalizarValorTabla(metadata.fecha_actualizacion),
                columnas: columnasMetadata,
                columnas_muestra: columnasMuestra,
                registros: registros.map(normalizarFilaTabla)
            };
        }));
    } catch (error) {
        console.warn(
            'The admin dashboard table inventory could not be loaded:',
            error.code || error.message
        );

        return TABLAS_ADMIN_BASE_DATOS.map(tablaPendiente);
    }
}

async function obtenerDashboardAdminBasico(tokenActual) {
    const [
        usuariosRows,
        sesionesRows,
        archivosRows,
        validacionesRows,
        sesionesRecientes,
        movimientos,
        actividadUsers
    ] = await Promise.all([
        consultaSegura(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(activo = TRUE), 0) AS activos,
                    COALESCE(SUM(rol IN ('superadmin', 'admin')), 0) AS administradores
             FROM usuarios`,
            [],
            [{ total: 0, activos: 0, administradores: 0 }]
        ),
        consultaSegura(
            `SELECT COALESCE(SUM(activa = TRUE AND fecha_expiracion > NOW()), 0) AS activas,
                    COALESCE(SUM(DATE(fecha_creacion) = CURDATE()), 0) AS inicios_hoy,
                    COALESCE(SUM(fecha_creacion >= DATE_SUB(NOW(), INTERVAL 7 DAY)), 0) AS inicios_7_dias
             FROM sesiones`,
            [],
            [{ activas: 0, inicios_hoy: 0, inicios_7_dias: 0 }]
        ),
        consultaSegura(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(DATE(fecha_subida) = CURDATE()), 0) AS hoy,
                    COALESCE(SUM(fecha_subida >= DATE_SUB(NOW(), INTERVAL 7 DAY)), 0) AS ultimos_7_dias
             FROM archivos_excel`,
            [],
            [{ total: 0, hoy: 0, ultimos_7_dias: 0 }]
        ),
        consultaSegura(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(DATE(fecha_validacion) = CURDATE()), 0) AS hoy,
                    COALESCE(SUM(resultado IN ('con_errores', 'fallido')), 0) AS con_incidencias
             FROM historial_validaciones`,
            [],
            [{ total: 0, hoy: 0, con_incidencias: 0 }]
        ),
        consultaSegura(
            `SELECT s.id,
                    s.ip_address,
                    s.user_agent,
                    s.fecha_creacion,
                    s.fecha_expiracion,
                    (s.activa = TRUE AND s.fecha_expiracion > NOW()) AS activa,
                    (s.token = ?) AS sesion_actual,
                    u.id AS usuario_id,
                    u.nombre_completo AS usuario_nombre,
                    u.username,
                    u.rol,
                    NULL AS departamento_nombre
             FROM sesiones s
             JOIN usuarios u ON u.id = s.usuario_id
             ORDER BY s.fecha_creacion DESC, s.id DESC
             LIMIT 20`,
            [tokenActual],
            []
        ),
        consultaSegura(
            `SELECT movimientos.*
             FROM (
                SELECT CONCAT('sesion-', s.id) AS id,
                       'sesion' AS tipo,
                       'Sign-in' AS accion,
                       u.nombre_completo AS usuario_nombre,
                       u.username,
                       NULL AS departamento_nombre,
                       s.ip_address AS ip_address,
                       s.fecha_creacion AS fecha,
                       CONCAT_WS(' | ', s.ip_address, LEFT(s.user_agent, 90)) AS detalle,
                       IF(s.activa = TRUE AND s.fecha_expiracion > NOW(), 'activo', 'cerrado') AS estado
                FROM sesiones s
                JOIN usuarios u ON u.id = s.usuario_id

                UNION ALL

                SELECT CONCAT('archivo-', a.id) AS id,
                       'archivo' AS tipo,
                       'File saved' AS accion,
                       u.nombre_completo AS usuario_nombre,
                       u.username,
                       NULL AS departamento_nombre,
                       NULL AS ip_address,
                       a.fecha_subida AS fecha,
                       CONCAT_WS(' | ', a.nombre_original, r.nombre) AS detalle,
                       a.estado AS estado
                FROM archivos_excel a
                LEFT JOIN usuarios u ON u.id = a.usuario_id
                LEFT JOIN restaurantes r ON r.id = a.restaurante_id
             ) movimientos
             ORDER BY movimientos.fecha DESC
             LIMIT 200`,
            [],
            []
        ),
        consultaSegura(
            `SELECT u.id,
                    u.nombre_completo AS nombre,
                    u.username,
                    u.rol,
                    u.activo,
                    NULL AS departamento_nombre,
                    COUNT(DISTINCT s.id) AS total_sesiones,
                    COUNT(DISTINCT a.id) AS total_archivos,
                    MAX(s.fecha_creacion) AS ultimo_acceso
             FROM usuarios u
             LEFT JOIN sesiones s ON s.usuario_id = u.id
             LEFT JOIN archivos_excel a ON a.usuario_id = u.id
             GROUP BY u.id, u.nombre_completo, u.username, u.rol, u.activo
             ORDER BY ultimo_acceso DESC, u.nombre_completo ASC
             LIMIT 12`,
            [],
            []
        )
    ]);

    const usuarios = usuariosRows[0] || {};
    const sesiones = sesionesRows[0] || {};
    const archivos = archivosRows[0] || {};
    const validaciones = validacionesRows[0] || {};
    const tablasBaseDatos = await obtenerTablasBaseDatosAdmin();

    return {
        success: true,
        modo_compatibilidad: true,
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
            departamentos_total: 0,
            departamentos_activos: 0
        },
        sesiones_recientes: sesionesRecientes.map(row => ({
            ...row,
            activa: Boolean(row.activa),
            sesion_actual: Boolean(row.sesion_actual)
        })),
        movimientos,
        actividad_usuarios: actividadUsers.map(row => ({
            ...row,
            total_sesiones: numero(row.total_sesiones),
            total_archivos: numero(row.total_archivos)
        })),
        tablas_base_datos: tablasBaseDatos
    };
}

router.get('/resumen', verificarToken, checkPermission('view_dashboard'), async (req, res) => {
    try {
        const periodo = Object.hasOwn(PERIODOS, req.query.periodo)
            ? req.query.periodo
            : '12m';
        const fechaDesde = obtenerFechaDesde(periodo);
        const filtroFiles = fechaDesde
            ? 'WHERE a.fecha_subida >= ?'
            : '';
        const condicionRestaurant = fechaDesde
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
                 ${filtroFiles}`,
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
                 ${filtroFiles}
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
                    ${condicionRestaurant}
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
                 ${filtroFiles}
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
        const totalFiles = numero(resumen.total_archivos);
        const validados = numero(resumen.validados);

        res.json({
            success: true,
            periodo,
            generado_en: new Date().toISOString(),
            resumen: {
                total_archivos: totalFiles,
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
                tasa_validacion: totalFiles
                    ? Math.round((validados / totalFiles) * 1000) / 10
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
        console.error('Error loading dashboard summary:', error);
        res.status(500).json({
            success: false,
            message: 'Dashboard summary could not be loaded'
        });
    }
});

router.get('/admin', verificarToken, esAdmin, checkPermission('view_dashboard'), async (req, res) => {
    const tokenActual =
        req.authToken ||
        req.headers.authorization?.split(' ')[1] ||
        '';

    try {
        const [
            [usuariosRows],
            [sesionesRows],
            [archivosRows],
            [validacionesRows],
            [departamentosRows],
            [sesionesRecientes],
            [movimientos],
            [actividadUsers],
            tablasBaseDatos
        ] = await Promise.all([
            pool.query(
                `SELECT COUNT(*) AS total,
                        COALESCE(SUM(activo = TRUE), 0) AS activos,
                        COALESCE(SUM(rol IN ('superadmin', 'admin')), 0) AS administradores
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
                        (s.token = ?) AS sesion_actual,
                        u.id AS usuario_id,
                        u.nombre_completo AS usuario_nombre,
                        u.username,
                        u.rol,
                        d.nombre AS departamento_nombre
                 FROM sesiones s
                 JOIN usuarios u ON u.id = s.usuario_id
                 LEFT JOIN departamentos d ON d.id = u.departamento_id
                 ORDER BY s.fecha_creacion DESC, s.id DESC
                 LIMIT 20`,
                [tokenActual]
            ),
            pool.query(
                `SELECT movimientos.*
                 FROM (
                    SELECT CONCAT('sesion-', s.id) AS id,
                           'sesion' AS tipo,
                           'Sign-in' AS accion,
                           u.nombre_completo AS usuario_nombre,
                           u.username,
                           d.nombre AS departamento_nombre,
                           s.ip_address AS ip_address,
                           s.fecha_creacion AS fecha,
                           CONCAT_WS(' | ', s.ip_address, LEFT(s.user_agent, 90)) AS detalle,
                           IF(s.activa = TRUE AND s.fecha_expiracion > NOW(), 'activo', 'cerrado') AS estado
                    FROM sesiones s
                    JOIN usuarios u ON u.id = s.usuario_id
                    LEFT JOIN departamentos d ON d.id = u.departamento_id

                    UNION ALL

                    SELECT CONCAT('archivo-', a.id) AS id,
                           'archivo' AS tipo,
                           'File saved' AS accion,
                           u.nombre_completo AS usuario_nombre,
                           u.username,
                           d.nombre AS departamento_nombre,
                           NULL AS ip_address,
                           a.fecha_subida AS fecha,
                           CONCAT_WS(' | ', a.nombre_original, r.nombre) AS detalle,
                           a.estado AS estado
                    FROM archivos_excel a
                    LEFT JOIN usuarios u ON u.id = a.usuario_id
                    LEFT JOIN departamentos d ON d.id = u.departamento_id
                    LEFT JOIN restaurantes r ON r.id = a.restaurante_id

                    UNION ALL

                    SELECT CONCAT('validacion-', hv.id) AS id,
                           'validacion' AS tipo,
                           'Validation executed' AS accion,
                           u.nombre_completo AS usuario_nombre,
                           u.username,
                           d.nombre AS departamento_nombre,
                           NULL AS ip_address,
                           hv.fecha_validacion AS fecha,
                           CONCAT(hv.tipo_validacion, ' | ', hv.total_errores, ' error(s)') AS detalle,
                           hv.resultado AS estado
                    FROM historial_validaciones hv
                    LEFT JOIN usuarios u ON u.id = hv.usuario_id
                    LEFT JOIN departamentos d ON d.id = u.departamento_id
                 ) movimientos
                 ORDER BY movimientos.fecha DESC
                 LIMIT 200`
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
            ),
            obtenerTablasBaseDatosAdmin()
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
                activa: Boolean(row.activa),
                sesion_actual: Boolean(row.sesion_actual)
            })),
            movimientos,
            actividad_usuarios: actividadUsers.map(row => ({
                ...row,
                total_sesiones: numero(row.total_sesiones),
                total_archivos: numero(row.total_archivos)
            })),
            tablas_base_datos: tablasBaseDatos
        });
    } catch (error) {
        console.error('Error loading admin dashboard:', error);

        if (isSchemaError(error)) {
            try {
                return res.json(await obtenerDashboardAdminBasico(tokenActual));
            } catch (fallbackError) {
                console.error('Error loading basic admin dashboard:', fallbackError);
            }
        }

        res.status(500).json({
            success: false,
            message: 'Admin dashboard could not be loaded',
            code: error.code
        });
    }
});

router.patch('/admin/sessions/:sessionId/logout', verificarToken, esAdmin, checkPermission('manage_sessions'), async (req, res) => {
    try {
        const sessionId = Number(req.params.sessionId);
        const tokenActual =
            req.authToken ||
            req.headers.authorization?.split(' ')[1] ||
            '';
        const hashActual = tokenHash(tokenActual);

        if (!Number.isInteger(sessionId) || sessionId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid session'
            });
        }

        let sesiones;

        try {
            [sesiones] = await pool.query(
                `SELECT s.id, s.token, s.token_hash, s.activa, u.nombre_completo AS usuario_nombre
                 FROM sesiones s
                 JOIN usuarios u ON u.id = s.usuario_id
                 WHERE s.id = ?
                 LIMIT 1`,
                [sessionId]
            );
        } catch (error) {
            if (error.code !== 'ER_BAD_FIELD_ERROR') throw error;

            [sesiones] = await pool.query(
                `SELECT s.id, s.token, NULL AS token_hash, s.activa, u.nombre_completo AS usuario_nombre
                 FROM sesiones s
                 JOIN usuarios u ON u.id = s.usuario_id
                 WHERE s.id = ?
                 LIMIT 1`,
                [sessionId]
            );
        }

        const sesion = sesiones[0];

        if (!sesion) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        if (sesion.token === tokenActual || sesion.token_hash === hashActual) {
            return res.status(400).json({
                success: false,
                message: 'You cannot close the current session from this panel'
            });
        }

        if (!sesion.activa) {
            return res.json({
                success: true,
                message: 'The session was already closed'
            });
        }

        try {
            await pool.query(
                `UPDATE sesiones
                 SET activa = FALSE,
                     fecha_expiracion = NOW(),
                     fecha_revocacion = NOW(),
                     revocada_por = ?,
                     motivo_revocacion = 'cerrada_por_admin'
                 WHERE id = ?`,
                [req.usuario.id, sessionId]
            );
        } catch (error) {
            if (error.code !== 'ER_BAD_FIELD_ERROR') throw error;

            await pool.query(
                `UPDATE sesiones
                 SET activa = FALSE,
                     fecha_expiracion = NOW()
                 WHERE id = ?`,
                [sessionId]
            );
        }

        res.json({
            success: true,
            message: `Session closed for ${sesion.usuario_nombre}`
        });
    } catch (error) {
        console.error('Error closing session from admin dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'The session could not be closed'
        });
    }
});

module.exports = router;
