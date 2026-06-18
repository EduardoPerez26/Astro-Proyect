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
// Inicia sesion y devuelve un token JWT
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        console.log('================================');
        console.log('LOGIN INTENT');
        console.log('Username recibido:', username);
        console.log('Password recibida:', password);
        console.log('================================');

        // Validar que se enviaron los datos
        if (!username || !password) {
            return res.status(400).json({
                error: true,
                mensaje: 'Usuario y contrasena son requeridos'
            });
        }

        // Buscar usuario
        const [usuarios] = await pool.query(
            'SELECT * FROM usuarios WHERE username = ? AND activo = TRUE',
            [username]
        );

        console.log('Usuarios encontrados:', usuarios.length);

        if (usuarios.length === 0) {
            console.log('ERROR: Usuario no encontrado o inactivo');

            return res.status(401).json({
                error: true,
                mensaje: 'Usuario o contrasena incorrectos'
            });
        }

        const usuario = usuarios[0];

        console.log('ID Usuario:', usuario.id);
        console.log('Username BD:', usuario.username);
        console.log('Activo:', usuario.activo);

        // ============================================
        // OBTENER PERMISOS
        // ============================================

        let permisosUsuario = {};

        if (usuario.rol === 'admin') {
            permisosUsuario = {
                perfil: true,
                tiendas: true,
                permisos: true,
                usuarios: true,
                controlRestaurantes: true,
                historial: true,
                documentos: true
            };
        } else {
            if (typeof usuario.permisos === 'string') {
                permisosUsuario = JSON.parse(usuario.permisos || '{}');
            } else {
                permisosUsuario = usuario.permisos || {};
            }

            permisosUsuario.tiendas = true;
            permisosUsuario.controlRestaurantes = false;
        }

        console.log('Permisos usuario:', permisosUsuario);

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

        // ============================================
        // OBTENER PERMISOS DEL USUARIO
        // ============================================

        let permisos = {};

        try {
            if (usuario.permisos) {
                permisos = typeof usuario.permisos === 'string'
                    ? JSON.parse(usuario.permisos)
                    : usuario.permisos;
            }
        } catch (error) {
            console.error('Error parseando permisos:', error);
            permisos = {};
        }

        console.log('Permisos:', permisos);

        // ============================================
        // CREAR TOKEN
        // ============================================

        const token = jwt.sign(
            {
                id: usuario.id,
                username: usuario.username,
                nombre: usuario.nombre_completo,
                email: usuario.email,
                rol: usuario.rol,
                permisos: permisosUsuario
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
            usuario: {
                id: usuario.id,
                username: usuario.username,
                nombre: usuario.nombre_completo,
                email: usuario.email,
                rol: usuario.rol,
                permisos: permisosUsuario
            }
        });

    } catch (error) {
        console.error('ERROR LOGIN:', error);

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
