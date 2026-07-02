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

        tableColumns: [

            { key: 'store', label: 'Store' },
            { key: 'unitName', label: 'Unit Name' },

            { key: 'foodSales', label: 'Food Sales - Gross' },
            { key: 'bevSales', label: 'Revenue - Beverage Sales' },
            { key: 'nonFood', label: 'Non-Food Sales' },

            { key: 'coupons', label: 'Coupons' },

            { key: 'surcharge', label: 'Surcharge' },
            { key: 'bagCharge', label: 'Bag Charge' },

            { key: 'wlTips', label: 'Total WL Tips' },

            { key: 'discPctOff', label: 'Discount - % Off' },
            { key: 'discDollarOff', label: 'Discount - $ Off' },
            { key: 'discBogo', label: 'Discount - BOGO' },
            { key: 'discCompetitor', label: 'Discount - Competitor Cpn' },
            { key: 'discEmployee', label: 'Discount - Employee' },
            { key: 'discFreeItem', label: 'Discount - Free Item' },
            { key: 'discFriends', label: 'Discount - Friends/Family' },
            { key: 'discGuestRecovery', label: 'Discount - Guest Recovery' },
            { key: 'discLoyalty', label: 'Discount - Loyalty' },
            { key: 'discManager', label: 'Discount - Manager Meal' },
            { key: 'discMilitary', label: 'Discount - Military' },
            { key: 'discOther', label: 'Discount - Other' },
            { key: 'discPolice', label: 'Discount - Police' },
            { key: 'discSenior', label: 'Discount - Senior' },
            { key: 'discVendor', label: 'Discount - Vendor' },

            { key: 'netSales', label: 'Net Sales' },

            { key: 'salesTax', label: 'Sales TAX' },

            { key: 'gcSold', label: 'GC Sold' },

            { key: 'paidOut', label: 'Paid Out' },

            { key: 'donations', label: 'Donations' },

            { key: 'donationDiscounts', label: 'Donat Disc' },

            { key: 'totalRevenue', label: 'Total Revenue' },

            { key: 'amex', label: 'AMEX' },
            { key: 'visa', label: 'Visa' },
            { key: 'mastercard', label: 'MC' },
            { key: 'discover', label: 'Discover' },

            { key: 'ebt', label: 'EBT - Food Stamps' },

            { key: 'dd', label: 'Door Dash Pay' },
            { key: 'gh', label: 'Grub Hub Pay' },
            { key: 'uber', label: 'Uber Eats Pay' },

            { key: 'wlPayments', label: 'Total White Label Payments' },

            { key: 'bkApp', label: 'BK App Total' },

            { key: 'gcRedeem', label: 'GC Redeem' },

            { key: 'cashDeposit', label: 'Total Cash Deposit' },

            { key: 'instore', label: 'Instore Payments' },

            { key: 'paypal', label: 'Paypal' },
            { key: 'venmo', label: 'Venmo' },

            { key: 'kiosk', label: 'Kiosk' },

            { key: 'ccTotals', label: 'Total CC' },

            { key: 'cashExpected', label: 'Cash Expected' },

            { key: 'paymentsTotal', label: 'Payments Total' },

            { key: 'openChecks', label: 'Open Checks' },

            { key: 'oS', label: 'O/S' },

            { key: 'cashDifference', label: 'Difference' }

        ],

        columns: {

            store: 'Store',
            unitName: 'Unit Name',

            foodSales: 'Food Sales - Gross',
            bevSales: 'Revenue - Beverage Sales',
            nonFood: 'Non-Food Sales',

            coupons: 'Coupons',

            surcharge: 'Surcharge (Delivery Fee)',
            bagCharge: 'BAG CHARGE',

            wlTips: 'White Label Tips Total',

            salesTax: 'Taxes (POS)',

            donations: 'Donations (posting)',
            gcSold: 'Gift Card Sold',
            paidOut: 'Paid Out - Petty Cash',

            donationDiscounts: 'Donation Discounts',

            discPctOff: 'Discount - % Off',
            discDollarOff: 'Discount - $ Off',
            discBogo: 'Discount - BOGO',
            discCompetitor: 'Discount - Competitor Cpn',
            discEmployee: 'Discount - Employee',
            discFreeItem: 'Discount - Free Item',
            discFriends: 'Discount - Friends/Family',
            discGuestRecovery: 'Discount - Guest Recovery',
            discLoyalty: 'Discount - Loyalty',
            discManager: 'Discount - Manager Meal',
            discMilitary: 'Discount - Military',
            discOther: 'Discount - Other',
            discPolice: 'Discount - Police',
            discSenior: 'Discount - Senior',
            discVendor: 'Discount - Vendor',

            amex: 'AMEX',
            visa: 'Visa',
            mastercard: 'MC',
            discover: 'Discover',

            ebt: 'EBT',

            dd: 'Door Dash Pay',
            gh: 'Grub Hub Pay',
            uber: 'Uber Eats Pay',

            gcRedeem: 'GC Redeem',

            cashDeposit: 'Total Cash Deposit',

            kiosk: 'Total Kiosk Payments',
            instore: 'Total Instore Payments',

            paypal: 'PayPal',
            venmo: 'Venmo',

            openChecks: 'Open Checks'

        }

    },

    'popeyes': {

        sourceSheet: 'Sales  POS',

        ebtSheet: 'EBT',
        tableColumns: [

            { key: 'date', label: 'Date' },
            { key: 'store', label: 'Store' },
            { key: 'unitName', label: 'Unit Name' },

            { key: 'food', label: 'Food' },
            { key: 'beverages', label: 'Beverages' },
            { key: 'other', label: 'Other' },

            { key: 'serviceFee', label: 'Service Fee' },
            { key: 'salesOther', label: 'Sales Other' },

            { key: 'deliveryFee', label: 'Delivery Fees Net' },
            { key: 'deliveryTips', label: 'Delivery Tips Net' },
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
            { key: 'amexPrpd', label: 'Amex PrPd' },

            { key: 'totalCC', label: 'CC Totals' },

            { key: 'doorDash', label: 'Door Dash' },
            { key: 'grubHub', label: 'Grub Hub' },
            { key: 'uberEats', label: 'Uber Eats' },

            { key: 'doorDashShortage', label: 'DoorDash Shortage' },
            { key: 'uberShortage', label: 'Uber Shortage' },

            { key: 'postmates', label: 'Postmates' },

            { key: 'ebt', label: 'EBT' },

            { key: 'kiosk', label: 'Kiosk' },

            { key: 'giftCardRedeemed', label: 'Gift Card Redeemed' },

            { key: 'onlineCatering', label: 'Online Catering' },
            { key: 'ezCater', label: 'EZ Cater' },

            { key: 'wlTips', label: 'WL Tips' },

            { key: 'paidOutSmallwares', label: 'Paid Out Smallwares' },
            { key: 'paidOutCleaning', label: 'Paid Out Cleaning Supplies' },
            { key: 'paidOutOffice', label: 'Paid Out Office Supplies' },
            { key: 'paidOutFood', label: 'Paid Out Food' },
            { key: 'paidOutCashOut', label: 'Paid Out Cash Out' },

            { key: 'cashDepositCalculated', label: 'Cash Deposit' },

            { key: 'delTotals', label: 'Del Totals' },

            { key: 'paymentsTotal', label: 'Payments Total' },

            { key: 'overShort', label: 'O/S' },

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
            { key: 'cashDeposit', label: 'Cash Deposit' },


            { key: 'cashHandlingDebit', label: 'Cash Handling Debit' },
            { key: 'cashHandlingCredit', label: 'Cash Handling Credit' },

            { key: 'cashExpected', label: 'Cash Expected' },
            { key: 'difference', label: 'Difference' }
        ],

        conciliationColumns: [

            { key: 'store', label: 'Store' },
            { key: 'date', label: '' },

            { key: 'food', label: 'Food' },
            { key: 'beverages', label: 'Beverages' },
            { key: 'other', label: 'Other+E3:T3' },

            { key: 'serviceFee', label: 'Service Fee' },
            { key: 'salesOther', label: 'Sales Other' },

            { key: 'deliveryFee', label: 'Delivery Fees Net' },
            { key: 'deliveryTips', label: 'Delivery Tips Net' },
            { key: 'totalTips', label: 'Total  Tips' },

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
            { key: 'amexPrpd', label: 'Amex PrPd' },
            { key: 'amexKiosk', label: 'Amex PrPd' },
            { key: 'totalCC', label: 'CC Totals' },

            { key: 'doorDash', label: 'Door Dash' },
            { key: 'grubHub', label: 'Grub Hub' },
            { key: 'uberEats', label: 'Uber Eats' },
            { key: 'doorDashShortage', label: 'DoorDash Shortage' },
            { key: 'uberShortage', label: 'Uber Shortage' },
            { key: 'postmates', label: 'Postmates' },

            { key: 'ebt', label: 'EBT' },
            { key: 'kiosk', label: 'Kiosk' },
            { key: 'giftCardRedeemed', label: 'Gift Card Redeemed' },
            { key: 'onlineCatering', label: 'Online Catering' },
            { key: 'ezCater', label: 'EZ Cater' },
            { key: 'wlTips', label: 'WL Tips' },

            { key: 'paidOutSmallwares', label: 'Paid Out Smallwares' },
            { key: 'paidOutCleaning', label: 'Paid Out Cleaning Supplies' },
            { key: 'paidOutOffice', label: 'Paid Out Office Supplies ' },
            { key: 'paidOutFood', label: 'Paid Out Food' },
            { key: 'paidOutCashOut', label: 'Paid Out Cash Out' },

            { key: 'cashDepositCalculated', label: 'Cash Deposit' },
            { key: 'delTotals', label: 'Del Totals' },
            { key: 'paymentsTotal', label: 'Payments Total' },
            { key: 'overShort', label: 'O/S' },
            { key: 'blankAu', label: '' },

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

            { key: 'store', label: '' },
            { key: 'blankBi', label: '' },
            { key: 'cashDeposit', label: 'Cash Deposit' },
            { key: 'cashHandlingDebit', label: 'Cash Handling - Over/Short Debit' },
            { key: 'cashHandlingCredit', label: 'Cash Handling - Over/Short Credit' },
            { key: 'cashExpected', label: 'Cash Expected' },
            { key: 'difference', label: 'Difference' }
        ],


        columns: {

            // SALES
            food: 'Net Sales - Food',
            beverages: 'Net Sales - Beverages',
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
            discountsOther: 'Promotions - Other',
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
            amexPrpd: 'Payments - PrPd Amex',
            visa: 'Payments - Visa',
            mastercard: 'Payments - Master Card',
            discover: 'Payments - Discover',
            debit: 'Payments - Debit',

            // DELIVERY
            doorDash: 'Payments - Door Dash',
            grubHub: 'Payments - Grub Hub',
            uberEats: 'Payments - Uber Eats',
            postmates: 'Payments - Postmates',

            doorDashShortage: 'DoorDash Shortage',
            uberShortage: 'Uber Shortage',

            // OTHER PAYMENTS
            ebt: 'Payments - EBT',
            kiosk: 'Payments - Kiosk',
            giftCardRedeemed: 'Payments - Gift Card',
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

