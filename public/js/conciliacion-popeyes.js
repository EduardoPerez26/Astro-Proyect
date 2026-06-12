// ======================================================
// POPEYES - CONCILIACIÓN COMPLETA DEFINITIVA
// ======================================================

// ======================================================
// 1. EXTRACCIÓN BASE DESDE SALES POS
// ======================================================

function buildPopeyesDataFromSalesPOS() {

    datosExtraidos = [];

    const ws = workbook.Sheets['Sales  POS'];
    const rows = XLSX.utils.sheet_to_json(ws);

    rows.forEach(row => {

        const store =
            Number(row['Location'] || row['Store'] || row['Unit Number'] || 0);

        const netSales =
            Number(row['Net Sales - Food'] || 0) +
            Number(row['Net Sales - Beverages'] || 0) +
            Number(row['Net Sales - Other'] || 0);

        const salesTax =
            Number(row['Sales Tax Payable'] || 0);

        const discounts =
            Number(row['Discounts'] || 0);

        const promo =
            Number(row['Coupons - Promotions'] || 0);

        const donations =
            Number(row['Donations'] || 0);

        const uber =
            Number(row['Uber'] || 0);

        const dd =
            Number(row['DoorDash'] || 0);

        const gh =
            Number(row['GrubHub'] || 0);

        const amex =
            Number(row['Payments - AMEX'] || 0);

        const visa =
            Number(row['Payments - Visa'] || 0);

        const mastercard =
            Number(row['Payments - Master Card'] || 0);

        const discover =
            Number(row['Payments - Discover'] || 0);

        const debit =
            Number(row['Debit'] || 0);

        const gcSold =
            Number(row['Gift Cards SOLD'] || 0);

        const gcRedeem =
            Number(row['Gift Cards REEDEM'] || 0);

        const paidOut =
            Number(row['Paid Outs'] || 0);

        const paidIn =
            Number(row['Paid In'] || 0);

        const acctCash =
            Number(row['Cash Expected Deposit'] || 0);

        datosExtraidos.push({

            store,

            netSales,
            salesTax,

            discounts,
            promo,
            donations,

            grossSalesPos: netSales + discounts,

            uber,
            dd,
            gh,

            amex,
            visa,
            mastercard,
            discover,
            debit,

            gcSold,
            gcRedeem,

            paidOut,
            paidIn,

            acctCash

        });

    });
}

// ======================================================
// 2. STOREDATES
// ======================================================

function generarStoreDatesPopeyes() {

    storeDatesData = [];

    const ws = workbook.Sheets['StoreDates'];
    const rows = XLSX.utils.sheet_to_json(ws);

    let lineNo = 1;

    rows.forEach(row => {

        const store = Number(row.store || row['Store'] || 0);
        const date = row.date || row.Date;

        const amount = Number(row.amount || row.Value || 0);
        const account = Number(row.account || row.Acct || 0);
        const memo = row.memo || row.Memo || '';
        const description = row.description || 'POS Data Upload DC Central';

        if (!amount) return;

        // ======================================================
        // DETECT DEPARTMENT (igual al LET del Excel)
        // ======================================================

        let dept = '';

        if (
            memo.includes('Amex') ||
            memo.includes('CC') ||
            memo.includes('Kiosk')
        ) {
            dept = 'CC';
        }

        else if (
            memo.includes('Cash') ||
            memo.includes('Over') ||
            memo.includes('Diff')
        ) {
            dept = 'CASH';
        }

        else if (memo.includes('GrubHub')) dept = 'GHD';
        else if (memo.includes('Uber')) dept = 'UBD';
        else if (memo.includes('DoorDash')) dept = 'DDD';

        storeDatesData.push({

            journal: 'SJ',
            date,
            lineNo: lineNo++,
            description,
            memo,
            dept,
            account,
            locationId: store,
            debit: amount > 0 ? amount : 0,
            credit: amount < 0 ? Math.abs(amount) : 0

        });

    });

    // ======================================================
    // ORDEN EXACTO (equivalente SORTBY del Excel)
    // ======================================================

    storeDatesData.sort((a, b) => {

        if (a.date !== b.date)
            return a.date - b.date;

        if (a.account !== b.account)
            return a.account - b.account;

        return a.locationId - b.locationId;

    });

    // REASIGNAR LINE_NO como Excel
    storeDatesData.forEach((r, i) => {
        r.lineNo = i + 1;
    });

}

// ======================================================
// 3. GENERAR SALES POPEYES
// ======================================================

function generarSalesPopeyes() {

    salesData = [];

    const salesPOS =
        XLSX.utils.sheet_to_json(
            workbook.Sheets['Sales  POS']
        );

    const stores =
        [...new Set(
            salesPOS.map(r => Number(r.Location))
        )];

    const dates =
        [...new Set(
            salesPOS.map(r => r.Date)
        )];

    stores.forEach(store => {

        dates.forEach(date => {

            const rows =
                salesPOS.filter(r =>
                    Number(r.Location) === store &&
                    r.Date === date
                );

            if (!rows.length) return;

            const getValue = account => {

                return rows
                    .filter(r => r.Account === account)
                    .reduce(
                        (s, r) =>
                            s + Number(r.Amount || 0),
                        0
                    );

            };

            const netSalesFood =
                getValue('Net Sales - Food');

            const netSalesBeverages =
                getValue('Net Sales - Beverages');

            const netSalesOther =
                getValue('Net Sales - Other');

            const salesTaxPayable =
                getValue('Sales Tax Payable');

            const donations =
                getValue('Donations');

            const amex =
                getValue('Payments - AMEX');

            const visa =
                getValue('Payments - Visa');

            const masterCard =
                getValue('Payments - Master Card');

            const discover =
                getValue('Payments - Discover');

            const uber =
                getValue('Uber');

            const doorDash =
                getValue('DoorDash');

            const grubHub =
                getValue('GrubHub');

            const discounts =
                rows
                    .filter(r =>
                        String(r.Account || '')
                            .startsWith('Discount')
                    )
                    .reduce(
                        (s, r) =>
                            s + Number(r.Amount || 0),
                        0
                    );

            salesData.push({

                store,
                date,

                netSalesFood,

                netSalesBeverages,

                netSalesOther,

                grossSales:

                    netSalesFood +
                    netSalesBeverages +
                    netSalesOther,

                salesTaxPayable,

                discounts,

                donations,

                amex,

                visa,

                masterCard,

                discover,

                uber,

                doorDash,

                grubHub

            });

        });

    });

}

// ======================================================
// 4. CONCILIACION POPEYES
// ======================================================

function generarConciliationPopeyes() {

    conciliacionData = [];

    salesData.forEach(row => {

        const food =
            Number(row.netSalesFood || 0);

        const beverages =
            Number(row.netSalesBeverages || 0);

        const other =
            Number(row.netSalesOther || 0);

        const serviceFee =
            Number(row.serviceFee || 0);

        const deliveryFee =
            Number(row.deliveryFee || 0);

        const deliveryTips =
            Number(row.deliveryTips || 0);

        const totalTips =
            Number(row.totalTips || 0);

        const discounts =
            Number(row.discounts || 0);

        const promo =
            Number(row.promo || 0);

        const salesTax =
            Number(row.salesTaxPayable || 0);

        const taxExempt =
            Number(row.taxExemptSales || 0);

        const gcSold =
            Number(row.gcSold || 0);

        const paidOut =
            Number(row.paidOut || 0);

        const donations =
            Number(row.donations || 0);

        const nonRedeemable =
            Number(row.nonRedeemable || 0);

        const netSales =
            food +
            beverages;

        const salesOther =
            other +
            serviceFee;

        const totalRevenue =
            food +
            beverages +
            salesOther +
            deliveryFee +
            totalTips +
            salesTax +
            gcSold +
            donations +
            nonRedeemable;

        const ccTotals =
            Number(row.ccTotals || 0);

        const amex =
            Number(row.amex || 0);

        const doorDash =
            Number(row.doorDash || 0);

        const grubHub =
            Number(row.grubHub || 0);

        const uber =
            Number(row.uber || 0);

        const ebt =
            Number(row.ebt || 0);

        const kiosk =
            Number(row.kiosk || 0);

        const giftCardRedeemed =
            Number(row.gcRedeem || 0);

        const paymentsTotal =
            ccTotals +
            amex +
            doorDash +
            grubHub +
            uber +
            ebt +
            kiosk +
            giftCardRedeemed;

        const overShort =
            totalRevenue -
            paymentsTotal;

        conciliacionData.push({

            store: row.store,

            date: row.date,

            food,

            beverages,

            other,

            serviceFee,

            salesOther,

            deliveryFee,

            deliveryTips,

            totalTips,

            discounts,

            promo,

            netSales,

            salesTax,

            taxExempt,

            gcSold,

            paidOut,

            donations,

            nonRedeemable,

            totalRevenue,

            amex,

            ccTotals,

            doorDash,

            grubHub,

            uber,

            ebt,

            kiosk,

            giftCardRedeemed,

            paymentsTotal,

            overShort

        });

    });

}

// ======================================================
// 5. TAX REVIEW
// ======================================================

function generarTaxReviewPopeyes() {

    taxReviewData = [];

    datosExtraidos.forEach(row => {

        const store =
            Number(row.store);

        const taxRate =
            Number(
                obtenerTaxRate(store) || 0
            );

        const food =
            Number(row.netSalesFood || 0);

        const beverages =
            Number(row.netSalesBeverages || 0);

        const other =
            Number(row.netSalesOther || 0);

        const discounts =
            Number(row.discounts || 0);

        const uber =
            Number(row.uber || 0);

        const ebt =
            Number(row.ebt || 0);

        const taxableSales =
            food +
            beverages +
            other -
            discounts -
            uber -
            ebt;

        const taxCalculation =
            taxableSales * taxRate;

        const salesTaxPayable =
            Number(row.salesTax || 0);

        const difference =
            taxCalculation -
            salesTaxPayable;

        const rateCalculation =
            taxableSales !== 0
                ? (
                    salesTaxPayable /
                    taxableSales
                ) * 100
                : 0;

        const rateDifference =
            (taxRate * 100) -
            rateCalculation;

        taxReviewData.push({

            store,

            taxRate:
                taxRate * 100,

            netSalesFood:
                food,

            netSalesBeverages:
                beverages,

            netSalesOther:
                other,

            discounts,

            uber,

            ebt,

            taxableSales,

            taxCalculation,

            salesTaxPayable,

            difference,

            rateCalculation,

            rateDifference

        });

    });

}

// ======================================================
// 5. DAILY SALES 03-14
// ======================================================



// ======================================================
// 6. DAILY SALES 03-10
// ======================================================



// ======================================================
// 7. EXPORT WORKBOOK COMPLETO
// ======================================================


// ======================================================
// 8. SAVE MAIN
// ======================================================

