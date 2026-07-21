'use strict';

const {
    calculateBillAmortization,
    parseDate,
    toSqlDate,
    roundMoney
} = require('./prepaidAmortizationCalculator');

/**
 * Preserves the original amortization term and accelerates the remaining
 * unamortized balance into the store closure month.
 *
 * Example:
 * amountPaid = 2,150.62
 * original term = 12 months (Sep 2025 - Aug 2026)
 * closeout = Jan 2026
 * months before closeout = 4
 * closeout amount = 2,150.62 - round(2,150.62 * 4 / 12) = 1,433.75
 */
function calculateBillAmortizationWithCloseout({
    amountPaid,
    amortizationStart,
    amortizationEnd,
    closeoutDate
}) {
    const normal = calculateBillAmortization({
        amountPaid,
        amortizationStart,
        amortizationEnd
    });

    if (!closeoutDate) {
        return {
            ...normal,
            isCloseout: false,
            closeoutDate: null,
            closeoutAmount: null
        };
    }

    const closure = parseDate(closeoutDate);
    if (!closure) {
        throw new Error('The store closure date is invalid.');
    }

    const closeoutYear = closure.getUTCFullYear();
    const closeoutMonth = closure.getUTCMonth() + 1;
    const closeoutIndex = normal.months.findIndex(month =>
        Number(month.period_year) === closeoutYear &&
        Number(month.period_month) === closeoutMonth
    );

    if (closeoutIndex < 0) {
        throw new Error(
            'The store closure month must be inside the original amortization period.'
        );
    }

    const amount = roundMoney(amountPaid);
    const totalMonths = Number(normal.totalMonths || normal.months.length);

    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(totalMonths) || totalMonths <= 0) {
        throw new Error('The bill amount or original amortization term is invalid.');
    }

    const previousMonths = normal.months
        .slice(0, closeoutIndex)
        .map((month, index) => {
            const accumulatedCurrent = roundMoney(
                amount * (index + 1) / totalMonths
            );
            const accumulatedPrevious = roundMoney(
                amount * index / totalMonths
            );

            return {
                ...month,
                expected_amount: roundMoney(
                    accumulatedCurrent - accumulatedPrevious
                )
            };
        });

    const previouslyAmortized = roundMoney(
        amount * closeoutIndex / totalMonths
    );
    const closeoutAmount = roundMoney(amount - previouslyAmortized);

    const closeoutMonthRow = {
        ...normal.months[closeoutIndex],
        expected_amount: closeoutAmount
    };

    return {
        ...normal,
        totalMonths,
        // A closed store no longer has a regular monthly amortization amount.
        // The remaining balance is posted entirely in the closeout month.
        monthlyAmount: null,
        months: [...previousMonths, closeoutMonthRow],
        isCloseout: true,
        closeoutDate: toSqlDate(closure),
        closeoutAmount
    };
}

module.exports = {
    calculateBillAmortizationWithCloseout
};
