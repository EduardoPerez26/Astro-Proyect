const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const verificarToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: true, message: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: true, message: 'Token no valido' });
    }

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ error: true, message: 'JWT_SECRET no configurado' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [sesiones] = await pool.query(
            'SELECT id FROM sesiones WHERE token = ? AND activa = TRUE LIMIT 1',
            [token]
        );

        if (sesiones.length === 0) {
            return res.status(403).json({ error: true, message: 'Token invalido o expirado' });
        }

        req.usuario = decoded;
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

// Middleware para verificar permisos por nombre.
// Uso: checkPermission('ver_reportes') => devuelve middleware
const checkPermission = (permiso) => {
    return async (req, res, next) => {
        try {


            console.log('================================');
            console.log('CHECK PERMISSION');
            console.log('Permiso solicitado:', permiso);
            console.log('Usuario req.usuario:', req.usuario);
            console.log('Rol:', req.usuario?.rol);
            console.log('================================');

            if (!req.usuario) {
                return res.status(401).json({
                    error: true,
                    message: 'Usuario no autenticado'
                });
            }

            // Admin tiene acceso total
            if (req.usuario.rol === 'admin') {
                return next();
            }

            const [rows] = await pool.query(
                `SELECT u.permisos,
                        u.departamento_id,
                        d.modulos AS departamento_modulos,
                        d.activo AS departamento_activo
                 FROM usuarios u
                 LEFT JOIN departamentos d ON d.id = u.departamento_id
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
            const usaDepartamento = Boolean(rows[0].departamento_id);
            const departamentoActivo = rows[0].departamento_activo !== 0;
            const permisosFuente = usaDepartamento
                ? (departamentoActivo ? rows[0].departamento_modulos : {})
                : rows[0].permisos;

            if (typeof permisosFuente === 'string') {
                permisos = JSON.parse(permisosFuente || '{}');
            } else {
                permisos = permisosFuente || {};
            }

            const mapping = {
                view_dashboard: 'dashboard',

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

module.exports = {
    verificarToken,
    esAdmin,
    esSupervisorOAdmin,
    checkPermission
};

