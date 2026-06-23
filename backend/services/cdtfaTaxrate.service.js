const API_BASE_URL = 'https://services.maps.cdtfa.ca.gov/api/taxrate';
const TIMEOUT_MS = 10000;

const STORE_JURISDICTION_OVERRIDES = {
    13538: 'HERCULES',
    1549: 'FRESNO',
    2152: 'UNINCORPORATED AREA-ALAMEDA',
};

function normalizeRate(rate) {
    if (rate === null || rate === undefined) return null;

    const num = Number(String(rate).replace('%', '').trim());

    if (Number.isNaN(num)) return null;

    // Si viene como 8.875, lo convierte a 0.08875
    // Si ya viene como 0.08875, lo deja igual
    return num > 1 ? num / 100 : num;
}

async function fetchTaxRateByCoordinates(
    latitude,
    longitude,
    storeNumber = null,
    preferredJurisdiction = ''
) {
    if (!latitude || !longitude) {
        return {
            success: false,
            error: 'Missing latitude or longitude',
        };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const url =
            `${API_BASE_URL}/GetRateByLngLat` +
            `?Latitude=${encodeURIComponent(latitude)}` +
            `&Longitude=${encodeURIComponent(longitude)}`;

        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            return {
                success: false,
                error: `CDTFA API error ${response.status}`,
                api_response: data,
            };
        }

        const taxRateInfo = Array.isArray(data?.taxRateInfo)
            ? data.taxRateInfo
            : [];

        if (taxRateInfo.length === 0) {
            return {
                success: false,
                error: 'No tax rate found for location',
                api_response: data,
            };
        }

        let selectedRate = taxRateInfo[0];

        if (storeNumber && taxRateInfo.length > 1) {
            const jurisdictionOverride =
                String(
                    preferredJurisdiction ||
                    STORE_JURISDICTION_OVERRIDES[Number(storeNumber)] ||
                    ''
                ).trim();

            if (jurisdictionOverride) {
                const match = taxRateInfo.find((item) => {
                    return String(item.jurisdiction || '').toUpperCase() ===
                        jurisdictionOverride.toUpperCase();
                });

                if (match) {
                    selectedRate = match;
                }
            }
        }

        const rateDecimal = normalizeRate(selectedRate.rate);

        return {
            success: true,
            store_number: storeNumber,
            rate_decimal: rateDecimal,
            rate_percent: rateDecimal !== null ? rateDecimal * 100 : null,
            jurisdiction: selectedRate.jurisdiction || null,
            city: selectedRate.city || null,
            county: selectedRate.county || null,
            tac: selectedRate.tac || null,
            match_count: taxRateInfo.length,
            buffer_distance: data?.geocodeInfo?.bufferDistance || null,
            api_response: data,
        };
    } catch (error) {
        return {
            success: false,
            error: error.name === 'AbortError'
                ? 'Request timeout'
                : error.message,
        };
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = {
    fetchTaxRateByCoordinates,
};
