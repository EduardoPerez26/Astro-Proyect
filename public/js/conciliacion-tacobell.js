let taxReviewData = [];
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

let taxReviewData = [];

function generarTaxReview() {

    const TAX_RATES = {
        28841: 0.08125,
        28842: 0.08375,
        28843: 0.09125,
        28844: 0.08000,
        28845: 0.08125,
        28846: 0.08375
    };

    taxReviewData = datosExtraidos.map(row => {

        const taxRate =
            TAX_RATES[row.store] || 0;

        const netSales =
            Number(row.netSales || 0);

        const salesTax =
            Number(row.salesTax || 0);

        const discounts =
            Number(row.discounts || 0);

        const taxableSales =
            netSales;

        const taxCalculation =
            taxableSales * taxRate;

        const difference =
            taxCalculation - salesTax;

        const rateCalculation =
            netSales
                ? salesTax / netSales
                : 0;

        return {

            store: row.store,

            taxRate,

            netSales,

            discounts,

            taxableSales,

            taxCalculation,

            salesTax,

            difference,

            rateCalculation,

            rateDifference:
                taxRate - rateCalculation

        };

    });

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

    dailySalesREDData = [];

    datosExtraidos.forEach(row => {

        dailySalesREDData.push({

            journal: 'SJ',

            description:
                'POS Data Upload Sabretooth',

            memo:
                'Gross Food Sales',

            account: 400200,

            locationId:
                row.store,

            credit:
                Number(
                    row.grossSalesPos || 0
                )

        });

    });

}

function buscarStore(store) {
    return datosExtraidos.find(
        r => String(r.store) === String(store)
    );
}


function generarStatisticalDelivery() {

    statisticalDeliveryData = [];

    datosExtraidos.forEach(row => {

        const amount =
            Number(
                row.deliverySales ||
                row.uber ||
                0
            );

        if (!amount) return;

        statisticalDeliveryData.push({

            journal: 'SJ',

            lineNo:
                statisticalDeliveryData.length + 1,

            description:
                'Statistical Delivery Sales',

            memo:
                'Statistical Delivery Sales',

            account: 990300,

            locationId:
                row.store,

            amount

        });

    });

}

let dailySales0314Data = [];

function generarDailySales0314() {

    dailySales0314Data = [];

    let lineNo = 1;

    datosExtraidos.forEach(row => {

        const store = Number(row.store);

        const grossSales =
            Number(row.grossSalesPos || 0);

        const discounts =
            Number(row.discounts || 0);

        const salesTax =
            Number(row.salesTax || 0);

        const donations =
            Number(row.donations || 0);

        const uber =
            Number(row.uber || 0);

        const gh =
            Number(row.grubhub || 0);

        const dd =
            Number(row.doordash || 0);

        const amex =
            Number(row.amex || 0);

        const mcVisaDiscover =
            Number(row.ccTotals || 0);

        const gcRedeem =
            Number(row.gcRedeem || 0);

        const gcSold =
            Number(row.gcSold || 0);

        // Gross Food Sales

        dailySales0314Data.push({

            journal: 'SJ',
            lineNo: lineNo++,
            description:
                'POS Data Upload Sabretooth',
            memo:
                'Gross Food Sales',
            acctNo: 400200,
            locationId: store,
            debit: 0,
            credit: grossSales

        });

        // Discounts

        if (discounts !== 0) {

            dailySales0314Data.push({

                journal: 'SJ',
                lineNo: lineNo++,
                description:
                    'POS Data Upload Sabretooth',
                memo:
                    'Discounts -Employee meals',
                acctNo: 410000,
                locationId: store,
                debit: discounts,
                credit: 0

            });

        }

        // Sales Tax

        if (salesTax !== 0) {

            dailySales0314Data.push({

                journal: 'SJ',
                lineNo: lineNo++,
                description:
                    'POS Data Upload Sabretooth',
                memo:
                    'Sales Tax Payable',
                acctNo: 222000,
                locationId: store,
                debit: 0,
                credit: salesTax

            });

        }

        // Non Taxable Sales

        if (uber !== 0) {

            dailySales0314Data.push({

                journal: 'SJ',
                lineNo: lineNo++,
                description:
                    'POS Data Upload Sabretooth',
                memo:
                    'Non Taxable Sales',
                acctNo: 400201,
                locationId: store,
                debit: 0,
                credit: uber

            });

        }

        // Donations

        if (donations !== 0) {

            dailySales0314Data.push({

                journal: 'SJ',
                lineNo: lineNo++,
                description:
                    'POS Data Upload Sabretooth',
                memo:
                    'Donations',
                acctNo: 212000,
                locationId: store,
                debit: 0,
                credit: donations

            });

        }

        // Credit Cards Expected Deposit

        if (mcVisaDiscover !== 0) {

            dailySales0314Data.push({

                journal: 'SJ',
                lineNo: lineNo++,
                description:
                    'POS Data Upload Sabretooth',
                memo:
                    'Credit Cards Expected Deposit',
                acctNo: 111200,
                locationId: store,
                debit: mcVisaDiscover,
                credit: 0

            });

        }

        // AMEX

        if (amex !== 0) {

            dailySales0314Data.push({

                journal: 'SJ',
                lineNo: lineNo++,
                description:
                    'POS Data Upload Sabretooth',
                memo:
                    'AMEX Expected Deposit',
                acctNo: 111200,
                locationId: store,
                debit: amex,
                credit: 0

            });

        }

        // Gift Card Redeem

        if (gcRedeem !== 0) {

            dailySales0314Data.push({

                journal: 'SJ',
                lineNo: lineNo++,
                description:
                    'POS Data Upload Sabretooth',
                memo:
                    'Gift Cards REDEEM',
                acctNo: 144800,
                locationId: store,
                debit: gcRedeem,
                credit: 0

            });

        }

        // GrubHub

        if (gh !== 0) {

            dailySales0314Data.push({

                journal: 'SJ',
                lineNo: lineNo++,
                description:
                    'POS Data Upload Sabretooth',
                memo:
                    'GrubHub',
                acctNo: 124000,
                locationId: store,
                debit: gh,
                credit: 0

            });

        }

        // Uber

        if (uber !== 0) {

            dailySales0314Data.push({

                journal: 'SJ',
                lineNo: lineNo++,
                description:
                    'POS Data Upload Sabretooth',
                memo:
                    'Uber',
                acctNo: 122000,
                locationId: store,
                debit: uber,
                credit: 0

            });

        }

        // DoorDash

        if (dd !== 0) {

            dailySales0314Data.push({

                journal: 'SJ',
                lineNo: lineNo++,
                description:
                    'POS Data Upload Sabretooth',
                memo:
                    'DoorDash',
                acctNo: 123000,
                locationId: store,
                debit: dd,
                credit: 0

            });

        }

        // Gift Cards Sold

        if (gcSold !== 0) {

            dailySales0314Data.push({

                journal: 'SJ',
                lineNo: lineNo++,
                description:
                    'POS Data Upload Sabretooth',
                memo:
                    'Gift Cards Sold',
                acctNo: 244800,
                locationId: store,
                debit: 0,
                credit: gcSold

            });

        }

    });

}


let dailySales0310Data = [];

function obtenerLocationId(store) {

    const LOCATION_MAP = {

        28841: 43415,
        28842: 43414,
        28843: 43413,
        28844: 43412,
        28845: 43411,
        28846: 43410,
        30256: 43409,
        36224: 43408,
        37014: 43407,
        30491: 43406,
        29423: 43405,
        32680: 43404,
        34793: 43403

    };

    return LOCATION_MAP[store] || store;

}

function generarDailySales0310() {

    dailySales0310Data = [];

    let lineNo = 1;

    statisticalDeliveryData.forEach(item => {

        const amount =
            Number(item.amount || 0);

        if (!amount) return;

        const locationId =
            obtenerLocationId(
                item.locationId ||
                item.store
            );

        // 990300 DEBIT

        dailySales0310Data.push({

            journal: 'SJ',

            lineNo: lineNo++,

            description:
                'Statistical Delivery Sales',

            memo:
                'Statistical Delivery Sales',

            acctNo: 990300,

            locationId,

            debit: amount,

            credit: 0

        });

        // 990301 CREDIT

        dailySales0310Data.push({

            journal: 'SJ',

            lineNo: lineNo++,

            description:
                'Statistical Delivery Sales',

            memo:
                'Statistical Delivery Sales',

            acctNo: 990301,

            locationId,

            debit: 0,

            credit: amount

        });

        const taxAmount =
            Number(
                item.taxAmount ||
                item.salesTax ||
                0
            );

        if (taxAmount !== 0) {

            // 990200 DEBIT

            dailySales0310Data.push({

                journal: 'SJ',

                lineNo: lineNo++,

                description:
                    'Statistical Delivery Sales',

                memo:
                    'Statistical Delivery Sales',

                acctNo: 990200,

                locationId,

                debit: taxAmount,

                credit: 0

            });

            // 990201 CREDIT

            dailySales0310Data.push({

                journal: 'SJ',

                lineNo: lineNo++,

                description:
                    'Statistical Delivery Sales',

                memo:
                    'Statistical Delivery Sales',

                acctNo: 990201,

                locationId,

                debit: 0,

                credit: taxAmount

            });

        }

    });

}