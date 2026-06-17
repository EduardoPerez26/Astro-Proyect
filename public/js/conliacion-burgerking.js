let burgerKingConciliationData = [];
let burgerKingTaxAnalysisData = [];
let burgerKingDiscrepanciesData = [];
let burgerKingTemplateCsvData = [];

const BURGER_KING_DESCRIPTION = 'POS Data Upload DC Central';

const BURGER_KING_TAX_RATES = {
    975: 0.1,
    981: 0.0975,
    1450: 0.0775,
    1473: 0.0825,
    1549: 0.0835,
    1572: 0.1,
    1650: 0.0925,
    1782: 0.0775,
    1803: 0.0925,
    1838: 0.0725,
    1841: 0.0875,
    1883: 0.085,
    1901: 0.0925,
    1932: 0.1,
    2012: 0.105,
    2022: 0.0725,
    2066: 0.0975,
    2152: 0.1025,
    2172: 0.0875,
    2268: 0.09,
    2298: 0.075,
    2333: 0.0825,
    2521: 0.0925,
    2534: 0.0875,
    2555: 0.0975,
    2738: 0.0925,
    2795: 0.1025,
    2838: 0.08375,
    2891: 0.0775,
    3034: 0.1075,
    3160: 0.0835,
    3179: 0.0975,
    3208: 0.0725,
    3217: 0.1025,
    3223: 0.0875,
    3323: 0.09625,
    3421: 0.0825,
    3505: 0.0925,
    3554: 0.0925,
    3580: 0.0975,
    3654: 0.0925,
    3684: 0.08625,
    3827: 0.1,
    3866: 0.0975,
    3890: 0.0825,
    3917: 0.08875,
    4039: 0.1075,
    4135: 0.0875,
    4447: 0.0975,
    4516: 0.0925,
    4660: 0.085,
    4668: 0.08625,
    4760: 0.1075,
    4786: 0.09875,
    4882: 0.0775,
    4886: 0.09,
    5052: 0.0875,
    5056: 0.0775,
    5085: 0.0875,
    5215: 0.1,
    5270: 0.1,
    5325: 0.1075,
    5394: 0.0925,
    5500: 0.09875,
    5533: 0.0825,
    5996: 0.0875,
    6054: 0.0875,
    6117: 0.0775,
    6342: 0.0825,
    6343: 0.0825,
    6409: 0.0825,
    6597: 0.0825,
    6813: 0.0925,
    6936: 0.0875,
    7200: 0.0825,
    7410: 0.1025,
    7426: 0.1075,
    7628: 0.0775,
    7766: 0.0975,
    7928: 0.0975,
    8177: 0.0875,
    8326: 0.1075,
    8387: 0.1025,
    8563: 0.0925,
    8936: 0.07875,
    9049: 0.0825,
    9126: 0.1025,
    9252: 0.0775,
    9365: 0.08625,
    9474: 0.0825,
    9560: 0.0835,
    9790: 0.0875,
    9961: 0.0875,
    9963: 0.09225,
    10222: 0.095,
    10341: 0.0725,
    10833: 0.1075,
    10835: 0.0775,
    10836: 0.08975,
    11063: 0.0975,
    11112: 0.0875,
    11835: 0.0825,
    13538: 0.0925,
    13730: 0.0925,
    13768: 0.1075,
    14218: 0.09125,
    14581: 0.0775,
    15058: 0.0925,
    15906: 0.0775,
    16003: 0.0875,
    16078: 0.0925,
    16250: 0.0775,
    16481: 0.085,
    17484: 0.0925,
    17592: 0.0775,
    17709: 0.08,
    17721: 0.0925,
    22460: 0.0875,
    24290: 0.0825,
    24651: 0.07875,
    25081: 0.0825,
    25944: 0.07975,
    27041: 0.08725,
    27645: 0.0825,
    27834: 0.09,
    28906: 0.0725,
    28985: 0.0775,
    29311: 0.0775,
    29317: 0.0775,
    29847: 0.1025,
    31404: 0.09225
};

const BURGER_KING_DISCOUNT_FIELDS = [
    'discountPercentOff',
    'discountDollarOff',
    'discountBogo',
    'discountCompetitorCpn',
    'discountEmployee',
    'discountFreeItem',
    'discountFriendsFamily',
    'discountGuestRecovery',
    'discountLoyalty',
    'discountManagerMeal',
    'discountMilitary',
    'discountOther',
    'discountPolice',
    'discountSenior',
    'discountVendor'
];

function numeroBurgerKing(valor) {
    if (
        valor === null ||
        valor === undefined ||
        valor === '' ||
        valor instanceof Date
    ) {
        return 0;
    }

    if (typeof valor === 'number') {
        return valor;
    }

    const texto =
        String(valor)
            .replace(/[$,\s]/g, '')
            .trim();

    if (!texto) return 0;

    const negativo =
        texto.startsWith('(') &&
        texto.endsWith(')');

    const numero =
        Number(
            texto.replace(/[()]/g, '')
        );

    if (Number.isNaN(numero)) {
        return 0;
    }

    return negativo ? -numero : numero;
}

function redondearBurgerKing(valor) {
    const numero = Number(valor) || 0;
    if (Math.abs(numero) < 0.000001) return 0;
    return Number(numero.toFixed(2));
}

function parseStoreBurgerKing(valor) {
    const match =
        String(valor ?? '')
            .trim()
            .match(/\d+/);

    return match ? Number(match[0]) : 0;
}

function fechaClaveBurgerKing(valor) {
    if (!valor) return '';

    if (typeof valor === 'number') {
        const excelEpoch =
            new Date(Date.UTC(1899, 11, 30));

        const d =
            new Date(
                excelEpoch.getTime() +
                valor * 86400000
            );

        return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;
    }

    if (valor instanceof Date) {
        return `${String(valor.getMonth() + 1).padStart(2, '0')}/${String(valor.getDate()).padStart(2, '0')}/${valor.getFullYear()}`;
    }

    const texto =
        String(valor)
            .trim();

    const match =
        texto.match(
            /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/
        );

    if (match) {
        const month =
            Number(match[1]);
        const day =
            Number(match[2]);
        let year =
            Number(match[3]);

        if (year < 100) {
            year += 2000;
        }

        return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    }

    if (typeof normalizarFecha === 'function') {
        return normalizarFecha(valor);
    }

    const d =
        new Date(valor);

    if (isNaN(d)) return '';

    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

function obtenerFilasBurgerKing() {
    if (!salesWorkbook) {
        return [];
    }

    const hoja =
        obtenerHojaPorNombre(
            salesWorkbook,
            [
                'Daily Sales',
                'Sheet1'
            ]
        ) ||
        salesWorkbook.Sheets[
        detectarHojaOrigen(salesWorkbook)
        ];

    return leerFilasExcel(
        hoja,
        [
            'Accounting Date',
            'Unit Number',
            'Account'
        ],
        ''
    );
}

function filasValidasBurgerKing(rows) {
    return rows.filter(row => {
        const store =
            parseStoreBurgerKing(
                row['Unit Number']
            );

        const account =
            String(row.Account || '')
                .trim();

        return (
            store &&
            account &&
            account !== 'Account' &&
            fechaClaveBurgerKing(
                row['Accounting Date']
            )
        );
    });
}

function obtenerFechaTrabajoBurgerKing(rows) {
    if (fechaSalesSeleccionada) {
        return fechaClaveBurgerKing(
            fechaSalesSeleccionada
        );
    }

    const fechas =
        [
            ...new Set(
                rows
                    .map(row =>
                        fechaClaveBurgerKing(
                            row['Accounting Date']
                        )
                    )
                    .filter(Boolean)
            )
        ];

    fechas.sort(
        (a, b) =>
            new Date(b).getTime() -
            new Date(a).getTime()
    );

    return fechas[0] || '';
}

function agruparFilasBurgerKing(rows, fechaTrabajo) {
    const grupos =
        new Map();

    rows.forEach(row => {
        const date =
            fechaClaveBurgerKing(
                row['Accounting Date']
            );

        if (date !== fechaTrabajo) {
            return;
        }

        const store =
            parseStoreBurgerKing(
                row['Unit Number']
            );

        if (!store) return;

        const account =
            String(row.Account || '')
                .trim();

        if (!account || account === 'Account') {
            return;
        }

        if (!grupos.has(store)) {
            grupos.set(
                store,
                {
                    store,
                    unitNumber: store,
                    unitName: row['Unit Name'] || '',
                    date,
                    accounts: {}
                }
            );
        }

        const grupo =
            grupos.get(store);

        if (!grupo.accounts[account]) {
            grupo.accounts[account] = {
                debit: 0,
                credit: 0
            };
        }

        grupo.accounts[account].debit +=
            numeroBurgerKing(
                row['Debit Account']
            );

        grupo.accounts[account].credit +=
            numeroBurgerKing(
                row['Credit Amount']
            );
    });

    return [
        ...grupos.values()
    ].sort(
        (a, b) =>
            Number(a.store) -
            Number(b.store)
    );
}

function cuentaBurgerKing(grupo, accounts, side) {
    const accountList =
        Array.isArray(accounts)
            ? accounts
            : [accounts];

    return accountList.reduce(
        (sum, account) => {
            const bucket =
                grupo.accounts[account] || {
                    debit: 0,
                    credit: 0
                };

            return sum + (
                side === 'credit'
                    ? bucket.credit
                    : bucket.debit
            );
        },
        0
    );
}

function generarConciliationBurgerKing(grupos) {
    return grupos.map(grupo => {
        const foodSalesGross =
            cuentaBurgerKing(
                grupo,
                'Food Sales - Gross',
                'debit'
            );

        const beverageSales =
            cuentaBurgerKing(
                grupo,
                'Revenue - Beverage Sales',
                'debit'
            );

        const nonFoodSales =
            cuentaBurgerKing(
                grupo,
                'Non-Food Sales',
                'debit'
            );

        const coupons =
            cuentaBurgerKing(
                grupo,
                'Coupons',
                'credit'
            );

        const surcharge =
            cuentaBurgerKing(
                grupo,
                [
                    'Surcharge (Delivery Fee)',
                    'Surcharge SF'
                ],
                'debit'
            );

        const bagCharge =
            cuentaBurgerKing(
                grupo,
                'Bag Charge',
                'debit'
            );

        const totalWlTips =
            cuentaBurgerKing(
                grupo,
                'White Label Tips Total',
                'debit'
            );

        const discountPercentOff =
            cuentaBurgerKing(
                grupo,
                'Discount - % Off',
                'credit'
            );

        const discountDollarOff =
            cuentaBurgerKing(
                grupo,
                'Discount - $ Off',
                'credit'
            );

        const discountBogo =
            cuentaBurgerKing(
                grupo,
                'Discount - BOGO',
                'credit'
            );

        const discountCompetitorCpn =
            cuentaBurgerKing(
                grupo,
                'Discount - Competitor Cpn',
                'credit'
            );

        const discountEmployee =
            cuentaBurgerKing(
                grupo,
                'Discount - Employee',
                'credit'
            );

        const discountFreeItem =
            cuentaBurgerKing(
                grupo,
                'Discount - Free Item',
                'credit'
            );

        const discountFriendsFamily =
            cuentaBurgerKing(
                grupo,
                'Discount - Friends/Family',
                'credit'
            );

        const discountGuestRecovery =
            cuentaBurgerKing(
                grupo,
                'Discount - Guest Recovery',
                'credit'
            );

        const discountLoyalty =
            cuentaBurgerKing(
                grupo,
                'Discount - Loyalty',
                'credit'
            );

        const discountManagerMeal =
            cuentaBurgerKing(
                grupo,
                'Discount - Manager Meal',
                'credit'
            );

        const discountMilitary =
            cuentaBurgerKing(
                grupo,
                'Discount - Military',
                'credit'
            );

        const discountOther =
            cuentaBurgerKing(
                grupo,
                'Discount - Other',
                'credit'
            );

        const discountPolice =
            cuentaBurgerKing(
                grupo,
                'Discount - Police',
                'credit'
            );

        const discountSenior =
            cuentaBurgerKing(
                grupo,
                'Discount - Senior',
                'credit'
            );

        const discountVendor =
            cuentaBurgerKing(
                grupo,
                'Discount - Vendor',
                'credit'
            );

        const totalDiscounts =
            [
                discountPercentOff,
                discountDollarOff,
                discountBogo,
                discountCompetitorCpn,
                discountEmployee,
                discountFreeItem,
                discountFriendsFamily,
                discountGuestRecovery,
                discountLoyalty,
                discountManagerMeal,
                discountMilitary,
                discountOther,
                discountPolice,
                discountSenior,
                discountVendor
            ].reduce(
                (sum, value) => sum + value,
                0
            );

        const netSales =
            foodSalesGross +
            beverageSales +
            nonFoodSales -
            totalDiscounts;

        const salesTax =
            cuentaBurgerKing(
                grupo,
                'Taxes (POS)',
                'debit'
            );

        const gcSold =
            cuentaBurgerKing(
                grupo,
                [
                    'GC Sold',
                    'Gift Card Sold'
                ],
                'debit'
            );

        const paidOut =
            cuentaBurgerKing(
                grupo,
                'Paid Out - Petty Cash',
                'debit'
            );

        const donations =
            cuentaBurgerKing(
                grupo,
                'Donations (posting)',
                'debit'
            );

        const donationDiscount =
            cuentaBurgerKing(
                grupo,
                'Donation Discounts',
                'credit'
            );

        const totalRevenue =
            netSales +
            salesTax +
            gcSold +
            paidOut +
            donations -
            donationDiscount +
            surcharge +
            bagCharge +
            totalWlTips;

        const amex =
            cuentaBurgerKing(
                grupo,
                'AMEX',
                'credit'
            );

        const visa =
            cuentaBurgerKing(
                grupo,
                'Visa',
                'credit'
            );

        const mc =
            cuentaBurgerKing(
                grupo,
                'MC',
                'credit'
            );

        const discover =
            cuentaBurgerKing(
                grupo,
                'Discover',
                'credit'
            );

        const ebtFoodStamps =
            cuentaBurgerKing(
                grupo,
                [
                    'EBT - Food Stamps',
                    'EBT - Cash'
                ],
                'credit'
            );

        const doorDashPay =
            cuentaBurgerKing(
                grupo,
                'Door Dash Pay',
                'credit'
            );

        const grubHubPay =
            cuentaBurgerKing(
                grupo,
                'Grub Hub Pay',
                'credit'
            );

        const uberEatsPay =
            cuentaBurgerKing(
                grupo,
                'Uber Eats Pay',
                'credit'
            );

        const totalWhiteLabelPayments =
            cuentaBurgerKing(
                grupo,
                [
                    'AMEX - White Label Total',
                    'Diners - White Label Total',
                    'Discover - White Label Total',
                    'MC - White Label Total',
                    'Visa - White Label Total'
                ],
                'credit'
            );

        const bkAppTotal =
            cuentaBurgerKing(
                grupo,
                [
                    'BK App',
                    'BK App-Paypal',
                    'BK App-Venmo',
                    'BK App-Google Pay',
                    'BK App-JCB',
                    'BK App-Apple Pay',
                    'BK App-Credit',
                    'BK App-Diners Club',
                    'BK App-Cash App'
                ],
                'credit'
            );

        const gcRedeem =
            cuentaBurgerKing(
                grupo,
                [
                    'GC Redeem',
                    'BK App-Gift Card'
                ],
                'credit'
            );

        const totalCashDeposit =
            cuentaBurgerKing(
                grupo,
                'Total Cash Deposit',
                'credit'
            );

        const instorePayments =
            cuentaBurgerKing(
                grupo,
                'Total Instore Payments',
                'credit'
            );

        const paypal =
            cuentaBurgerKing(
                grupo,
                'PayPal',
                'credit'
            );

        const venmo =
            cuentaBurgerKing(
                grupo,
                'Venmo',
                'credit'
            );

        const kiosk =
            cuentaBurgerKing(
                grupo,
                'Total Kiosk Payments',
                'credit'
            );

        const openChecks =
            cuentaBurgerKing(
                grupo,
                'Open Checks',
                'credit'
            );

        const cashOverShort =
            cuentaBurgerKing(
                grupo,
                'Cash Over/Short',
                'credit'
            ) -
            cuentaBurgerKing(
                grupo,
                'Cash Over/Short',
                'debit'
            );

        const totalCC =
            visa +
            mc +
            discover +
            totalWhiteLabelPayments +
            bkAppTotal +
            instorePayments +
            paypal +
            venmo +
            kiosk;

        const cashExpected =
            totalCashDeposit +
            cashOverShort;

        const paymentsTotal =
            totalCC +
            amex +
            ebtFoodStamps +
            doorDashPay +
            grubHubPay +
            uberEatsPay +
            gcRedeem +
            cashExpected;

        const oS =
            totalRevenue -
            paymentsTotal;

        const cashDiff =
            cashExpected -
            (
                totalCashDeposit +
                cashOverShort
            );

        return {
            store: grupo.store,
            unitNumber: grupo.unitNumber,
            unitName: grupo.unitName,
            date: grupo.date,
            foodSalesGross: redondearBurgerKing(foodSalesGross),
            beverageSales: redondearBurgerKing(beverageSales),
            nonFoodSales: redondearBurgerKing(nonFoodSales),
            coupons: redondearBurgerKing(coupons),
            surcharge: redondearBurgerKing(surcharge),
            bagCharge: redondearBurgerKing(bagCharge),
            totalWlTips: redondearBurgerKing(totalWlTips),
            discountPercentOff: redondearBurgerKing(discountPercentOff),
            discountDollarOff: redondearBurgerKing(discountDollarOff),
            discountBogo: redondearBurgerKing(discountBogo),
            discountCompetitorCpn: redondearBurgerKing(discountCompetitorCpn),
            discountEmployee: redondearBurgerKing(discountEmployee),
            discountFreeItem: redondearBurgerKing(discountFreeItem),
            discountFriendsFamily: redondearBurgerKing(discountFriendsFamily),
            discountGuestRecovery: redondearBurgerKing(discountGuestRecovery),
            discountLoyalty: redondearBurgerKing(discountLoyalty),
            discountManagerMeal: redondearBurgerKing(discountManagerMeal),
            discountMilitary: redondearBurgerKing(discountMilitary),
            discountOther: redondearBurgerKing(discountOther),
            discountPolice: redondearBurgerKing(discountPolice),
            discountSenior: redondearBurgerKing(discountSenior),
            discountVendor: redondearBurgerKing(discountVendor),
            totalDiscounts: redondearBurgerKing(totalDiscounts),
            netSales: redondearBurgerKing(netSales),
            salesTax: redondearBurgerKing(salesTax),
            gcSold: redondearBurgerKing(gcSold),
            paidOut: redondearBurgerKing(paidOut),
            donations: redondearBurgerKing(donations),
            donationDiscount: redondearBurgerKing(donationDiscount),
            totalRevenue: redondearBurgerKing(totalRevenue),
            amex: redondearBurgerKing(amex),
            visa: redondearBurgerKing(visa),
            mc: redondearBurgerKing(mc),
            discover: redondearBurgerKing(discover),
            ebtFoodStamps: redondearBurgerKing(ebtFoodStamps),
            doorDashPay: redondearBurgerKing(doorDashPay),
            grubHubPay: redondearBurgerKing(grubHubPay),
            uberEatsPay: redondearBurgerKing(uberEatsPay),
            totalWhiteLabelPayments: redondearBurgerKing(totalWhiteLabelPayments),
            bkAppTotal: redondearBurgerKing(bkAppTotal),
            gcRedeem: redondearBurgerKing(gcRedeem),
            totalCashDeposit: redondearBurgerKing(totalCashDeposit),
            instorePayments: redondearBurgerKing(instorePayments),
            paypal: redondearBurgerKing(paypal),
            venmo: redondearBurgerKing(venmo),
            kiosk: redondearBurgerKing(kiosk),
            totalCC: redondearBurgerKing(totalCC),
            cashOverShort: redondearBurgerKing(cashOverShort),
            cashExpected: redondearBurgerKing(cashExpected),
            paymentsTotal: redondearBurgerKing(paymentsTotal),
            openChecks: redondearBurgerKing(openChecks),
            oS: redondearBurgerKing(oS),
            cashDiff: redondearBurgerKing(cashDiff),
            difference: redondearBurgerKing(oS)
        };
    });
}

function totalDiscountsBurgerKing(row) {
    return BURGER_KING_DISCOUNT_FIELDS.reduce(
        (sum, field) =>
            sum + Number(row[field] || 0),
        0
    );
}

function generarTaxAnalysisBurgerKing(conciliationData) {
    burgerKingTaxAnalysisData =
        conciliationData
            .map(row => {
                const taxRate =
                    BURGER_KING_TAX_RATES[row.store] || 0;

                const discounts =
                    totalDiscountsBurgerKing(row);

                const taxableSales =
                    row.foodSalesGross +
                    row.beverageSales +
                    row.nonFoodSales -
                    discounts -
                    row.uberEatsPay -
                    row.ebtFoodStamps;

                const calcTax =
                    taxableSales *
                    taxRate;

                const taxDiff =
                    calcTax -
                    row.salesTax;

                const rateCalc =
                    taxableSales !== 0
                        ? row.salesTax / taxableSales
                        : 0;

                const rateDiff =
                    taxRate -
                    rateCalc;

                row.taxRate =
                    taxRate;
                row.taxableSales =
                    redondearBurgerKing(taxableSales);
                row.taxCalculation =
                    redondearBurgerKing(calcTax);
                row.taxDiff =
                    redondearBurgerKing(taxDiff);
                row.rateCalculation =
                    rateCalc;
                row.rateDiff =
                    rateDiff;
                row.absTaxDiff =
                    Math.abs(taxDiff);

                return {
                    Store: row.store,
                    'Tax Rate': taxRate,
                    'Food Sales': row.foodSalesGross,
                    'Bev Sales': row.beverageSales,
                    'Non-Food': row.nonFoodSales,
                    Discounts: redondearBurgerKing(discounts),
                    Uber: row.uberEatsPay,
                    EBT: row.ebtFoodStamps,
                    'Taxable Sales': redondearBurgerKing(taxableSales),
                    'Calc Tax': redondearBurgerKing(calcTax),
                    'POS Tax': row.salesTax,
                    'Tax Diff ($)': redondearBurgerKing(taxDiff),
                    'Rate Calc': rateCalc,
                    'Rate Diff': rateDiff,
                    'Abs Tax Diff': redondearBurgerKing(Math.abs(taxDiff))
                };
            })
            .sort(
                (a, b) =>
                    Math.abs(b['Abs Tax Diff'] || 0) -
                    Math.abs(a['Abs Tax Diff'] || 0)
            );

    taxReviewData =
        burgerKingTaxAnalysisData;
}

function monedaBurgerKing(valor) {
    return `$${Math.abs(Number(valor) || 0).toFixed(2)}`;
}

function generarDiscrepanciesBurgerKing(conciliationData) {
    burgerKingDiscrepanciesData =
        conciliationData
            .map(row => {
                const issues = [];

                if (Math.abs(row.oS || 0) > 0.01) {
                    issues.push(
                        `Balance (O/S): ${monedaBurgerKing(row.oS)}`
                    );
                }

                if (Math.abs(row.cashDiff || 0) > 0.01) {
                    issues.push(
                        `Cash Diff: ${monedaBurgerKing(row.cashDiff)}`
                    );
                }

                if (Math.abs(row.openChecks || 0) > 0.01) {
                    issues.push(
                        `Open Checks: ${monedaBurgerKing(row.openChecks)}`
                    );
                }

                if (Math.abs(row.taxDiff || 0) > 1) {
                    issues.push(
                        `Tax Diff > $1: ${monedaBurgerKing(row.taxDiff)}`
                    );
                }

                const sortValue =
                    Math.abs(row.oS || 0) +
                    Math.abs(row.cashDiff || 0) +
                    Math.abs(row.openChecks || 0) +
                    Math.abs(row.taxDiff || 0);

                return {
                    Store: row.store,
                    'Total Revenue': row.totalRevenue,
                    'Net Sales': row.netSales,
                    'Sales Tax': row.salesTax,
                    'O/S Balance': row.oS,
                    'Cash Diff': row.cashDiff,
                    'Open Checks': row.openChecks,
                    'Tax Diff ($)': row.taxDiff,
                    'Tax Rate': row.taxRate,
                    'Rate Diff': row.rateDiff,
                    Issues: issues.length
                        ? issues.join('; ')
                        : 'OK',
                    _sortValue: sortValue
                };
            })
            .sort(
                (a, b) =>
                    b._sortValue -
                    a._sortValue
            )
            .map(row => {
                const {
                    _sortValue,
                    ...visible
                } = row;

                return visible;
            });
}

function agregarLineaBurgerKing(
    data,
    lineNo,
    row,
    acctNo,
    memo,
    type,
    amount,
    deptId = ''
) {
    const value =
        redondearBurgerKing(amount);

    if (value === 0) {
        return lineNo;
    }

    data.push({
        JOURNAL: 'SJ',
        DATE: row.date,
        LINE_NO: lineNo,
        DESCRIPTION: BURGER_KING_DESCRIPTION,
        ACCT_NO: acctNo,
        MEMO: memo,
        DEBIT: type === 'debit' ? Math.abs(value) : '',
        CREDIT: type === 'credit' ? Math.abs(value) : '',
        LOCATION_ID: row.store,
        DEPT_ID: deptId
    });

    return lineNo + 1;
}

function generarTemplateCsvBurgerKing(conciliationData) {
    const data = [];
    let lineNo = 1;

    conciliationData.forEach(row => {
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 401000, 'Sales Food', 'credit', row.foodSalesGross);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 401000, 'Sales Beverages', 'credit', row.beverageSales);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 408000, 'Non Sales Food', 'credit', row.nonFoodSales);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 408000, 'Surcharge - Delivery Fees', 'credit', row.surcharge + row.bagCharge);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 241000, 'Sales Tax', 'credit', row.salesTax);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 236000, 'Donations', 'credit', row.donations);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 111500, 'White Label Tips', 'credit', row.totalWlTips);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 202900, 'Gift Cards Sales', 'credit', row.gcSold);

        lineNo = agregarLineaBurgerKing(data, lineNo, row, 421000, 'Discounts & Promotions -Discount - % Off', 'debit', row.discountPercentOff);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 421000, 'Discounts & Promotions -Discount - $ Off', 'debit', row.discountDollarOff);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 421000, 'Discounts & Promotions - Discount - BOGO', 'debit', row.discountBogo);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 421000, 'Discounts & Promotions - Competitor Cpn', 'debit', row.discountCompetitorCpn);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 442000, 'Discounts & Promotions- Employee', 'debit', row.discountEmployee);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 421000, 'Discounts & Promotions - Free Item', 'debit', row.discountFreeItem);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 421000, 'Discounts & Promotions - Friends/Family', 'debit', row.discountFriendsFamily);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 444000, 'Discounts & Promotions - Guest Recovery', 'debit', row.discountGuestRecovery);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 421000, 'Discounts & Promotions - Loyalty', 'debit', row.discountLoyalty);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 442000, 'Discounts & Promotions - Manager Meal', 'debit', row.discountManagerMeal);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 421000, 'Discounts & Promotions - Military', 'debit', row.discountMilitary);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 421000, 'POS Over/Shorts Discount - Other', 'debit', row.discountOther);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 421000, 'Discounts & Promotions - Police', 'debit', row.discountPolice);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 421000, 'Discounts & Promotions - Senior', 'debit', row.discountSenior);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 421000, 'Discounts & Promotions - Vendor', 'debit', row.discountVendor);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 421000, 'Donation Discounts', 'debit', row.donationDiscount);

        if (row.paidOut < 0) {
            lineNo = agregarLineaBurgerKing(data, lineNo, row, 116200, 'Paid Outs', 'debit', row.paidOut);
        } else {
            lineNo = agregarLineaBurgerKing(data, lineNo, row, 116200, 'Paid Outs', 'credit', row.paidOut);
        }

        lineNo = agregarLineaBurgerKing(data, lineNo, row, 111500, 'Credit Card Expected', 'debit', row.totalCC);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 111500, 'Amex Expected Deposit', 'debit', row.amex);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 111500, 'EBT Expected', 'debit', row.ebtFoodStamps, 'EBT');
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 202900, 'Gift Card Redeemed', 'debit', row.gcRedeem);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 107000, 'Cash Expected Deposit', 'debit', row.cashExpected);
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 113000, 'DoorDash', 'debit', row.doorDashPay, 'DDD');
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 115000, 'GrubHub', 'debit', row.grubHubPay, 'GHD');
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 116000, 'Uber', 'debit', row.uberEatsPay, 'UBD');
        lineNo = agregarLineaBurgerKing(data, lineNo, row, 676000, 'Open Checks', 'debit', row.openChecks, 'CASH');
    });

    burgerKingTemplateCsvData =
        data;

    dailySalesREDData =
        burgerKingTemplateCsvData;
}

function procesarBurgerKing() {
    try {
        const rows =
            filasValidasBurgerKing(
                obtenerFilasBurgerKing()
            );

        if (!rows.length) {
            Swal.fire(
                'Error',
                'No hay datos Sales Burger King cargados',
                'error'
            );
            return false;
        }

        salesRows =
            rows;

        const fechaTrabajo =
            obtenerFechaTrabajoBurgerKing(rows);

        if (!fechaTrabajo) {
            Swal.fire(
                'Error',
                'No se encontro fecha para Burger King',
                'error'
            );
            return false;
        }

        fechaConciliacionActual =
            fechaTrabajo;

        const grupos =
            agruparFilasBurgerKing(
                rows,
                fechaTrabajo
            );

        if (!grupos.length) {
            Swal.fire(
                'Error',
                'No se encontraron tiendas para Burger King',
                'error'
            );
            return false;
        }

        burgerKingConciliationData =
            generarConciliationBurgerKing(
                grupos
            );

        datosExtraidos =
            burgerKingConciliationData;

        generarTaxAnalysisBurgerKing(
            burgerKingConciliationData
        );

        generarDiscrepanciesBurgerKing(
            burgerKingConciliationData
        );

        generarTemplateCsvBurgerKing(
            burgerKingConciliationData
        );

        statisticalDeliveryData = [];
        dailySales0314Data = [];
        dailySales0310Data = [];

        const resultsSection =
            document.getElementById(
                'resultsSection'
            );

        if (resultsSection) {
            resultsSection.style.display = 'block';
        }

        llenarFiltroTiendas();
        actualizarResumen();
        actualizarTotales();
        renderActiveTab();

        return true;
    } catch (error) {
        console.error(error);

        Swal.fire(
            'Error',
            error.message,
            'error'
        );

        return false;
    }
}

function renderConciliationBurgerKing() {
    renderTablaSucursales();
}

function renderTaxAnalysisBurgerKing() {
    renderArrayToMainTable(
        burgerKingTaxAnalysisData
    );
}

function renderDiscrepanciesBurgerKing() {
    renderArrayToMainTable(
        burgerKingDiscrepanciesData
    );
}

function renderTemplateCsvBurgerKing() {
    renderArrayToMainTable(
        burgerKingTemplateCsvData
    );
}
