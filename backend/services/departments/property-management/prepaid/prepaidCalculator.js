// =========================================================
// PREPAID AMORTIZATION CALCULATOR
// Builds the expected schedule from bill/source data.
// =========================================================

const XLSX = require('xlsx');

const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function round2(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function toCents(value) {
    return Math.round(round2(value) * 100);
}

function centsToNumber(cents) {
    return round2(Number(cents || 0) / 100);
}

function normalizeKey(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .trim()
        .toLowerCase();
}

function normalizeStore(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const numeric = text.match(/\d{3,}/);
    return numeric ? numeric[0] : text;
}

function parseMoney(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return round2(value);

    let text = String(value).trim();
    if (!text || text === '-' || /^-+$/.test(text)) return 0;

    const isNegative = /^\(.*\)$/.test(text) || text.startsWith('-');
    text = text
        .replace(/[(),$\s]/g, '')
        .replace(/,/g, '')
        .replace(/[^0-9.-]/g, '');

    const parsed = Number(text || 0);
    if (!Number.isFinite(parsed)) return 0;
    return round2(isNegative ? -Math.abs(parsed) : parsed);
}

function excelSerialToDate(serial) {
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
}

function normalizeYear(year) {
    const numeric = Number(year);
    if (numeric >= 0 && numeric <= 49) return 2000 + numeric;
    if (numeric >= 50 && numeric <= 99) return 1900 + numeric;
    return numeric;
}

function parseDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
    }

    if (typeof value === 'number') {
        return excelSerialToDate(value);
    }

    const text = String(value).trim();
    if (!text || text === '-') return null;

    const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
        const year = Number(isoMatch[1]);
        const month = Number(isoMatch[2]);
        const day = Number(isoMatch[3]);
        return new Date(Date.UTC(year, month - 1, day));
    }

    const direct = new Date(text);
    if (!Number.isNaN(direct.getTime()) && /^\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}/.test(text)) {
        return new Date(Date.UTC(direct.getFullYear(), direct.getMonth(), direct.getDate()));
    }

    const match = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (!match) {
        return Number.isNaN(direct.getTime())
            ? null
            : new Date(Date.UTC(direct.getFullYear(), direct.getMonth(), direct.getDate()));
    }

    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = normalizeYear(Number(match[3]));
    if (!month || !day || !year || month > 12 || day > 31) return null;
    return new Date(Date.UTC(year, month - 1, day));
}

function formatSqlDate(date) {
    if (!date) return null;
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function formatDisplayDate(date) {
    if (!date) return '';
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const yy = String(date.getUTCFullYear()).slice(-2);
    return `${mm}/${dd}/${yy}`;
}

function periodCode(month, year) {
    return `P${String(month).padStart(2, '0')}.${String(year).slice(-2)}`;
}

function firstOfMonth(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthsBetweenInclusive(startDate, endDate) {
    if (!startDate || !endDate) return [];

    const start = firstOfMonth(startDate);
    const end = firstOfMonth(endDate);
    if (start > end) return [];

    const months = [];
    let cursor = new Date(start);
    while (cursor <= end) {
        months.push(new Date(cursor));
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return months;
}

function parseAmortizationPeriod(value, row = {}) {
    const explicitStart = parseDate(row.amortization_start || row.start_date || row.period_start);
    const explicitEnd = parseDate(row.amortization_end || row.end_date || row.period_end);
    if (explicitStart && explicitEnd) {
        return { start: explicitStart, end: explicitEnd };
    }

    const text = String(value || '').trim();
    const matches = Array.from(text.matchAll(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/g)).map(match => match[0]);
    if (matches.length >= 2) {
        return {
            start: parseDate(matches[0]),
            end: parseDate(matches[1])
        };
    }

    return { start: null, end: null };
}

function monthAllocations(amountPaid, months) {
    const totalCents = toCents(amountPaid);
    const totalMonths = months.length;
    if (!totalMonths || !totalCents) return [];

    let previousCumulative = 0;
    return months.map((month, index) => {
        const cumulative = Math.round(totalCents * (index + 1) / totalMonths);
        const cents = cumulative - previousCumulative;
        previousCumulative = cumulative;
        return {
            date: month,
            year: month.getUTCFullYear(),
            month: month.getUTCMonth() + 1,
            amount: centsToNumber(cents)
        };
    });
}

function calculateBillSchedule(input) {
    const amountPaid = round2(Math.abs(parseMoney(input.amount_paid)));
    const amortizationStart = parseDate(input.amortization_start);
    const amortizationEnd = parseDate(input.amortization_end);
    const scheduleYear = Number(input.schedule_year);

    if (!amountPaid || !amortizationStart || !amortizationEnd || !scheduleYear) {
        throw new Error('Bill is missing amount, amortization start, amortization end, or schedule year.');
    }

    const months = monthsBetweenInclusive(amortizationStart, amortizationEnd);
    if (!months.length) {
        throw new Error('The amortization period is invalid.');
    }

    const priorYearMonths = months.filter(month => month.getUTCFullYear() < scheduleYear);
    const scheduleMonths = months.filter(month => month.getUTCFullYear() === scheduleYear);
    const futureYearMonths = months.filter(month => month.getUTCFullYear() > scheduleYear);
    const monthlyAmortization = round2(amountPaid / months.length);

    const rawMonthly = amountPaid / months.length;
    const priorYearAmortized = round2(rawMonthly * priorYearMonths.length);
    const priorYearBalanceForward = round2(amountPaid - priorYearAmortized);

    let scheduleAmounts = scheduleMonths.map(() => monthlyAmortization);
    if (scheduleAmounts.length && futureYearMonths.length === 0) {
        const beforeLast = round2(monthlyAmortization * (scheduleAmounts.length - 1));
        scheduleAmounts[scheduleAmounts.length - 1] = round2(priorYearBalanceForward - beforeLast);
    }

    return {
        total_months: months.length,
        prior_year_months: priorYearMonths.length,
        schedule_year_months: scheduleMonths.length,
        amount_paid: amountPaid,
        prior_year_amortized: priorYearAmortized,
        prior_year_balance_forward: priorYearBalanceForward,
        monthly_amortization: monthlyAmortization,
        amortization_start: formatSqlDate(amortizationStart),
        amortization_end: formatSqlDate(amortizationEnd),
        amortization_period_label: `${formatDisplayDate(amortizationStart)} - ${formatDisplayDate(amortizationEnd)}`,
        monthly_rows: scheduleMonths.map((month, index) => ({
            schedule_year: scheduleYear,
            period_month: month.getUTCMonth() + 1,
            period_code: periodCode(month.getUTCMonth() + 1, scheduleYear),
            expected_amount: -round2(scheduleAmounts[index])
        }))
    };
}

function findHeaderRow(rows) {
    let best = { index: -1, score: 0 };
    rows.forEach((row, index) => {
        const normalized = row.map(normalizeKey);
        const text = normalized.join('|');
        let score = 0;
        if (text.includes('amount paid') || text.includes('amount')) score += 2;
        if (text.includes('amortization period') || text.includes('amortization')) score += 2;
        if (text.includes('location') || text.includes('store')) score += 1;
        if (text.includes('payee') || text.includes('vendor')) score += 1;
        if (text.includes('gl acct') || text.includes('gl account')) score += 1;
        if (score > best.score) best = { index, score };
    });
    return best.score >= 4 ? best.index : -1;
}

function indexHeaders(headerRow) {
    const map = new Map();
    headerRow.forEach((header, index) => {
        const key = normalizeKey(header);
        if (key && !map.has(key)) map.set(key, index);
    });
    return map;
}

function valueByAliases(row, headerMap, aliases) {
    for (const alias of aliases) {
        const normalized = normalizeKey(alias);
        if (headerMap.has(normalized)) return row[headerMap.get(normalized)];
    }

    for (const [key, index] of headerMap.entries()) {
        if (aliases.some(alias => key.includes(normalizeKey(alias)))) {
            return row[index];
        }
    }

    return '';
}

function readSourceBills(buffer, defaults = {}) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('The source workbook does not contain sheets.');

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    const headerIndex = findHeaderRow(rows);
    if (headerIndex < 0) {
        throw new Error('Could not find a header row with Payee, Location, Amount Paid, and Amortization Period.');
    }

    const headerMap = indexHeaders(rows[headerIndex]);
    const bills = [];
    const rejected = [];

    rows.slice(headerIndex + 1).forEach((row, offset) => {
        const sourceRowNumber = headerIndex + offset + 2;
        const payee = String(valueByAliases(row, headerMap, ['Payee', 'Vendor', 'Supplier']) || '').trim();
        const locationRaw = valueByAliases(row, headerMap, ['Location', 'Store', 'Store Number', 'Unit', 'Unit Number']);
        const storeNumber = normalizeStore(locationRaw);
        const amountPaid = parseMoney(valueByAliases(row, headerMap, ['Amount Paid', 'Paid Amount', 'Bill Amount', 'Amount']));
        const periodRaw = valueByAliases(row, headerMap, ['Amortization Period', 'Period', 'Amort Period']);
        const period = parseAmortizationPeriod(periodRaw, {
            amortization_start: valueByAliases(row, headerMap, ['Amortization Start', 'Start Date', 'Period Start']),
            amortization_end: valueByAliases(row, headerMap, ['Amortization End', 'End Date', 'Period End'])
        });
        const billDate = parseDate(valueByAliases(row, headerMap, ['Date', 'Bill Date', 'Payment Date', 'Paid Date']));
        const glAccount = String(valueByAliases(row, headerMap, ['GL Acct', 'GL Account', 'Account']) || defaults.gl_account || '').trim();
        const expenseGlAccount = String(valueByAliases(row, headerMap, ['Exp. To GL Acct', 'Exp To GL Acct', 'Expense GL', 'Expense GL Account', 'Expense Account']) || defaults.expense_gl_account || '').trim();
        const entity = String(valueByAliases(row, headerMap, ['Entity']) || defaults.entity || '').trim();
        const doc = String(valueByAliases(row, headerMap, ['DOC', 'Document', 'Document Number']) || '').trim();
        const supportReference = String(valueByAliases(row, headerMap, ['Support', 'Backup', 'Bill', 'Invoice', 'Support Reference']) || '').trim();

        if (!storeNumber && !amountPaid && !payee) return;

        if (!storeNumber || !amountPaid || !period.start || !period.end) {
            rejected.push({
                row: sourceRowNumber,
                payee,
                location: String(locationRaw || ''),
                amount_paid: amountPaid,
                reason: 'Missing store, amount paid, or amortization period.'
            });
            return;
        }

        bills.push({
            source_row_number: sourceRowNumber,
            payee,
            store_number: storeNumber,
            entity,
            doc,
            gl_account: glAccount,
            expense_gl_account: expenseGlAccount,
            bill_date: formatSqlDate(billDate),
            bill_date_label: formatDisplayDate(billDate),
            amortization_start: formatSqlDate(period.start),
            amortization_end: formatSqlDate(period.end),
            amortization_period_label: `${formatDisplayDate(period.start)} - ${formatDisplayDate(period.end)}`,
            amount_paid: round2(Math.abs(amountPaid)),
            support_reference: supportReference
        });
    });

    return {
        sheet_name: sheetName,
        header_row: headerIndex + 1,
        bills,
        rejected
    };
}

function readMonthlyGl(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('The GL workbook does not contain sheets.');

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
    const headerIndex = rows.findIndex(row => {
        const keys = row.map(normalizeKey).join('|');
        return keys.includes('location') && (keys.includes('debit') || keys.includes('credit') || keys.includes('period balance'));
    });

    if (headerIndex < 0) {
        throw new Error('Could not find a GL header row with Location and Debit/Credit columns.');
    }

    const headerMap = indexHeaders(rows[headerIndex]);
    const totals = new Map();

    rows.slice(headerIndex + 1).forEach(row => {
        const storeNumber = normalizeStore(valueByAliases(row, headerMap, ['Location', 'Store', 'Unit', 'Unit Number']));
        if (!storeNumber) return;

        const debit = parseMoney(valueByAliases(row, headerMap, ['Debit']));
        const credit = parseMoney(valueByAliases(row, headerMap, ['Credit']));
        const periodBalance = parseMoney(valueByAliases(row, headerMap, ['Period balance(USD)', 'Period Balance', 'Period Balance USD']));

        let actual = round2(debit - credit);
        if (!debit && !credit && periodBalance) actual = periodBalance;
        if (!actual) return;

        totals.set(storeNumber, round2((totals.get(storeNumber) || 0) + actual));
    });

    return {
        sheet_name: sheetName,
        header_row: headerIndex + 1,
        totals: Array.from(totals.entries()).map(([store_number, actual_amount]) => ({
            store_number,
            actual_amount
        }))
    };
}

module.exports = {
    MONTH_NAMES,
    calculateBillSchedule,
    readSourceBills,
    readMonthlyGl,
    parseMoney,
    round2,
    periodCode
};
