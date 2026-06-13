// conciliacion-popeyes.js
window.taxReviewData ??= [];
window.redData ??= [];
window.statisticalDeliveryData ??= [];
window.journalData ??= [];
window.statisticalJournalData ??= [];

// ========================
// GLOBAL HELPERS (OBLIGATORIO)
// ========================
function norm(v) {
    return String(v || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function num(v) {
    return Number(String(v || '').replace(/[$,()]/g, '')) || 0;
}

function toNumber(v) {
    return Number(v || 0);
}



// =========================
// DEBUG TOOLS
// =========================

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

function monto(grupo, keyword) {

    const key = norm(keyword);

    return grupo.registros.reduce((sum, r) => {

        const acc = norm(r.Account);

        if (acc.includes(key)) {

            return sum +
                (Number(r['Credit Amount']) || 0) -
                (Number(r['Debit Amount']) || 0);

        }

        return sum;

    }, 0);

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

        // =========================
        // SALES BASE (CORRECTO)
        // =========================

        const food = monto(grupo, 'Net Sales - Food');
        const beverage = monto(grupo, 'Net Sales - Beverages');
        const other = monto(grupo, 'Net Sales - Other');

        const serviceFee = monto(grupo, 'Service Fees negative Offset');

        const netSales =
            food + beverage + other + serviceFee;

        const salesTax = monto(grupo, 'Sales Tax Payable');
        const caCrv = monto(grupo, 'CA CRV');
        const donations = monto(grupo, 'Donations');
        const nonRedeemable = monto(grupo, 'Non Redeemable Tender');
        const gcSold = monto(grupo, 'Revenues - Gift Card Sales');

        // =========================
        // DELIVERY
        // =========================

        const deliveryFee = monto(grupo, 'Delivery Fees Net');

        const dd = monto(grupo, 'Payments - Door Dash');
        const gh = monto(grupo, 'Payments - Grub Hub');
        const uber = monto(grupo, 'Payments - Uber Eats');
        const postmates = monto(grupo, 'Payments - Postmates');

        // =========================
        // DISCOUNTS (OK)
        // =========================

        const discounts =
            monto(grupo, 'Discounts - Employee') +
            monto(grupo, 'Discounts - Guest Recovery') +
            monto(grupo, 'Discounts - Manager') +
            monto(grupo, 'Discounts - Military') +
            monto(grupo, 'Discounts - Police') +
            monto(grupo, 'Discounts - Senior Citizens') +
            monto(grupo, 'Discounts - Other');

        const discountsPromo =
            monto(grupo, 'Discounts - $ Off Promo');

        // =========================
        // PAYMENTS (RAW CLEAN ONLY)
        // =========================

        const amex = monto(grupo, 'Payments - AMEX');
        const visa = monto(grupo, 'Payments - Visa');
        const mastercard = monto(grupo, 'Payments - Master Card');
        const discover = monto(grupo, 'Payments - Discover');
        const debit = monto(grupo, 'Payments - Debit');

        const cashApp = monto(grupo, 'Payments - Cash App');
        const imtPaypal = monto(grupo, 'Payments - IMT Paypal');

        const wlVisa = monto(grupo, 'Payments - WL Visa');
        const wlMasterCard = monto(grupo, 'Payments - WL MasterCard');

        const prPdVisa = monto(grupo, 'Payments - PrPd Visa');
        const prPdMasterCard = monto(grupo, 'Payments - PrPd Master Card');

        const ccTotals =
            amex + visa + mastercard + discover + debit +
            cashApp + imtPaypal +
            wlVisa + wlMasterCard +
            prPdVisa + prPdMasterCard;

        // =========================
        // PAID OUT
        // =========================

        const paidOut =
            monto(grupo, 'Paid Out Smallwares') +
            monto(grupo, 'Paid Out Cleaning Supplies') +
            monto(grupo, 'Paid Out Office Supplies') +
            monto(grupo, 'Paid Out Food') +
            monto(grupo, 'Paid Out Cash Out');

        // =========================
        // CASH
        // =========================

        const cashDeposit =
            monto(grupo, 'Cash Deposit');

        return {

            store,
            unitName,
            fecha,

            food,
            beverage,
            other,
            serviceFee,
            netSales,

            salesTax,
            caCrv,
            donations,
            nonRedeemable,
            gcSold,

            deliveryFee,

            dd,
            gh,
            uber,
            postmates,

            discounts,
            discountsPromo,

            amex,
            visa,
            mastercard,
            discover,
            debit,

            cashApp,
            imtPaypal,
            wlVisa,
            wlMasterCard,
            prPdVisa,
            prPdMasterCard,

            ccTotals,

            paidOut,
            cashDeposit
        };

    });
}

function generarConciliationPopeyes(salesData) {

    return salesData
        .filter(Boolean)
        .map(row => {

            const netSales = row.netSales;

            const totalRevenue =
                netSales +
                (row.salesTax || 0) +
                (row.caCrv || 0) +
                (row.gcSold || 0) +
                (row.donations || 0) +
                (row.nonRedeemable || 0);

            const cashExpected =
                totalRevenue +
                (row.deliveryFee || 0) +
                (row.discountsPromo || 0)
                -
                (
                    (row.discounts || 0) +
                    (row.ccTotals || 0) +
                    (row.dd || 0) +
                    (row.gh || 0) +
                    (row.uber || 0) +
                    (row.postmates || 0) +
                    (row.paidOut || 0)
                );

            const paymentsTotal =
                row.ccTotals +
                (row.dd || 0) +
                (row.gh || 0) +
                (row.uber || 0) +
                (row.postmates || 0) +
                (row.paidOut || 0) +
                (row.cashDeposit || 0);

            const oS = totalRevenue - paymentsTotal;

            const difference =
                cashExpected - row.cashDeposit;

            return {
                ...row,
                totalRevenue,
                cashExpected,
                paymentsTotal,
                oS,
                difference
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


