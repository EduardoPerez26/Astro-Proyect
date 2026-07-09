

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verificarToken, esAdmin, checkPermission } = require('../middleware/auth.middleware');


router.get('/', verificarToken, checkPermission('view_restaurantes'), async (req, res) => {
    try {
        const [restaurantes] = await pool.query(
            'SELECT * FROM restaurantes WHERE activo = TRUE ORDER BY nombre'
        );

        res.json({
            error: false,
            restaurantes
        });

    } catch (error) {
        console.error('Error listing restaurants:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Restaurants could not be loaded'
        });
    }
});

router.get('/:id', verificarToken, checkPermission('view_restaurantes'), async (req, res) => {
    try {
        const [restaurantes] = await pool.query(
            'SELECT * FROM restaurantes WHERE id = ?',
            [req.params.id]
        );

        if (restaurantes.length === 0) {
            return res.status(404).json({
                error: true,
                mensaje: 'Restaurant not found'
            });
        }

        res.json({
            error: false,
            restaurante: restaurantes[0]
        });

    } catch (error) {
        console.error('Restaurant could not be loaded:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Restaurant could not be loaded'
        });
    }
});

router.post('/', verificarToken, esAdmin, checkPermission('create_restaurantes'), async (req, res) => {
    try {
        const { codigo, nombre, descripcion, icono, color_clase } = req.body;

        if (!codigo || !nombre) {
            return res.status(400).json({
                error: true,
                mensaje: 'Code and name are required'
            });
        }

        const [resultado] = await pool.query(
            `INSERT INTO restaurantes (codigo, nombre, descripcion, icono, color_clase)
             VALUES (?, ?, ?, ?, ?)`,
            [codigo, nombre, descripcion, icono || 'fa-store', color_clase || 'primary']
        );

        res.status(201).json({
            error: false,
            mensaje: 'Restaurant created successfully',
            restauranteId: resultado.insertId
        });

    } catch (error) {
        console.error('Restaurant could not be created:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Restaurant could not be created'
        });
    }
});

router.put('/:id', verificarToken, esAdmin, checkPermission('edit_restaurantes'), async (req, res) => {
    try {
        const { nombre, descripcion, icono, color_clase, activo } = req.body;

        await pool.query(
            `UPDATE restaurantes SET 
             nombre = COALESCE(?, nombre),
             descripcion = COALESCE(?, descripcion),
             icono = COALESCE(?, icono),
             color_clase = COALESCE(?, color_clase),
             activo = COALESCE(?, activo)
             WHERE id = ?`,
            [
                nombre ?? null,
                descripcion ?? null,
                icono ?? null,
                color_clase ?? null,
                activo === undefined ? null : Boolean(activo),
                req.params.id
            ]
        );

        res.json({
            error: false,
            mensaje: 'Restaurant updated successfully'
        });

    } catch (error) {
        console.error('Restaurant could not be updated:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Restaurant could not be updated'
        });
    }
});

module.exports = router;
