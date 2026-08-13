const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

// Normal Property Management schedules are intentionally isolated from
// prepaid schedules, which use backend/uploads/prepaid-schedules.
const uploadRoot = process.env.PROPERTY_MANAGEMENT_SCHEDULE_UPLOAD_DIR
    || (process.env.UPLOAD_FOLDER
        ? path.resolve(__dirname, '..', process.env.UPLOAD_FOLDER)
        : path.join(__dirname, '..', 'uploads'));
const EXPORT_DIR = path.join(uploadRoot, 'schedules');

const COLORS = {
    dark: '1F1F1F',
    charcoal: '404040',
    mediumGray: 'D9D9D9',
    lightGray: 'F2F2F2',
    white: 'FFFFFF',
    black: '000000',
    yellow: 'FFF2D9',
    blue: '4472C4',
    lightBlue: 'EEF4FA',
    magenta: 'C000C0',
    selectedMonth: 'FFF2CC',
    selectedMonthText: '9C5700'
};

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const SCHEDULE_HEADERS = [
    'Entry / Payee',
    'Location',
    'Entity',
    'GL Acct',
    'Reference Info.',
    'STATE',
    'Date',
    'Amount Paid',
    'Prior Yr End Balance Forward',
    'JANUARY PAID',
    'JANUARY COLLECTED',
    'FEBRUARY PAID',
    'FEBRUARY COLLECTED',
    'MARCH PAID',
    'MARCH COLLECTED',
    'APRIL PAID',
    'APRIL COLLECTED',
    'MAY PAID',
    'MAY COLLECTED',
    'JUNE PAID',
    'JUNE COLLECTED',
    'JULY PAID',
    'JULY COLLECTED',
    'AUGUST PAID',
    'AUGUST COLLECTED',
    'SEPTEMBER PAID',
    'SEPTEMBER COLLECTED',
    'OCTOBER PAID',
    'OCTOBER COLLECTED',
    'NOVEMBER PAID',
    'NOVEMBER COLLECTED',
    'DECEMBER PAID',
    'DECEMBER COLLECTED',
    'YTD BAL',
    'YTD BAL PER STORE',
    'QUARTER REVIEW'
];

const PAID_COL_BY_MONTH = {};
const COLLECTED_COL_BY_MONTH = {};
for (let month = 1; month <= 12; month += 1) {
    PAID_COL_BY_MONTH[month] = 9 + 2 * (month - 1);
    COLLECTED_COL_BY_MONTH[month] = 10 + 2 * (month - 1);
}

// 0-based row-array column indexes (mirrors public/js/departments/property-management/property-management.js SCHEDULE_HEADERS).
const COL = {
    ENTRY: 0,
    LOCATION: 1,
    ENTITY: 2,
    GL_ACCT: 3,
    REFERENCE: 4,
    STATE: 5,
    DATE: 6,
    AMOUNT_PAID: 7,
    PRIOR_BALANCE: 8,
    FIRST_MONTH: 9,
    LAST_MONTH: 32,
    YTD_BAL: 33,
    YTD_BAL_PER_STORE: 34,
    QUARTER_REVIEW: 35
};
const LAST_COLUMN = SCHEDULE_HEADERS.length; // 36, Excel column AJ

function ensureExportDir() {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    fs.accessSync(EXPORT_DIR, fs.constants.W_OK);
}

function safeFilePart(value, fallback = 'property-management-schedule') {
    const safe = String(value || fallback)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 90);
    return safe || fallback;
}

function getScheduleExportPath(schedule) {
    const id = Number(schedule?.id || 0);
    const name = safeFilePart(schedule?.nombre);
    return path.join(EXPORT_DIR, `${name}-${id}.xlsx`);
}

function getScheduleExportFilename(schedule) {
    const id = Number(schedule?.id || 0);
    const name = safeFilePart(schedule?.nombre);
    return `${name}-${id}.xlsx`;
}

function money(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function asDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Pure arithmetic port of getScheduleYear()/getLatestScheduleMonth() from
// property-management.js -- no tax-period/regex inference involved, safe to
// duplicate. The fragile Quarter Review calculation is deliberately NOT
// ported here; it stays client-side and its total is passed in already
// computed (see buildScheduleWorkbook's `quarterReviewTotal` param).
function getScheduleYear(rows) {
    const date = rows.flat().find(value => asDate(value));
    const parsed = date ? asDate(date) : null;
    return parsed ? parsed.getFullYear() : new Date().getFullYear();
}

function getLatestScheduleMonth(rows) {
    for (let month = 12; month >= 1; month -= 1) {
        const paidColumn = PAID_COL_BY_MONTH[month];
        const collectedColumn = COLLECTED_COL_BY_MONTH[month];
        const hasData = rows.some(row =>
            money(row[paidColumn]) || money(row[collectedColumn])
        );

        if (hasData) return month;
    }

    return null;
}

function columnLetter(sheet, columnNumber) {
    return sheet.getCell(1, columnNumber).address.replace(/\d+/g, '');
}

function styleMetadataLabel(cell) {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.black } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
}

function styleMetadataValue(cell) {
    cell.font = { name: 'Arial', size: 10, color: { argb: COLORS.black } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
}

function moneyFormat(cell) {
    cell.numFmt = '#,##0.00;(#,##0.00);-';
}

function addMetadataRow(sheet, rowNumber, label, value) {
    sheet.getCell(rowNumber, 1).value = label;
    sheet.getCell(rowNumber, 2).value = value ?? '';
    styleMetadataLabel(sheet.getCell(rowNumber, 1));
    styleMetadataValue(sheet.getCell(rowNumber, 2));
}

function styleMonthRow(row) {
    row.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: COLORS.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.charcoal } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
}

function styleHeaderRow(row) {
    row.height = 32;
    row.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: COLORS.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.dark } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: COLORS.dark } },
            bottom: { style: 'thin', color: { argb: COLORS.dark } },
            right: { style: 'thin', color: { argb: COLORS.mediumGray } }
        };
    });
}

function buildScheduleWorkbook({ rows, name, quarterReviewTotal }) {
    if (!Array.isArray(rows) || !rows.length) {
        throw new Error('The schedule does not have rows to export');
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'XBFS Operations Hub';
    workbook.company = 'XB Franchise Solutions';
    workbook.subject = 'Property Management sales tax schedule';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.calcProperties.fullCalcOnLoad = true;

    const sheet = workbook.addWorksheet('Schedule', {
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    const year = getScheduleYear(rows);
    const entities = Array.from(new Set(rows.map(row => row[COL.ENTITY]).filter(Boolean))).sort();
    const highlightMonth = getLatestScheduleMonth(rows);
    const dropdownMonth = highlightMonth || (new Date().getMonth() + 1);

    addMetadataRow(sheet, 1, 'COMPANY NAME:', 'Quikserve Burger King');
    addMetadataRow(sheet, 2, 'COMPANY:', entities.join(', ') || 'Property Management');
    addMetadataRow(sheet, 3, 'GL ACCOUNT NAME:', 'SALES TAX PAYABLE');
    addMetadataRow(sheet, 4, 'GL ACCOUNT #:', 241000);
    addMetadataRow(sheet, 5, 'YEAR:', year);

    const monthSelectorRow = 6;
    addMetadataRow(sheet, monthSelectorRow, 'Balance as of month:', MONTH_NAMES[dropdownMonth - 1]);
    const monthSelectorCell = sheet.getCell(monthSelectorRow, 2);
    monthSelectorCell.dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`"${MONTH_NAMES.join(',')}"`],
        showErrorMessage: true,
        errorTitle: 'Invalid month',
        error: 'Pick a month from the list.'
    };
    monthSelectorCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.selectedMonth } };
    monthSelectorCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.selectedMonthText } };

    const monthRowNumber = monthSelectorRow + 1;
    const headerRowNumber = monthRowNumber + 1;
    const firstDataRow = headerRowNumber + 1;

    const monthRowValues = new Array(LAST_COLUMN).fill('');
    for (let month = 1; month <= 12; month += 1) {
        // PAID_COL_BY_MONTH/COLLECTED_COL_BY_MONTH are already 0-based indexes
        // into this same array (they mirror SCHEDULE_HEADERS' own positions,
        // e.g. month 1 -> 9/10 = SCHEDULE_HEADERS[9]="JANUARY PAID"), so no
        // "-1" here -- subtracting one shifted every month label left by a
        // column, landing "January" over "Prior Yr End Balance Forward".
        monthRowValues[PAID_COL_BY_MONTH[month]] = MONTH_NAMES[month - 1];
        monthRowValues[COLLECTED_COL_BY_MONTH[month]] = MONTH_NAMES[month - 1];
    }
    monthRowValues[COL.YTD_BAL_PER_STORE] = 'Balance as of selected period';
    sheet.getRow(monthRowNumber).values = monthRowValues;
    styleMonthRow(sheet.getRow(monthRowNumber));

    const headerRow = sheet.getRow(headerRowNumber);
    headerRow.values = SCHEDULE_HEADERS;
    styleHeaderRow(headerRow);

    // Fixed column letters (schedule layout is a static 36-column shape, so
    // these only need to be resolved once, not per row).
    const priorBalLetter = columnLetter(sheet, COL.PRIOR_BALANCE + 1);
    const firstMonthLetter = columnLetter(sheet, COL.FIRST_MONTH + 1);
    const lastMonthLetter = columnLetter(sheet, COL.LAST_MONTH + 1);
    const locationLetter = columnLetter(sheet, COL.LOCATION + 1);
    const ytdBalLetter = columnLetter(sheet, COL.YTD_BAL + 1);
    const monthNameList = `{"${MONTH_NAMES.join('","')}"}`;
    const lastDataRow = firstDataRow + rows.length - 1;

    let currentRow = firstDataRow;
    rows.forEach(sourceRow => {
        const row = sheet.getRow(currentRow);
        const isSummaryRow = sourceRow[COL.ENTRY] === 'Sales Tax';
        const values = new Array(LAST_COLUMN).fill('');

        for (let index = 0; index <= COL.PRIOR_BALANCE; index += 1) {
            const value = sourceRow[index];
            if (index === COL.DATE) {
                values[index] = asDate(value);
            } else if (index === COL.AMOUNT_PAID || index === COL.PRIOR_BALANCE) {
                // Must be a real number, never '' -- these feed the live YTD
                // BAL formula (I{row}+SUMPRODUCT(...)); a text/empty-string
                // cell there makes Excel's "+" throw #VALUE! on every row
                // that doesn't carry its own prior-balance value (i.e. every
                // row except each store's summary row).
                values[index] = money(value);
            } else {
                values[index] = value ?? '';
            }
        }
        for (let index = COL.FIRST_MONTH; index <= COL.LAST_MONTH; index += 1) {
            values[index] = money(sourceRow[index]);
        }
        values[COL.QUARTER_REVIEW] = money(sourceRow[COL.QUARTER_REVIEW]);

        row.values = values;
        row.getCell(COL.DATE + 1).numFmt = 'mm/dd/yyyy';

        // YTD BAL: live formula = prior balance forward + the paid/collected
        // pairs up to (and including) whichever month is picked in the
        // "Balance as of month:" dropdown. At December this sums the full
        // year, reproducing today's static sumRowBalance() exactly.
        row.getCell(COL.YTD_BAL + 1).value = {
            formula: `${priorBalLetter}${currentRow}+SUMPRODUCT((COLUMN(${firstMonthLetter}${currentRow}:${lastMonthLetter}${currentRow})-COLUMN($${firstMonthLetter}$${currentRow})+1<=2*MATCH($B$${monthSelectorRow},${monthNameList},0))*${firstMonthLetter}${currentRow}:${lastMonthLetter}${currentRow})`
        };

        // YTD BAL PER STORE only ever holds a value on one row per store
        // (today, the last row of that store's group) -- only that row gets
        // turned into a live formula, so it never desyncs from the (now
        // reactive) YTD BAL column above.
        if (money(sourceRow[COL.YTD_BAL_PER_STORE])) {
            row.getCell(COL.YTD_BAL_PER_STORE + 1).value = {
                formula: `SUMPRODUCT(($${locationLetter}$${firstDataRow}:$${locationLetter}$${lastDataRow}=${locationLetter}${currentRow})*$${ytdBalLetter}$${firstDataRow}:$${ytdBalLetter}$${lastDataRow})`
            };
        }

        for (let columnIndex = 1; columnIndex <= LAST_COLUMN; columnIndex += 1) {
            const cell = row.getCell(columnIndex);
            cell.font = {
                name: 'Arial',
                size: 8,
                bold: isSummaryRow,
                color: {
                    argb: (columnIndex === COL.ENTITY + 1 || columnIndex === COL.GL_ACCT + 1)
                        ? COLORS.magenta
                        : COLORS.black
                }
            };
            cell.border = { bottom: { style: 'thin', color: { argb: COLORS.mediumGray } } };
            cell.alignment = { vertical: 'middle', horizontal: columnIndex > COL.PRIOR_BALANCE ? 'right' : 'left' };

            if (columnIndex - 1 >= COL.AMOUNT_PAID) moneyFormat(cell);

            if (isSummaryRow) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightGray } };
            }

            const isHighlightedMonthColumn = highlightMonth && (
                columnIndex === PAID_COL_BY_MONTH[highlightMonth] ||
                columnIndex === COLLECTED_COL_BY_MONTH[highlightMonth]
            );
            if (isHighlightedMonthColumn) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.selectedMonth } };
                cell.font = { ...cell.font, color: { argb: COLORS.selectedMonthText } };
            }

            if (columnIndex === COL.YTD_BAL_PER_STORE + 1) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightBlue } };
            }
        }

        currentRow += 1;
    });

    const totalsRow = sheet.getRow(currentRow);
    totalsRow.getCell(1).value = 'TOTALS';
    sheet.mergeCells(currentRow, 1, currentRow, COL.PRIOR_BALANCE + 1);

    for (let columnIndex = COL.FIRST_MONTH + 1; columnIndex <= COL.YTD_BAL_PER_STORE + 1; columnIndex += 1) {
        const letter = columnLetter(sheet, columnIndex);
        totalsRow.getCell(columnIndex).value = { formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})` };
    }
    // QUARTER REVIEW cannot be a plain column SUM -- one row per store holds
    // a Prior Yr Balance Forward reconciliation rather than a true
    // quarter-review figure (see property-management.js applyPriorYearBalanceForwardReview).
    // The correct total is computed client-side (getScheduleQuarterReviewTotal)
    // and passed in as a plain, non-reactive value.
    totalsRow.getCell(COL.QUARTER_REVIEW + 1).value = money(quarterReviewTotal);

    totalsRow.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: COLORS.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.dark } };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.border = { top: { style: 'thin', color: { argb: COLORS.dark } } };
    });
    totalsRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    for (let columnIndex = COL.AMOUNT_PAID + 1; columnIndex <= LAST_COLUMN; columnIndex += 1) {
        moneyFormat(totalsRow.getCell(columnIndex));
    }

    sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: headerRowNumber }];
    sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: lastDataRow, column: LAST_COLUMN } };

    const widths = [40, 10, 8, 9, 30, 6, 11, 12, 16];
    widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    for (let index = COL.FIRST_MONTH + 1; index <= LAST_COLUMN; index += 1) sheet.getColumn(index).width = 14;
    sheet.getColumn(COL.GL_ACCT + 1).eachCell({ includeEmpty: true }, cell => { cell.numFmt = 'General'; });

    return workbook;
}

async function savePropertyManagementScheduleWorkbook({ schedule, data }) {
    const workbook = buildScheduleWorkbook({
        rows: Array.isArray(data?.rows) ? data.rows : [],
        name: schedule?.nombre,
        quarterReviewTotal: data?.quarterReviewTotal
    });

    const exportPath = getScheduleExportPath(schedule);
    const filename = getScheduleExportFilename(schedule);

    try {
        ensureExportDir();
        await workbook.xlsx.writeFile(exportPath);
        return { path: exportPath, filename, persisted: true };
    } catch (error) {
        if (!['EACCES', 'EPERM', 'EROFS'].includes(error.code)) {
            throw error;
        }

        console.warn(
            `Property Management schedule workbook could not be written to ${exportPath}; using in-memory download buffer instead:`,
            error.message
        );
        const buffer = await workbook.xlsx.writeBuffer();
        return { path: null, filename, buffer: Buffer.from(buffer), persisted: false, write_error: error.message };
    }
}

// Stateless counterpart for schedules that were never saved (no id, no
// lifecycle to hang a cached file off of) -- always streams from memory,
// never touches disk, so there is nothing to leak or race on.
async function buildScheduleWorkbookBuffer({ rows, name, quarterReviewTotal }) {
    const workbook = buildScheduleWorkbook({ rows, name, quarterReviewTotal });
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${safeFilePart(name)}.xlsx`;
    return { buffer: Buffer.from(buffer), filename };
}

function deleteSavedPropertyManagementScheduleWorkbook(schedule) {
    const exportPath = getScheduleExportPath(schedule);
    if (fs.existsSync(exportPath)) fs.unlinkSync(exportPath);
}

module.exports = {
    EXPORT_DIR,
    getScheduleExportPath,
    getScheduleExportFilename,
    savePropertyManagementScheduleWorkbook,
    buildScheduleWorkbookBuffer,
    deleteSavedPropertyManagementScheduleWorkbook
};
