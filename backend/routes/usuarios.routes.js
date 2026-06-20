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

const VENTANAS_OPERATIVAS = ['tiendas', 'documentos', 'historial'];
const VENTANAS_ADMIN = ['dashboardAdmin', ...VENTANAS_OPERATIVAS];
const PERMISOS_ADMIN = {
    dashboardAdmin: true,
    tiendas: true,
    documentos: true,
    perfil: true,
    permisos: true,
    historial: true,
    usuarios: true,
    controlRestaurantes: true,
    paginaInicio: 'dashboardAdmin'
};

function normalizarPermisosUsuario(permisos, rol) {
    if (rol === 'admin') {
        return {
            ...PERMISOS_ADMIN,
            paginaInicio: VENTANAS_ADMIN.includes(permisos.paginaInicio)
                ? permisos.paginaInicio
                : 'dashboardAdmin'
        };
    }

    const normalizados = {
        tiendas: permisos.tiendas === true,
        documentos: permisos.documentos === true,
        historial: permisos.historial === true,
        perfil: true,
        permisos: false,
        usuarios: false,
        controlRestaurantes: false
    };
    const disponibles = VENTANAS_OPERATIVAS.filter(codigo => normalizados[codigo]);

    normalizados.paginaInicio = disponibles.includes(permisos.paginaInicio)
        ? permisos.paginaInicio
        : disponibles[0] || null;

    return normalizados;
}

// ============================================
// GET /api/usuarios
// ============================================
// Lista todos los usuarios (solo admin)
router.get('/', verificarToken, esAdmin, async (req, res) => {
    try {
        const [usuarios] = await pool.query(
            `SELECT u.id,
                    u.username,
                    u.nombre_completo AS nombre,
                    u.email,
                    u.rol,
                    u.activo,
                    IF(u.activo = 1, 'activo', 'inactivo') AS estado,
                    u.permisos,
                    u.departamento_id,
                    u.fecha_creacion,
                    d.codigo AS departamento_codigo,
                    d.nombre AS departamento_nombre,
                    d.activo AS departamento_activo
             FROM usuarios u
             LEFT JOIN departamentos d ON d.id = u.departamento_id
             ORDER BY u.nombre_completo`
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
            mensaje: ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)
                ? 'Ejecuta primero la migracion SQL de departamentos'
                : 'Error al obtener usuarios',
            code: error.code
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
 u.id,
 u.username,
 u.nombre_completo as nombre,
 u.email,
 u.rol,
 u.activo,
 IF(u.activo=1,'activo','inactivo') as estado,
 u.permisos,
 u.departamento_id,
 u.fecha_creacion,
 d.codigo AS departamento_codigo,
 d.nombre AS departamento_nombre,
 d.activo AS departamento_activo
             FROM usuarios u
             LEFT JOIN departamentos d ON d.id = u.departamento_id
             WHERE u.id = ?`,
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
            password,
            departamento_id
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
            if (departamento_id !== undefined) {
                const departamentoId = Number(departamento_id) || null;

                if (departamentoId) {
                    const [departamentos] = await pool.query(
                        'SELECT id FROM departamentos WHERE id = ? AND activo = TRUE LIMIT 1',
                        [departamentoId]
                    );

                    if (!departamentos.length) {
                        return res.status(400).json({
                            error: true,
                            message: 'El departamento seleccionado no existe o esta inactivo'
                        });
                    }
                }

                updates.push('departamento_id = ?');
                params.push(departamentoId);
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
// Elimina fisicamente un usuario (solo admin).
// Los registros contables se reasignan al administrador que ejecuta la accion
// para conservar la trazabilidad y respetar las llaves foraneas RESTRICT.
router.delete('/:id', verificarToken, esAdmin, async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const usuarioId = parseInt(req.params.id);

        if (req.usuario.id === usuarioId) {
            return res.status(400).json({
                error: true,
                message: 'No puedes eliminar tu propia cuenta'
            });
        }

        const [usuarios] = await connection.query(
            'SELECT id, nombre_completo FROM usuarios WHERE id = ? LIMIT 1',
            [usuarioId]
        );

        if (!usuarios.length) {
            return res.status(404).json({
                error: true,
                message: 'Usuario no encontrado'
            });
        }

        await connection.beginTransaction();

        const tablasConHistorial = [
            'archivos_excel',
            'historial_validaciones',
            'conciliaciones',
            'valores_esperados'
        ];
        let registrosReasignados = 0;

        for (const tabla of tablasConHistorial) {
            try {
                const [resultado] = await connection.query(
                    `UPDATE \`${tabla}\` SET usuario_id = ? WHERE usuario_id = ?`,
                    [req.usuario.id, usuarioId]
                );
                registrosReasignados += resultado.affectedRows || 0;
            } catch (error) {
                // Algunas instalaciones no tienen todos los modulos creados.
                if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
            }
        }

        // Las sesiones no deben transferirse a otro usuario.
        await connection.query(
            'DELETE FROM sesiones WHERE usuario_id = ?',
            [usuarioId]
        );

        const [result] = await connection.query(
            'DELETE FROM usuarios WHERE id = ?',
            [usuarioId]
        );

        if (result.affectedRows === 0) {
            throw new Error('El usuario no pudo eliminarse');
        }

        await connection.commit();

        res.json({
            success: true,
            error: false,
            message: 'Usuario eliminado definitivamente',
            registrosReasignados
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error al eliminar usuario:', error);

        res.status(500).json({
            error: true,
            success: false,
            message: error.code === 'ER_ROW_IS_REFERENCED_2'
                ? 'No se pudo eliminar porque existen registros relacionados no contemplados.'
                : error.message
        });
    } finally {
        connection.release();
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
            permisos = typeof rows[0].permisos === 'string'
                ? JSON.parse(rows[0].permisos || '{}')
                : rows[0].permisos || {};
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
            'SELECT id, rol FROM usuarios WHERE id = ?',
            [req.params.id]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        const permisosNormalizados = normalizarPermisosUsuario(
            permisos,
            usuarios[0].rol
        );

        if (
            usuarios[0].rol !== 'admin' &&
            !permisosNormalizados.paginaInicio
        ) {
            return res.status(400).json({
                success: false,
                message: 'El usuario debe tener al menos una ventana habilitada'
            });
        }

        // Este es el unico punto donde se asignan ventanas e inicio.
        await pool.query(
            'UPDATE usuarios SET permisos = ? WHERE id = ?',
            [JSON.stringify(permisosNormalizados), req.params.id]
        );

        res.json({
            success: true,
            message: 'Permisos y ventana inicial actualizados correctamente',
            permisos: permisosNormalizados
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
        const { nombre, email, username, password, rol, estado, departamento_id } = req.body;

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
        const departamentoId = Number(departamento_id) || null;

        if (departamentoId) {
            const [departamentos] = await pool.query(
                'SELECT id FROM departamentos WHERE id = ? AND activo = TRUE LIMIT 1',
                [departamentoId]
            );

            if (!departamentos.length) {
                return res.status(400).json({
                    success: false,
                    message: 'El departamento seleccionado no existe o esta inactivo'
                });
            }
        }

        // Permisos por defecto segun rol
        const defaultPermisos = {
            'admin': { ...PERMISOS_ADMIN },
            'supervisor': { tiendas: true, documentos: true, perfil: true, permisos: false, historial: true, usuarios: false, controlRestaurantes: false, paginaInicio: 'tiendas' },
            'usuario': { tiendas: true, documentos: true, perfil: true, permisos: false, historial: false, usuarios: false, controlRestaurantes: false, paginaInicio: 'tiendas' }
        };

        // Insertar usuario
        const [result] = await pool.query(
            `INSERT INTO usuarios
             (username, password, nombre_completo, email, rol, departamento_id, activo, permisos)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                username,
                passwordHash,
                nombre,
                email,
                rol || 'usuario',
                departamentoId,
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
