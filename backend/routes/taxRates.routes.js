const express = require('express');
const router = express.Router();

const {
    fetchTaxRateByCoordinates,
} = require('../services/cdtfaTaxrate.service');

// Si tienes middleware de token, actívalo.
// Ajusta la ruta si tu archivo se llama diferente.
// const { verificarToken } = require('../middleware/auth.middleware');

router.get('/by-coordinates', async (req, res) => {
    try {
        const { latitude, longitude, store, jurisdiction } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                error: 'Latitude and longitude are required',
            });
        }

        const result = await fetchTaxRateByCoordinates(
            Number(latitude),
            Number(longitude),
            store || null,
            jurisdiction || ''
        );

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.json(result);
    } catch (error) {
        console.error('Error fetching CDTFA tax rate:', error);

        return res.status(500).json({
            success: false,
            error: 'Internal server error fetching tax rate',
        });
    }
});

module.exports = router;
