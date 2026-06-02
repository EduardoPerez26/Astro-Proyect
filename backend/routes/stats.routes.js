const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verificarToken, checkPermission } = require('../middleware/auth.middleware');

// GET /api/stats - obtiene estadisticas generales (proc obtener_estadisticas)
router.get('/', verificarToken, checkPermission('view_dashboard'), async (req, res) => {
    try {
        const [rows] = await pool.query('CALL obtener_estadisticas()');
        // MySQL CALL devuelve un array con resultados y meta; el primer elemento contiene las filas
        const stats = Array.isArray(rows) && rows.length > 0 ? rows[0] : rows;
        res.json({ error: false, stats });
    } catch (error) {
        console.error('Error al obtener estadisticas:', error);
        res.status(500).json({ error: true, mensaje: 'Error al obtener estadisticas' });
    }
});

module.exports = router;
