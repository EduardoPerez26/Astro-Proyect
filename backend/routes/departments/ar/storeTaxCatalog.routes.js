const express = require('express');
const router = express.Router();
const { verificarToken, checkPermission } = require('../../../middleware/auth.middleware');

const {
    resolveRestaurantId,
    listStores,
    upsertStore,
    deleteStore,
    replaceAll,
} = require('../../../services/departments/ar/storeTaxCatalog.service');

router.get('/', verificarToken, checkPermission('view_conciliaciones'), async (req, res) => {
    try {
        const restaurantId = await resolveRestaurantId(req.query.restaurantCode);

        if (!restaurantId) {
            return res.status(404).json({
                error: true,
                mensaje: 'Unknown restaurant code',
            });
        }

        const stores = await listStores(restaurantId);

        res.json({ error: false, stores });
    } catch (error) {
        console.error('Store tax catalog could not be loaded:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Store tax catalog could not be loaded',
        });
    }
});

router.post('/', verificarToken, checkPermission('edit_conciliaciones'), async (req, res) => {
    try {
        const { restaurantCode, ...store } = req.body || {};
        const restaurantId = await resolveRestaurantId(restaurantCode);

        if (!restaurantId) {
            return res.status(404).json({
                error: true,
                mensaje: 'Unknown restaurant code',
            });
        }

        await upsertStore(restaurantId, store, req.usuario?.id);

        res.json({ error: false, mensaje: 'Store saved successfully' });
    } catch (error) {
        console.error('Store could not be saved:', error);
        res.status(500).json({
            error: true,
            mensaje: error.message || 'Store could not be saved',
        });
    }
});

router.post('/replace', verificarToken, checkPermission('edit_conciliaciones'), async (req, res) => {
    try {
        const { restaurantCode, stores } = req.body || {};
        const restaurantId = await resolveRestaurantId(restaurantCode);

        if (!restaurantId) {
            return res.status(404).json({
                error: true,
                mensaje: 'Unknown restaurant code',
            });
        }

        await replaceAll(restaurantId, Array.isArray(stores) ? stores : [], req.usuario?.id);

        const savedStores = await listStores(restaurantId);

        res.json({ error: false, stores: savedStores });
    } catch (error) {
        console.error('Store tax catalog could not be replaced:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Store tax catalog could not be replaced',
        });
    }
});

router.delete('/:restaurantCode/:store', verificarToken, checkPermission('delete_conciliaciones'), async (req, res) => {
    try {
        const restaurantId = await resolveRestaurantId(req.params.restaurantCode);

        if (!restaurantId) {
            return res.status(404).json({
                error: true,
                mensaje: 'Unknown restaurant code',
            });
        }

        const eliminado = await deleteStore(restaurantId, req.params.store);

        if (!eliminado) {
            return res.status(404).json({
                error: true,
                mensaje: 'Store not found',
            });
        }

        res.json({ error: false, mensaje: 'Store deleted successfully' });
    } catch (error) {
        console.error('Store could not be deleted:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Store could not be deleted',
        });
    }
});

module.exports = router;
