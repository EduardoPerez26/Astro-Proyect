// ============================================
// RUTAS DE USUARIOS
// ============================================
// CRUD de usuarios (solo admin puede gestionar)
// ============================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { verificarToken, esAdmin } = require('../middleware/auth.middleware');

// ============================================
// GET /api/usuarios
// ============================================
// Lista todos los usuarios (solo admin)
router.get('/', verificarToken, esAdmin, async (req, res) => {
    try {
        const [usuarios] = await pool.query(
            `SELECT id, username, nombre_completo, email, rol, activo, fecha_creacion 
             FROM usuarios ORDER BY nombre_completo`
        );

        res.json({
            error: false,
            usuarios
        });

    } catch (error) {
        console.error('Error al listar usuarios:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al obtener usuarios'
        });
    }
});

// ============================================
// GET /api/usuarios/:id
// ============================================
// Obtiene un usuario por ID
router.get('/:id', verificarToken, async (req, res) => {
    try {
        // Solo admin puede ver otros usuarios
        if (req.usuario.rol !== 'admin' && req.usuario.id !== parseInt(req.params.id)) {
            return res.status(403).json({
                error: true,
                mensaje: 'No tienes permiso para ver este usuario'
            });
        }

        const [usuarios] = await pool.query(
            `SELECT id, username, nombre_completo, email, rol, activo, fecha_creacion 
             FROM usuarios WHERE id = ?`,
            [req.params.id]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({
                error: true,
                mensaje: 'Usuario no encontrado'
            });
        }

        res.json({
            error: false,
            usuario: usuarios[0]
        });

    } catch (error) {
        console.error('Error al obtener usuario:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al obtener usuario'
        });
    }
});

// ============================================
// PUT /api/usuarios/:id
// ============================================
// Actualiza un usuario
router.put('/:id', verificarToken, async (req, res) => {
    try {
        // Solo admin puede editar otros usuarios
        if (req.usuario.rol !== 'admin' && req.usuario.id !== parseInt(req.params.id)) {
            return res.status(403).json({
                error: true,
                mensaje: 'No tienes permiso para editar este usuario'
            });
        }

        const { nombre_completo, email, rol, activo, password } = req.body;
        
        let query = 'UPDATE usuarios SET ';
        const params = [];
        const updates = [];

        if (nombre_completo) {
            updates.push('nombre_completo = ?');
            params.push(nombre_completo);
        }

        if (email) {
            updates.push('email = ?');
            params.push(email);
        }

        // Solo admin puede cambiar rol y estado
        if (req.usuario.rol === 'admin') {
            if (rol) {
                updates.push('rol = ?');
                params.push(rol);
            }
            if (activo !== undefined) {
                updates.push('activo = ?');
                params.push(activo);
            }
        }

        if (password) {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);
            updates.push('password = ?');
            params.push(passwordHash);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                error: true,
                mensaje: 'No hay datos para actualizar'
            });
        }

        query += updates.join(', ') + ' WHERE id = ?';
        params.push(req.params.id);

        await pool.query(query, params);

        res.json({
            error: false,
            mensaje: 'Usuario actualizado exitosamente'
        });

    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al actualizar usuario'
        });
    }
});

// ============================================
// DELETE /api/usuarios/:id
// ============================================
// Desactiva un usuario (solo admin)
router.delete('/:id', verificarToken, esAdmin, async (req, res) => {
    try {
        // No permitir eliminarse a si mismo
        if (req.usuario.id === parseInt(req.params.id)) {
            return res.status(400).json({
                error: true,
                mensaje: 'No puedes desactivar tu propia cuenta'
            });
        }

        await pool.query(
            'UPDATE usuarios SET activo = FALSE WHERE id = ?',
            [req.params.id]
        );

        res.json({
            error: false,
            mensaje: 'Usuario desactivado exitosamente'
        });

    } catch (error) {
        console.error('Error al desactivar usuario:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al desactivar usuario'
        });
    }
});

module.exports = router;
