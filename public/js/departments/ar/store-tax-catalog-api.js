(function () {
    function baseUrl() {
        return String(window.API_URL || '').replace(/\/$/, '');
    }

    function authHeaders(extra) {
        const token = localStorage.getItem('token');
        return {
            ...(extra || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        };
    }

    function fromRow(row) {
        return {
            store: row.store,
            address: row.address || '',
            city: row.city || '',
            state: row.state || '',
            zip: row.zip || '',
            latitude: row.latitude === null || row.latitude === undefined
                ? null
                : Number(row.latitude),
            longitude: row.longitude === null || row.longitude === undefined
                ? null
                : Number(row.longitude),
            preferredJurisdiction: row.preferredJurisdiction || '',
            taxRate: Number(row.taxRate) || 0
        };
    }

    async function list(restaurantCode) {
        const url = baseUrl();
        if (!url) return [];

        try {
            const response = await fetch(
                `${url}/store-tax-catalog?restaurantCode=${encodeURIComponent(restaurantCode)}`,
                {
                    method: 'GET',
                    credentials: 'include',
                    headers: authHeaders()
                }
            );

            const data = await response.json().catch(() => ({}));

            if (!response.ok || data?.error) {
                console.warn('Store tax catalog could not be loaded from the server:', data?.mensaje || response.status);
                return [];
            }

            return Array.isArray(data.stores) ? data.stores.map(fromRow) : [];
        } catch (error) {
            console.warn('Store tax catalog could not be loaded from the server:', error);
            return [];
        }
    }

    async function upsert(restaurantCode, store) {
        const url = baseUrl();
        if (!url) throw new Error('API_URL is not configured');

        const response = await fetch(`${url}/store-tax-catalog`, {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ restaurantCode, ...store })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data?.error) {
            throw new Error(data?.mensaje || 'Store could not be saved');
        }

        return data;
    }

    async function remove(restaurantCode, store) {
        const url = baseUrl();
        if (!url) throw new Error('API_URL is not configured');

        const response = await fetch(
            `${url}/store-tax-catalog/${encodeURIComponent(restaurantCode)}/${encodeURIComponent(store)}`,
            {
                method: 'DELETE',
                credentials: 'include',
                headers: authHeaders()
            }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data?.error) {
            throw new Error(data?.mensaje || 'Store could not be deleted');
        }

        return data;
    }

    async function replaceAll(restaurantCode, stores) {
        const url = baseUrl();
        if (!url) throw new Error('API_URL is not configured');

        const response = await fetch(`${url}/store-tax-catalog/replace`, {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ restaurantCode, stores })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data?.error) {
            throw new Error(data?.mensaje || 'Store tax catalog could not be replaced');
        }

        return Array.isArray(data.stores) ? data.stores.map(fromRow) : [];
    }

    window.StoreTaxCatalogApi = { list, upsert, remove, replaceAll };
})();
