let taxReviewData = [];
let redData = [];
let statisticalDeliveryData = [];
let journalData = [];
let statisticalJournalData = [];
let activeTab = 'dailySales';
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

    renderTablaSucursales();

    llenarFiltroTiendas();

    actualizarResumen();

    actualizarTotales();

    dailySalesData = datosExtraidos;

    generarDailySalesRED();

    renderActiveTab();
}

function crearIndiceConciliation() {

    const index = {};

    datosExtraidos.forEach(row => {

        index[row.store] = row;

    });

    return index;
}

function generarTaxReview() {

    const conciliationIndex =
        crearIndiceConciliation();

    taxReviewData = [];

    const taxRates = {

        37014: 0.0815,
        37015: 0.0815,
        37016: 0.0815,
        37017: 0.0815

    };

    Object.values(conciliationIndex)
        .forEach(row => {

            const taxRate =
                taxRates[row.store] || 0.0815;

            // Excel C
            const netSales =
                Number(row.netSales || 0);

            // Excel D
            const discounts =
                Number(row.discounts || 0);

            // Excel I
            const salesTax =
                Number(row.salesTax || 0);

            // Excel G
            const taxCalculation =
                netSales * taxRate;

            // Excel J
            const difference =
                taxCalculation - salesTax;

            // Excel L
            const actualRate =
                netSales !== 0
                    ? salesTax / netSales
                    : 0;

            // Excel M
            const rateDifference =
                taxRate - actualRate;

            taxReviewData.push({

                store: row.store,

                taxRate,

                netSales,

                discounts,

                taxableSales: netSales,

                taxCalculation,

                salesTax,

                difference,

                actualRate,

                rateDifference

            });

        });

    console.log(
        'Tax Review generado:',
        taxReviewData.length
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

let dailySalesREDData = [];

function generarDailySalesRED() {
    if (!workbook) {
        console.error("No hay workbook cargado");
        return [];
    }

    const sheetName = 'Daily Sales RED';
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
        console.error(`No se encontró la hoja ${sheetName}`);
        return [];
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: 0 });

    const dailySalesREDData = rows.map(row => {
        const netSales = Number(row['Net Sales'] || 0);
        const salesTax = Number(row['Sales TAX'] || 0);
        const grossSalesPos = Number(row['Gross Sales POS'] || 0);
        const discounts = Number(row['Discounts'] || 0);
        const promo = Number(row['Promo'] || 0);
        const donations = Number(row['Donations'] || 0);
        const gcSold = Number(row['GC Sold'] || 0);
        const paidOut = Number(row['Paid Out'] || 0);
        const paidIn = Number(row['Paid In'] || 0);
        const deposit1 = Number(row['Deposit 1'] || 0);
        const deposit2 = Number(row['Deposit 2'] || 0);

        // Columnas I y J son calculadas según las fórmulas originales del Excel
        const iColumn = grossSalesPos - discounts - promo; // Ejemplo: ajustar según la fórmula real
        const jColumn = iColumn - donations - gcSold; // Ejemplo: ajustar según la fórmula real

        return {
            store: row['Store'] || '',
            salesTax,
            netSales,
            grossSalesPos,
            discounts,
            promo,
            donations,
            gcSold,
            paidOut,
            paidIn,
            deposit1,
            deposit2,
            iColumn,
            jColumn,
            totalRevenue: Number(row['Total Revenue'] || 0),
            mastercard: Number(row['Mastercard'] || 0),
            visa: Number(row['Visa'] || 0),
            discover: Number(row['Discover'] || 0),
            amex: Number(row['Amex'] || 0),
            debit: Number(row['Debit'] || 0),
            ebt: Number(row['EBT'] || 0),
            gcRedeem: Number(row['GC Redeem'] || 0),
            acctCash: Number(row['Acct Cash'] || 0),
            gh: Number(row['GH'] || 0),
            uber: Number(row['Uber'] || 0),
            dd: Number(row['DD'] || 0),
            ccTotals: Number(row['CC Totals'] || 0),
            paymentsTotal: Number(row['Payments Total'] || 0),
            os: Number(row['OS'] || 0),
            cashPlusMinus: Number(row['Cash +/-'] || 0),
            cashExpected: Number(row['Cash Expected'] || 0),
            difference: Number(row['Difference'] || 0)
        };
    });

    console.log('Daily Sales RED generados:', dailySalesREDData.length);
    return dailySalesREDData;
}

function buscarStore(store) {
    return datosExtraidos.find(
        r => String(r.store) === String(store)
    );
}


function generarStatisticalDelivery() {

    statisticalDeliveryData = [];

    datosExtraidos.forEach(row => {

        statisticalDeliveryData.push({

            journal: 'SJ',

            date: fechaSalesSeleccionada,

            lineNo:
                statisticalDeliveryData.length + 1,

            description:
                'Statistical Delivery Sales',

            memo:
                'Statistical Delivery Sales',

            account: 990300,

            locationId:
                obtenerLocationId(row.store),

            amount:
                Number(row.dd || 0) +
                Number(row.uber || 0) +
                Number(row.gh || 0)

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

function generarDailySales0310() {

    dailySales0310Data = [];

    let lineNo = 1;

    statisticalDeliveryData.forEach(item => {

        const store =
            Number(item.locationId);

        const sales =
            Number(item.deliverySales || 0);

        const tax =
            Number(item.deliveryTax || 0);

        if (sales !== 0) {

            dailySales0310Data.push({

                journal: 'SJ',

                date: fechaSeleccionada,

                lineNo: lineNo++,

                description:
                    'Statistical Delivery Sales',

                memo:
                    'Statistical Delivery Sales',

                deptId: '',

                acctNo: 990300,

                locationId: store,

                debit: sales,

                credit: 0

            });

            dailySales0310Data.push({

                journal: 'SJ',

                date: fechaSeleccionada,

                lineNo: lineNo++,

                description:
                    'Statistical Delivery Sales',

                memo:
                    'Statistical Delivery Sales',

                deptId: '',

                acctNo: 990301,

                locationId: store,

                debit: 0,

                credit: sales

            });

        }

        if (tax !== 0) {

            dailySales0310Data.push({

                journal: 'SJ',

                date: fechaSeleccionada,

                lineNo: lineNo++,

                description:
                    'Statistical Delivery Sales',

                memo:
                    'Statistical Delivery Sales',

                deptId: '',

                acctNo: 990200,

                locationId: store,

                debit: tax,

                credit: 0

            });

            dailySales0310Data.push({

                journal: 'SJ',

                date: fechaSeleccionada,

                lineNo: lineNo++,

                description:
                    'Statistical Delivery Sales',

                memo:
                    'Statistical Delivery Sales',

                deptId: '',

                acctNo: 990201,

                locationId: store,

                debit: 0,

                credit: tax

            });

        }

    });

    console.log(
        'Daily Sales 03-10 generado:',
        dailySales0310Data.length
    );

}