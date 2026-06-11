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

    taxReviewData = datosExtraidos.map(row => {

        const taxRate =
            obtenerTaxRate(row.store);

        const netSales =
            Number(row.netSales || 0);

        const discounts =
            Number(row.discounts || 0);

        const salesTax =
            Number(row.salesTax || 0);

        const taxCalculation =
            netSales * taxRate;

        return {

            store: row.store,

            taxRate,

            netSales,

            discounts,

            taxableSales: netSales,

            taxCalculation,

            salesTax,

            difference:
                taxCalculation - salesTax,

            rateCalculation:
                netSales
                    ? salesTax / netSales
                    : 0

        };

    });

}

function generarStatisticalDelivery() {

    statisticalDeliveryData = [];

    let lineNo = 1;

    datosExtraidos.forEach(row => {

        const store = Number(row.store);

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

    });

    console.log(
        'Statistical Delivery generado:',
        statisticalDeliveryData.length
    );
}

function generarDailySalesRED() {

    redData = [];

    let lineNo = 1;

    datosExtraidos.forEach(row => {

        const store = Number(row.store);

        // Gross Food Sales
        redData.push({
            journal: 'SJ',
            date: fechaConciliacionActual,
            lineNo: lineNo++,
            description: 'POS Data Upload Sabretooth',
            memo: 'Gross Food Sales',
            account: 400200,
            store,
            debit: 0,
            credit: row.grossSalesPos || 0
        });

        // Discounts
        if ((row.discounts || 0) !== 0) {

            redData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'POS Data Upload Sabretooth',
                memo: 'Discounts -Employee meals',
                account: 410000,
                store,
                debit: row.discounts,
                credit: 0
            });
        }

        // Promo
        if ((row.promo || 0) !== 0) {

            redData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'POS Data Upload Sabretooth',
                memo: 'Coupons - Promotions',
                account: 410000,
                store,
                debit: row.promo,
                credit: 0
            });
        }

        // Sales Tax
        if ((row.salesTax || 0) !== 0) {

            redData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'POS Data Upload Sabretooth',
                memo: 'Sales Tax Payable',
                account: 222000,
                store,
                debit: 0,
                credit: row.salesTax
            });
        }

        // Donations
        if ((row.donations || 0) !== 0) {

            redData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'POS Data Upload Sabretooth',
                memo: 'Donations',
                account: 212000,
                store,
                debit: 0,
                credit: row.donations
            });
        }

        // Gift Card Sold
        if ((row.gcSold || 0) !== 0) {

            redData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'POS Data Upload Sabretooth',
                memo: 'Gift Cards SOLD',
                account: 115000,
                store,
                debit: 0,
                credit: row.gcSold
            });
        }

        // Cash Deposit
        if ((row.acctCash || 0) !== 0) {

            redData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'POS Data Upload Sabretooth',
                memo: 'Cash Expected Deposit',
                account: 110500,
                store,
                debit: row.acctCash,
                credit: 0
            });
        }

        // Credit Cards
        if ((row.ccTotals || 0) !== 0) {

            redData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'POS Data Upload Sabretooth',
                memo: 'Credit Cards Expected Deposit',
                account: 111200,
                store,
                debit: row.ccTotals,
                credit: 0
            });
        }

        // AMEX
        if ((row.amex || 0) !== 0) {

            redData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'POS Data Upload Sabretooth',
                memo: 'AMEX Expected Deposit',
                account: 111200,
                store,
                debit: row.amex,
                credit: 0
            });
        }

        // Gift Card Redeem
        if ((row.gcRedeem || 0) !== 0) {

            redData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'POS Data Upload Sabretooth',
                memo: 'Gift Cards REEDEM',
                account: 144800,
                store,
                debit: Math.abs(row.gcRedeem),
                credit: 0
            });
        }

        // GrubHub
        if ((row.gh || 0) !== 0) {

            redData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'POS Data Upload Sabretooth',
                memo: 'GrubHub',
                account: 124000,
                store,
                debit: row.gh,
                credit: 0
            });
        }

        // Uber
        if ((row.uber || 0) !== 0) {

            redData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'POS Data Upload Sabretooth',
                memo: 'Uber',
                account: 122000,
                store,
                debit: row.uber,
                credit: 0
            });
        }

        // DoorDash
        if ((row.dd || 0) !== 0) {

            redData.push({
                journal: 'SJ',
                date: fechaConciliacionActual,
                lineNo: lineNo++,
                description: 'POS Data Upload Sabretooth',
                memo: 'DoorDash',
                account: 123000,
                store,
                debit: row.dd,
                credit: 0
            });
        }

    });

    console.log(
        'Daily Sales RED generado:',
        redData.length
    );
}

function renderActiveTab() {

    switch (activeTab) {

        case 'dailySales':
            renderDailySales();
            break;

        case 'dailySalesRed':
            renderDailySalesRed();
            break;

        case 'taxLiability':
            renderTaxLiability();
            break;

        case 'cashSheet':
            renderCashSheet();
            break;

        case 'cashSummary':
            renderCashSummary();
            break;

        default:
            renderDailySales();
    }

}

function renderDailySales() {

    datosExtraidos =
        dailySalesData;

    renderTablaSucursales();

}

function renderDailySalesRed() {

    renderDynamicTable(
        dailySalesRedData
    );

}

function renderTaxLiability() {

    renderDynamicTable(
        taxLiabilityData
    );

}

function renderCashSheet() {

    renderDynamicTable(
        cashSheetData
    );

}

function renderCashSummary() {

    renderDynamicTable(
        cashSummaryData
    );

}

function renderDynamicTable(data) {

    const thead =
        document.getElementById('conciliacionTableHead');

    const tbody =
        document.getElementById('conciliacionBody');

    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (!data || !data.length) {
        return;
    }

    const columns = Object.keys(data[0]);

    const headerRow = document.createElement('tr');

    columns.forEach(col => {

        const th = document.createElement('th');

        th.textContent = col;

        headerRow.appendChild(th);

    });

    thead.appendChild(headerRow);

    data.forEach(row => {

        const tr = document.createElement('tr');

        columns.forEach(col => {

            const td = document.createElement('td');

            let value = row[col];

            if (
                typeof value === 'number' &&
                Number.isFinite(value)
            ) {

                td.textContent =
                    value.toLocaleString(
                        'en-US',
                        {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }
                    );

                td.classList.add('text-right');

            } else {

                td.textContent =
                    value ?? '';

            }

            tr.appendChild(td);

        });

        tbody.appendChild(tr);

    });
}

function generarTaxLiability() {

    taxLiabilityData = datosExtraidos.map(row => {

        const taxableSales =
            Number(row.netSales || 0);

        const salesTax =
            Number(row.salesTax || 0);

        const taxRate =
            taxableSales !== 0
                ? salesTax / taxableSales
                : 0;

        return {

            store: row.store,

            taxableSales,

            salesTax,

            taxRate: limpiarDecimal(
                taxRate * 100
            )

        };

    });

}

function generarCashSheet() {

    cashSheetData = datosExtraidos.map(row => {

        return {

            store: row.store,

            cashExpected:
                row.cashExpected || 0,

            deposit1:
                row.deposit1 || 0,

            deposit2:
                row.deposit2 || 0,

            deposit3:
                row.deposit3 || 0,

            deposits:
                row.deposits || 0,

            cashPlusMinus:
                row.cashPlusMinus || 0,

            ebt:
                row.ebt || 0,

            difference:
                row.difference || 0

        };

    });

}


function generarCashSummary() {

    const resumen = {

        stores:
            datosExtraidos.length,

        totalCashExpected: 0,

        totalDeposits: 0,

        totalEBT: 0,

        totalDifference: 0

    };

    datosExtraidos.forEach(row => {

        resumen.totalCashExpected +=
            Number(row.cashExpected || 0);

        resumen.totalDeposits +=
            Number(row.deposits || 0);

        resumen.totalEBT +=
            Number(row.ebt || 0);

        resumen.totalDifference +=
            Number(row.difference || 0);

    });

    cashSummaryData = [resumen];

}
