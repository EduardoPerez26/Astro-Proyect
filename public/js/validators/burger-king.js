// Validador para Burger King
const BurgerKingValidator = {
    name: 'Burger King',
    expectedConcepts: [
        "Open Checks",
        "Sales Food",
        "Sales Beverages",
        "Non Sales Food",
        "Surcharge - Delivery Fees",
        "Sales Tax",
        "Donations",
        "White Label Tips",
        "Gift Cards Sales",
        "Discounts & Promotions -Discount - % Off",
        "Discounts & Promotions -Discount - $ Off",
        "Discounts & Promotions - Discount - BOGO",
        "Discounts & Promotions- Employee",
        "Discounts & Promotions - Free Item",
        "Discounts & Promotions - Loyalty",
        "Discounts & Promotions - Manager Meal",
        "Discounts & Promotions - Guest Recovery",
        "Discounts & Promotions - Senior",
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
