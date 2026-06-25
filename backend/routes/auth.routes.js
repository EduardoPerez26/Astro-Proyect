const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { verificarToken, esAdmin } = require('../middleware/auth.middleware');

const PERMISOS_ADMIN = {
    dashboardAdmin: true,
    perfil: true,
    tiendas: true,
    permisos: true,
    usuarios: true,
    controlRestaurantes: true,
    historial: true,
    documentos: true
};

function parsearJson(valor) {
    if (!valor) return {};
    if (typeof valor === 'object') return valor;

    try {
        return JSON.parse(valor);
    } catch {
        return {};
    }
}

function construirContextoUsuario(usuario) {
    const tieneDepartamento = Boolean(usuario.departamento_id);
    const departamentoActivo = tieneDepartamento && usuario.departamento_activo !== 0;
    let permisos;

    if (usuario.rol === 'admin') {
        const permisosGuardados = parsearJson(usuario.permisos);
        const paginaInicio = ['dashboardAdmin', 'tiendas', 'documentos', 'historial'].includes(
            permisosGuardados.paginaInicio
        ) ? permisosGuardados.paginaInicio : 'dashboardAdmin';
        permisos = { ...PERMISOS_ADMIN, paginaInicio };
    } else {
        permisos = {
            tiendas: false,
            documentos: false,
            historial: false,
            perfil: true,
            permisos: false,
            usuarios: false,
            controlRestaurantes: false,
            ...parsearJson(usuario.permisos),
            usuarios: false,
            permisos: false,
            controlRestaurantes: false
        };
    }

    return {
        id: usuario.id,
        username: usuario.username,
        nombre: usuario.nombre_completo,
        email: usuario.email,
        rol: usuario.rol,
        permisos,
        departamento: tieneDepartamento
            ? {
                id: usuario.departamento_id,
                codigo: usuario.departamento_codigo,
                nombre: usuario.departamento_nombre,
                activo: departamentoActivo
            }
            : null
    };
}

async function obtenerUsuarioConDepartamento(condicion, params) {
    let usuarios;

    try {
        [usuarios] = await pool.query(
            `SELECT u.*,
                    d.codigo AS departamento_codigo,
                    d.nombre AS departamento_nombre,
                    d.activo AS departamento_activo
             FROM usuarios u
             LEFT JOIN departamentos d ON d.id = u.departamento_id
             WHERE ${condicion}
             LIMIT 1`,
            params
        );
    } catch (error) {
        if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) {
            throw error;
        }

        [usuarios] = await pool.query(
            `SELECT u.*,
                    NULL AS departamento_codigo,
                    NULL AS departamento_nombre,
                    NULL AS departamento_activo
             FROM usuarios u
             WHERE ${condicion}
             LIMIT 1`,
            params
        );
    }

    return usuarios[0] || null;
}

function esErrorEsquema(error) {
    return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code);
}

function esErrorEsquemaSesiones(error) {
    const detalle = [
        error.sqlMessage,
        error.message,
        error.sql
    ].filter(Boolean).join(' ');

    return esErrorEsquema(error) && /sesiones/i.test(detalle);
}

async function registrarSesion(usuarioId, token, req) {
    try {
        await pool.query(
            `INSERT INTO sesiones
            (usuario_id, token, ip_address, user_agent, fecha_expiracion)
            VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
            [usuarioId, token, req.ip, req.headers['user-agent']]
        );

        return true;
    } catch (error) {
        if (!esErrorEsquemaSesiones(error)) {
            throw error;
        }

        console.warn(
            'No se pudo registrar la sesion porque falta actualizar la tabla sesiones. El login continuara con JWT.',
            error.code
        );
        return false;
    }
}

function opcionesCookieAuth(req) {
    const esProduccion = process.env.NODE_ENV === 'production';
    const origen = String(req.headers.origin || '');
    const esLocal = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origen);

    return {
        httpOnly: true,
        secure: esProduccion && !esLocal,
        sameSite: esProduccion && !esLocal ? 'none' : 'lax',
        maxAge: Number(process.env.JWT_COOKIE_MAX_AGE_MS || 24 * 60 * 60 * 1000),
        path: '/'
    };
}

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validar que se enviaron los datos
        if (!username || !password) {
            return res.status(400).json({
                error: true,
                mensaje: 'Usuario y contrasena son requeridos'
            });
        }

        // Buscar usuario
        const usuario = await obtenerUsuarioConDepartamento(
            'u.username = ? AND u.activo = TRUE',
            [username]
        );

        if (!usuario) {
            return res.status(401).json({
                error: true,
                mensaje: 'Usuario o contrasena incorrectos'
            });
        }

        if (
            usuario.rol !== 'admin' &&
            usuario.departamento_id &&
            usuario.departamento_activo === 0
        ) {
            return res.status(403).json({
                error: true,
                mensaje: 'Tu departamento esta inactivo. Contacta al administrador.'
            });
        }

        const passwordValido = await bcrypt.compare(
            password,
            usuario.password
        );

        if (!passwordValido) {
            return res.status(401).json({
                error: true,
                mensaje: 'Usuario o contrasena incorrectos'
            });
        }

        const contextoUsuario = construirContextoUsuario(usuario);

        const token = jwt.sign(
            {
                id: usuario.id,
                username: usuario.username,
                rol: usuario.rol
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN || '24h'
            }
        );


        await registrarSesion(usuario.id, token, req);

        res.cookie('auth_token', token, opcionesCookieAuth(req));

        res.json({
            error: false,
            mensaje: 'Login exitoso',
            token,
            usuario: contextoUsuario
        });

    } catch (error) {
        console.error('ERROR LOGIN:', error);

        res.status(500).json({
            error: true,
            mensaje: esErrorEsquema(error)
                ? 'Ejecuta primero la migracion SQL de departamentos'
                : 'Error al iniciar sesion',
            code: error.code
        });
    }
});

router.post('/register', verificarToken, esAdmin, async (req, res) => {
    try {
        const { username, password, nombre_completo, email, rol } = req.body;

        // Validar datos requeridos
        if (!username || !password || !nombre_completo || !email) {
            return res.status(400).json({
                error: true,
                mensaje: 'Todos los campos son requeridos'
            });
        }

        // Verificar si el usuario ya existe
        const [existente] = await pool.query(
            'SELECT id FROM usuarios WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existente.length > 0) {
            return res.status(400).json({
                error: true,
                mensaje: 'El usuario o email ya existe'
            });
        }

        // Encriptar contrasena
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insertar usuario
        const [resultado] = await pool.query(
            `INSERT INTO usuarios (username, password, nombre_completo, email, rol)
             VALUES (?, ?, ?, ?, ?)`,
            [username, passwordHash, nombre_completo, email, rol || 'usuario']
        );

        res.status(201).json({
            error: false,
            mensaje: 'Usuario registrado exitosamente',
            usuarioId: resultado.insertId
        });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al registrar usuario'
        });
    }
});

router.get('/verify', verificarToken, async (req, res) => {
    try {
        const usuario = await obtenerUsuarioConDepartamento(
            'u.id = ? AND u.activo = TRUE',
            [req.usuario.id]
        );

        if (!usuario) {
            return res.status(404).json({
                error: true,
                mensaje: 'Usuario no encontrado o inactivo'
            });
        }

        res.json({
            error: false,
            mensaje: 'Token valido',
            usuario: construirContextoUsuario(usuario)
        });
    } catch (error) {
        res.status(500).json({
            error: true,
            mensaje: 'Error al verificar token'
        });
    }
});

router.get('/profile', verificarToken, async (req, res) => {
    try {
        const [usuarios] = await pool.query(
            'SELECT id, username, nombre_completo, email, rol, activo, fecha_creacion FROM usuarios WHERE id = ? AND activo = TRUE',
            [req.usuario.id]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({
                error: true,
                mensaje: 'Usuario no encontrado'
            });
        }

        const usuario = usuarios[0];

        res.json({
            error: false,
            usuario
        });
    } catch (error) {
        console.error('Error al cargar perfil:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al obtener datos del perfil'
        });
    }
});

router.post('/logout', verificarToken, async (req, res) => {
    try {
        const token = req.authToken;

        // Marcar la sesion como inactiva
        await pool.query(
            'UPDATE sesiones SET activa = FALSE WHERE token = ?',
            [token]
        );

        res.clearCookie('auth_token', opcionesCookieAuth(req));

        res.json({
            error: false,
            mensaje: 'Sesion cerrada exitosamente'
        });
    } catch (error) {
        res.status(500).json({
            error: true,
            mensaje: 'Error al cerrar sesion'
        });
    }
});

module.exports = router;
