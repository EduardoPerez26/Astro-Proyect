// ============================================
// RUTAS DE USUARIOS - CORREGIDO
// ============================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { verificarToken, esAdmin } = require('../middleware/auth.middleware');

// Permisos por defecto
const defaultPermisos = {
    admin: { dashboard: true, tiendas: true, documentos: true, perfil: true, permisos: true, historial: true, usuarios: true },
    supervisor: { dashboard: true, tiendas: true, documentos: true, perfil: true, permisos: false, historial: true, usuarios: false },
    usuario: { dashboard: true, tiendas: false, documentos: true, perfil: true, permisos: false, historial: false, usuarios: false }
};

// ============================================
// GET /api/usuarios
// ============================================
router.get('/', verificarToken, esAdmin, async (req, res) => {
    try {
        const [usuarios] = await pool.query(
            `SELECT id, username, nombre_completo as nombre, email, rol, activo, permisos, fecha_creacion
             FROM usuarios ORDER BY nombre_completo`
        );

        const usuariosFormateados = usuarios.map(u => {
            let permisos = {};
            if (u.permisos) {
                try { permisos = typeof u.permisos === 'string' ? JSON.parse(u.permisos) : u.permisos; } 
                catch { permisos = {}; }
            }
            return { ...u, permisos };
        });

        res.json({ error: false, success: true, usuarios: usuariosFormateados });
    } catch (error) {
        console.error('Error al listar usuarios:', error);
        res.status(500).json({ error: true, success: false, mensaje: 'Error al obtener usuarios' });
    }
});

// ============================================
// POST /api/usuarios
// ============================================
router.post('/', verificarToken, esAdmin, async (req, res) => {
    try {
        const { nombre, email, username, password, rol, estado } = req.body;

        // Validar campos obligatorios
        if (!nombre || !email || !username || !password) {
            return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
        }

        // Validar que no exista username/email duplicado
        const [existing] = await pool.query(
            'SELECT id FROM usuarios WHERE username = ? OR email = ?',
            [username, email]
        );
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'El usuario o email ya existe' });
        }

        // Normalizar y validar rol
        const rolValido = ['admin', 'supervisor', 'usuario'];
        const rolFinal = rol ? rol.toLowerCase() : 'usuario';
        const rolAsignado = rolValido.includes(rolFinal) ? rolFinal : 'usuario';

        // Hash de contraseña
        const passwordHash = await bcrypt.hash(password, 10);

        // Permisos por defecto según rol
        const permisosAsignados = defaultPermisos[rolAsignado];

        // Insertar usuario
        const [result] = await pool.query(
            `INSERT INTO usuarios (username, password, nombre_completo, email, rol, activo, permisos) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [username, passwordHash, nombre, email, rolAsignado, estado !== 'inactivo', JSON.stringify(permisosAsignados)]
        );

        res.status(201).json({
            success: true,
            message: 'Usuario creado exitosamente',
            usuario: { id: result.insertId, nombre, email, username, rol: rolAsignado }
        });

    } catch (error) {
        console.error('Error al crear usuario:', error);
        res.status(500).json({ success: false, message: 'Error al crear usuario', detalle: error.message });
    }
});

// ============================================
// PUT, DELETE y GET permisos se mantienen igual
// ============================================
// ... tu código existente para PUT /usuarios/:id, DELETE, GET permisos, etc.
// Solo se recomienda reemplazar los POST y la lógica de permisos como se hizo arriba.

module.exports = router;