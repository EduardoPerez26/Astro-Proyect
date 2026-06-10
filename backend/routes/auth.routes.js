const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { verificarToken } = require('../middleware/auth.middleware');

const JWT_SECRET = process.env.JWT_SECRET || 'mi_secreto_seguro';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';

// POST login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: true, mensaje: 'Usuario y contraseña son obligatorios' });

        const [rows] = await pool.query(`SELECT * FROM usuarios WHERE username = ? OR email = ? LIMIT 1`, [username, username]);
        if (rows.length === 0) return res.status(401).json({ error: true, mensaje: 'Usuario o contraseña incorrectos' });

        const usuario = rows[0];
        const isValid = await bcrypt.compare(password, usuario.password);
        if (!isValid) return res.status(401).json({ error: true, mensaje: 'Usuario o contraseña incorrectos' });

        const token = jwt.sign({ id: usuario.id, username: usuario.username, rol: usuario.rol }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

        res.json({
            error: false,
            mensaje: `Bienvenido ${usuario.nombre_completo}`,
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
        console.error(error);
        res.status(500).json({ error: true, mensaje: 'Error en login', detalle: error.message });
    }
});

// GET verify
router.get('/verify', verificarToken, async (req, res) => {
    res.json({ error: false, usuario: req.usuario, mensaje: 'Token válido' });
});

module.exports = router;