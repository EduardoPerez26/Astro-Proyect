const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const EXPORT_DIR = path.join(__dirname, '..', 'uploads', 'prepaid-schedules');

const COLORS = {
    navy: '336699',
    green: '007E45',
    header: 'E9E8DF',
    subheader: 'D0D0D0',
    light: 'F5F5F1',
    white: 'FFFFFF',
    black: '000000',
    red: 'FF0000',
    matched: 'E2F0D9',
    warning: 'FFF2CC',
    difference: 'F4CCCC'
};

function ensureExportDir() {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function safeFilePart(value, fallback = 'prepaid-schedule') {
    const safe = String(value || fallback)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 90);
    return safe || fallback;
}

function getScheduleExportPath(schedule) {
    ensureExportDir();
    const title = safeFilePart(schedule?.title);
    const id = Number(schedule?.id || 0);
    return path.join(EXPORT_DIR, `${title}-${id}.xlsx`);
}

function asDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const text = String(value).slice(0, 10);
    const parts = text.split('-').map(Number);
    if (parts.length === 3 && parts.every(Number.isFinite)) {
        return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function money(value) {
    return Number(value || 0);
}

function border(color = 'B7B7B7') {
    return {
        top: { style: 'thin', color: { argb: color } },
        left: { style: 'thin', color: { argb: color } },
        bottom: { style: 'thin', color: { argb: color } },
        right: { style: 'thin', color: { argb: color } }
    };
}

function styleMetadataLabel(cell) {
    cell.font = { name: 'Verdana', size: 10, bold: true, color: { argb: COLORS.navy } };
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
}

function styleMetadataValue(cell) {
    cell.font = { name: 'Verdana', size: 10, color: { argb: COLORS.black } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
}

function styleHeaderRow(row) {
    row.height = 23;
    row.eachCell(cell => {
        cell.font = { name: 'Verdana', size: 10, bold: true, color: { argb: COLORS.black } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
        cell.border = border();
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
}

function styleBodyRow(row) {
    row.height = 19;
    row.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: 'Verdana', size: 9, color: { argb: COLORS.black } };
        cell.border = border('D9D9D9');
        cell.alignment = { vertical: 'middle' };
    });
}

function setTitle(sheet, title, lastColumn) {
    sheet.mergeCells(1, 1, 1, lastColumn);
    const cell = sheet.getCell(1, 1);
    cell.value = title;
    cell.font = { name: 'Verdana', size: 16, bold: true, color: { argb: COLORS.navy } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = border('A6A6A6');
    sheet.getRow(1).height = 30;
}

function addMetadata(sheet, pairs) {
    let rowNumber = 3;
    for (const [label, value] of pairs) {
        sheet.getCell(rowNumber, 1).value = label;
        sheet.getCell(rowNumber, 2).value = value ?? '';
        styleMetadataLabel(sheet.getCell(rowNumber, 1));
        styleMetadataValue(sheet.getCell(rowNumber, 2));
        rowNumber += 1;
    }
    return rowNumber + 1;
}

function monthKey(row) {
    return `${Number(row.period_year)}-${String(Number(row.period_month)).padStart(2, '0')}`;
}

function parseJson(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object' && !Buffer.isBuffer(value)) return value;

    try {
        return JSON.parse(String(value));
    } catch {
        return fallback;
    }
}

function getScheduleEntity(schedule) {
    const metadata = parseJson(schedule?.metadata_json, {});
    return metadata.entity || schedule?.brand || 'QCJ';
}

function displayNegativeAmount(value) {
    const amount = Math.abs(money(value));
    return amount ? -amount : 0;
}

function buildScheduleSheet(workbook, schedule, bills, months) {
    const sheet = workbook.addWorksheet('Prepaid Schedule', {
        views: [{ state: 'frozen', xSplit: 3, ySplit: 8 }],
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
    });

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const headers = [
        'Payee', 'Location', 'Entity', 'GL Acct', 'Exp. To GL Acct', 'Date',
        'Amortization Period', 'Amount Paid', 'Prior Yr End Balance Forward',
        'MO AMORT AMT', ...monthNames, 'YTD Amortization',
        'Ending Prepaid Balance', 'Ending Balance per Store'
    ];
    setTitle(sheet, schedule.title || 'Prepaid Amortization Schedule', headers.length);
    const headerRowNumber = addMetadata(sheet, [
        ['Company name:', schedule.brand || ''],
        ['Report name:', 'Prepaid Amortization Schedule'],
        ['Tax year:', schedule.tax_year || ''],
        ['Schedule period:', `${String(schedule.amortization_start).slice(0, 10)} to ${String(schedule.amortization_end).slice(0, 10)}`]
    ]);

    const headerRow = sheet.getRow(headerRowNumber);
    headerRow.values = headers;
    styleHeaderRow(headerRow);

    const scheduleYear = Number(schedule.schedule_year || new Date().getFullYear());
    const entity = getScheduleEntity(schedule);
    const monthsByBill = new Map();
    for (const row of months) {
        const id = Number(row.bill_id);
        if (!monthsByBill.has(id)) monthsByBill.set(id, []);
        monthsByBill.get(id).push(row);
    }

    const storeTotals = new Map();
    for (const bill of bills) {
        const billMonths = monthsByBill.get(Number(bill.id)) || [];
        const yearAmortization = billMonths
            .filter(month => Number(month.period_year) === scheduleYear)
            .reduce((total, month) => total + money(month.expected_amount), 0);
        const endingBalance = money(bill.amount_paid) - yearAmortization;
        const store = String(bill.store_number || '');
        storeTotals.set(store, (storeTotals.get(store) || 0) + endingBalance);
    }

    let currentRow = headerRowNumber + 1;
    for (const bill of bills) {
        const billMonths = monthsByBill.get(Number(bill.id)) || [];
        const monthValues = Array.from({ length: 12 }, (_, index) => {
            const match = billMonths.find(month => Number(month.period_year) === scheduleYear && Number(month.period_month) === index + 1);
            return match ? money(match.expected_amount) : 0;
        });
        const ytd = monthValues.reduce((sum, value) => sum + value, 0);
        const amountPaid = money(bill.amount_paid);
        const priorBalance = billMonths
            .filter(month => Number(month.period_year) < scheduleYear)
            .reduce((sum, month) => sum - money(month.expected_amount), amountPaid);
        const endingBalance = amountPaid - billMonths
            .filter(month => Number(month.period_year) <= scheduleYear)
            .reduce((sum, month) => sum + money(month.expected_amount), 0);
        const storeEnding = storeTotals.get(String(bill.store_number || '')) || 0;

        const row = sheet.getRow(currentRow);
        row.values = [
            bill.payee || '',
            String(bill.store_number || ''),
            entity,
            bill.prepaid_account || '',
            bill.expense_account || '',
            asDate(bill.bill_date),
            `${String(bill.amortization_start || '').slice(0, 10)} - ${String(bill.amortization_end || '').slice(0, 10)}`,
            amountPaid,
            Math.max(priorBalance, 0),
            money(bill.monthly_amount),
            ...monthValues.map(displayNegativeAmount),
            displayNegativeAmount(ytd),
            Math.max(endingBalance, 0),
            Math.max(storeEnding, 0)
        ];
        styleBodyRow(row);
        row.getCell(6).numFmt = 'mm/dd/yyyy';
        for (let col = 8; col <= headers.length; col += 1) {
            row.getCell(col).numFmt = '$#,##0.00;[Red]($#,##0.00)';
            row.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' };
        }
        currentRow += 1;
    }

    const firstDataRow = headerRowNumber + 1;
    const lastDataRow = currentRow - 1;
    const totalRow = sheet.getRow(currentRow);
    totalRow.getCell(1).value = 'Grand total';
    sheet.mergeCells(currentRow, 1, currentRow, 7);
    for (let col = 1; col <= headers.length; col += 1) {
        const cell = totalRow.getCell(col);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subheader } };
        cell.border = border();
        cell.font = { name: 'Verdana', size: 10, bold: true };
        cell.alignment = { horizontal: col >= 8 ? 'right' : 'left', vertical: 'middle' };
        if (col === 25) {
            cell.value = { formula: totalRow.getCell(24).address };
            cell.numFmt = '$#,##0.00;[Red]($#,##0.00)';
        } else if (col >= 8 && col <= headers.length && lastDataRow >= firstDataRow) {
            const letter = cell.address.replace(/\d+/g, '');
            cell.value = { formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})` };
            cell.numFmt = '$#,##0.00;[Red]($#,##0.00)';
        }
    }

    sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: currentRow - 1, column: headers.length } };
    const widths = [34, 11, 12, 13, 15, 13, 26, 15, 20, 15];
    widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    for (let index = 11; index <= headers.length; index += 1) sheet.getColumn(index).width = 14;
    sheet.properties.defaultRowHeight = 18;
    sheet.headerFooter.oddFooter = '&LPrepaid Schedule&RPage &P of &N';
    return sheet;
}

function buildSourceSheet(workbook, schedule, sourceRows) {
    const headers = ['Posted dt.', 'Doc dt.', 'Doc', 'Memo/Description', 'Department', 'Location', 'Txn No', 'JNL', 'Debit', 'Credit', 'Balance'];
    const sheet = workbook.addWorksheet('Source Bills', {
        views: [{ state: 'frozen', ySplit: 7 }],
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
    });
    setTitle(sheet, `${schedule.source_account || '246000'} - PERSONAL PROPERTY TAX PAYABLE`, headers.length);
    const headerRowNumber = addMetadata(sheet, [
        ['Company name:', schedule.brand || ''],
        ['Report name:', 'General Ledger report'],
        ['Start Date:', asDate(schedule.amortization_start)],
        ['End Date:', asDate(schedule.amortization_end)]
    ]);
    sheet.getCell(5, 2).numFmt = 'mm/dd/yyyy';
    sheet.getCell(6, 2).numFmt = 'mm/dd/yyyy';
    const headerRow = sheet.getRow(headerRowNumber);
    headerRow.values = headers;
    styleHeaderRow(headerRow);

    let rowNumber = headerRowNumber + 1;
    for (const source of sourceRows) {
        const row = sheet.getRow(rowNumber);
        row.values = [
            asDate(source.posted_date), asDate(source.doc_date), source.doc_number || '', source.memo_description || '',
            source.department || '', source.store_number || '', source.txn_no || '', source.journal || '',
            money(source.debit), money(source.credit), money(source.balance)
        ];
        styleBodyRow(row);
        row.getCell(1).numFmt = 'mm/dd/yyyy';
        row.getCell(2).numFmt = 'mm/dd/yyyy';
        [9, 10, 11].forEach(index => { row.getCell(index).numFmt = '$#,##0.00;[Red]($#,##0.00)'; });
        if (!Number(source.include_in_schedule)) {
            row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.warning } }; });
        }
        rowNumber += 1;
    }

    const totalRow = sheet.getRow(rowNumber);
    totalRow.getCell(1).value = `Totals for ${schedule.source_account || '246000'} - PERSONAL PROPERTY TAX PAYABLE`;
    sheet.mergeCells(rowNumber, 1, rowNumber, 8);
    for (let col = 1; col <= headers.length; col += 1) {
        const cell = totalRow.getCell(col);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subheader } };
        cell.border = border();
        cell.font = { name: 'Verdana', size: 10, bold: true };
    }
    [9, 10, 11].forEach(col => {
        const letter = totalRow.getCell(col).address.replace(/\d+/g, '');
        totalRow.getCell(col).value = { formula: `SUM(${letter}${headerRowNumber + 1}:${letter}${rowNumber - 1})` };
        totalRow.getCell(col).numFmt = '$#,##0.00;[Red]($#,##0.00)';
    });

    [13, 13, 24, 62, 14, 12, 12, 9, 14, 14, 15].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: rowNumber - 1, column: headers.length } };
}

function buildValidationSheet(workbook, schedule, months) {
    const headers = ['Period', 'Store', 'Payee', 'Doc', 'Expected', 'GL Actual', 'Difference', 'Status'];
    const sheet = workbook.addWorksheet('Monthly Validation', { views: [{ state: 'frozen', ySplit: 4 }] });
    setTitle(sheet, 'Monthly GL Validation', headers.length);
    sheet.getCell(3, 1).value = 'Schedule:';
    sheet.getCell(3, 2).value = schedule.title || '';
    styleMetadataLabel(sheet.getCell(3, 1));
    styleMetadataValue(sheet.getCell(3, 2));
    const headerRow = sheet.getRow(4);
    headerRow.values = headers;
    styleHeaderRow(headerRow);

    let rowNumber = 5;
    for (const month of months) {
        const row = sheet.getRow(rowNumber);
        row.values = [month.period_code || '', String(month.store_number || ''), month.payee || '', month.doc_number || '',
            money(month.expected_amount), money(month.gl_actual_amount), money(month.difference), month.status || 'PENDING_GL'];
        styleBodyRow(row);
        [5, 6, 7].forEach(index => { row.getCell(index).numFmt = '$#,##0.00;[Red]($#,##0.00)'; });
        const status = String(month.status || '').toUpperCase();
        const fill = status === 'MATCHED' ? COLORS.matched : status === 'PENDING_GL' ? COLORS.warning : COLORS.difference;
        row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        row.getCell(8).font = { name: 'Verdana', size: 9, bold: true };
        rowNumber += 1;
    }
    [12, 11, 34, 24, 15, 15, 15, 16].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, rowNumber - 1), column: headers.length } };
}

async function savePrepaidScheduleWorkbook({ schedule, sourceRows, bills, months }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'XBFS Operations Hub';
    workbook.company = 'XB Franchise Solutions';
    workbook.subject = 'Prepaid PTAX amortization schedule';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.calcProperties.fullCalcOnLoad = true;

    buildScheduleSheet(workbook, schedule, bills, months);
    buildSourceSheet(workbook, schedule, sourceRows);
    buildValidationSheet(workbook, schedule, months);

    const exportPath = getScheduleExportPath(schedule);
    await workbook.xlsx.writeFile(exportPath);
    return {
        path: exportPath,
        filename: path.basename(exportPath)
    };
}

function deleteSavedScheduleWorkbook(schedule) {
    const exportPath = getScheduleExportPath(schedule);
    if (fs.existsSync(exportPath)) fs.unlinkSync(exportPath);
}

module.exports = {
    savePrepaidScheduleWorkbook,
    deleteSavedScheduleWorkbook,
    getScheduleExportPath,
    EXPORT_DIR
};
