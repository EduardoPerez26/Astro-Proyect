// =========================================================
// PREPAID AMORTIZATION CALCULATOR
// Builds an auditable monthly schedule from a paid bill.
// Default PTAX cadence: Sep of tax year through Aug of next year.
// =========================================================

function roundMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

    if (typeof value === 'number') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const date = new Date(excelEpoch.getTime() + value * 86400000);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const text = String(value).trim();
    if (!text) return null;

    const excelNumber = Number(text);
    if (Number.isFinite(excelNumber) && excelNumber > 25000 && excelNumber < 70000) {
        return parseDate(excelNumber);
    }

    const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (slash) {
        let year = Number(slash[3]);
        if (year < 100) year += year >= 70 ? 1900 : 2000;
        const date = new Date(Date.UTC(year, Number(slash[1]) - 1, Number(slash[2])));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
        const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toSqlDate(value) {
    const date = parseDate(value);
    if (!date) return null;
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0')
    ].join('-');
}

function startOfMonth(value) {
    const date = parseDate(value);
    if (!date) return null;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date, months) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function monthsBetweenInclusive(startValue, endValue) {
    const start = startOfMonth(startValue);
    const end = startOfMonth(endValue);
    if (!start || !end || start > end) return [];

    const months = [];
    let cursor = start;
    while (cursor <= end) {
        months.push(new Date(cursor));
        cursor = addMonths(cursor, 1);
    }
    return months;
}

function periodCode(month, year) {
    return `${year}-${String(month).padStart(2, '0')}`;
}

function defaultAmortizationPeriod(taxYear) {
    const year = Number(taxYear || new Date().getUTCFullYear());
    return {
        start: `${year}-09-01`,
        end: `${year + 1}-08-31`
    };
}

function inferTaxYearFromText(value, fallbackYear = new Date().getUTCFullYear()) {
    const text = String(value || '');
    const match = text.match(/\b(?:PTAX|PROPERTY TAX|PERSONAL\s*\/\s*UNSECURED)[^\d]*(20\d{2})\b/i)
        || text.match(/\b(20\d{2})\b/);
    return match ? Number(match[1]) : Number(fallbackYear);
}

function calculateBillAmortization({ amountPaid, amortizationStart, amortizationEnd }) {
    const amount = roundMoney(amountPaid);
    const months = monthsBetweenInclusive(amortizationStart, amortizationEnd);

    if (!amount || !months.length) {
        return {
            totalMonths: 0,
            monthlyAmount: 0,
            months: []
        };
    }

    const rawMonthly = amount / months.length;
    const normalMonthly = roundMoney(rawMonthly);
    let remaining = amount;

    const monthRows = months.map((month, index) => {
        const isLast = index === months.length - 1;
        const expected = isLast ? roundMoney(remaining) : normalMonthly;
        remaining = roundMoney(remaining - expected);

        return {
            period_year: month.getUTCFullYear(),
            period_month: month.getUTCMonth() + 1,
            period_code: periodCode(month.getUTCMonth() + 1, month.getUTCFullYear()),
            expected_amount: expected
        };
    });

    return {
        totalMonths: months.length,
        monthlyAmount: normalMonthly,
        months: monthRows
    };
}

module.exports = {
    roundMoney,
    parseDate,
    toSqlDate,
    periodCode,
    defaultAmortizationPeriod,
    inferTaxYearFromText,
    calculateBillAmortization
};
