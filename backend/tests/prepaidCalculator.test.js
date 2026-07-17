const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateBillSchedule, round2 } = require('../services/prepaidCalculator');

test('round2 prevents floating point residue in accounting values', () => {
    assert.equal(round2(10.005), 10.01);
    assert.equal(round2(0.1 + 0.2), 0.3);
});

test('prepaid schedule preserves total amount across periods', () => {
    const result = calculateBillSchedule({
        amount_paid: 1200,
        amortization_start: '2026-01-01',
        amortization_end: '2026-12-31',
        schedule_year: 2026
    });

    const total = result.monthly_rows.reduce(
        (sum, row) => sum + Math.abs(Number(row.expected_amount || 0)),
        0
    );
    assert.equal(round2(total), 1200);
    assert.equal(result.monthly_rows.length, 12);
});
