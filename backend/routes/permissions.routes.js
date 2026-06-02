// Rutas para administrar permisos y asignarlos a roles (solo admin)

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verificarToken, esAdmin } = require('../middleware/auth.middleware');

// GET /api/permissions - listar todos los permisos
router.get('/', verificarToken, esAdmin, async (req, res) => {
    try {
        const [perms] = await pool.query('SELECT nombre, descripcion, fecha_creacion FROM permisos ORDER BY nombre');
        res.json({ error: false, permisos: perms });
    } catch (error) {
        console.error('Error al listar permisos:', error);
        res.status(500).json({ error: true, mensaje: 'Error al listar permisos' });
    }
});

// POST /api/permissions - crear un permiso
// body: { nombre, descripcion }
router.post('/', verificarToken, esAdmin, async (req, res) => {
    try {
        const { nombre, descripcion } = req.body;
        if (!nombre) return res.status(400).json({ error: true, mensaje: 'Nombre de permiso requerido' });

        await pool.query('INSERT INTO permisos (nombre, descripcion) VALUES (?, ?) ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion)', [nombre, descripcion]);

        res.status(201).json({ error: false, mensaje: 'Permiso creado/actualizado' });
    } catch (error) {
        console.error('Error al crear permiso:', error);
        res.status(500).json({ error: true, mensaje: 'Error al crear permiso' });
    }
});

// GET /api/permissions/roles/:rol - listar permisos de un rol
router.get('/roles/:rol', verificarToken, esAdmin, async (req, res) => {
    try {
        const rol = req.params.rol;
        const [rows] = await pool.query(
            'SELECT permiso_nombre FROM roles_permisos WHERE rol = ? ORDER BY permiso_nombre',
            [rol]
        );
        const permisos = rows.map(r => r.permiso_nombre);
        res.json({ error: false, rol, permisos });
    } catch (error) {
        console.error('Error al obtener permisos de rol:', error);
        res.status(500).json({ error: true, mensaje: 'Error al obtener permisos' });
    }
});

// POST /api/permissions/roles/:rol - asignar conjunto de permisos a un rol (reemplaza)
// body: { permisos: ['perm1','perm2'] }
router.post('/roles/:rol', verificarToken, esAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const rol = req.params.rol;
        const permisos = Array.isArray(req.body.permisos) ? req.body.permisos : [];

        await conn.beginTransaction();

        // Borrar permisos existentes del rol
        await conn.query('DELETE FROM roles_permisos WHERE rol = ?', [rol]);

        if (permisos.length > 0) {
            // Validar que los permisos existan en la tabla permisos
            const [existing] = await conn.query('SELECT nombre FROM permisos WHERE nombre IN (?)', [permisos]);
            const existentes = new Set(existing.map(r => r.nombre));

            const toInsert = permisos.filter(p => existentes.has(p));

            if (toInsert.length > 0) {
                const values = toInsert.map(p => [rol, p]);
                await conn.query('INSERT INTO roles_permisos (rol, permiso_nombre) VALUES ?', [values]);
            }
        }

        await conn.commit();
        res.json({ error: false, mensaje: 'Permisos del rol actualizados' });
    } catch (error) {
        await conn.rollback();
        console.error('Error al asignar permisos a rol:', error);
        res.status(500).json({ error: true, mensaje: 'Error al asignar permisos' });
    } finally {
        conn.release();
    }
});

module.exports = router;
