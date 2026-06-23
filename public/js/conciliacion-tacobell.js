// conciliacion-tacobell.js

let taxReviewData = [];
let statisticalDeliveryData = [];
let dailySalesREDData = [];
let dailySales0314Data = [];
let dailySales0310Data = [];
let activeTab = 'dailySales';

const TACO_BELL_DEPOSITOS_AL_FINAL = new Set([
    28841,
    28843,
    28844,
    28845,
    28846,
    30256,
    30491,
    36224
]);

function ordenarDepositosTacoBellAlFinal(data) {
    const lineasRegulares = [];
    const cashExpected = [];
    const ebtExpected = [];

    data.forEach(row => {
        const store = Number(row.locationId);
        const moverAlFinal =
            TACO_BELL_DEPOSITOS_AL_FINAL.has(store);

        if (
            moverAlFinal &&
            row.memo === 'Cash Expected Deposit'
        ) {
            cashExpected.push(row);
            return;
        }

        if (
            moverAlFinal &&
            row.memo === 'EBT Expected Deposit'
        ) {
            ebtExpected.push(row);
            return;
        }

        lineasRegulares.push(row);
    });

    return [
        ...lineasRegulares,
        ...cashExpected,
        ...ebtExpected
    ].map((row, index) => ({
        ...row,
        lineNo: index + 1
    }));
}

function numeroSalesDetailTacoBell(row, campo) {
    return Number(row?.[campo] || 0);
}

function claveTiendaTacoBell(valor) {
    const digitos = String(valor ?? '').replace(/\D/g, '');
    return digitos ? String(Number(digitos)) : '';
}

function convertirSalesDetailTacoBell(row) {
    const valor = campo =>
        numeroSalesDetailTacoBell(row, campo);

    return {
        Store: Number(claveTiendaTacoBell(row['Store Number'])),
        Date: row['Business Date'],
        'Net Sales': valor('(=) Net Sales'),
        'Sales Tax': valor('Cash in Drawer (-) Tax Amount'),
        Refunds: valor('Refunded Orders Amount'),
        Promo: valor('Gross Sales (-) Promo Amount'),
        Discounts: valor('Gross Sales (-) Discounts Amount'),
        'Paid Out': valor('Cash Reconciliation - Paid Voucher Amount'),
        'Paid In': 0,
        'Gift Card Redeemed':
            -valor('(-) Gift Card Redeemed Totals Amount'),
        'Gift Cards Sold':
            valor('Cash in Drawer (-) Gift Cards Sold Amount'),
        Mastercard:
            valor('Mastercard In-Store Amount') +
            valor('Mastercard Pre-Paid Amount'),
        Visa:
            valor('Visa In-Store Amount') +
            valor('Visa Pre-Paid Amount'),
        Discover:
            valor('Discover In-Store Amount') +
            valor('Discover Pre-Paid Amount'),
        Amex:
            valor('American Express In-Store Amount') +
            valor('American Express Pre-Paid Amount'),
        Debit: valor('Cash in Drawer (+) Debit Sales Amount'),
        'Cash +/-':
            valor('Cash Reconciliation - Cash Overshort Amount'),
        'Deposit 1':
            valor('Cash Reconciliation - Drawer Deposit Amount'),
        'Deposit 2': 0,
        'Deposit 3': 0,
        'Acct Cash': valor('Cash in Drawer'),
        'Grub Hub Payments': valor('Grubhub Pay Totals Amount'),
        'Uber Payments': valor('Uber Eats Pay Totals Amount'),
        'DoorDash Payment': valor('DoorDash Pay Totals Amount'),
        Donation: valor('TB Foundation Donation Amount')
    };
}

function obtenerTiendasNuevasSalesDetailTacoBell(
    rowsPrincipales,
    fechaPrincipal
) {
    if (!salesDetailRows?.length) {
        return [];
    }

    const tiendasUsadas = new Set(
        rowsPrincipales
            .map(row => claveTiendaTacoBell(row.Store))
            .filter(Boolean)
    );

    const fechaDetalle = normalizarFecha(
        fechaSalesDetailSeleccionada || fechaPrincipal
    );

    const tiendasDetalle = [];

    salesDetailRows.forEach(row => {
        const tienda = claveTiendaTacoBell(
            row['Store Number']
        );
        const fecha = normalizarFecha(
            row['Business Date']
        );

        if (
            !tienda ||
            !fecha ||
            fecha !== fechaDetalle ||
            tiendasUsadas.has(tienda)
        ) {
            return;
        }

        tiendasUsadas.add(tienda);
        tiendasDetalle.push(
            convertirSalesDetailTacoBell(row)
        );
    });

    return tiendasDetalle;
}

// ===========================================
// GENERAR CONCILIACION TACOBELL
// ===========================================
function generarConciliacionTacoBell() {
    if (!salesWorkbook) {
        Swal.fire('Error', 'No hay archivo Sales cargado', 'error');
        return;
    }

    const salesBook = salesWorkbook || workbook;
    const sourceSheetName = detectarHojaOrigen(salesBook);
    const sourceSheet = salesBook.Sheets[sourceSheetName];

    if (!sourceSheet) {
        Swal.fire('Error', 'No se encontró hoja origen', 'error');
        return;
    }

    const rows =
        salesRows?.length
            ? salesRows
            : leerFilasExcel(
                sourceSheet,
                [
                    'Store',
                    'Date'
                ],
                0
            );

    if (!rows.length) {
        Swal.fire(
            'Error',
            'No se encontraron filas validas en el archivo Sales de Taco Bell',
            'error'
        );
        return;
    }

    cargarFechasEnFiltro(rows, 'salesDateFilter', 'Date');

    // Obtener fecha más reciente
    const fechasValidas = rows.map(row => obtenerFechaFila(row))
        .filter(Boolean)
        .map(fecha => {
            if (fecha instanceof Date) return fecha;
            const d = new Date(fecha);
            return isNaN(d) ? null : d;
        })
        .filter(Boolean);

    if (!fechasValidas.length) {
        console.error('No se encontraron fechas válidas');
        return;
    }

    const fechaMax = new Date(Math.max(...fechasValidas.map(f => f.getTime())));
    const fechaMasReciente = `${String(fechaMax.getMonth() + 1).padStart(2, '0')}/${String(fechaMax.getDate()).padStart(2, '0')}/${fechaMax.getFullYear()}`;
    fechaConciliacionActual = fechaMasReciente;

    const fechaInput = document.getElementById('fechaConciliacion');
    if (fechaInput) {
        fechaInput.value = `${fechaMax.getFullYear()}-${String(fechaMax.getMonth() + 1).padStart(2, '0')}-${String(fechaMax.getDate()).padStart(2, '0')}`;
    }

    // Filtrar solo la fecha seleccionada
    const fechaFiltro = fechaSalesSeleccionada && fechaSalesSeleccionada.trim() !== '' ? fechaSalesSeleccionada : fechaMasReciente;
    fechaConciliacionActual = fechaFiltro;

    const textoFechaFiltro = String(fechaFiltro);
    const fechaIso = /^\d{4}-\d{2}-\d{2}$/.test(textoFechaFiltro)
        ? textoFechaFiltro
        : (() => {
            const partes = textoFechaFiltro.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            return partes
                ? `${partes[3]}-${partes[1].padStart(2, '0')}-${partes[2].padStart(2, '0')}`
                : '';
        })();

    if (fechaInput && fechaIso) {
        fechaInput.value = fechaIso;
    }

    const rowsFiltradas = rows.filter(row => {
        const fecha = obtenerFechaFila(row);
        if (!fecha) return false;
        return normalizarFecha(fecha) === normalizarFecha(fechaFiltro);
    });

    const tiendasNuevas =
        obtenerTiendasNuevasSalesDetailTacoBell(
            rowsFiltradas,
            fechaFiltro
        );

    const rowsCombinadas = [
        ...rowsFiltradas,
        ...tiendasNuevas
    ];

    datosExtraidos = rowsCombinadas.map(row => {
        const c = currentRestaurantConfig.columns;
        const store = row[c.store] || '';

        const netSales = Number(row[c.netSales]) || 0;
        const salesTax = Number(row[c.salesTax]) || 0;
        const discounts = Number(row[c.discounts]) || 0;
        const promo = Number(row[c.promo]) || 0;
        const donations = Number(row[c.donation]) || 0;
        const gcSold = Number(row[c.giftCardSold]) || 0;
        const paidOut = Number(row[c.paidOut]) || 0;
        const paidIn = Number(row[c.paidIn]) || 0;
        const mastercard = Number(row[c.mastercard]) || 0;
        const visa = Number(row[c.visa]) || 0;
        const discover = Number(row[c.discover]) || 0;
        const amex = Number(row[c.amex]) || 0;
        const debit = Number(row[c.debit]) || 0;
        const gcRedeem = (Number(row[c.giftCardRedeemed]) || 0) * -1;
        const acctCashOriginal = Number(row[c.acctCash]) || 0;
        const gh = Number(row[c.grubhub]) || 0;
        const uber = Number(row[c.uber]) || 0;
        const dd = Number(row[c.doordash]) || 0;
        const deposit1 = Number(row[c.deposit1]) || 0;
        const deposit2 = Number(row[c.deposit2]) || 0;
        const deposit3 = Number(row[c.deposit3]) || 0;
        const ebt = obtenerEBTPorStore(store) || 0;

        const acctCash = acctCashOriginal - paidOut - ebt;
        const grossSalesPos = netSales + promo + discounts - uber;
        const ccTotals = mastercard + visa + discover + debit;
        const deposits = deposit1 + deposit2 + deposit3;
        const totalRevenue = netSales + salesTax + gcSold + donations + paidIn - paidOut;
        const paymentsTotal = mastercard + visa + discover + amex + debit + gcRedeem + acctCash + gh + uber + dd + ebt;
        const oS = totalRevenue - paymentsTotal;
        const os = Number(row[c.cashPlusMinus]) || 0;
        const cashExpected = acctCash;
        const cashPlusMinus = Number(row[c.cashPlusMinus]) || 0;
        const difference = cashExpected - (deposit1 + deposit2 + deposit3) + cashPlusMinus + ebt;

        return {
            store,
            salesTax,
            grossSalesPos,
            discounts,
            promo,
            donations,
            netSales,
            gcSold,
            paidOut,
            paidIn,
            donation: donations,
            totalRevenue,
            mastercard,
            visa,
            discover,
            amex,
            debit,
            ebt,
            gcRedeem,
            acctCash,
            deposit1,
            deposit2,
            deposit3,
            deposits,
            gh,
            uber,
            dd,
            ccTotals: limpiarDecimal(ccTotals),
            paymentsTotal: limpiarDecimal(paymentsTotal),
            os: limpiarDecimal(os),
            oS: limpiarDecimal(oS),
            cashPlusMinus: limpiarDecimal(cashPlusMinus),
            cashExpected: limpiarDecimal(cashExpected),
            difference: limpiarDecimal(difference)
        };
    }).sort(
        (a, b) => Number(a.store) - Number(b.store)
    );

    document.getElementById('resultsSection').style.display = 'block';
    console.log(
        'datosExtraidos[0]',
        datosExtraidos[0]
    );
    generarTaxReviewTacoBell();

    console.table(taxReviewData.slice(0, 3));
    generarStatisticalDelivery();
    generarDailySalesRED();
    generarDailySales0314();
    generarDailySales0310();
    renderTablaSucursales();
    llenarFiltroTiendas();
    actualizarResumen();
    actualizarTotales();
    renderActiveTab();
}

function renderActiveTab() {

    switch (activeTab) {

        case 'dailySales':
            renderTablaSucursales();
            break;

        case 'dailySalesRed':
            renderDailySalesRED();
            break;

        case 'taxReview':
            renderTacoBellTaxReview();
            break;

        case 'statisticalDelivery':
            renderStatisticalDelivery();
            break;

        case 'dailySales0314':
            renderDailySales0314();
            break;

        case 'dailySales0310':
            renderDailySales0310();
            break;

    }

}

function generarTaxReviewTacoBell() {

    taxReviewData = datosExtraidos.map(row => {

        const taxRate =
            Number(obtenerTaxRate(row.store) || 0);

        const netSales =
            Number(row.netSales || 0);

        const discounts =
            Number(row.discounts || 0);

        const salesTaxPayable =
            Number(row.salesTax || 0);

        const taxableSales =
            netSales;

        const taxCalculation =
            taxableSales * taxRate;

        const taxDifference =
            taxCalculation - salesTaxPayable;

        const rateCalculation =
            taxableSales !== 0
                ? (salesTaxPayable / taxableSales) * 100
                : 0;

        const rateDifference =
            (taxRate * 100) - rateCalculation;

        return {

            store: row.store,

            taxRate,

            netSales,

            discounts,

            taxableSales,

            taxCalculation,

            salesTaxPayable,

            taxDifference,

            rateCalculation: Number(rateCalculation.toFixed(3)),

            rateDifference: Number(rateDifference.toFixed(3))

        };

    });

    console.table(
        taxReviewData.slice(0, 5)
    );

}

function generarStatisticalDelivery() {

    statisticalDeliveryData = [];

    let lineNo = 1;

    datosExtraidos.forEach(row => {

        const store = Number(row.store);

        // DoorDash
        if ((row.dd || 0) !== 0) {

            statisticalDeliveryData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                account: 990300,
                store,
                debit: row.dd,
                credit: 0
            });

            statisticalDeliveryData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                account: 990301,
                store,
                debit: 0,
                credit: row.dd
            });
        }

        // Uber
        if ((row.uber || 0) !== 0) {

            statisticalDeliveryData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                account: 990200,
                store,
                debit: row.uber,
                credit: 0
            });

            statisticalDeliveryData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                account: 990201,
                store,
                debit: 0,
                credit: row.uber
            });
        }

        // GrubHub
        if ((row.gh || 0) !== 0) {

            statisticalDeliveryData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                account: 990100,
                store,
                debit: row.gh,
                credit: 0
            });

            statisticalDeliveryData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                account: 990101,
                store,
                debit: 0,
                credit: row.gh
            });
        }

    });

}

function generarDailySalesRED() {

    dailySalesREDData = [];

    let lineNo = 1;

    datosExtraidos.forEach(row => {

        const store = row.store;

        const addRow = (
            memo,
            account,
            debit = 0,
            credit = 0,
            description2 = ''
        ) => {

            debit = Number(debit || 0);
            credit = Number(credit || 0);

            if (debit === 0 && credit === 0) return;

            dailySalesREDData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'POS Data Upload Sabretooth',
                memo,
                description2,
                account,
                locationId: store,
                debit,
                credit
            });

        };

        // Gross Food Sales
        addRow(
            'Gross Food Sales',
            400200,
            0,
            row.grossSalesPos
        );

        // Discounts - Employee meals
        addRow(
            'Discounts - Employee meals',
            410000,
            row.discounts,
            0
        );

        // Coupons - Promotions
        addRow(
            'Coupons - Promotions',
            410000,
            row.promo,
            0
        );

        // Sales Tax Payable
        addRow(
            'Sales Tax Payable',
            222000,
            0,
            row.salesTax
        );

        // Non Taxable Sales
        addRow(
            'Non Taxable Sales',
            400201,
            0,
            row.uber
        );

        // Donations
        addRow(
            'Donations',
            212000,
            0,
            row.donations
        );

        // Gift Cards SOLD
        addRow(
            'Gift Cards SOLD',
            115000,
            0,
            row.gcSold
        );

        // Paid Outs
        addRow(
            'Paid Outs',
            116200,
            row.paidOut,
            0
        );

        // Paid In
        addRow(
            'Paid In',
            116200,
            0,
            row.paidIn
        );

        // Cash Expected Deposit
        addRow(
            'Cash Expected Deposit',
            110500,
            row.acctCash,
            0
        );

        // Credit Cards Expected Deposit
        addRow(
            'Credit Cards Expected Deposit',
            111200,
            row.ccTotals,
            0
        );

        // EBT Expected Deposit
        addRow(
            'EBT Expected Deposit',
            111200,
            row.ebt,
            0
        );

        // AMEX Expected Deposit
        addRow(
            'AMEX Expected Deposit',
            111200,
            row.amex,
            0
        );

        // Gift Cards REEDEM
        addRow(
            'Gift Cards REEDEM',
            144800,
            Math.abs(row.gcRedeem || 0),
            0
        );

        // GrubHub
        addRow(
            'GrubHub',
            124000,
            row.gh,
            0,
            'GHD'
        );

        // Uber
        addRow(
            'Uber',
            122000,
            row.uber,
            0,
            'UBD'
        );

        // DoorDash
        addRow(
            'DoorDash',
            123000,
            row.dd,
            0,
            'DDD'
        );

        // Diff Between POS and Calc (Over)/Short
        addRow(
            'Diff Between POS and Calc (Over)/Short',
            652300,
            row.oS > 0 ? row.oS : 0,
            row.oS < 0 ? Math.abs(row.oS) : 0,
            'CASH'
        );

    });

    dailySalesREDData =
        ordenarDepositosTacoBellAlFinal(
            dailySalesREDData
        );

}
function generarDailySales0314() {
    dailySales0314Data = [];
    let lineNo = 1;
    datosExtraidos.forEach(row => {
        const store = Number(row.store);
        const grossSales = Number(row.grossSalesPos || 0);
        const discounts = Number(row.discounts || 0);
        const salesTax = Number(row.salesTax || 0);
        const donations = Number(row.donations || 0);
        const uber = Number(row.uber || 0);
        const gh = Number(row.gh || 0);
        const cashExpected = Number(row.cashExpected || 0);
        const dd = Number(row.dd || 0);
        const amex = Number(row.amex || 0);
        const mcVisaDiscover = Number(row.ccTotals || 0);
        const gcRedeem = Number(row.gcRedeem || 0);
        const gcSold = Number(row.gcSold || 0);
        const promo = Number(row.promo || 0);
        const paidOut = Number(row.paidOut || 0);
        const paidIn = Number(row.paidIn || 0);
        const ebt = Number(row.ebt || 0);
        const overShort = Number(row.oS || 0);

        function pushLine(
            acctNo,
            memo,
            debit = 0,
            credit = 0,
            deptId = ''
        ) {
            debit = Number(debit || 0);
            credit = Number(credit || 0);

            if (debit === 0 && credit === 0) return;

            dailySales0314Data.push({
                journal: 'SJ',
                lineNo: lineNo++,
                description: 'POS Data Upload Sabretooth',
                memo,
                deptId,
                acctNo,
                locationId: store,
                debit,
                credit
            });
        }

        pushLine(400200, 'Gross Food Sales', 0, grossSales);
        if (discounts) pushLine(410000, 'Discounts -Employee meals', discounts, 0);
        if (salesTax) pushLine(222000, 'Sales Tax Payable', 0, salesTax);
        if (uber) pushLine(400201, 'Non Taxable Sales', 0, uber);
        if (donations) pushLine(212000, 'Donations', 0, donations);
        if (cashExpected)
            pushLine(
                110500,
                'Cash Expected Deposit',
                cashExpected,
                0
            );
        if (mcVisaDiscover) pushLine(111200, 'Credit Cards Expected Deposit', mcVisaDiscover, 0);
        if (amex) pushLine(111200, 'AMEX Expected Deposit', amex, 0);
        if (gcRedeem) pushLine(144800, 'Gift Cards REEDEM', Math.abs(gcRedeem), 0);
        if (gh) pushLine(124000, 'GrubHub', gh, 0, 'GHD');
        if (uber) pushLine(122000, 'Uber', uber, 0, 'UBD');
        if (dd) pushLine(123000, 'DoorDash', dd, 0, 'DDD');
        if (gcSold) pushLine(115000, 'Gift Cards SOLD', 0, gcSold);

        if (promo)
            pushLine(
                410000,
                'Coupons - Promotions',
                promo,
                0
            );

        if (paidOut)
            pushLine(
                116200,
                'Paid Outs',
                paidOut,
                0
            );

        if (paidIn)
            pushLine(
                116200,
                'Paid In',
                0,
                paidIn
            );

        if (ebt)
            pushLine(
                111200,
                'EBT Expected Deposit',
                ebt,
                0
            );

        if (overShort)
            pushLine(
                652300,
                'Diff Between POS and Calc (Over)/Short',
                overShort > 0 ? overShort : 0,
                overShort < 0 ? Math.abs(overShort) : 0,
                'CASH'
            );
    });

    dailySales0314Data =
        ordenarDepositosTacoBellAlFinal(
            dailySales0314Data
        );
}

function obtenerLocationId(store) {
    const LOCATION_MAP = { 37014: 43415, 37015: 43414, 37016: 43413, 37017: 43412 };
    return LOCATION_MAP[store] || store;
}

function generarDailySales0310() {

    dailySales0310Data = [];

    let lineNo = 1;

    datosExtraidos.forEach(row => {

        const store = Number(row.store);

        const dd = Number(row.dd || 0);
        const uber = Number(row.uber || 0);
        const gh = Number(row.gh || 0);

        // DoorDash
        if (dd !== 0) {

            dailySales0310Data.push({
                journal: 'SJ',
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                acctNo: 990300,
                locationId: store,
                debit: dd,
                credit: 0
            });

            dailySales0310Data.push({
                journal: 'SJ',
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                acctNo: 990301,
                locationId: store,
                debit: 0,
                credit: dd
            });

        }

        // Uber
        if (uber !== 0) {

            dailySales0310Data.push({
                journal: 'SJ',
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                acctNo: 990200,
                locationId: store,
                debit: uber,
                credit: 0
            });

            dailySales0310Data.push({
                journal: 'SJ',
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                acctNo: 990201,
                locationId: store,
                debit: 0,
                credit: uber
            });

        }

        // GrubHub
        if (gh !== 0) {

            dailySales0310Data.push({
                journal: 'SJ',
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                acctNo: 990100,
                locationId: store,
                debit: gh,
                credit: 0
            });

            dailySales0310Data.push({
                journal: 'SJ',
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                acctNo: 990101,
                locationId: store,
                debit: 0,
                credit: gh
            });

        }

    });

}

const TB_TAX_RATE_DIRECT_API_BASE_URL = 'https://services.maps.cdtfa.ca.gov/api/taxrate';
const TB_TAX_STORE_STORAGE_KEY = 'tacoBellTaxStores.v1';
const TB_TAX_RATE_CACHE_STORAGE_KEY = 'tacoBellTaxRateCache.v1';
const TB_TAX_RATE_CACHE_DAYS = 30;
const TB_TAX_RATE_TIMEOUT_MS = 8000;

const TB_STORE_JURISDICTION_OVERRIDES = {
    13538: 'HERCULES',
    1549: 'FRESNO',
    2152: 'UNINCORPORATED AREA-ALAMEDA'
};

const TB_TAX_RATE_FALLBACK = {
    28841: 0.08125,
    28842: 0.08375,
    28843: 0.09125,
    28844: 0.08,
    28845: 0.08125,
    28846: 0.08375,
    30256: 0.08125,
    36224: 0.08125,
    37014: 0.0825,
    37732: 0.08375,
    30491: 0.0875,
    29423: 0.0825,
    32680: 0.0825,
    34793: 0.08975,
    36225: 0.08125,
    36930: 0.07975,
    37171: 0.0875,
    32952: 0.079
};

function normalizarStoreNumberTacoBell(store) {
    const numero = Number(String(store ?? '').replace(/\D/g, ''));
    return Number.isFinite(numero) ? numero : 0;
}

function normalizarTaxRateDecimalTacoBell(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;

    const numero = Number(
        String(valor).replace('%', '').replace(',', '.').trim()
    );

    if (!Number.isFinite(numero)) return 0;

    return numero > 1 ? numero / 100 : numero;
}

function parsearCoordenadasTacoBell(valor) {
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

function formatearPorcentajeTacoBell(valor) {
    return `${(Number(valor || 0) * 100).toFixed(3)}%`;
}

function normalizarTiendaTaxTacoBell(tienda) {
    const store = normalizarStoreNumberTacoBell(tienda.store);

    return {
        store,
        address: String(tienda.address || '').trim(),
        city: String(tienda.city || '').trim(),
        state: String(tienda.state || '').trim().toUpperCase(),
        zip: String(tienda.zip || '').trim(),
        latitude: Number.isFinite(Number(tienda.latitude))
            ? Number(tienda.latitude)
            : null,
        longitude: Number.isFinite(Number(tienda.longitude))
            ? Number(tienda.longitude)
            : null,
        preferredJurisdiction: String(
            tienda.preferredJurisdiction ||
            TB_STORE_JURISDICTION_OVERRIDES[store] ||
            ''
        ).trim(),
        taxRate: normalizarTaxRateDecimalTacoBell(
            tienda.taxRate ?? TB_TAX_RATE_FALLBACK[store] ?? 0
        )
    };
}

function cargarTiendasTaxTacoBell() {
    try {
        const guardadas = JSON.parse(
            localStorage.getItem(TB_TAX_STORE_STORAGE_KEY) || 'null'
        );

        if (Array.isArray(guardadas)) {
            return guardadas
                .map(normalizarTiendaTaxTacoBell)
                .filter(tienda => tienda.store);
        }
    } catch (error) {
        console.warn('No se pudo leer el catalogo local de tiendas TB:', error);
    }

    return (window.TACO_BELL_DEFAULT_TAX_STORES || [])
        .map(normalizarTiendaTaxTacoBell)
        .filter(tienda => tienda.store);
}

function guardarTiendasTaxTacoBell(tiendas) {
    const limpias = tiendas
        .map(normalizarTiendaTaxTacoBell)
        .filter(tienda => tienda.store)
        .sort((a, b) => a.store - b.store);

    localStorage.setItem(
        TB_TAX_STORE_STORAGE_KEY,
        JSON.stringify(limpias)
    );

    return limpias;
}

function buscarTiendaTaxTacoBell(store) {
    const numeroStore = normalizarStoreNumberTacoBell(store);

    return cargarTiendasTaxTacoBell()
        .find(tienda => tienda.store === numeroStore) || null;
}

function upsertTiendaTaxTacoBell(tienda) {
    const normalizada = normalizarTiendaTaxTacoBell(tienda);

    if (!normalizada.store) {
        throw new Error('La tienda debe tener un numero valido');
    }

    const tieneCoordenadas =
        Number.isFinite(normalizada.latitude) &&
        Number.isFinite(normalizada.longitude);

    if (!tieneCoordenadas && !normalizada.taxRate) {
        throw new Error('Agrega coordenadas validas o captura un tax rate manual.');
    }

    const tiendas = cargarTiendasTaxTacoBell()
        .filter(item => item.store !== normalizada.store);

    tiendas.push(normalizada);
    return guardarTiendasTaxTacoBell(tiendas);
}

function asegurarSweetAlertSobreModalTacoBell() {
    const styleId = 'tacobell-tax-swal-style';

    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        #tacoBellTaxStoreDialog .swal2-container,
        #tacoBellTaxStoreDialog .tb-tax-swal-container,
        .tb-tax-swal-container {
            z-index: 2147483647 !important;
            position: fixed !important;
            inset: 0 !important;
        }

        #tacoBellTaxStoreDialog .swal2-popup,
        #tacoBellTaxStoreDialog .tb-tax-swal-popup,
        .tb-tax-swal-popup {
            z-index: 2147483647 !important;
        }
    `;

    document.head.appendChild(style);
}

function swalTacoBellModal(opciones) {
    const dialog = document.getElementById('tacoBellTaxStoreDialog');

    if (!window.Swal) {
        return null;
    }

    asegurarSweetAlertSobreModalTacoBell();

    return Swal.fire({
        target: dialog && dialog.open ? dialog : document.body,
        heightAuto: false,
        scrollbarPadding: false,
        customClass: {
            container: 'tb-tax-swal-container',
            popup: 'tb-tax-swal-popup'
        },
        ...opciones
    });
}

async function eliminarTiendaTaxTacoBell(store) {
    const numeroStore = normalizarStoreNumberTacoBell(store);
    const tiendas = cargarTiendasTaxTacoBell();
    const tienda = tiendas.find(item => item.store === numeroStore);

    if (!numeroStore || !tienda) {
        mostrarEstadoTaxTacoBell('No se encontró la tienda seleccionada.', 'warning');
        return false;
    }

    let confirmado = false;

    if (window.Swal) {
        const resultado = await swalTacoBellModal({
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
            `¿Seguro que quieres eliminar la tienda ${tienda.store}?

` +
            `${tienda.city || ''} ${tienda.address || ''}

` +
            `Esta acción solo elimina la tienda del catálogo local de este navegador.`
        );
    }

    if (!confirmado) {
        mostrarEstadoTaxTacoBell('Eliminación cancelada.');
        return false;
    }

    guardarTiendasTaxTacoBell(
        tiendas.filter(item => item.store !== numeroStore)
    );

    const cache = cargarCacheTaxRateTacoBell();

    Object.keys(cache).forEach(clave => {
        if (clave.startsWith(`${numeroStore}|`)) {
            delete cache[clave];
        }
    });

    guardarCacheTaxRateTacoBell(cache);

    renderTiendasTaxTacoBell();
    recalcularTaxReviewTacoBellSiAplica();
    mostrarEstadoTaxTacoBell(`Tienda ${numeroStore} eliminada.`, 'success');

    return true;
}

function cargarCacheTaxRateTacoBell() {
    try {
        return JSON.parse(
            localStorage.getItem(TB_TAX_RATE_CACHE_STORAGE_KEY) || '{}'
        );
    } catch {
        return {};
    }
}

function guardarCacheTaxRateTacoBell(cache) {
    localStorage.setItem(
        TB_TAX_RATE_CACHE_STORAGE_KEY,
        JSON.stringify(cache)
    );
}

function crearClaveCacheTaxRateTacoBell(store, latitude, longitude) {
    return [
        normalizarStoreNumberTacoBell(store),
        Number(latitude || 0).toFixed(6),
        Number(longitude || 0).toFixed(6)
    ].join('|');
}

function obtenerCacheTaxRateTacoBell(store, latitude, longitude) {
    const cache = cargarCacheTaxRateTacoBell();
    const item = cache[crearClaveCacheTaxRateTacoBell(store, latitude, longitude)];

    if (!item?.rate || !item?.timestamp) return null;

    const edadDias =
        (Date.now() - new Date(item.timestamp).getTime()) / 86400000;

    if (edadDias > TB_TAX_RATE_CACHE_DAYS) return null;

    return item;
}

function guardarCacheTiendaTaxRateTacoBell(store, latitude, longitude, data) {
    const cache = cargarCacheTaxRateTacoBell();

    cache[crearClaveCacheTaxRateTacoBell(store, latitude, longitude)] = {
        ...data,
        rate: normalizarTaxRateDecimalTacoBell(data.rate),
        timestamp: new Date().toISOString()
    };

    guardarCacheTaxRateTacoBell(cache);
}

function elegirResultadoCDTFATacoBell(apiData, store, preferredJurisdiction = '') {
    const resultados = Array.isArray(apiData?.taxRateInfo)
        ? apiData.taxRateInfo
        : [];

    if (!resultados.length) return null;

    const storeNumber = normalizarStoreNumberTacoBell(store);
    const preferida = String(
        preferredJurisdiction ||
        TB_STORE_JURISDICTION_OVERRIDES[storeNumber] ||
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

function obtenerApiUrlTaxRatesTacoBell(location) {
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

function normalizarRespuestaBackendTaxRateTacoBell(data) {
    if (!data?.success) {
        return {
            success: false,
            error: data?.error || 'No se pudo consultar CDTFA'
        };
    }

    return {
        success: true,
        rate: normalizarTaxRateDecimalTacoBell(
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

async function consultarTaxRateCDTFATacoBell(location) {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);
    const state = String(location?.state || '').trim().toUpperCase();

    if (state && state !== 'CA') {
        return {
            success: false,
            skipped: true,
            error: 'CDTFA solo aplica para tiendas CA'
        };
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return {
            success: false,
            error: 'La tienda no tiene coordenadas validas'
        };
    }

    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        TB_TAX_RATE_TIMEOUT_MS
    );

    try {
        const backendUrl = obtenerApiUrlTaxRatesTacoBell({
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
                    return normalizarRespuestaBackendTaxRateTacoBell(data);
                }

                console.warn(
                    'Backend CDTFA no disponible para Taco Bell, intentando consulta directa:',
                    data?.error || response.status
                );
            } catch (error) {
                if (error?.name === 'AbortError') throw error;
                console.warn(
                    'No se pudo consultar CDTFA via backend para Taco Bell:',
                    error
                );
            }
        }

        const url =
            `${TB_TAX_RATE_DIRECT_API_BASE_URL}/GetRateByLngLat?Latitude=${encodeURIComponent(latitude)}&Longitude=${encodeURIComponent(longitude)}`;

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

        const rateInfo = elegirResultadoCDTFATacoBell(
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
            rate: normalizarTaxRateDecimalTacoBell(rateInfo.rate),
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

function obtenerTaxRateLocalTacoBell(store) {
    const numeroStore = normalizarStoreNumberTacoBell(store);
    if (!numeroStore) return 0;

    const tienda = buscarTiendaTaxTacoBell(numeroStore);

    if (
        tienda &&
        Number.isFinite(tienda.latitude) &&
        Number.isFinite(tienda.longitude)
    ) {
        const cache = obtenerCacheTaxRateTacoBell(
            numeroStore,
            tienda.latitude,
            tienda.longitude
        );

        if (cache?.rate) return Number(cache.rate);
    }

    return normalizarTaxRateDecimalTacoBell(
        tienda?.taxRate || TB_TAX_RATE_FALLBACK[numeroStore] || 0
    );
}

function obtenerTaxRate(store) {
    return obtenerTaxRateLocalTacoBell(store);
}

function estadoTaxRateDesdeCacheTacoBell(tienda) {
    const cache = obtenerCacheTaxRateTacoBell(
        tienda.store,
        tienda.latitude,
        tienda.longitude
    );

    if (cache?.rate) {
        return `${formatearPorcentajeTacoBell(cache.rate)} · CDTFA`;
    }

    if (tienda.taxRate) {
        return `${formatearPorcentajeTacoBell(tienda.taxRate)} · local`;
    }

    return 'Pendiente';
}

function actualizarPanelTaxTacoBell(codigo = '') {
    const panel = document.getElementById('tacoBellTaxStorePanel');
    if (!panel) return;

    const codigoActual = codigo ||
        document
            .getElementById('selectRestaurante')
            ?.selectedOptions?.[0]
            ?.dataset?.codigo ||
        '';

    panel.style.display = codigoActual === 'taco-bell' ? '' : 'none';

    if (codigoActual === 'taco-bell') {
        renderTiendasTaxTacoBell();
    }
}

function limpiarFormularioTiendaTaxTacoBell() {
    [
        'tbTaxStoreNumber',
        'tbTaxStoreAddress',
        'tbTaxStoreCity',
        'tbTaxStoreState',
        'tbTaxStoreZip',
        'tbTaxStoreCoordinates',
        'tbTaxStoreRate',
        'tbTaxStoreJurisdiction'
    ].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
}

function cargarFormularioTiendaTaxTacoBell(store) {
    const tienda = buscarTiendaTaxTacoBell(store);
    if (!tienda) return;

    const valores = {
        tbTaxStoreNumber: tienda.store,
        tbTaxStoreAddress: tienda.address,
        tbTaxStoreCity: tienda.city,
        tbTaxStoreState: tienda.state,
        tbTaxStoreZip: tienda.zip,
        tbTaxStoreCoordinates:
            tienda.latitude !== null && tienda.longitude !== null
                ? `${tienda.latitude}, ${tienda.longitude}`
                : '',
        tbTaxStoreRate: tienda.taxRate
            ? formatearPorcentajeTacoBell(tienda.taxRate)
            : '',
        tbTaxStoreJurisdiction: tienda.preferredJurisdiction
    };

    Object.entries(valores).forEach(([id, valor]) => {
        const input = document.getElementById(id);
        if (input) input.value = valor ?? '';
    });
}

function leerFormularioTiendaTaxTacoBell() {
    const coords = parsearCoordenadasTacoBell(
        document.getElementById('tbTaxStoreCoordinates')?.value
    );

    return {
        store: document.getElementById('tbTaxStoreNumber')?.value,
        address: document.getElementById('tbTaxStoreAddress')?.value,
        city: document.getElementById('tbTaxStoreCity')?.value,
        state: document.getElementById('tbTaxStoreState')?.value,
        zip: document.getElementById('tbTaxStoreZip')?.value,
        latitude: coords.latitude,
        longitude: coords.longitude,
        taxRate: document.getElementById('tbTaxStoreRate')?.value,
        preferredJurisdiction:
            document.getElementById('tbTaxStoreJurisdiction')?.value
    };
}

function mostrarEstadoTaxTacoBell(texto, tipo = 'info') {
    const status = document.getElementById('tbTaxStoreStatus');
    if (!status) return;

    status.textContent = texto;
    status.dataset.type = tipo;
}

function renderTiendasTaxTacoBell() {
    const tbody = document.getElementById('tbTaxStoreBody');
    const count = document.getElementById('tbTaxStoreCount');

    if (!tbody) return;

    const tiendas = cargarTiendasTaxTacoBell();

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
            <td>${tienda.state || '-'}</td>
            <td>${tienda.zip || '-'}</td>
            <td>${
                tienda.latitude !== null && tienda.longitude !== null
                    ? `${tienda.latitude.toFixed(6)}, ${tienda.longitude.toFixed(6)}`
                    : '-'
            }</td>
            <td>${tienda.preferredJurisdiction || '-'}</td>
            <td>${estadoTaxRateDesdeCacheTacoBell(tienda)}</td>
            <td class="bk-tax-store-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-tb-tax-edit="${tienda.store}">
                    Editar
                </button>
                <button type="button" class="btn btn-danger btn-sm" data-tb-tax-delete="${tienda.store}">
                    Quitar
                </button>
            </td>
        </tr>
    `).join('');

    if (!tiendas.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="bk-tax-empty">
                    No hay tiendas configuradas.
                </td>
            </tr>
        `;
    }
}

function recalcularTaxReviewTacoBellSiAplica() {
    if (!Array.isArray(datosExtraidos) || !datosExtraidos.length) return;

    generarTaxReviewTacoBell();

    if (activeTab === 'taxReview') {
        renderTacoBellTaxReview();
    }
}

async function refrescarTaxRatesTacoBell() {
    const tiendasBase = cargarTiendasTaxTacoBell();
    const tiendas = tiendasBase.filter(
        tienda => String(tienda.state || '').toUpperCase() === 'CA'
    );

    if (!tiendas.length) {
        mostrarEstadoTaxTacoBell('No hay tiendas CA para actualizar con CDTFA.', 'warning');
        return;
    }

    let confirmado = false;

    if (window.Swal) {
        const resultado = await swalTacoBellModal({
            icon: 'question',
            title: 'Actualizar rates CDTFA',
            text: `Se actualizarán ${tiendas.length} tiendas CA configuradas, incluyendo las tiendas nuevas agregadas manualmente. Las tiendas fuera de CA quedan con rate local/manual.`,
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
            `Se actualizarán ${tiendas.length} tiendas CA configuradas.

¿Deseas continuar?`
        );
    }

    if (!confirmado) {
        mostrarEstadoTaxTacoBell('Actualización cancelada.');
        return;
    }

    const botonActualizar = document.getElementById('tbTaxRefreshRates');

    if (botonActualizar) {
        botonActualizar.disabled = true;
        botonActualizar.dataset.originalText = botonActualizar.textContent;
        botonActualizar.textContent = 'Actualizando...';
    }

    mostrarEstadoTaxTacoBell(
        `Actualizando 0/${tiendas.length} desde CDTFA. Las tiendas no CA quedan manuales.`
    );

    let ok = 0;
    let fallos = 0;
    let sinCoordenadas = 0;

    try {
        for (let i = 0; i < tiendas.length; i += 1) {
            const tienda = tiendas[i];
            const tieneCoordenadas =
                Number.isFinite(Number(tienda.latitude)) &&
                Number.isFinite(Number(tienda.longitude));

            if (!tieneCoordenadas) {
                sinCoordenadas += 1;
                fallos += 1;

                console.warn(
                    `Tienda Taco Bell ${tienda.store} sin coordenadas válidas. No se puede consultar CDTFA.`
                );

                mostrarEstadoTaxTacoBell(
                    `Actualizando ${i + 1}/${tiendas.length} desde CDTFA... OK: ${ok}, sin coordenadas: ${sinCoordenadas}, fallas: ${fallos}`,
                    'warning'
                );

                continue;
            }

            const result = await consultarTaxRateCDTFATacoBell(tienda);

            if (result.success) {
                guardarCacheTiendaTaxRateTacoBell(
                    tienda.store,
                    tienda.latitude,
                    tienda.longitude,
                    result
                );

                upsertTiendaTaxTacoBell({
                    ...tienda,
                    taxRate: result.rate
                });

                ok += 1;
            } else {
                fallos += 1;
                console.warn(
                    `No se pudo actualizar CDTFA para tienda Taco Bell ${tienda.store}:`,
                    result.error
                );
            }

            mostrarEstadoTaxTacoBell(
                `Actualizando ${i + 1}/${tiendas.length} desde CDTFA... OK: ${ok}, sin coordenadas: ${sinCoordenadas}, fallas: ${fallos}`,
                fallos ? 'warning' : 'info'
            );
        }

        renderTiendasTaxTacoBell();
        recalcularTaxReviewTacoBellSiAplica();

        mostrarEstadoTaxTacoBell(
            `Actualización terminada. CDTFA OK: ${ok}. Sin coordenadas: ${sinCoordenadas}. Fallas: ${fallos}.`,
            fallos ? 'warning' : 'success'
        );
    } finally {
        if (botonActualizar) {
            botonActualizar.disabled = false;
            botonActualizar.textContent =
                botonActualizar.dataset.originalText || 'Actualizar rates CDTFA';
        }
    }
}

function abrirModalTaxTacoBell() {
    const dialog = document.getElementById('tacoBellTaxStoreDialog');
    if (!dialog) return;

    dialog.classList.remove('is-form-open');
    renderTiendasTaxTacoBell();
    mostrarEstadoTaxTacoBell('Catalogo listo. Taco Bell usara estos rates locales.');

    if (typeof dialog.showModal === 'function') {
        dialog.showModal();
    } else {
        dialog.setAttribute('open', 'open');
    }
}

function cerrarModalTaxTacoBell() {
    const dialog = document.getElementById('tacoBellTaxStoreDialog');
    if (!dialog) return;

    dialog.classList.remove('is-form-open');
    if (typeof dialog.close === 'function') {
        dialog.close();
    } else {
        dialog.removeAttribute('open');
    }
}

function inicializarPanelTaxRatesTacoBell() {
    if (window.__tacoBellTaxPanelReady) return;
    window.__tacoBellTaxPanelReady = true;

    document
        .getElementById('tbTaxOpenModal')
        ?.addEventListener('click', abrirModalTaxTacoBell);

    document
        .getElementById('tbTaxCloseModal')
        ?.addEventListener('click', cerrarModalTaxTacoBell);

    document
        .getElementById('tbTaxCloseFooter')
        ?.addEventListener('click', cerrarModalTaxTacoBell);

    document
        .getElementById('tbTaxAddStore')
        ?.addEventListener('click', () => {
            const dialog = document.getElementById('tacoBellTaxStoreDialog');

            limpiarFormularioTiendaTaxTacoBell();
            dialog?.classList.add('is-form-open');
            mostrarEstadoTaxTacoBell('Captura los datos de la tienda nueva.');
            document.getElementById('tbTaxStoreNumber')?.focus();
        });

    document
        .getElementById('tbTaxSaveStore')
        ?.addEventListener('click', () => {
            try {
                upsertTiendaTaxTacoBell(
                    leerFormularioTiendaTaxTacoBell()
                );

                renderTiendasTaxTacoBell();
                recalcularTaxReviewTacoBellSiAplica();
                mostrarEstadoTaxTacoBell('Tienda guardada correctamente.', 'success');
                limpiarFormularioTiendaTaxTacoBell();
                document
                    .getElementById('tacoBellTaxStoreDialog')
                    ?.classList.remove('is-form-open');
            } catch (error) {
                mostrarEstadoTaxTacoBell(error.message, 'error');

                if (window.Swal) {
                    swalTacoBellModal({
                        icon: 'warning',
                        title: 'Revisa la tienda',
                        text: error.message,
                        confirmButtonText: 'Entendido'
                    });
                }
            }
        });

    document
        .getElementById('tbTaxClearStore')
        ?.addEventListener('click', () => {
            limpiarFormularioTiendaTaxTacoBell();
            document
                .getElementById('tacoBellTaxStoreDialog')
                ?.classList.remove('is-form-open');
            mostrarEstadoTaxTacoBell('Edicion cancelada.');
        });

    document
        .getElementById('tbTaxRefreshRates')
        ?.addEventListener('click', () => {
            refrescarTaxRatesTacoBell();
        });

    document
        .getElementById('tbTaxResetStores')
        ?.addEventListener('click', async () => {
            const confirmar = !window.Swal || (await swalTacoBellModal({
                icon: 'warning',
                title: 'Restaurar tiendas Taco Bell',
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

            localStorage.removeItem(TB_TAX_STORE_STORAGE_KEY);
            renderTiendasTaxTacoBell();
            recalcularTaxReviewTacoBellSiAplica();
            limpiarFormularioTiendaTaxTacoBell();
            document
                .getElementById('tacoBellTaxStoreDialog')
                ?.classList.remove('is-form-open');
            mostrarEstadoTaxTacoBell('Catalogo inicial restaurado.', 'success');
        });

    document
        .getElementById('tbTaxStoreBody')
        ?.addEventListener('click', async event => {
            const editButton = event.target.closest('[data-tb-tax-edit]');
            const deleteButton = event.target.closest('[data-tb-tax-delete]');

            if (editButton) {
                cargarFormularioTiendaTaxTacoBell(
                    editButton.dataset.tbTaxEdit
                );
                document
                    .getElementById('tacoBellTaxStoreDialog')
                    ?.classList.add('is-form-open');
                mostrarEstadoTaxTacoBell('Editando tienda seleccionada.');
                document.getElementById('tbTaxStoreNumber')?.focus();
                return;
            }

            if (deleteButton) {
                event.preventDefault();

                const store = deleteButton.dataset.tbTaxDelete;
                await eliminarTiendaTaxTacoBell(store);
            }
        });

    actualizarPanelTaxTacoBell();
}

document.addEventListener(
    'DOMContentLoaded',
    inicializarPanelTaxRatesTacoBell
);

function renderTacoBellTaxReview() {

    const data = taxReviewData.map(row => ({

        STORE: row.store,

        TAXRATE:
            (row.taxRate * 100).toFixed(3) + '%',

        'NET SALES':
            Number(row.netSales || 0).toFixed(2),

        DISCOUNTS:
            Number(row.discounts || 0).toFixed(2),

        'TAXABLE SALES':
            Number(row.taxableSales || 0).toFixed(2),

        'TAX CALCULATION':
            Number(row.taxCalculation || 0).toFixed(2),

        'SALES TAX PAYABLE':
            Number(row.salesTaxPayable || 0).toFixed(2),

        DIFFERENCE:
            Number(row.taxDifference || 0).toFixed(2),

        'RATE CALCULATION':
            Number(row.rateCalculation || 0).toFixed(3) + '%',

        'RATE DIFFERENCE':
            Number(row.rateDifference || 0).toFixed(3) + '%'

    }));

    renderArrayToMainTable(data);

}

function renderStatisticalDelivery() {
    renderArrayToMainTable(
        statisticalDeliveryData
    );
}

function renderDailySalesRED() {
    renderArrayToMainTable(
        dailySalesREDData
    );
}

function renderDailySales0314() {
    renderArrayToMainTable(
        dailySales0314Data
    );
}

function renderDailySales0310() {
    renderArrayToMainTable(
        dailySales0310Data
    );
}
function renderArrayToMainTable(data) {

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

    if (!data || !data.length) return;

    const columns =
        Object.keys(data[0]);

    const trHead =
        document.createElement('tr');

    columns.forEach(col => {

        const th =
            document.createElement('th');

        th.textContent = col;

        if (
            typeof esColumnaOS === 'function' &&
            esColumnaOS({ key: col, label: col })
        ) {
            th.classList.add('os-column-header');
        }

        trHead.appendChild(th);

    });

    head.appendChild(trHead);

    data.forEach(row => {

        const tr =
            document.createElement('tr');

        columns.forEach(col => {

            const td =
                document.createElement('td');

            const valor = row[col];
            const columnaOS =
                typeof esColumnaOS === 'function' &&
                esColumnaOS({ key: col, label: col });
            const valorNumericoOS = Number(valor);

            if (typeof valor === 'number') {
                td.textContent = valor.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
                td.classList.add('text-right');
            } else {
                td.textContent = valor ?? '';
            }

            if (columnaOS && Number.isFinite(valorNumericoOS)) {
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
