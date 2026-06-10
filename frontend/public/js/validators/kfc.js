// Validador para KFC
const KFCValidator = {
    name: 'KFC',
    expectedConcepts: [
        'Gross Food Sales',
        'Employee Discounts',
        'Promotional Coupons',
        'Sales Tax',
        'Non Taxable Sales',
        'Charitable Donations',
        'Gift Cards Sold',
        'Gift Cards Redeemed',
        'Paid Outs',
        'Credit Card Deposits',
        'AMEX Deposits',
        'Cash Deposits',
        'Uber Eats',
        'DoorDash',
        'GrubHub',
        'EBT Deposits',
        'Catering Revenue'
    ]
};

if (typeof window !== 'undefined') {
    window.KFCValidator = KFCValidator;
}
