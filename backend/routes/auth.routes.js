// ============================================
// RUTAS DE AUTENTICACION CORREGIDAS
// ============================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { verificarToken } = require('../middleware/auth.middleware');

const JWT_SECRET = process.env.JWT_SECRET || 'mi_secreto_seguro';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';

// Permisos por defecto
const defaultPermisos = {
    admin: { dashboard: true, tiendas: true, documentos: true, perfil: true, permisos: true, historial: true, usuarios: true },
    supervisor: { dashboard: true, tiendas: true, documentos: true, perfil: true, permisos: false, historial: true, usuarios: false },
    usuario: { dashboard: true, tiendas: false, documentos: true, perfil: true, permisos: false, historial: false, usuarios: false }
};

// ============================================
// POST /api/auth/login
// ============================================
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: true, mensaje: 'Usuario y contraseña son obligatorios' });
        }

        const [rows] = await pool.query(
            `SELECT * FROM usuarios WHERE (username = ? OR email = ?) AND activo = TRUE LIMIT 1`,
            [username, username]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: true, mensaje: 'Usuario o contraseña incorrectos' });
        }

        const usuario = rows[0];

        const isValid = await bcrypt.compare(password, usuario.password);
        if (!isValid) {
            return res.status(401).json({ error: true, mensaje: 'Usuario o contraseña incorrectos' });
        }

        // Crear token JWT
        const token = jwt.sign(
            {
                id: usuario.id,
                username: usuario.username,
                rol: usuario.rol
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );

        // Guardar sesión
        await pool.query(
            `INSERT INTO sesiones (usuario_id, token, ip_address, user_agent, fecha_expiracion)
             VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 8 HOUR))`,
            [usuario.id, token, req.ip, req.headers['user-agent']]
        );

        res.json({
            error: false,
            mensaje: 'Login exitoso',
            token,
            usuario: {
                id: usuario.id,
                username: usuario.username,
                nombre_completo: usuario.nombre_completo,
                email: usuario.email,
                rol: usuario.rol,
                permisos: usuario.permisos,
                activo: usuario.activo
            }
        });

    } catch (error) {
        console.error('ERROR LOGIN:', error);
        res.status(500).json({ error: true, mensaje: 'Error al iniciar sesión', detalle: error.message });
    }
});

// ============================================
// POST /api/auth/register
// ============================================
router.post('/register', async (req, res) => {
    try {
        const { username, password, nombre_completo, email, rol } = req.body;

        if (!username || !password || !nombre_completo || !email) {
            return res.status(400).json({ error: true, mensaje: 'Todos los campos son requeridos' });
        }

        // Revisar duplicados
        const [existente] = await pool.query(
            'SELECT id FROM usuarios WHERE username = ? OR email = ?',
            [username, email]
        );
        if (existente.length > 0) {
            return res.status(400).json({ error: true, mensaje: 'El usuario o email ya existe' });
        }

        // Normalizar rol y permisos
        const rolValido = ['admin', 'supervisor', 'usuario'];
        const rolFinal = rol ? rol.toLowerCase() : 'usuario';
        const rolAsignado = rolValido.includes(rolFinal) ? rolFinal : 'usuario';
        const permisosAsignados = defaultPermisos[rolAsignado];

        const passwordHash = await bcrypt.hash(password, 10);

        const [resultado] = await pool.query(
            `INSERT INTO usuarios (username, password, nombre_completo, email, rol, activo, permisos)
             VALUES (?, ?, ?, ?, ?, TRUE, ?)`,
            [username, passwordHash, nombre_completo, email, rolAsignado, JSON.stringify(permisosAsignados)]
        );

        res.status(201).json({
            error: false,
            mensaje: 'Usuario registrado exitosamente',
            usuarioId: resultado.insertId
        });

    } catch (error) {
        console.error('ERROR REGISTER:', error);
        res.status(500).json({ error: true, mensaje: 'Error al registrar usuario', detalle: error.message });
    }
});

// ============================================
// GET /api/auth/verify
// ============================================
router.get('/verify', verificarToken, async (req, res) => {
    try {
        res.json({ error: false, mensaje: 'Token válido', usuario: req.usuario });
    } catch (error) {
        res.status(500).json({ error: true, mensaje: 'Error al verificar token' });
    }
});

// ============================================
// GET /api/auth/profile
// ============================================
router.get('/profile', verificarToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, username, nombre_completo, email, rol, activo, fecha_creacion FROM usuarios WHERE id = ? AND activo = TRUE',
            [req.usuario.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: true, mensaje: 'Usuario no encontrado' });
        }
        res.json({ error: false, usuario: rows[0] });
    } catch (error) {
        console.error('ERROR PROFILE:', error);
        res.status(500).json({ error: true, mensaje: 'Error al obtener perfil' });
    }
});

// ============================================
// POST /api/auth/logout
// ============================================
router.post('/logout', verificarToken, async (req, res) => {
    try {
        const token = req.headers['authorization'].split(' ')[1];
        await pool.query('UPDATE sesiones SET activa = FALSE WHERE token = ?', [token]);
        res.json({ error: false, mensaje: 'Sesión cerrada exitosamente' });
    } catch (error) {
        console.error('ERROR LOGOUT:', error);
        res.status(500).json({ error: true, mensaje: 'Error al cerrar sesión' });
    }
});

module.exports = router;