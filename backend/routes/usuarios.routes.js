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
            `SELECT id, username, nombre_completo as nombre, email, rol, activo, permisos, fecha_creacion
             FROM usuarios ORDER BY nombre_completo`
        );

        // Parsear permisos - MySQL puede devolver objeto o string dependiendo de la configuracion
        const usuariosFormateados = usuarios.map(u => {
            let permisos = {};
            if (u.permisos) {
                if (typeof u.permisos === 'string') {
                    try { permisos = JSON.parse(u.permisos); } catch { permisos = {}; }
                } else {
                    permisos = u.permisos;
                }
            }
            return { ...u, permisos };
        });

        res.json({
            error: false,
            success: true,
            usuarios: usuariosFormateados
        });

    } catch (error) {
        console.error('Error al listar usuarios:', error);
        res.status(500).json({
            error: true,
            success: false,
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
                success: false,
                mensaje: 'No tienes permiso para ver este usuario'
            });
        }

        const [usuarios] = await pool.query(
            `SELECT
 id,
 username,
 nombre_completo as nombre,
 email,
 rol,
 activo,
 IF(activo=1,'activo','inactivo') as estado,
 permisos,
 fecha_creacion
             FROM usuarios WHERE id = ?`,
            [req.params.id]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({
                error: true,
                success: false,
                mensaje: 'Usuario no encontrado'
            });
        }

        const usuario = usuarios[0];
        // Parsear permisos - MySQL puede devolver objeto o string
        if (usuario.permisos) {
            if (typeof usuario.permisos === 'string') {
                try { usuario.permisos = JSON.parse(usuario.permisos); } catch { usuario.permisos = {}; }
            }
        } else {
            usuario.permisos = {};
        }

        res.json({
            error: false,
            success: true,
            usuario
        });

    } catch (error) {
        console.error('Error al obtener usuario:', error);
        res.status(500).json({
            error: true,
            success: false,
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

        const {
            nombre,
            email,
            rol,
            estado,
            password
        } = req.body;

        let query = 'UPDATE usuarios SET ';
        const params = [];
        const updates = [];
        if (nombre) {
            updates.push('nombre_completo = ?');
            params.push(nombre);
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
            if (estado !== undefined) {
                updates.push('activo = ?');
                params.push(estado === 'activo');
            }
        }

        if (req.body.username) {
            updates.push('username = ?');
            params.push(req.body.username);
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
            success: true,
            error: false,
            message: 'Usuario actualizado exitosamente'
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
            success: true,
            error: false,
            message: 'Usuario eliminado correctamente'
        });

    } catch (error) {
        console.error('Error al desactivar usuario:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al desactivar usuario'
        });
    }
});

// ============================================
// GET /api/usuarios/:id/permisos
// ============================================
// Obtiene los permisos de un usuario
router.get('/:id/permisos', verificarToken, async (req, res) => {
    try {
        // Solo admin puede ver permisos de otros usuarios
        if (req.usuario.rol !== 'admin' && req.usuario.id !== parseInt(req.params.id)) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permiso para ver estos permisos'
            });
        }

        const [rows] = await pool.query(
            'SELECT permisos FROM usuarios WHERE id = ?',
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Parsear permisos (guardados como JSON en la BD)
        let permisos = {};
        try {
            permisos = rows[0].permisos ? JSON.parse(rows[0].permisos) : {};
        } catch {
            permisos = {};
        }

        res.json({
            success: true,
            permisos
        });

    } catch (error) {
        console.error('Error al obtener permisos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener permisos'
        });
    }
});

// ============================================
// PUT /api/usuarios/:id/permisos
// ============================================
// Actualiza los permisos de un usuario (solo admin)
router.put('/:id/permisos', verificarToken, esAdmin, async (req, res) => {
    try {
        const { permisos } = req.body;

        if (!permisos || typeof permisos !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Formato de permisos invalido'
            });
        }

        // Verificar que el usuario existe
        const [usuarios] = await pool.query(
            'SELECT id FROM usuarios WHERE id = ?',
            [req.params.id]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Guardar permisos como JSON
        await pool.query(
            'UPDATE usuarios SET permisos = ? WHERE id = ?',
            [JSON.stringify(permisos), req.params.id]
        );

        res.json({
            success: true,
            message: 'Permisos actualizados correctamente'
        });

    } catch (error) {
        console.error('Error al actualizar permisos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar permisos'
        });
    }
});

// ============================================
// POST /api/usuarios
// ============================================
// Crear nuevo usuario (solo admin)
router.post('/', verificarToken, esAdmin, async (req, res) => {
    try {
        const { nombre, email, username, password, rol, estado } = req.body;

        // Validaciones
        if (!nombre || !email || !username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos'
            });
        }

        // Verificar que el username no exista
        const [existing] = await pool.query(
            'SELECT id FROM usuarios WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'El usuario o email ya existe'
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Permisos por defecto segun rol
        const defaultPermisos = {
            'admin': { tiendas: true, documentos: true, perfil: true, permisos: true, historial: true, usuarios: true, controlRestaurantes: true },
            'supervisor': { tiendas: true, documentos: true, perfil: true, permisos: false, historial: true, usuarios: false, controlRestaurantes: false },
            'usuario': { tiendas: true, documentos: true, perfil: true, permisos: false, historial: false, usuarios: false, controlRestaurantes: false }
        };

        // Insertar usuario
        const [result] = await pool.query(
            `INSERT INTO usuarios (username, password, nombre_completo, email, rol, activo, permisos) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                username,
                passwordHash,
                nombre,
                email,
                rol || 'usuario',
                estado !== 'inactivo',
                JSON.stringify(defaultPermisos[rol] || defaultPermisos['usuario'])
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Usuario creado exitosamente',
            usuario: {
                id: result.insertId,
                nombre,
                email,
                username,
                rol: rol || 'usuario'
            }
        });

    } catch (error) {
        console.error('Error al crear usuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear usuario'
        });
    }
});

module.exports = router;
