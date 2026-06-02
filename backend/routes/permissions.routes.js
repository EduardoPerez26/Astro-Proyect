// Rutas para administrar permisos y asignarlos a roles (solo admin)

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verificarToken, esAdmin } = require('../middleware/auth.middleware');

// GET /api/permissions - listar todos los permisos (con opción de filtrar por categoría)
router.get('/', verificarToken, esAdmin, async (req, res) => {
    try {
        const { categoria, activo } = req.query;
        
        // Verificar si las tablas existen (para compatibilidad)
        try {
            await pool.query('SELECT 1 FROM categorias_permisos LIMIT 1');
        } catch (e) {
            // Si no existe la tabla categorias_permisos, usar query simplificada
            let query = 'SELECT id, nombre, descripcion, fecha_creacion FROM permisos ORDER BY nombre';
            const [perms] = await pool.query(query);
            return res.json({ error: false, permisos: perms });
        }
        
        let query = `
            SELECT p.id, p.nombre, p.descripcion, p.icono, p.nivel, p.activo, p.fecha_creacion,
                   c.id as categoria_id, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color
            FROM permisos p
            LEFT JOIN categorias_permisos c ON p.categoria_id = c.id
            WHERE 1=1
        `;
        const params = [];

        if (categoria) {
            query += ' AND (c.nombre = ? OR c.id = ?)';
            params.push(categoria, categoria);
        }

        if (activo !== undefined) {
            query += ' AND p.activo = ?';
            params.push(activo === 'true' ? 1 : 0);
        }

        query += ' ORDER BY c.orden, p.nombre';

        const [perms] = await pool.query(query, params);
        res.json({ error: false, permisos: perms });
    } catch (error) {
        console.error('Error al listar permisos:', error);
        res.status(500).json({ error: true, mensaje: 'Error al listar permisos: ' + error.message });
    }
});

// GET /api/permissions/categories - listar categorías de permisos
router.get('/categories', verificarToken, esAdmin, async (req, res) => {
    try {
        const [categorias] = await pool.query(
            'SELECT * FROM categorias_permisos WHERE activo = TRUE ORDER BY orden, nombre'
        );
        res.json({ error: false, categorias });
    } catch (error) {
        // Si no existe la tabla, devolver lista vacía
        if (error.code === 'ER_NO_SUCH_TABLE') {
            return res.json({ error: false, categorias: [] });
        }
        console.error('Error al listar categorías:', error);
        res.status(500).json({ error: true, mensaje: 'Error al listar categorías: ' + error.message });
    }
});

// POST /api/permissions - crear un permiso
router.post('/', verificarToken, esAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const { nombre, descripcion, categoria_id, icono = 'fa-key', nivel = 1 } = req.body;
        if (!nombre) return res.status(400).json({ error: true, mensaje: 'Nombre de permiso requerido' });

        await conn.beginTransaction();

        // Verificar si ya existe
        const [existing] = await conn.query('SELECT id FROM permisos WHERE nombre = ?', [nombre]);
        const isUpdate = existing.length > 0;

        if (isUpdate) {
            await conn.query(
                'UPDATE permisos SET descripcion = ?, categoria_id = ?, icono = ?, nivel = ? WHERE nombre = ?',
                [descripcion, categoria_id || null, icono, nivel, nombre]
            );
        } else {
            await conn.query(
                'INSERT INTO permisos (nombre, descripcion, categoria_id, icono, nivel) VALUES (?, ?, ?, ?, ?)',
                [nombre, descripcion, categoria_id || null, icono, nivel]
            );
        }

        // Registrar en historial
        const usuarioId = req.usuario.id;
        await conn.query(
            `INSERT INTO historial_permisos (usuario_id, accion, tipo_objeto, objeto_nombre, detalles_nuevos) 
             VALUES (?, ?, ?, ?, ?)`,
            [usuarioId, isUpdate ? 'modificar' : 'crear', 'permiso', nombre, JSON.stringify({
                descripcion,
                categoria_id,
                icono,
                nivel
            })]
        );

        await conn.commit();
        res.status(201).json({ error: false, mensaje: isUpdate ? 'Permiso actualizado' : 'Permiso creado' });
    } catch (error) {
        await conn.rollback();
        console.error('Error al crear permiso:', error);
        res.status(500).json({ error: true, mensaje: 'Error al crear permiso' });
    } finally {
        conn.release();
    }
});

// DELETE /api/permissions/:nombre - eliminar un permiso
router.delete('/:nombre', verificarToken, esAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const { nombre } = req.params;
        
        await conn.beginTransaction();

        // Registrar en historial
        const usuarioId = req.usuario.id;
        await conn.query(
            `INSERT INTO historial_permisos (usuario_id, accion, tipo_objeto, objeto_nombre) 
             VALUES (?, 'eliminar', 'permiso', ?)`,
            [usuarioId, nombre]
        );

        await conn.query('DELETE FROM permisos WHERE nombre = ?', [nombre]);

        await conn.commit();
        res.json({ error: false, mensaje: 'Permiso eliminado' });
    } catch (error) {
        await conn.rollback();
        console.error('Error al eliminar permiso:', error);
        res.status(500).json({ error: true, mensaje: 'Error al eliminar permiso' });
    } finally {
        conn.release();
    }
});

// GET /api/permissions/roles/:rol - listar permisos de un rol
router.get('/roles/:rol', verificarToken, esAdmin, async (req, res) => {
    try {
        const rol = req.params.rol;
        const [rows] = await pool.query(
            `SELECT rp.permiso_nombre, p.descripcion, p.icono, p.nivel,
                    c.nombre as categoria_nombre, c.color as categoria_color
             FROM roles_permisos rp
             JOIN permisos p ON rp.permiso_nombre = p.nombre
             LEFT JOIN categorias_permisos c ON p.categoria_id = c.id
             WHERE rp.rol = ?
             ORDER BY c.orden, p.nombre`,
            [rol]
        );
        res.json({ error: false, rol, permisos: rows });
    } catch (error) {
        console.error('Error al obtener permisos de rol:', error);
        res.status(500).json({ error: true, mensaje: 'Error al obtener permisos' });
    }
});

// POST /api/permissions/roles/:rol - asignar conjunto de permisos a un rol (reemplaza)
router.post('/roles/:rol', verificarToken, esAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const rol = req.params.rol;
        const permisos = Array.isArray(req.body.permisos) ? req.body.permisos : [];

        await conn.beginTransaction();

        // Obtener permisos actuales para el historial
        const [currentPerms] = await conn.query(
            'SELECT permiso_nombre FROM roles_permisos WHERE rol = ?',
            [rol]
        );

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

        // Registrar en historial
        const usuarioId = req.usuario.id;
        await conn.query(
            `INSERT INTO historial_permisos (usuario_id, accion, tipo_objeto, objeto_nombre, detalles_anteriores, detalles_nuevos) 
             VALUES (?, 'asignar', 'rol_permiso', ?, ?, ?)`,
            [usuarioId, rol, JSON.stringify({ permisos: currentPerms.map(r => r.permiso_nombre) }), JSON.stringify({ permisos })]
        );

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

// GET /api/permissions/stats - estadísticas de permisos
router.get('/stats/summary', verificarToken, esAdmin, async (req, res) => {
    try {
        // Verificar si las tablas nuevas existen
        try {
            await pool.query('SELECT 1 FROM categorias_permisos LIMIT 1');
        } catch (e) {
            // Si no existen las tablas nuevas, usar estadísticas básicas
            const [stats] = await pool.query(`
                SELECT 
                    (SELECT COUNT(*) FROM permisos WHERE activo = TRUE) as total_permisos,
                    0 as total_categorias,
                    (SELECT COUNT(DISTINCT rol) FROM roles_permisos) as total_roles,
                    (SELECT COUNT(*) FROM roles_permisos) as total_asignaciones
            `);
            return res.json({ error: false, stats: stats[0] });
        }
        
        const [stats] = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM permisos WHERE activo = TRUE) as total_permisos,
                (SELECT COUNT(*) FROM categorias_permisos WHERE activo = TRUE) as total_categorias,
                (SELECT COUNT(DISTINCT rol) FROM roles_permisos) as total_roles,
                (SELECT COUNT(*) FROM roles_permisos) as total_asignaciones
        `);
        res.json({ error: false, stats: stats[0] });
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({ error: true, mensaje: 'Error al obtener estadísticas: ' + error.message });
    }
});

// GET /api/permissions/history - historial de cambios
router.get('/history', verificarToken, esAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        
        // Verificar si la tabla historial_permisos existe
        try {
            await pool.query('SELECT 1 FROM historial_permisos LIMIT 1');
        } catch (e) {
            // Si no existe, devolver lista vacía
            return res.json({ error: false, history: [] });
        }
        
        const [history] = await pool.query(`
            SELECT hp.*, u.username, u.nombre_completo
            FROM historial_permisos hp
            JOIN usuarios u ON hp.usuario_id = u.id
            ORDER BY hp.fecha_accion DESC
            LIMIT ?
        `, [limit]);
        res.json({ error: false, history });
    } catch (error) {
        console.error('Error al obtener historial:', error);
        res.status(500).json({ error: true, mensaje: 'Error al obtener historial: ' + error.message });
    }
});

// GET /api/permissions/roles - listar todos los roles disponibles
router.get('/roles/list', verificarToken, esAdmin, async (req, res) => {
    try {
        // Devolver roles por defecto si hay error
        const [roles] = await pool.query(`
            SELECT DISTINCT rol FROM roles_permisos
            UNION
            SELECT 'admin' as rol
            UNION  
            SELECT 'supervisor' as rol
            UNION
            SELECT 'usuario' as rol
        `);
        res.json({ error: false, roles: roles.map(r => r.rol) });
    } catch (error) {
        console.error('Error al listar roles:', error);
        // Devolver roles por defecto en caso de error
        res.json({ error: false, roles: ['admin', 'supervisor', 'usuario'] });
    }
});

module.exports = router;