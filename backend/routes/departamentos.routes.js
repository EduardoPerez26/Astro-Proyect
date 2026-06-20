const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verificarToken, esAdmin } = require('../middleware/auth.middleware');

function normalizarCodigo(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

function responderErrorInstalacion(error, res) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) {
        res.status(503).json({
            success: false,
            code: 'DEPARTAMENTOS_NO_INSTALADOS',
            message: 'Ejecuta primero el archivo SQL de departamentos en la base de datos.'
        });
        return true;
    }

    return false;
}

router.get('/', verificarToken, esAdmin, async (req, res) => {
    try {
        const [departamentos] = await pool.query(
            `SELECT d.id,
                    d.codigo,
                    d.nombre,
                    d.descripcion,
                    d.activo,
                    d.fecha_creacion,
                    d.fecha_actualizacion,
                    COUNT(u.id) AS total_usuarios
             FROM departamentos d
             LEFT JOIN usuarios u ON u.departamento_id = d.id
             GROUP BY d.id
             ORDER BY d.activo DESC, d.nombre ASC`
        );

        res.json({
            success: true,
            departamentos: departamentos.map(departamento => ({
                ...departamento,
                total_usuarios: Number(departamento.total_usuarios || 0)
            }))
        });
    } catch (error) {
        console.error('Error al listar departamentos:', error);
        if (responderErrorInstalacion(error, res)) return;
        res.status(500).json({ success: false, message: 'Error al obtener departamentos' });
    }
});

router.post('/', verificarToken, esAdmin, async (req, res) => {
    try {
        const { nombre, codigo, descripcion, activo } = req.body;
        const codigoNormalizado = normalizarCodigo(codigo || nombre);

        if (!nombre?.trim() || !codigoNormalizado) {
            return res.status(400).json({
                success: false,
                message: 'Nombre y codigo del departamento son requeridos'
            });
        }

        const [result] = await pool.query(
            `INSERT INTO departamentos
             (codigo, nombre, descripcion, modulos, pagina_inicio, activo)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                codigoNormalizado,
                nombre.trim(),
                descripcion?.trim() || null,
                JSON.stringify({}),
                'tiendas',
                activo !== false
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Departamento creado correctamente',
            id: result.insertId
        });
    } catch (error) {
        console.error('Error al crear departamento:', error);
        if (responderErrorInstalacion(error, res)) return;
        res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({
            success: false,
            message: error.code === 'ER_DUP_ENTRY'
                ? 'Ya existe un departamento con ese codigo o nombre'
                : 'Error al crear departamento'
        });
    }
});

router.put('/:id', verificarToken, esAdmin, async (req, res) => {
    try {
        const { nombre, codigo, descripcion, activo } = req.body;
        const codigoNormalizado = normalizarCodigo(codigo || nombre);

        if (!nombre?.trim() || !codigoNormalizado) {
            return res.status(400).json({
                success: false,
                message: 'Nombre y codigo del departamento son requeridos'
            });
        }

        const [result] = await pool.query(
            `UPDATE departamentos
             SET codigo = ?,
                 nombre = ?,
                 descripcion = ?,
                 activo = ?
             WHERE id = ?`,
            [
                codigoNormalizado,
                nombre.trim(),
                descripcion?.trim() || null,
                activo !== false,
                req.params.id
            ]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'Departamento no encontrado' });
        }

        res.json({ success: true, message: 'Departamento actualizado correctamente' });
    } catch (error) {
        console.error('Error al actualizar departamento:', error);
        if (responderErrorInstalacion(error, res)) return;
        res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({
            success: false,
            message: error.code === 'ER_DUP_ENTRY'
                ? 'Ya existe un departamento con ese codigo o nombre'
                : 'Error al actualizar departamento'
        });
    }
});

router.put('/:id/estado', verificarToken, esAdmin, async (req, res) => {
    try {
        const { activo } = req.body;

        if (typeof activo !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'El estado del departamento no es valido'
            });
        }

        const [result] = await pool.query(
            'UPDATE departamentos SET activo = ? WHERE id = ?',
            [activo, req.params.id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: 'Departamento no encontrado'
            });
        }

        let sesionesCerradas = 0;
        if (!activo) {
            const [sesiones] = await pool.query(
                `UPDATE sesiones s
                 JOIN usuarios u ON u.id = s.usuario_id
                 SET s.activa = FALSE
                 WHERE u.departamento_id = ? AND s.activa = TRUE`,
                [req.params.id]
            );
            sesionesCerradas = sesiones.affectedRows || 0;
        }

        res.json({
            success: true,
            message: activo
                ? 'Departamento activado correctamente'
                : 'Departamento desactivado correctamente',
            sesionesCerradas
        });
    } catch (error) {
        console.error('Error al cambiar estado del departamento:', error);
        if (responderErrorInstalacion(error, res)) return;
        res.status(500).json({
            success: false,
            message: 'Error al cambiar el estado del departamento'
        });
    }
});

async function eliminarDepartamento(req, res) {
    let connection;

    try {
        connection = await pool.getConnection();
        const [departamentos] = await connection.query(
            'SELECT id, nombre FROM departamentos WHERE id = ? LIMIT 1',
            [req.params.id]
        );

        if (!departamentos.length) {
            return res.status(404).json({
                success: false,
                message: 'Departamento no encontrado'
            });
        }

        await connection.beginTransaction();

        const [usuarios] = await connection.query(
            'SELECT COUNT(*) AS total FROM usuarios WHERE departamento_id = ?',
            [req.params.id]
        );
        const usuariosLiberados = Number(usuarios[0]?.total || 0);

        await connection.query(
            `UPDATE sesiones s
             JOIN usuarios u ON u.id = s.usuario_id
             SET s.activa = FALSE
             WHERE u.departamento_id = ? AND s.activa = TRUE`,
            [req.params.id]
        );
        await connection.query(
            'UPDATE usuarios SET departamento_id = NULL WHERE departamento_id = ?',
            [req.params.id]
        );
        const [result] = await connection.query(
            'DELETE FROM departamentos WHERE id = ?',
            [req.params.id]
        );

        if (!result.affectedRows) {
            throw new Error('El departamento no pudo eliminarse');
        }

        await connection.commit();
        res.json({
            success: true,
            message: 'Departamento eliminado definitivamente',
            usuariosLiberados
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error al eliminar departamento:', error);
        if (responderErrorInstalacion(error, res)) return;
        res.status(500).json({
            success: false,
            message: error.message || 'Error al eliminar departamento'
        });
    } finally {
        if (connection) connection.release();
    }
}

router.delete('/:id', verificarToken, esAdmin, eliminarDepartamento);
router.post('/:id/eliminar', verificarToken, esAdmin, eliminarDepartamento);

module.exports = router;
