// conciliacion-tacobell.js

let taxReviewData = [];
let statisticalDeliveryData = [];
let dailySalesREDData = [];
let dailySales0314Data = [];
let dailySales0310Data = [];
let activeTab = 'dailySales';

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

    const rows = XLSX.utils.sheet_to_json(sourceSheet, { range: 1, defval: 0 });
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
    const rowsFiltradas = rows.filter(row => {
        const fecha = obtenerFechaFila(row);
        if (!fecha) return false;
        return normalizarFecha(fecha) === normalizarFecha(fechaFiltro);
    });

    datosExtraidos = rowsFiltradas.map(row => {
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
    });

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
            renderTaxReview();
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

// ===========================================
// FUNCIONES POR HOJA
// ===========================================
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
                ? salesTaxPayable / taxableSales
                : 0;

        const rateDifference =
            taxRate - rateCalculation;

        return {

            store: row.store,

            taxRate,

            netSales,

            discounts,

            taxableSales,

            taxCalculation,

            salesTaxPayable,

            taxDifference,

            rateCalculation,

            rateDifference

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
            101900,
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
        const ebt = Number(row.ebt || 0);

        function pushLine(acctNo, memo, debit = 0, credit = 0) {
            dailySales0314Data.push({ journal: 'SJ', lineNo: lineNo++, description: 'POS Data Upload Sabretooth', memo, acctNo, locationId: store, debit, credit });
        }

        pushLine(400200, 'Gross Food Sales', 0, grossSales);
        if (discounts) pushLine(410000, 'Discounts -Employee meals', discounts, 0);
        if (salesTax) pushLine(222000, 'Sales Tax Payable', 0, salesTax);
        if (uber) pushLine(400201, 'Non Taxable Sales', 0, uber);
        if (donations) pushLine(212000, 'Donations', 0, donations);
        if (cashExpected)
            pushLine(
                101900,
                'Cash Expected Deposit',
                cashExpected,
                0
            );
        if (mcVisaDiscover) pushLine(111200, 'Credit Cards Expected Deposit', mcVisaDiscover, 0);
        if (amex) pushLine(111200, 'AMEX Expected Deposit', amex, 0);
        if (gcRedeem) pushLine(144800, 'Gift Cards REDEEM', gcRedeem, 0);
        if (gh) pushLine(124000, 'GrubHub', gh, 0);
        if (uber) pushLine(122000, 'Uber', uber, 0);
        if (dd) pushLine(123000, 'DoorDash', dd, 0);
        if (gcSold) pushLine(244800, 'Gift Cards Sold', 0, gcSold);

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



        if (ebt)
            pushLine(
                111200,
                'EBT Expected Deposit',
                ebt,
                0
            );
    });
}

function obtenerLocationId(store) {
    const LOCATION_MAP = { 37014: 43415, 37015: 43414, 37016: 43413, 37017: 43412 };
    return LOCATION_MAP[store] || store;
}

function generarDailySales0310() {
    dailySales0310Data = [];
    let lineNo = 1;
    statisticalDeliveryData.forEach(item => {
        const amount = Number(item.amount || 0);
        if (!amount) return;
        const locationId = obtenerLocationId(item.locationId || item.store);

        dailySales0310Data.push({ journal: 'SJ', lineNo: lineNo++, description: 'Statistical Delivery Sales', memo: 'Statistical Delivery Sales', acctNo: 990300, locationId, debit: amount, credit: 0 });
        dailySales0310Data.push({ journal: 'SJ', lineNo: lineNo++, description: 'Statistical Delivery Sales', memo: 'Statistical Delivery Sales', acctNo: 990301, locationId, debit: 0, credit: amount });

        const taxAmount = Number(item.taxAmount || item.salesTax || 0);
        if (taxAmount) {
            dailySales0310Data.push({ journal: 'SJ', lineNo: lineNo++, description: 'Statistical Delivery Sales', memo: 'Statistical Delivery Sales', acctNo: 990200, locationId, debit: taxAmount, credit: 0 });
            dailySales0310Data.push({ journal: 'SJ', lineNo: lineNo++, description: 'Statistical Delivery Sales', memo: 'Statistical Delivery Sales', acctNo: 990201, locationId, debit: 0, credit: taxAmount });
        }
    });
}

function obtenerTaxRate(store) {

    const TAX_RATES = {

        28841: 0.08125,
        28842: 0.08375,
        28843: 0.09125,
        28844: 0.08000,
        28845: 0.08125,
        28846: 0.08375,

        30256: 0.08125,
        36224: 0.08125,

        37014: 0.08250,

        37732: 0.08375,

        30491: 0.08750,

        29423: 0.08250,

        32680: 0.08250,

        34793: 0.08975,

        36225: 0.08125,

        36930: 0.07975,

        37171: 0.08750,

        32952: 0.07900

    };

    return TAX_RATES[store] || 0;

}

function renderTaxReview() {

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
            ((row.rateCalculation || 0) * 100).toFixed(3) + '%',

        'RATE DIFFERENCE':
            ((row.rateDifference || 0) * 100).toFixed(3) + '%'

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

        trHead.appendChild(th);

    });

    head.appendChild(trHead);

    data.forEach(row => {

        const tr =
            document.createElement('tr');

        columns.forEach(col => {

            const td =
                document.createElement('td');

            td.textContent =
                row[col] ?? '';

            tr.appendChild(td);

        });

        body.appendChild(tr);

    });

}