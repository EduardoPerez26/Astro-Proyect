// Validador para Popeyes
const PopeyesValidator = {
    name: 'Popeyes',
    expectedConcepts: [
        "Amex Expected Deposit",
        "Ca CRV",
        "Cash Expected Deposit",
        "CC Expected Deposit",
        "Delivery Fee",
        "DoorDash",
        "EBT Expected",
        "EZ Cater",
        "Gift Card Redeemed",
        "Gift Cards Sales",
        "GrubHub",
        "Kiosk Expected Payment",
        "Sales Beverages",
        "Sales Food",
        "Sales Other",
        "Sales Tax Payable",
        "Uber",
        "WL DD Tips"
    ]
};

if (typeof window !== 'undefined') {
    window.PopeyesValidator = PopeyesValidator;
}
