window.RestaurantConfigs = {


    'taco-bell': {

        sourceSheet: 'Sales',

        ebtSheet: 'EBT AMOUNTS',
        tableColumns: [

            { key: 'store', label: 'Store' },

            { key: 'salesTax', label: 'Sales Tax' },
            { key: 'grossSalesPos', label: 'Gross Sales POS' },
            { key: 'discounts', label: 'Discounts' },
            { key: 'promo', label: 'Promo' },
            { key: 'donations', label: 'Donations' },

            { key: 'netSales', label: 'Net Sales' },

            { key: 'gcSold', label: 'GC Sold' },

            { key: 'paidOut', label: 'Paid Out' },
            { key: 'paidIn', label: 'Paid In' },

            { key: 'mastercard', label: 'Mastercard' },
            { key: 'visa', label: 'Visa' },
            { key: 'discover', label: 'Discover' },
            { key: 'amex', label: 'Amex' },
            { key: 'debit', label: 'Debit' },

            { key: 'ebt', label: 'EBT' },

            { key: 'gcRedeem', label: 'GC Redeem' },

            { key: 'acctCash', label: 'Acct Cash' },

            { key: 'deposits', label: 'Deposits' },

            { key: 'gh', label: 'Grub Hub' },
            { key: 'uber', label: 'Uber' },
            { key: 'dd', label: 'Door Dash' },

            { key: 'ccTotals', label: 'CC Totals' },

            { key: 'paymentsTotal', label: 'Payments Total' },

            { key: 'cashExpected', label: 'Cash Expected' },

            { key: 'difference', label: 'Difference' }

        ],

        columns: {

            store: 'Store',
            salesTax: 'Sales Tax',
            grossSales: 'Gross Sales',
            discounts: 'Discounts',
            promo: 'Promo',
            donation: 'Donation',
            netSales: 'Net Sales',

            giftCardSold: 'Gift Cards Sold',
            giftCardRedeemed: 'Gift Card Redeemed',

            paidOut: 'Paid Out',
            paidIn: 'Paid In',

            mastercard: 'Mastercard',
            visa: 'Visa',
            discover: 'Discover',
            amex: 'Amex',
            debit: 'Debit',

            deposit1: 'Deposit 1',
            deposit2: 'Deposit 2',
            deposit3: 'Deposit 3',

            acctCash: 'Acct Cash',

            mobileCC: 'Mobile CC',

            os: 'OS',

            oS: 'O/S',

            cashPlusMinus: 'Cash +/-',

            uber: 'Uber Payments',
            doordash: 'DoorDash Payment',
            grubhub: 'Grub Hub Payments'

        }

    },

    'burger-king': {

        sourceSheet: 'Daily Sales',

        ebtSheet: null,

        columns: {

            store: 'Store',

            salesTax: 'Tax',

            grossSales: 'Gross Sales',

            netSales: 'Net Sales'

        }

    },

    'popeyes': {

        sourceSheet: 'Sales',

        ebtSheet: 'EBT',
        tableColumns: [

            { key: 'fecha', label: 'Date' },
            { key: 'store', label: 'Store' },
            { key: 'unitName', label: 'Unit Name' },

            { key: 'food', label: 'Food' },
            { key: 'beverage', label: 'Beverages' },
            { key: 'other', label: 'Other' },

            { key: 'serviceFee', label: 'Service Fee' },

            { key: 'salesTax', label: 'Sales Tax' },

            { key: 'taxExemptSales', label: 'Tax Exempt Sales' },

            { key: 'deliveryFee', label: 'Delivery Fee' },
            { key: 'deliveryFeeNet', label: 'Delivery Fee Net' },
            { key: 'deliveryTipsNet', label: 'Delivery Tips Net' },

            { key: 'discounts', label: 'Discounts' },

            { key: 'gcSold', label: 'GC Sold' },

            { key: 'netSales', label: 'Net Sales' },

            { key: 'totalRevenue', label: 'Total Revenue' },

            { key: 'mastercard', label: 'Master Card' },
            { key: 'visa', label: 'Visa' },
            { key: 'amex', label: 'AMEX' },
            { key: 'discover', label: 'Discover' },
            { key: 'debit', label: 'Debit' },

            { key: 'ccTotals', label: 'CC Totals' },

            { key: 'dd', label: 'Door Dash' },
            { key: 'gh', label: 'Grub Hub' },
            { key: 'uber', label: 'Uber Eats' },

            { key: 'ebt', label: 'EBT' },

            { key: 'kiosk', label: 'Kiosk' },

            { key: 'gcRedeem', label: 'GC Redeem' },

            { key: 'cashApp', label: 'Cash App' },

            { key: 'paymentsTotal', label: 'Payments Total' },

            { key: 'cashOverShort', label: 'Cash Over / Short' },

            { key: 'cashDeposit', label: 'Cash Deposit' },

            { key: 'cashExpected', label: 'Cash Expected' },

            { key: 'difference', label: 'Difference' }

        ],


        columns: {

            food: 'Net Sales - Food',

            beverage: 'Net Sales - Beverages',

            other: 'Net Sales - Other',

            salesTax: 'Sales Tax Payable',

            taxExemptSales: 'Tax Exempt Sales',

            donations: 'Donations',

            gcSold: 'Revenues - Gift Card Sales',

            mastercard: 'Payments - Master Card',

            visa: 'Payments - Visa',

            amex: 'Payments - AMEX',

            discover: 'Payments - Discover',

            debit: 'Payments - Debit',

            ebt: 'Payments - EBT',

            gcRedeem: 'Payments - Gift Card',

            uber: 'Payments - Uber Eats',

            dd: 'Payments - Door Dash',

            gh: 'Payments - Grub Hub',

            cashDeposit: 'Cash Deposit',

            cashHandlingOverShort: 'Cash Handling - Over/Short',

            deliveryFee: 'Delivery Fee',

            deliveryFeeNet: 'Delivery Fees Net',

            deliveryTipsNet: 'Delivery Tips Net',

            serviceFee: 'Tips & Service Charges'

        }
    }

};

