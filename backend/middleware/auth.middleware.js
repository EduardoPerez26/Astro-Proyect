const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { buildDepartmentContext } = require('../config/departments');
const {
    normalizeUserPermissions,
    hasPermission,
    isSuperAdmin,
    isAdminRole
} = require('../config/permissions');
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

async function cargarIdentidadActual(decoded) {
    let usuarios;

    try {
        [usuarios] = await pool.query(
            `SELECT u.id,
                    u.username,
                    u.email,
                    u.nombre_completo,
                    u.rol,
                    u.activo,
                    u.departamento_id,
                    d.codigo AS departamento_codigo,
                    d.nombre AS departamento_nombre,
                    d.activo AS departamento_activo
             FROM usuarios u
             LEFT JOIN departamentos d ON d.id = u.departamento_id
             WHERE u.id = ?
             LIMIT 1`,
            [decoded.id]
        );
    } catch (error) {
        if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) {
            throw error;
        }

        [usuarios] = await pool.query(
            `SELECT id, username, email, nombre_completo, rol, activo
             FROM usuarios
             WHERE id = ?
             LIMIT 1`,
            [decoded.id]
        );
    }

    const usuario = usuarios[0];

    if (!usuario || usuario.activo === 0 || usuario.activo === false) {
        const error = new Error('The authenticated user does not exist or is inactive');
        error.code = 'AUTH_USER_INACTIVE';
        throw error;
    }

    return {
        ...decoded,
        username: usuario.username || decoded.username || null,
        email: usuario.email || decoded.email || null,
        nombre_completo: usuario.nombre_completo || decoded.nombre || decoded.nombre_completo || null,
        rol: usuario.rol,
        departamento_id: usuario.departamento_id || null,
        departamento: buildDepartmentContext({
            ...usuario,
            departamento_codigo:
                usuario.departamento_codigo ||
                decoded.departamento
        })
    };
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

        req.usuario = await cargarIdentidadActual(decoded);
        req.departamento = req.usuario.departamento;
        req.authToken = token;
        next();
    } catch (error) {
        return res.status(403).json({ error: true, message: 'Token is invalid or expired' });
    }
};

const verificarTokenStream = async (req, res, next) => {
    if(!obtenerTokenAutenticacion(req)){
        const queryToken = String(req.query.token || '').trim();
        if(queryToken){
            req.headers.authorization = `Bearer ${queryToken}`;
        }
    }
    return verificarToken(req,res, next);
};

const esAdmin = (req, res, next) => {
    if (!req.usuario || !isAdminRole(req.usuario)) {
        return res.status(403).json({ error: true, message: 'Access denied: administrators only' });
    }
    next();
};

const esSuperAdmin = (req, res, next) => {
    if (!req.usuario || !isSuperAdmin(req.usuario)) {
        return res.status(403).json({ error: true, message: 'Access denied: super administrators only' });
    }
    next();
};

const esSupervisorOAdmin = (req, res, next) => {
    if (
        !req.usuario ||
        (!isAdminRole(req.usuario) && req.usuario.rol !== 'supervisor')
    ) {
        return res.status(403).json({ error: true, message: 'Access denied: supervisors or administrators only' });
    }
    next();
};

const PERMISSION_MAPPING = {
    view_dashboard: [
        ['dashboardAdmin', 'ver'],
        ['systemCenter', 'ver']
    ],
    manage_sessions: ['dashboardAdmin', 'editar'],
    export_dashboard: ['dashboardAdmin', 'exportar'],
    view_approval_center: ['approvalCenter', 'ver'],
    manage_approval_center: ['approvalCenter', 'editar'],

    view_report_center: ['reportCenter', 'ver'],
    manage_report_center: ['reportCenter', 'editar'],
    view_audit_center: ['auditCenter', 'ver'],
    export_audit_center: ['auditCenter', 'exportar'],

    view_archivos: ['documentos', 'ver'],
    upload_files: ['documentos', 'crear'],
    validate_files: ['documentos', 'crear'],
    download_files: ['documentos', 'exportar'],
    delete_files: ['documentos', 'eliminar'],

    view_validaciones: ['historial', 'ver'],
    view_validation_stats: ['historial', 'ver'],
    delete_validaciones: ['historial', 'eliminar'],
    export_validaciones: ['historial', 'exportar'],

    view_conciliaciones: ['tiendas', 'ver'],
    create_conciliaciones: ['tiendas', 'crear'],
    edit_conciliaciones: ['tiendas', 'editar'],
    delete_conciliaciones: ['tiendas', 'eliminar'],
    export_conciliaciones: ['tiendas', 'exportar'],

    view_usuarios: ['usuarios', 'ver'],
    create_users: ['usuarios', 'crear'],
    edit_users: ['usuarios', 'editar'],
    delete_users: ['usuarios', 'eliminar'],
    export_users: ['usuarios', 'exportar'],

    view_permisos: ['permisos', 'ver'],
    manage_permissions: ['permisos', 'editar'],

    view_chat: ['chat', 'ver'],
    send_chat: ['chat', 'crear'],
    edit_chat: ['chat', 'editar'],
    delete_chat: ['chat', 'eliminar'],
    export_chat: ['chat', 'exportar'],

    view_restaurantes: [
        ['tiendas', 'ver'],
        ['controlRestaurants', 'ver']
    ],
    create_restaurantes: ['controlRestaurants', 'crear'],
    edit_restaurantes: ['controlRestaurants', 'editar'],
    delete_restaurantes: ['controlRestaurants', 'eliminar'],
    manage_restaurantes: ['controlRestaurants', 'editar'],

    view_system_errors: ['systemErrors', 'ver'],
    create_system_notifications: ['systemErrors', 'crear'],
    edit_system_errors: ['systemErrors', 'editar'],
    export_system_errors: ['systemErrors', 'exportar'],

    view_profile: ['perfil', 'ver'],
    edit_profile: ['perfil', 'editar']
};

const checkPermission = (permissionOrModule, requestedAction = null) => {
    return async (req, res, next) => {
        try {

            if (!req.usuario) {
                return res.status(401).json({
                    error: true,
                    message: 'User is not authenticated'
                });
            }

            if (isSuperAdmin(req.usuario)) {
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

            const mappedPermission = PERMISSION_MAPPING[permissionOrModule];
            const requestedPermissions =
                Array.isArray(mappedPermission?.[0])
                    ? mappedPermission
                    : [mappedPermission || [
                        permissionOrModule,
                        requestedAction || 'ver'
                    ]];
            const permissions = normalizeUserPermissions(
                rows[0].permisos,
                req.usuario.rol,
                { departmentCode: req.departamento?.codigo }
            );
            const allowed = requestedPermissions.some(([module, action]) =>
                hasPermission(permissions, module, action)
            );

            if (!allowed) {
                const required = requestedPermissions
                    .map(([module, action]) => `${module}.${action}`)
                    .join(' or ');
                return res.status(403).json({
                    error: true,
                    message: `Access denied: ${required} permission is required`
                });
            }

            req.permissions = permissions;
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
        const hasGlobalDepartmentAccess = isSuperAdmin(req.usuario);
        let departmentCode = String(
            req.departamento?.codigo ||
            req.usuario?.departamento?.codigo ||
            ''
        ).toLowerCase();
        const hasDepartmentId = Boolean(req.departamento?.id || req.usuario?.departamento_id);

        if (!hasGlobalDepartmentAccess && departmentCode && allowed.includes(departmentCode) && hasDepartmentId) {
            return next();
        }

        try {
            const [rows] = hasGlobalDepartmentAccess
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

        if (hasGlobalDepartmentAccess) return next();

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
    verificarTokenStream,
    esAdmin,
    esSuperAdmin,
    esSupervisorOAdmin,
    checkPermission,
    requireDepartment,
    obtenerTokenAutenticacion
};

