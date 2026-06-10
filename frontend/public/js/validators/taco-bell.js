// Validador para Taco Bell
const TacoBellValidator = {
    name: 'Taco Bell',
    expectedConcepts: [
        'Gross Food Sales',
        'Discounts -Employee meals',
        'Coupons - Promotions',
        'Sales Tax Payable',
        'Non Taxable Sales',
        'Donations',
        'Gift Cards SOLD',
        'Paid Outs',
        'Credit Cards Expected Deposit',
        'AMEX Expected Deposit',
        'Gift Cards REEDEM',
        'Cash Expected Deposit',
        'Uber',
        'DoorDash',
        'GrubHub',
        'EBT Expected Deposit'
    ]
};

if (typeof window !== 'undefined') {
    window.TacoBellValidator = TacoBellValidator;
}
