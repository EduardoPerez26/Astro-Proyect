// ============================================
// RUTAS DE RESTAURANTES
// ============================================
// CRUD de restaurantes/tiendas
// ============================================

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verificarToken, esAdmin, checkPermission } = require('../middleware/auth.middleware');

// ============================================
// GET /api/restaurantes
// ============================================
// Lista todos los restaurantes activos
router.get('/', verificarToken, checkPermission('view_tiendas'), async (req, res) => {
    try {
        const [restaurantes] = await pool.query(
            'SELECT * FROM restaurantes WHERE activo = TRUE ORDER BY nombre'
        );

        res.json({
            error: false,
            restaurantes
        });

    } catch (error) {
        console.error('Error al listar restaurantes:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al obtener restaurantes'
        });
    }
});

// ============================================
// GET /api/restaurantes/:id
// ============================================
// Obtiene un restaurante por ID
router.get('/:id', verificarToken, checkPermission('view_tiendas'), async (req, res) => {
    try {
        const [restaurantes] = await pool.query(
            'SELECT * FROM restaurantes WHERE id = ?',
            [req.params.id]
        );

        if (restaurantes.length === 0) {
            return res.status(404).json({
                error: true,
                mensaje: 'Restaurante no encontrado'
            });
        }

        res.json({
            error: false,
            restaurante: restaurantes[0]
        });

    } catch (error) {
        console.error('Error al obtener restaurante:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al obtener restaurante'
        });
    }
});

// ============================================
// POST /api/restaurantes
// ============================================
// Crea un nuevo restaurante (solo admin)
router.post('/', verificarToken, esAdmin, async (req, res) => {
    try {
        const { codigo, nombre, descripcion, icono, color_clase } = req.body;

        if (!codigo || !nombre) {
            return res.status(400).json({
                error: true,
                mensaje: 'Codigo y nombre son requeridos'
            });
        }

        const [resultado] = await pool.query(
            `INSERT INTO restaurantes (codigo, nombre, descripcion, icono, color_clase)
             VALUES (?, ?, ?, ?, ?)`,
            [codigo, nombre, descripcion, icono || 'fa-store', color_clase || 'primary']
        );

        res.status(201).json({
            error: false,
            mensaje: 'Restaurante creado exitosamente',
            restauranteId: resultado.insertId
        });

    } catch (error) {
        console.error('Error al crear restaurante:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al crear restaurante'
        });
    }
});

// ============================================
// PUT /api/restaurantes/:id
// ============================================
// Actualiza un restaurante (solo admin)
router.put('/:id', verificarToken, esAdmin, async (req, res) => {
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
            [nombre, descripcion, icono, color_clase, activo, req.params.id]
        );

        res.json({
            error: false,
            mensaje: 'Restaurante actualizado exitosamente'
        });

    } catch (error) {
        console.error('Error al actualizar restaurante:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al actualizar restaurante'
        });
    }
});

module.exports = router;
