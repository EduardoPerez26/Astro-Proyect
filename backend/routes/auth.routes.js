const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { verificarToken, esAdmin } = require('../middleware/auth.middleware');
const { buildDepartmentContext } = require('../config/departments');
const {
    tokenHash,
    registrarEventoSeguridad,
    registrarIntentoLogin,
    contarIntentosFallidos
} = require('../services/securityAudit.service');

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
    const departamento = buildDepartmentContext(usuario);
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
        departamento
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
    const hash = tokenHash(token);

    try {
        await pool.query(
            `INSERT INTO sesiones
            (usuario_id, token, token_hash, ip_address, user_agent, fecha_expiracion, ultimo_uso)
            VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), NOW())`,
            [usuarioId, token, hash, req.ip, req.headers['user-agent']]
        );

        return true;
    } catch (error) {
        if (error.code === 'ER_BAD_FIELD_ERROR') {
            try {
                await pool.query(
                    `INSERT INTO sesiones
                    (usuario_id, token, ip_address, user_agent, fecha_expiracion)
                    VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
                    [usuarioId, token, req.ip, req.headers['user-agent']]
                );
            } catch (fallbackError) {
                if (fallbackError.code === 'ER_DATA_TOO_LONG') {
                    console.warn(
                        'No se pudo registrar la sesion porque la columna sesiones.token es corta. El login continuara con JWT.',
                        fallbackError.code
                    );
                    return false;
                }

                throw fallbackError;
            }

            return true;
        }

        if (error.code === 'ER_DATA_TOO_LONG') {
            console.warn(
                'No se pudo registrar la sesion porque la columna sesiones.token es corta. El login continuara con JWT.',
                error.code
            );
            return false;
        }

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
        const usernameNormalizado = String(username || '').trim();

        // Validar que se enviaron los datos
        if (!usernameNormalizado || !password) {
            return res.status(400).json({
                error: true,
                mensaje: 'Usuario y contrasena son requeridos'
            });
        }

        const intentosFallidos = await contarIntentosFallidos({
            username: usernameNormalizado,
            req,
            ventanaMinutos: Number(process.env.AUTH_LOCK_WINDOW_MINUTES || 15)
        });
        const maxIntentos = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS || 7);

        if (intentosFallidos >= maxIntentos) {
            await registrarEventoSeguridad({
                evento: 'login_bloqueado',
                req,
                detalle: { username: usernameNormalizado, intentosFallidos }
            });

            return res.status(429).json({
                error: true,
                mensaje: 'Demasiados intentos. Espera unos minutos e intenta nuevamente.'
            });
        }

        // Buscar usuario
        const usuario = await obtenerUsuarioConDepartamento(
            'u.username = ? AND u.activo = TRUE',
            [usernameNormalizado]
        );

        if (!usuario) {
            await registrarIntentoLogin({
                username: usernameNormalizado,
                req,
                exitoso: false,
                detalle: 'usuario_no_encontrado'
            });

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
            await registrarEventoSeguridad({
                usuarioId: usuario.id,
                departamentoId: usuario.departamento_id,
                evento: 'login_departamento_inactivo',
                req
            });

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
            await registrarIntentoLogin({
                username: usernameNormalizado,
                req,
                exitoso: false,
                detalle: 'password_incorrecto'
            });

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
                rol: usuario.rol,
                departamento: contextoUsuario.departamento.codigo
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN || '24h'
            }
        );


        await registrarSesion(usuario.id, token, req);
        await registrarIntentoLogin({
            username: usernameNormalizado,
            req,
            exitoso: true,
            detalle: 'login_exitoso'
        });
        await registrarEventoSeguridad({
            usuarioId: usuario.id,
            departamentoId: contextoUsuario.departamento.id,
            evento: 'login_exitoso',
            req,
            detalle: { departamento: contextoUsuario.departamento.codigo }
        });

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
            mensaje: 'Error al iniciar sesion',
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
        const usuario = await obtenerUsuarioConDepartamento(
            'u.id = ? AND u.activo = TRUE',
            [req.usuario.id]
        );

        if (!usuario) {
            return res.status(404).json({
                error: true,
                mensaje: 'Usuario no encontrado'
            });
        }

        res.json({
            error: false,
            usuario: construirContextoUsuario(usuario)
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
        const hash = tokenHash(token);

        // Marcar la sesion como inactiva
        try {
            await pool.query(
                `UPDATE sesiones
                 SET activa = FALSE,
                     fecha_expiracion = NOW(),
                     fecha_revocacion = NOW(),
                     revocada_por = ?,
                     motivo_revocacion = 'logout_usuario'
                 WHERE token_hash = ? OR token = ?`,
                [req.usuario.id, hash, token]
            );
        } catch (error) {
            if (error.code === 'ER_BAD_FIELD_ERROR') {
                await pool.query(
                    'UPDATE sesiones SET activa = FALSE WHERE token = ?',
                    [token]
                );
            } else if (!esErrorEsquemaSesiones(error)) {
                throw error;
            }
        }

        await registrarEventoSeguridad({
            usuarioId: req.usuario.id,
            departamentoId: req.departamento?.id || null,
            evento: 'logout_usuario',
            req
        });

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
