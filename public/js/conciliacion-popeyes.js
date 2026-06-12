// ======================================================
// POPEYES V2 - LIMPIO Y CORRECTO
// ======================================================

let salesData = [];


// ======================================================
// 1. EXTRACCIÓN ÚNICA (SOURCE OF TRUTH)
// ======================================================

function buildPopeyesDataFromSalesPOS() {

    salesData = [];

    console.log('Entrando buildPopeyesDataFromSalesPOS');
    console.log(workbook.SheetNames);

    const ws = workbook.Sheets['Sales  POS'];
    const rows = XLSX.utils.sheet_to_json(ws);

    console.log('ROWS', rows.length);
    console.log(rows[0]);

    rows.forEach(row => {

        const store =
            Number(row['Location'] || row['Store'] || row['Unit Number'] || 0);

        const food =
            Number(row['Net Sales - Food'] || 0);

        const beverages =
            Number(row['Net Sales - Beverages'] || 0);

        const other =
            Number(row['Net Sales - Other'] || 0);

        const salesTax =
            Number(row['Sales Tax Payable'] || 0);

        const discounts =
            Number(row['Discounts'] || 0);

        const promo =
            Number(row['Coupons - Promotions'] || 0);

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

        const mc =
            Number(row['Payments - Master Card'] || 0);

        const discover =
            Number(row['Payments - Discover'] || 0);

        const cashExpected =
            Number(row['Cash Expected Deposit'] || 0);

        const gcSold =
            Number(row['Gift Cards SOLD'] || 0);

        const gcRedeem =
            Number(row['Gift Cards REEDEM'] || 0);

        const paidOut =
            Number(row['Paid Outs'] || 0);

        const paidIn =
            Number(row['Paid In'] || 0);

        salesData.push({

            store,

            food,
            beverages,
            other,

            netSales:
                food + beverages + other,

            salesTax,

            discounts,
            promo,

            uber,
            dd,
            gh,

            amex,
            visa,
            mc,
            discover,

            ccTotals:
                amex + visa + mc + discover,

            cashExpected,

            gcSold,
            gcRedeem,

            paidOut,
            paidIn

        });

    });

}

// ======================================================
// 2. TAX REVIEW (100% MATCH LOGIC)
// ======================================================

function generarTaxReviewPopeyes() {

    taxReviewData = [];

    salesData.forEach(row => {

        const taxRate =
            obtenerTaxRate(row.store) || 0;

        const taxableSales =
            row.food +
            row.beverages +
            row.other -
            row.discounts -
            row.uber;

        const taxCalculation =
            taxableSales * taxRate;

        const rateCalculation =
            taxableSales
                ? (row.salesTax / taxableSales) * 100
                : 0;

        taxReviewData.push({

            store: row.store,

            taxRate: taxRate * 100,

            netSales: row.netSales,

            discounts: row.discounts,

            taxableSales,

            taxCalculation,

            salesTaxPayable: row.salesTax,

            taxDifference:
                taxCalculation - row.salesTax,

            rateCalculation,
            rateDifference:
                (taxRate * 100) - rateCalculation

        });

    });

}

// ======================================================
// 3. CONCILIATION (CLEAN VERSION)
// ======================================================

function generarConciliationPopeyes() {

    conciliacionData = [];

    salesData.forEach(row => {

        const totalRevenue =
            row.netSales +
            row.salesTax +
            row.gcSold +
            row.promo;

        const paymentsTotal =
            row.ccTotals +
            row.cashExpected +
            row.dd +
            row.gh +
            row.uber +
            row.gcRedeem;

        conciliacionData.push({

            store: row.store,

            food: row.food,
            beverages: row.beverages,
            other: row.other,

            netSales: row.netSales,

            discounts: row.discounts,
            promo: row.promo,

            salesTax: row.salesTax,

            ccTotals: row.ccTotals,
            cashExpected: row.cashExpected,

            uber: row.uber,
            dd: row.dd,
            gh: row.gh,

            gcSold: row.gcSold,
            gcRedeem: row.gcRedeem,

            totalRevenue,
            paymentsTotal,

            overShort:
                totalRevenue - paymentsTotal

        });

    });

}

// ======================================================
// 4. DAILY SALES RED (CLEAN JOURNAL)
// ======================================================

function generarDailySalesPopeyesRed() {

    dailySalesREDData = [];

    let lineNo = 1;

    salesData.forEach(row => {

        const store = row.store;

        const add = (memo, account, debit = 0, credit = 0) => {

            dailySalesREDData.push({

                journal: 'SJ',
                lineNo: lineNo++,
                description: 'POS Upload',
                memo,
                account,
                locationId: store,
                debit,
                credit

            });

        };

        add('Sales Food', 401000, 0, row.food);
        add('Sales Beverages', 401000, 0, row.beverages);
        add('Sales Other', 408000, 0, row.other);

        add('Sales Tax Payable', 241000, 0, row.salesTax);

        add('Cash Expected Deposit', 102000, row.cashExpected, 0);

        add('CC Expected Deposit', 102500, row.ccTotals, 0);

        add('DoorDash', 113000, row.dd, 0);
        add('GrubHub', 115000, row.gh, 0);
        add('Uber', 116000, row.uber, 0);

        add('Gift Cards Sold', 202800, 0, row.gcSold);
        add('Gift Cards Redeemed', 202900, row.gcRedeem, 0);

    });

}

// ======================================================
// 5. STOREDATES (SORT ENGINE CORRECTO)
// ======================================================

function generarStoreDatesPopeyes() {

    storeDatesData = [];

    const ws = workbook.Sheets['StoreDates'];
    const rows = XLSX.utils.sheet_to_json(ws);

    let lineNo = 1;

    rows.forEach(row => {

        const store = Number(row.Store || 0);
        const date = row.Date;

        const amount = Number(row.Amount || 0);
        const account = row.Account;
        const memo = row.Memo || '';

        if (!amount) return;

        let dept = '';

        if (memo.includes('CC')) dept = 'CC';
        else if (memo.includes('Cash')) dept = 'CASH';
        else if (memo.includes('Uber')) dept = 'UBD';
        else if (memo.includes('DoorDash')) dept = 'DDD';
        else if (memo.includes('GrubHub')) dept = 'GHD';

        storeDatesData.push({

            lineNo: lineNo++,
            store,
            date,
            account,
            memo,
            dept,
            amount

        });

    });

    storeDatesData.sort((a, b) =>
        a.date - b.date || a.store - b.store
    );

}

// ======================================================
// 6. WORKBOOK EXPORT
// ======================================================

function generarWorkbookPopeyes() {

    const wb = XLSX.utils.book_new();

    const add = (data, name) => {
        if (data?.length) {
            XLSX.utils.book_append_sheet(
                wb,
                XLSX.utils.json_to_sheet(data),
                name
            );
        }
    };

    add(salesData, 'Sales');
    add(conciliacionData, 'Conciliation');
    add(taxReviewData, 'Tax Review');
    add(dailySalesREDData, 'Daily Sales RED');
    add(storeDatesData, 'StoreDates');

    return wb;
}

// ======================================================
// 7. MAIN BUILD
// ======================================================

function generarPopeyesV2() {

    console.log('WORKBOOK', workbook);
    console.log('SHEETS', workbook?.SheetNames);

    buildPopeyesDataFromSalesPOS();

    generarTaxReviewPopeyes();

    generarConciliationPopeyes();

    generarDailySalesPopeyesRed();

    generarStoreDatesPopeyes();

}