(function () {
    function createTaxStoreCatalog(config) {
        const {
            restaurantCode,
            rateCacheStorageKey,
            rateCacheDays,
            jurisdictionOverrides = {},
            rateFallback = {},
            includeState = false,
            defaultState = '',
            getDefaults
        } = config;

        let cache = null;
        let initDone = false;

        function normalizeStoreNumber(store) {
            const numero = Number(String(store ?? '').replace(/\D/g, ''));
            return Number.isFinite(numero) ? numero : 0;
        }

        function normalizeTaxRateDecimal(valor) {
            if (valor === null || valor === undefined || valor === '') return 0;

            const texto = String(valor)
                .replace('%', '')
                .replace(',', '.')
                .trim();

            const numero = Number(texto);

            if (!Number.isFinite(numero)) return 0;

            return numero > 1 ? numero / 100 : numero;
        }

        function parseCoordinates(valor) {
            if (!valor) return { latitude: null, longitude: null };

            if (
                typeof valor === 'object' &&
                valor.latitude !== undefined &&
                valor.longitude !== undefined
            ) {
                const latitude = Number(valor.latitude);
                const longitude = Number(valor.longitude);

                return {
                    latitude: Number.isFinite(latitude) ? latitude : null,
                    longitude: Number.isFinite(longitude) ? longitude : null
                };
            }

            const partes = String(valor)
                .split(',')
                .map(parte => parte.trim());

            if (partes.length !== 2) return { latitude: null, longitude: null };

            const latitude = Number(partes[0]);
            const longitude = Number(partes[1]);

            return {
                latitude: Number.isFinite(latitude) ? latitude : null,
                longitude: Number.isFinite(longitude) ? longitude : null
            };
        }

        function normalizeStoreRecord(tienda) {
            const store = normalizeStoreNumber(tienda.store);

            return {
                store,
                address: String(tienda.address || '').trim(),
                city: String(tienda.city || '').trim(),
                ...(includeState
                    ? { state: String(tienda.state || defaultState).trim().toUpperCase() }
                    : {}),
                zip: String(tienda.zip || '').trim(),
                latitude: Number.isFinite(Number(tienda.latitude))
                    ? Number(tienda.latitude)
                    : null,
                longitude: Number.isFinite(Number(tienda.longitude))
                    ? Number(tienda.longitude)
                    : null,
                preferredJurisdiction: String(
                    tienda.preferredJurisdiction ||
                    jurisdictionOverrides[store] ||
                    ''
                ).trim(),
                taxRate: normalizeTaxRateDecimal(
                    tienda.taxRate ?? rateFallback[store] ?? 0
                )
            };
        }

        function cargar() {
            return Array.isArray(cache) ? cache : [];
        }

        function guardar(tiendas) {
            const limpias = tiendas
                .map(normalizeStoreRecord)
                .filter(tienda => tienda.store)
                .sort((a, b) => a.store - b.store);

            cache = limpias;

            return limpias;
        }

        async function inicializarCatalogo(onReady) {
            if (initDone) return;
            initDone = true;

            try {
                const stores = await window.StoreTaxCatalogApi.list(restaurantCode);

                cache = stores.length
                    ? stores.map(normalizeStoreRecord).sort((a, b) => a.store - b.store)
                    : (getDefaults() || [])
                        .map(normalizeStoreRecord)
                        .sort((a, b) => a.store - b.store);
            } catch (error) {
                console.warn(
                    `Store tax catalog could not be loaded from the server for ${restaurantCode}.`,
                    error
                );
                cache = [];
                initDone = false;
            }

            if (typeof onReady === 'function') onReady();
        }

        async function upsert(tienda) {
            const normalizada = normalizeStoreRecord(tienda);

            if (!normalizada.store) {
                throw new Error('The store must have a valid number');
            }

            const tieneCoordenadas =
                Number.isFinite(normalizada.latitude) &&
                Number.isFinite(normalizada.longitude);

            if (!tieneCoordenadas && !normalizada.taxRate) {
                throw new Error('Add valid coordinates or enter a manual tax rate.');
            }

            await window.StoreTaxCatalogApi.upsert(restaurantCode, normalizada);

            const tiendas = cargar()
                .filter(item => item.store !== normalizada.store);

            tiendas.push(normalizada);
            return guardar(tiendas);
        }

        async function eliminarRemoto(storeNumber) {
            await window.StoreTaxCatalogApi.remove(restaurantCode, storeNumber);
        }

        async function restoreDefaults() {
            const defaults = (getDefaults() || []).map(normalizeStoreRecord);
            const stores = await window.StoreTaxCatalogApi.replaceAll(restaurantCode, defaults);

            cache = (stores.length ? stores : defaults)
                .map(normalizeStoreRecord)
                .sort((a, b) => a.store - b.store);

            return cache;
        }

        function cargarCacheRate() {
            try {
                return JSON.parse(
                    localStorage.getItem(rateCacheStorageKey) || '{}'
                );
            } catch {
                return {};
            }
        }

        function guardarCacheRate(cacheObj) {
            localStorage.setItem(
                rateCacheStorageKey,
                JSON.stringify(cacheObj)
            );
        }

        function crearClaveCacheRate(store, latitude, longitude) {
            return [
                normalizeStoreNumber(store),
                Number(latitude || 0).toFixed(6),
                Number(longitude || 0).toFixed(6)
            ].join('|');
        }

        function obtenerCacheRate(store, latitude, longitude) {
            const cacheObj = cargarCacheRate();
            const item = cacheObj[crearClaveCacheRate(store, latitude, longitude)];

            if (!item?.rate || !item?.timestamp) return null;

            const edadDias =
                (Date.now() - new Date(item.timestamp).getTime()) / 86400000;

            if (edadDias > rateCacheDays) return null;

            return item;
        }

        function guardarCacheStoreRate(store, latitude, longitude, data) {
            const cacheObj = cargarCacheRate();

            cacheObj[crearClaveCacheRate(store, latitude, longitude)] = {
                ...data,
                rate: normalizeTaxRateDecimal(data.rate),
                timestamp: new Date().toISOString()
            };

            guardarCacheRate(cacheObj);
        }

        function limpiarCacheRateParaStore(storeNumber) {
            const cacheObj = cargarCacheRate();

            Object.keys(cacheObj).forEach(clave => {
                if (clave.startsWith(`${storeNumber}|`)) {
                    delete cacheObj[clave];
                }
            });

            guardarCacheRate(cacheObj);
        }

        return {
            normalizeStoreNumber,
            normalizeTaxRateDecimal,
            parseCoordinates,
            normalizeStoreRecord,
            cargar,
            guardar,
            inicializarCatalogo,
            upsert,
            eliminarRemoto,
            restoreDefaults,
            cargarCacheRate,
            guardarCacheRate,
            obtenerCacheRate,
            guardarCacheStoreRate,
            limpiarCacheRateParaStore
        };
    }

    window.createTaxStoreCatalog = createTaxStoreCatalog;
})();
