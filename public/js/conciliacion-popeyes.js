// ======================================================
// POPEYES - CONCILIACIÓN COMPLETA DEFINITIVA
// ======================================================

let datosExtraidos = [];
let taxReviewData = [];
let dailySalesREDData = [];
let statisticalDeliveryData = [];
let dailySales0314Data = [];
let dailySales0310Data = [];

let workbook = null;

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
// 2. TAX REVIEW
// ======================================================

function generarTaxReviewPopeyes() {

    taxReviewData = datosExtraidos.map(row => {

        const taxRate =
            Number(obtenerTaxRate(row.store) || 0);

        const netSales =
            Number(row.netSales || 0);

        const salesTaxPayable =
            Number(row.salesTax || 0);

        const taxableSales = netSales;

        const taxCalculation =
            taxableSales * taxRate;

        const rateCalculation =
            taxableSales
                ? (salesTaxPayable / taxableSales)
                : 0;

        const rateDifference =
            taxRate - rateCalculation;

        return {

            store: row.store,

            taxRate: taxRate * 100,

            netSales,

            taxableSales,

            taxCalculation,

            salesTaxPayable,

            taxDifference: taxCalculation - salesTaxPayable,

            rateCalculation: rateCalculation * 100,

            rateDifference: rateDifference * 100

        };

    });
}

// ======================================================
// 3. DAILY SALES RED
// ======================================================

function generarDailySalesREDPopeyes() {

    dailySalesREDData = [];

    datosExtraidos.forEach(row => {

        dailySalesREDData.push({
            journal: 'SJ',
            description: 'POS Data Upload Sabretooth',
            memo: 'Gross Food Sales',
            account: 400200,
            locationId: row.store,
            credit: row.grossSalesPos
        });

    });
}

// ======================================================
// 4. STATISTICAL DELIVERY
// ======================================================

function generarStatisticalDeliveryPopeyes() {

    statisticalDeliveryData = [];

    let lineNo = 1;

    datosExtraidos.forEach(row => {

        const store = row.store;

        if (row.gh) {

            statisticalDeliveryData.push({
                journal: 'SJ',
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'GrubHub',
                account: 124000,
                locationId: store,
                debit: row.gh,
                credit: 0
            });

        }

        if (row.uber) {

            statisticalDeliveryData.push({
                journal: 'SJ',
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'Uber',
                account: 122000,
                locationId: store,
                debit: row.uber,
                credit: 0
            });

        }

        if (row.dd) {

            statisticalDeliveryData.push({
                journal: 'SJ',
                lineNo: lineNo++,
                description: 'Statistical Delivery Sales',
                memo: 'DoorDash',
                account: 123000,
                locationId: store,
                debit: row.dd,
                credit: 0
            });

        }

    });
}

// ======================================================
// 5. DAILY SALES 03-14
// ======================================================

function generarDailySales0314Popeyes() {

    dailySales0314Data = [];

    let lineNo = 1;

    datosExtraidos.forEach(row => {

        const store = row.store;

        const addLine = (acct, memo, debit = 0, credit = 0) => {
            dailySales0314Data.push({
                journal: 'SJ',
                lineNo: lineNo++,
                description: 'POS Data Upload Sabretooth',
                memo,
                acctNo: acct,
                locationId: store,
                debit,
                credit
            });
        };

        addLine(400200, 'Gross Food Sales', 0, row.grossSalesPos);

        if (row.discounts)
            addLine(410000, 'Discounts', row.discounts, 0);

        if (row.salesTax)
            addLine(222000, 'Sales Tax Payable', 0, row.salesTax);

        if (row.uber)
            addLine(400201, 'Uber Sales', 0, row.uber);

        if (row.donations)
            addLine(212000, 'Donations', 0, row.donations);

        if (row.amex)
            addLine(111200, 'AMEX Deposit', row.amex, 0);

        if (row.visa)
            addLine(111200, 'Visa Deposit', row.visa, 0);

        if (row.mastercard)
            addLine(111200, 'MC Deposit', row.mastercard, 0);

        if (row.gcRedeem)
            addLine(144800, 'Gift Card Redeem', row.gcRedeem, 0);

        if (row.gcSold)
            addLine(115000, 'Gift Card Sold', 0, row.gcSold);

    });
}

// ======================================================
// 6. DAILY SALES 03-10
// ======================================================

function generarDailySales0310Popeyes() {

    dailySales0310Data = [];

    let lineNo = 1;

    statisticalDeliveryData.forEach(item => {

        const amount = Number(item.debit || item.credit || 0);

        if (!amount) return;

        dailySales0310Data.push({
            journal: 'SJ',
            lineNo: lineNo++,
            description: item.description,
            memo: item.memo,
            acctNo: item.account,
            locationId: item.locationId,
            debit: item.debit,
            credit: item.credit
        });

    });
}

// ======================================================
// 7. EXPORT WORKBOOK COMPLETO
// ======================================================

function generarWorkbookConConciliacionPopeyes() {

    const wb = XLSX.utils.book_new();

    const addSheet = (data, name) => {
        if (data?.length) {
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, name);
        }
    };

    addSheet(datosExtraidos, 'Conciliation');
    addSheet(taxReviewData, 'Tax Review');
    addSheet(dailySalesREDData, 'Daily Sales RED');
    addSheet(statisticalDeliveryData, 'Statistical Delivery');
    addSheet(dailySales0314Data, 'Daily Sales 03-14');
    addSheet(dailySales0310Data, 'Daily Sales 03-10');

    return wb;
}

// ======================================================
// 8. SAVE MAIN
// ======================================================

function saveConciliacionPopeyes() {

    const wb = generarWorkbookConConciliacionPopeyes();

    XLSX.writeFile(
        wb,
        `conciliacion-popeyes-${Date.now()}.xlsx`
    );
}