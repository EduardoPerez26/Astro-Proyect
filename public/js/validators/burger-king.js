// Validador para Burger King
const BurgerKingValidator = {
    name: 'Burger King',
    expectedConcepts: [
        'Gross Food Sales',
        'Employee Discounts',
        'Promotional Discounts',
        'Sales Tax',
        'Non Taxable Sales',
        'Gift Cards Sold',
        'Gift Cards Redeemed',
        'Paid Outs',
        'Credit Card Deposits',
        'AMEX Deposits',
        'Cash Deposits',
        'Uber Eats',
        'DoorDash',
        'GrubHub',
        'Delivery Fees'
    ]
};

if (typeof window !== 'undefined') {
    window.BurgerKingValidator = BurgerKingValidator;
}
