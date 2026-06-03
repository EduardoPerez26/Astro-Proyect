// ============================================
// RUTAS DE USUARIOS - Producción
// ============================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { verificarToken, esAdmin } = require('../middleware/auth.middleware');

// ============================================
// GET /api/usuarios
// Lista todos los usuarios (solo admin)
// ============================================
router.get('/', verificarToken, esAdmin, async (req, res) => {
    try {
        const [usuarios] = await pool.query(
            `SELECT id, username, nombre_completo, email, rol, activo, fecha_creacion 
             FROM usuarios ORDER BY fecha_creacion DESC`
        );

        res.json({ error: false, usuarios });
    } catch (error) {
        console.error('Error al listar usuarios:', error);
        res.status(500).json({ error: true, mensaje: 'Error al obtener usuarios' });
    }
});

// ============================================
// POST /api/usuarios
// Crear un nuevo usuario (solo admin)
// ============================================
router.post('/', verificarToken, esAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const { username, nombre_completo, email, password, rol = 'usuario' } = req.body;

        // Validaciones
        if (!username || !nombre_completo || !email || !password) {
            return res.status(400).json({ error: true, mensaje: 'Faltan campos requeridos' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: true, mensaje: 'La contraseña debe tener al menos 8 caracteres' });
        }

        const rolesValidos = ['admin', 'supervisor', 'usuario'];
        if (!rolesValidos.includes(rol)) {
            return res.status(400).json({ error: true, mensaje: 'Rol no válido' });
        }

        await conn.beginTransaction();

        // Verificar si username ya existe
        const [existingUsername] = await conn.query('SELECT id FROM usuarios WHERE username = ?', [username]);
        if (existingUsername.length > 0) {
            await conn.rollback();
            return res.status(409).json({ error: true, mensaje: 'El nombre de usuario ya está en uso' });
        }

        // Verificar si email ya existe
        const [existingEmail] = await conn.query('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (existingEmail.length > 0) {
            await conn.rollback();
            return res.status(409).json({ error: true, mensaje: 'El correo electrónico ya está registrado' });
        }

        // Hashear contraseña
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insertar usuario
        await conn.query(
            `INSERT INTO usuarios (username, password, nombre_completo, email, rol, activo) 
             VALUES (?, ?, ?, ?, ?, TRUE)`,
            [username, passwordHash, nombre_completo, email, rol]
        );

        await conn.commit();

        res.status(201).json({ error: false, mensaje: 'Usuario creado exitosamente' });
    } catch (error) {
        await conn.rollback();
        console.error('Error al crear usuario:', error);
        res.status(500).json({ error: true, mensaje: 'Error al crear usuario' });
    } finally {
        conn.release();
    }
});

// ============================================
// GET /api/usuarios/:id
// Obtener un usuario por ID
// ============================================
router.get('/:id', verificarToken, async (req, res) => {
    try {
        if (req.usuario.rol !== 'admin' && req.usuario.id !== parseInt(req.params.id)) {
            return res.status(403).json({ error: true, mensaje: 'No tienes permiso para ver este usuario' });
        }

        const [usuarios] = await pool.query(
            `SELECT id, username, nombre_completo, email, rol, activo, fecha_creacion 
             FROM usuarios WHERE id = ?`,
            [req.params.id]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({ error: true, mensaje: 'Usuario no encontrado' });
        }

        res.json({ error: false, usuario: usuarios[0] });
    } catch (error) {
        console.error('Error al obtener usuario:', error);
        res.status(500).json({ error: true, mensaje: 'Error al obtener usuario' });
    }
});

// ============================================
// PUT /api/usuarios/:id
// Actualizar un usuario
// ============================================
router.put('/:id', verificarToken, async (req, res) => {
    try {
        if (req.usuario.rol !== 'admin' && req.usuario.id !== parseInt(req.params.id)) {
            return res.status(403).json({ error: true, mensaje: 'No tienes permiso para editar este usuario' });
        }

        const { nombre_completo, email, rol, activo, password } = req.body;
        const updates = [];
        const params = [];

        if (nombre_completo) { updates.push('nombre_completo = ?'); params.push(nombre_completo); }
        if (email) { updates.push('email = ?'); params.push(email); }

        if (req.usuario.rol === 'admin') {
            if (rol) {
                const rolesValidos = ['admin', 'supervisor', 'usuario'];
                if (!rolesValidos.includes(rol)) {
                    return res.status(400).json({ error: true, mensaje: 'Rol no válido' });
                }
                updates.push('rol = ?'); params.push(rol);
            }
            if (activo !== undefined) { updates.push('activo = ?'); params.push(activo); }
        }

        if (password) {
            if (password.length < 8) {
                return res.status(400).json({ error: true, mensaje: 'La contraseña debe tener al menos 8 caracteres' });
            }
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);
            updates.push('password = ?'); params.push(passwordHash);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: true, mensaje: 'No hay datos para actualizar' });
        }

        const query = 'UPDATE usuarios SET ' + updates.join(', ') + ' WHERE id = ?';
        params.push(req.params.id);

        await pool.query(query, params);

        res.json({ error: false, mensaje: 'Usuario actualizado exitosamente' });
    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        res.status(500).json({ error: true, mensaje: 'Error al actualizar usuario' });
    }
});

// ============================================
// PATCH /api/usuarios/:id/status
// Cambiar estado de un usuario
// ============================================
router.patch('/:id/status', verificarToken, esAdmin, async (req, res) => {
    try {
        const { activo } = req.body;
        if (req.usuario.id === parseInt(req.params.id) && activo === false) {
            return res.status(400).json({ error: true, mensaje: 'No puedes desactivar tu propia cuenta' });
        }

        const [result] = await pool.query('UPDATE usuarios SET activo = ? WHERE id = ?', [activo, req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: true, mensaje: 'Usuario no encontrado' });
        }

        res.json({ error: false, mensaje: `Usuario ${activo ? 'activado' : 'desactivado'} exitosamente` });
    } catch (error) {
        console.error('Error al cambiar estado:', error);
        res.status(500).json({ error: true, mensaje: 'Error al cambiar estado del usuario' });
    }
});

// ============================================
// DELETE /api/usuarios/:id
// Desactivar un usuario
// ============================================
router.delete('/:id', verificarToken, esAdmin, async (req, res) => {
    try {
        if (req.usuario.id === parseInt(req.params.id)) {
            return res.status(400).json({ error: true, mensaje: 'No puedes desactivar tu propia cuenta' });
        }

        await pool.query('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
        res.json({ error: false, mensaje: 'Usuario desactivado exitosamente' });
    } catch (error) {
        console.error('Error al desactivar usuario:', error);
        res.status(500).json({ error: true, mensaje: 'Error al desactivar usuario' });
    }
});

module.exports = router;