// ======================================================
// POPEYES V2 - LIMPIO Y CORRECTO
// ======================================================

let salesData = [];


// ======================================================
// 1. EXTRACCIÓN ÚNICA (SOURCE OF TRUTH)
// ======================================================

function buildPopeyesDataFromConciliationOnly() {

    salesData = [];

    const sheetName =
        workbook.SheetNames[0];

    const ws =
        workbook.Sheets[sheetName];

    const rows =
        XLSX.utils.sheet_to_json(ws);

    rows.forEach(row => {

        const store =
            Number(row.store || row.Store || 0);

        const netSales =
            Number(row.netSales || row['Net Sales'] || 0);

        const salesTax =
            Number(row.salesTax || row['Sales Tax'] || 0);

        const discounts =
            Number(row.discounts || 0);

        const uber =
            Number(row.uber || 0);

        const dd =
            Number(row.dd || 0);

        const gh =
            Number(row.gh || 0);

        const cashExpected =
            Number(row.cashExpected || row.acctCash || 0);

        const amex =
            Number(row.amex || 0);

        const visa =
            Number(row.visa || 0);

        const mc =
            Number(row.mastercard || 0);

        const discover =
            Number(row.discover || 0);

        salesData.push({

            store,

            netSales,
            salesTax,
            discounts,

            uber,
            dd,
            gh,

            cashExpected,

            amex,
            visa,
            mc,
            discover,

            ccTotals:
                amex + visa + mc + discover

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

function getSalesPOSSheet(workbook) {

    const sheetName = workbook.SheetNames.find(name => {

        const n = name.toLowerCase();

        return (
            n.includes('sales') &&
            n.includes('pos')
        );

    });

    if (!sheetName) {

        console.error('No se encontró hoja Sales POS');

        return null;

    }

    return workbook.Sheets[sheetName];

}