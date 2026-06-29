
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
    controlRestaurants: true,
    paginaInicio: 'dashboardAdmin'
};

function normalizarPermissionsUser(permisos, rol) {
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
        controlRestaurants: false
    };
    const disponibles = VENTANAS_OPERATIVAS.filter(codigo => normalizados[codigo]);

    normalizados.paginaInicio = disponibles.includes(permisos.paginaInicio)
        ? permisos.paginaInicio
        : disponibles[0] || null;

    return normalizados;
}

function esErrorEsquemaDepartments(error) {
    const detalle = [
        error.sqlMessage,
        error.message,
        error.sql
    ].filter(Boolean).join(' ');

    return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)
        && /departamento|departamentos/i.test(detalle);
}

function formatearUsers(usuarios) {
    return usuarios.map(u => {
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
}

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

        res.json({
            error: false,
            success: true,
            usuarios: formatearUsers(usuarios)
        });

    } catch (error) {
        console.error('Error listing users:', error);

        if (esErrorEsquemaDepartments(error)) {
            const [usuarios] = await pool.query(
                `SELECT u.id,
                        u.username,
                        u.nombre_completo AS nombre,
                        u.email,
                        u.rol,
                        u.activo,
                        IF(u.activo = 1, 'activo', 'inactivo') AS estado,
                        u.permisos,
                        NULL AS departamento_id,
                        u.fecha_creacion,
                        NULL AS departamento_codigo,
                        NULL AS departamento_nombre,
                        NULL AS departamento_activo
                 FROM usuarios u
                 ORDER BY u.nombre_completo`
            );

            return res.json({
                error: false,
                success: true,
                modo_compatibilidad: true,
                usuarios: formatearUsers(usuarios)
            });
        }

        res.status(500).json({
            error: true,
            success: false,
            mensaje: 'Users could not be loaded',
            code: error.code
        });
    }
});

router.get('/:id', verificarToken, async (req, res) => {
    try {
        // Only admins can view other users.
        if (req.usuario.rol !== 'admin' && req.usuario.id !== parseInt(req.params.id)) {
            return res.status(403).json({
                error: true,
                success: false,
                mensaje: 'You do not have permission to view this user'
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
                mensaje: 'User not found'
            });
        }

        const usuario = usuarios[0];
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
        console.error('User could not be loaded:', error);
        res.status(500).json({
            error: true,
            success: false,
            mensaje: 'User could not be loaded'
        });
    }
});

router.put('/:id', verificarToken, async (req, res) => {
    try {
        // Only admins can edit other users.
        if (req.usuario.rol !== 'admin' && req.usuario.id !== parseInt(req.params.id)) {
            return res.status(403).json({
                error: true,
                mensaje: 'You do not have permission to edit this user'
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

        // Only admins can change role and status.
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
                            message: 'The selected department does not exist or is inactive'
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
                mensaje: 'There is no data to update'
            });
        }

        query += updates.join(', ') + ' WHERE id = ?';
        params.push(req.params.id);

        await pool.query(query, params);

        res.json({
            success: true,
            error: false,
            message: 'User updated successfully'
        });

    } catch (error) {
        console.error('User could not be updated:', error);
        res.status(500).json({
            error: true,
            mensaje: 'User could not be updated'
        });
    }
});

router.delete('/:id', verificarToken, esAdmin, async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const usuarioId = parseInt(req.params.id);

        if (req.usuario.id === usuarioId) {
            return res.status(400).json({
                error: true,
                message: 'You cannot delete your own account'
            });
        }

        const [usuarios] = await connection.query(
            'SELECT id, nombre_completo FROM usuarios WHERE id = ? LIMIT 1',
            [usuarioId]
        );

        if (!usuarios.length) {
            return res.status(404).json({
                error: true,
                message: 'User not found'
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
                if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
            }
        }

        await connection.query(
            'DELETE FROM sesiones WHERE usuario_id = ?',
            [usuarioId]
        );

        const [result] = await connection.query(
            'DELETE FROM usuarios WHERE id = ?',
            [usuarioId]
        );

        if (result.affectedRows === 0) {
            throw new Error('The user could not be deleted');
        }

        await connection.commit();

        res.json({
            success: true,
            error: false,
            message: 'User permanently deleted',
            registrosReasignados
        });

    } catch (error) {
        await connection.rollback();
        console.error('User could not be deleted:', error);

        res.status(500).json({
            error: true,
            success: false,
            message: error.code === 'ER_ROW_IS_REFERENCED_2'
                ? 'The record could not be deleted because there are related records not covered by this cleanup.'
                : error.message
        });
    } finally {
        connection.release();
    }
});

router.get('/:id/permisos', verificarToken, async (req, res) => {
    try {
        // Only admins can view permissions for other users.
        if (req.usuario.rol !== 'admin' && req.usuario.id !== parseInt(req.params.id)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to view these permissions'
            });
        }

        const [rows] = await pool.query(
            'SELECT permisos FROM usuarios WHERE id = ?',
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

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
        console.error('Permissions could not be loaded:', error);
        res.status(500).json({
            success: false,
            message: 'Permissions could not be loaded'
        });
    }
});

router.put('/:id/permisos', verificarToken, esAdmin, async (req, res) => {
    try {
        const { permisos } = req.body;

        if (!permisos || typeof permisos !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Invalid permissions format'
            });
        }

        // Verify that the user exists.
        const [usuarios] = await pool.query(
            'SELECT id, rol FROM usuarios WHERE id = ?',
            [req.params.id]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const permisosNormalizados = normalizarPermissionsUser(
            permisos,
            usuarios[0].rol
        );

        if (
            usuarios[0].rol !== 'admin' &&
            !permisosNormalizados.paginaInicio
        ) {
            return res.status(400).json({
                success: false,
                message: 'The user must have at least one enabled screen'
            });
        }

        await pool.query(
            'UPDATE usuarios SET permisos = ? WHERE id = ?',
            [JSON.stringify(permisosNormalizados), req.params.id]
        );

        res.json({
            success: true,
            message: 'Permissions and start screen updated successfully',
            permisos: permisosNormalizados
        });

    } catch (error) {
        console.error('Permissions could not be updated:', error);
        res.status(500).json({
            success: false,
            message: 'Permissions could not be updated'
        });
    }
});

router.post('/', verificarToken, esAdmin, async (req, res) => {
    try {
        const { nombre, email, username, password, rol, estado, departamento_id } = req.body;

        // Validations.
        if (!nombre || !email || !username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Required fields are missing'
            });
        }

        // Verify that the username does not already exist.
        const [existing] = await pool.query(
            'SELECT id FROM usuarios WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'The username or email already exists'
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
                    message: 'The selected department does not exist or is inactive'
                });
            }
        }

        // Permissions por defecto segun rol
        const defaultPermissions = {
            'admin': { ...PERMISOS_ADMIN },
            'supervisor': { tiendas: true, documentos: true, perfil: true, permisos: false, historial: true, usuarios: false, controlRestaurants: false, paginaInicio: 'tiendas' },
            'usuario': { tiendas: true, documentos: true, perfil: true, permisos: false, historial: false, usuarios: false, controlRestaurants: false, paginaInicio: 'tiendas' }
        };

        // Insert user.
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
                JSON.stringify(defaultPermissions[rol] || defaultPermissions['usuario'])
            ]
        );

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            usuario: {
                id: result.insertId,
                nombre,
                email,
                username,
                rol: rol || 'usuario'
            }
        });

    } catch (error) {
        console.error('User could not be created:', error);
        res.status(500).json({
            success: false,
            message: 'User could not be created'
        });
    }
});

module.exports = router;
