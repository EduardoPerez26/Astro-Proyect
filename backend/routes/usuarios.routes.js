const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { verificarToken, esAdmin } = require('../middleware/auth.middleware');

const defaultPermisos = {
    admin: { dashboard: true, tiendas: true, documentos: true, perfil: true, permisos: true, historial: true, usuarios: true },
    supervisor: { dashboard: true, tiendas: true, documentos: true, perfil: true, permisos: false, historial: true, usuarios: false },
    usuario: { dashboard: true, tiendas: false, documentos: true, perfil: true, permisos: false, historial: false, usuarios: false }
};

// GET usuarios
router.get('/', verificarToken, esAdmin, async (req, res) => {
    try {
        const [usuarios] = await pool.query(
            `SELECT id, username, nombre_completo, email, rol, activo, permisos, fecha_creacion FROM usuarios ORDER BY nombre_completo`
        );
        usuarios.forEach(u => {
            if (u.permisos && typeof u.permisos === 'string') {
                try { u.permisos = JSON.parse(u.permisos); } catch { u.permisos = {}; }
            }
        });
        res.json({ error: false, usuarios });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: true, mensaje: 'Error al obtener usuarios' });
    }
});

// POST crear usuario
router.post('/', verificarToken, esAdmin, async (req, res) => {
    try {
        const { username, password, nombre_completo, email, rol, estado } = req.body;
        if (!username || !password || !nombre_completo || !email)
            return res.status(400).json({ error: true, mensaje: 'Faltan campos requeridos' });

        const [existente] = await pool.query('SELECT id FROM usuarios WHERE username = ? OR email = ?', [username, email]);
        if (existente.length > 0) return res.status(400).json({ error: true, mensaje: 'Usuario o email ya existe' });

        const rolValido = ['admin', 'supervisor', 'usuario'];
        const rolFinal = rol ? rol.toLowerCase() : 'usuario';
        const rolAsignado = rolValido.includes(rolFinal) ? rolFinal : 'usuario';
        const permisosAsignados = defaultPermisos[rolAsignado];

        const passwordHash = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            `INSERT INTO usuarios (username, password, nombre_completo, email, rol, activo, permisos)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [username, passwordHash, nombre_completo, email, rolAsignado, estado !== 'inactivo', JSON.stringify(permisosAsignados)]
        );

        res.status(201).json({
            error: false,
            mensaje: 'Usuario creado exitosamente',
            usuario: { id: result.insertId, username, nombre_completo, email, rol: rolAsignado }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: true, mensaje: 'Error al crear usuario', detalle: error.message });
    }
});

module.exports = router;