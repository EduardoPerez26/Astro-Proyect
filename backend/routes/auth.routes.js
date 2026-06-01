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

// ============================================
// POST /api/auth/login
// ============================================
// Inicia sesion y devuelve un token JWT
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

        // Buscar usuario en la base de datos
        const [usuarios] = await pool.query(
            'SELECT * FROM usuarios WHERE username = ? AND activo = TRUE',
            [username]
        );

        if (usuarios.length === 0) {
            return res.status(401).json({
                error: true,
                mensaje: 'Usuario o contrasena incorrectos'
            });
        }

        const usuario = usuarios[0];

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                error: true,
                mensaje: 'JWT_SECRET no configurado'
            });
        }

        const passwordValido = await bcrypt.compare(password, usuario.password);

        if (!passwordValido) {
            return res.status(401).json({
                error: true,
                mensaje: 'Usuario o contrasena incorrectos'
            });
        }

        // Crear token JWT
        const token = jwt.sign(
            {
                id: usuario.id,
                username: usuario.username,
                nombre: usuario.nombre_completo,
                email: usuario.email,
                rol: usuario.rol
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        // Guardar sesion en la base de datos
        await pool.query(
            `INSERT INTO sesiones (usuario_id, token, ip_address, user_agent, fecha_expiracion)
             VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
            [usuario.id, token, req.ip, req.headers['user-agent']]
        );

        // Responder con el token y datos del usuario
        res.json({
            error: false,
            mensaje: 'Login exitoso',
            token,
            usuario: {
                id: usuario.id,
                username: usuario.username,
                nombre: usuario.nombre_completo,
                email: usuario.email,
                rol: usuario.rol
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al iniciar sesion'
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
        // El middleware ya verifico el token y puso los datos en req.usuario
        res.json({
            error: false,
            mensaje: 'Token valido',
            usuario: req.usuario
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
