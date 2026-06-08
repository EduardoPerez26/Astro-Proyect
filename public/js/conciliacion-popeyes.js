// conciliacion-popeyes.js
let storeDatesData = [];
let salesData = [];
let conciliationData = [];
let taxReviewData = [];
async function procesarPopeyes() {

    const sales =
        generarSalesPopeyes(
            salesRows
        );

    const conciliation =
        generarConciliationPopeyes(
            sales
        );

    const taxReview =
        generarTaxReviewPopeyes(
            conciliation
        );

    datosExtraidos =
        conciliation;

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
            .filter(
                r => r.Account === cuenta
            )
            .reduce(
                (sum, r) =>
                    sum +
                    (
                        Number(r['Credit Amount']) || 0
                    ) -
                    (
                        Number(r['Debit Amount']) || 0
                    ),
                0
            );

    return Math.abs(total);

}

function generarSalesPopeyes(rawRows) {

    const grupos =
        agruparPorFechaYTienda(rawRows);


    return grupos.map(grupo => {


        const store =
            grupo.store;

        const unitName =
            grupo.unitName;

        const fecha =
            grupo.fecha;

        // ==========================
        // SALES
        // ==========================

        const food =
            monto(grupo, 'Net Sales - Food');

        const beverage =
            monto(grupo, 'Net Sales - Beverages');

        const other =
            monto(grupo, 'Net Sales - Other');

        const netSales =
            food +
            beverage +
            other;

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

        // ==========================
        // FEES
        // ==========================

        const serviceFee =
            monto(grupo, 'Service Fees negative Offset');

        const salesOther = monto(grupo, 'Sales Other');

        const deliveryFee =
            monto(grupo, 'Delivery Fee');

        const deliveryFeeNet =
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



        // ==========================
        // DISCOUNTS
        // ==========================



        const discountsPromo = monto(grupo, 'Discounts - $ Off Promo');

        const discounts = monto(grupo, 'Discounts')

        const discountsWraps =
            monto(grupo, 'Promotions - Wraps');

        const discountEmployee =
            monto(grupo, 'Promotions - Employee');

        const discountGuestRecovery =
            monto(grupo, 'Promotions - Guest Recovery');

        const discountManager =
            monto(grupo, 'Promotions - Manager');

        const discountMilitary =
            monto(grupo, 'Promotions - Military');

        const discountPolice =
            monto(grupo, 'Promotions - Police');

        const discountSenior =
            monto(grupo, 'Promotions - Senior Citizens');

        const discountsOther =
            monto(grupo, 'Promotions - Other');

        const discountOpenDollar =
            monto(grupo, 'Promotions - Open $');

        const discountOpenPercent =
            monto(grupo, 'Promotions - Open %');

        const discount10 =
            monto(grupo, 'Promotions - 10%');







        // ==========================
        // CREDIT CARDS
        // ==========================

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

        const ccTotals =
            amex +
            amexPrPd +
            visa +
            mastercard +
            discover +
            debit;

        // ==========================
        // DELIVERY PAYMENTS
        // ==========================

        const dd =
            monto(grupo, 'Payments - Door Dash');

        const gh =
            monto(grupo, 'Payments - Grub Hub');

        const uber =
            monto(grupo, 'Payments - Uber Eats');

        const postmates =
            monto(grupo, 'Payments - Postmates');

        const delTotals =
            dd +
            uber +
            gh;

        const doorDashShortage =
            monto(grupo, 'Payments - Door Dash Shortage');

        const uberShortage =
            monto(grupo, 'Payments - Uber Shortage');

        // ==========================
        // OTHER PAYMENTS
        // ==========================

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

        const otherDelivery =
            monto(grupo, 'Payments - Other Delivery');

        const otherPayments =
            monto(grupo, 'Payments - Other');

        // ==========================
        // KIOSK
        // ==========================

        const kioskAmex =
            monto(grupo, 'Payments - Kiosk Amex');

        const kioskMain =
            monto(grupo, 'Payments - Kiosk');

        const kioskDiscover =
            monto(grupo, 'Payments - Kiosk Discover');

        const kioskMastercard =
            monto(grupo, 'Payments - Kiosk MasterCard');

        const kioskVisa =
            monto(grupo, 'Payments - Kiosk Visa');

        const kiosk =
            kioskAmex +
            kioskMain +
            kioskDiscover +
            kioskMastercard +
            kioskVisa;

        // ==========================
        // PAID OUTS
        // ==========================

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

        // ==========================
        // CASH
        // ==========================

        const cashDeposit =
            monto(grupo, 'Cash Deposit');

        const cashOverShort =
            monto(grupo, 'Cash Handling - Over/Short');

        const cashOverShortDebit =
            monto(grupo, 'Cash Handling - Over/Short Debit');

        const cashOverShortCredit =
            monto(grupo, 'Cash Handling - Over/Short Credit');

        // ==========================
        // TOTALS
        // ==========================

        const totalRevenue =
            netSales +
            salesTax +
            caCrv +
            gcSold;

        const paymentsTotal =
            ccTotals +
            delTotals +
            ebt +
            gcRedeem +
            cashApp +
            kiosk +
            ezCater;

        const cashExpected =
            totalRevenue -
            ccTotals -
            delTotals -
            ebt -
            gcRedeem -
            cashApp -
            kiosk;

        const difference =
            cashExpected -
            (
                cashDeposit +
                cashOverShort
            );

        return {

            store,
            unitName,
            fecha,

            food,
            beverage,
            other,

            netSales,

            salesTax,
            taxExemptSales,

            serviceFee,
            salesOther,

            deliveryFee,
            deliveryFeeNet,

            deliveryTips,
            deliveryTipsNet,
            totalTips,

            donations,
            caCrv,
            nonRedeemable,
            discountsPromo,

            discountsWraps,
            discountsOther,
            discounts,





            gcSold,

            totalRevenue,

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

            paymentsTotal,

            cashDeposit,

            cashOverShort,
            cashOverShortDebit,
            cashOverShortCredit,

            cashExpected,

            difference

        };

    });

}

function generarConciliationPopeyes(
    salesData
) {

    return salesData.map(row => {

        const salesFee = (row.serviceFee || 0);

        const salesOther = (row.other || 0) + (row.serviceFee || 0);

        const discounts =
            (row.discounts || 0) +
            (row.discountsPromo || 0);

        const discountsPromo = (row.discountsPromo || 0);

        const totalRevenue =
            row.food +
            row.beverage +
            row.other +
            (row.deliveryFee || 0) +
            (row.totalTips || 0) +
            (row.salesTax || 0) +
            (row.caCrv || 0) +
            (row.gcSold || 0) +
            (row.donations || 0) +
            (row.nonRedeemable || 0) -
            (row.discounts || 0);

        const ccTotals =
            (row.amex || 0) +
            (row.amexPrPd || 0) +
            (row.visa || 0) +
            (row.mastercard || 0) +
            (row.discover || 0) +
            (row.debit || 0);

        const delTotals =
            (row.dd || 0) +
            (row.gh || 0) +
            (row.uber || 0) +
            (row.postmates || 0);

        const paymentsTotal =
            ccTotals +
            delTotals +
            (row.ebt || 0) +
            (row.kiosk || 0) +
            (row.gcRedeem || 0) +
            (row.onlineCatering || 0) +
            (row.ezCater || 0) +
            (row.wlTips || 0) +
            (row.paidOutSmallwares || 0) +
            (row.paidOutCleaning || 0) +
            (row.paidOutOffice || 0) +
            (row.paidOutFood || 0) +
            (row.paidOutCashOut || 0);

        const cashExpected =
            totalRevenue -
            paymentsTotal;

        const difference =
            cashExpected -
            (
                (row.cashDeposit || 0) +
                (row.cashOverShortCredit || 0) -
                (row.cashOverShortDebit || 0)
            );

        return {

            ...row,

            totalRevenue,

            ccTotals,

            delTotals,

            paymentsTotal,

            cashExpected,

            difference,
            salesOther,

            discounts,
            discountsPromo



        };

    });

}

function generarTaxReview() {

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


