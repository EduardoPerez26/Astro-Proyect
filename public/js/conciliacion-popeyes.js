let popeyesConciliationData = [];
let popeyesTaxReviewData = [];
let popeyesDailySalesRedData = [];
let popeyesDailySales0404Data = [];

const renderTaxReviewTacoBellLegacy =
    typeof renderTaxReview === 'function'
        ? renderTaxReview
        : null;

const POPEYES_DESCRIPTION = 'POS Data Upload DC Central';

const POPEYES_TAX_RATES = {
    2902: 0.0775,
    4579: 0.0875,
    5328: 0.1075,
    5592: 0.1075,
    5813: 0.0913,
    8593: 0.1025,
    8732: 0.0925,
    8972: 0.0813,
    9091: 0.1075,
    9929: 0.1075,
    10545: 0.0775,
    10752: 0.09,
    10921: 0.0975,
    10989: 0.0875,
    11218: 0.0775,
    11422: 0.0725,
    11423: 0.0825,
    11424: 0.0925,
    11425: 0.0925,
    11438: 0.0725,
    11540: 0.0775,
    11580: 0.09,
    11691: 0.0775,
    11833: 0.0825,
    11921: 0.0875,
    11922: 0.0838,
    11949: 0.0875,
    12114: 0.0875,
    12192: 0.09,
    12967: 0.0875,
    13144: 0.0875,
    13684: 0.0875,
    13691: 0.0775,
    13903: 0.0838,
    13959: 0.0775,
    14183: 0.09,
    14184: 0.0775,
    14210: 0.07875,
    14589: 0.088,
    14693: 0.0875,
    14719: 0.0838,
    14869: 0.0825,
    15462: 0.1025,
    15643: 0.08625
};

const POPEYES_PROMO_OTHER_STORES =
    new Set([
        2902,
        4579,
        14210,
        15462,
        14183,
        11422
    ]);

const POPEYES_AMEX_ACCOUNTS = [
    'Payments - Amex PrPd',
    'Payments - WL Amex',
    'Payments - PrPd Amex',
    'Payments - AMEX'
];

const POPEYES_CC_ACCOUNTS = [
    'Payments - WL Discover',
    'Payments - PrPd Discover',
    'Payments - Discover',
    'Payments - Discover PrPd',
    'Payments - Master Card',
    'Payments - Master Card PrPd',
    'Payments - Credit Cards',
    'Payments - Visa',
    'Payments - Visa PrPd',
    'Payments - PrPd Master Card',
    'Payments - PrPd Visa',
    'Payments - WL MasterCard',
    'Payments - WL Visa',
    'Payments - WL Paypal',
    'Payments - PrPD Paypal',
    'Payments - WL Venmo',
    'Payments - PrPD Venmo',
    'Payments - Debit',
    'Payments - Other Delivery',
    'Payments - Other',
    'Payments - Cash App',
    'Payments - IMT Venmo',
    'Payments - IMT Paypal'
];

const POPEYES_WL_TIP_ACCOUNTS = [
    'Payment Tips - WL Visa',
    'Payment Tips - WL Master Card',
    'Payment Tips - WL Discovery',
    'Payment Tips - WL GiftCard',
    'Payment Tips - WL Amex',
    'Delivery Tips Net'
];

const POPEYES_KIOSK_ACCOUNTS = [
    'Payments - Kiosk',
    'Payments - Kiosk Discover',
    'Payments - Kiosk MasterCard',
    'Payments - Kiosk Visa'
];

const POPEYES_DAILY_SALES_LINES = [
    { memo: 'Amex Expected Deposit', acctNo: 102500, field: 'amexExpectedDeposit', type: 'debit' },
    { memo: 'Ca CRV', acctNo: 240000, field: 'caCrv', type: 'credit' },
    { memo: 'Cash Expected Deposit', acctNo: 102000, field: 'cashExpected', type: 'debit' },
    { memo: 'CC Expected Deposit', acctNo: 102500, field: 'totalCC', type: 'debit' },
    { memo: 'Delivery Fee', acctNo: 670000, field: 'deliveryFee', type: 'credit' },
    { memo: 'Discounts - 10%', acctNo: 421000, field: 'discount10', type: 'debit' },
    { memo: 'Discounts - Employee', acctNo: 421000, field: 'discountEmployee', type: 'debit' },
    { memo: 'Discounts - Guest Recovery', acctNo: 421000, field: 'discountGuestRecovery', type: 'debit' },
    { memo: 'Discounts - Manager', acctNo: 421000, field: 'discountManager', type: 'debit' },
    { memo: 'Discounts - Military', acctNo: 421000, field: 'discountMilitary', type: 'debit' },
    { memo: 'Discounts - Open $', acctNo: 421000, field: 'discountOpenDollar', type: 'debit' },
    { memo: 'Discounts - Open %', acctNo: 421000, field: 'discountOpenPercent', type: 'debit' },
    { memo: 'Discounts - Other', acctNo: 421000, field: 'discountsOther', type: 'debit' },
    { memo: 'Discounts - Police', acctNo: 421000, field: 'discountPolice', type: 'debit' },
    { memo: 'Discounts - Senior Citizen', acctNo: 421000, field: 'discountSenior', type: 'debit' },
    { memo: 'Donations', acctNo: 236000, field: 'donations', type: 'credit' },
    { memo: 'DoorDash', acctNo: 113000, field: 'doorDash', type: 'debit' },
    { memo: 'DoorDash Shortage', acctNo: 678500, field: 'doorDashShortage', type: 'debit' },
    { memo: 'EBT Expected ', acctNo: 114000, field: 'ebt', type: 'debit' },
    { memo: 'EZ Cater', acctNo: 110000, field: 'ezCater', type: 'debit' },
    { memo: 'Gift Card Redeemed', acctNo: 202900, field: 'giftCardRedeemed', type: 'debit' },
    { memo: 'Gift Cards Sales', acctNo: 202800, field: 'gcSold', type: 'credit' },
    { memo: 'GrubHub', acctNo: 115000, field: 'grubHub', type: 'debit' },
    { memo: 'Kiosk Expected Payment', acctNo: 102500, field: 'kiosk', type: 'debit' },
    { memo: 'Non-Redeemable Tender', acctNo: 676000, field: 'nonRedeemable', type: 'credit' },
    { memo: 'O/S DC Discrepancies', acctNo: 676000, field: null, type: 'debit' },
    { memo: 'Online Catering', acctNo: 110000, field: 'onlineCatering', type: 'debit' },
    { memo: 'Paid Outs', acctNo: 116200, field: 'paidOut', type: 'debit' },
    { memo: 'POS Over/Short', acctNo: 676000, field: 'overShort', type: 'debit' },
    { memo: 'Promotions', acctNo: 444000, field: 'discountsPromo', type: 'debit' },
    { memo: 'Sales Beverages', acctNo: 401000, field: 'beverages', type: 'credit' },
    { memo: 'Sales Food', acctNo: 401000, field: 'food', type: 'credit' },
    { memo: 'Sales Other', acctNo: 408000, field: 'other', type: 'credit' },
    { memo: 'Sales Tax Payable', acctNo: 241000, field: 'salesTax', type: 'credit' },
    { memo: 'Uber', acctNo: 116000, field: 'uberEats', type: 'debit' },
    { memo: 'Uber Shortage', acctNo: 678500, field: 'uberShortage', type: 'debit' },
    { memo: 'WL DD Tips', acctNo: 670000, field: 'wlTips', type: 'credit' }
];

function numeroPopeyes(valor) {

    if (
        valor === null ||
        valor === undefined ||
        valor === '' ||
        valor instanceof Date
    ) {
        return 0;
    }

    if (typeof valor === 'number') {
        return valor;
    }

    const texto =
        String(valor)
            .replace(/[$,\s]/g, '')
            .trim();

    if (!texto) return 0;

    const negativo =
        texto.startsWith('(') &&
        texto.endsWith(')');

    const numero =
        Number(
            texto.replace(/[()]/g, '')
        );

    if (Number.isNaN(numero)) {
        return 0;
    }

    return negativo ? -numero : numero;
}

function redondearPopeyes(valor) {
    const numero = Number(valor) || 0;
    if (Math.abs(numero) < 0.000001) return 0;
    return Number(numero.toFixed(2));
}

function formatoPorcentajePopeyes(valor) {
    const numero = Number(valor) || 0;
    const porcentaje =
        Math.abs(numero) > 1
            ? numero
            : numero * 100;

    if (Math.abs(porcentaje) < 0.000001) {
        return '0%';
    }

    return `${porcentaje.toFixed(3).replace(/\.?0+$/, '')}%`;
}

const POPEYES_TAX_RATE_DIRECT_API_BASE_URL = 'https://services.maps.cdtfa.ca.gov/api/taxrate';
const POPEYES_TAX_STORE_STORAGE_KEY = 'popeyesTaxStores.v1';
const POPEYES_TAX_RATE_CACHE_STORAGE_KEY = 'popeyesTaxRateCache.v1';
const POPEYES_TAX_RATE_CACHE_DAYS = 30;
const POPEYES_TAX_RATE_TIMEOUT_MS = 8000;

const POPEYES_STORE_JURISDICTION_OVERRIDES = {
    13538: 'HERCULES',
    1549: 'FRESNO',
    2152: 'UNINCORPORATED AREA-ALAMEDA'
};

function normalizarStoreNumberPopeyes(store) {
    const numero = Number(String(store ?? '').replace(/\D/g, ''));
    return Number.isFinite(numero) ? numero : 0;
}

function normalizarTaxRateDecimalPopeyes(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;

    const numero = Number(
        String(valor).replace('%', '').replace(',', '.').trim()
    );

    if (!Number.isFinite(numero)) return 0;

    return numero > 1 ? numero / 100 : numero;
}

function parsearCoordenadasPopeyes(valor) {
    if (!valor) return { latitude: null, longitude: null };

    const partes = String(valor).split(',').map(parte => parte.trim());
    if (partes.length !== 2) return { latitude: null, longitude: null };

    const latitude = Number(partes[0]);
    const longitude = Number(partes[1]);

    return {
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null
    };
}

function normalizarTiendaTaxPopeyes(tienda) {
    const store = normalizarStoreNumberPopeyes(tienda.store);

    return {
        store,
        address: String(tienda.address || '').trim(),
        city: String(tienda.city || '').trim(),
        state: String(tienda.state || 'CA').trim().toUpperCase(),
        zip: String(tienda.zip || '').trim(),
        latitude: Number.isFinite(Number(tienda.latitude))
            ? Number(tienda.latitude)
            : null,
        longitude: Number.isFinite(Number(tienda.longitude))
            ? Number(tienda.longitude)
            : null,
        preferredJurisdiction: String(
            tienda.preferredJurisdiction ||
            POPEYES_STORE_JURISDICTION_OVERRIDES[store] ||
            ''
        ).trim(),
        taxRate: normalizarTaxRateDecimalPopeyes(
            tienda.taxRate ?? POPEYES_TAX_RATES[store] ?? 0
        )
    };
}

function cargarTiendasTaxPopeyes() {
    try {
        const guardadas = JSON.parse(
            localStorage.getItem(POPEYES_TAX_STORE_STORAGE_KEY) || 'null'
        );

        if (Array.isArray(guardadas)) {
            return guardadas
                .map(normalizarTiendaTaxPopeyes)
                .filter(tienda => tienda.store);
        }
    } catch (error) {
        console.warn('No se pudo leer el catalogo local de tiendas Popeyes:', error);
    }

    return (window.POPEYES_DEFAULT_TAX_STORES || [])
        .map(normalizarTiendaTaxPopeyes)
        .filter(tienda => tienda.store);
}

function guardarTiendasTaxPopeyes(tiendas) {
    const limpias = tiendas
        .map(normalizarTiendaTaxPopeyes)
        .filter(tienda => tienda.store)
        .sort((a, b) => a.store - b.store);

    localStorage.setItem(
        POPEYES_TAX_STORE_STORAGE_KEY,
        JSON.stringify(limpias)
    );

    return limpias;
}

function buscarTiendaTaxPopeyes(store) {
    const numeroStore = normalizarStoreNumberPopeyes(store);

    return cargarTiendasTaxPopeyes()
        .find(tienda => tienda.store === numeroStore) || null;
}

function upsertTiendaTaxPopeyes(tienda) {
    const normalizada = normalizarTiendaTaxPopeyes(tienda);

    if (!normalizada.store) {
        throw new Error('La tienda debe tener un numero valido');
    }

    const tieneCoordenadas =
        Number.isFinite(normalizada.latitude) &&
        Number.isFinite(normalizada.longitude);

    if (!tieneCoordenadas && !normalizada.taxRate) {
        throw new Error('Agrega coordenadas validas o captura un tax rate manual.');
    }

    const tiendas = cargarTiendasTaxPopeyes()
        .filter(item => item.store !== normalizada.store);

    tiendas.push(normalizada);
    return guardarTiendasTaxPopeyes(tiendas);
}

function eliminarTiendaTaxPopeyes(store) {
    const numeroStore = normalizarStoreNumberPopeyes(store);

    if (!numeroStore) return cargarTiendasTaxPopeyes();

    return guardarTiendasTaxPopeyes(
        cargarTiendasTaxPopeyes()
            .filter(item => item.store !== numeroStore)
    );
}

function cargarCacheTaxRatePopeyes() {
    try {
        return JSON.parse(
            localStorage.getItem(POPEYES_TAX_RATE_CACHE_STORAGE_KEY) || '{}'
        );
    } catch {
        return {};
    }
}

function guardarCacheTaxRatePopeyes(cache) {
    localStorage.setItem(
        POPEYES_TAX_RATE_CACHE_STORAGE_KEY,
        JSON.stringify(cache)
    );
}

function crearClaveCacheTaxRatePopeyes(store, latitude, longitude) {
    return [
        normalizarStoreNumberPopeyes(store),
        Number(latitude || 0).toFixed(6),
        Number(longitude || 0).toFixed(6)
    ].join('|');
}

function obtenerCacheTaxRatePopeyes(store, latitude, longitude) {
    const cache = cargarCacheTaxRatePopeyes();
    const item = cache[crearClaveCacheTaxRatePopeyes(store, latitude, longitude)];

    if (!item?.rate || !item?.timestamp) return null;

    const edadDias =
        (Date.now() - new Date(item.timestamp).getTime()) / 86400000;

    if (edadDias > POPEYES_TAX_RATE_CACHE_DAYS) return null;

    return item;
}

function guardarCacheTiendaTaxRatePopeyes(store, latitude, longitude, data) {
    const cache = cargarCacheTaxRatePopeyes();

    cache[crearClaveCacheTaxRatePopeyes(store, latitude, longitude)] = {
        ...data,
        rate: normalizarTaxRateDecimalPopeyes(data.rate),
        timestamp: new Date().toISOString()
    };

    guardarCacheTaxRatePopeyes(cache);
}

function elegirResultadoCDTFAPopeyes(apiData, store, preferredJurisdiction = '') {
    const resultados = Array.isArray(apiData?.taxRateInfo)
        ? apiData.taxRateInfo
        : [];

    if (!resultados.length) return null;

    const storeNumber = normalizarStoreNumberPopeyes(store);
    const preferida = String(
        preferredJurisdiction ||
        POPEYES_STORE_JURISDICTION_OVERRIDES[storeNumber] ||
        ''
    ).trim().toUpperCase();

    if (preferida && resultados.length > 1) {
        const match = resultados.find(item =>
            String(item.jurisdiction || '').trim().toUpperCase() === preferida
        );

        if (match) return match;
    }

    return resultados[0];
}

function obtenerApiUrlTaxRatesPopeyes(location) {
    const baseUrl = String(window.API_URL || '').replace(/\/$/, '');
    if (!baseUrl) return '';

    const params = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        store: String(location.store || '')
    });

    if (location.preferredJurisdiction) {
        params.set('jurisdiction', location.preferredJurisdiction);
    }

    return `${baseUrl}/tax-rates/by-coordinates?${params.toString()}`;
}

function normalizarRespuestaBackendTaxRatePopeyes(data) {
    if (!data?.success) {
        return {
            success: false,
            error: data?.error || 'No se pudo consultar CDTFA'
        };
    }

    return {
        success: true,
        rate: normalizarTaxRateDecimalPopeyes(
            data.rate_decimal ?? data.rate
        ),
        jurisdiction: data.jurisdiction || '',
        city: data.city || '',
        county: data.county || '',
        tac: data.tac || '',
        matchCount: data.match_count ?? data.matchCount ?? 0,
        bufferDistance: data.buffer_distance ?? data.bufferDistance ?? null,
        apiResponse: data.api_response || data.apiResponse || data
    };
}

async function consultarTaxRateCDTFAPopeyes(location) {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return {
            success: false,
            error: 'La tienda no tiene coordenadas validas'
        };
    }

    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        POPEYES_TAX_RATE_TIMEOUT_MS
    );

    try {
        const backendUrl = obtenerApiUrlTaxRatesPopeyes({
            ...location,
            latitude,
            longitude
        });

        if (backendUrl) {
            try {
                const response = await fetch(backendUrl, {
                    method: 'GET',
                    signal: controller.signal
                });
                const data = await response.json().catch(() => ({}));

                if (response.ok && data?.success) {
                    return normalizarRespuestaBackendTaxRatePopeyes(data);
                }

                console.warn(
                    'Backend CDTFA no disponible para Popeyes, intentando consulta directa:',
                    data?.error || response.status
                );
            } catch (error) {
                if (error?.name === 'AbortError') throw error;
                console.warn(
                    'No se pudo consultar CDTFA via backend para Popeyes:',
                    error
                );
            }
        }

        const url =
            `${POPEYES_TAX_RATE_DIRECT_API_BASE_URL}/GetRateByLngLat?Latitude=${encodeURIComponent(latitude)}&Longitude=${encodeURIComponent(longitude)}`;

        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            return {
                success: false,
                error: data?.errors?.[0]?.message || `CDTFA ${response.status}`
            };
        }

        const rateInfo = elegirResultadoCDTFAPopeyes(
            data,
            location.store,
            location.preferredJurisdiction
        );

        if (!rateInfo) {
            return {
                success: false,
                error: 'CDTFA no encontro tax rate para la ubicacion',
                apiResponse: data
            };
        }

        return {
            success: true,
            rate: normalizarTaxRateDecimalPopeyes(rateInfo.rate),
            jurisdiction: rateInfo.jurisdiction || '',
            city: rateInfo.city || '',
            county: rateInfo.county || '',
            tac: rateInfo.tac || '',
            matchCount: Array.isArray(data.taxRateInfo) ? data.taxRateInfo.length : 0,
            bufferDistance: data?.geocodeInfo?.bufferDistance ?? null,
            apiResponse: data
        };
    } catch (error) {
        return {
            success: false,
            error: error?.name === 'AbortError'
                ? 'Tiempo de espera agotado consultando CDTFA'
                : 'No se pudo consultar CDTFA'
        };
    } finally {
        clearTimeout(timeout);
    }
}

function obtenerTaxRateLocalPopeyes(store) {
    const numeroStore = normalizarStoreNumberPopeyes(store);
    if (!numeroStore) return 0;

    const tienda = buscarTiendaTaxPopeyes(numeroStore);

    if (
        tienda &&
        Number.isFinite(tienda.latitude) &&
        Number.isFinite(tienda.longitude)
    ) {
        const cache = obtenerCacheTaxRatePopeyes(
            numeroStore,
            tienda.latitude,
            tienda.longitude
        );

        if (cache?.rate) return Number(cache.rate);
    }

    return normalizarTaxRateDecimalPopeyes(
        tienda?.taxRate || POPEYES_TAX_RATES[numeroStore] || 0
    );
}

function estadoTaxRateDesdeCachePopeyes(tienda) {
    const cache = obtenerCacheTaxRatePopeyes(
        tienda.store,
        tienda.latitude,
        tienda.longitude
    );

    if (cache?.rate) {
        return `${formatoPorcentajePopeyes(cache.rate)} · CDTFA`;
    }

    if (tienda.taxRate) {
        return `${formatoPorcentajePopeyes(tienda.taxRate)} · local`;
    }

    return 'Pendiente';
}

function actualizarPanelTaxPopeyes(codigo = '') {
    const panel = document.getElementById('popeyesTaxStorePanel');
    if (!panel) return;

    const codigoActual = codigo ||
        document
            .getElementById('selectRestaurante')
            ?.selectedOptions?.[0]
            ?.dataset?.codigo ||
        '';

    panel.style.display = codigoActual === 'popeyes' ? '' : 'none';

    if (codigoActual === 'popeyes') {
        renderTiendasTaxPopeyes();
    }
}

function limpiarFormularioTiendaTaxPopeyes() {
    [
        'pyTaxStoreNumber',
        'pyTaxStoreAddress',
        'pyTaxStoreCity',
        'pyTaxStoreZip',
        'pyTaxStoreCoordinates',
        'pyTaxStoreRate',
        'pyTaxStoreJurisdiction'
    ].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
}

function cargarFormularioTiendaTaxPopeyes(store) {
    const tienda = buscarTiendaTaxPopeyes(store);
    if (!tienda) return;

    const valores = {
        pyTaxStoreNumber: tienda.store,
        pyTaxStoreAddress: tienda.address,
        pyTaxStoreCity: tienda.city,
        pyTaxStoreZip: tienda.zip,
        pyTaxStoreCoordinates:
            tienda.latitude !== null && tienda.longitude !== null
                ? `${tienda.latitude}, ${tienda.longitude}`
                : '',
        pyTaxStoreRate: tienda.taxRate
            ? formatoPorcentajePopeyes(tienda.taxRate)
            : '',
        pyTaxStoreJurisdiction: tienda.preferredJurisdiction
    };

    Object.entries(valores).forEach(([id, valor]) => {
        const input = document.getElementById(id);
        if (input) input.value = valor ?? '';
    });
}

function leerFormularioTiendaTaxPopeyes() {
    const coords = parsearCoordenadasPopeyes(
        document.getElementById('pyTaxStoreCoordinates')?.value
    );

    return {
        store: document.getElementById('pyTaxStoreNumber')?.value,
        address: document.getElementById('pyTaxStoreAddress')?.value,
        city: document.getElementById('pyTaxStoreCity')?.value,
        state: 'CA',
        zip: document.getElementById('pyTaxStoreZip')?.value,
        latitude: coords.latitude,
        longitude: coords.longitude,
        taxRate: document.getElementById('pyTaxStoreRate')?.value,
        preferredJurisdiction:
            document.getElementById('pyTaxStoreJurisdiction')?.value
    };
}

function mostrarEstadoTaxPopeyes(texto, tipo = 'info') {
    const status = document.getElementById('pyTaxStoreStatus');
    if (!status) return;

    status.textContent = texto;
    status.dataset.type = tipo;
}

function renderTiendasTaxPopeyes() {
    const tbody = document.getElementById('pyTaxStoreBody');
    const count = document.getElementById('pyTaxStoreCount');

    if (!tbody) return;

    const tiendas = cargarTiendasTaxPopeyes();

    if (count) {
        count.textContent = `${tiendas.length} tiendas configuradas`;
    }

    tbody.innerHTML = tiendas.map(tienda => `
        <tr>
            <td>${tienda.store}</td>
            <td>
                <strong>${tienda.city || '-'}</strong>
                <small>${tienda.address || ''}</small>
            </td>
            <td>${tienda.zip || '-'}</td>
            <td>${
                tienda.latitude !== null && tienda.longitude !== null
                    ? `${tienda.latitude.toFixed(6)}, ${tienda.longitude.toFixed(6)}`
                    : '-'
            }</td>
            <td>${tienda.preferredJurisdiction || '-'}</td>
            <td>${estadoTaxRateDesdeCachePopeyes(tienda)}</td>
            <td class="bk-tax-store-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-py-tax-edit="${tienda.store}">
                    Editar
                </button>
                <button type="button" class="btn btn-danger btn-sm" data-py-tax-delete="${tienda.store}">
                    Quitar
                </button>
            </td>
        </tr>
    `).join('');

    if (!tiendas.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="bk-tax-empty">
                    No hay tiendas configuradas.
                </td>
            </tr>
        `;
    }
}

function recalcularTaxReviewPopeyesSiAplica() {
    if (!Array.isArray(popeyesConciliationData) || !popeyesConciliationData.length) return;

    generarTaxReviewPopeyes(popeyesConciliationData);

    if (activeTab === 'taxReview') {
        renderTaxReview();
    }
}

async function refrescarTaxRatesPopeyes() {
    const tiendasBase = cargarTiendasTaxPopeyes();
    const storesProcesadas = Array.isArray(popeyesConciliationData) && popeyesConciliationData.length
        ? new Set(popeyesConciliationData.map(row => normalizarStoreNumberPopeyes(row.store)))
        : null;

    const tiendas = storesProcesadas
        ? tiendasBase.filter(tienda => storesProcesadas.has(tienda.store))
        : tiendasBase;

    if (!tiendas.length) {
        mostrarEstadoTaxPopeyes('No hay tiendas para actualizar.', 'warning');
        return;
    }

    mostrarEstadoTaxPopeyes(
        `Actualizando 0/${tiendas.length} desde CDTFA.`
    );

    let ok = 0;
    let fallos = 0;

    for (let i = 0; i < tiendas.length; i += 1) {
        const tienda = tiendas[i];
        const result = await consultarTaxRateCDTFAPopeyes(tienda);

        if (result.success) {
            guardarCacheTiendaTaxRatePopeyes(
                tienda.store,
                tienda.latitude,
                tienda.longitude,
                result
            );

            upsertTiendaTaxPopeyes({
                ...tienda,
                taxRate: result.rate
            });

            ok += 1;
        } else {
            fallos += 1;
            console.warn(
                `No se pudo actualizar CDTFA para Popeyes ${tienda.store}:`,
                result.error
            );
        }

        mostrarEstadoTaxPopeyes(
            `Actualizando ${i + 1}/${tiendas.length} desde CDTFA... OK: ${ok}, fallas: ${fallos}`,
            fallos ? 'warning' : 'info'
        );
    }

    renderTiendasTaxPopeyes();
    recalcularTaxReviewPopeyesSiAplica();

    mostrarEstadoTaxPopeyes(
        `Actualizacion terminada. CDTFA OK: ${ok}. Fallas: ${fallos}.`,
        fallos ? 'warning' : 'success'
    );
}

function abrirModalTaxPopeyes() {
    const dialog = document.getElementById('popeyesTaxStoreDialog');
    if (!dialog) return;

    dialog.classList.remove('is-form-open');
    renderTiendasTaxPopeyes();
    mostrarEstadoTaxPopeyes('Catalogo listo. Popeyes usara estos rates locales.');

    if (typeof dialog.showModal === 'function') {
        dialog.showModal();
    } else {
        dialog.setAttribute('open', 'open');
    }
}

function cerrarModalTaxPopeyes() {
    const dialog = document.getElementById('popeyesTaxStoreDialog');
    if (!dialog) return;

    dialog.classList.remove('is-form-open');
    if (typeof dialog.close === 'function') {
        dialog.close();
    } else {
        dialog.removeAttribute('open');
    }
}

function inicializarPanelTaxRatesPopeyes() {
    if (window.__popeyesTaxPanelReady) return;
    window.__popeyesTaxPanelReady = true;

    document
        .getElementById('pyTaxOpenModal')
        ?.addEventListener('click', abrirModalTaxPopeyes);

    document
        .getElementById('pyTaxCloseModal')
        ?.addEventListener('click', cerrarModalTaxPopeyes);

    document
        .getElementById('pyTaxCloseFooter')
        ?.addEventListener('click', cerrarModalTaxPopeyes);

    document
        .getElementById('pyTaxAddStore')
        ?.addEventListener('click', () => {
            const dialog = document.getElementById('popeyesTaxStoreDialog');

            limpiarFormularioTiendaTaxPopeyes();
            dialog?.classList.add('is-form-open');
            mostrarEstadoTaxPopeyes('Captura los datos de la tienda nueva.');
            document.getElementById('pyTaxStoreNumber')?.focus();
        });

    document
        .getElementById('pyTaxSaveStore')
        ?.addEventListener('click', () => {
            try {
                upsertTiendaTaxPopeyes(
                    leerFormularioTiendaTaxPopeyes()
                );

                renderTiendasTaxPopeyes();
                recalcularTaxReviewPopeyesSiAplica();
                mostrarEstadoTaxPopeyes('Tienda guardada correctamente.', 'success');
                limpiarFormularioTiendaTaxPopeyes();
                document
                    .getElementById('popeyesTaxStoreDialog')
                    ?.classList.remove('is-form-open');
            } catch (error) {
                mostrarEstadoTaxPopeyes(error.message, 'error');

                if (window.Swal) {
                    Swal.fire('Revisa la tienda', error.message, 'warning');
                }
            }
        });

    document
        .getElementById('pyTaxClearStore')
        ?.addEventListener('click', () => {
            limpiarFormularioTiendaTaxPopeyes();
            document
                .getElementById('popeyesTaxStoreDialog')
                ?.classList.remove('is-form-open');
            mostrarEstadoTaxPopeyes('Edicion cancelada.');
        });

    document
        .getElementById('pyTaxRefreshRates')
        ?.addEventListener('click', () => {
            refrescarTaxRatesPopeyes();
        });

    document
        .getElementById('pyTaxResetStores')
        ?.addEventListener('click', async () => {
            const confirmar = !window.Swal || (await Swal.fire({
                icon: 'warning',
                title: 'Restaurar tiendas Popeyes',
                text: 'Se borraran los cambios guardados localmente y volvera el catalogo inicial.',
                showCancelButton: true,
                confirmButtonText: 'Restaurar',
                cancelButtonText: 'Cancelar'
            })).isConfirmed;

            if (!confirmar) return;

            localStorage.removeItem(POPEYES_TAX_STORE_STORAGE_KEY);
            renderTiendasTaxPopeyes();
            recalcularTaxReviewPopeyesSiAplica();
            limpiarFormularioTiendaTaxPopeyes();
            document
                .getElementById('popeyesTaxStoreDialog')
                ?.classList.remove('is-form-open');
            mostrarEstadoTaxPopeyes('Catalogo inicial restaurado.', 'success');
        });

    document
        .getElementById('pyTaxStoreBody')
        ?.addEventListener('click', event => {
            const editButton = event.target.closest('[data-py-tax-edit]');
            const deleteButton = event.target.closest('[data-py-tax-delete]');

            if (editButton) {
                cargarFormularioTiendaTaxPopeyes(
                    editButton.dataset.pyTaxEdit
                );
                document
                    .getElementById('popeyesTaxStoreDialog')
                    ?.classList.add('is-form-open');
                mostrarEstadoTaxPopeyes('Editando tienda seleccionada.');
                document.getElementById('pyTaxStoreNumber')?.focus();
            }

            if (deleteButton) {
                const store = deleteButton.dataset.pyTaxDelete;
                eliminarTiendaTaxPopeyes(store);
                renderTiendasTaxPopeyes();
                recalcularTaxReviewPopeyesSiAplica();
                mostrarEstadoTaxPopeyes(`Tienda ${store} eliminada.`, 'success');
            }
        });

    actualizarPanelTaxPopeyes();
}

document.addEventListener(
    'DOMContentLoaded',
    inicializarPanelTaxRatesPopeyes
);

function fechaClavePopeyes(valor) {

    if (!valor) return '';

    if (typeof normalizarFecha === 'function') {
        return normalizarFecha(valor);
    }

    if (typeof valor === 'number') {
        const epoch = new Date(Date.UTC(1899, 11, 30));
        const date = new Date(epoch.getTime() + valor * 86400000);
        return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
    }

    const date =
        valor instanceof Date
            ? valor
            : new Date(valor);

    if (isNaN(date)) return '';

    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

function obtenerHojaPopeyesPOS() {

    if (!salesWorkbook) return null;

    return (
        obtenerHojaPorNombre(
            salesWorkbook,
            [
                'Sales  POS',
                'Sales POS'
            ]
        ) ||
        salesWorkbook.Sheets[
        detectarHojaOrigen(salesWorkbook)
        ]
    );
}

function obtenerSalesPosRowsPopeyes() {

    const hoja =
        obtenerHojaPopeyesPOS();

    if (!hoja) {
        return salesRows || [];
    }

    return leerFilasExcel(
        hoja,
        [
            'Accounting Date',
            'Unit Number',
            'Account'
        ],
        ''
    );
}

function obtenerStoreDatesDesdeWorkbookPopeyes(salesPosRows) {

    const hoja =
        obtenerHojaPorNombre(
            salesWorkbook,
            ['StoreDates']
        );

    if (!hoja) return [];

    const matrix =
        XLSX.utils.sheet_to_json(
            hoja,
            {
                header: 1,
                defval: ''
            }
        );

    const tiendas =
        matrix
            .slice(1)
            .map(row => Number(row[0]) || 0)
            .filter(Boolean);

    if (!tiendas.length) return [];

    let fechas =
        matrix
            .slice(1)
            .map(row => fechaClavePopeyes(row[2]))
            .filter(Boolean);

    fechas =
        [...new Set(fechas)];

    if (!fechas.length) {
        fechas = [
            ...new Set(
                salesPosRows
                    .map(row =>
                        fechaClavePopeyes(
                            row['Accounting Date']
                        )
                    )
                    .filter(Boolean)
            )
        ];
    }

    const nombresPorTienda =
        new Map();

    salesPosRows.forEach(row => {
        const store =
            Number(row['Unit Number']) || 0;
        if (store && !nombresPorTienda.has(store)) {
            nombresPorTienda.set(
                store,
                row['Unit Name'] || ''
            );
        }
    });

    const storeDates = [];

    tiendas.forEach(store => {
        fechas.forEach(date => {
            storeDates.push({
                store,
                unitName:
                    nombresPorTienda.get(store) || '',
                date,
                formattedDate: date
            });
        });
    });

    return storeDates;
}

function generarStoreDatesPopeyes(salesPosRows) {

    const desdeWorkbook =
        obtenerStoreDatesDesdeWorkbookPopeyes(
            salesPosRows
        );

    if (desdeWorkbook.length) {
        return desdeWorkbook;
    }

    const combinaciones =
        new Map();

    salesPosRows.forEach(row => {

        const store =
            Number(row['Unit Number']) || 0;

        const date =
            fechaClavePopeyes(
                row['Accounting Date']
            );

        if (!store || !date) return;

        const key =
            `${store}|${date}`;

        if (!combinaciones.has(key)) {
            combinaciones.set(
                key,
                {
                    store,
                    unitName:
                        row['Unit Name'] || '',
                    date,
                    formattedDate: date
                }
            );
        }

    });

    return [
        ...combinaciones.values()
    ].sort((a, b) =>
        Number(a.store) - Number(b.store)
    );
}

function sumaCuentaPopeyes(
    rows,
    store,
    date,
    accounts,
    field
) {

    const accountList =
        Array.isArray(accounts)
            ? accounts
            : [accounts];

    return rows
        .filter(row =>
            Number(row['Unit Number']) === Number(store) &&
            fechaClavePopeyes(row['Accounting Date']) === date &&
            accountList.includes(row.Account)
        )
        .reduce(
            (sum, row) =>
                sum + numeroPopeyes(row[field]),
            0
        );
}

function debitPopeyes(rows, store, date, accounts) {
    return sumaCuentaPopeyes(
        rows,
        store,
        date,
        accounts,
        'Debit Amount'
    );
}

function creditPopeyes(rows, store, date, accounts) {
    return sumaCuentaPopeyes(
        rows,
        store,
        date,
        accounts,
        'Credit Amount'
    );
}

function generarSalesPopeyes(
    salesPosRows,
    storeDates
) {

    return storeDates.map(
        ({ store, unitName, date, formattedDate }) => {

            const sourceFood =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Net Sales - Food'
                );

            const sourceBeverages =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Net Sales - Beverages'
                );

            const sourceOther =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Net Sales - Other'
                );

            const serviceFee =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Service Fees Negative Offset'
                );

            const deliveryFee =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Delivery Fees Net'
                );

            const deliveryTips =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Delivery Tips '
                );

            const wlTips =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    POPEYES_WL_TIP_ACCOUNTS
                );

            const salesTax =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Sales Tax Payable'
                );

            const taxExemptSales =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Tax Exempt Sales'
                );

            const caCrv =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'CA CRV'
                );

            const discountsPromo =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - $ Off Promo'
                ) +
                (
                    POPEYES_PROMO_OTHER_STORES.has(
                        Number(store)
                    )
                        ? creditPopeyes(
                            salesPosRows,
                            store,
                            date,
                            'Promotions - Other'
                        )
                        : 0
                );

            const discountEmployee =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Employee'
                );

            const discountGuestRecovery =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Guest Recovery'
                );

            const discountManager =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Manager'
                );

            const discountMilitary =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Military'
                );

            const discountPolice =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Police'
                );

            const discountSenior =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Senior Citizens'
                );

            const discountsOther =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Other'
                );

            const discountOpenDollar =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Open $'
                );

            const discountOpenPercent =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Open %'
                );

            const discount10 =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - 10%'
                );

            const discounts =
                discountEmployee +
                discountGuestRecovery +
                discountManager +
                discountMilitary +
                discountPolice +
                discountSenior +
                discountsOther +
                discountOpenDollar +
                discountOpenPercent +
                discount10;

            const totalDiscounts =
                discountsPromo +
                discounts;

            const amex =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    POPEYES_AMEX_ACCOUNTS
                );

            const amexPrpd =
                0;

            const amexKiosk =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Kiosk Amex'
                );

            const totalCC =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    POPEYES_CC_ACCOUNTS
                );

            const doorDash =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Door Dash'
                );

            const grubHub =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Grub Hub'
                );

            const uberEats =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    [
                        'Payments - Postmates',
                        'Payments - Uber Eats'
                    ]
                );

            const postmates =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Door Dash Shortage'
                );

            const taxUberEats =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Uber Eats'
                );

            const doorDashShortage =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Door Dash Shortage'
                );

            const uberShortage =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Uber Shortage'
                );

            const ebt =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Payments - EBT'
                );

            const giftCardRedeemed =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    [
                        'Payments - GC Redeemed',
                        'Payments - Gift Card'
                    ]
                );

            const giftCardSold =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Revenues - Gift Card Sales'
                );

            const onlineCatering =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Online Catering'
                );

            const ezCater =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Payments - EZ Cater'
                );

            const kiosk =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    POPEYES_KIOSK_ACCOUNTS
                );

            const cashDeposit =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    [
                        'AM Deposit',
                        'Cash Deposit'
                    ]
                );

            const cashHandlingDebit =
                creditPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Cash Handling - Over/Short'
                );

            const cashHandlingCredit =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Cash Handling - Over/Short'
                );

            const paidOutSmallwares =
                -debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Paid Out - Smallwares'
                );

            const paidOutCleaning =
                -debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Paid Out - Cleaning Supplies'
                );

            const paidOutOffice =
                -debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Paid Out - Office Supplies'
                );

            const paidOutFood =
                -debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Paid Out - Food'
                );

            const paidOutCashOut =
                -debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Paid Out - Cash Out'
                );

            const paidOut =
                paidOutSmallwares +
                paidOutCleaning +
                paidOutOffice +
                paidOutFood +
                paidOutCashOut;

            const donations =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Donations'
                );

            const nonRedeemable =
                debitPopeyes(
                    salesPosRows,
                    store,
                    date,
                    'Non-Redeemable Tender'
                );

            return {
                store,
                unitName,
                date: formattedDate,
                sourceFood: redondearPopeyes(sourceFood),
                sourceBeverages: redondearPopeyes(sourceBeverages),
                sourceOther: redondearPopeyes(sourceOther),
                food: redondearPopeyes(sourceFood),
                beverages: redondearPopeyes(sourceBeverages),
                other: redondearPopeyes(sourceOther),
                serviceFee: redondearPopeyes(serviceFee),
                salesOther: redondearPopeyes(sourceOther + serviceFee),
                deliveryFee: redondearPopeyes(deliveryFee),
                deliveryTips: redondearPopeyes(deliveryTips),
                wlTips: redondearPopeyes(wlTips),
                totalTips: redondearPopeyes(wlTips),
                discounts: redondearPopeyes(discounts),
                discountsPromo: redondearPopeyes(discountsPromo),
                discountEmployee: redondearPopeyes(discountEmployee),
                discountGuestRecovery: redondearPopeyes(discountGuestRecovery),
                discountManager: redondearPopeyes(discountManager),
                discountMilitary: redondearPopeyes(discountMilitary),
                discountPolice: redondearPopeyes(discountPolice),
                discountSenior: redondearPopeyes(discountSenior),
                discountsOther: redondearPopeyes(discountsOther),
                discountOpenDollar: redondearPopeyes(discountOpenDollar),
                discountOpenPercent: redondearPopeyes(discountOpenPercent),
                discount10: redondearPopeyes(discount10),
                totalDiscounts: redondearPopeyes(totalDiscounts),
                netSales: redondearPopeyes(sourceFood + sourceBeverages),
                salesTax: redondearPopeyes(salesTax),
                taxExemptSales: redondearPopeyes(taxExemptSales),
                caCrv: redondearPopeyes(caCrv),
                gcSold: redondearPopeyes(giftCardSold),
                paidOut: redondearPopeyes(paidOut),
                donations: redondearPopeyes(donations),
                nonRedeemable: redondearPopeyes(nonRedeemable),
                amex: redondearPopeyes(amex),
                amexPrpd: redondearPopeyes(amexPrpd),
                amexKiosk: redondearPopeyes(amexKiosk),
                totalCC: redondearPopeyes(totalCC),
                doorDash: redondearPopeyes(doorDash),
                grubHub: redondearPopeyes(grubHub),
                uberEats: redondearPopeyes(uberEats),
                taxUberEats: redondearPopeyes(taxUberEats),
                doorDashShortage: redondearPopeyes(doorDashShortage),
                uberShortage: redondearPopeyes(uberShortage),
                postmates: redondearPopeyes(postmates),
                ebt: redondearPopeyes(ebt),
                kiosk: redondearPopeyes(kiosk),
                giftCardRedeemed: redondearPopeyes(giftCardRedeemed),
                onlineCatering: redondearPopeyes(onlineCatering),
                ezCater: redondearPopeyes(ezCater),
                paidOutSmallwares: redondearPopeyes(paidOutSmallwares),
                paidOutCleaning: redondearPopeyes(paidOutCleaning),
                paidOutOffice: redondearPopeyes(paidOutOffice),
                paidOutFood: redondearPopeyes(paidOutFood),
                paidOutCashOut: redondearPopeyes(paidOutCashOut),
                cashDeposit: redondearPopeyes(cashDeposit),
                cashHandlingDebit: redondearPopeyes(cashHandlingDebit),
                cashHandlingCredit: redondearPopeyes(cashHandlingCredit)
            };
        }
    );
}

function generarConciliationPopeyes(salesData) {

    return salesData.map(row => {

        const food =
            row.sourceFood +
            row.discounts +
            row.discountsPromo;

        const netSales =
            food +
            row.beverages;

        const delTotals =
            row.doorDash +
            row.grubHub +
            row.uberEats +
            row.postmates;

        const totalRevenue =
            food +
            row.beverages +
            row.other +
            row.deliveryFee +
            row.wlTips +
            row.salesTax +
            row.caCrv +
            row.gcSold +
            row.donations +
            row.nonRedeemable -
            row.discounts -
            row.discountsPromo;

        const cashExpected =
            row.other +
            row.deliveryFee +
            netSales +
            row.salesTax +
            row.caCrv +
            row.gcSold +
            row.donations +
            row.nonRedeemable +
            row.wlTips -
            (
                row.discounts +
                row.discountsPromo +
                row.amex +
                row.amexPrpd +
                row.amexKiosk +
                row.totalCC +
                row.doorDash +
                row.grubHub +
                row.uberEats +
                row.doorDashShortage +
                row.uberShortage +
                row.ebt +
                row.kiosk +
                row.giftCardRedeemed +
                row.onlineCatering +
                row.ezCater +
                row.paidOutSmallwares +
                row.paidOutCleaning +
                row.paidOutOffice +
                row.paidOutFood +
                row.paidOutCashOut
            );

        const paymentsTotal =
            row.amex +
            row.amexPrpd +
            row.amexKiosk +
            row.totalCC +
            row.doorDash +
            row.grubHub +
            row.uberEats +
            row.doorDashShortage +
            row.uberShortage +
            row.ebt +
            row.kiosk +
            row.giftCardRedeemed +
            row.onlineCatering +
            row.ezCater +
            row.paidOutSmallwares +
            row.paidOutCleaning +
            row.paidOutOffice +
            row.paidOutFood +
            row.paidOutCashOut +
            cashExpected;

        const overShort =
            totalRevenue - paymentsTotal;

        const difference =
            cashExpected -
            (
                row.cashDeposit +
                row.cashHandlingDebit -
                row.cashHandlingCredit
            );

        return {
            ...row,
            food: redondearPopeyes(food),
            netSales: redondearPopeyes(netSales),
            amexExpectedDeposit:
                redondearPopeyes(
                    row.amex +
                    row.amexPrpd +
                    row.amexKiosk
                ),
            delTotals: redondearPopeyes(delTotals),
            totalRevenue: redondearPopeyes(totalRevenue),
            paymentsTotal: redondearPopeyes(paymentsTotal),
            overShort: redondearPopeyes(overShort),
            os: redondearPopeyes(overShort),
            cashDepositCalculated: redondearPopeyes(cashExpected),
            cashExpected: redondearPopeyes(cashExpected),
            difference: redondearPopeyes(difference)
        };

    });
}

function generarTaxReviewPopeyes(conciliationData) {

    popeyesTaxReviewData =
        conciliationData.map(row => {

            const taxRate =
                obtenerTaxRateLocalPopeyes(row.store);

            const taxableSales =
                row.sourceFood +
                row.sourceBeverages +
                row.sourceOther -
                row.discount10 -
                row.taxUberEats -
                row.ebt;

            const taxCalculation =
                taxableSales * taxRate;

            const salesTaxPayable =
                row.salesTax;

            const rateCalculation =
                taxableSales !== 0
                    ? salesTaxPayable / taxableSales
                    : 0;

            return {
                'Store no.': row.store,
                June: formatoPorcentajePopeyes(taxRate),
                'Net Sales - Food': row.sourceFood,
                'Net Sales - Beverages': row.sourceBeverages,
                'Net Sales - Other': row.sourceOther,
                'Discounts/Promot': row.discount10,
                'Payments - Uber Eats': row.taxUberEats,
                'Payments - EBT': row.ebt,
                'TAXABLE SALES': redondearPopeyes(taxableSales),
                'TAX CALCULATION': redondearPopeyes(taxCalculation),
                'Sales Tax Payable': salesTaxPayable,
                DIFFERRENCE: redondearPopeyes(taxCalculation - salesTaxPayable),
                'RATE CALCULATION': formatoPorcentajePopeyes(rateCalculation),
                DIFFERENCE: formatoPorcentajePopeyes(taxRate - rateCalculation)
            };

        });

    taxReviewData = popeyesTaxReviewData;
}

function agregarLineaPopeyes(
    data,
    row,
    memo,
    deptId,
    acctNo,
    debit,
    credit
) {

    data.push({
        journal: 'SJ',
        date: row.date,
        description: POPEYES_DESCRIPTION,
        memo,
        deptId: deptId || '',
        acctNo,
        locationId: row.store,
        debit: redondearPopeyes(debit),
        credit: redondearPopeyes(credit)
    });
}

function obtenerDeptPopeyes(memo) {

    if (
        [
            'Amex Expected Deposit',
            'Kiosk Expected Payment',
            'CC Expected Deposit'
        ].some(texto => memo.includes(texto))
    ) {
        return 'CC';
    }

    if (
        [
            'Cash Expected Deposit',
            'Non-Redeemable Tender',
            'O/S DC Discrepancies',
            'POS Over/Short',
            'Diff Between'
        ].some(texto => memo.includes(texto))
    ) {
        return 'CASH';
    }

    if (memo.includes('GrubHub')) {
        return 'GHD';
    }

    if (memo.includes('Uber')) {
        return 'UBD';
    }

    if (memo.includes('DoorDash')) {
        return 'DDD';
    }

    return '';
}

function generarDailySalesPopeyes(conciliationData) {

    const redData = [];

    conciliationData.forEach(row => {

        POPEYES_DAILY_SALES_LINES.forEach(line => {

            const amount =
                line.field
                    ? row[line.field] || 0
                    : 0;

            agregarLineaPopeyes(
                redData,
                row,
                line.memo,
                obtenerDeptPopeyes(line.memo),
                line.acctNo,
                line.type === 'debit'
                    ? amount
                    : 0,
                line.type === 'credit'
                    ? amount
                    : 0
            );

        });

    });

    popeyesDailySalesRedData =
        redData;

    popeyesDailySales0404Data =
        redData
            .filter(row =>
                row.debit !== 0 ||
                row.credit !== 0
            )
            .map((row, index) => ({
                lineNo: index + 1,
                journal: row.journal,
                date: row.date,
                description: row.description,
                memo: row.memo,
                deptId: row.deptId,
                acctNo: row.acctNo,
                locationId: row.locationId,
                debit: row.debit || '',
                credit: row.credit || ''
            }));

    dailySalesREDData =
        popeyesDailySalesRedData;

    dailySales0314Data =
        popeyesDailySales0404Data;
}

function procesarPopeyes() {

    try {

        const salesPosRows =
            obtenerSalesPosRowsPopeyes();

        if (!salesPosRows.length) {
            Swal.fire(
                'Error',
                'No hay datos Sales POS cargados',
                'error'
            );
            return false;
        }

        salesRows = salesPosRows;

        let storeDates =
            generarStoreDatesPopeyes(
                salesPosRows
            );

        if (fechaSalesSeleccionada) {
            const fechaSeleccionada =
                fechaClavePopeyes(
                    fechaSalesSeleccionada
                );

            storeDates =
                storeDates.filter(row =>
                    fechaClavePopeyes(row.date) ===
                    fechaSeleccionada
                );
        }

        if (!storeDates.length) {
            Swal.fire(
                'Error',
                'No se encontraron tiendas/fechas para Popeyes',
                'error'
            );
            return false;
        }

        const salesData =
            generarSalesPopeyes(
                salesPosRows,
                storeDates
            );

        popeyesConciliationData =
            generarConciliationPopeyes(
                salesData
            );

        datosExtraidos =
            popeyesConciliationData;

        fechaConciliacionActual =
            popeyesConciliationData[0]?.date || null;

        generarTaxReviewPopeyes(
            popeyesConciliationData
        );

        generarDailySalesPopeyes(
            popeyesConciliationData
        );

        const resultsSection =
            document.getElementById(
                'resultsSection'
            );

        if (resultsSection) {
            resultsSection.style.display = 'block';
        }

        llenarFiltroTiendas();
        actualizarResumen();
        actualizarTotales();
        renderActiveTab();

        return true;

    } catch (error) {

        console.error(error);

        Swal.fire(
            'Error',
            error.message,
            'error'
        );

        return false;

    }
}

function renderConciliation() {
    renderArrayToMainTable(
        popeyesConciliationData,
        currentRestaurantConfig?.conciliationColumns ||
        currentRestaurantConfig?.tableColumns ||
        [],
        true
    );
}

function renderConciliationPopeyes() {
    renderConciliation();
}

function renderTaxReview() {

    const codigo =
        document
            .getElementById('selectRestaurante')
            ?.selectedOptions?.[0]
            ?.dataset?.codigo;

    if (
        codigo !== 'popeyes'
    ) {
        if (
            typeof renderTacoBellTaxReview === 'function'
        ) {
            renderTacoBellTaxReview();
            return;
        }

        if (renderTaxReviewTacoBellLegacy) {
            renderTaxReviewTacoBellLegacy();
        }

        return;
    }

    renderArrayToMainTable(
        popeyesTaxReviewData
    );
}

function renderDailySalesRed() {
    renderArrayToMainTable(
        popeyesDailySalesRedData
    );
}

function renderDailySales0404() {
    renderArrayToMainTable(
        popeyesDailySales0404Data
    );
}

function renderArrayToMainTable(
    data,
    columnConfig = null,
    aplicarFiltros = false
) {

    const head =
        document.getElementById(
            'conciliacionTableHead'
        );

    const body =
        document.getElementById(
            'conciliacionBody'
        );

    if (!head || !body) return;

    head.innerHTML = '';
    body.innerHTML = '';

    if (!data?.length) return;

    const columns =
        columnConfig?.length
            ? columnConfig
            : Object.keys(data[0]).map(key => ({
                key,
                label: key
            }));

    const rows =
        aplicarFiltros
            ? data.filter(row => {

                const nombre =
                    String(
                        row.unitName ||
                        row.storeName ||
                        ''
                    ).toLowerCase();

                const cumpleStore =
                    !filtroStore ||
                    String(row.store) === String(filtroStore);

                const cumpleNombre =
                    !filtroStoreName ||
                    nombre.includes(filtroStoreName);

                return cumpleStore && cumpleNombre;

            })
            : data;

    const trHead =
        document.createElement('tr');

    columns.forEach(col => {
        const th =
            document.createElement('th');
        th.textContent =
            col.label ?? col.key ?? '';

        if (
            typeof esColumnaOS === 'function' &&
            esColumnaOS(col)
        ) {
            th.classList.add('os-column-header');
        }

        trHead.appendChild(th);
    });

    head.appendChild(trHead);

    rows.forEach(row => {

        const tr =
            document.createElement('tr');

        columns.forEach(col => {
            const td =
                document.createElement('td');

            const valor =
                row[col.key];
            const columnaOS =
                typeof esColumnaOS === 'function' &&
                esColumnaOS(col);
            const valorNumericoOS = Number(valor);

            if (typeof valor === 'number') {

                td.textContent =
                    valor.toLocaleString(
                        'en-US',
                        {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }
                    );

                td.classList.add('text-right');

            } else {

                td.textContent =
                    valor ?? '';

            }

            if (
                columnaOS &&
                Number.isFinite(valorNumericoOS)
            ) {
                const tieneDiferencia =
                    typeof esDiferenciaOSValor === 'function'
                        ? esDiferenciaOSValor(valorNumericoOS)
                        : Math.abs(valorNumericoOS) > 0.005;

                td.classList.add(
                    tieneDiferencia
                        ? 'os-difference'
                        : 'os-balanced'
                );

                if (tieneDiferencia) {
                    td.title = 'Diferencia O/S detectada';
                    tr.classList.add('os-row-difference');
                    tr.title = 'Esta tienda tiene una diferencia en O/S';
                }
            }

            tr.appendChild(td);
        });

        body.appendChild(tr);

    });
}
