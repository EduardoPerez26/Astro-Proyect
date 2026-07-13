const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

// Normal Property Management schedules are intentionally isolated from
// prepaid schedules, which use backend/uploads/prepaid-schedules.
const EXPORT_DIR = path.join(__dirname, '..', 'uploads', 'schedules');

function ensureExportDir() {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function safeFilePart(value, fallback = 'property-management-schedule') {
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
    const id = Number(schedule?.id || 0);
    const name = safeFilePart(schedule?.nombre);
    return path.join(EXPORT_DIR, `${name}-${id}.xlsx`);
}

function normalizeRows(data) {
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const headers = Array.isArray(data?.headers) ? data.headers : [];
    return { rows, headers };
}

function styleHeader(row) {
    row.height = 24;
    row.eachCell(cell => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF336699' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
        };
    });
}

function styleBody(row) {
    row.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: 'Arial', size: 9 };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
        };
    });
}

function addRows(sheet, headers, rows) {
    if (headers.length) {
        const headerRow = sheet.addRow(headers);
        styleHeader(headerRow);
    }

    if (!rows.length) {
        const row = sheet.addRow(['No rows saved for this schedule']);
        styleBody(row);
        return;
    }

    for (const sourceRow of rows) {
        let values;
        if (Array.isArray(sourceRow)) {
            values = sourceRow;
        } else if (headers.length) {
            values = headers.map(header => sourceRow?.[header] ?? '');
        } else {
            values = Object.values(sourceRow || {});
        }
        const row = sheet.addRow(values);
        styleBody(row);
    }

    const columnCount = Math.max(headers.length, ...rows.map(row => Array.isArray(row) ? row.length : Object.keys(row || {}).length));
    for (let column = 1; column <= columnCount; column += 1) {
        let maxLength = 10;
        sheet.getColumn(column).eachCell({ includeEmpty: true }, cell => {
            const value = cell.value == null ? '' : String(cell.value);
            maxLength = Math.max(maxLength, Math.min(value.length + 2, 45));
        });
        sheet.getColumn(column).width = maxLength;
    }
}

async function savePropertyManagementScheduleWorkbook({ schedule, data }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'XBFS Operations Hub';
    workbook.company = 'XB Franchise Solutions';
    workbook.subject = 'Property Management schedule';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet('Schedule', {
        views: [{ state: 'frozen', ySplit: 1 }],
        pageSetup: {
            orientation: 'landscape',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0
        }
    });

    const { rows, headers } = normalizeRows(data);
    addRows(sheet, headers, rows);

    if (headers.length) {
        sheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: Math.max(1, rows.length + 1), column: headers.length }
        };
    }

    const exportPath = getScheduleExportPath(schedule);
    await workbook.xlsx.writeFile(exportPath);

    return {
        path: exportPath,
        filename: path.basename(exportPath)
    };
}

function deleteSavedPropertyManagementScheduleWorkbook(schedule) {
    const exportPath = getScheduleExportPath(schedule);
    if (fs.existsSync(exportPath)) fs.unlinkSync(exportPath);
}

module.exports = {
    EXPORT_DIR,
    getScheduleExportPath,
    savePropertyManagementScheduleWorkbook,
    deleteSavedPropertyManagementScheduleWorkbook
};
