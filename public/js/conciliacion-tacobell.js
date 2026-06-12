let taxReviewData = [];
let redData = [];
let statisticalDeliveryData = [];
let journalData = [];
let statisticalJournalData = [];
let activeTab = 'dailySales';

let dailySalesData = [];
let dailySalesRedData = [];
let taxLiabilityData = [];
let cashSheetData = [];
let cashSummaryData = [];
function generarConciliacionTacoBell() {

    if (!salesWorkbook) {

        Swal.fire(
            'Error',
            'No hay archivo Sales cargado',
            'error'
        );

        return;
    }

    // SIEMPRE usar el archivo SALES
    const salesBook =
        salesWorkbook || workbook;

    if (!salesBook) {

        Swal.fire(
            'Error',
            'No hay archivo Sales cargado',
            'error'
        );

        return;
    }

    const sourceSheetName =
        detectarHojaOrigen(
            salesBook
        );

    const sourceSheet =
        salesBook.Sheets[
        sourceSheetName
        ];
    if (!sourceSheet) {

        Swal.fire(
            'Error',
            'No se encontró hoja origen',
            'error'
        );

        return;
    }

    // Obtener fecha más reciente

    const rows =
        XLSX.utils.sheet_to_json(
            sourceSheet,
            {
                range: 1,
                defval: 0
            }
        );
    cargarFechasEnFiltro(
        rows,
        'salesDateFilter',
        'Date'
    );

    // ======================================
    // FECHA MÁS RECIENTE
    // ======================================

    // =====================================
    // FECHA MÁS RECIENTE
    // =====================================

    const fechasValidas =
        rows
            .map(row => obtenerFechaFila(row))
            .filter(Boolean)
            .map(fecha => {

                if (fecha instanceof Date) {
                    return fecha;
                }

                const d = new Date(fecha);

                return isNaN(d)
                    ? null
                    : d;

            })
            .filter(Boolean);

    if (!fechasValidas.length) {

        console.error(
            'No se encontraron fechas válidas'
        );

        return;
    }

    const fechaMax =
        new Date(
            Math.max(
                ...fechasValidas.map(
                    f => f.getTime()
                )
            )
        );

    const fechaMasReciente =
        `${String(
            fechaMax.getMonth() + 1
        ).padStart(2, '0')}/${String(
            fechaMax.getDate()
        ).padStart(2, '0')}/${fechaMax.getFullYear()}`;

    console.log(
        'Fecha más reciente:',
        fechaMasReciente
    );

    // Guardar fecha global

    fechaConciliacionActual =
        fechaMasReciente;

    // Llenar input

    const fechaInput =
        document.getElementById(
            'fechaConciliacion'
        );

    if (fechaInput) {

        fechaInput.value =
            `${fechaMax.getFullYear()}-${String(
                fechaMax.getMonth() + 1
            ).padStart(2, '0')}-${String(
                fechaMax.getDate()
            ).padStart(2, '0')}`;

    }

    // Filtrar solo la fecha más reciente

    const fechaFiltro =
        fechaSalesSeleccionada &&
            fechaSalesSeleccionada.trim() !== ''
            ? fechaSalesSeleccionada
            : fechaMasReciente;

    const rowsFiltradas =
        rows.filter(row => {

            const fecha =
                obtenerFechaFila(row);

            if (!fecha) {
                return false;
            }

            return (
                normalizarFecha(fecha) ===
                normalizarFecha(fechaFiltro)
            );

        });

    console.log(
        'Registros filtrados:',
        rowsFiltradas.length
    );

    console.log(
        'Fecha más reciente:',
        fechaMasReciente
    );

    // ======================================
    // FILTRAR SOLO ESA FECHA
    // ======================================

    console.log(
        'Registros fecha actual:',
        rowsFiltradas.length
    );

    console.log(
        'Primer registro:',
        rows[0]
    );

    const c =
        currentRestaurantConfig.columns;

    console.log('Fecha filtro:', fechaFiltro);

    console.log(
        'Primeras fechas:',
        rows.slice(0, 5).map(
            r => obtenerFechaFila(r)
        )
    );

    console.log(
        'Rows filtradas:',
        rowsFiltradas.length
    );

    datosExtraidos =
        rowsFiltradas.map(row => {

            const store = row[c.store] || '';

            const salesTax = Number(row[c.salesTax]) || 0;
            const netSales = Number(row[c.netSales]) || 0;

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

            const gcRedeem =
                (Number(row[c.giftCardRedeemed]) || 0) * -1;

            const acctCashOriginal =
                Number(row[c.acctCash]) || 0;

            const gh = Number(row[c.grubhub]) || 0;
            const uber = Number(row[c.uber]) || 0;
            const dd = Number(row[c.doordash]) || 0;

            const deposit1 = Number(row[c.deposit1]) || 0;
            const deposit2 = Number(row[c.deposit2]) || 0;
            const deposit3 = Number(row[c.deposit3]) || 0;

            const ebt = obtenerEBTPorStore(store) || 0;

            // =====================================
            // CALCULOS CORREGIDOS
            // =====================================

            const acctCash =
                acctCashOriginal -
                paidOut -
                ebt;


            // Gross Sales POS
            const grossSalesPos =
                netSales +
                promo +
                discounts -
                uber;

            // CC Totals
            const ccTotals =
                mastercard +
                visa +
                discover +
                debit;

            // Deposits
            const deposits =
                deposit1 +
                deposit2 +
                deposit3;

            // Total Revenue
            const totalRevenue =
                netSales +
                salesTax +
                gcSold +
                donations +
                paidIn -
                paidOut;

            // Payments Total
            const paymentsTotal =
                mastercard +
                visa +
                discover +
                amex +
                debit +
                gcRedeem +
                acctCash +
                gh +
                uber +
                dd +
                ebt;

            // O/S
            const oS =
                totalRevenue -
                paymentsTotal;

            const os =
                Number(
                    row[c.cashPlusMinus]
                ) || 0;
            // Cash Expected
            const cashExpected =
                acctCash;


            //AGREGADO


            // Cash +/-
            const cashPlusMinus =
                Number(
                    row[c.cashPlusMinus]
                ) || 0;

            // Difference
            const difference =
                cashExpected -
                (
                    deposit1 +
                    deposit2 +
                    deposit3
                ) +
                cashPlusMinus +
                ebt;

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

    console.log(
        'Registros generados:',
        datosExtraidos.length
    );

    document.getElementById(
        'resultsSection'
    ).style.display = 'block';

    console.log(datosExtraidos[0]);
    console.log(datosExtraidos.length);

    generarTaxReview();
    generarStatisticalDelivery();

    generarTaxLiability();
    generarCashSheet();
    generarCashSummary();

    renderTablaSucursales();

    llenarFiltroTiendas();

    actualizarResumen();

    actualizarTotales();

    dailySalesData = datosExtraidos;

    generarDailySalesRED();
    dailySalesRedData = redData;

    renderActiveTab();
}

function generarTaxReview() {

    if (!Array.isArray(datosExtraidos)) {
        taxReviewData = [];
        return;
    }

    taxReviewData = datosExtraidos.map(row => {

        const store =
            Number(row.store || 0);

        const taxRate =
            Number(obtenerTaxRate(store) || 0);

        const netSales =
            Number(row.netSales || 0);

        const discounts =
            Number(row.discounts || 0);

        const taxableSales =
            netSales;

        const taxCalculation =
            taxableSales * taxRate;

        const salesTax =
            Number(row.salesTax || 0);

        const difference =
            taxCalculation - salesTax;

        const rateCalculation =
            taxableSales !== 0
                ? salesTax / taxableSales
                : 0;

        const rateDifference =
            taxRate - rateCalculation;

        return {

            store,

            taxRate,

            netSales,

            discounts,

            taxableSales,

            taxCalculation,

            salesTax,

            difference,

            rateCalculation,

            rateDifference

        };

    });

    console.log(
        'Tax Review generado:',
        taxReviewData.length,
        'registros'
    );

}

function renderTaxReview() {

    renderDynamicTable(
        taxReviewData,
        [
            'store',
            'taxRate',
            'netSales',
            'discounts',
            'taxableSales',
            'taxCalculation',
            'salesTax',
            'difference',
            'rateCalculation',
            'rateDifference'
        ]
    );

}

function generarDailySalesRED() {

    redData = [];

    let lineNo = 1;

    const configuracion = [

        {
            memo: 'Gross Food Sales',
            cuenta: 400200,
            tipo: 'credit',
            campo: 'grossSalesPos'
        },

        {
            memo: 'Discounts -Employee meals',
            cuenta: 410000,
            tipo: 'debit',
            campo: 'discounts'
        },

        {
            memo: 'Coupons - Promotions',
            cuenta: 410000,
            tipo: 'debit',
            campo: 'promo'
        },

        {
            memo: 'Sales Tax Payable',
            cuenta: 222000,
            tipo: 'credit',
            campo: 'salesTax'
        },

        {
            memo: 'Non Taxable Sales',
            cuenta: 400201,
            tipo: 'credit',
            campo: 'os'
        },

        {
            memo: 'Donations',
            cuenta: 212000,
            tipo: 'credit',
            campo: 'donations'
        },

        {
            memo: 'Gift Cards SOLD',
            cuenta: 115000,
            tipo: 'credit',
            campo: 'gcSold'
        },

        {
            memo: 'Paid Outs',
            cuenta: 116200,
            tipo: 'debit',
            campo: 'paidOut'
        },

        {
            memo: 'Paid In',
            cuenta: 116200,
            tipo: 'credit',
            campo: 'paidIn'
        },

        {
            memo: 'Cash Expected Deposit',
            cuenta: 110500,
            tipo: 'debit',
            campo: 'cashExpected'
        },

        {
            memo: 'Credit Cards Expected Deposit',
            cuenta: 111200,
            tipo: 'debit',
            campo: 'ccTotals'
        },

        {
            memo: 'EBT Expected Deposit',
            cuenta: 111200,
            tipo: 'debit',
            campo: 'ebt'
        },

        {
            memo: 'AMEX Expected Deposit',
            cuenta: 111200,
            tipo: 'debit',
            campo: 'amex'
        },

        {
            memo: 'Gift Cards REEDEM',
            cuenta: 144800,
            tipo: 'debit',
            campo: 'gcRedeem'
        },

        {
            memo: 'GrubHub',
            cuenta: 124000,
            tipo: 'debit',
            campo: 'gh'
        },

        {
            memo: 'Uber',
            cuenta: 122000,
            tipo: 'debit',
            campo: 'uber'
        },

        {
            memo: 'DoorDash',
            cuenta: 123000,
            tipo: 'debit',
            campo: 'dd'
        },

        {
            memo: 'Diff Between POS and Calc (Over)/Short',
            cuenta: 652300,
            tipo: 'debit',
            campo: 'difference'
        }

    ];

    configuracion.forEach(config => {

        datosExtraidos.forEach(row => {

            const amount =
                Number(row[config.campo] || 0);

            redData.push({

                journal: 'SJ',

                date:
                    fechaSeleccionada,

                lineNo:
                    lineNo++,

                description:
                    'POS Data Upload Sabretooth',

                memo:
                    config.memo,

                account:
                    config.cuenta,

                location:
                    row.store,

                debit:
                    config.tipo === 'debit'
                        ? amount
                        : 0,

                credit:
                    config.tipo === 'credit'
                        ? amount
                        : 0

            });

        });

    });

    console.log(
        'Daily Sales RED generado:',
        redData.length
    );

}

function generarStatisticalDelivery() {

    statisticalDeliveryData = [];

    let lineNo = 1;

    datosExtraidos.forEach(row => {

        const deliverySales =
            Number(row.gh || 0) +
            Number(row.uber || 0) +
            Number(row.dd || 0);

        statisticalDeliveryData.push({

            journal: 'SJ',

            date: fechaSeleccionada,

            lineNo: lineNo++,

            description:
                'Statistical Delivery Sales',

            memo:
                'Statistical Delivery Sales',

            account: 990300,

            location: row.store,

            debit: deliverySales,

            credit: 0

        });

        statisticalDeliveryData.push({

            journal: 'SJ',

            date: fechaSeleccionada,

            lineNo: lineNo++,

            description:
                'Statistical Delivery Sales',

            memo:
                'Statistical Delivery Sales',

            account: 990301,

            location: row.store,

            debit: 0,

            credit: deliverySales

        });

    });

}

let dailySales0314Data = [];

function generarDailySales0314() {

    dailySales0314Data = [];

    let lineNo = 1;

    const fecha =
        fechaSeleccionada ||
        document.getElementById('fechaConciliacion')?.value;

    datosExtraidos.forEach(row => {

        const location =
            obtenerLocationId(row.store);

        const pushLine = (
            memo,
            account,
            debit,
            credit,
            dept = null
        ) => {

            if (
                Number(debit || 0) === 0 &&
                Number(credit || 0) === 0
            ) {
                return;
            }

            dailySales0314Data.push({

                journal: 'SJ',

                date: fecha,

                lineNo: lineNo++,

                description:
                    'POS Data Upload Sabretooth',

                memo,

                deptId: dept,

                acctNo: account,

                locationId: location,

                debit:
                    Number(debit || 0),

                credit:
                    Number(credit || 0)

            });

        };

        // ======================
        // SALES
        // ======================

        pushLine(
            'Gross Food Sales',
            400200,
            0,
            row.grossSalesPos
        );

        // ======================
        // DISCOUNTS
        // ======================

        pushLine(
            'Discounts -Employee meals',
            410000,
            row.discounts,
            0
        );

        // ======================
        // PROMOS
        // ======================

        pushLine(
            'Coupons - Promotions',
            410000,
            row.promo,
            0
        );

        // ======================
        // SALES TAX
        // ======================

        pushLine(
            'Sales Tax Payable',
            222000,
            0,
            row.salesTax
        );

        // ======================
        // NON TAXABLE
        // ======================

        pushLine(
            'Non Taxable Sales',
            400201,
            0,
            row.uber
        );

        // ======================
        // DONATIONS
        // ======================

        pushLine(
            'Donations',
            212000,
            0,
            row.donations
        );

        // ======================
        // GC SOLD
        // ======================

        pushLine(
            'Gift Cards SOLD',
            115000,
            0,
            row.gcSold
        );

        // ======================
        // CASH
        // ======================

        pushLine(
            'Cash Expected Deposit',
            110500,
            row.cashExpected,
            0
        );

        // ======================
        // CREDIT CARDS
        // ======================

        const tarjetas =

            Number(row.mastercard || 0) +
            Number(row.visa || 0) +
            Number(row.discover || 0) +
            Number(row.debit || 0);

        pushLine(
            'Credit Cards Expected Deposit',
            111200,
            tarjetas,
            0
        );

        // ======================
        // AMEX
        // ======================

        pushLine(
            'AMEX Expected Deposit',
            111200,
            row.amex,
            0
        );

        // ======================
        // GC REDEEM
        // ======================

        pushLine(
            'Gift Cards REEDEM',
            144800,
            row.gcRedeem,
            0
        );

        // ======================
        // GH
        // ======================

        pushLine(
            'GrubHub',
            124000,
            row.gh,
            0,
            'GHD'
        );

        // ======================
        // UBER
        // ======================

        pushLine(
            'Uber',
            122000,
            row.uber,
            0,
            'UBD'
        );

        // ======================
        // DD
        // ======================

        pushLine(
            'DoorDash',
            123000,
            row.dd,
            0,
            'DDD'
        );

        // ======================
        // OVER SHORT
        // ======================

        if (
            Math.abs(row.os || 0) > 0.01
        ) {

            pushLine(
                'Diff Between POS and Calc (Over)/Short',
                610000,
                row.os > 0
                    ? row.os
                    : 0,
                row.os < 0
                    ? Math.abs(row.os)
                    : 0
            );

        }

        // ======================
        // PAID OUT
        // ======================

        if (
            Math.abs(row.paidOut || 0) > 0.01
        ) {

            pushLine(
                'Paid Outs',
                610100,
                row.paidOut,
                0
            );

        }

    });

    console.log(
        'Daily Sales 03-14 generado:',
        dailySales0314Data.length
    );

}

let dailySales0310Data = [];

let dailySales0310Data = [];

function generarDailySales0310() {

    dailySales0310Data = [];

    let lineNo = 1;

    statisticalDeliveryData.forEach(row => {

        const sales =
            Number(row.sales || 0);

        const tax =
            Number(row.tax || 0);

        const location =
            row.locationId;

        if (sales !== 0) {

            dailySales0310Data.push({
                journal: 'SJ',
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                acctNo: 990300,
                locationId: location,
                debit: sales,
                credit: 0
            });

            dailySales0310Data.push({
                journal: 'SJ',
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                acctNo: 990301,
                locationId: location,
                debit: 0,
                credit: sales
            });

        }

        if (tax !== 0) {

            dailySales0310Data.push({
                journal: 'SJ',
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                acctNo: 990200,
                locationId: location,
                debit: tax,
                credit: 0
            });

            dailySales0310Data.push({
                journal: 'SJ',
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Statistical Delivery Sales',
                acctNo: 990201,
                locationId: location,
                debit: 0,
                credit: tax
            });

        }

    });

}