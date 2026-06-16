// conciliacion-popeyes.js
window.taxReviewData ??= [];
window.redData ??= [];
window.statisticalDeliveryData ??= [];
window.journalData ??= [];
window.statisticalJournalData ??= [];
window.dailySales0404Data ??= [];

// ========================
// GLOBAL HELPERS (OBLIGATORIO)
// ========================

function norm(v) {
    return String(v || '').trim().toLowerCase();
}

function toNumber(v) {
    return Number(v || 0);
}

async function procesarPopeyes() {

    console.log('INICIO POPEYES');

    const sales =
        generarSalesPopeyes(
            salesRows
        );

    const conciliation =
        generarConciliationPopeyes(
            sales
        );

    console.log('CONCILIATION OK');

    datosExtraidos =
        conciliation;

    // ======================
    // TAX REVIEW
    // ======================
    console.log('VOY A MOSTRAR TABS');

    document
        .getElementById(
            'popeyesTabs'
        )
        .style.display = 'flex';

    console.log('TABS MOSTRADAS');

    try {

        generarTaxReviewPopeyes();

    } catch (e) {

        console.error(
            'Error Tax Review:',
            e
        );

        taxReviewData = [];

    }

    // ======================
    // DAILY SALES RED
    // ======================

    try {

        // temporal para que cargue la pestaña
        redData =
            [...datosExtraidos];

    } catch (e) {

        console.error(
            'Error Daily Sales Red:',
            e
        );

        redData = [];

    }

    // ======================
    // DAILY SALES 04-04-2026
    // ======================

    try {

        generarDailySales04042026Popeyes();

    } catch (e) {

        console.error(
            'Error Daily Sales 0404:',
            e
        );

        dailySales0404Data = [];

    }
    document
        .getElementById(
            'popeyesTabs'
        )
        .style.display = 'flex';

    if (!window.popeyesTabsInitialized) {

        inicializarTabsPopeyes();

        window.popeyesTabsInitialized = true;

    }

    console.log('ENTRO A PROCESAR POPEYES');

    const tabs = document.getElementById('popeyesTabs');

    console.log('tabs', tabs);

    if (tabs) {
        tabs.style.display = 'flex';
    }

    renderConciliation();

    renderTablaSucursales();

}

function obtenerTiendas(rawRows) {

    return [
        ...new Set(
            rawRows
                .map(r => r['Unit Number'])
                .filter(Boolean)
        )
    ];

}



function obtenerFechas(rawRows) {

    return [
        ...new Set(
            rawRows.map(
                r => normalizarFecha(
                    r['Accounting Date']
                )
            )
        )
    ].sort();

}

function generarStoreDatePairs(
    stores,
    fechas
) {

    const resultado = [];

    stores.forEach(store => {

        fechas.forEach(fecha => {

            resultado.push({
                store,
                fecha
            });

        });

    });

    return resultado;

}

function obtenerDepartamento(
    descripcion
) {

    if (
        descripcion.includes(
            'Amex Expected Deposit'
        ) ||
        descripcion.includes(
            'Kiosk Expected Payment'
        ) ||
        descripcion.includes(
            'CC Expected Deposit'
        )
    ) {
        return 'CC';
    }

    if (
        descripcion.includes(
            'Cash Expected Deposit'
        ) ||
        descripcion.includes(
            'Non-Redeemable Tender'
        ) ||
        descripcion.includes(
            'O/S DC Discrepancies'
        ) ||
        descripcion.includes(
            'POS Over/Short'
        ) ||
        descripcion.includes(
            'Diff Between'
        )
    ) {
        return 'CASH';
    }

    if (
        descripcion.includes(
            'GrubHub'
        )
    ) {
        return 'GHD';
    }

    if (
        descripcion.includes(
            'Uber'
        )
    ) {
        return 'UBD';
    }

    if (
        descripcion.includes(
            'DoorDash'
        )
    ) {
        return 'DDD';
    }

    return '';

}

/*STOREDATES*/

function generarStoreDatesPopeyes(
    rawRows
) {

    const tiendas =
        obtenerTiendas(
            rawRows
        );

    const fechas =
        obtenerFechas(
            rawRows
        );

    const cuentas =
        obtenerCatalogoCuentas();

    const resultado = [];

    let sequence = 1;

    fechas.forEach(fecha => {

        tiendas.forEach(store => {

            cuentas.forEach(cuenta => {

                resultado.push({

                    accountingDate:
                        fecha,

                    sequence:
                        sequence++,

                    journal:
                        'POS Data Upload DC Central',

                    store,

                    department:
                        obtenerDepartamento(
                            cuenta.nombre
                        ),

                    account:
                        cuenta.account,

                    amount:
                        store

                });

            });

        });

    });

    return resultado;

}

/*SALES*/



function sumaCuenta(
    registros,
    store,
    fecha,
    cuenta
) {

    return registros
        .filter(r =>
            Number(r['Unit Number']) === Number(store) &&
            normalizarFecha(r['Accounting Date']) === fecha &&
            r['Account'] === cuenta
        )
        .reduce(
            (sum, r) =>
                sum +
                (Number(r['Credit Amount']) || 0),
            0
        );

}

function sumaDebito(
    registros,
    store,
    fecha,
    cuenta
) {

    return registros
        .filter(r =>
            Number(r['Unit Number']) === Number(store) &&
            normalizarFecha(r['Accounting Date']) === fecha &&
            r['Account'] === cuenta
        )
        .reduce(
            (sum, r) =>
                sum +
                (Number(r['Debit Amount']) || 0),
            0
        );

}

function agruparPorFechaYTienda(rawRows) {

    if (!Array.isArray(rawRows)) {

        console.error(
            'agruparPorFechaYTienda recibió:',
            rawRows
        );

        return [];
    }

    const grupos = {};

    rawRows.forEach(row => {


        const fecha =
            normalizarFecha(
                row['Accounting Date']
            );

        const store =
            row['Unit Number'];

        const key =
            `${fecha}_${store}`;

        if (!grupos[key]) {

            grupos[key] = {

                fecha,
                store,
                unitName:
                    row['Unit Name'] || '',

                registros: []

            };

        }

        grupos[key]
            .registros
            .push(row);

    });

    return Object.values(
        grupos
    );

}

function normalizarFecha(valor) {

    if (!valor) return '';

    // Fecha serial de Excel
    if (typeof valor === 'number') {

        const fecha =
            XLSX.SSF.parse_date_code(valor);

        const mes =
            String(fecha.m).padStart(2, '0');

        const dia =
            String(fecha.d).padStart(2, '0');

        const anio =
            fecha.y;

        return `${mes}/${dia}/${anio}`;
    }

    return String(valor);

}

function monto(grupo, cuenta) {
    const total =
        grupo.registros
            .filter(r => r.Account === cuenta)
            .reduce(
                (sum, r) =>
                    sum +
                    (Number(r['Credit Amount']) || 0) -
                    (Number(r['Debit Amount']) || 0),
                0
            );

    return Math.abs(total);
}

function montoSinAbs(grupo, cuenta) {

    return grupo.registros
        .filter(
            r => r.Account === cuenta
        )
        .reduce(
            (sum, r) =>
                sum +
                (Number(r['Credit Amount']) -
                    Number(r['Debit Amount'])),
            0
        );

}


function generarSalesPopeyes(rawRows) {

    const grupos = agruparPorFechaYTienda(rawRows);

    return grupos.map(grupo => {

        const store = String(grupo.store).trim();
        const unitName = grupo.unitName;
        const fecha = grupo.fecha;

        // ==================================================
        // SALES
        // ==================================================

        const food = monto(grupo, 'Net Sales - Food');
        const beverage = monto(grupo, 'Net Sales - Beverages');
        const other = monto(grupo, 'Net Sales - Other');

        const serviceFee =
            monto(grupo, 'Service Fees negative Offset');

        const salesOther =
            other + serviceFee;

        const netSales =
            food + beverage + salesOther;

        const salesTax =
            monto(grupo, 'Sales Tax Payable');

        const taxExemptSales =
            monto(grupo, 'Tax Exempt Sales');

        const caCrv =
            monto(grupo, 'CA CRV');

        const donations =
            monto(grupo, 'Donations');

        const nonRedeemable =
            monto(grupo, 'Non Redeemable Tender');

        const gcSold =
            monto(grupo, 'Revenues - Gift Card Sales');

        // ==================================================
        // DELIVERY / TIPS
        // ==================================================

        const deliveryFee =
            monto(grupo, 'Delivery Fees Net');

        const deliveryTips =
            monto(grupo, 'Delivery Tips');

        const deliveryTipsNet =
            monto(grupo, 'Delivery Tips Net');

        const wlTips =
            monto(grupo, 'WL DD Tips');

        const totalTips =
            deliveryTips +
            deliveryTipsNet +
            wlTips;

        // ==================================================
        // DISCOUNTS
        // ==================================================

        const discountsPromo =
            monto(grupo, 'Discounts - $ Off Promo');

        const discountEmployee =
            monto(grupo, 'Discounts - Employee');

        const discountGuestRecovery =
            monto(grupo, 'Discounts - Guest Recovery');

        const discountManager =
            monto(grupo, 'Discounts - Manager');

        const discountMilitary =
            monto(grupo, 'Discounts - Military');

        const discountPolice =
            monto(grupo, 'Discounts - Police');

        const discountSenior =
            monto(grupo, 'Discounts - Senior Citizens');

        const discountsOther =
            monto(grupo, 'Discounts - Other');

        const discount10 =
            monto(grupo, 'Discounts - 10%');

        const discountOpenDollar =
            monto(grupo, 'Discounts - Open $');

        const discountOpenPercent =
            monto(grupo, 'Discounts - Open %');

        const discounts =
            discountEmployee +
            discountGuestRecovery +
            discountManager +
            discountMilitary +
            discountPolice +
            discountSenior +
            discountsOther +
            discountOpenDollar +
            discountOpenPercent +
            discount10;

        const totalDiscounts =
            discounts + discountsPromo;

        // ==================================================
        // PAYMENTS (FIX CRÍTICO)
        // ==================================================

        const amex =
            monto(grupo, 'Payments - AMEX');

        const amexPrPd =
            monto(grupo, 'Payments - PrPd Amex');

        const visa =
            monto(grupo, 'Payments - Visa');

        const mastercard =
            monto(grupo, 'Payments - Master Card');

        const discover =
            monto(grupo, 'Payments - Discover');

        const debit =
            monto(grupo, 'Payments - Debit');

        const ebt =
            monto(grupo, 'Payments - EBT');

        const gcRedeem =
            monto(grupo, 'Payments - Gift Card');

        const cashApp =
            monto(grupo, 'Payments - Cash App');

        const onlineCatering =
            monto(grupo, 'Payments - Online Catering');

        const ezCater =
            monto(grupo, 'Payments - EZ Cater');

        const dd =
            monto(grupo, 'Payments - Door Dash');

        const gh =
            monto(grupo, 'Payments - Grub Hub');

        const uber =
            monto(grupo, 'Payments - Uber Eats');

        const postmates =
            monto(grupo, 'Payments - Postmates');

        const doorDashShortage =
            monto(grupo, 'Payments - Door Dash Shortage');

        const uberShortage =
            monto(grupo, 'Payments - Uber Shortage');

        const kiosk =
            monto(grupo, 'Payments - Kiosk') +
            monto(grupo, 'Payments - Kiosk Amex') +
            monto(grupo, 'Payments - Kiosk Discover') +
            monto(grupo, 'Payments - Kiosk MasterCard') +
            monto(grupo, 'Payments - Kiosk Visa');

        const otherDelivery =
            monto(grupo, 'Payments - Other Delivery');

        const otherPayments =
            monto(grupo, 'Payments - Other');

        const imtPaypal =
            monto(grupo, 'Payments - IMT Paypal');

        const prPdPaypal =
            monto(grupo, 'Payments - PrPD Paypal');

        const prPdVenmo =
            monto(grupo, 'Payments - PrPD Venmo');

        const wlMasterCard =
            monto(grupo, 'Payments - WL MasterCard');

        const wlVisa =
            monto(grupo, 'Payments - WL Visa');

        const ccTotals =
            monto(grupo, 'Payments - Discover') +
            monto(grupo, 'Payments - Discover PrPd') +

            monto(grupo, 'Payments - Master Card') +
            monto(grupo, 'Payments - Master Card PrPd') +

            monto(grupo, 'Payments - Visa') +
            monto(grupo, 'Payments - Visa PrPd') +

            monto(grupo, 'Payments - PrPd Master Card') +
            monto(grupo, 'Payments - PrPd Visa') +

            monto(grupo, 'Payments - WL MasterCard') +
            monto(grupo, 'Payments - WL Visa') +

            monto(grupo, 'Payments - PrPD Paypal') +
            monto(grupo, 'Payments - PrPD Venmo') +

            monto(grupo, 'Payments - Debit') +

            monto(grupo, 'Payments - Other Delivery') +
            monto(grupo, 'Payments - Other') +

            monto(grupo, 'Payments - Cash App') +
            monto(grupo, 'Payments - IMT Paypal');

        const delTotals =
            dd + gh + uber + postmates;

        // ==================================================
        // PAID OUT
        // ==================================================

        const paidOutSmallwares =
            monto(grupo, 'Paid Out Smallwares');

        const paidOutCleaning =
            monto(grupo, 'Paid Out Cleaning Supplies');

        const paidOutOffice =
            monto(grupo, 'Paid Out Office Supplies');

        const paidOutFood =
            monto(grupo, 'Paid Out Food');

        const paidOutCashOut =
            monto(grupo, 'Paid Out Cash Out');

        const paidOut =
            paidOutSmallwares +
            paidOutCleaning +
            paidOutOffice +
            paidOutFood +
            paidOutCashOut;

        // ==================================================
        // CASH
        // ==================================================

        const cashDeposit =
            monto(grupo, 'Cash Deposit');

        const movimientosOS =
            grupo.registros.filter(r =>
                norm(r.Account).includes('over/short')
            );

        const cashOverShortDebit =
            movimientosOS.reduce(
                (s, r) => s + (Number(r['Credit Amount']) || 0),
                0
            );

        const cashOverShortCredit =
            movimientosOS.reduce(
                (s, r) => s + (Number(r['Debit Amount']) || 0),
                0
            );

        return {

            store,
            unitName,
            fecha,

            food,
            beverage,
            other,

            serviceFee,
            salesOther,
            netSales,

            salesTax,
            taxExemptSales,
            caCrv,

            donations,
            nonRedeemable,
            gcSold,

            deliveryFee,
            deliveryTips,
            deliveryTipsNet,
            wlTips,
            totalTips,

            discounts,
            discountsPromo,
            totalDiscounts,
            discountsOther,

            amex,
            amexPrPd,
            visa,
            mastercard,
            discover,
            debit,

            ccTotals,

            dd,
            gh,
            uber,
            postmates,
            delTotals,

            doorDashShortage,
            uberShortage,

            ebt,
            kiosk,
            gcRedeem,
            cashApp,

            onlineCatering,
            ezCater,

            otherDelivery,
            otherPayments,

            paidOut,
            paidOutSmallwares,
            paidOutCleaning,
            paidOutOffice,
            paidOutFood,
            paidOutCashOut,

            cashOverShortDebit,
            cashOverShortCredit,
            cashDeposit
        };

    });
}

function generarConciliationPopeyes(salesData) {

    return salesData.map(row => {

        // =========================
        // SALES
        // =========================

        const serviceFee = (row.serviceFee || 0);

        const salesOther =
            (row.other || 0) +
            (row.serviceFee || 0);

        const netSales = row.netSales;

        // =========================
        // DISCOUNTS
        // =========================

        const totalDiscounts =
            (row.discounts || 0) +
            (row.discountsPromo || 0);

        // =========================
        // DELIVERY
        // =========================

        const delTotals =
            (row.dd || 0) +
            (row.gh || 0) +
            (row.uber || 0) +
            (row.postmates || 0);

        // =========================
        // PAID OUT
        // =========================

        const paidOut =
            (row.paidOutSmallwares || 0) +
            (row.paidOutCleaning || 0) +
            (row.paidOutOffice || 0) +
            (row.paidOutFood || 0) +
            (row.paidOutCashOut || 0);

        // =========================
        // REVENUE
        // =========================

        const totalRevenue =
            netSales +
            (row.salesTax || 0) +
            (row.caCrv || 0) +
            (row.gcSold || 0) +
            (row.donations || 0) +
            (row.nonRedeemable || 0);


        const cashDepositCalculated =
            (
                (row.other || 0) +
                (row.deliveryFee || 0) +
                netSales +
                (row.salesTax || 0) +
                (row.caCrv || 0) +
                (row.gcSold || 0) +
                (row.donations || 0) +
                (row.nonRedeemable || 0) +
                (row.wlTips || 0)
            )
            -
            (
                (row.discounts || 0) +
                (row.discountsPromo || 0) +
                (row.amex || 0) +
                (row.amexPrPd || 0) +
                (row.amexPrPd || 0) +
                (row.ccTotals || 0) +
                (row.dd || 0) +
                (row.gh || 0) +
                (row.uber || 0) +
                (row.doorDashShortage || 0) +
                (row.uberShortage || 0) +
                (row.ebt || 0) +
                (row.kiosk || 0) +
                (row.gcRedeem || 0) +
                (row.onlineCatering || 0) +
                (row.ezCater || 0) +
                paidOut
            );

        // =========================
        // PAYMENTS (CLEAN VERSION)
        // =========================

        const paymentsTotal =
            (row.amex || 0) +
            (row.amexPrPd || 0) +
            (row.visa || 0) +
            (row.mastercard || 0) +
            (row.discover || 0) +
            (row.debit || 0) +

            (row.dd || 0) +
            (row.gh || 0) +
            (row.uber || 0) +
            (row.postmates || 0) +

            (row.ebt || 0) +
            (row.kiosk || 0) +
            (row.gcRedeem || 0) +

            (row.onlineCatering || 0) +
            (row.ezCater || 0) +

            paidOut +

            (row.cashDeposit || 0);

        // =========================
        // CASH EXPECTED (SIMPLIFICADO Y CORRECTO)
        // =========================

        const cashExpected =
            (
                (row.other || 0) +
                (row.deliveryFee || 0) +
                (row.netSales || 0) +
                (row.salesTax || 0) +
                (row.caCrv || 0) +
                (row.gcSold || 0) +
                (row.donations || 0) +
                (row.nonRedeemable || 0) +
                (row.wlTips || 0)
            )
            -
            (
                (row.discounts || 0) +
                (row.discountsPromo || 0) +
                (row.amex || 0) +
                (row.amexPrPd || 0) +
                (row.ccTotals || 0) +
                (row.dd || 0) +
                (row.gh || 0) +
                (row.uber || 0) +
                (row.doorDashShortage || 0) +
                (row.uberShortage || 0) +
                (row.ebt || 0) +
                (row.kiosk || 0) +
                (row.gcRedeem || 0) +
                (row.onlineCatering || 0) +
                (row.ezCater || 0) +
                (row.paidOut || 0)
            );

        // =========================
        // OVER / SHORT
        // =========================

        const oS =
            totalRevenue - paymentsTotal;

        const difference =
            cashExpected -
            (
                (row.cashDeposit || 0) -
                (row.cashOverShortCredit || 0) +
                (row.cashOverShortDebit || 0)
            );

        return {

            ...row,

            salesOther,
            netSales,

            totalDiscounts,

            delTotals,

            paidOut,

            totalRevenue,

            paymentsTotal,

            cashExpected,

            difference,

            oS,
            cashDepositCalculated,
            serviceFee

        };

    });

}

function generarTaxReviewPopeyes() {

    taxReviewData =
        datosExtraidos.map(row => {

            const taxRate =
                obtenerTaxRate(
                    row.store
                );

            const taxableSales =
                row.food +
                row.beverage +
                row.other -
                row.discounts -
                row.uber -
                row.ebt;

            const taxCalculation =
                taxableSales *
                taxRate;

            const salesTaxPayable =
                row.salesTax;

            const taxDifference =
                taxCalculation -
                salesTaxPayable;

            const rateCalculation =
                taxableSales !== 0
                    ? salesTaxPayable /
                    taxableSales
                    : 0;

            const rateDifference =
                taxRate -
                rateCalculation;

            return {

                store:
                    row.store,

                unitName:
                    row.unitName,

                taxRate,

                food:
                    row.food,

                beverage:
                    row.beverage,

                other:
                    row.other,

                discounts:
                    row.discounts,

                uber:
                    row.uber,

                ebt:
                    row.ebt,

                taxableSales,

                taxCalculation,

                salesTaxPayable,

                taxDifference,

                rateCalculation,

                rateDifference

            };

        });

}

function renderTaxReviewTable() {

    const tbody =
        document.getElementById(
            'taxReviewBody'
        );

    if (!tbody) return;

    tbody.innerHTML = '';

    taxReviewData.forEach(row => {

        tbody.innerHTML += `
            <tr>

                <td>${row.store}</td>

                <td>${row.unitName}</td>

                <td>${(row.taxRate * 100).toFixed(2)}%</td>

                <td>${formatMoney(row.taxableSales)}</td>

                <td>${formatMoney(row.taxCalculation)}</td>

                <td>${formatMoney(row.salesTaxPayable)}</td>

                <td>${formatMoney(row.taxDifference)}</td>

                <td>${(row.rateCalculation * 100).toFixed(2)}%</td>

                <td>${(row.rateDifference * 100).toFixed(2)}%</td>

            </tr>
        `;

    });

}
function generarDailySales04042026Popeyes() {

    dailySales0404Data = [];

    let lineNo = 1;

    datosExtraidos.forEach(row => {

        const store =
            Number(row.store);

        function pushLine(
            acctNo,
            memo,
            debit = 0,
            credit = 0,
            dept = ''
        ) {

            dailySales0404Data.push({

                lineNo: lineNo++,

                journal: 'SJ',

                date: row.fecha,

                description:
                    'POS Data Upload DC Central',

                memo,

                deptId: dept,

                acctNo,

                locationId: store,

                debit,

                credit

            });

        }

        if (row.netSales) {

            pushLine(
                400200,
                'Gross Food Sales',
                0,
                row.netSales
            );

        }

        if (row.discounts) {

            pushLine(
                410000,
                'Discounts',
                row.discounts,
                0
            );

        }

        if (row.salesTax) {

            pushLine(
                222000,
                'Sales Tax Payable',
                0,
                row.salesTax
            );

        }

        if (row.ccTotals) {

            pushLine(
                111200,
                'CC Expected Deposit',
                row.ccTotals,
                0,
                'CC'
            );

        }

        if (row.cashExpected) {

            pushLine(
                102000,
                'Cash Expected Deposit',
                row.cashExpected,
                0,
                'CASH'
            );

        }

    });

}

function generarConciliacionPopeyes() {

    const sheet =
        salesWorkbook.Sheets[
        salesWorkbook.SheetNames[0]
        ];

    const rows =
        XLSX.utils.sheet_to_json(
            sheet,
            { defval: 0 }
        );

    const salesData =
        generarSalesPopeyes(rows);

    datosExtraidos =
        generarConciliationPopeyes(
            salesData
        );

    document.getElementById(
        'resultsSection'
    ).style.display = 'block';

    renderTablaSucursales();

    actualizarResumen();

    actualizarTotales();
}


function renderConciliation() {

    renderArrayToMainTable(
        datosExtraidos || []
    );

}

function renderTaxReview() {

    renderArrayToMainTable(
        taxReviewData || []
    );

}

function renderDailySalesRed() {

    renderArrayToMainTable(
        redData || []
    );

}

function renderDailySales0404() {

    renderArrayToMainTable(
        dailySales0404Data || []
    );

}

// ======================
// REGISTRAR PESTAÑAS
// ======================

function inicializarTabsPopeyes() {

    const tabs =
        document.querySelectorAll(
            '#popeyesTabs .tab-btn'
        );

    tabs.forEach(tab => {

        tab.addEventListener(
            'click',
            () => {

                tabs.forEach(t =>
                    t.classList.remove('active')
                );

                tab.classList.add('active');

                switch (tab.dataset.tab) {

                    case 'conciliation':
                        renderConciliation();
                        break;

                    case 'taxReview':
                        renderTaxReview();
                        break;

                    case 'dailySalesRed':
                        renderDailySalesRed();
                        break;

                    case 'dailySales0404':
                        renderDailySales0404();
                        break;

                }

            }
        );

    });

}




