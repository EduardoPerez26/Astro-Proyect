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
            { key: 'totalRevenue', label: 'Total Revenue' },

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
            { key: 'oS', label: 'O/S' },
            { key: 'os', label: 'OS' },


            { key: 'deposit1', label: 'Deposit 1' },
            { key: 'deposit2', label: 'Deposit 2' },
            { key: 'deposit3', label: 'Deposit 3' },

            { key: 'cashPlusMinus', label: 'Cash +/-' },

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
            { key: 'salesOther', label: 'Sales Other' },

            { key: 'deliveryFee', label: 'Delivery Fee' },
            { key: 'deliveryTips', label: 'Delivery Tips' },
            { key: 'totalTips', label: 'Total Tips' },

            { key: 'discounts', label: 'Discounts' },
            { key: 'discountsPromo', label: '$ Off Promo' },

            { key: 'netSales', label: 'Net Sales' },

            { key: 'salesTax', label: 'Sales TAX' },
            { key: 'taxExemptSales', label: 'Tax Exempt Sales' },

            { key: 'caCrv', label: 'Ca CRV' },
            { key: 'gcSold', label: 'GC Sold' },

            { key: 'paidOut', label: 'Paid Out' },

            { key: 'donations', label: 'Donations' },
            { key: 'nonRedeemable', label: 'Non Redeemable' },

            { key: 'totalRevenue', label: 'Total Revenue' },

            { key: 'amex', label: 'AMEX' },
            { key: 'amexPrPd', label: 'Amex PrPd' },

            { key: 'ccTotals', label: 'CC Totals' },

            { key: 'dd', label: 'Door Dash' },
            { key: 'gh', label: 'Grub Hub' },
            { key: 'uber', label: 'Uber Eats' },

            { key: 'doorDashShortage', label: 'DoorDash Shortage' },
            { key: 'uberShortage', label: 'Uber Shortage' },

            { key: 'postmates', label: 'Postmates' },

            { key: 'ebt', label: 'EBT' },

            { key: 'kiosk', label: 'Kiosk' },

            { key: 'gcRedeem', label: 'Gift Card Redeemed' },

            { key: 'onlineCatering', label: 'Online Catering' },
            { key: 'ezCater', label: 'EZ Cater' },

            { key: 'wlTips', label: 'WL Tips' },

            { key: 'paidOutSmallwares', label: 'Paid Out Smallwares' },
            { key: 'paidOutCleaning', label: 'Paid Out Cleaning Supplies' },
            { key: 'paidOutOffice', label: 'Paid Out Office Supplies' },
            { key: 'paidOutFood', label: 'Paid Out Food' },
            { key: 'paidOutCashOut', label: 'Paid Out Cash Out' },

            { key: 'cashDeposit', label: 'Cash Deposit' },

            { key: 'delTotals', label: 'Del Totals' },

            { key: 'paymentsTotal', label: 'Payments Total' },

            { key: 'oS', label: 'O/S' },

            { key: 'discountsPromo', label: 'Discounts - $ Off Promo' },
            { key: 'discountEmployee', label: 'Discounts - Employee' },
            { key: 'discountGuestRecovery', label: 'Discounts - Guest Recovery' },
            { key: 'discountManager', label: 'Discounts - Manager' },
            { key: 'discountMilitary', label: 'Discounts - Military' },
            { key: 'discountPolice', label: 'Discounts - Police' },
            { key: 'discountSenior', label: 'Discounts - Senior Citizens' },
            { key: 'discountsOther', label: 'Discounts - Other' },
            { key: 'discountOpenDollar', label: 'Discounts - Open $' },
            { key: 'discountOpenPercent', label: 'Discounts - Open %' },
            { key: 'discount10', label: 'Discounts - 10%' },

            { key: 'totalDiscounts', label: 'Total Discounts' },
            { key: 'cashDepositCalculated', label: 'Cash Deposit' },
            { key: 'cashDeposit', label: 'Cash Deposit' },

            { key: 'cashOverShortDebit', label: 'Cash Handling Debit' },
            { key: 'cashOverShortCredit', label: 'Cash Handling Credit' },

            { key: 'cashExpected', label: 'Cash Expected' },
            { key: 'difference', label: 'Difference' }
        ],



        columns: {

            // SALES
            food: 'Net Sales - Food',
            beverage: 'Net Sales - Beverages',
            other: 'Net Sales - Other',

            serviceFee: 'Tips & Service Charges',
            salesOther: 'Sales - Other',

            deliveryFee: 'Delivery Fee',
            deliveryFeeNet: 'Delivery Fees Net',
            deliveryTips: 'Delivery Tips',
            deliveryTipsNet: 'Delivery Tips Net',

            // DISCOUNTS
            discounts: 'Discounts',
            discountsPromo: '$ Off Promo',

            discountEmployee: 'Promotions - Employee',
            discountGuestRecovery: 'Promotions - Guest Recovery',
            discountManager: 'Promotions - Manager',
            discountMilitary: 'Promotions - Military',
            discountPolice: 'Promotions - Police',
            discountSenior: 'Promotions - Senior Citizens',
            discountOther: 'Promotions - Other',
            discountOpenDollar: 'Promotions - Open $',
            discountOpenPercent: 'Promotions - Open %',
            discount10: 'Promotions - 10%',

            // TAX
            salesTax: 'Sales Tax Payable',
            taxExemptSales: 'Tax Exempt Sales',
            caCrv: 'CA CRV',

            // REVENUE
            donations: 'Donations',
            gcSold: 'Revenues - Gift Card Sales',
            nonRedeemable: 'Non Redeemable Tender',

            // CREDIT CARDS
            amex: 'Payments - AMEX',
            amexPrPd: 'Payments - AMEX PrePaid',
            visa: 'Payments - Visa',
            mastercard: 'Payments - Master Card',
            discover: 'Payments - Discover',
            debit: 'Payments - Debit',

            // DELIVERY
            dd: 'Payments - Door Dash',
            gh: 'Payments - Grub Hub',
            uber: 'Payments - Uber Eats',
            postmates: 'Payments - Postmates',

            doorDashShortage: 'DoorDash Shortage',
            uberShortage: 'Uber Shortage',

            // OTHER PAYMENTS
            ebt: 'Payments - EBT',
            kiosk: 'Payments - Kiosk',
            gcRedeem: 'Payments - Gift Card',
            cashApp: 'Payments - Cash App',

            onlineCatering: 'Payments - Online Catering',
            ezCater: 'Payments - EZ Cater',

            wlTips: 'WL DD Tips',

            // PAID OUT
            paidOut: 'Paid Out',

            paidOutSmallwares: 'Paid Out Smallwares',
            paidOutCleaning: 'Paid Out Cleaning Supplies',
            paidOutOffice: 'Paid Out Office Supplies',
            paidOutFood: 'Paid Out Food',
            paidOutCashOut: 'Paid Out Cash Out',

            // CASH
            cashDeposit: 'Cash Deposit',

            cashOverShort: 'Cash Handling - Over/Short',

            cashOverShortDebit:
                'Cash Handling - Over/Short Debit',

            cashOverShortCredit:
                'Cash Handling - Over/Short Credit'
        }
    }

};

