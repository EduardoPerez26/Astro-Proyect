// =========================================================
// PREPAID SOURCE / GL PARSER
// Supports GL exports like:
// Posted dt. | Doc dt. | Doc | Memo/Description | Department | Location | Txn No | JNL | Debit | Credit | Balance
// =========================================================

const XLSX = require('xlsx');
const {
    roundMoney,
    toSqlDate,
    inferTaxYearFromText
} = require('./prepaidAmortizationCalculator');

function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeHeader(value) {
    return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseMoney(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return roundMoney(value);

    let text = String(value).trim();
    if (!text) return 0;

    const negative = /^\(.*\)$/.test(text) || /^-/.test(text);
    text = text.replace(/[,$()\s]/g, '').replace(/^-/, '');
    const number = Number(text);
    return Number.isFinite(number) ? roundMoney(negative ? -number : number) : 0;
}

function readWorkbookRows(buffer) {
    const workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellDates: false,
        raw: false
    });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { sheetName: '', rows: [] };

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
        raw: false
    });

    return { sheetName, rows };
}

function findHeaderIndex(rows) {
    return rows.findIndex(row => {
        const headers = row.map(normalizeHeader);
        return headers.includes('posteddt')
            && headers.includes('docdt')
            && headers.includes('doc')
            && headers.includes('memodescription')
            && headers.includes('location')
            && headers.includes('debit')
            && headers.includes('credit');
    });
}

function buildHeaderMap(row) {
    const map = {};

    row.forEach((cell, index) => {
        const header = normalizeHeader(cell);
        if (['posteddt', 'posteddate'].includes(header)) map.postedDate = index;
        if (['docdt', 'docdate'].includes(header)) map.docDate = index;
        if (['doc', 'document'].includes(header)) map.doc = index;
        if (['memodescription', 'memo', 'description'].includes(header)) map.memo = index;
        if (header === 'department') map.department = index;
        if (['location', 'store', 'storenumber'].includes(header)) map.location = index;
        if (['txnno', 'transactionno', 'transactionnumber'].includes(header)) map.txnNo = index;
        if (['jnl', 'journal'].includes(header)) map.journal = index;
        if (header === 'debit') map.debit = index;
        if (header === 'credit') map.credit = index;
        if (header === 'balance') map.balance = index;
    });

    return map;
}

function getCell(row, map, key) {
    const index = map[key];
    return index === undefined ? '' : normalizeText(row[index]);
}

function extractMetadata(rows) {
    const metadata = {};
    rows.slice(0, 10).forEach(row => {
        const key = normalizeText(row[0]).toLowerCase();
        const value = normalizeText(row[1]);
        if (key === 'company name:') metadata.companyName = value;
        if (key === 'report name:') metadata.reportName = value;
        if (key === 'start date:') metadata.reportStartDate = value;
        if (key === 'end date:') metadata.reportEndDate = value;
    });
    return metadata;
}

function extractSourceAccount(rows) {
    for (const row of rows) {
        const match = normalizeText(row[0]).match(/^(\d{4,8})\s*-/);
        if (match) return match[1];
    }
    return '';
}

function extractPayee(memo) {
    const match = normalizeText(memo).match(/Bill\s*-\s*([^:]+):/i);
    return match ? normalizeText(match[1]) : '';
}

function extractStore({ location, doc, memo }) {
    const locationText = normalizeText(location);
    if (/^\d{3,8}$/.test(locationText)) return locationText;

    const docMatch = normalizeText(doc).match(/^(\d{3,8})\b/);
    if (docMatch) return docMatch[1];

    const memoMatch = normalizeText(memo).match(/:\s*(\d{3,8})\b/)
        || normalizeText(memo).match(/\b(\d{3,8})\s+PERSONAL/i);
    return memoMatch ? memoMatch[1] : locationText;
}

function isSkippable(row) {
    const joined = row.map(normalizeText).join(' ').toLowerCase();
    return !joined
        || joined.includes('balance forward')
        || joined.includes('totals for')
        || joined.includes('grand total');
}

function isPaidPtaxBill({ doc, memo, amountPaid }) {
    const text = `${doc} ${memo}`;
    return amountPaid > 0
        && /^Bill\s*-/i.test(memo)
        && /\bPTAX\b|PROPERTY TAX|PERSONAL\s*\/\s*UNSECURED|PERSONAL PROPERTY/i.test(text)
        && /\bPAID\b/i.test(text);
}

function parsePrepaidBillSource(buffer, options = {}) {
    const { sheetName, rows } = readWorkbookRows(buffer);
    const headerIndex = findHeaderIndex(rows);

    if (headerIndex < 0) {
        const error = new Error('The uploaded file does not look like a supported GL report. Header row was not found.');
        error.code = 'PREPAID_SOURCE_HEADER_NOT_FOUND';
        throw error;
    }

    const headerMap = buildHeaderMap(rows[headerIndex]);
    const metadata = extractMetadata(rows);
    const sourceAccount = normalizeText(options.sourceAccount || extractSourceAccount(rows) || '246000');
    const prepaidAccount = normalizeText(options.prepaidAccount || '138500');
    const expenseAccount = normalizeText(options.expenseAccount || '708500');
    const rowsOut = [];
    const skippedRows = [];

    rows.slice(headerIndex + 1).forEach((row, offset) => {
        const sourceRowNumber = headerIndex + offset + 2;
        if (isSkippable(row)) return;

        const doc = getCell(row, headerMap, 'doc');
        const memo = getCell(row, headerMap, 'memo');
        const debit = parseMoney(getCell(row, headerMap, 'debit'));
        const credit = parseMoney(getCell(row, headerMap, 'credit'));
        const amountPaid = debit > 0 ? debit : Math.abs(credit);
        const location = getCell(row, headerMap, 'location');
        const storeNumber = extractStore({ location, doc, memo });
        const taxYear = inferTaxYearFromText(`${doc} ${memo}`, options.taxYear);

        if (!storeNumber || !isPaidPtaxBill({ doc, memo, amountPaid })) {
            skippedRows.push({
                source_row_number: sourceRowNumber,
                reason: 'Not a paid PTAX bill row',
                raw: row
            });
            return;
        }

        rowsOut.push({
            source_row_number: sourceRowNumber,
            posted_date: toSqlDate(getCell(row, headerMap, 'postedDate')),
            doc_date: toSqlDate(getCell(row, headerMap, 'docDate')),
            doc_number: doc,
            memo_description: memo,
            department: getCell(row, headerMap, 'department'),
            store_number: storeNumber,
            txn_no: getCell(row, headerMap, 'txnNo'),
            journal: getCell(row, headerMap, 'journal'),
            debit,
            credit,
            balance: parseMoney(getCell(row, headerMap, 'balance')),
            payee: extractPayee(memo),
            tax_year: taxYear,
            amount_paid: amountPaid,
            source_account: sourceAccount,
            prepaid_account: prepaidAccount,
            expense_account: expenseAccount,
            include_in_schedule: true,
            exception_reason: '',
            raw_json: row
        });
    });

    return {
        sheetName,
        metadata: {
            ...metadata,
            sheetName,
            headerRowNumber: headerIndex + 1,
            sourceAccount,
            prepaidAccount,
            expenseAccount,
            totalRows: rows.length
        },
        rows: rowsOut,
        skippedRows
    };
}

function parseMonthlyGlActuals(buffer) {
    const { sheetName, rows } = readWorkbookRows(buffer);
    const headerIndex = findHeaderIndex(rows);

    if (headerIndex < 0) {
        const error = new Error('The uploaded monthly GL file does not look like a supported GL report.');
        error.code = 'PREPAID_GL_HEADER_NOT_FOUND';
        throw error;
    }

    const headerMap = buildHeaderMap(rows[headerIndex]);
    const metadata = extractMetadata(rows);
    const actualByStore = new Map();
    const details = [];

    rows.slice(headerIndex + 1).forEach((row, offset) => {
        if (isSkippable(row)) return;

        const doc = getCell(row, headerMap, 'doc');
        const memo = getCell(row, headerMap, 'memo');
        const storeNumber = extractStore({
            location: getCell(row, headerMap, 'location'),
            doc,
            memo
        });
        const debit = parseMoney(getCell(row, headerMap, 'debit'));
        const credit = parseMoney(getCell(row, headerMap, 'credit'));
        const signedAmount = roundMoney(debit - credit);
        const actualAmount = roundMoney(Math.abs(signedAmount));

        if (!storeNumber || !actualAmount) return;

        actualByStore.set(
            storeNumber,
            roundMoney((actualByStore.get(storeNumber) || 0) + actualAmount)
        );

        details.push({
            source_row_number: headerIndex + offset + 2,
            posted_date: toSqlDate(getCell(row, headerMap, 'postedDate')),
            doc_date: toSqlDate(getCell(row, headerMap, 'docDate')),
            doc_number: doc,
            memo_description: memo,
            store_number: storeNumber,
            debit,
            credit,
            signed_amount: signedAmount,
            actual_amount: actualAmount,
            raw_json: row
        });
    });

    return { sheetName, metadata, actualByStore, details };
}

module.exports = {
    parsePrepaidBillSource,
    parseMonthlyGlActuals,
    parseMoney,
    normalizeText
};
