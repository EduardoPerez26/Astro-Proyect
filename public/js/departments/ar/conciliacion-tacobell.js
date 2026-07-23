// conciliacion-tacobell.js
let taxReviewData = [];
let statisticalDeliveryData = [];
let dailySalesREDData = [];
let dailySales0314Data = [];
let dailySales0310Data = [];
let tacoBellExpectedDepositsData = [];
let ebtCashExpectedData = [];
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

function claveStoreTacoBell(valor) {
    const digitos = String(valor ?? '').replace(/\D/g, '');
    return digitos ? String(Number(digitos)) : '';
}

function convertirSalesDetailTacoBell(row) {
    const valor = campo =>
        numeroSalesDetailTacoBell(row, campo);

    return {
        Store: Number(claveStoreTacoBell(row['Store Number'])),
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

function obtenerStoresNuevasSalesDetailTacoBell(
    rowsPrincipales,
    fechaPrincipal
) {
    if (!salesDetailRows?.length) {
        return [];
    }

    const tiendasUsadas = new Set(
        rowsPrincipales
            .map(row => claveStoreTacoBell(row.Store))
            .filter(Boolean)
    );

    const fechaDetalle = normalizarFecha(
        selectedSalesDetailDate || fechaPrincipal
    );

    const tiendasDetalle = [];

    salesDetailRows.forEach(row => {
        const tienda = claveStoreTacoBell(
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
        Swal.fire('Error', 'No Sales file loaded', 'error');
        return;
    }

    const salesBook = salesWorkbook || workbook;
    const sourceSheetName = detectarHojaOrigen(salesBook);
    const sourceSheet = salesBook.Sheets[sourceSheetName];

    if (!sourceSheet) {
        Swal.fire('Error', 'Source sheet was not found', 'error');
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
            'No valid rows were found in the Taco Bell Sales file',
            'error'
        );
        return;
    }

    cargarFechasEnFiltro(rows, 'salesDateFilter', 'Date');

    // Get the most recent date.
    const fechasValidas = rows.map(row => obtenerFechaFila(row))
        .filter(Boolean)
        .map(fecha => {
            if (fecha instanceof Date) return fecha;
            const d = new Date(fecha);
            return isNaN(d) ? null : d;
        })
        .filter(Boolean);

    if (!fechasValidas.length) {
        console.error('No valid dates were found');
        return;
    }

    const fechaMax = new Date(Math.max(...fechasValidas.map(f => f.getTime())));
    const fechaMasReciente = `${String(fechaMax.getMonth() + 1).padStart(2, '0')}/${String(fechaMax.getDate()).padStart(2, '0')}/${fechaMax.getFullYear()}`;
    fechaConciliacionActual = fechaMasReciente;

    const fechaInput = document.getElementById('fechaConciliacion');
    if (fechaInput) {
        fechaInput.value = `${fechaMax.getFullYear()}-${String(fechaMax.getMonth() + 1).padStart(2, '0')}-${String(fechaMax.getDate()).padStart(2, '0')}`;
    }

    // Filter only the selected date.
    const fechaFiltro = selectedSalesDate && selectedSalesDate.trim() !== '' ? selectedSalesDate : fechaMasReciente;
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
        obtenerStoresNuevasSalesDetailTacoBell(
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

    generarTaxReviewTacoBell();

    generarStatisticalDelivery();
    generarDailySalesRED();
    generarDailySales0314();
    generarDailySales0310();

    generarExpectedDepositsTacoBell();
    asegurarPestanaExpectedDepositsTacoBell();
    renderTablaSucursales();

    llenarFiltroStores();
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

        case 'ebtCashExpected':
        case 'expectedDeposits':
        case 'cashExpected':
            renderExpectedDepositsTacoBell();
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


function generarExpectedDepositsTacoBell() {
    tacoBellExpectedDepositsData = [];

    const cashRows = [];
    const ebtRows = [];

    (datosExtraidos || []).forEach(row => {
        const store = Number(row.store || row.Store || row.locationId || 0);

        // Show only these stores:
        // 28841, 28843, 28844, 28845, 28846, 30256, 30491, 36224
        if (!TACO_BELL_DEPOSITOS_AL_FINAL.has(store)) {
            return;
        }

        const date = fechaConciliacionActual || row.date || row.Date || '';
        const cashExpected = Number(row.cashExpected || row.acctCash || 0);
        const ebt = Number(row.ebt || 0);

        if (Math.abs(cashExpected) >= 0.005) {
            cashRows.push({
                journal: 'SJ',
                date,
                lineNo: 0,
                description: 'POS Data Upload Sabretooth',
                memo: 'Cash Expected Deposit',
                deptId: 'CASH',
                acctNo: 110500,
                locationId: store,
                debit: Number(cashExpected.toFixed(2)),
                credit: 0
            });
        }

        if (Math.abs(ebt) >= 0.005) {
            ebtRows.push({
                journal: 'SJ',
                date,
                lineNo: 0,
                description: 'POS Data Upload Sabretooth',
                memo: 'EBT Expected Deposit',
                deptId: 'EBT',
                acctNo: 111200,
                locationId: store,
                debit: Number(ebt.toFixed(2)),
                credit: 0
            });
        }
    });

    tacoBellExpectedDepositsData = [
        ...cashRows,
        ...ebtRows
    ].map((row, index) => ({
        ...row,
        lineNo: index + 1
    }));
}


function renderExpectedDepositsTacoBell() {
    generarExpectedDepositsTacoBell();

    renderArrayToMainTable(
        tacoBellExpectedDepositsData
    );
}

function activarPestanaExpectedDepositsVisual(button) {
    document
        .querySelectorAll('[data-tab], .tab-btn, .tab-button, .tabs button, .results-tabs button')
        .forEach(tab => tab.classList.remove('active'));

    button?.classList.add('active');
}

function conectarBotonExpectedDeposits(button) {
    if (!button || button.dataset.expectedDepositsReady === 'true') return;

    button.dataset.expectedDepositsReady = 'true';
    button.dataset.tab = 'expectedDeposits';
    button.removeAttribute('onclick');
    button.type = 'button';

    button.addEventListener('click', event => {
        event.preventDefault();

        activeTab = 'expectedDeposits';
        activarPestanaExpectedDepositsVisual(button);

        if (typeof renderActiveTab === 'function') {
            renderActiveTab();
        }
    });
}

function asegurarPestanaExpectedDepositsTacoBell() {
    const existente = document.querySelector('[data-tab="expectedDeposits"]');

    if (existente) {
        conectarBotonExpectedDeposits(existente);
        return;
    }

    const referencia =
        document.querySelector('[data-tab="dailySales0314"]') ||
        document.querySelector('[data-tab="dailySalesRed"]') ||
        document.querySelector('[data-tab="taxReview"]') ||
        document.querySelector('.tab-btn, .tab-button, .tabs button, .results-tabs button');

    let contenedor =
        referencia?.parentElement ||
        document.getElementById('resultsTabs') ||
        document.querySelector('.tabs, .tab-buttons, .results-tabs, .nav-tabs');

    if (!contenedor) {
        const tableHead = document.getElementById('conciliacionTableHead');
        const table = tableHead?.closest('table');

        if (!table?.parentElement) return;

        contenedor = document.createElement('div');
        contenedor.className = 'tabs results-tabs';
        contenedor.style.marginBottom = '12px';
        table.parentElement.insertBefore(contenedor, table);
    }

    const button = referencia
        ? referencia.cloneNode(false)
        : document.createElement('button');

    button.textContent = 'EBT / Cash Expected';
    button.classList.remove('active');
    conectarBotonExpectedDeposits(button);

    contenedor.appendChild(button);
}

const TB_TAX_RATE_DIRECT_API_BASE_URL = 'https://services.maps.cdtfa.ca.gov/api/taxrate';
const TB_TAX_RATE_CACHE_STORAGE_KEY = 'tacoBellTaxRateCache.v1';
const TB_TAX_RATE_CACHE_DAYS = 30;
const TB_TAX_RATE_TIMEOUT_MS = 8000;
const TB_RESTAURANT_CODE = 'taco-bell';

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

const tbTaxCatalog = window.createTaxStoreCatalog({
    restaurantCode: TB_RESTAURANT_CODE,
    rateCacheStorageKey: TB_TAX_RATE_CACHE_STORAGE_KEY,
    rateCacheDays: TB_TAX_RATE_CACHE_DAYS,
    jurisdictionOverrides: TB_STORE_JURISDICTION_OVERRIDES,
    rateFallback: TB_TAX_RATE_FALLBACK,
    includeState: true,
    defaultState: '',
    getDefaults: () => window.TACO_BELL_DEFAULT_TAX_STORES || []
});

function normalizarStoreNumberTacoBell(store) {
    return tbTaxCatalog.normalizeStoreNumber(store);
}

function normalizarTaxRateDecimalTacoBell(valor) {
    return tbTaxCatalog.normalizeTaxRateDecimal(valor);
}

function parsearCoordenadasTacoBell(valor) {
    return tbTaxCatalog.parseCoordinates(valor);
}

function formatearPorcentajeTacoBell(valor) {
    return `${(Number(valor || 0) * 100).toFixed(3)}%`;
}

function normalizarStoreTaxTacoBell(tienda) {
    return tbTaxCatalog.normalizeStoreRecord(tienda);
}

function cargarStoresTaxTacoBell() {
    return tbTaxCatalog.cargar();
}

function guardarStoresTaxTacoBell(tiendas) {
    return tbTaxCatalog.guardar(tiendas);
}

function inicializarCatalogoTaxTacoBell() {
    return tbTaxCatalog.inicializarCatalogo(renderStoresTaxTacoBell);
}

function buscarStoreTaxTacoBell(store) {
    const numeroStore = normalizarStoreNumberTacoBell(store);

    return cargarStoresTaxTacoBell()
        .find(tienda => tienda.store === numeroStore) || null;
}

function upsertStoreTaxTacoBell(tienda) {
    return tbTaxCatalog.upsert(tienda);
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

        #tacoBellTaxStoreDialog .swal2-container-dialog,
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

async function eliminarStoreTaxTacoBell(store) {
    const numeroStore = normalizarStoreNumberTacoBell(store);
    const tiendas = cargarStoresTaxTacoBell();
    const tienda = tiendas.find(item => item.store === numeroStore);

    if (!numeroStore || !tienda) {
        mostrarStatusTaxTacoBell('The selected store was not found.', 'warning');
        return false;
    }

    let confirmado = false;

    if (window.Swal) {
        const resultado = await swalTacoBellModal({
            icon: 'warning',
            title: 'Delete store',
            html: `
                <p>Are you sure you want to delete store <strong>${tienda.store}</strong>?</p>
                <p><strong>${tienda.city || ''}</strong> ${tienda.address || ''}</p>
                <p>This only removes the store from this browser's local catalog.</p>
            `,
            showCancelButton: true,
            confirmButtonText: 'Yes, delete',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#c01818',
            cancelButtonColor: '#6c757d',
            reverseButtons: true,
            focusCancel: true
        });

        confirmado = resultado.isConfirmed;
    } else {
        confirmado = confirm(
            `Are you sure you want to delete store ${tienda.store}?

` +
            `${tienda.city || ''} ${tienda.address || ''}

` +
            `This only removes the store from this browser's local catalog.`
        );
    }

    if (!confirmado) {
        mostrarStatusTaxTacoBell('Deletion canceled.');
        return false;
    }

    try {
        await tbTaxCatalog.eliminarRemoto(numeroStore);
    } catch (error) {
        console.warn('Store could not be deleted from the server:', error);
        mostrarStatusTaxTacoBell('The store could not be deleted. Try again.', 'warning');
        return false;
    }

    guardarStoresTaxTacoBell(
        tiendas.filter(item => item.store !== numeroStore)
    );
    tbTaxCatalog.limpiarCacheRateParaStore(numeroStore);

    renderStoresTaxTacoBell();
    recalcularTaxReviewTacoBellSiAplica();
    mostrarStatusTaxTacoBell(`Store ${numeroStore} deleted.`, 'success');

    return true;
}

function cargarCacheTaxRateTacoBell() {
    return tbTaxCatalog.cargarCacheRate();
}

function guardarCacheTaxRateTacoBell(cache) {
    return tbTaxCatalog.guardarCacheRate(cache);
}

function crearClaveCacheTaxRateTacoBell(store, latitude, longitude) {
    return [
        normalizarStoreNumberTacoBell(store),
        Number(latitude || 0).toFixed(6),
        Number(longitude || 0).toFixed(6)
    ].join('|');
}

function obtenerCacheTaxRateTacoBell(store, latitude, longitude) {
    return tbTaxCatalog.obtenerCacheRate(store, latitude, longitude);
}

function guardarCacheStoreTaxRateTacoBell(store, latitude, longitude, data) {
    return tbTaxCatalog.guardarCacheStoreRate(store, latitude, longitude, data);
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
            error: data?.error || 'CDTFA could not be queried'
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
            error: 'CDTFA only applies to CA stores'
        };
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return {
            success: false,
            error: 'The store does not have valid coordinates'
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
                const token = localStorage.getItem('token');
                const response = await fetch(backendUrl, {
                    method: 'GET',
                    credentials: 'include',
                    headers: token
                        ? { Authorization: `Bearer ${token}` }
                        : {},
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
                    'CDTFA could not be queried through the backend for Taco Bell:',
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
                : 'CDTFA could not be queried'
        };
    } finally {
        clearTimeout(timeout);
    }
}

function obtenerTaxRateLocalTacoBell(store) {
    const numeroStore = normalizarStoreNumberTacoBell(store);
    if (!numeroStore) return 0;

    const tienda = buscarStoreTaxTacoBell(numeroStore);

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
        return `${formatearPorcentajeTacoBell(cache.rate)} / CDTFA`;
    }

    if (tienda.taxRate) {
        return `${formatearPorcentajeTacoBell(tienda.taxRate)} / local`;
    }

    return 'Pending';
}

function actualizarPanelTaxTacoBell(codigo = '') {
    const panel = document.getElementById('tacoBellTaxStorePanel');
    if (!panel) return;

    const codigoActual = codigo ||
        document
            .getElementById('selectRestaurant')
            ?.selectedOptions?.[0]
            ?.dataset?.codigo ||
        '';

    panel.style.display = codigoActual === 'taco-bell' ? '' : 'none';

    if (codigoActual === 'taco-bell') {
        renderStoresTaxTacoBell();
        inicializarCatalogoTaxTacoBell();
    }
}

function limpiarFormularioStoreTaxTacoBell() {
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

    const formMode = document.getElementById('tbTaxFormMode');
    if (formMode) formMode.textContent = 'New store';
}

function cargarFormularioStoreTaxTacoBell(store) {
    const tienda = buscarStoreTaxTacoBell(store);
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

    const formMode = document.getElementById('tbTaxFormMode');
    if (formMode) formMode.textContent = `Editing store ${tienda.store}`;
}

function leerFormularioStoreTaxTacoBell() {
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

function mostrarStatusTaxTacoBell(texto, tipo = 'info') {
    const status = document.getElementById('tbTaxStoreStatus');
    if (status) {
        status.textContent = texto;
        status.dataset.type = tipo;
    }

    const panelStatus = document.getElementById('tbTaxPanelStatus');
    if (panelStatus) {
        panelStatus.textContent = texto;
        panelStatus.dataset.type = tipo;
    }
}

function renderStoresTaxTacoBell() {
    const tbody = document.getElementById('tbTaxStoreBody');
    const count = document.getElementById('tbTaxStoreCount');
    const panelCount = document.getElementById('tbTaxPanelCount');

    if (!tbody) return;

    const tiendas = cargarStoresTaxTacoBell();

    if (count) {
        count.textContent = `${tiendas.length} configured stores`;
    }

    if (panelCount) {
        panelCount.textContent = `${tiendas.length} configured stores`;
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
            <td>${tienda.latitude !== null && tienda.longitude !== null
            ? `${tienda.latitude.toFixed(6)}, ${tienda.longitude.toFixed(6)}`
            : '-'
        }</td>
            <td>${tienda.preferredJurisdiction || '-'}</td>
            <td>${estadoTaxRateDesdeCacheTacoBell(tienda)}</td>
            <td class="bk-tax-store-actions">
                <button type="button" class="btn btn-outline btn-sm" data-tb-tax-edit="${tienda.store}" title="Edit store ${tienda.store}">
                    <i class="fa-solid fa-pen"></i>
                    Edit
                </button>
                <button type="button" class="btn btn-danger btn-sm" data-tb-tax-delete="${tienda.store}" title="Remove store ${tienda.store}">
                    <i class="fa-solid fa-trash"></i>
                    Remove
                </button>
            </td>
        </tr>
    `).join('');

    if (!tiendas.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="bk-tax-empty">
                    No stores configured.
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
    const tiendasBase = cargarStoresTaxTacoBell();
    const tiendas = tiendasBase.filter(
        tienda => String(tienda.state || '').toUpperCase() === 'CA'
    );

    if (!tiendas.length) {
        mostrarStatusTaxTacoBell('There are no CA stores to refresh with CDTFA.', 'warning');
        return;
    }

    let confirmado = false;

    if (window.Swal) {
        const resultado = await swalTacoBellModal({
            icon: 'question',
            title: 'Refresh CDTFA rates',
            text: `${tiendas.length} configured CA stores will be refreshed, including manually added stores. Non-CA stores will keep their local/manual rate.`,
            showCancelButton: true,
            confirmButtonText: 'Refresh',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#1F1F1F',
            cancelButtonColor: '#6c757d',
            reverseButtons: true,
            focusCancel: true
        });

        confirmado = resultado.isConfirmed;
    } else {
        confirmado = confirm(
            `${tiendas.length} configured CA stores will be refreshed.

Do you want to continue?`
        );
    }

    if (!confirmado) {
        mostrarStatusTaxTacoBell('Refresh canceled.');
        return;
    }

    const botonRefresh = document.getElementById('tbTaxRefreshRates');
    const botonPanelRefresh = document.getElementById('tbTaxPanelRefreshRates');

    if (botonRefresh) {
        botonRefresh.disabled = true;
        botonRefresh.dataset.originalText = botonRefresh.textContent;
        botonRefresh.textContent = 'Refreshing...';
    }

    if (botonPanelRefresh) {
        botonPanelRefresh.disabled = true;
        botonPanelRefresh.dataset.originalText = botonPanelRefresh.textContent;
        botonPanelRefresh.textContent = 'Refreshing...';
    }

    mostrarStatusTaxTacoBell(
        `Refreshing 0/${tiendas.length} from CDTFA. Non-CA stores remain manual.`
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
                    `Taco Bell store ${tienda.store} has no valid coordinates. CDTFA cannot be queried.`
                );

                mostrarStatusTaxTacoBell(
                    `Refreshing ${i + 1}/${tiendas.length} from CDTFA... OK: ${ok}, missing coordinates: ${sinCoordenadas}, failures: ${fallos}`,
                    'warning'
                );

                continue;
            }

            const result = await consultarTaxRateCDTFATacoBell(tienda);

            if (result.success) {
                guardarCacheStoreTaxRateTacoBell(
                    tienda.store,
                    tienda.latitude,
                    tienda.longitude,
                    result
                );

                await upsertStoreTaxTacoBell({
                    ...tienda,
                    taxRate: result.rate
                });

                ok += 1;
            } else {
                fallos += 1;
                console.warn(
                    `CDTFA could not be refreshed for Taco Bell store ${tienda.store}:`,
                    result.error
                );
            }

            mostrarStatusTaxTacoBell(
                `Refreshing ${i + 1}/${tiendas.length} from CDTFA... OK: ${ok}, missing coordinates: ${sinCoordenadas}, failures: ${fallos}`,
                fallos ? 'warning' : 'info'
            );
        }

        renderStoresTaxTacoBell();
        recalcularTaxReviewTacoBellSiAplica();

        mostrarStatusTaxTacoBell(
            `Refresh complete. CDTFA OK: ${ok}. Missing coordinates: ${sinCoordenadas}. Failures: ${fallos}.`,
            fallos ? 'warning' : 'success'
        );
    } finally {
        if (botonRefresh) {
            botonRefresh.disabled = false;
            botonRefresh.textContent =
                botonRefresh.dataset.originalText || 'Refresh CDTFA rates';
        }

        if (botonPanelRefresh) {
            botonPanelRefresh.disabled = false;
            botonPanelRefresh.textContent =
                botonPanelRefresh.dataset.originalText || 'Refresh rates';
        }
    }
}

function abrirModalTaxTacoBell() {
    const dialog = document.getElementById('tacoBellTaxStoreDialog');
    if (!dialog) return;

    dialog.classList.remove('is-form-open');
    renderStoresTaxTacoBell();
    mostrarStatusTaxTacoBell('Catalogo listo. Taco Bell usara estos rates locales.');

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

            limpiarFormularioStoreTaxTacoBell();
            dialog?.classList.add('is-form-open');
            mostrarStatusTaxTacoBell('Capture the new store details.');
            document.getElementById('tbTaxStoreNumber')?.focus();
        });

    document
        .getElementById('tbTaxSaveStore')
        ?.addEventListener('click', async () => {
            try {
                await upsertStoreTaxTacoBell(
                    leerFormularioStoreTaxTacoBell()
                );

                renderStoresTaxTacoBell();
                recalcularTaxReviewTacoBellSiAplica();
                mostrarStatusTaxTacoBell('Store saved successfully.', 'success');
                limpiarFormularioStoreTaxTacoBell();
                document
                    .getElementById('tacoBellTaxStoreDialog')
                    ?.classList.remove('is-form-open');
            } catch (error) {
                mostrarStatusTaxTacoBell(error.message, 'error');

                if (window.Swal) {
                    swalTacoBellModal({
                        icon: 'warning',
                        title: 'Review the store',
                        text: error.message,
                        confirmButtonText: 'Entendido'
                    });
                }
            }
        });

    document
        .getElementById('tbTaxClearStore')
        ?.addEventListener('click', () => {
            limpiarFormularioStoreTaxTacoBell();
            document
                .getElementById('tacoBellTaxStoreDialog')
                ?.classList.remove('is-form-open');
            mostrarStatusTaxTacoBell('Edit canceled.');
        });

    document
        .getElementById('tbTaxRefreshRates')
        ?.addEventListener('click', () => {
            refrescarTaxRatesTacoBell();
        });

    document
        .getElementById('tbTaxPanelRefreshRates')
        ?.addEventListener('click', () => {
            refrescarTaxRatesTacoBell();
        });

    document
        .getElementById('tbTaxResetStores')
        ?.addEventListener('click', async () => {
            const confirmar = !window.Swal || (await swalTacoBellModal({
                icon: 'warning',
                title: 'Restore Taco Bell stores',
                text: 'This restores the initial catalog in the shared database, for every user. Manually added stores that are not part of the original list will be lost.',
                showCancelButton: true,
                confirmButtonText: 'Restore',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#c01818',
                cancelButtonColor: '#6c757d',
                reverseButtons: true,
                focusCancel: true
            })).isConfirmed;

            if (!confirmar) return;

            try {
                await tbTaxCatalog.restoreDefaults();

                renderStoresTaxTacoBell();
                recalcularTaxReviewTacoBellSiAplica();
                limpiarFormularioStoreTaxTacoBell();
                document
                    .getElementById('tacoBellTaxStoreDialog')
                    ?.classList.remove('is-form-open');
                mostrarStatusTaxTacoBell('Initial catalog restored for all users.', 'success');
            } catch (error) {
                console.warn('Catalog could not be restored:', error);
                mostrarStatusTaxTacoBell('The catalog could not be restored. Try again.', 'error');
            }
        });

    document
        .getElementById('tbTaxStoreBody')
        ?.addEventListener('click', async event => {
            const editButton = event.target.closest('[data-tb-tax-edit]');
            const deleteButton = event.target.closest('[data-tb-tax-delete]');

            if (editButton) {
                cargarFormularioStoreTaxTacoBell(
                    editButton.dataset.tbTaxEdit
                );
                document
                    .getElementById('tacoBellTaxStoreDialog')
                    ?.classList.add('is-form-open');
                mostrarStatusTaxTacoBell('Editing the selected store.');
                document.getElementById('tbTaxStoreNumber')?.focus();
                return;
            }

            if (deleteButton) {
                event.preventDefault();

                const store = deleteButton.dataset.tbTaxDelete;
                await eliminarStoreTaxTacoBell(store);
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

        const memoRow = String(row.memo || row.MEMO || '').toLowerCase();
        const deptIdRow = String(row.deptId || row.DEPTID || '').toUpperCase();

        const esPestanaExpected =
            activeTab === 'expectedDeposits' ||
            activeTab === 'ebtCashExpected' ||
            activeTab === 'cashExpected';

        let colorFila = '';

        if (esPestanaExpected) {
            if (
                memoRow.includes('cash expected') ||
                deptIdRow === 'CASH'
            ) {
                colorFila = '#f8c7a8'; // naranja claro
            }

            if (
                memoRow.includes('ebt expected') ||
                deptIdRow === 'EBT'
            ) {
                colorFila = '#ffed9c'; // amarillo claro
            }
        }

        columns.forEach(col => {

            const td =
                document.createElement('td');

            if (colorFila) {
                td.style.backgroundColor = colorFila;
            }

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
                    tr.title = 'This store has an O/S difference';
                }
            }

            tr.appendChild(td);

        });

        body.appendChild(tr);

    });

}

function inicializarTabEbtCashExpected() {
    if (window.__ebtCashExpectedTabReady) return;
    window.__ebtCashExpectedTabReady = true;

    document.addEventListener('click', event => {
        const boton = event.target.closest('button, [data-tab]');

        if (!boton) return;

        const texto = String(boton.textContent || '').toLowerCase().trim();

        const tab =
            boton.dataset?.tab ||
            boton.getAttribute('data-tab') ||
            boton.getAttribute('data-target') ||
            '';

        const esTabEbtCash =
            tab === 'ebtCashExpected' ||
            tab === 'expectedDeposits' ||
            tab === 'cashExpected' ||
            (
                texto.includes('ebt') &&
                texto.includes('cash')
            );

        if (!esTabEbtCash) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        activeTab = 'expectedDeposits';

        document
            .querySelectorAll('.tab-btn, .tab-button, [data-tab], .tabs button, .results-tabs button')
            .forEach(item => item.classList.remove('active'));

        boton.classList.add('active');
        boton.dataset.tab = 'expectedDeposits';

        generarExpectedDepositsTacoBell();
        renderExpectedDepositsTacoBell();
    }, true);
}

document.addEventListener(
    'DOMContentLoaded',
    inicializarTabEbtCashExpected
);
