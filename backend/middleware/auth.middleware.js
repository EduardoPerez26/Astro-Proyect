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
        return res.status(401).json({ error: true, message: 'Token no proporcionado' });
    }

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ error: true, message: 'JWT_SECRET no configurado' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        try {
            const sesionActiva = await validarSesionActiva(token);

            if (!sesionActiva) {
                return res.status(403).json({ error: true, message: 'Token invalido o expirado' });
            }
        } catch (error) {
            if (!esErrorEsquemaSesiones(error)) {
                throw error;
            }

            console.warn(
                'Validacion de sesion omitida porque falta actualizar la tabla sesiones.',
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
        return res.status(403).json({ error: true, message: 'Token invalido o expirado' });
    }
};

const esAdmin = (req, res, next) => {
    if (!req.usuario || req.usuario.rol !== 'admin') {
        return res.status(403).json({ error: true, message: 'Acceso denegado: solo administradores' });
    }
    next();
};

const esSupervisorOAdmin = (req, res, next) => {
    if (!req.usuario || (req.usuario.rol !== 'admin' && req.usuario.rol !== 'supervisor')) {
        return res.status(403).json({ error: true, message: 'Acceso denegado: solo supervisores o administradores' });
    }
    next();
};

const checkPermission = (permiso) => {
    return async (req, res, next) => {
        try {

            if (!req.usuario) {
                return res.status(401).json({
                    error: true,
                    message: 'Usuario no autenticado'
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
                    message: 'Usuario no encontrado'
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
                    message: `Acceso denegado: permiso requerido: ${permiso}`
                });
            }

            next();

        } catch (error) {
            console.error('Error en checkPermission:', error);

            res.status(500).json({
                error: true,
                message: 'Error al verificar permiso'
            });
        }
    };
};

const requireDepartment = (allowedDepartments = []) => {
    const allowed = Array.isArray(allowedDepartments)
        ? allowedDepartments.map(value => String(value).toLowerCase())
        : [String(allowedDepartments).toLowerCase()];

    return (req, res, next) => {
        if (req.usuario?.rol === 'admin') return next();

        const departmentCode = String(
            req.departamento?.codigo ||
            req.usuario?.departamento?.codigo ||
            ''
        ).toLowerCase();

        if (!departmentCode || !allowed.includes(departmentCode)) {
            return res.status(403).json({
                error: true,
                message: 'Acceso denegado para este departamento'
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

