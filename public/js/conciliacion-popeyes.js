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

        // ==========================
        // Store Dates
        // ==========================

        const storeDates =
            generarStoreDatesPopeyes(
                salesRows
            );

        // ==========================
        // Sales
        // ==========================

        const salesData =
            generarSalesPopeyes(
                salesRows,
                storeDates
            )

        // ==========================
        // Conciliation
        // ==========================

        const conciliacionData =
            generarConciliationPopeyes(
                salesData
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

        Swal.fire(
            'Éxito',
            `${conciliacionData.length} registros generados`,
            'success'
        );

        return true;

    } catch (error) {

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
                    date,
                    formattedDate:
                        excelDateToJSDate(date)
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
    rows,
    store,
    date,
    account,
    field = 'debit'
) {

    const amountField =
        field === 'credit'
            ? 'Credit Amount'
            : 'Debit Amount';

    return rows
        .filter(r =>

            Number(
                r['Unit Number']
            ) === Number(store)

            &&

            Number(
                r['Accounting Date']
            ) === Number(date)

            &&

            r['Account'] === account

        )
        .reduce(
            (sum, r) =>

                sum +
                Number(
                    r[amountField] || 0
                ),

            0
        );

}

function generarSalesPopeyes(
    salesPosRows,
    storeDates
) {

    return storeDates.map(
        ({ store, date }) => {

            // =====================================
            // SALES
            // =====================================

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

            const caCrv =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'CA CRV'
                );

            // =====================================
            // PROMOTIONS
            // =====================================

            const promoWraps =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Promotions - Wraps'
                );

            const deliveryFee =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Delivery Fee'
                );

            const promoOther =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Promotions - Other'
                );

            const promo =
                promoWraps +
                promoOther;

            const totalDiscounts =
                promo;

            // =====================================
            // TIPS
            // =====================================

            const deliveryTips =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Delivery Tips Net'
                );

            const totalTips =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Tips & Service Charges'
                );

            // =====================================
            // CREDIT CARDS
            // =====================================

            const amex =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - AMEX'
                );

            const amexPrpd =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - PrPd Amex'
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
                    'Payments - PrPd Discover'
                );

            const masterCard =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Master Card'
                );

            const prepaidMasterCard =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - PrPd Master Card'
                );

            const visa =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Visa'
                );

            const prepaidVisa =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - PrPd Visa'
                );

            const debit =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Debit'
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

            const imtVenmo =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - IMT Venmo'
                );

            const totalCC =
                amex +
                amexPrpd +
                discover +
                discoverPrpd +
                masterCard +
                prepaidMasterCard +
                visa +
                prepaidVisa +
                debit +
                cashApp +
                imtPaypal +
                imtVenmo;

            // =====================================
            // DELIVERY
            // =====================================

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

            const deliveryTotals =
                doorDash +
                grubHub +
                uberEats;

            // =====================================
            // OTHER PAYMENTS
            // =====================================

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
                );

            const giftCardSold =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Revenues - Gift Card Sales'
                );

            const ezCater =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - EZ Cater'
                );

            // =====================================
            // KIOSK
            // =====================================

            const kiosk =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Kiosk'
                );

            const kioskDiscover =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Kiosk Discover'
                );

            const kioskMasterCard =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Kiosk MasterCard'
                );

            const kioskVisa =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Kiosk Visa'
                );

            const kioskTotal =
                kiosk +
                kioskDiscover +
                kioskMasterCard +
                kioskVisa;

            // =====================================
            // CASH
            // =====================================

            const cashDeposit =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Cash Deposit'
                );

            const cashHandling =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Cash Handling - Over/Short'
                );

            // =====================================
            // RESULT
            // =====================================

            return {

                store,
                date:
                    excelDateToJSDate(
                        row.date
                    ),

                food,
                beverages,
                other,

                serviceFee,

                deliveryFeeNet,

                salesTax,
                taxExemptSales,
                caCrv,

                promoWraps,
                promoOther,
                promo,
                totalDiscounts,

                deliveryTips,
                totalTips,

                amex,
                amexPrpd,

                discover,
                discoverPrpd,

                masterCard,
                prepaidMasterCard,

                visa,
                prepaidVisa,

                debit,

                cashApp,
                imtPaypal,
                imtVenmo,

                totalCC,

                doorDash,
                grubHub,
                uberEats,
                deliveryTotals,

                ebt,

                giftCardRedeemed,
                giftCardSold,

                ezCater,

                kiosk,
                kioskDiscover,
                kioskMasterCard,
                kioskVisa,
                kioskTotal,

                cashDeposit,
                cashHandling,
                deliveryFee

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

            // =====================
            // SALES
            // =====================

            salesOther,
            netSales,

            // =====================
            // DISCOUNTS
            // =====================

            discounts:
                row.totalDiscounts || 0,

            discountOffPromo:
                row.promo || 0,

            // =====================
            // CARDS
            // =====================

            amexPrpd:
                row.amexPrpd || 0,

            ccTotals:
                row.totalCC || 0,

            // =====================
            // DELIVERY
            // =====================

            delTotals:
                deliveryTotals,

            doorDash:
                row.doorDash || 0,

            grubHub:
                row.grubHub || 0,

            uberEats:
                row.uberEats || 0,

            doorDashShortage:
                row.doorDashShortage || 0,

            uberShortage:
                row.uberShortage || 0,

            postmates:
                row.postmates || 0,

            // =====================
            // GIFT CARDS
            // =====================

            gcSold:
                row.giftCardSold || 0,

            giftCardRedeemed:
                row.giftCardRedeemed || 0,

            // =====================
            // CATERING
            // =====================

            onlineCatering:
                row.onlineCatering || 0,

            // =====================
            // TIPS
            // =====================

            wlTips:
                row.wlTips || 0,

            // =====================
            // PAYOUTS
            // =====================

            paidOut:
                row.paidOutTotal || 0,

            paidOutSmallwares:
                row.paidOutSmallwares || 0,

            paidOutCleaningSupplies:
                row.paidOutCleaning || 0,

            paidOutOfficeSupplies:
                row.paidOutOffice || 0,

            paidOutFood:
                row.paidOutFood || 0,

            paidOutCashOut:
                row.paidOutCashOut || 0,

            // =====================
            // CASH
            // =====================

            cashDeposit:
                row.cashDeposit || 0,

            cashHandlingDebit:
                Number(row.cashHandling || 0) > 0
                    ? Number(row.cashHandling)
                    : 0,

            cashHandlingCredit:
                Number(row.cashHandling || 0) < 0
                    ? Math.abs(
                        Number(row.cashHandling)
                    )
                    : 0,

            // =====================
            // DONATIONS
            // =====================

            donations:
                row.donations || 0,

            nonRedeemable:
                row.nonRedeemable || 0,

            // =====================
            // TOTALS
            // =====================

            deliveryTotals,

            totalRevenue,

            paymentsTotal,

            overShort,

            os:
                overShort,

            cashExpected,

            difference,

            paidOutCleaning:
                row.paidOutCleaning || 0,

            paidOutOffice:
                row.paidOutOffice || 0

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

function excelDateToJSDate(excelDate) {

    const fecha = new Date(
        (excelDate - 25569) * 86400 * 1000
    );

    return fecha
        .toISOString()
        .split('T')[0];
}