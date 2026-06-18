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

    // Si todo viene en una sola columna, separar por coma o punto y coma
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
    const row = {
        store,
        unitName,
        date,

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

function generarConciliacionBurgerKing() {
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

    generarTaxAnalysisBurgerKing();
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

function generarTaxAnalysisBurgerKing() {
    burgerKingTaxAnalysisData =
        datosExtraidos.map(row => {
            const taxRate =
                typeof obtenerTaxRate === 'function'
                    ? Number(obtenerTaxRate(row.store) || 0)
                    : 0;

            const taxableSales =
                row.foodSales +
                row.bevSales +
                row.nonFood -
                row.discounts -
                row.uber -
                row.ebt;

            const taxCalculation =
                taxableSales * taxRate;

            const taxDifference =
                taxCalculation - row.salesTax;

            const rateCalculation =
                taxableSales !== 0
                    ? (row.salesTax / taxableSales) * 100
                    : 0;

            const rateDifference =
                (taxRate * 100) - rateCalculation;

            return {
                store: row.store,
                taxRate,
                foodSales: row.foodSales,
                bevSales: row.bevSales,
                nonFood: row.nonFood,
                discounts: row.discounts,
                uber: row.uber,
                ebt: row.ebt,
                taxableSales: redondearBurgerKing(taxableSales),
                taxCalculation: redondearBurgerKing(taxCalculation),
                salesTax: row.salesTax,
                taxDifference: redondearBurgerKing(taxDifference),
                rateCalculation: Number(rateCalculation.toFixed(3)),
                rateDifference: Number(rateDifference.toFixed(3))
            };
        });
}

function generarDiscrepanciesBurgerKing() {
    burgerKingDiscrepanciesData =
        datosExtraidos.map(row => {
            const tax =
                burgerKingTaxAnalysisData.find(
                    t => String(t.store) === String(row.store)
                );

            const issues = [];

            if (Math.abs(row.oS || 0) > 0.01) {
                issues.push(`Balance O/S: $${row.oS}`);
            }

            if (Math.abs(row.cashDifference || 0) > 0.5) {
                issues.push(`Cash Difference: $${row.cashDifference}`);
            }

            if ((row.openChecks || 0) > 0.005) {
                issues.push(`Open Checks: $${row.openChecks}`);
            }

            if (
                tax &&
                Math.abs(tax.taxDifference || 0) > 1
            ) {
                issues.push(`Tax Diff: $${tax.taxDifference}`);
            }

            return {
                store: row.store,
                totalRevenue: row.totalRevenue,
                netSales: row.netSales,
                salesTax: row.salesTax,
                overShort: row.oS,
                cashDifference: row.cashDifference,
                openChecks: row.openChecks,
                taxDifference: tax ? tax.taxDifference : 0,
                issues: issues.join('; ') || 'OK'
            };
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

function renderBurgerKingSummary() {
    renderArrayToMainTable(
        burgerKingSummaryData || []
    );
}

function renderBurgerKingConciliation() {
    renderTablaSucursales();
}

function renderBurgerKingTaxAnalysis() {
    renderArrayToMainTable(
        burgerKingTaxAnalysisData || []
    );
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