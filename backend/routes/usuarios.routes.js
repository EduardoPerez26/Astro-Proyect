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
             FROM usuarios ORDER BY fecha_creacion DESC`
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
// GET /api/usuarios/stats
// ============================================
// Estadísticas de usuarios (solo admin)
router.get('/stats', verificarToken, esAdmin, async (req, res) => {
    try {
        const [stats] = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM usuarios) AS total_usuarios,
                (SELECT COUNT(*) FROM usuarios WHERE activo = TRUE) AS usuarios_activos,
                (SELECT COUNT(*) FROM usuarios WHERE rol = 'admin' AND activo = TRUE) AS admin_count,
                (SELECT MAX(fecha_creacion) FROM usuarios) AS ultimo_registro
        `);

        res.json({
            error: false,
            stats: stats[0]
        });

    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al obtener estadísticas'
        });
    }
});

// ============================================
// POST /api/usuarios
// ============================================
// Crea un nuevo usuario (solo admin)
router.post('/', verificarToken, esAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const { username, nombre_completo, email, password, rol = 'usuario' } = req.body;

        // Validaciones
        if (!username || !nombre_completo || !email || !password) {
            return res.status(400).json({
                error: true,
                mensaje: 'Todos los campos son requeridos'
            });
        }

        // Validar longitud de contraseña
        if (password.length < 8) {
            return res.status(400).json({
                error: true,
                mensaje: 'La contraseña debe tener al menos 8 caracteres'
            });
        }

        // Validar rol válido
        const rolesValidos = ['admin', 'supervisor', 'usuario'];
        if (!rolesValidos.includes(rol)) {
            return res.status(400).json({
                error: true,
                mensaje: 'Rol no válido'
            });
        }

        await conn.beginTransaction();

        // Verificar si el username ya existe
        const [existingUsername] = await conn.query(
            'SELECT id FROM usuarios WHERE username = ?',
            [username]
        );

        if (existingUsername.length > 0) {
            await conn.rollback();
            return res.status(409).json({
                error: true,
                mensaje: 'El nombre de usuario ya está en uso'
            });
        }

        // Verificar si el email ya existe
        const [existingEmail] = await conn.query(
            'SELECT id FROM usuarios WHERE email = ?',
            [email]
        );

        if (existingEmail.length > 0) {
            await conn.rollback();
            return res.status(409).json({
                error: true,
                mensaje: 'El correo electrónico ya está registrado'
            });
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

        res.status(201).json({
            error: false,
            mensaje: 'Usuario creado exitosamente'
        });

    } catch (error) {
        await conn.rollback();
        console.error('Error al crear usuario:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al crear usuario'
        });
    } finally {
        conn.release();
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
// PATCH /api/usuarios/:id/status
// ============================================
// Cambia el estado de un usuario (solo admin)
router.patch('/:id/status', verificarToken, esAdmin, async (req, res) => {
    try {
        const { activo } = req.body;

        // No permitir desactivarse a si mismo
        if (req.usuario.id === parseInt(req.params.id) && activo === false) {
            return res.status(400).json({
                error: true,
                mensaje: 'No puedes desactivar tu propia cuenta'
            });
        }

        const [result] = await pool.query(
            'UPDATE usuarios SET activo = ? WHERE id = ?',
            [activo, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: true,
                mensaje: 'Usuario no encontrado'
            });
        }

        res.json({
            error: false,
            mensaje: `Usuario ${activo ? 'activado' : 'desactivado'} exitosamente`
        });

    } catch (error) {
        console.error('Error al cambiar estado del usuario:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al cambiar estado del usuario'
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
                const rolesValidos = ['admin', 'supervisor', 'usuario'];
                if (!rolesValidos.includes(rol)) {
                    return res.status(400).json({
                        error: true,
                        mensaje: 'Rol no válido'
                    });
                }
                updates.push('rol = ?');
                params.push(rol);
            }
            if (activo !== undefined) {
                updates.push('activo = ?');
                params.push(activo);
            }
        }

        if (password) {
            if (password.length < 8) {
                return res.status(400).json({
                    error: true,
                    mensaje: 'La contraseña debe tener al menos 8 caracteres'
                });
            }
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