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

        const unitName =
            row['Unit Name'];

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
                    unitName,
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
        ({ store, unitName, date, formattedDate }) => {

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

            const deliveryFee =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Delivery Fee'
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
            // DISCOUNTS
            // =====================================

            const discountsPromo =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - $ Off Promo'
                );

            const discountEmployee =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Employee'
                );

            const discountGuestRecovery =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Guest Recovery'
                );

            const discountManager =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Manager'
                );

            const discountMilitary =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Military'
                );

            const discountPolice =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Police'
                );

            const discountSenior =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Senior Citizens'
                );

            const discountsOther =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Other'
                );

            const discountOpenDollar =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Open $'
                );

            const discountOpenPercent =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - Open %'
                );

            const discount10 =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Discounts - 10%'
                );

            const totalDiscounts =

                discountsPromo +
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

            const onlineCatering =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Online Catering'
                );

            const postmates =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Payments - Postmates'
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
            // PAID OUTS
            // =====================================

            const paidOut =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Paid Out'
                );

            const paidOutSmallwares =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Paid Out Smallwares'
                );

            const paidOutCleaning =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Paid Out Cleaning Supplies'
                );

            const paidOutOffice =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Paid Out Office Supplies'
                );

            const paidOutFood =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Paid Out Food'
                );

            const paidOutCashOut =
                sumDebit(
                    salesPosRows,
                    store,
                    date,
                    'Paid Out Cash Out'
                );

            // =====================================
            // OTHER
            // =====================================

            const donations =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Donations'
                );

            const nonRedeemable =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'Non Redeemable Tender'
                );

            const wlTips =
                sumCredit(
                    salesPosRows,
                    store,
                    date,
                    'WL DD Tips'
                );

            // =====================================
            // RESULT
            // =====================================

            return {

                store,
                unitName,
                date: formattedDate,

                food,
                beverages,
                other,

                serviceFee,

                deliveryFee,
                deliveryFeeNet,

                salesTax,
                taxExemptSales,
                caCrv,

                discountsPromo,
                discountEmployee,
                discountGuestRecovery,
                discountManager,
                discountMilitary,
                discountPolice,
                discountSenior,
                discountsOther,
                discountOpenDollar,
                discountOpenPercent,
                discount10,
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
                onlineCatering,
                postmates,

                kiosk,
                kioskDiscover,
                kioskMasterCard,
                kioskVisa,
                kioskTotal,

                cashDeposit,
                cashHandling,

                paidOut,
                paidOutSmallwares,
                paidOutCleaning,
                paidOutOffice,
                paidOutFood,
                paidOutCashOut,

                donations,
                nonRedeemable,
                wlTips

            };

        }
    );

}

function generarConciliationPopeyes(
    salesData
) {

    return salesData.map(row => {

        // =====================
        // SALES
        // =====================

        const salesOther =
            Number(row.other || 0) +
            Number(row.serviceFee || 0);

        const netSales =
            Number(row.food || 0) +
            Number(row.beverages || 0);

        // =====================
        // DELIVERY
        // =====================

        const deliveryTotals =
            Number(row.doorDash || 0) +
            Number(row.grubHub || 0) +
            Number(row.uberEats || 0) +
            Number(row.postmates || 0);

        // =====================
        // REVENUE
        // =====================

        const totalRevenue =
            Number(row.food || 0) +
            Number(row.beverages || 0) +
            Number(row.other || 0) +
            Number(row.deliveryFeeNet || 0) +
            Number(row.salesTax || 0) +
            Number(row.caCrv || 0) +
            Number(row.giftCardSold || 0) +
            Number(row.donations || 0);

        // =====================
        // PAYMENTS TOTAL
        // =====================

        const paymentsTotal =

            Number(row.amex || 0) +
            Number(row.amexPrpd || 0) +

            Number(row.discover || 0) +
            Number(row.discoverPrpd || 0) +

            Number(row.masterCard || 0) +
            Number(row.prepaidMasterCard || 0) +

            Number(row.visa || 0) +
            Number(row.prepaidVisa || 0) +

            Number(row.debit || 0) +

            Number(row.cashApp || 0) +
            Number(row.imtPaypal || 0) +
            Number(row.imtVenmo || 0) +

            Number(row.doorDash || 0) +
            Number(row.grubHub || 0) +
            Number(row.uberEats || 0) +
            Number(row.postmates || 0) +

            Number(row.ebt || 0) +

            Number(row.giftCardRedeemed || 0) +

            Number(row.onlineCatering || 0) +
            Number(row.ezCater || 0);

        // =====================
        // O/S
        // =====================

        const overShort =
            totalRevenue -
            paymentsTotal;

        // =====================
        // CASH EXPECTED
        // =====================

        const cashExpected =
            overShort;

        // =====================
        // DIFFERENCE
        // =====================

        const difference =
            Number(
                (
                    cashExpected -
                    Number(row.cashDeposit || 0)
                ).toFixed(2)
            );

        // =====================
        // CASH DEPOSIT CALCULATED
        // =====================

        console.log({

            positivos:

                Number(row.other || 0) +
                Number(row.deliveryFee || 0) +
                Number(row.netSales || 0) +
                Number(row.salesTax || 0) +
                Number(row.caCrv || 0) +
                Number(row.gcSold || 0) +
                Number(row.donations || 0) +
                Number(row.nonRedeemable || 0) +
                Number(row.wlTips || 0),

            negativos:

                Number(row.discounts || 0) +
                Number(row.discountsPromo || 0) +
                Number(row.amex || 0) +
                Number(row.amexPrpd || 0) +
                Number(row.totalCC || 0) +
                Number(row.doorDash || 0) +
                Number(row.grubHub || 0) +
                Number(row.uberEats || 0) +
                Number(row.doorDashShortage || 0) +
                Number(row.uberShortage || 0) +
                Number(row.ebt || 0) +
                Number(row.kiosk || 0) +
                Number(row.giftCardRedeemed || 0) +
                Number(row.onlineCatering || 0) +
                Number(row.ezCater || 0) +
                Number(row.paidOutSmallwares || 0) +
                Number(row.paidOutCleaning || 0) +
                Number(row.paidOutOffice || 0) +
                Number(row.paidOutFood || 0) +
                Number(row.paidOutCashOut || 0),

            cashDepositCalculated

        });

        const cashDepositCalculated =

            (
                Number(row.other || 0) +
                Number(row.deliveryFee || 0) +
                Number(row.netSales || 0) +
                Number(row.salesTax || 0) +
                Number(row.caCrv || 0) +
                Number(row.gcSold || 0) +
                Number(row.donations || 0) +
                Number(row.nonRedeemable || 0) +
                Number(row.wlTips || 0)
            )

            -

            (
                Number(row.discounts || 0) +
                Number(row.discountsPromo || 0) +

                Number(row.amex || 0) +
                Number(row.amexPrpd || 0) +
                Number(row.totalCC || 0) +

                Number(row.doorDash || 0) +
                Number(row.grubHub || 0) +
                Number(row.uberEats || 0) +

                Number(row.doorDashShortage || 0) +
                Number(row.uberShortage || 0) +

                Number(row.ebt || 0) +
                Number(row.kiosk || 0) +

                Number(row.giftCardRedeemed || 0) +

                Number(row.onlineCatering || 0) +
                Number(row.ezCater || 0) +

                Number(row.paidOutSmallwares || 0) +
                Number(row.paidOutCleaning || 0) +
                Number(row.paidOutOffice || 0) +
                Number(row.paidOutFood || 0) +
                Number(row.paidOutCashOut || 0)
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
                row.discountsPromo || 0,

            discountsPromo:
                row.discountsPromo || 0,

            discountEmployee:
                row.discountEmployee || 0,

            discountGuestRecovery:
                row.discountGuestRecovery || 0,

            discountManager:
                row.discountManager || 0,

            discountMilitary:
                row.discountMilitary || 0,

            discountPolice:
                row.discountPolice || 0,

            discountSenior:
                row.discountSenior || 0,

            discountsOther:
                row.discountsOther || 0,

            discountOpenDollar:
                row.discountOpenDollar || 0,

            discountOpenPercent:
                row.discountOpenPercent || 0,

            discount10:
                row.discount10 || 0,

            totalDiscounts:
                row.totalDiscounts || 0,

            // =====================
            // CARDS
            // =====================

            amex:
                row.amex || 0,

            amexPrpd:
                row.amexPrpd || 0,

            ccTotals:
                row.totalCC || 0,

            totalCC:
                row.totalCC || 0,

            // =====================
            // DELIVERY
            // =====================

            delTotals:
                deliveryTotals,

            deliveryTotals,

            doorDash:
                row.doorDash || 0,

            grubHub:
                row.grubHub || 0,

            uberEats:
                row.uberEats || 0,

            postmates:
                row.postmates || 0,

            doorDashShortage:
                row.doorDashShortage || 0,

            uberShortage:
                row.uberShortage || 0,

            // =====================
            // GIFT CARDS
            // =====================

            gcSold:
                row.giftCardSold || 0,

            giftCardSold:
                row.giftCardSold || 0,

            giftCardRedeemed:
                row.giftCardRedeemed || 0,

            // =====================
            // CATERING
            // =====================

            onlineCatering:
                row.onlineCatering || 0,

            ezCater:
                row.ezCater || 0,

            // =====================
            // TIPS
            // =====================

            wlTips:
                row.wlTips || 0,

            // =====================
            // PAYOUTS
            // =====================

            paidOut:
                row.paidOut || 0,

            paidOutSmallwares:
                row.paidOutSmallwares || 0,

            paidOutCleaning:
                row.paidOutCleaning || 0,

            paidOutCleaningSupplies:
                row.paidOutCleaning || 0,

            paidOutOffice:
                row.paidOutOffice || 0,

            paidOutOfficeSupplies:
                row.paidOutOffice || 0,

            paidOutFood:
                row.paidOutFood || 0,

            paidOutCashOut:
                row.paidOutCashOut || 0,

            // =====================
            // CASH
            // =====================

            cashDepositCalculated,

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

            totalRevenue,

            paymentsTotal,

            overShort,

            os:
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

function excelDateToJSDate(excelDate) {

    const fecha = new Date(
        (excelDate - 25569) * 86400 * 1000
    );

    return fecha
        .toISOString()
        .split('T')[0];
}