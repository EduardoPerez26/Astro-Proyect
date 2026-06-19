// ============================================
// RUTAS DE AUTENTICACION
// ============================================
// Maneja login, registro y verificacion de token.
// ============================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { verificarToken } = require('../middleware/auth.middleware');

const PERMISOS_ADMIN = {
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
    const modulosDepartamento = departamentoActivo
        ? parsearJson(usuario.departamento_modulos)
        : {};
    let permisos;

    if (usuario.rol === 'admin') {
        permisos = { ...PERMISOS_ADMIN };
    } else if (tieneDepartamento) {
        permisos = {
            perfil: true,
            tiendas: false,
            documentos: false,
            historial: false,
            permisos: false,
            usuarios: false,
            controlRestaurantes: false,
            ...modulosDepartamento
        };
    } else {
        permisos = {
            ...parsearJson(usuario.permisos),
            tiendas: true,
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
                modulos: modulosDepartamento,
                pagina_inicio: usuario.departamento_pagina_inicio,
                activo: departamentoActivo
            }
            : null
    };
}

async function obtenerUsuarioConDepartamento(condicion, params) {
    const [usuarios] = await pool.query(
        `SELECT u.*,
                d.codigo AS departamento_codigo,
                d.nombre AS departamento_nombre,
                d.modulos AS departamento_modulos,
                d.pagina_inicio AS departamento_pagina_inicio,
                d.activo AS departamento_activo
         FROM usuarios u
         LEFT JOIN departamentos d ON d.id = u.departamento_id
         WHERE ${condicion}
         LIMIT 1`,
        params
    );

    return usuarios[0] || null;
}

// ============================================
// POST /api/auth/login
// ============================================
// Inicia sesion y devuelve un token JWT
// Inicia sesion y devuelve un token JWT
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        console.log('================================');
        console.log('LOGIN INTENT');
        console.log('Username recibido:', username);
        console.log('================================');

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

        console.log('Usuario encontrado:', Boolean(usuario));

        if (!usuario) {
            console.log('ERROR: Usuario no encontrado o inactivo');

            return res.status(401).json({
                error: true,
                mensaje: 'Usuario o contrasena incorrectos'
            });
        }

        console.log('ID Usuario:', usuario.id);
        console.log('Username BD:', usuario.username);
        console.log('Activo:', usuario.activo);

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

        // ============================================
        // VALIDAR PASSWORD
        // ============================================

        const passwordValido = await bcrypt.compare(
            password,
            usuario.password
        );

        console.log('Password válida:', passwordValido);

        if (!passwordValido) {
            console.log('ERROR: Contraseña incorrecta');

            return res.status(401).json({
                error: true,
                mensaje: 'Usuario o contrasena incorrectos'
            });
        }

        console.log('LOGIN EXITOSO');

        const contextoUsuario = construirContextoUsuario(usuario);
        console.log('Permisos efectivos:', contextoUsuario.permisos);

        // ============================================
        // CREAR TOKEN
        // ============================================

        const token = jwt.sign(
            {
                ...contextoUsuario
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN || '24h'
            }
        );

        // ============================================
        // GUARDAR SESION
        // ============================================

        await pool.query(
            `INSERT INTO sesiones
            (usuario_id, token, ip_address, user_agent, fecha_expiracion)
            VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
            [usuario.id, token, req.ip, req.headers['user-agent']]
        );

        // ============================================
        // RESPUESTA
        // ============================================

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
            mensaje: ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)
                ? 'Ejecuta primero la migracion SQL de departamentos'
                : 'Error al iniciar sesion',
            code: error.code
        });
    }
});

// ============================================
// POST /api/auth/register
// ============================================
// Registra un nuevo usuario
router.post('/register', async (req, res) => {
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

// ============================================
// GET /api/auth/verify
// ============================================
// Verifica si el token es valido y devuelve datos del usuario
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

// ============================================
// GET /api/auth/profile
// ============================================
// Retorna los datos del usuario desde la base de datos
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

// ============================================
// POST /api/auth/logout
// ============================================
// Cierra la sesion (invalida el token en la BD)
router.post('/logout', verificarToken, async (req, res) => {
    try {
        const token = req.headers['authorization'].split(' ')[1];

        // Marcar la sesion como inactiva
        await pool.query(
            'UPDATE sesiones SET activa = FALSE WHERE token = ?',
            [token]
        );

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
