// Validador para Popeyes
const PopeyesValidator = {
    name: 'Popeyes',
    expectedConcepts: [
        'Gross Food Sales',
        'Employee Meals',
        'Coupons/Promotions',
        'Sales Tax Payable',
        'Non Taxable Sales',
        'Donations',
        'Gift Cards Sold',
        'Gift Cards Redeemed',
        'Paid Outs',
        'Credit Card Expected',
        'AMEX Expected',
        'Cash Expected',
        'Uber Eats',
        'DoorDash',
        'GrubHub',
        'Catering Sales'
    ]
};

if (typeof window !== 'undefined') {
    window.PopeyesValidator = PopeyesValidator;
}
