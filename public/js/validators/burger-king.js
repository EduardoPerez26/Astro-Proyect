// Validador para Burger King
const BurgerKingValidator = {
    name: 'Burger King',
    expectedConcepts: [
        "Sales Food",
        "Sales Beverages",
        "Non Sales Food",
        "Sales Tax",
        "Surcharge - Delivery Fees",
        "Donations",
        "White Label Tips",
        "Gift Cards Sales",
        "Open Checks",
        "Discounts & Promotions - Discount - % Off",
        "Discounts & Promotions - Discount - $ Off",
        "Discounts & Promotions - Discount - BOGO",
        "Discounts & Promotions - Employee",
        "Discounts & Promotions - Free Item",
        "Discounts & Promotions - Loyalty",
        "Discounts & Promotions - Manager Meal",
        "Discounts & Promotions - Senior",
        "Discounts & Promotions - Guest Recovery",
        "POS Over/Shorts Discount - Other",
        "Credit Card Expected",
        "Amex Expected Deposit",
        "EBT Expected",
        "Gift Card Redeemed",
        "Cash Expected Deposit",
        "DoorDash",
        "GrubHub",
        "Uber"
    ]
};

if (typeof window !== 'undefined') {
    window.BurgerKingValidator = BurgerKingValidator;
}
