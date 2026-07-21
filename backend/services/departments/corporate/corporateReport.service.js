const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const { pool } = require('../../../config/database');
const { parseJson } = require('./corporatePlatform.service');
const { emailStatus, sendEmail } = require('../../email.service');

const REPORT_OUTPUT_DIR = process.env.CORPORATE_REPORT_OUTPUT_DIR
    ? path.resolve(process.env.CORPORATE_REPORT_OUTPUT_DIR)
    : path.join(__dirname, '..', 'generated', 'reports');

function ensureReportDirectory() {
    fs.mkdirSync(REPORT_OUTPUT_DIR, { recursive: true });
    fs.accessSync(REPORT_OUTPUT_DIR, fs.constants.W_OK);
}

function safeCell(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value)) return '[binary]';
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
}

function normalizeRows(rows) {
    return rows.map(row => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, safeCell(value)])
    ));
}

async function buildReportDataset(report) {
    const type = String(report.report_type || 'administrative_activity');
    const filters = parseJson(report.filters_json, {});
    const limit = Math.min(Math.max(Number(filters.limit || 1000), 1), 5000);

    if (type === 'permissions_changes') {
        const [rows] = await pool.query(
            `SELECT a.created_at,
                    a.action_name,
                    a.resource_type,
                    a.resource_id,
                    u.nombre_completo AS actor,
                    d.nombre AS department,
                    a.request_id,
                    a.before_json,
                    a.after_json
             FROM auditoria_operativa a
             LEFT JOIN usuarios u ON u.id = a.usuario_id
             LEFT JOIN departamentos d ON d.id = a.departamento_id
             WHERE a.action_name LIKE '%permission%'
                OR a.resource_type IN ('permission', 'user_permissions')
             ORDER BY a.created_at DESC
             LIMIT ?`,
            [limit]
        );
        return { title: 'Permission changes', rows: normalizeRows(rows) };
    }

    if (type === 'integration_health') {
        const [rows] = await pool.query(
            `SELECT r.created_at,
                    r.provider,
                    r.operation,
                    r.status,
                    r.records_processed,
                    r.warnings_count,
                    r.errors_count,
                    r.started_at,
                    r.completed_at,
                    r.summary,
                    u.nombre_completo AS requested_by
             FROM corporate_integration_runs r
             LEFT JOIN usuarios u ON u.id = r.requested_by
             ORDER BY r.created_at DESC
             LIMIT ?`,
            [limit]
        );
        return { title: 'Integration health', rows: normalizeRows(rows) };
    }

    const [rows] = await pool.query(
        `SELECT a.created_at,
                u.nombre_completo AS actor,
                d.nombre AS department,
                a.action_name,
                a.resource_type,
                a.resource_id,
                a.request_id,
                a.ip_address,
                a.metadata_json
         FROM auditoria_operativa a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         LEFT JOIN departamentos d ON d.id = a.departamento_id
         ORDER BY a.created_at DESC
         LIMIT ?`,
        [limit]
    );
    return { title: 'Administrative activity', rows: normalizeRows(rows) };
}

function csvEscape(value) {
    const text = String(safeCell(value));
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function createCsv(dataset) {
    const columns = dataset.rows.length ? Object.keys(dataset.rows[0]) : ['message'];
    const rows = dataset.rows.length ? dataset.rows : [{ message: 'No records matched this report.' }];
    return Buffer.from([
        columns.map(csvEscape).join(','),
        ...rows.map(row => columns.map(column => csvEscape(row[column])).join(','))
    ].join('\n'), 'utf8');
}

async function createXlsx(dataset) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'XBFS Operations Hub';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Report');
    const rows = dataset.rows.length ? dataset.rows : [{ message: 'No records matched this report.' }];
    const columns = Object.keys(rows[0]);

    worksheet.columns = columns.map(column => ({
        header: column.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
        key: column,
        width: Math.min(Math.max(column.length + 4, 14), 42)
    }));
    rows.forEach(row => worksheet.addRow(row));
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).height = 22;
    worksheet.autoFilter = { from: 'A1', to: worksheet.getRow(1).getCell(columns.length).address };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    return Buffer.from(await workbook.xlsx.writeBuffer());
}

function createPdf(dataset) {
    return new Promise((resolve, reject) => {
        const document = new PDFDocument({ size: 'LETTER', margin: 42, bufferPages: true });
        const chunks = [];
        document.on('data', chunk => chunks.push(chunk));
        document.on('error', reject);
        document.on('end', () => resolve(Buffer.concat(chunks)));

        document.fontSize(18).text(dataset.title || 'Corporate report');
        document.moveDown(0.25);
        document.fontSize(9).fillColor('#666').text(`Generated ${new Date().toLocaleString('en-US')}`);
        document.moveDown();
        document.fillColor('#111');

        const rows = dataset.rows.length ? dataset.rows : [{ message: 'No records matched this report.' }];
        rows.slice(0, 1000).forEach((row, index) => {
            if (document.y > 700) document.addPage();
            document.fontSize(9).font('Helvetica-Bold').text(`#${index + 1}`, { continued: false });
            document.font('Helvetica');
            Object.entries(row).forEach(([key, value]) => {
                const line = `${key.replace(/_/g, ' ')}: ${String(value ?? '')}`;
                document.fontSize(8).text(line, { width: 520 });
            });
            document.moveDown(0.5);
            document.moveTo(42, document.y).lineTo(570, document.y).strokeColor('#dddddd').stroke();
            document.moveDown(0.5);
        });

        if (dataset.rows.length > 1000) {
            document.addPage();
            document.fontSize(9).text(`The PDF was limited to 1,000 of ${dataset.rows.length} rows. Use CSV or XLSX for the complete dataset.`);
        }
        document.end();
    });
}

async function sendReport(report, file) {
    const status = emailStatus();
    if (!status.ready) return { delivered: false, reason: 'Email delivery is not configured' };

    const recipients = parseJson(report.recipients_json, []);
    if (!recipients.length) return { delivered: false, reason: 'No recipients configured' };

    return sendEmail({
        to: recipients,
        subject: `[XBFS] ${report.name}`,
        text: `Attached is the scheduled ${report.name} report generated by XBFS Operations Hub.`,
        attachments: [{ filename: file.filename, content: file.buffer, format: file.format }]
    });
}

async function generateReportFile(report) {
    ensureReportDirectory();
    const dataset = await buildReportDataset(report);
    const format = ['csv', 'xlsx', 'pdf'].includes(String(report.format))
        ? String(report.format)
        : 'csv';
    const buffer = format === 'xlsx'
        ? await createXlsx(dataset)
        : format === 'pdf'
            ? await createPdf(dataset)
            : createCsv(dataset);
    const filename = `corporate-report-${Number(report.id)}-latest.${format}`;
    const outputPath = path.join(REPORT_OUTPUT_DIR, filename);
    fs.writeFileSync(outputPath, buffer, { mode: 0o600 });

    return { dataset, format, buffer, filename, outputPath };
}

async function runScheduledReport(report) {
    try {
        const file = await generateReportFile(report);
        const delivery = await sendReport(report, file);
        return {
            success: true,
            status: delivery.delivered ? 'sent' : 'generated',
            outputPath: file.outputPath,
            filename: file.filename,
            records: file.dataset.rows.length,
            delivered: delivery.delivered,
            message: delivery.delivered
                ? 'Report generated and sent.'
                : `Report generated. ${delivery.reason}.`
        };
    } catch (error) {
        return {
            success: false,
            status: 'failed',
            error: error.message,
            message: 'Report generation or delivery failed.'
        };
    }
}

function reportPath(reportId, format) {
    const safeFormat = ['csv', 'xlsx', 'pdf'].includes(String(format)) ? String(format) : 'csv';
    return path.join(REPORT_OUTPUT_DIR, `corporate-report-${Number(reportId)}-latest.${safeFormat}`);
}

module.exports = {
    REPORT_OUTPUT_DIR,
    buildReportDataset,
    generateReportFile,
    runScheduledReport,
    reportPath
};
