window.RestaurantConfigs = {

   
    'taco-bell': {

        sourceSheet: 'Sales',

        ebtSheet: 'EBT AMOUNTS',

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

            os :'OS',

            oS:'O/S',

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

        { key:'store', label:'Store' },

        { key:'salesTax', label:'Sales Tax' },

        { key:'grossSalesPos', label:'Gross Sales POS' },

        { key:'discounts', label:'Discounts' },

        { key:'promo', label:'Promo' },

        { key:'donations', label:'Donations' },

        { key:'netSales', label:'Net Sales' },

        { key:'gcSold', label:'GC Sold' },

        { key:'paidOut', label:'Paid Out' },

        { key:'paidIn', label:'Paid In' },

        { key:'totalRevenue', label:'Total Revenue' },

        { key:'mastercard', label:'Mastercard' },

        { key:'visa', label:'Visa' },

        { key:'discover', label:'Discover' },

        { key:'amex', label:'Amex' },

        { key:'debit', label:'Debit' },

        { key:'ebt', label:'EBT' },

        { key:'gcRedeem', label:'GC Redeem' },

        { key:'acctCash', label:'Acct Cash' },

        { key:'deposits', label:'Deposits' },

        { key:'gh', label:'GH' },

        { key:'uber', label:'Uber' },

        { key:'dd', label:'DD' },

        { key:'ccTotals', label:'CC Totals' },

        { key:'paymentsTotal', label:'Payments Total' },

        { key:'os', label:'OS' },

        { key:'cashExpected', label:'Cash Expected' },

        { key:'difference', label:'Difference' }

    ],

    columns: {

        store:'Store',

        salesTax:'Sales Tax',

        netSales:'Net Sales',

        discounts:'Discounts',

        promo:'Promo',

        donation:'Donation',

        giftCardSold:'Gift Card Sold',

        giftCardRedeemed:'Gift Card Redeemed',

        paidOut:'Paid Out',

        paidIn:'Paid In',

        mastercard:'Mastercard',

        visa:'Visa',

        discover:'Discover',

        amex:'Amex',

        debit:'Debit',

        acctCash:'Acct Cash',

        deposit1:'Deposit 1',

        deposit2:'Deposit 2',

        deposit3:'Deposit 3',

        cashPlusMinus:'Cash +/-',

        uber:'Uber',

        doordash:'DD',

        grubhub:'GH'
    }
}

};

