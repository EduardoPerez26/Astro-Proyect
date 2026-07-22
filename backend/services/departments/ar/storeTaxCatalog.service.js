const { pool } = require('../../../config/database');

function toRow(store) {
    return {
        store_number: String(store.store ?? '').trim(),
        address: store.address || null,
        city: store.city || null,
        state: store.state || null,
        zip: store.zip || null,
        latitude: Number.isFinite(Number(store.latitude)) ? Number(store.latitude) : null,
        longitude: Number.isFinite(Number(store.longitude)) ? Number(store.longitude) : null,
        preferred_jurisdiction: store.preferredJurisdiction || null,
        tax_rate: Number.isFinite(Number(store.taxRate)) ? Number(store.taxRate) : 0
    };
}

function fromRow(row) {
    return {
        store: row.store_number,
        address: row.address || '',
        city: row.city || '',
        state: row.state || '',
        zip: row.zip || '',
        latitude: row.latitude === null ? null : Number(row.latitude),
        longitude: row.longitude === null ? null : Number(row.longitude),
        preferredJurisdiction: row.preferred_jurisdiction || '',
        taxRate: Number(row.tax_rate)
    };
}

async function resolveRestaurantId(codigo) {
    if (!codigo) return null;

    const [restaurantes] = await pool.query(
        'SELECT id FROM restaurantes WHERE codigo = ? AND activo = TRUE',
        [codigo]
    );

    return restaurantes.length ? restaurantes[0].id : null;
}

async function listStores(restaurantId) {
    const [rows] = await pool.query(
        'SELECT * FROM store_tax_catalog WHERE restaurante_id = ? ORDER BY store_number',
        [restaurantId]
    );

    return rows.map(fromRow);
}

async function upsertStore(restaurantId, store, usuarioId) {
    const row = toRow(store);

    if (!row.store_number) {
        throw new Error('The store must have a valid number');
    }

    await pool.query(
        `INSERT INTO store_tax_catalog
            (restaurante_id, store_number, address, city, state, zip, latitude, longitude, preferred_jurisdiction, tax_rate, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            address = VALUES(address),
            city = VALUES(city),
            state = VALUES(state),
            zip = VALUES(zip),
            latitude = VALUES(latitude),
            longitude = VALUES(longitude),
            preferred_jurisdiction = VALUES(preferred_jurisdiction),
            tax_rate = VALUES(tax_rate),
            usuario_id = VALUES(usuario_id)`,
        [
            restaurantId,
            row.store_number,
            row.address,
            row.city,
            row.state,
            row.zip,
            row.latitude,
            row.longitude,
            row.preferred_jurisdiction,
            row.tax_rate,
            usuarioId || null
        ]
    );
}

async function deleteStore(restaurantId, storeNumber) {
    const [resultado] = await pool.query(
        'DELETE FROM store_tax_catalog WHERE restaurante_id = ? AND store_number = ?',
        [restaurantId, String(storeNumber ?? '').trim()]
    );

    return resultado.affectedRows > 0;
}

async function replaceAll(restaurantId, stores, usuarioId) {
    const filas = (stores || [])
        .map(toRow)
        .filter(row => row.store_number);

    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.query(
            'DELETE FROM store_tax_catalog WHERE restaurante_id = ?',
            [restaurantId]
        );

        for (const row of filas) {
            await connection.query(
                `INSERT INTO store_tax_catalog
                    (restaurante_id, store_number, address, city, state, zip, latitude, longitude, preferred_jurisdiction, tax_rate, usuario_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    restaurantId,
                    row.store_number,
                    row.address,
                    row.city,
                    row.state,
                    row.zip,
                    row.latitude,
                    row.longitude,
                    row.preferred_jurisdiction,
                    row.tax_rate,
                    usuarioId || null
                ]
            );
        }

        await connection.commit();
    } catch (error) {
        if (connection) await connection.rollback();
        throw error;
    } finally {
        if (connection) connection.release();
    }
}

module.exports = {
    resolveRestaurantId,
    listStores,
    upsertStore,
    deleteStore,
    replaceAll
};
