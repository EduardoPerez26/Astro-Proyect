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

module.exports = router;
