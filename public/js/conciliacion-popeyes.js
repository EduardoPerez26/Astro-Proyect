let popeyesConciliationData = [];
let popeyesTaxReviewData = [];
let popeyesDailySalesRedData = [];
let popeyesDailySales0404Data = [];

function procesarPopeyes() {

    try {

        if (!salesRows || salesRows.length === 0) {


            console.log(
                [...new Set(
                    salesRows.map(
                        r => r['Account']
                    )
                )]
            );

            Swal.fire(
                'Error',
                'No hay datos Sales POS cargados',
                'error'
            );

            return false;

        }

        console.log(
            'Sales POS:',
            salesRows.length
        );

        // ==========================
        // Store Dates
        // ==========================

        const storeDates =
            generarStoreDatesPopeyes(
                salesRows
            );

        console.log(
            'StoreDates:',
            storeDates.length
        );

        // ==========================
        // Sales
        // ==========================

        const salesData =
            generarSalesPopeyes(
                salesRows,
                storeDates
            );

        console.log(
            'Sales:',
            salesData.length
        );

        // ==========================
        // Conciliation
        // ==========================

        const conciliacionData =
            generarConciliationPopeyes(
                salesData
            );

        console.log(
            'Conciliation:',
            conciliacionData.length
        );

        // ==========================
        // Datos para tabla principal
        // ==========================

        datosExtraidos =
            conciliacionData;

        popeyesConciliationData =
            conciliacionData;

        // ==========================
        // Mostrar sección
        // ==========================

        const resultsSection =
            document.getElementById(
                'resultsSection'
            );

        if (resultsSection) {

            resultsSection.style.display =
                'block';

        }

        // ==========================
        // Render tabla
        // ==========================

        if (
            typeof renderTablaSucursales ===
            'function'
        ) {

            renderTablaSucursales();

        }

        // ==========================
        // Activar pestaña principal
        // ==========================

        if (
            typeof renderActiveTab ===
            'function'
        ) {

            renderActiveTab();

        }

        console.log(
            'POPEYES OK',
            conciliacionData[0]
        );

        Swal.fire(
            'Éxito',
            `${conciliacionData.length} registros generados`,
            'success'
        );

        return true;

    } catch (error) {

        console.error(
            'Error Popeyes:',
            error
        );

        Swal.fire(
            'Error',
            error.message,
            'error'
        );

        return false;

    }

}

function generarStoreDatesPopeyes(
    salesRows
) {

    const combinaciones =
        new Map();

    salesRows.forEach(row => {

        const store =
            Number(
                row['Unit Number']
            );

        const date =
            row['Accounting Date'];

        if (
            !store ||
            !date
        ) {
            return;
        }

        const key =
            `${store}|${date}`;

        if (
            !combinaciones.has(key)
        ) {

            combinaciones.set(
                key,
                {
                    store,
                    date
                }
            );

        }

    });

    return Array.from(
        combinaciones.values()
    );

}

function normalizarFecha(value) {

    if (!value) return null;

    if (value instanceof Date) {

        return value
            .toISOString()
            .split('T')[0];

    }

    const fecha = new Date(value);

    if (isNaN(fecha)) {
        return null;
    }

    return fecha
        .toISOString()
        .split('T')[0];
}


function sumDebit(
    rows,
    store,
    date,
    account
) {

    return rows
        .filter(r =>

            Number(
                r['Unit Number']
            ) === Number(store)

            &&

            r['Account'] === account

        )
        .reduce(
            (sum, r) =>

                sum +
                Number(
                    r['Debit Amount'] || 0
                ),

            0
        );

}

function sumCredit(
    rows,
    store,
    date,
    account
) {

    return rows
        .filter(r =>

            Number(
                r['Unit Number']
            ) === Number(store)

            &&

            r['Account'] === account

        )
        .reduce(
            (sum, r) =>

                sum +
                Number(
                    r['Credit Amount'] || 0
                ),

            0
        );

}

function sumAccount(
    salesPosRows,
    store,
    date,
    account,
    field = 'debit'
) {

    return salesPosRows
        .filter(r =>
            Number(r.store) === Number(store) &&
            normalizarFecha(r.accountingDate) === normalizarFecha(date) &&
            r.account === account
        )
        .reduce(
            (sum, r) =>
                sum + (Number(r[field]) || 0),
            0
        );

}

function generarSalesPopeyes(
    salesPosRows,
    storeDates
) {

    return storeDates.map(
        ({ store, date }) => {

            // ==========================
            // SALES
            // ==========================

            const food =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Net Sales - Food'
                );

            const beverages =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Net Sales - Beverages'
                );

            const other =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Net Sales - Other'
                );

            const serviceFee =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Service Fees Negative Offset'
                );

            const deliveryFeeNet =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Delivery Fees Net'
                );

            const salesTax =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Sales Tax Payable'
                );

            const taxExemptSales =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Tax Exempt Sales'
                );

            const salesTaxNoTax =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Sales Tax Payable - No Tax'
                );

            const caCrv =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'CA CRV'
                );

            // ==========================
            // DISCOUNTS
            // ==========================

            const promo =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - $ Off Promo'
                );

            const employee =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Employee'
                );

            const guestRecovery =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Guest Recovery'
                );

            const manager =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Manager'
                );

            const military =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Military'
                );

            const police =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Police'
                );

            const senior =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Senior Citizens'
                );

            const otherDiscount =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Other'
                );

            const discount10 =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - 10%'
                );

            const openDollar =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Open $'
                );

            const openPercent =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Open %'
                );

            const totalDiscounts =
                promo +
                employee +
                guestRecovery +
                manager +
                military +
                police +
                senior +
                otherDiscount +
                discount10 +
                openDollar +
                openPercent;

            // ==========================
            // DONATIONS
            // ==========================

            const donations =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Donations'
                );

            // ==========================
            // CREDIT CARDS
            // ==========================

            const amex =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - AMEX'
                );

            const discover =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Discover'
                );

            const discoverPrpd =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Discover PrPd'
                );

            const masterCard =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Master Card'
                );

            const masterCardPrpd =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Master Card PrPd'
                );

            const visa =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Visa'
                );

            const visaPrpd =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Visa PrPd'
                );

            const prepaidMasterCard =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - PrPd Master Card'
                );

            const prepaidVisa =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - PrPd Visa'
                );

            const wlMasterCard =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - WL MasterCard'
                );

            const wlVisa =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - WL Visa'
                );

            const prepaidPaypal =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - PrPD Paypal'
                );

            const prepaidVenmo =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - PrPD Venmo'
                );

            const debit =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Debit'
                );

            const otherDelivery =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Other Delivery'
                );

            const otherPayment =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Other'
                );

            const cashApp =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Cash App'
                );

            const imtPaypal =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - IMT Paypal'
                );

            const totalCC =
                amex +
                discover +
                discoverPrpd +
                masterCard +
                masterCardPrpd +
                visa +
                visaPrpd +
                prepaidMasterCard +
                prepaidVisa +
                wlMasterCard +
                wlVisa +
                prepaidPaypal +
                prepaidVenmo +
                debit +
                otherDelivery +
                otherPayment +
                cashApp +
                imtPaypal;

            // ==========================
            // DELIVERY
            // ==========================

            const doorDash =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Door Dash'
                );

            const grubHub =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Grub Hub'
                );

            const uberEats =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Uber Eats'
                );

            const doorDashShortage =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Door Dash Shortage'
                );

            const uberShortage =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Uber Shortage'
                );

            const ebt =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - EBT'
                );

            const giftCardRedeemed =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Gift Card'
                ) +
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - GiftCard'
                );

            const giftCardSold =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Revenues - Gift Card Sales'
                );

            const onlineCatering =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Online Catering'
                );

            const ezCater =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - EZ Cater'
                );

            // ==========================
            // PAID OUTS
            // ==========================

            const paidOutSmallwares = 0;
            const paidOutCleaning = 0;
            const paidOutOffice = 0;
            const paidOutFood = 0;
            const paidOutCashOut = 0;

            const paidOutTotal =
                paidOutSmallwares +
                paidOutCleaning +
                paidOutOffice +
                paidOutFood +
                paidOutCashOut;

            // ==========================
            // RESULT
            // ==========================

            return {
                store,
                date,

                food,
                beverages,
                other,

                serviceFee,
                deliveryFeeNet,

                salesTax,
                taxExemptSales,
                salesTaxNoTax,
                caCrv,

                promo,
                employee,
                guestRecovery,
                manager,
                military,
                police,
                senior,
                otherDiscount,
                discount10,
                openDollar,
                openPercent,
                totalDiscounts,

                donations,

                amex,
                discover,
                discoverPrpd,
                masterCard,
                masterCardPrpd,
                visa,
                visaPrpd,

                totalCC,

                doorDash,
                grubHub,
                uberEats,

                doorDashShortage,
                uberShortage,

                ebt,

                giftCardRedeemed,
                giftCardSold,

                onlineCatering,
                ezCater,

                paidOutTotal
            };

        }
    );

}

function generarConciliationPopeyes(
    salesData
) {

    return salesData.map(row => {

        const salesOther =
            Number(row.other || 0) +
            Number(row.serviceFee || 0);

        const netSales =
            Number(row.food || 0) +
            Number(row.beverages || 0);

        const deliveryTotals =
            Number(row.doorDash || 0) +
            Number(row.grubHub || 0) +
            Number(row.uberEats || 0);

        const totalRevenue =
            Number(row.food || 0) +
            Number(row.beverages || 0) +
            Number(row.other || 0) +
            Number(row.deliveryFeeNet || 0) +
            Number(row.salesTax || 0) +
            Number(row.caCrv || 0) +
            Number(row.giftCardSold || 0) +
            Number(row.donations || 0);

        const paymentsTotal =
            Number(row.totalCC || 0) +
            Number(row.doorDash || 0) +
            Number(row.grubHub || 0) +
            Number(row.uberEats || 0) +
            Number(row.ebt || 0) +
            Number(row.giftCardRedeemed || 0) +
            Number(row.onlineCatering || 0) +
            Number(row.ezCater || 0);

        const overShort =
            totalRevenue -
            paymentsTotal;

        const cashExpected =
            overShort;

        const difference =
            Number(
                (
                    cashExpected -
                    Number(row.cashDeposit || 0)
                ).toFixed(2)
            );

        return {

            ...row,

            salesOther,

            netSales,

            deliveryTotals,

            totalRevenue,

            paymentsTotal,

            overShort,

            cashExpected,

            difference

        };

    });

}

function generarConciliacionPopeyes() {

    if (!salesPosRows?.length) {

        Swal.fire(
            'Error',
            'No hay datos Sales POS cargados',
            'error'
        );

        return;
    }

    // 1
    const storeDates =
        generarStoreDatesPopeyes(
            salesPosRows
        );

    // 2
    const salesData =
        generarSalesPopeyes(
            salesPosRows,
            storeDates
        );

    // 3
    popeyesConciliationData =
        generarConciliationPopeyes(
            salesData
        );

    // Mostrar resultados
    document.getElementById(
        'resultsSection'
    ).style.display = 'block';

    renderConciliationPopeyes();

}

function renderConciliationPopeyes() {

    const data =
        popeyesConciliationData.map(
            row => ({

                STORE:
                    row.store,

                DATE:
                    row.date,

                FOOD:
                    Number(
                        row.food || 0
                    ).toFixed(2),

                BEVERAGES:
                    Number(
                        row.beverages || 0
                    ).toFixed(2),

                OTHER:
                    Number(
                        row.other || 0
                    ).toFixed(2),

                'SALES OTHER':
                    Number(
                        row.salesOther || 0
                    ).toFixed(2),

                'NET SALES':
                    Number(
                        row.netSales || 0
                    ).toFixed(2),

                'TOTAL REVENUE':
                    Number(
                        row.totalRevenue || 0
                    ).toFixed(2),

                'PAYMENTS TOTAL':
                    Number(
                        row.paymentsTotal || 0
                    ).toFixed(2),

                'OVER SHORT':
                    Number(
                        row.overShort || 0
                    ).toFixed(2),

                DIFFERENCE:
                    Number(
                        row.difference || 0
                    ).toFixed(2)

            })
        );

    renderArrayToMainTable(
        data
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

    if (!data?.length) return;

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