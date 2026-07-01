const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { buildDepartmentContext } = require('../config/departments');
const { tokenHash } = require('../services/securityAudit.service');

function obtenerCookie(req, nombre) {
    const header = req.headers.cookie || '';
    const cookies = header.split(';').map(cookie => cookie.trim());
    const prefijo = `${nombre}=`;
    const encontrada = cookies.find(cookie => cookie.startsWith(prefijo));

    return encontrada
        ? decodeURIComponent(encontrada.slice(prefijo.length))
        : '';
}

function obtenerTokenAutenticacion(req) {
    const authHeader = req.headers.authorization || '';

    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }

    return obtenerCookie(req, 'auth_token');
}

function esErrorEsquemaSesiones(error) {
    const detalle = [
        error.sqlMessage,
        error.message,
        error.sql
    ].filter(Boolean).join(' ');

    return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)
        && /sesiones/i.test(detalle);
}

async function validarSesionActiva(token) {
    const hash = tokenHash(token);

    try {
        const [sesiones] = await pool.query(
            `SELECT id
             FROM sesiones
             WHERE (token_hash = ? OR token = ?)
               AND activa = TRUE
               AND fecha_expiracion > NOW()
             LIMIT 1`,
            [hash, token]
        );

        return sesiones.length > 0;
    } catch (error) {
        if (error.code !== 'ER_BAD_FIELD_ERROR') {
            throw error;
        }

        const [sesiones] = await pool.query(
            `SELECT id
             FROM sesiones
             WHERE token = ?
               AND activa = TRUE
               AND fecha_expiracion > NOW()
             LIMIT 1`,
            [token]
        );

        return sesiones.length > 0;
    }
}

const verificarToken = async (req, res, next) => {
    const token = obtenerTokenAutenticacion(req);

    if (!token) {
        return res.status(401).json({ error: true, message: 'Token was not provided' });
    }

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ error: true, message: 'JWT_SECRET is not configured' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        try {
            const sesionActiva = await validarSesionActiva(token);

            if (!sesionActiva) {
                return res.status(403).json({ error: true, message: 'Token is invalid or expired' });
            }
        } catch (error) {
            if (!esErrorEsquemaSesiones(error)) {
                throw error;
            }

            console.warn(
                'Session validation was skipped because the sesiones table needs to be updated.',
                error.code
            );
        }

        req.usuario = decoded;
        req.departamento = buildDepartmentContext({
            departamento_codigo: decoded.departamento
        });
        req.usuario.departamento = req.departamento;
        req.authToken = token;
        next();
    } catch (error) {
        return res.status(403).json({ error: true, message: 'Token is invalid or expired' });
    }
};

const esAdmin = (req, res, next) => {
    if (!req.usuario || req.usuario.rol !== 'admin') {
        return res.status(403).json({ error: true, message: 'Access denied: administrators only' });
    }
    next();
};

const esSupervisorOAdmin = (req, res, next) => {
    if (!req.usuario || (req.usuario.rol !== 'admin' && req.usuario.rol !== 'supervisor')) {
        return res.status(403).json({ error: true, message: 'Access denied: supervisors or administrators only' });
    }
    next();
};

const checkPermission = (permiso) => {
    return async (req, res, next) => {
        try {

            if (!req.usuario) {
                return res.status(401).json({
                    error: true,
                    message: 'User is not authenticated'
                });
            }

            if (req.usuario.rol === 'admin') {
                return next();
            }

            const [rows] = await pool.query(
                `SELECT u.permisos
                 FROM usuarios u
                 WHERE u.id = ?
                 LIMIT 1`,
                [req.usuario.id]
            );

            if (!rows.length) {
                return res.status(404).json({
                    error: true,
                    message: 'User not found'
                });
            }

            let permisos = {};
            const permisosFuente = rows[0].permisos;

            if (typeof permisosFuente === 'string') {
                permisos = JSON.parse(permisosFuente || '{}');
            } else {
                permisos = permisosFuente || {};
            }

            const mapping = {
                view_dashboard: 'dashboardAdmin',

                view_archivos: 'documentos',
                upload_files: 'documentos',
                validate_files: 'documentos',

                view_validaciones: 'historial',

                view_usuarios: 'usuarios',
                manage_users: 'usuarios',

                view_permisos: 'permisos',

                view_restaurantes: 'tiendas',
                manage_restaurantes: 'tiendas',

                view_profile: 'perfil'
            };
            const permisoJson = mapping[permiso] || permiso;

            if (!permisos[permisoJson]) {
                return res.status(403).json({
                    error: true,
                    message: `Access denied: required permission: ${permiso}`
                });
            }

            next();

        } catch (error) {
            console.error('Error in checkPermission:', error);

            res.status(500).json({
                error: true,
                message: 'Permission verification failed'
            });
        }
    };
};

const requireDepartment = (allowedDepartments = []) => {
    const allowed = Array.isArray(allowedDepartments)
        ? allowedDepartments.map(value => String(value).toLowerCase())
        : [String(allowedDepartments).toLowerCase()];
    const lookupCodes = Array.from(new Set(
        allowed.flatMap(value => value === 'property-management'
            ? ['property-management', 'pm']
            : [value]
        )
    ));

    return async (req, res, next) => {
        const isAdmin = req.usuario?.rol === 'admin';
        let departmentCode = String(
            req.departamento?.codigo ||
            req.usuario?.departamento?.codigo ||
            ''
        ).toLowerCase();
        const hasDepartmentId = Boolean(req.departamento?.id || req.usuario?.departamento_id);

        if (!isAdmin && departmentCode && allowed.includes(departmentCode) && hasDepartmentId) {
            return next();
        }

        try {
            const [rows] = isAdmin
                ? await pool.query(
                    `SELECT id AS departamento_id,
                            codigo AS departamento_codigo,
                            nombre AS departamento_nombre,
                            activo AS departamento_activo
                     FROM departamentos
                     WHERE LOWER(codigo) IN (?)
                     LIMIT 1`,
                    [lookupCodes]
                )
                : await pool.query(
                    `SELECT u.departamento_id,
                            d.codigo AS departamento_codigo,
                            d.nombre AS departamento_nombre,
                            d.activo AS departamento_activo
                     FROM usuarios u
                     LEFT JOIN departamentos d ON d.id = u.departamento_id
                     WHERE u.id = ?
                     LIMIT 1`,
                    [req.usuario.id]
                );

            if (rows.length) {
                req.departamento = buildDepartmentContext(rows[0]);
                req.usuario.departamento = req.departamento;
                req.usuario.departamento_id = rows[0].departamento_id || null;
                departmentCode = String(req.departamento?.codigo || '').toLowerCase();
            }
        } catch (error) {
            if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) {
                console.error('Department verification failed:', error);
                return res.status(500).json({
                    error: true,
                    message: 'Department verification failed'
                });
            }
        }

        if (isAdmin) return next();

        if (!departmentCode || !allowed.includes(departmentCode)) {
            return res.status(403).json({
                error: true,
                message: 'Access denied for this department'
            });
        }

        next();
    };
};

module.exports = {
    verificarToken,
    esAdmin,
    esSupervisorOAdmin,
    checkPermission,
    requireDepartment,
    obtenerTokenAutenticacion
};

