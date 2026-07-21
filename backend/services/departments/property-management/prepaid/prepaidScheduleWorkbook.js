const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const uploadRoot = process.env.PREPAID_SCHEDULE_UPLOAD_DIR
    || (process.env.UPLOAD_FOLDER
        ? path.resolve(__dirname, '..', process.env.UPLOAD_FOLDER)
        : path.join(__dirname, '..', 'uploads'));
const EXPORT_DIR = path.join(uploadRoot, 'prepaid-schedules');

const COLORS = {
    charcoal: '404040',
    charcoalDark: '262626',
    dark: '1F1F1F',
    mediumGray: 'D9D9D9',
    lightGray: 'F2F2F2',
    softGray: 'F8F8F8',
    white: 'FFFFFF',
    black: '000000',
    red: 'FF0000',
    blue: '0070C0',
    purple: '7030A0',
    yellow: 'FFFF00',
    selectedMonth: 'FFF2CC',
    selectedMonthText: '9C5700',
    lightBlueBorder: '5B9BD5',
    softBlueBorder: 'BDD7EE',
    matched: 'E2F0D9',
    warning: 'FFF2CC',
    difference: 'F4CCCC'
};

function ensureExportDir() {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    fs.accessSync(EXPORT_DIR, fs.constants.W_OK);
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
    const title = safeFilePart(schedule?.title);
    const id = Number(schedule?.id || 0);
    return path.join(EXPORT_DIR, `${title}-${id}.xlsx`);
}

function getScheduleExportFilename(schedule) {
    const title = safeFilePart(schedule?.title);
    const id = Number(schedule?.id || 0);
    return `${title}-${id}.xlsx`;
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

function buildStoreValidationRows(months = []) {
    const groups = new Map();

    for (const row of months) {
        const key = [
            Number(row.period_year || 0),
            Number(row.period_month || 0),
            String(row.store_number || '').trim()
        ].join('|');

        if (!groups.has(key)) {
            groups.set(key, {
                rows: [],
                payees: new Set(),
                documents: new Set()
            });
        }

        const group = groups.get(key);
        group.rows.push(row);

        if (row.payee) {
            group.payees.add(String(row.payee).trim());
        }

        if (row.doc_number) {
            group.documents.add(
                String(row.doc_number).trim()
            );
        }
    }

    return Array.from(groups.values())
        .map(group => {
            const rows = group.rows;
            const first = rows[0] || {};

            const expected = money(
                rows.reduce(
                    (sum, row) =>
                        sum + money(row.expected_amount),
                    0
                )
            );

            const actual = money(
                rows.reduce(
                    (sum, row) =>
                        sum + money(row.gl_actual_amount),
                    0
                )
            );

            const difference = money(actual - expected);

            const statuses = rows.map(
                row => String(
                    row.status || 'PENDING_GL'
                ).toUpperCase()
            );

            let status = 'MATCHED';

            if (statuses.includes('MISSING_GL')) {
                status = 'MISSING_GL';
            } else if (statuses.includes('DIFFERENCE')) {
                status = 'DIFFERENCE';
            } else if (statuses.includes('PENDING_GL')) {
                status = 'PENDING_GL';
            }

            const payees = Array.from(group.payees);
            const documents =
                Array.from(group.documents);

            return {
                ...first,
                bill_count: rows.length,
                payee: payees.length === 1
                    ? payees[0]
                    : `${payees.length} payees`,
                doc_number: documents.length <= 2
                    ? documents.join(' / ')
                    : `${documents.length} bills`,
                expected_amount: expected,
                gl_actual_amount: actual,
                difference,
                status
            };
        })
        .sort((a, b) =>
            Number(a.period_year) - Number(b.period_year)
            || Number(a.period_month) - Number(b.period_month)
            || String(a.store_number).localeCompare(
                String(b.store_number),
                undefined,
                { numeric: true }
            )
        );
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
    cell.font = {
        name: 'Arial',
        size: 10,
        bold: true,
        color: { argb: COLORS.black }
    };
    cell.alignment = {
        horizontal: 'right',
        vertical: 'middle'
    };
}

function styleMetadataValue(cell) {
    cell.font = {
        name: 'Arial',
        size: 10,
        color: { argb: COLORS.black }
    };
    cell.alignment = {
        horizontal: 'left',
        vertical: 'middle'
    };
}

function styleHeaderRow(row) {
    row.height = 28;

    row.eachCell({ includeEmpty: true }, cell => {
        cell.font = {
            name: 'Arial',
            size: 8,
            bold: true,
            color: { argb: COLORS.white }
        };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: COLORS.charcoal }
        };
        cell.border = {
            top: {
                style: 'thin',
                color: { argb: COLORS.charcoalDark }
            },
            bottom: {
                style: 'thin',
                color: { argb: COLORS.charcoalDark }
            },
            right: {
                style: 'thin',
                color: { argb: '707070' }
            }
        };
        cell.alignment = {
            horizontal: 'center',
            vertical: 'middle',
            wrapText: true
        };
    });
}

function styleBodyRow(row) {
    row.height = 18;

    row.eachCell({ includeEmpty: true }, cell => {
        cell.font = {
            name: 'Arial',
            size: 8,
            color: { argb: COLORS.black }
        };
        cell.border = {
            bottom: {
                style: 'thin',
                color: { argb: COLORS.softBlueBorder }
            }
        };
        cell.alignment = {
            vertical: 'middle'
        };
    });
}

function setTitle(sheet, title, lastColumn) {
    sheet.mergeCells(1, 1, 1, lastColumn);

    const cell = sheet.getCell(1, 1);
    cell.value = title;
    cell.font = {
        name: 'Arial',
        size: 14,
        bold: true,
        color: { argb: COLORS.white }
    };
    cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.charcoal }
    };
    cell.alignment = {
        horizontal: 'center',
        vertical: 'middle'
    };
    cell.border = border(COLORS.charcoalDark);

    sheet.getRow(1).height = 28;
}

function getSelectedMonth(schedule) {
    const endDate = asDate(schedule?.amortization_end);

    if (endDate) {
        return endDate.getUTCMonth() + 1;
    }

    return new Date().getMonth() + 1;
}

function setReferenceMoneyFormat(cell) {
    cell.numFmt = '#,##0.00;[Red](#,##0.00);-';
}

function styleScheduleHeader(headerRow, selectedMonthColumn) {
    styleHeaderRow(headerRow);

    const selectedCell = headerRow.getCell(selectedMonthColumn);
    selectedCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.selectedMonth }
    };
    selectedCell.font = {
        name: 'Arial',
        size: 8,
        bold: true,
        color: { argb: COLORS.selectedMonthText }
    };
}

function styleScheduleDataRow(
    row,
    selectedMonthColumn,
    lastColumn
) {
    styleBodyRow(row);

    for (let col = 1; col <= lastColumn; col += 1) {
        const cell = row.getCell(col);

        if (col >= 8) {
            setReferenceMoneyFormat(cell);
            cell.alignment = {
                horizontal: 'right',
                vertical: 'middle'
            };
        }
    }

    const amountPaidCell = row.getCell(8);
    amountPaidCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.lightGrayGray }
    };
    amountPaidCell.font = {
        name: 'Arial',
        size: 8,
        bold: true,
        color: { argb: COLORS.blue }
    };

    const priorBalanceCell = row.getCell(9);
    priorBalanceCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.mediumGray }
    };
    priorBalanceCell.font = {
        name: 'Arial',
        size: 8,
        bold: true,
        color: {
            argb: money(priorBalanceCell.value) < 0
                ? COLORS.red
                : COLORS.black
        }
    };

    const monthlyAmountCell = row.getCell(10);
    monthlyAmountCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.lightGrayGray }
    };

    for (let col = 11; col <= 22; col += 1) {
        row.getCell(col).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: {
                argb: col === selectedMonthColumn
                    ? COLORS.selectedMonth
                    : COLORS.softGray
            }
        };

        if (col === selectedMonthColumn) {
            row.getCell(col).font = {
                name: 'Arial',
                size: 8,
                color: { argb: COLORS.selectedMonthText }
            };
        }
    }

    for (let col = 23; col <= lastColumn; col += 1) {
        row.getCell(col).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: COLORS.mediumGray }
        };
    }
}

function styleReferenceTotalRow(
    row,
    selectedMonthColumn,
    lastColumn
) {
    row.height = 20;

    for (let col = 1; col <= lastColumn; col += 1) {
        const cell = row.getCell(col);

        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: {
                argb: col === selectedMonthColumn
                    ? COLORS.selectedMonth
                    : COLORS.charcoal
            }
        };
        cell.border = border(COLORS.charcoalDark);
        cell.font = {
            name: 'Arial',
            size: 8,
            bold: true,
            color: {
                argb: col === selectedMonthColumn
                    ? COLORS.selectedMonthText
                    : COLORS.white
            }
        };
        cell.alignment = {
            horizontal: col >= 8 ? 'right' : 'left',
            vertical: 'middle'
        };

        if (col >= 8) {
            setReferenceMoneyFormat(cell);
        }
    }
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

function getBillEntity(schedule, bill) {
    return bill?.entity_code || bill?.entity || getScheduleEntity(schedule);
}

function compareBillsForSchedule(schedule) {
    return (a, b) => String(getBillEntity(schedule, a)).localeCompare(String(getBillEntity(schedule, b)), undefined, { numeric: true, sensitivity: 'base' })
        || String(a.store_number || '').localeCompare(String(b.store_number || ''), undefined, { numeric: true, sensitivity: 'base' })
        || String(a.payee || '').localeCompare(String(b.payee || ''), undefined, { sensitivity: 'base' })
        || String(a.doc_number || '').localeCompare(String(b.doc_number || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function displayNegativeAmount(value) {
    const amount = Math.abs(money(value));
    return amount ? -amount : 0;
}

function buildScheduleSheet(workbook, schedule, bills, months) {
    const sheet = workbook.addWorksheet('Prepaid Schedule', {
        views: [{ state: 'frozen', xSplit: 3, ySplit: 8, showGridLines: true }],
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

    const selectedMonth = getSelectedMonth(schedule);
    const selectedMonthColumn = 10 + selectedMonth;

    styleScheduleHeader(
        headerRow,
        selectedMonthColumn
    );

    const scheduleYear = Number(schedule.schedule_year || new Date().getFullYear());
    const monthsByBill = new Map();
    for (const row of months) {
        const id = Number(row.bill_id);
        if (!monthsByBill.has(id)) monthsByBill.set(id, []);
        monthsByBill.get(id).push(row);
    }

    const storeTotals = new Map();
    const sortedBills = [...bills].sort(compareBillsForSchedule(schedule));

    for (const bill of sortedBills) {
        const billMonths = monthsByBill.get(Number(bill.id)) || [];
        const yearAmortization = billMonths
            .filter(month => Number(month.period_year) === scheduleYear)
            .reduce((total, month) => total + money(month.expected_amount), 0);
        const endingBalance = money(bill.amount_paid) - yearAmortization;
        const store = String(bill.store_number || '');
        storeTotals.set(store, (storeTotals.get(store) || 0) + endingBalance);
    }

    let currentRow = headerRowNumber + 1;
    let previousEntity = null;
    for (const bill of sortedBills) {
        const entity = getBillEntity(schedule, bill);
        if (entity !== previousEntity) {
            const entityRow = sheet.getRow(currentRow);
            entityRow.getCell(1).value = `Entity: ${entity}`;
            sheet.mergeCells(currentRow, 1, currentRow, headers.length);
            entityRow.eachCell({ includeEmpty: true }, cell => {
                cell.font = {
                    name: 'Arial',
                    size: 8,
                    bold: true,
                    color: { argb: COLORS.purple }
                };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: COLORS.lightGrayGray }
                };
                cell.border = {
                    bottom: {
                        style: 'thin',
                        color: { argb: COLORS.softBlueBorder }
                    }
                };
            });
            previousEntity = entity;
            currentRow += 1;
        }

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
        const isCloseout = String(bill.amortization_mode || '').toUpperCase() === 'CLOSEOUT';

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
            isCloseout ? null : money(bill.monthly_amount),
            ...monthValues.map(displayNegativeAmount),
            displayNegativeAmount(ytd),
            Math.max(endingBalance, 0),
            Math.max(storeEnding, 0)
        ];
        styleScheduleDataRow(
            row,
            selectedMonthColumn,
            headers.length
        );
        row.getCell(6).numFmt = 'mm/dd/yyyy';

        currentRow += 1;
    }

    const firstDataRow = headerRowNumber + 1;
    const lastDataRow = currentRow - 1;
    const totalRow = sheet.getRow(currentRow);
    totalRow.getCell(1).value = 'Grand total';
    sheet.mergeCells(currentRow, 1, currentRow, 7);
    styleReferenceTotalRow(
        totalRow,
        selectedMonthColumn,
        headers.length
    );

    for (let col = 1; col <= headers.length; col += 1) {
        const cell = totalRow.getCell(col);

        if (col === 25) {
            cell.value = {
                formula: totalRow.getCell(24).address
            };
            setReferenceMoneyFormat(cell);
        } else if (
            col >= 8
            && col <= headers.length
            && lastDataRow >= firstDataRow
        ) {
            const letter =
                cell.address.replace(/\d+/g, '');

            cell.value = {
                formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`
            };
            setReferenceMoneyFormat(cell);
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
        views: [{ state: 'frozen', ySplit: 7, showGridLines: true }],
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
        [9, 10, 11].forEach(index => {
            setReferenceMoneyFormat(
                row.getCell(index)
            );
        });
        if (!Number(source.include_in_schedule)) {
            row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.warning } }; });
        }
        rowNumber += 1;
    }

    const totalRow = sheet.getRow(rowNumber);
    totalRow.getCell(1).value = `Totals for ${schedule.source_account || '246000'} - PERSONAL PROPERTY TAX PAYABLE`;
    sheet.mergeCells(rowNumber, 1, rowNumber, 8);
    styleReferenceTotalRow(
        totalRow,
        -1,
        headers.length
    );

    [9, 10, 11].forEach(col => {
        const letter =
            totalRow.getCell(col)
                .address.replace(/\d+/g, '');

        totalRow.getCell(col).value = {
            formula: `SUM(${letter}${headerRowNumber + 1}:${letter}${rowNumber - 1})`
        };
        setReferenceMoneyFormat(
            totalRow.getCell(col)
        );
    });

    [13, 13, 24, 62, 14, 12, 12, 9, 14, 14, 15].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: rowNumber - 1, column: headers.length } };
}

function buildValidationSheet(workbook, schedule, months) {
    const headers = ['Period', 'Store', 'Payee', 'Doc', 'Expected', 'GL Actual', 'Difference', 'Status'];
    const sheet = workbook.addWorksheet('Monthly Validation', {
        views: [{
            state: 'frozen',
            ySplit: 4,
            showGridLines: true
        }]
    });
    setTitle(sheet, 'Monthly GL Validation', headers.length);
    sheet.getCell(3, 1).value = 'Schedule:';
    sheet.getCell(3, 2).value = schedule.title || '';
    styleMetadataLabel(sheet.getCell(3, 1));
    styleMetadataValue(sheet.getCell(3, 2));
    const headerRow = sheet.getRow(4);
    headerRow.values = headers;
    styleHeaderRow(headerRow);

    const validationRows = buildStoreValidationRows(months);

    let rowNumber = 5;
    for (const month of validationRows) {
        const row = sheet.getRow(rowNumber);
        row.values = [month.period_code || '', String(month.store_number || ''), month.payee || '', month.doc_number || '',
            money(month.expected_amount), money(month.gl_actual_amount), money(month.difference), month.status || 'PENDING_GL'];
        styleBodyRow(row);
        [5, 6, 7].forEach(index => {
            setReferenceMoneyFormat(
                row.getCell(index)
            );
        });
        const status = String(month.status || '').toUpperCase();
        const fill = status === 'MATCHED' ? COLORS.matched : status === 'PENDING_GL' ? COLORS.warning : COLORS.difference;
        row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        row.getCell(8).font = { name: 'Arial', size: 9, bold: true };
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
    const filename = getScheduleExportFilename(schedule);

    try {
        ensureExportDir();
        await workbook.xlsx.writeFile(exportPath);
        return {
            path: exportPath,
            filename,
            persisted: true
        };
    } catch (error) {
        if (!['EACCES', 'EPERM', 'EROFS'].includes(error.code)) {
            throw error;
        }

        console.warn(
            `Prepaid workbook could not be written to ${exportPath}; using in-memory download buffer instead:`,
            error.message
        );
        const buffer = await workbook.xlsx.writeBuffer();
        return {
            path: null,
            filename,
            buffer: Buffer.from(buffer),
            persisted: false,
            write_error: error.message
        };
    }
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
