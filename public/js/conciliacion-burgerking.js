// conciliacion-burgerking.js

let burgerKingConciliationData = [];
let burgerKingTaxAnalysisData = [];
let burgerKingDiscrepanciesData = [];
let burgerKingTemplateCsvData = [];

const BK_DESCRIPTION = 'POS Data Upload DC Central';

const BK_STORE_SUFFIX_MAP = {
    7238: '7238QR',
    7469: '7469Q',
    9878: '9878QR',
    21575: '21575GS'
};

const BK_SKIP_STORE_SUFFIXES = ['_H'];

const BK_EXCLUDED_OUTPUT_LOCATIONS = new Set([
    23829,
    28543
]);

const BK_WHITE_LABEL_ACCOUNTS = [
    'AMEX - White Label Total',
    'Diners - White Label Total',
    'Discover - White Label Total',
    'MC - White Label Total',
    'Visa - White Label Total',
    'Paypal - White Label'
];

const BK_APP_ACCOUNTS = [
    'BK App',
    'BK App-Paypal',
    'BK App-Venmo',
    'BK App-Google Pay',
    'BK App-JCB',
    'BK App-Apple Pay',
    'BK App-Credit',
    'BK App-Diners Club',
    'BK App-Cash App'
];

const BK_ACCOUNT_MAP = {
    'Food Sales - Gross': ['foodSales', 'debit'],
    'Revenue - Beverage Sales': ['bevSales', 'debit'],
    'Non-Food Sales': ['nonFood', 'debit'],
    'Surcharge (Delivery Fee)': ['surcharge', 'debit'],
    'BAG CHARGE': ['bagCharge', 'debit'],
    'White Label Tips Total': ['wlTips', 'debit'],
    'Taxes (POS)': ['salesTax', 'debit'],
    'Donations (posting)': ['donations', 'debit'],
    'Gift Card Sold': ['gcSold', 'debit'],
    'Paid Out - Petty Cash': ['paidOut', 'debit'],
    'Donation Discounts': ['donationDiscounts', 'credit'],

    'Discount - % Off': ['discPctOff', 'credit'],
    'Discount - $ Off': ['discDollarOff', 'credit'],
    'Discount - BOGO': ['discBogo', 'credit'],
    'Discount - Competitor Cpn': ['discCompetitor', 'credit'],
    'Discount - Employee': ['discEmployee', 'credit'],
    'Discount - Free Item': ['discFreeItem', 'credit'],
    'Discount - Friends/Family': ['discFriends', 'credit'],
    'Discount - Guest Recovery': ['discGuestRecovery', 'credit'],
    'Discount - Loyalty': ['discLoyalty', 'credit'],
    'Discount - Manager Meal': ['discManager', 'credit'],
    'Discount - Military': ['discMilitary', 'credit'],
    'Discount - Other': ['discOther', 'credit'],
    'Discount - Police': ['discPolice', 'credit'],
    'Discount - Senior': ['discSenior', 'credit'],
    'Discount - Vendor': ['discVendor', 'credit'],

    'AMEX': ['amex', 'credit'],
    'Visa': ['visa', 'credit'],
    'MC': ['mastercard', 'credit'],
    'Discover': ['discover', 'credit'],
    'EBT': ['ebt', 'credit'],
    'EBT - Cash': ['ebt', 'credit'],
    'EBT - Food Stamps': ['ebt', 'credit'],
    'Door Dash Pay': ['dd', 'credit'],
    'Grub Hub Pay': ['gh', 'credit'],
    'Uber Eats Pay': ['uber', 'credit'],
    'GC Redeem': ['gcRedeem', 'credit'],
    'BK App-Gift Card': ['gcRedeem', 'credit'],
    'Total Cash Deposit': ['cashDeposit', 'credit'],
    'Total Kiosk Payments': ['kiosk', 'credit'],
    'Total Instore Payments': ['instore', 'credit'],
    'PayPal': ['paypal', 'credit'],
    'Venmo': ['venmo', 'credit'],
    'Open Checks': ['openChecks', 'credit']
};

const BK_DISCOUNT_KEYS = [
    'discPctOff',
    'discDollarOff',
    'discBogo',
    'discCompetitor',
    'discEmployee',
    'discFreeItem',
    'discFriends',
    'discGuestRecovery',
    'discLoyalty',
    'discManager',
    'discMilitary',
    'discOther',
    'discPolice',
    'discSenior',
    'discVendor'
];

const BK_DAILY_SALES_LINES = [
    { memo: 'Sales Food', acctNo: 401000, field: 'foodSales', type: 'credit' },
    { memo: 'Sales Beverages', acctNo: 401000, field: 'bevSales', type: 'credit' },
    { memo: 'Non Sales Food', acctNo: 408000, field: 'nonFood', type: 'credit' },
    { memo: 'Surcharge - Delivery Fees', acctNo: 408000, field: 'surcharge', type: 'credit' },
    { memo: 'CA Bag Fees', acctNo: 408000, field: 'bagCharge', type: 'credit' },
    { memo: 'Sales Tax', acctNo: 241000, field: 'salesTax', type: 'credit' },
    { memo: 'Donations', acctNo: 236000, field: 'donations', type: 'credit' },
    { memo: 'White Label Tips', acctNo: 111500, field: 'wlTips', type: 'credit' },
    { memo: 'Gift Cards Sales', acctNo: 202900, field: 'gcSold', type: 'credit' },
    { memo: 'Paid Outs', acctNo: 116200, field: 'paidOut', type: 'credit' },

    { memo: 'Discounts & Promotions -Discount - % Off', acctNo: 421000, field: 'discPctOff', type: 'debit' },
    { memo: 'Discounts & Promotions -Discount - $ Off', acctNo: 421000, field: 'discDollarOff', type: 'debit' },
    { memo: 'Discounts & Promotions - Discount - BOGO', acctNo: 421000, field: 'discBogo', type: 'debit' },
    { memo: 'Discounts & Promotions - Competitor Cpn', acctNo: 442000, field: 'discCompetitor', type: 'debit' },
    { memo: 'Discounts & Promotions- Employee', acctNo: 442000, field: 'discEmployee', type: 'debit' },
    { memo: 'Discounts & Promotions - Free Item', acctNo: 421000, field: 'discFreeItem', type: 'debit' },
    { memo: 'Discounts & Promotions - Friends/Family', acctNo: 442000, field: 'discFriends', type: 'debit' },
    { memo: 'Discounts & Promotions - Guest Recovery', acctNo: 444000, field: 'discGuestRecovery', type: 'debit' },
    { memo: 'Discounts & Promotions - Loyalty', acctNo: 421000, field: 'discLoyalty', type: 'debit' },
    { memo: 'Discounts & Promotions - Manager Meal', acctNo: 442000, field: 'discManager', type: 'debit' },
    { memo: 'Discounts & Promotions - Military', acctNo: 442000, field: 'discMilitary', type: 'debit' },
    { memo: 'POS Over/Shorts Discount - Other', acctNo: 421000, field: 'discOther', type: 'debit' },
    { memo: 'Discounts & Promotions - Police', acctNo: 442000, field: 'discPolice', type: 'debit' },
    { memo: 'Discounts & Promotions - Senior', acctNo: 421000, field: 'discSenior', type: 'debit' },
    { memo: 'Discounts & Promotions - Vendor', acctNo: 442000, field: 'discVendor', type: 'debit' },

    { memo: 'Credit Card Expected', acctNo: 111500, field: 'ccTotals', type: 'debit' },
    { memo: 'Amex Expected Deposit', acctNo: 111500, field: 'amex', type: 'debit' },
    { memo: 'EBT Expected', acctNo: 111500, field: 'ebt', type: 'debit', deptId: 'EBT' },
    { memo: 'Gift Card Redeemed', acctNo: 202900, field: 'gcRedeem', type: 'debit' },
    { memo: 'Cash Expected Deposit', acctNo: 102000, field: 'cashExpected', type: 'debit' },
    { memo: 'DoorDash', acctNo: 113000, field: 'dd', type: 'debit', deptId: 'DDD' },
    { memo: 'GrubHub', acctNo: 115000, field: 'gh', type: 'debit', deptId: 'GHD' },
    { memo: 'Uber', acctNo: 116000, field: 'uber', type: 'debit', deptId: 'UBD' },
    { memo: 'Open Checks', acctNo: 676000, field: 'openChecks', type: 'debit', deptId: 'CASH' }
];

function numeroBurgerKing(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;
    if (typeof valor === 'number') return valor;

    const texto = String(valor)
        .replace(/[$,\s]/g, '')
        .trim();

    if (!texto) return 0;

    const negativo =
        texto.startsWith('(') &&
        texto.endsWith(')');

    const numero = Number(texto.replace(/[()]/g, ''));

    if (Number.isNaN(numero)) return 0;

    return negativo ? -numero : numero;
}

function redondearBurgerKing(valor) {
    const numero = Number(valor) || 0;
    if (Math.abs(numero) < 0.000001) return 0;
    return Number(numero.toFixed(2));
}

function formatearPorcentajeBurgerKing(valor) {
    const numero = Number(valor) || 0;

    if (Math.abs(numero) < 0.0000001) {
        return '0.000%';
    }

    return `${(numero * 100).toFixed(3)}%`;
}

function renderBurgerKingTaxAnalysis() {
    console.log('Renderizando Tax Review Burger King con porcentajes');

    const data =
        (burgerKingTaxAnalysisData || []).map(row => ({
            ...row,
            taxRate: formatearPorcentajeBurgerKing(row.taxRate),
            rateCalculation: formatearPorcentajeBurgerKing(row.rateCalculation),
            rateDifference: formatearPorcentajeBurgerKing(row.rateDifference)
        }));

    renderArrayToMainTable(data);
}

function fechaClaveBurgerKing(valor) {
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

function obtenerHojaBurgerKingPOS() {
    if (!salesWorkbook) return null;

    return (
        obtenerHojaPorNombre(
            salesWorkbook,
            [
                'Sales  POS',
                'Sales POS',
                'Portal Data',
                'Daily Sales',
                'Sales'
            ]
        ) ||
        salesWorkbook.Sheets[
        detectarHojaOrigen(salesWorkbook)
        ]
    );
}

function obtenerRowsBurgerKing() {
    const hoja = obtenerHojaBurgerKingPOS();

    if (!hoja) {
        return salesRows || [];
    }

    let matrix = XLSX.utils.sheet_to_json(hoja, {
        header: 1,
        defval: ''
    });

    if (
        matrix.length &&
        matrix[0].length === 1 &&
        typeof matrix[0][0] === 'string'
    ) {
        const separador =
            matrix[0][0].includes(';')
                ? ';'
                : ',';

        matrix = matrix.map(row => {
            const value = String(row[0] || '');
            return value
                .split(separador)
                .map(x => x.trim());
        });
    }

    const headerIndex = matrix.findIndex(row =>
        row.includes('Accounting Date') &&
        row.includes('Unit Number') &&
        row.includes('Account')
    );

    if (headerIndex === -1) {
        console.error('Headers Burger King no encontrados', matrix.slice(0, 10));

        Swal.fire(
            'Error',
            'No se encontraron las columnas Accounting Date, Unit Number y Account en el archivo Burger King.',
            'error'
        );

        return [];
    }

    const headers = matrix[headerIndex];

    return matrix
        .slice(headerIndex + 1)
        .filter(row => row.some(cell => cell !== ''))
        .map(row => {
            const obj = {};

            headers.forEach((header, index) => {
                obj[header] = row[index] ?? '';
            });

            return obj;
        });
}

function crearRegistroBurgerKing(store, unitName, date) {
    const taxStore = buscarTiendaTaxBurgerKing(store);

    const row = {
        store,
        unitName,
        date,
        taxStoreAddress: taxStore?.address || '',
        taxStoreCity: taxStore?.city || '',
        taxStoreZip: taxStore?.zip || '',
        latitude: taxStore?.latitude ?? null,
        longitude: taxStore?.longitude ?? null,

        foodSales: 0,
        bevSales: 0,
        nonFood: 0,
        coupons: 0,
        surcharge: 0,
        bagCharge: 0,
        wlTips: 0,
        salesTax: 0,
        donations: 0,
        gcSold: 0,
        paidOut: 0,
        donationDiscounts: 0,

        discPctOff: 0,
        discDollarOff: 0,
        discBogo: 0,
        discCompetitor: 0,
        discEmployee: 0,
        discFreeItem: 0,
        discFriends: 0,
        discGuestRecovery: 0,
        discLoyalty: 0,
        discManager: 0,
        discMilitary: 0,
        discOther: 0,
        discPolice: 0,
        discSenior: 0,
        discVendor: 0,

        amex: 0,
        visa: 0,
        mastercard: 0,
        discover: 0,
        ebt: 0,
        dd: 0,
        gh: 0,
        uber: 0,
        gcRedeem: 0,
        cashDeposit: 0,
        kiosk: 0,
        instore: 0,
        paypal: 0,
        venmo: 0,
        openChecks: 0,

        wlPayments: 0,
        bkApp: 0,

        cashOsCredit: 0,
        cashOsDebit: 0,

        discounts: 0,
        netSales: 0,
        totalRevenue: 0,
        ccTotals: 0,
        cashExpected: 0,
        paymentsTotal: 0,
        oS: 0,
        cashDifference: 0
    };

    return row;
}

async function generarConciliacionBurgerKing() {
    if (!salesWorkbook) {
        Swal.fire(
            'Error',
            'No hay archivo Sales cargado',
            'error'
        );
        return;
    }

    const rows = obtenerRowsBurgerKing();

    if (!rows.length) {
        Swal.fire(
            'Error',
            'No se encontraron filas válidas en el archivo Burger King',
            'error'
        );
        return;
    }

    cargarFechasEnFiltro(
        rows,
        'salesDateFilter',
        'Accounting Date'
    );

    const fechasValidas = rows
        .map(row => fechaClaveBurgerKing(row['Accounting Date']))
        .filter(Boolean);

    if (!fechasValidas.length) {
        Swal.fire(
            'Error',
            'No se encontraron fechas válidas',
            'error'
        );
        return;
    }

    const fechaMasReciente =
        [...new Set(fechasValidas)].sort((a, b) => {
            return new Date(a) - new Date(b);
        }).pop();

    const fechaFiltro =
        fechaSalesSeleccionada &&
            fechaSalesSeleccionada.trim() !== ''
            ? fechaSalesSeleccionada
            : fechaMasReciente;

    fechaConciliacionActual = fechaFiltro;

    const fechaInput =
        document.getElementById('fechaConciliacion');

    if (fechaInput && fechaFiltro) {
        const d = new Date(fechaFiltro);
        if (!isNaN(d)) {
            fechaInput.value =
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
    }

    const agrupado = new Map();

    rows.forEach(row => {
        const storeRaw =
            String(row['Unit Number'] || '').trim();

        if (!storeRaw) return;

        if (
            BK_SKIP_STORE_SUFFIXES.some(suffix =>
                storeRaw.endsWith(suffix)
            )
        ) {
            return;
        }

        const storeNumber =
            Number(String(storeRaw).replace(/\D/g, ''));

        if (!storeNumber) return;

        if (BK_EXCLUDED_OUTPUT_LOCATIONS.has(storeNumber)) {
            return;
        }

        const date =
            fechaClaveBurgerKing(
                row['Accounting Date']
            );

        if (
            !date ||
            normalizarFecha(date) !== normalizarFecha(fechaFiltro)
        ) {
            return;
        }

        const displayStore =
            BK_STORE_SUFFIX_MAP[storeNumber] || storeNumber;

        const key =
            `${displayStore}|${date}`;

        if (!agrupado.has(key)) {
            agrupado.set(
                key,
                crearRegistroBurgerKing(
                    displayStore,
                    row['Unit Name'] || '',
                    date
                )
            );
        }

        const actual =
            agrupado.get(key);

        const account =
            String(row.Account || '').trim();

        const debit =
            numeroBurgerKing(
                row['Debit Account'] ??
                row['Debit Amount'] ??
                row.Debit ??
                0
            );

        const credit =
            numeroBurgerKing(
                row['Credit Amount'] ??
                row.Credit ??
                0
            );

        if (BK_ACCOUNT_MAP[account]) {
            const [field, side] =
                BK_ACCOUNT_MAP[account];

            actual[field] +=
                side === 'debit'
                    ? debit
                    : credit;
        }

        if (BK_WHITE_LABEL_ACCOUNTS.includes(account)) {
            actual.wlPayments += credit;
        }

        if (BK_APP_ACCOUNTS.includes(account)) {
            actual.bkApp += credit;
        }

        if (account === 'Cash Over/Short') {
            actual.cashOsCredit += credit;
            actual.cashOsDebit += debit;
        }
    });

    datosExtraidos =
        [...agrupado.values()]
            .map(row => {
                row.discounts =
                    BK_DISCOUNT_KEYS.reduce(
                        (sum, key) =>
                            sum + numeroBurgerKing(row[key]),
                        0
                    );

                row.netSales =
                    row.foodSales +
                    row.bevSales +
                    row.nonFood -
                    row.coupons -
                    row.discounts;

                row.totalRevenue =
                    row.netSales +
                    row.salesTax +
                    row.gcSold +
                    row.paidOut +
                    row.donations +
                    row.coupons +
                    row.surcharge +
                    row.wlTips +
                    row.bagCharge;

                row.ccTotals =
                    row.visa +
                    row.mastercard +
                    row.discover +
                    row.wlPayments +
                    row.bkApp +
                    row.instore +
                    row.paypal +
                    row.venmo +
                    row.kiosk;

                row.cashExpected =
                    row.totalRevenue -
                    row.amex -
                    row.visa -
                    row.mastercard -
                    row.discover -
                    row.ebt -
                    row.dd -
                    row.gh -
                    row.uber -
                    row.wlPayments -
                    row.gcRedeem -
                    row.instore -
                    row.paypal -
                    row.venmo -
                    row.kiosk -
                    row.bkApp -
                    row.openChecks;

                row.paymentsTotal =
                    row.amex +
                    row.ebt +
                    row.dd +
                    row.gh +
                    row.uber +
                    row.gcRedeem +
                    row.cashExpected +
                    row.ccTotals;

                row.oS =
                    row.totalRevenue -
                    row.paymentsTotal;

                row.cashDifference =
                    row.cashExpected -
                    (row.cashDeposit + row.cashOsCredit) +
                    row.cashOsDebit;

                Object.keys(row).forEach(key => {
                    if (typeof row[key] === 'number') {
                        row[key] =
                            redondearBurgerKing(row[key]);
                    }
                });

                return row;
            })
            .sort(
                (a, b) =>
                    Number(a.store) - Number(b.store)
            );

    burgerKingConciliationData = datosExtraidos;

    await generarTaxAnalysisBurgerKing();
    generarDiscrepanciesBurgerKing();
    generarTemplateCsvBurgerKing();
    generarSummaryBurgerKing();

    document.getElementById('resultsSection').style.display = 'block';

    renderTablaSucursales();
    llenarFiltroTiendas();
    actualizarResumen();
    actualizarTotales();
    renderActiveTab();
}

const BK_TAX_RATE_DIRECT_API_BASE_URL = 'https://services.maps.cdtfa.ca.gov/api/taxrate';
const BK_TAX_STORE_STORAGE_KEY = 'burgerKingTaxStores.v1';
const BK_TAX_RATE_CACHE_STORAGE_KEY = 'burgerKingTaxRateCache.v1';
const BK_TAX_RATE_CACHE_DAYS = 30;
const BK_TAX_RATE_TIMEOUT_MS = 8000;

// Fallback local: se usa en la conciliación para no depender de CDTFA en tiempo real.
const BK_TAX_RATE_FALLBACK = {
    "975": 0.1,
    "1572": 0.1,
    "1650": 0.0925,
    "1932": 0.1,
    "2172": 0.0875,
    "2521": 0.0925,
    "3223": 0.0875,
    "3323": 0.09625,
    "3505": 0.0925,
    "3827": 0.1,
    "3917": 0.08875,
    "4516": 0.0925,
    "4660": 0.085,
    "5052": 0.0875,
    "5085": 0.0875,
    "5215": 0.1,
    "5270": 0.1,
    "5394": 0.0925,
    "5533": 0.0825,
    "5996": 0.0875,
    "6597": 0.0825,
    "7426": 0.1075,
    "7928": 0.0975,
    "8177": 0.0875,
    "8326": 0.1075,
    "9474": 0.0825,
    "9790": 0.0875,
    "10835": 0.0775,
    "11112": 0.0875,
    "13538": 0.0925,
    "16481": 0.085,
    "17709": 0.08,
    "24290": 0.0825,
    "27645": 0.0825
};

const BK_STORE_JURISDICTION_OVERRIDES = {
    13538: 'HERCULES',
    1549: 'FRESNO',
    2152: 'UNINCORPORATED AREA-ALAMEDA'
};

const BK_DEFAULT_TAX_STORES = [
    {
        "store": 14218,
        "address": "1260 Anderson Dr",
        "city": "Suisun City",
        "zip": "94585",
        "latitude": 38.24304339456985,
        "longitude": -122.01914387478905
    },
    {
        "store": 17484,
        "address": "2026 Lyndell Ter",
        "city": "Davis",
        "zip": "95616",
        "latitude": 38.56204947561865,
        "longitude": -121.76914204081186
    },
    {
        "store": 10341,
        "address": "115 Lincoln Blvd",
        "city": "Lincoln",
        "zip": "95648",
        "latitude": 38.88679516479344,
        "longitude": -121.29194166361312
    },
    {
        "store": 17592,
        "address": "8501 Gerber Rd",
        "city": "Sacramento",
        "zip": "95828",
        "latitude": 38.48209462795061,
        "longitude": -121.38970770073662
    },
    {
        "store": 3684,
        "address": "819 Van Ness Ave",
        "city": "San Francisco",
        "zip": "94019",
        "latitude": 37.78312073934847,
        "longitude": -122.42126353800325
    },
    {
        "store": 4525,
        "address": "1701 Fillmore Street",
        "city": "San Francisco",
        "zip": "94115",
        "latitude": 37.785293287819364,
        "longitude": -122.43331600324267
    },
    {
        "store": 2495,
        "address": "2200 Otis Dr",
        "city": "Alameda",
        "zip": "94501",
        "latitude": 37.75908395428167,
        "longitude": -122.25151822914648
    },
    {
        "store": 2838,
        "address": "190 Pittman Rd",
        "city": "Fairfield",
        "zip": "94534",
        "latitude": 38.221408988095476,
        "longitude": -122.12663565314476
    },
    {
        "store": 3217,
        "address": "1571 Fitzgerald Dr",
        "city": "Pinole",
        "zip": "94564",
        "latitude": 37.99187568443556,
        "longitude": -122.30200606792192
    },
    {
        "store": 15906,
        "address": "8338 Power Inn Rd",
        "city": "Elk Grove",
        "zip": "95624",
        "latitude": 38.45488358744773,
        "longitude": -121.40628096739015
    },
    {
        "store": 3917,
        "address": "1857 E Main St",
        "city": "Grass Valley",
        "zip": "95945",
        "latitude": 39.236007795834794,
        "longitude": -121.03867623691872,
        "taxRate": 0.08875
    },
    {
        "store": 9365,
        "address": "3900 Geary Blvd",
        "city": "San Francisco",
        "zip": "94118",
        "latitude": 37.781428399461376,
        "longitude": -122.46125552038944
    },
    {
        "store": 16250,
        "address": "5869 Antelope Rd",
        "city": "Sacramento",
        "zip": "95621",
        "latitude": 38.70581353513209,
        "longitude": -121.32770445161351
    },
    {
        "store": 1650,
        "address": "1090 Fremont Blvd",
        "city": "Seaside",
        "zip": "93955",
        "latitude": 36.59951513578071,
        "longitude": -121.849752964306,
        "taxRate": 0.0925
    },
    {
        "store": 1803,
        "address": "909 S Main St",
        "city": "Salinas",
        "zip": "93901",
        "latitude": 36.66374448463787,
        "longitude": -121.65707060301055
    },
    {
        "store": 2066,
        "address": "1302 Soquel Ave",
        "city": "Santa Cruz",
        "zip": "95062",
        "latitude": 36.980912642776474,
        "longitude": -122.00744804532705
    },
    {
        "store": 2738,
        "address": "2001 41st Ave",
        "city": "Capitola",
        "zip": "95010",
        "latitude": 36.97867380972384,
        "longitude": -121.96532788765577
    },
    {
        "store": 3179,
        "address": "1403 Freedom Blvd",
        "city": "Watsonville",
        "zip": "95076",
        "latitude": 36.926805178902036,
        "longitude": -121.76534807416482
    },
    {
        "store": 3323,
        "address": "2817 S El Camino Real",
        "city": "San Mateo",
        "zip": "94403",
        "latitude": 37.541873524237474,
        "longitude": -122.30200455136338,
        "taxRate": 0.09625
    },
    {
        "store": 3654,
        "address": "1375 N Main St",
        "city": "Salinas",
        "zip": "93906",
        "latitude": 36.705017073832806,
        "longitude": -121.65349757417346
    },
    {
        "store": 3866,
        "address": "227 Mt Hermon Rd",
        "city": "Scotts Valley",
        "zip": "95066",
        "latitude": 37.045166808842055,
        "longitude": -122.02771804532455
    },
    {
        "store": 4447,
        "address": "2015 Mission St",
        "city": "Santa Cruz",
        "zip": "95060",
        "latitude": 36.9627991722012,
        "longitude": -122.04336960299929
    },
    {
        "store": 5996,
        "address": "11290 Merritt St",
        "city": "Castroville",
        "zip": "95012",
        "latitude": 36.76184441701633,
        "longitude": -121.75334499946244,
        "taxRate": 0.0875
    },
    {
        "store": 6054,
        "address": "8093 San Miguel Cyn Rd",
        "city": "Prunedale",
        "zip": "93907",
        "latitude": 36.80052982575556,
        "longitude": -121.66453636105659
    },
    {
        "store": 6813,
        "address": "41 S Sanborn Rd",
        "city": "Salinas",
        "zip": "93905",
        "latitude": 36.67066524163442,
        "longitude": -121.62718665212155
    },
    {
        "store": 8563,
        "address": "1720 Airline Hwy",
        "city": "Hollister",
        "zip": "95023",
        "latitude": 36.83770311752816,
        "longitude": -121.39028769394935
    },
    {
        "store": 11063,
        "address": "142 Main St",
        "city": "Watsonville",
        "zip": "95076",
        "latitude": 36.90710135352721,
        "longitude": -121.75288366270787
    },
    {
        "store": 13730,
        "address": "131 Auto Center Dr",
        "city": "Salinas",
        "zip": "93907",
        "latitude": 36.72195580549517,
        "longitude": -121.66356401743622
    },
    {
        "store": 15058,
        "address": "2107 H Dela Rosa Sr St",
        "city": "Soledad",
        "zip": "93960",
        "latitude": 36.4174755354049,
        "longitude": -121.32034321450331
    },
    {
        "store": 16078,
        "address": "1589 N Sanborn Rd",
        "city": "Salinas",
        "zip": "93905",
        "latitude": 36.69584260830826,
        "longitude": -121.5969354245662
    },
    {
        "store": 24651,
        "address": "11900 Yosemite Dr",
        "city": "Waterford",
        "zip": "95386",
        "latitude": 37.6377343975478,
        "longitude": -120.77337278500212
    },
    {
        "store": 25081,
        "address": "2600 Reynolds Ranch Rd Suite 100",
        "city": "Lodi",
        "zip": "95240",
        "latitude": 38.100956330314965,
        "longitude": -121.26607274305307
    },
    {
        "store": 25944,
        "address": "1185 N St",
        "city": "Firebaugh",
        "zip": "93622",
        "latitude": 36.85751532773053,
        "longitude": -120.4564039195429
    },
    {
        "store": 1838,
        "address": "802 E Cypress Ave",
        "city": "Redding",
        "zip": "96002",
        "latitude": 40.571363075263974,
        "longitude": -122.35711940808316
    },
    {
        "store": 7238,
        "address": "410 W Lake St",
        "city": "Mt Shasta",
        "zip": "96067",
        "latitude": 41.31142478990046,
        "longitude": -122.31697152753092
    },
    {
        "store": 9878,
        "address": "1303 Main St",
        "city": "Weaverville",
        "zip": "96093",
        "latitude": 40.72115493188112,
        "longitude": -122.92830682977805
    },
    {
        "store": 15705,
        "address": "1830 E Main St",
        "city": "Woodland",
        "zip": "95776",
        "latitude": 38.676850607727715,
        "longitude": -121.73622219957878
    },
    {
        "store": 17709,
        "address": "251 W Main St",
        "city": "Woodland",
        "zip": "95695",
        "latitude": 38.67726916490655,
        "longitude": -121.79658747871355,
        "taxRate": 0.08
    },
    {
        "store": 975,
        "address": "175 W Calaveras Blvd",
        "city": "Milpitas",
        "zip": "95035",
        "latitude": 37.42888627891293,
        "longitude": -121.91037034989911,
        "taxRate": 0.1
    },
    {
        "store": 1450,
        "address": "4960 Auburn Blvd",
        "city": "Sacramento",
        "zip": "95841",
        "latitude": 38.659201208525516,
        "longitude": -121.34803630807447
    },
    {
        "store": 1473,
        "address": "1949 Columbus St",
        "city": "Bakersfield",
        "zip": "93305",
        "latitude": 35.3971240389013,
        "longitude": -118.97049376692382
    },
    {
        "store": 1549,
        "address": "2410 N Cedar",
        "city": "Fresno",
        "zip": "93703",
        "latitude": 36.772754803569484,
        "longitude": -119.75394447913553
    },
    {
        "store": 1782,
        "address": "7218 Stockton Blvd",
        "city": "Sacramento",
        "zip": "95828",
        "latitude": 38.49520624998012,
        "longitude": -121.42921289397636
    },
    {
        "store": 1841,
        "address": "1915 Arden Way",
        "city": "Sacramento",
        "zip": "95815",
        "latitude": 38.59807634941252,
        "longitude": -121.4212800124407
    },
    {
        "store": 1883,
        "address": "3101 S Mooney Blvd",
        "city": "Visalia",
        "zip": "93277",
        "latitude": 36.303138495718606,
        "longitude": -119.31426194852561
    },
    {
        "store": 1932,
        "address": "936 Blossom Hill Rd",
        "city": "San Jose",
        "zip": "95123",
        "latitude": 37.24996431926269,
        "longitude": -121.8635806227679,
        "taxRate": 0.1
    },
    {
        "store": 2012,
        "address": "49 W Hamilton Ave",
        "city": "Campbell",
        "zip": "95008",
        "latitude": 37.294617781833274,
        "longitude": -121.9505463665899
    },
    {
        "store": 2172,
        "address": "2881 Zinfandel Dr",
        "city": "Rancho Cordova",
        "zip": "95670",
        "latitude": 38.59447918009961,
        "longitude": -121.28764595370112,
        "taxRate": 0.0875
    },
    {
        "store": 2268,
        "address": "619 W Charter Way",
        "city": "Stockton",
        "zip": "95206",
        "latitude": 37.93747244375145,
        "longitude": -121.29621308571781
    },
    {
        "store": 2333,
        "address": "1255 N Blackstone",
        "city": "Tulare",
        "zip": "93274",
        "latitude": 36.225026627799956,
        "longitude": -119.33554340816438
    },
    {
        "store": 2521,
        "address": "139 N China Lake Blvd",
        "city": "Ridgecrest",
        "zip": "93555",
        "latitude": 35.623766023012486,
        "longitude": -117.67033510664002,
        "taxRate": 0.0925
    },
    {
        "store": 2555,
        "address": "450 Leavesley Rd",
        "city": "Gilroy",
        "zip": "95020",
        "latitude": 37.021365692982855,
        "longitude": -121.56808532185292
    },
    {
        "store": 2795,
        "address": "5315 Hopyard Rd",
        "city": "Pleasanton",
        "zip": "94588",
        "latitude": 37.699602405464205,
        "longitude": -121.90460077306547
    },
    {
        "store": 2891,
        "address": "7201 Fair Oaks Blvd",
        "city": "Carmichael",
        "zip": "95608",
        "latitude": 38.632050632533804,
        "longitude": -121.32882801168769
    },
    {
        "store": 3160,
        "address": "4610 E Cesar Chavez Blvd",
        "city": "Fresno",
        "zip": "93702",
        "latitude": 36.73569065391205,
        "longitude": -119.74489465704822
    },
    {
        "store": 3223,
        "address": "5610 Freeport Blvd",
        "city": "Sacramento",
        "zip": "95822",
        "latitude": 38.523962744003484,
        "longitude": -121.49800801495078,
        "taxRate": 0.0875
    },
    {
        "store": 3421,
        "address": "3220 N Tracy Blvd",
        "city": "Tracy",
        "zip": "95376",
        "latitude": 37.7597917253882,
        "longitude": -121.4345906151726
    },
    {
        "store": 3459,
        "address": "11950 Hwy 88",
        "city": "Jackson",
        "zip": "95642",
        "latitude": 38.36257461781675,
        "longitude": -120.80292524918094
    },
    {
        "store": 3505,
        "address": "969 Francisco Blvd E",
        "city": "San Rafael",
        "zip": "94901",
        "latitude": 37.961268638687805,
        "longitude": -122.50528594057864,
        "taxRate": 0.0925
    },
    {
        "store": 3580,
        "address": "6125 Commerce Blvd",
        "city": "Rohnert Park",
        "zip": "94928",
        "latitude": 38.349949536953616,
        "longitude": -122.7102191655056
    },
    {
        "store": 3827,
        "address": "3098 Story Rd",
        "city": "San Jose",
        "zip": "95127",
        "latitude": 37.35572522021423,
        "longitude": -121.81919125298855,
        "taxRate": 0.1
    },
    {
        "store": 3890,
        "address": "616 W Kettleman Lane",
        "city": "Lodi",
        "zip": "95240",
        "latitude": 38.11502010603704,
        "longitude": -121.2818184562685
    },
    {
        "store": 4135,
        "address": "5150 Stockton Blvd",
        "city": "Sacramento",
        "zip": "95820",
        "latitude": 38.5278282382764,
        "longitude": -121.44450408286919
    },
    {
        "store": 4516,
        "address": "1799 N Broadway",
        "city": "Walnut Creek",
        "zip": "94596",
        "latitude": 37.90335564869796,
        "longitude": -122.06158425778575,
        "taxRate": 0.0925
    },
    {
        "store": 4660,
        "address": "500 South Demaree St",
        "city": "Visalia",
        "zip": "93277",
        "latitude": 36.326028469628746,
        "longitude": -119.33132990068258,
        "taxRate": 0.085
    },
    {
        "store": 4886,
        "address": "4571 N Pershing Ave",
        "city": "Stockton",
        "zip": "95207",
        "latitude": 37.98811186530796,
        "longitude": -121.32196399756278
    },
    {
        "store": 5052,
        "address": "8637 Elk Gove Blvd",
        "city": "Elk Grove",
        "zip": "95624",
        "latitude": 38.40942958590281,
        "longitude": -121.38417741168493,
        "taxRate": 0.0875
    },
    {
        "store": 5056,
        "address": "3601 Bradshaw Ave",
        "city": "Sacramento",
        "zip": "95827",
        "latitude": 38.55625011955499,
        "longitude": -121.33577483798834
    },
    {
        "store": 5085,
        "address": "7225 Greenhaven Dr",
        "city": "Sacramento",
        "zip": "95831",
        "latitude": 38.49469966890554,
        "longitude": -121.52338513177519,
        "taxRate": 0.0875
    },
    {
        "store": 5533,
        "address": "5600 Lk Isabella Blvd",
        "city": "Lake Isabella",
        "zip": "93240",
        "latitude": 35.6179038590283,
        "longitude": -118.47724759366359,
        "taxRate": 0.0825
    },
    {
        "store": 6342,
        "address": "8200 Stockdale Hwy L",
        "city": "Bakersfield",
        "zip": "93311",
        "latitude": 35.35466097715669,
        "longitude": -119.09349214612669
    },
    {
        "store": 6343,
        "address": "3405 Union Ave",
        "city": "Bakersfield",
        "zip": "93305",
        "latitude": 35.39084701531183,
        "longitude": -119.00342728915831
    },
    {
        "store": 6409,
        "address": "230 N Cherokee Lane",
        "city": "Lodi",
        "zip": "95240",
        "latitude": 38.13762426754319,
        "longitude": -121.26040898302053
    },
    {
        "store": 6597,
        "address": "2508 White Lane",
        "city": "Bakersfield",
        "zip": "93304",
        "latitude": 35.31802830283545,
        "longitude": -119.03082974769929,
        "taxRate": 0.0825
    },
    {
        "store": 7200,
        "address": "7990 White Lane Suite L",
        "city": "Bakersfield",
        "zip": "93309",
        "latitude": 35.31855819911877,
        "longitude": -119.09091433715076
    },
    {
        "store": 7410,
        "address": "5304 Old Redwood Hwy",
        "city": "Petaluma",
        "zip": "94954",
        "latitude": 38.275618989504004,
        "longitude": -122.66839186692616
    },
    {
        "store": 7628,
        "address": "18890 N Hwy 88",
        "city": "Lockeford",
        "zip": "95237",
        "latitude": 38.15558172555976,
        "longitude": -121.15477913636099
    },
    {
        "store": 7766,
        "address": "5020 Redwood Dr",
        "city": "Rohnert Park",
        "zip": "94928",
        "latitude": 38.36442183886449,
        "longitude": -122.71418896212217
    },
    {
        "store": 7928,
        "address": "830 E Dunne Ave",
        "city": "Morgan Hill",
        "zip": "95037",
        "latitude": 37.12903954035227,
        "longitude": -121.63741080491575,
        "taxRate": 0.0975
    },
    {
        "store": 8177,
        "address": "9181 E Stockton Blvd",
        "city": "Elk Grove",
        "zip": "95624",
        "latitude": 38.42505823190045,
        "longitude": -121.39047406549146,
        "taxRate": 0.0875
    },
    {
        "store": 8387,
        "address": "6921 Regional St",
        "city": "Dublin",
        "zip": "94568",
        "latitude": 37.70258859320704,
        "longitude": -121.93320091335853
    },
    {
        "store": 8936,
        "address": "1955 N St",
        "city": "Newman",
        "zip": "95360",
        "latitude": 37.30938507345362,
        "longitude": -121.01931056306213
    },
    {
        "store": 9049,
        "address": "200 CA-12",
        "city": "Valley Springs",
        "zip": "95252",
        "latitude": 38.19189146654194,
        "longitude": -120.82618822213112
    },
    {
        "store": 9126,
        "address": "8510 Gravenstein Hwy Ste B",
        "city": "Cotati",
        "zip": "94931",
        "latitude": 38.33101421302273,
        "longitude": -122.71462667529507
    },
    {
        "store": 9252,
        "address": "171 Iron Point Rd",
        "city": "Folsom",
        "zip": "95630",
        "latitude": 38.64298021885627,
        "longitude": -121.19038234018477
    },
    {
        "store": 9474,
        "address": "65 W Hanford-Armona",
        "city": "Lemoore",
        "zip": "93245",
        "latitude": 36.313153966348466,
        "longitude": -119.78177125497585,
        "taxRate": 0.0825
    },
    {
        "store": 9560,
        "address": "3482 W Shaw Ave",
        "city": "Fresno",
        "zip": "93711",
        "latitude": 36.80858120837598,
        "longitude": -119.85461378872604
    },
    {
        "store": 9961,
        "address": "2721 Winton Way",
        "city": "Atwater",
        "zip": "95301",
        "latitude": 37.36067423028909,
        "longitude": -120.61431455758235
    },
    {
        "store": 9963,
        "address": "157 Derrick Ave",
        "city": "Mendota",
        "zip": "93640",
        "latitude": 36.75998847595808,
        "longitude": -120.38616289679271
    },
    {
        "store": 10222,
        "address": "520 Walnut Ave",
        "city": "Greenfield",
        "zip": "93927",
        "latitude": 36.32896326777657,
        "longitude": -121.24526357292214
    },
    {
        "store": 10835,
        "address": "5121 Foothills Blvd",
        "city": "Roseville",
        "zip": "95678",
        "latitude": 38.76164602981694,
        "longitude": -121.30981081201996,
        "taxRate": 0.0775
    },
    {
        "store": 10836,
        "address": "13609 E Manning",
        "city": "Parlier",
        "zip": "93648",
        "latitude": 36.604580026075034,
        "longitude": -119.54756127472639
    },
    {
        "store": 11112,
        "address": "955 West Hermosa St",
        "city": "Lindsey",
        "zip": "93247",
        "latitude": 36.204049818837056,
        "longitude": -119.10438833163981,
        "taxRate": 0.0875
    },
    {
        "store": 11835,
        "address": "2890 W Grant Line Rd",
        "city": "Tracy",
        "zip": "95304",
        "latitude": 37.75364072409636,
        "longitude": -121.46884631600358
    },
    {
        "store": 16481,
        "address": "680 W El Monte Way",
        "city": "Dinuba",
        "zip": "93618",
        "latitude": 36.545580457328796,
        "longitude": -119.40139141888264,
        "taxRate": 0.085
    },
    {
        "store": 21575,
        "address": "6001 N Golden State Blvd",
        "city": "Turlock",
        "zip": "95382",
        "latitude": 37.54772207546037,
        "longitude": -120.90156623112493
    },
    {
        "store": 22460,
        "address": "15119 S Harlan Rd",
        "city": "Lathrop",
        "zip": "95330",
        "latitude": 37.825203352276304,
        "longitude": -121.28774989379257
    },
    {
        "store": 24290,
        "address": "35112 Merle Haggard Dr",
        "city": "Bakersfield",
        "zip": "93308",
        "latitude": 35.441689436270856,
        "longitude": -119.07744736268732,
        "taxRate": 0.0825
    },
    {
        "store": 27041,
        "address": "736 Academy Ave",
        "city": "Sanger",
        "zip": "93657",
        "latitude": 36.705487774255424,
        "longitude": -119.55519121061995
    },
    {
        "store": 27645,
        "address": "1230 S Madera Ave",
        "city": "Madera",
        "zip": "93637",
        "latitude": 36.94111927322381,
        "longitude": -120.05659791938191,
        "taxRate": 0.0825
    },
    {
        "store": 27834,
        "address": "2994 W Eight Mile Rd",
        "city": "Stockton",
        "zip": "95209",
        "latitude": 38.057301380479544,
        "longitude": -121.3514271706645
    },
    {
        "store": 28543,
        "address": "18158 Avenue 24",
        "city": "Chowchilla",
        "zip": "93610",
        "latitude": 37.097697481928954,
        "longitude": -120.21788686064713
    },
    {
        "store": 28765,
        "address": "7930 Panama Road",
        "city": "Lamont",
        "zip": "93241",
        "latitude": 35.267469267983344,
        "longitude": -118.9161296004983
    },
    {
        "store": 28985,
        "address": "6603 Betty Dr",
        "city": "Goshen",
        "zip": "93274",
        "latitude": 36.35099127599635,
        "longitude": -119.42459966474834
    },
    {
        "store": 29311,
        "address": "8034 Greenback Lane",
        "city": "Citrus Heights",
        "zip": "95610",
        "latitude": 38.678167071112306,
        "longitude": -121.26486352891197
    },
    {
        "store": 29317,
        "address": "744 N Jack Tone Rd",
        "city": "Ripon",
        "zip": "95366",
        "latitude": 37.748007850109545,
        "longitude": -121.14155120335182
    },
    {
        "store": 29847,
        "address": "1805 Holmes St",
        "city": "Livermore",
        "zip": "94550",
        "latitude": 37.66229946958244,
        "longitude": -121.7807797787112
    },
    {
        "store": 31404,
        "address": "677 East Manning Ave",
        "city": "Reedley",
        "zip": "93654",
        "latitude": 36.603872201343876,
        "longitude": -119.44227298636629
    },
    {
        "store": 981,
        "address": "12999 San Pablo Ave",
        "city": "Richmond",
        "zip": "94805",
        "latitude": 37.94891019533867,
        "longitude": -122.33210569040898
    },
    {
        "store": 2152,
        "address": "15050 E 14th St",
        "city": "San Leandro",
        "zip": "94578",
        "latitude": 37.70539293840782,
        "longitude": -122.12803835273253
    },
    {
        "store": 2298,
        "address": "210 Antelope Blvd",
        "city": "Red Bluff",
        "zip": "96080",
        "latitude": 40.1832132590041,
        "longitude": -122.2204607595208
    },
    {
        "store": 3034,
        "address": "1801 Decoto Rd",
        "city": "Union City",
        "zip": "94587",
        "latitude": 37.588733407594276,
        "longitude": -122.0214862866271
    },
    {
        "store": 3208,
        "address": "2055 Eureka Way",
        "city": "Redding",
        "zip": "96001",
        "latitude": 40.58613076195664,
        "longitude": -122.40085471207965
    },
    {
        "store": 3554,
        "address": "220 Alameda Del Prado",
        "city": "Novato",
        "zip": "94949",
        "latitude": 38.05018447863747,
        "longitude": -122.53213456271565
    },
    {
        "store": 4039,
        "address": "950 West A Street",
        "city": "Hayward",
        "zip": "94541",
        "latitude": 37.66552531923946,
        "longitude": -122.11697322357847
    },
    {
        "store": 4760,
        "address": "7200 Bancroft Rd",
        "city": "Oakland",
        "zip": "94605",
        "latitude": 37.767238679430356,
        "longitude": -122.17789750399228
    },
    {
        "store": 4786,
        "address": "898 John Daly Blvd",
        "city": "Daly City",
        "zip": "94015",
        "latitude": 37.70183409431339,
        "longitude": -122.48482573112764
    },
    {
        "store": 4882,
        "address": "2535 North St",
        "city": "Anderson",
        "zip": "96007",
        "latitude": 40.456950755558964,
        "longitude": -122.29407239622589
    },
    {
        "store": 5215,
        "address": "741 Stony Point Rd",
        "city": "Santa Rosa",
        "zip": "95407",
        "latitude": 38.428360061794905,
        "longitude": -122.74199932816668,
        "taxRate": 0.1
    },
    {
        "store": 5325,
        "address": "4424 Broadway Ave",
        "city": "Oakland",
        "zip": "94611",
        "latitude": 37.832624328582014,
        "longitude": -122.253154993665
    },
    {
        "store": 5500,
        "address": "111 Colma Blvd",
        "city": "Colma",
        "zip": "94014",
        "latitude": 37.67710231297252,
        "longitude": -122.46756371488893
    },
    {
        "store": 6117,
        "address": "888 West Highway 99",
        "city": "Corning",
        "zip": "96021",
        "latitude": 39.9272418642185,
        "longitude": -122.19790705973706
    },
    {
        "store": 6936,
        "address": "1011 Bridge Street",
        "city": "Colusa",
        "zip": "95932",
        "latitude": 39.20490476414761,
        "longitude": -122.00378177492664
    },
    {
        "store": 7426,
        "address": "26251 Hesperian Blvd",
        "city": "Hayward",
        "zip": "94545",
        "latitude": 37.63796257392695,
        "longitude": -122.10138960992272,
        "taxRate": 0.1075
    },
    {
        "store": 7469,
        "address": "2714 El Centro Rd",
        "city": "Sacramento",
        "zip": "95833",
        "latitude": 38.61519253672424,
        "longitude": -121.53893408063307
    },
    {
        "store": 8326,
        "address": "580 Hegenberger Rd",
        "city": "Oakland",
        "zip": "94621",
        "latitude": 37.745304586171066,
        "longitude": -122.19561016946774,
        "taxRate": 0.1075
    },
    {
        "store": 10833,
        "address": "1934 Davis St",
        "city": "San Leandro",
        "zip": "94577",
        "latitude": 37.71822945850824,
        "longitude": -122.18199230686895
    },
    {
        "store": 13538,
        "address": "844 Willow Ave",
        "city": "Hercules",
        "zip": "94547",
        "latitude": 38.02141547933806,
        "longitude": -122.2615868804213,
        "taxRate": 0.0925
    },
    {
        "store": 13768,
        "address": "31361 Alvardo-Niles Rd",
        "city": "Union City",
        "zip": "94578",
        "latitude": 37.59783111357577,
        "longitude": -122.06517965463695
    },
    {
        "store": 28906,
        "address": "550 Bogue Road",
        "city": "Yuba City",
        "zip": "95991",
        "latitude": 39.09998794828392,
        "longitude": -121.61798083791324
    },
    {
        "store": 1901,
        "address": "3606 Sonoma Blvd",
        "city": "Vallejo",
        "zip": "94590",
        "latitude": 38.123741342586534,
        "longitude": -122.25476676330071
    },
    {
        "store": 2534,
        "address": "3025 Jefferson St",
        "city": "Napa",
        "zip": "94558",
        "latitude": 38.316193218598094,
        "longitude": -122.29840335500288
    },
    {
        "store": 5394,
        "address": "1 Mariposa St",
        "city": "Vallejo",
        "zip": "94590",
        "latitude": 38.105877317045966,
        "longitude": -122.23192087520128,
        "taxRate": 0.0925
    },
    {
        "store": 9790,
        "address": "1142 Lakeport Blvd",
        "city": "Lakeport",
        "zip": "95453",
        "latitude": 39.032106450047436,
        "longitude": -122.92595497589939,
        "taxRate": 0.0875
    },
    {
        "store": 1572,
        "address": "385 S Kiely Blvd",
        "city": "San Jose",
        "zip": "95129",
        "latitude": 37.31981191658511,
        "longitude": -121.97381435776194,
        "taxRate": 0.1
    },
    {
        "store": 2022,
        "address": "601 Colusa Ave",
        "city": "Yuba City",
        "zip": "95991",
        "latitude": 39.141817131935426,
        "longitude": -121.62146017291633
    },
    {
        "store": 4668,
        "address": "1690 Valencia Street",
        "city": "San Francisco",
        "zip": "94110",
        "latitude": 37.74565258906076,
        "longitude": -122.42028784537794
    },
    {
        "store": 14581,
        "address": "14813 Jackson Rd",
        "city": "Sloughouse",
        "zip": "95683",
        "latitude": 38.495669307880085,
        "longitude": -121.09857440043194
    },
    {
        "store": 16003,
        "address": "5550 S Watt Ave",
        "city": "Sacramento",
        "zip": "95826",
        "latitude": 38.5257552976642,
        "longitude": -121.37098222776591
    },
    {
        "store": 17721,
        "address": "763 Ikea Ct",
        "city": "West Sacramento",
        "zip": "95691",
        "latitude": 38.58959304411636,
        "longitude": -121.5510809723529
    },
    {
        "store": 5270,
        "address": "1475 Dempsey Rd",
        "city": "Milpitas",
        "zip": "95035",
        "latitude": 37.415513961623084,
        "longitude": -121.8786109939728,
        "taxRate": 0.1
    },
    {
        "store": 24651,
        "address": "11900 Yosemite Dr",
        "city": "Waterford",
        "zip": "95386",
        "latitude": 37.63774385675811,
        "longitude": -120.773367836779
    }
];

function normalizarStoreNumberBurgerKing(store) {
    const numero = Number(String(store ?? '').replace(/\D/g, ''));
    return Number.isFinite(numero) ? numero : 0;
}

function normalizarTaxRateDecimalBurgerKing(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;

    const texto = String(valor)
        .replace('%', '')
        .replace(',', '.')
        .trim();

    const numero = Number(texto);

    if (!Number.isFinite(numero)) return 0;

    return numero > 1 ? numero / 100 : numero;
}

function parsearCoordenadasBurgerKing(valor) {
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

function normalizarTiendaTaxBurgerKing(tienda) {
    const store = normalizarStoreNumberBurgerKing(tienda.store);

    return {
        store,
        address: String(tienda.address || '').trim(),
        city: String(tienda.city || '').trim(),
        zip: String(tienda.zip || '').trim(),
        latitude: Number.isFinite(Number(tienda.latitude))
            ? Number(tienda.latitude)
            : null,
        longitude: Number.isFinite(Number(tienda.longitude))
            ? Number(tienda.longitude)
            : null,
        preferredJurisdiction: String(
            tienda.preferredJurisdiction ||
            BK_STORE_JURISDICTION_OVERRIDES[store] ||
            ''
        ).trim(),
        taxRate: normalizarTaxRateDecimalBurgerKing(
            tienda.taxRate ?? BK_TAX_RATE_FALLBACK[store] ?? 0
        )
    };
}

function cargarTiendasTaxBurgerKing() {
    try {
        const guardadas = JSON.parse(
            localStorage.getItem(BK_TAX_STORE_STORAGE_KEY) || 'null'
        );

        if (Array.isArray(guardadas)) {
            return guardadas
                .map(normalizarTiendaTaxBurgerKing)
                .filter(tienda => tienda.store);
        }
    } catch (error) {
        console.warn('No se pudo leer el catálogo local de tiendas BK:', error);
    }

    return BK_DEFAULT_TAX_STORES
        .map(normalizarTiendaTaxBurgerKing)
        .filter(tienda => tienda.store);
}

function guardarTiendasTaxBurgerKing(tiendas) {
    const limpias = tiendas
        .map(normalizarTiendaTaxBurgerKing)
        .filter(tienda => tienda.store)
        .sort((a, b) => a.store - b.store);

    localStorage.setItem(
        BK_TAX_STORE_STORAGE_KEY,
        JSON.stringify(limpias)
    );

    return limpias;
}

function buscarTiendaTaxBurgerKing(store) {
    const numeroStore = normalizarStoreNumberBurgerKing(store);

    return cargarTiendasTaxBurgerKing()
        .find(tienda => tienda.store === numeroStore) || null;
}

function upsertTiendaTaxBurgerKing(tienda) {
    const normalizada = normalizarTiendaTaxBurgerKing(tienda);

    if (!normalizada.store) {
        throw new Error('La tienda debe tener un número válido');
    }

    const tieneCoordenadas =
        Number.isFinite(normalizada.latitude) &&
        Number.isFinite(normalizada.longitude);

    if (!tieneCoordenadas && !normalizada.taxRate) {
        throw new Error('Agrega coordenadas válidas o captura un tax rate manual.');
    }

    const tiendas = cargarTiendasTaxBurgerKing()
        .filter(item => item.store !== normalizada.store);

    tiendas.push(normalizada);
    return guardarTiendasTaxBurgerKing(tiendas);
}

function swalBurgerKingModal(opciones) {
    const dialog = document.getElementById('burgerKingTaxStoreDialog');

    if (!window.Swal) {
        return null;
    }

    return Swal.fire({
        target: dialog && dialog.open ? dialog : document.body,
        heightAuto: false,
        scrollbarPadding: false,
        customClass: {
            container: 'bk-tax-swal-container',
            popup: 'bk-tax-swal-popup'
        },
        ...opciones
    });
}

async function eliminarTiendaTaxBurgerKing(store) {
    const storeNumber = normalizarStoreNumberBurgerKing(store);
    const tiendas = cargarTiendasTaxBurgerKing();
    const tienda = tiendas.find(item => item.store === storeNumber);

    if (!tienda) {
        mostrarEstadoTaxBurgerKing('No se encontró la tienda seleccionada.', 'warning');
        return false;
    }

    let confirmado = false;

    if (window.Swal) {
        const resultado = await swalBurgerKingModal({
            icon: 'warning',
            title: 'Eliminar tienda',
            html: `
                <p>¿Seguro que quieres eliminar la tienda <strong>${tienda.store}</strong>?</p>
                <p><strong>${tienda.city || ''}</strong> ${tienda.address || ''}</p>
                <p>Esta acción solo elimina la tienda del catálogo local de este navegador.</p>
            `,
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#c01818',
            cancelButtonColor: '#6c757d',
            reverseButtons: true,
            focusCancel: true
        });

        confirmado = resultado.isConfirmed;
    } else {
        confirmado = confirm(
            `¿Seguro que quieres eliminar la tienda ${tienda.store}?\n\n` +
            `${tienda.city || ''} ${tienda.address || ''}\n\n` +
            `Esta acción solo elimina la tienda del catálogo local de este navegador.`
        );
    }

    if (!confirmado) {
        mostrarEstadoTaxBurgerKing('Eliminación cancelada.');
        return false;
    }

    const tiendasActualizadas = tiendas.filter(item => item.store !== storeNumber);
    guardarTiendasTaxBurgerKing(tiendasActualizadas);

    const cache = cargarCacheTaxRateBurgerKing();

    Object.keys(cache).forEach(clave => {
        if (clave.startsWith(`${storeNumber}|`)) {
            delete cache[clave];
        }
    });

    guardarCacheTaxRateBurgerKing(cache);

    renderTiendasTaxBurgerKing();
    mostrarEstadoTaxBurgerKing(`Tienda ${storeNumber} eliminada.`, 'success');

    return true;
}

function cargarCacheTaxRateBurgerKing() {
    try {
        return JSON.parse(
            localStorage.getItem(BK_TAX_RATE_CACHE_STORAGE_KEY) || '{}'
        );
    } catch {
        return {};
    }
}

function guardarCacheTaxRateBurgerKing(cache) {
    localStorage.setItem(
        BK_TAX_RATE_CACHE_STORAGE_KEY,
        JSON.stringify(cache)
    );
}

function crearClaveCacheTaxRateBurgerKing(store, latitude, longitude) {
    return [
        normalizarStoreNumberBurgerKing(store),
        Number(latitude || 0).toFixed(6),
        Number(longitude || 0).toFixed(6)
    ].join('|');
}

function obtenerCacheTaxRateBurgerKing(store, latitude, longitude) {
    const cache = cargarCacheTaxRateBurgerKing();
    const clave = crearClaveCacheTaxRateBurgerKing(store, latitude, longitude);
    const item = cache[clave];

    if (!item?.rate || !item?.timestamp) return null;

    const edadDias =
        (Date.now() - new Date(item.timestamp).getTime()) / 86400000;

    if (edadDias > BK_TAX_RATE_CACHE_DAYS) return null;

    return item;
}

function guardarCacheTiendaTaxRateBurgerKing(store, latitude, longitude, data) {
    const cache = cargarCacheTaxRateBurgerKing();
    const clave = crearClaveCacheTaxRateBurgerKing(store, latitude, longitude);

    cache[clave] = {
        ...data,
        rate: normalizarTaxRateDecimalBurgerKing(data.rate),
        timestamp: new Date().toISOString()
    };

    guardarCacheTaxRateBurgerKing(cache);
}

function elegirResultadoCDTFABurgerKing(apiData, store, preferredJurisdiction = '') {
    const resultados = Array.isArray(apiData?.taxRateInfo)
        ? apiData.taxRateInfo
        : [];

    if (!resultados.length) return null;

    const storeNumber = normalizarStoreNumberBurgerKing(store);
    const preferida = String(
        preferredJurisdiction ||
        BK_STORE_JURISDICTION_OVERRIDES[storeNumber] ||
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

function obtenerApiUrlTaxRatesBurgerKing(location) {
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

function normalizarRespuestaBackendTaxRateBurgerKing(data) {
    if (!data?.success) {
        return {
            success: false,
            error: data?.error || 'No se pudo consultar CDTFA'
        };
    }

    return {
        success: true,
        rate: normalizarTaxRateDecimalBurgerKing(
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

async function consultarTaxRateCDTFABurgerKing(location) {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return {
            success: false,
            error: 'La tienda no tiene coordenadas válidas'
        };
    }

    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        BK_TAX_RATE_TIMEOUT_MS
    );

    try {
        const backendUrl = obtenerApiUrlTaxRatesBurgerKing({
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
                    return normalizarRespuestaBackendTaxRateBurgerKing(data);
                }

                console.warn(
                    'Backend CDTFA no disponible para Burger King, intentando consulta directa:',
                    data?.error || response.status
                );
            } catch (error) {
                if (error?.name === 'AbortError') throw error;
                console.warn(
                    'No se pudo consultar CDTFA via backend para Burger King:',
                    error
                );
            }
        }

        const url =
            `${BK_TAX_RATE_DIRECT_API_BASE_URL}/GetRateByLngLat?Latitude=${encodeURIComponent(latitude)}&Longitude=${encodeURIComponent(longitude)}`;

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

        const rateInfo = elegirResultadoCDTFABurgerKing(
            data,
            location.store,
            location.preferredJurisdiction
        );

        if (!rateInfo) {
            return {
                success: false,
                error: 'CDTFA no encontró tax rate para la ubicación',
                apiResponse: data
            };
        }

        return {
            success: true,
            rate: normalizarTaxRateDecimalBurgerKing(rateInfo.rate),
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
                : 'No se pudo consultar CDTFA desde el navegador'
        };
    } finally {
        clearTimeout(timeout);
    }
}

function obtenerTaxRateLocalBurgerKing(store, latitude, longitude) {
    const numeroStore = normalizarStoreNumberBurgerKing(store);
    if (!numeroStore) return 0;

    const tiendaConfigurada = buscarTiendaTaxBurgerKing(numeroStore);
    const location = normalizarTiendaTaxBurgerKing({
        ...(tiendaConfigurada || {}),
        store: numeroStore,
        latitude: latitude ?? tiendaConfigurada?.latitude,
        longitude: longitude ?? tiendaConfigurada?.longitude
    });

    if (
        Number.isFinite(location.latitude) &&
        Number.isFinite(location.longitude)
    ) {
        const cache = obtenerCacheTaxRateBurgerKing(
            numeroStore,
            location.latitude,
            location.longitude
        );

        if (cache?.rate) return Number(cache.rate);
    }

    return normalizarTaxRateDecimalBurgerKing(
        location.taxRate || BK_TAX_RATE_FALLBACK[numeroStore] || 0
    );
}

async function obtenerTaxRateCDTFA(store, latitude, longitude, opciones = {}) {
    const numeroStore = normalizarStoreNumberBurgerKing(store);
    const tiendaConfigurada = buscarTiendaTaxBurgerKing(numeroStore);

    const location = normalizarTiendaTaxBurgerKing({
        ...(tiendaConfigurada || {}),
        store: numeroStore,
        latitude: latitude ?? tiendaConfigurada?.latitude,
        longitude: longitude ?? tiendaConfigurada?.longitude,
        preferredJurisdiction:
            tiendaConfigurada?.preferredJurisdiction ||
            BK_STORE_JURISDICTION_OVERRIDES[numeroStore] ||
            ''
    });

    const fallbackRate =
        normalizarTaxRateDecimalBurgerKing(
            location.taxRate || BK_TAX_RATE_FALLBACK[numeroStore] || 0
        );

    if (!numeroStore) return 0;

    if (
        !opciones.forceRefresh &&
        Number.isFinite(location.latitude) &&
        Number.isFinite(location.longitude)
    ) {
        const cache = obtenerCacheTaxRateBurgerKing(
            numeroStore,
            location.latitude,
            location.longitude
        );

        if (cache?.rate) return Number(cache.rate);
    }

    if (!opciones.forceRefresh) {
        return fallbackRate;
    }

    const result = await consultarTaxRateCDTFABurgerKing(location);

    if (result.success) {
        guardarCacheTiendaTaxRateBurgerKing(
            numeroStore,
            location.latitude,
            location.longitude,
            result
        );

        return result.rate;
    }

    console.warn(
        `No se pudo obtener tax rate CDTFA para tienda ${store}:`,
        result.error
    );

    return fallbackRate;
}

function estadoTaxRateDesdeCacheBurgerKing(tienda) {
    const cache = obtenerCacheTaxRateBurgerKing(
        tienda.store,
        tienda.latitude,
        tienda.longitude
    );

    if (cache?.rate) {
        return `${formatearPorcentajeBurgerKing(cache.rate)} · CDTFA`;
    }

    if (tienda.taxRate) {
        return `${formatearPorcentajeBurgerKing(tienda.taxRate)} · local`;
    }

    return 'Pendiente';
}

function actualizarPanelTaxBurgerKing(codigo = '') {
    const panel = document.getElementById('burgerKingTaxStorePanel');
    if (!panel) return;

    const codigoActual = codigo ||
        document
            .getElementById('selectRestaurante')
            ?.selectedOptions?.[0]
            ?.dataset?.codigo ||
        '';

    panel.style.display = codigoActual === 'burger-king' ? '' : 'none';

    if (codigoActual === 'burger-king') {
        renderTiendasTaxBurgerKing();
    }
}

function limpiarFormularioTiendaTaxBurgerKing() {
    [
        'bkTaxStoreNumber',
        'bkTaxStoreAddress',
        'bkTaxStoreCity',
        'bkTaxStoreZip',
        'bkTaxStoreCoordinates',
        'bkTaxStoreRate',
        'bkTaxStoreJurisdiction'
    ].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
}

function cargarFormularioTiendaTaxBurgerKing(store) {
    const tienda = buscarTiendaTaxBurgerKing(store);
    if (!tienda) return;

    const valores = {
        bkTaxStoreNumber: tienda.store,
        bkTaxStoreAddress: tienda.address,
        bkTaxStoreCity: tienda.city,
        bkTaxStoreZip: tienda.zip,
        bkTaxStoreCoordinates:
            tienda.latitude !== null && tienda.longitude !== null
                ? `${tienda.latitude}, ${tienda.longitude}`
                : '',
        bkTaxStoreRate: tienda.taxRate
            ? formatearPorcentajeBurgerKing(tienda.taxRate)
            : '',
        bkTaxStoreJurisdiction: tienda.preferredJurisdiction
    };

    Object.entries(valores).forEach(([id, valor]) => {
        const input = document.getElementById(id);
        if (input) input.value = valor ?? '';
    });
}

function leerFormularioTiendaTaxBurgerKing() {
    const coords = parsearCoordenadasBurgerKing(
        document.getElementById('bkTaxStoreCoordinates')?.value
    );

    return {
        store: document.getElementById('bkTaxStoreNumber')?.value,
        address: document.getElementById('bkTaxStoreAddress')?.value,
        city: document.getElementById('bkTaxStoreCity')?.value,
        zip: document.getElementById('bkTaxStoreZip')?.value,
        latitude: coords.latitude,
        longitude: coords.longitude,
        taxRate: document.getElementById('bkTaxStoreRate')?.value,
        preferredJurisdiction:
            document.getElementById('bkTaxStoreJurisdiction')?.value
    };
}

function mostrarEstadoTaxBurgerKing(texto, tipo = 'info') {
    const status = document.getElementById('bkTaxStoreStatus');
    if (!status) return;

    status.textContent = texto;
    status.dataset.type = tipo;
}

function renderTiendasTaxBurgerKing() {
    const tbody = document.getElementById('bkTaxStoreBody');
    const count = document.getElementById('bkTaxStoreCount');

    if (!tbody) return;

    const tiendas = cargarTiendasTaxBurgerKing();

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
            <td>${tienda.latitude !== null && tienda.longitude !== null
            ? `${tienda.latitude.toFixed(6)}, ${tienda.longitude.toFixed(6)}`
            : '-'
        }</td>
            <td>${tienda.preferredJurisdiction || '-'}</td>
            <td>${estadoTaxRateDesdeCacheBurgerKing(tienda)}</td>
            <td class="bk-tax-store-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-bk-tax-edit="${tienda.store}">
                    Editar
                </button>
                <button type="button" class="btn btn-danger btn-sm" data-bk-tax-delete="${tienda.store}">
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

function swalBurgerKingModal(opciones) {
    const dialog = document.getElementById('burgerKingTaxStoreDialog');

    if (!window.Swal) {
        return null;
    }

    return Swal.fire({
        target: dialog && dialog.open ? dialog : document.body,
        heightAuto: false,
        scrollbarPadding: false,
        customClass: {
            container: 'bk-tax-swal-container',
            popup: 'bk-tax-swal-popup'
        },
        ...opciones
    });
}

async function refrescarTaxRatesBurgerKing() {
    const tiendas = cargarTiendasTaxBurgerKing();

    if (!tiendas.length) {
        mostrarEstadoTaxBurgerKing('No hay tiendas para actualizar.', 'warning');
        return;
    }

    let confirmado = false;

    if (window.Swal) {
        const resultado = await swalBurgerKingModal({
            icon: 'question',
            title: 'Actualizar rates CDTFA',
            text: `Se actualizarán ${tiendas.length} tiendas configuradas, incluyendo las tiendas nuevas agregadas manualmente.`,
            showCancelButton: true,
            confirmButtonText: 'Actualizar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#0b2d4d',
            cancelButtonColor: '#6c757d',
            reverseButtons: true,
            focusCancel: true
        });

        confirmado = resultado.isConfirmed;
    } else {
        confirmado = confirm(
            `Se actualizarán ${tiendas.length} tiendas configuradas.\n\n¿Deseas continuar?`
        );
    }

    if (!confirmado) {
        mostrarEstadoTaxBurgerKing('Actualización cancelada.');
        return;
    }
    const botonActualizar = document.getElementById('bkTaxRefreshRates');

    if (botonActualizar) {
        botonActualizar.disabled = true;
        botonActualizar.dataset.originalText = botonActualizar.textContent;
        botonActualizar.textContent = 'Actualizando...';
    }

    mostrarEstadoTaxBurgerKing(
        `Actualizando 0/${tiendas.length} desde CDTFA. Esto no bloquea la conciliación...`
    );

    let ok = 0;
    let fallos = 0;
    let sinCoordenadas = 0;

    for (let i = 0; i < tiendas.length; i += 1) {
        const tienda = tiendas[i];

        const tieneCoordenadas =
            Number.isFinite(Number(tienda.latitude)) &&
            Number.isFinite(Number(tienda.longitude));

        if (!tieneCoordenadas) {
            sinCoordenadas += 1;
            fallos += 1;

            console.warn(
                `Tienda ${tienda.store} sin coordenadas válidas. No se puede consultar CDTFA.`
            );

            mostrarEstadoTaxBurgerKing(
                `Actualizando ${i + 1}/${tiendas.length} desde CDTFA... OK: ${ok}, sin coordenadas: ${sinCoordenadas}, fallas: ${fallos}`,
                'warning'
            );

            continue;
        }

        const result = await consultarTaxRateCDTFABurgerKing(tienda);

        if (result.success) {
            guardarCacheTiendaTaxRateBurgerKing(
                tienda.store,
                tienda.latitude,
                tienda.longitude,
                result
            );

            upsertTiendaTaxBurgerKing({
                ...tienda,
                taxRate: result.rate
            });

            ok += 1;
        } else {
            fallos += 1;

            console.warn(
                `No se pudo actualizar CDTFA para tienda ${tienda.store}:`,
                result.error
            );
        }

        mostrarEstadoTaxBurgerKing(
            `Actualizando ${i + 1}/${tiendas.length} desde CDTFA... OK: ${ok}, sin coordenadas: ${sinCoordenadas}, fallas: ${fallos}`,
            fallos ? 'warning' : 'info'
        );
    }

    renderTiendasTaxBurgerKing();

    mostrarEstadoTaxBurgerKing(
        `Actualización terminada. CDTFA OK: ${ok}. Sin coordenadas: ${sinCoordenadas}. Fallas: ${fallos}.`,
        fallos ? 'warning' : 'success'
    );

    if (botonActualizar) {
        botonActualizar.disabled = false;
        botonActualizar.textContent =
            botonActualizar.dataset.originalText || 'Actualizar rates CDTFA';
    }

    if (Array.isArray(datosExtraidos) && datosExtraidos.length) {
        await generarTaxAnalysisBurgerKing();
        generarDiscrepanciesBurgerKing();
        generarSummaryBurgerKing();
        renderActiveTab();
    }
}


function abrirModalTaxBurgerKing() {
    const dialog = document.getElementById('burgerKingTaxStoreDialog');
    if (!dialog) return;

    dialog.classList.remove('is-form-open');
    renderTiendasTaxBurgerKing();
    mostrarEstadoTaxBurgerKing('Catálogo listo. La conciliación usará estos rates locales.');

    if (typeof dialog.showModal === 'function') {
        dialog.showModal();
    } else {
        dialog.setAttribute('open', 'open');
    }
}

function cerrarModalTaxBurgerKing() {
    const dialog = document.getElementById('burgerKingTaxStoreDialog');
    if (!dialog) return;

    dialog.classList.remove('is-form-open');
    if (typeof dialog.close === 'function') {
        dialog.close();
    } else {
        dialog.removeAttribute('open');
    }
}

function inicializarPanelTaxRatesBurgerKing() {
    if (window.__burgerKingTaxPanelReady) return;
    window.__burgerKingTaxPanelReady = true;

    document
        .getElementById('bkTaxOpenModal')
        ?.addEventListener('click', abrirModalTaxBurgerKing);

    document
        .getElementById('bkTaxCloseModal')
        ?.addEventListener('click', cerrarModalTaxBurgerKing);

    document
        .getElementById('bkTaxCloseFooter')
        ?.addEventListener('click', cerrarModalTaxBurgerKing);

    document
        .getElementById('bkTaxAddStore')
        ?.addEventListener('click', () => {
            const dialog = document.getElementById('burgerKingTaxStoreDialog');

            limpiarFormularioTiendaTaxBurgerKing();
            dialog?.classList.add('is-form-open');
            mostrarEstadoTaxBurgerKing('Captura los datos de la tienda nueva.');
            document.getElementById('bkTaxStoreNumber')?.focus();
        });

    document
        .getElementById('bkTaxSaveStore')
        ?.addEventListener('click', () => {
            try {
                upsertTiendaTaxBurgerKing(
                    leerFormularioTiendaTaxBurgerKing()
                );

                renderTiendasTaxBurgerKing();
                mostrarEstadoTaxBurgerKing('Tienda guardada correctamente.', 'success');
                limpiarFormularioTiendaTaxBurgerKing();
                document
                    .getElementById('burgerKingTaxStoreDialog')
                    ?.classList.remove('is-form-open');
            } catch (error) {
                mostrarEstadoTaxBurgerKing(error.message, 'error');

                if (window.Swal) {
                    Swal.fire('Revisa la tienda', error.message, 'warning');
                }
            }
        });

    document
        .getElementById('bkTaxClearStore')
        ?.addEventListener('click', () => {
            limpiarFormularioTiendaTaxBurgerKing();
            document
                .getElementById('burgerKingTaxStoreDialog')
                ?.classList.remove('is-form-open');
            mostrarEstadoTaxBurgerKing('Edicion cancelada.');
        });

    document
        .getElementById('bkTaxRefreshRates')
        ?.addEventListener('click', () => {
            refrescarTaxRatesBurgerKing();
        });

    document
        .getElementById('bkTaxResetStores')
        ?.addEventListener('click', async () => {
            const confirmar = !window.Swal || (await swalBurgerKingModal({
                icon: 'warning',
                title: 'Restaurar tiendas Burger King',
                text: 'Se borrarán los cambios guardados localmente y volverá el catálogo inicial.',
                showCancelButton: true,
                confirmButtonText: 'Restaurar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#c01818',
                cancelButtonColor: '#6c757d',
                reverseButtons: true,
                focusCancel: true
            })).isConfirmed;

            if (!confirmar) return;

            localStorage.removeItem(BK_TAX_STORE_STORAGE_KEY);
            renderTiendasTaxBurgerKing();
            limpiarFormularioTiendaTaxBurgerKing();
            document
                .getElementById('burgerKingTaxStoreDialog')
                ?.classList.remove('is-form-open');
            mostrarEstadoTaxBurgerKing('Catálogo inicial restaurado.', 'success');
        });

    document
        .getElementById('bkTaxStoreBody')
        ?.addEventListener('click', async event => {
            const editButton = event.target.closest('[data-bk-tax-edit]');
            const deleteButton = event.target.closest('[data-bk-tax-delete]');

            if (editButton) {
                cargarFormularioTiendaTaxBurgerKing(
                    editButton.dataset.bkTaxEdit
                );
                document
                    .getElementById('burgerKingTaxStoreDialog')
                    ?.classList.add('is-form-open');
                mostrarEstadoTaxBurgerKing('Editando tienda seleccionada.');
                document.getElementById('bkTaxStoreNumber')?.focus();
            }

            if (deleteButton) {
                event.preventDefault();

                const store = deleteButton.dataset.bkTaxDelete;
                await eliminarTiendaTaxBurgerKing(store);

                return;
            }
        });

    actualizarPanelTaxBurgerKing();
}

document.addEventListener(
    'DOMContentLoaded',
    inicializarPanelTaxRatesBurgerKing
);

async function generarTaxAnalysisBurgerKing() {
    const rows = Array.isArray(datosExtraidos) ? datosExtraidos : [];

    // Importante: aquí NO se consulta CDTFA.
    // La conciliación usa el rate local/cache para evitar timeouts y bloqueos.
    burgerKingTaxAnalysisData = rows.map(row => {
        const storeNumber = normalizarStoreNumberBurgerKing(row.store);
        const tienda = buscarTiendaTaxBurgerKing(storeNumber);
        const taxRate = Number(obtenerTaxRateLocalBurgerKing(
            storeNumber,
            tienda?.latitude,
            tienda?.longitude
        ) || 0);

        const taxableSales =
            Number(row.foodSales || 0) +
            Number(row.bevSales || 0) +
            Number(row.nonFood || 0) -
            Number(row.discounts || 0) -
            Number(row.uber || 0) -
            Number(row.ebt || 0);

        const taxCalculation = taxableSales * taxRate;

        const taxDifference =
            Number(row.salesTax || 0) - taxCalculation;

        const rateCalculation =
            taxableSales !== 0
                ? Number(row.salesTax || 0) / taxableSales
                : 0;

        const rateDifference =
            rateCalculation - taxRate;

        return {
            store: row.store,
            taxRate,
            taxableSales: redondearBurgerKing(taxableSales),
            taxCalculation: redondearBurgerKing(taxCalculation),
            salesTax: Number(row.salesTax || 0),
            taxDifference: redondearBurgerKing(taxDifference),
            rateCalculation,
            rateDifference
        };
    });

    console.log('Tax Review BK generado:', burgerKingTaxAnalysisData);
}

function generarDiscrepanciesBurgerKing() {
    burgerKingDiscrepanciesData =
        datosExtraidos.map(row => {

            const tax =
                burgerKingTaxAnalysisData.find(
                    t => String(t.store) === String(row.store)
                );

            const overShort =
                redondearBurgerKing(row.oS || 0);

            const cashDifference =
                redondearBurgerKing(row.cashDifference || 0);

            const openChecks =
                redondearBurgerKing(row.openChecks || 0);

            const taxDifference =
                tax
                    ? redondearBurgerKing(tax.taxDifference)
                    : 0;

            const taxRate =
                tax
                    ? tax.taxRate
                    : 0;

            const rateDifference =
                tax
                    ? tax.rateDifference
                    : 0;

            const issues = [];

            if (Math.abs(overShort) > 0.01) {
                issues.push(`Balance (O/S): $${overShort}`);
            }

            if (Math.abs(cashDifference) > 0.5) {
                issues.push(`Cash Difference: $${cashDifference}`);
            }

            if (openChecks > 0.005) {
                issues.push(`Open Checks: $${openChecks}`);
            }

            if (Math.abs(taxDifference) > 1) {
                issues.push(`Tax Diff > $1: $${taxDifference}`);
            }

            return {
                store: row.store,
                totalRevenue: row.totalRevenue,
                netSales: row.netSales,
                salesTax: row.salesTax,
                overShort,
                cashDifference,
                openChecks,
                taxDifference,
                taxRate,
                rateDifference,
                issues: issues.join('; ') || 'OK'
            };
        })
            .sort((a, b) => {
                const totalA =
                    Math.abs(a.overShort) +
                    Math.abs(a.cashDifference) +
                    Math.abs(a.openChecks) +
                    Math.abs(a.taxDifference);

                const totalB =
                    Math.abs(b.overShort) +
                    Math.abs(b.cashDifference) +
                    Math.abs(b.openChecks) +
                    Math.abs(b.taxDifference);

                return totalB - totalA;
            });
}

function generarTemplateCsvBurgerKing() {
    const rows = [];
    let lineNo = 1;

    datosExtraidos.forEach(row => {
        BK_DAILY_SALES_LINES.forEach(line => {
            const value =
                redondearBurgerKing(row[line.field]);

            if (Math.abs(value) < 0.005) return;

            let debit = 0;
            let credit = 0;

            if (line.type === 'debit') {
                if (value >= 0) debit = value;
                else credit = Math.abs(value);
            } else {
                if (value >= 0) credit = value;
                else debit = Math.abs(value);
            }

            rows.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: BK_DESCRIPTION,
                memo: line.memo,
                account: line.acctNo,
                locationId: row.store,
                departmentId: line.deptId || '',
                debit,
                credit
            });
        });
    });

    burgerKingTemplateCsvData = rows;
}

function separarFilaUnaColumna(row) {
    const keys = Object.keys(row || {});

    if (keys.length !== 1) {
        return row;
    }

    const unicaColumna = keys[0];
    const valor = row[unicaColumna];

    if (typeof valor !== 'string') {
        return row;
    }

    const separador =
        valor.includes(';')
            ? ';'
            : ',';

    const partes = valor
        .split(separador)
        .map(x => x.trim());

    return partes;
}

let burgerKingSummaryData = [];

function generarSummaryBurgerKing() {
    const total = (field) =>
        datosExtraidos.reduce((sum, row) => sum + Number(row[field] || 0), 0);

    const storesWithIssues =
        burgerKingDiscrepanciesData.filter(row => row.issues !== 'OK').length;

    burgerKingSummaryData = [
        { metric: 'Stores Reporting', value: datosExtraidos.length },
        { metric: 'Stores with Discrepancies', value: storesWithIssues },
        { metric: 'Total Gross Food Sales', value: redondearBurgerKing(total('foodSales')) },
        { metric: 'Total Beverage Sales', value: redondearBurgerKing(total('bevSales')) },
        { metric: 'Total Non-Food Sales', value: redondearBurgerKing(total('nonFood')) },
        { metric: 'Total Net Sales', value: redondearBurgerKing(total('netSales')) },
        { metric: 'Total Sales Tax', value: redondearBurgerKing(total('salesTax')) },
        { metric: 'Total Revenue', value: redondearBurgerKing(total('totalRevenue')) },
        { metric: 'Total Credit Cards', value: redondearBurgerKing(total('ccTotals')) },
        { metric: 'Total Cash Expected', value: redondearBurgerKing(total('cashExpected')) },
        { metric: 'Total DoorDash', value: redondearBurgerKing(total('dd')) },
        { metric: 'Total GrubHub', value: redondearBurgerKing(total('gh')) },
        { metric: 'Total Uber Eats', value: redondearBurgerKing(total('uber')) },
        { metric: 'Total EBT', value: redondearBurgerKing(total('ebt')) }
    ];
}

function renderBurgerKingConciliation() {
    renderTablaSucursales();
}

function renderBurgerKingDiscrepancies() {
    renderArrayToMainTable(
        burgerKingDiscrepanciesData || []
    );
}

function renderBurgerKingTemplateCsv() {
    renderArrayToMainTable(
        burgerKingTemplateCsvData || []
    );
}

