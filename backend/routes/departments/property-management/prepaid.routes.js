const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { pool } = require('../../../config/database');
const {
    verificarToken,
    checkPermission,
    requireDepartment
} = require('../../../middleware/auth.middleware');
const {
    parsePrepaidBillSource,
    parseMonthlyGlActuals,
    normalizeText
} = require('../../../services/departments/property-management/prepaid/prepaidBillSourceParser');
const {
    savePrepaidScheduleWorkbook,
    deleteSavedScheduleWorkbook
} = require('../../../services/departments/property-management/prepaid/prepaidScheduleWorkbook');
const {
    calculateBillAmortization,
    defaultAmortizationPeriod,
    inferTaxYearFromText,
    parseDate,
    toSqlDate,
    periodCode,
    roundMoney
} = require('../../../services/departments/property-management/prepaid/prepaidAmortizationCalculator');
const {
    calculateBillAmortizationWithCloseout
} = require('../../../services/departments/property-management/prepaid/prepaidCloseoutCalculator');

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Number(process.env.PREPAID_FILE_SIZE_MB || process.env.MAX_FILE_SIZE_MB || 75) * 1024 * 1024 }
});

const draftSchedules = new Map();
let nextDraftScheduleId = -1;
let nextDraftRowId = -1;
let nextDraftBillId = -1;
let nextDraftMonthId = -1;

const access = (action = 'ver') => [
    verificarToken,
    checkPermission('propertyManagement', action),
    requireDepartment('property-management')
];

function getUserId(req) {
    return Number(req.usuario?.id || req.usuario?.usuario_id || 0) || null;
}

function getDepartmentId(req) {
    return Number(req.departamento?.id || req.usuario?.departamento_id || 0) || null;
}

function hashBuffer(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function cleanText(value, fallback = '') {
    return normalizeText(value || fallback);
}

function cleanAccount(value, fallback) {
    return cleanText(value, fallback) || fallback;
}

function parseYear(value, fallback = new Date().getFullYear()) {
    const year = Number(value || fallback);
    return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : Number(fallback);
}

function parseMonth(value) {
    const month = Number(value);
    return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}

function normalizeLocationKey(value) {
    return cleanText(value)
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/\.0$/, '');
}

async function loadPropertyManagementEntityMap() {
    try {
        const [rows] = await pool.query(
            `SELECT location, entity_code
             FROM property_management_entities
             WHERE is_active = 1`
        );

        return new Map(
            rows
                .map(row => [normalizeLocationKey(row.location), cleanText(row.entity_code).toUpperCase()])
                .filter(([location, entity]) => location && entity)
        );
    } catch (error) {
        if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) throw error;
        return new Map();
    }
}

function resolveEntityForStore(entityMap, storeNumber, fallback = '') {
    return entityMap.get(normalizeLocationKey(storeNumber)) || cleanText(fallback).toUpperCase();
}

function inferGlPeriod(parsed) {
    const metadataDate = parseDate(parsed.metadata?.reportEndDate)
        || parseDate(parsed.metadata?.reportStartDate);
    if (metadataDate) {
        return {
            year: metadataDate.getUTCFullYear(),
            month: metadataDate.getUTCMonth() + 1
        };
    }

    const detailDate = parsed.details
        .map(detail => parseDate(detail.posted_date || detail.doc_date))
        .find(Boolean);
    if (!detailDate) return { year: null, month: null };

    return {
        year: detailDate.getUTCFullYear(),
        month: detailDate.getUTCMonth() + 1
    };
}

function parseJson(value, fallback = null) {
    if (!value) return fallback;
    if (typeof value === 'object' && !Buffer.isBuffer(value)) return value;
    try {
        return JSON.parse(String(value));
    } catch {
        return fallback;
    }
}

function isDraftScheduleId(scheduleId) {
    return Number(scheduleId) < 0;
}

function monthlyValidationKey(row = {}) {
    return [
        Number(row.period_year || 0),
        Number(row.period_month || 0),
        cleanText(row.store_number)
    ].join('|');
}

function buildMonthlyValidationRows(months = []) {
    const groups = new Map();

    for (const row of months) {
        const key = monthlyValidationKey(row);

        if (!groups.has(key)) {
            groups.set(key, {
                rows: [],
                period_year: Number(row.period_year || 0),
                period_month: Number(row.period_month || 0),
                period_code: row.period_code || '',
                store_number: cleanText(row.store_number),
                entity_code: cleanText(row.entity_code),
                payees: new Set(),
                documents: new Set()
            });
        }

        const group = groups.get(key);
        group.rows.push(row);

        const payee = cleanText(row.payee);
        const document = cleanText(row.doc_number);

        if (payee) group.payees.add(payee);
        if (document) group.documents.add(document);
    }

    return Array.from(groups.values())
        .map(group => {
            const expected = roundMoney(
                group.rows.reduce(
                    (sum, row) =>
                        sum + Number(row.expected_amount || 0),
                    0
                )
            );

            const actual = roundMoney(
                group.rows.reduce(
                    (sum, row) =>
                        sum + Number(row.gl_actual_amount || 0),
                    0
                )
            );

            const difference = roundMoney(actual - expected);

            const statuses = group.rows.map(
                row => String(row.status || 'PENDING_GL').toUpperCase()
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
            const documents = Array.from(group.documents);
            const first = group.rows[0] || {};

            return {
                ...first,
                validation_group_key: monthlyValidationKey(first),
                validation_basis: 'STORE_PERIOD_TOTAL',
                bill_count: group.rows.length,
                period_year: group.period_year,
                period_month: group.period_month,
                period_code: group.period_code,
                store_number: group.store_number,
                entity_code: group.entity_code,
                payee: payees.length === 1
                    ? payees[0]
                    : `${payees.length} payees`,
                doc_number: documents.length <= 2
                    ? documents.join(' / ')
                    : `${documents.length} bills`,
                document_numbers: documents,
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

function applyMonthlyGlByStore(
    monthRows,
    actualByStore,
    glUpload = null
) {
    const groups = new Map();

    for (const row of monthRows) {
        const storeNumber = cleanText(row.store_number);

        if (!groups.has(storeNumber)) {
            groups.set(storeNumber, []);
        }

        groups.get(storeNumber).push(row);
    }

    let matched = 0;
    let differences = 0;
    let missing = 0;

    for (const [storeNumber, rows] of groups) {
        const expectedTotal = roundMoney(
            rows.reduce(
                (sum, row) =>
                    sum + Number(row.expected_amount || 0),
                0
            )
        );

        const actualTotal = roundMoney(
            actualByStore.get(String(storeNumber)) || 0
        );

        const storeDifference = roundMoney(
            actualTotal - expectedTotal
        );

        let status = 'MATCHED';

        if (
            Math.abs(actualTotal) <= 0.01
            && Math.abs(expectedTotal) > 0.01
        ) {
            status = 'MISSING_GL';
            missing += 1;
        } else if (Math.abs(storeDifference) > 0.01) {
            status = 'DIFFERENCE';
            differences += 1;
        } else {
            matched += 1;
        }

        let allocatedActual = 0;

        rows.forEach((row, index) => {
            const expected = roundMoney(row.expected_amount);

            let actual = 0;

            if (index === rows.length - 1) {
                actual = roundMoney(
                    actualTotal - allocatedActual
                );
            } else if (Math.abs(expectedTotal) > 0.01) {
                actual = roundMoney(
                    actualTotal * (expected / expectedTotal)
                );
                allocatedActual = roundMoney(
                    allocatedActual + actual
                );
            }

            row.gl_actual_amount = actual;
            row.difference = roundMoney(actual - expected);
            row.status = status;
            row.validation_basis = 'STORE_PERIOD_TOTAL';
            row.store_expected_amount = expectedTotal;
            row.store_gl_actual_amount = actualTotal;
            row.store_difference_amount = storeDifference;
            row.store_bill_count = rows.length;

            if (glUpload) {
                row.gl_upload = glUpload;
            }
        });
    }

    const validationRows =
        buildMonthlyValidationRows(monthRows);

    return {
        matched,
        differences,
        missing,
        validationRows,
        differenceRows: validationRows
            .filter(row =>
                ['DIFFERENCE', 'MISSING_GL'].includes(
                    String(row.status).toUpperCase()
                )
            )
            .sort((a, b) =>
                Math.abs(Number(b.difference || 0))
                - Math.abs(Number(a.difference || 0))
            )
    };
}

function summarizeMonths(months = []) {
    return buildMonthlyValidationRows(months)
        .reduce((summary, row) => {
            const expected =
                Number(row.expected_amount || 0);
            const actual =
                Number(row.gl_actual_amount || 0);
            const difference =
                Number(row.difference || 0);
            const status =
                String(row.status || '').toUpperCase();

            summary.expected_total += expected;
            summary.actual_total += actual;
            summary.difference_total += difference;

            if (status === 'MATCHED') {
                summary.matched_count += 1;
            }

            if (status === 'DIFFERENCE') {
                summary.difference_count += 1;
            }

            if (status === 'MISSING_GL') {
                summary.missing_gl_count += 1;
            }

            if (status === 'PENDING_GL') {
                summary.pending_count += 1;
            }

            return summary;
        }, {
            expected_total: 0,
            actual_total: 0,
            difference_total: 0,
            matched_count: 0,
            difference_count: 0,
            missing_gl_count: 0,
            pending_count: 0
        });
}

function refreshDraftCounts(draft) {
    const schedule = draft.schedule;
    schedule.source_row_count = draft.sourceRows.length;
    schedule.included_row_count = draft.sourceRows.filter(row => Number(row.include_in_schedule ?? 1) === 1).length;
    schedule.excluded_row_count = draft.sourceRows.length - schedule.included_row_count;
    schedule.generated_month_count = draft.months.length;
    if (draft.months.length) {
        const summary = summarizeMonths(draft.months);
        schedule.status = summary.difference_count || summary.missing_gl_count
            ? 'DIFFERENCE'
            : summary.pending_count
                ? 'GENERATED'
                : 'VALIDATED';
    } else {
        schedule.status = 'SOURCE_LOADED';
    }
    schedule.updated_at = new Date();
    return draft;
}

function getDraftSchedule(scheduleId) {
    const draft = draftSchedules.get(Number(scheduleId));
    return draft ? refreshDraftCounts(draft) : null;
}

function buildScheduleDataPayload(draft) {
    refreshDraftCounts(draft);

    const comparisonRows =
        buildMonthlyValidationRows(draft.months);

    return {
        schedule: draft.schedule,
        sourceRows: draft.sourceRows,
        bills: draft.bills,
        months: draft.months,
        comparisonRows,
        summary: summarizeMonths(draft.months)
    };
}

function draftForClient(draft) {
    const payload = buildScheduleDataPayload(draft);
    return {
        success: true,
        schedule: {
            ...payload.schedule,
            metadata_json: parseJson(payload.schedule.metadata_json, {})
        },
        source_rows: payload.sourceRows.map(row => sourceRowForClient(row, payload.schedule)),
        bills: payload.bills,
        rows: payload.bills,
        months: payload.months,
        comparison_rows: payload.comparisonRows,
        summary: payload.summary
    };
}

function scheduleDataFromRecord(schedule) {
    const metadata = parseJson(schedule.metadata_json, {}) || {};
    const data = parseJson(schedule.datos_json, {}) || metadata.schedule_data || {};
    const sourceRows = Array.isArray(data.sourceRows) ? data.sourceRows : [];
    const bills = Array.isArray(data.bills) ? data.bills : [];
    const months = Array.isArray(data.months) ? data.months : [];
    return {
        schedule: data.schedule || schedule,
        sourceRows,
        bills,
        months,
        summary: summarizeMonths(months)
    };
}

function normalizeSourceRowRecord(row = {}, schedule = {}) {
    return {
        ...row,
        id: Number(row.id || row.source_row_id || 0) || nextDraftRowId--,
        schedule_id: Number(schedule.id || row.schedule_id || 0) || row.schedule_id,
        source_row_number: Number(row.source_row_number || row.sourceRowNumber || 0) || 0,
        posted_date: cleanSqlDate(row.posted_date || row.postedDate || row.doc_date || row.docDate, null),
        doc_date: cleanSqlDate(row.doc_date || row.docDate || row.posted_date || row.postedDate, null),
        doc_number: cleanText(row.doc_number || row.docNumber),
        memo_description: cleanText(row.memo_description || row.memoDescription),
        department: cleanText(row.department || row.store_number || row.storeNumber),
        store_number: cleanText(row.store_number || row.storeNumber),
        entity_code: cleanText(row.entity_code || row.entity || row.entityCode || schedule.entity_code || schedule.brand).toUpperCase(),
        txn_no: cleanText(row.txn_no || row.txnNo),
        journal: cleanText(row.journal),
        debit: roundMoney(row.debit ?? row.amount_paid ?? row.amountPaid ?? 0),
        credit: roundMoney(row.credit ?? 0),
        balance: roundMoney(row.balance ?? row.amount_paid ?? row.amountPaid ?? 0),
        payee: cleanText(row.payee),
        tax_year: parseYear(row.tax_year || row.taxYear, schedule.tax_year),
        amount_paid: roundMoney(row.amount_paid ?? row.amountPaid ?? 0),
        source_account: cleanAccount(row.source_account || row.sourceAccount, schedule.source_account),
        prepaid_account: cleanAccount(row.prepaid_account || row.prepaidAccount, schedule.prepaid_account),
        expense_account: cleanAccount(row.expense_account || row.expenseAccount, schedule.expense_account),
        include_in_schedule: Number(row.include_in_schedule ?? row.includeInSchedule ?? 1) === 0 ? 0 : 1,
        exception_reason: row.exception_reason || row.exceptionReason || null,
        raw_json: typeof row.raw_json === 'string'
            ? row.raw_json
            : JSON.stringify(row.raw_json || row.rawJson || {})
    };
}

function buildPersistentScheduleData(schedule, overrides = {}) {
    const current = scheduleDataFromRecord(schedule);
    const sourceRows = (overrides.sourceRows ?? current.sourceRows).map(row =>
        normalizeSourceRowRecord(row, schedule)
    );
    const bills = Array.isArray(overrides.bills) ? overrides.bills : current.bills;
    const months = Array.isArray(overrides.months) ? overrides.months : current.months;
    const {
        datos_json,
        metadata_json,
        ...scheduleRecord
    } = schedule;

    return {
        schedule: {
            ...scheduleRecord,
            source_row_count: sourceRows.length,
            included_row_count: sourceRows.filter(row => Number(row.include_in_schedule ?? 1) === 1).length,
            excluded_row_count: sourceRows.filter(row => Number(row.include_in_schedule ?? 1) !== 1).length,
            generated_month_count: months.length,
            status: overrides.status || schedule.status,
            generated_at: overrides.generated_at ?? schedule.generated_at
        },
        sourceRows,
        bills,
        months,
        summary: summarizeMonths(months)
    };
}

async function updatePrepaidScheduleJson(connection, scheduleId, payload, extra = {}) {
    const schedule = payload.schedule || {};

    await connection.query(
        `UPDATE prepaid_schedules
         SET status = ?,
             source_row_count = ?,
             included_row_count = ?,
             excluded_row_count = ?,
             generated_month_count = ?,
             generated_at = ?,
             datos_json = ?,
             metadata_json = ?
         WHERE id = ?`,
        [
            extra.status || schedule.status || 'SOURCE_LOADED',
            Number(schedule.source_row_count || 0),
            Number(schedule.included_row_count || 0),
            Number(schedule.excluded_row_count || 0),
            Number(schedule.generated_month_count || 0),
            extra.generated_at ?? schedule.generated_at ?? null,
            JSON.stringify(payload),
            JSON.stringify(extra.metadata || parseJson(schedule.metadata_json, {}) || {}),
            scheduleId
        ]
    );
}

async function saveWorkbookFromPayload(schedule, payload) {
    return savePrepaidScheduleWorkbook({
        schedule,
        sourceRows: payload.sourceRows || [],
        bills: payload.bills || [],
        months: payload.months || []
    });
}

function sendWorkbookDownload(res, workbook, downloadName) {
    if (workbook?.buffer) {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName || workbook.filename || 'prepaid-schedule.xlsx'}"`);
        res.setHeader('Content-Length', workbook.buffer.length);
        res.send(workbook.buffer);
        return;
    }

    res.download(workbook.path, downloadName || workbook.filename, error => {
        if (!error || res.headersSent) return;
        console.error('Prepaid workbook could not be downloaded:', error);
        res.status(500).json({ success: false, message: 'Export could not be downloaded' });
    });
}

function cleanSqlDate(value, fallback = null) {
    const parsed = parseDate(value);
    return parsed ? toSqlDate(parsed) : fallback;
}

function normalizeAmortizationMode(value) {
    return String(value || 'NORMAL').trim().toUpperCase() === 'CLOSEOUT'
        ? 'CLOSEOUT'
        : 'NORMAL';
}

function getSourceRowReviewMetadata(row = {}, schedule = {}) {
    const raw = parseJson(row.raw_json, {}) || {};
    const review = parseJson(raw.source_review, {}) || raw.source_review || {};
    const amortizationMode = normalizeAmortizationMode(
        review.amortization_mode || raw.amortization_mode
    );
    const closeoutDate = amortizationMode === 'CLOSEOUT'
        ? cleanSqlDate(review.closeout_date || raw.closeout_date, null)
        : null;

    return {
        raw,
        isManual: Number(review.is_manual ?? raw.manual_entry ?? raw.is_manual ?? 0) === 1,
        amortizationStart: cleanSqlDate(
            review.amortization_start || raw.amortization_start,
            schedule.amortization_start || null
        ),
        amortizationEnd: cleanSqlDate(
            review.amortization_end || raw.amortization_end,
            schedule.amortization_end || null
        ),
        amortizationMode,
        closeoutDate
    };
}

function sourceRowForClient(row, schedule = {}) {
    const metadata = getSourceRowReviewMetadata(row, schedule);
    return {
        ...row,
        is_manual: metadata.isManual ? 1 : 0,
        amortization_start: metadata.amortizationStart,
        amortization_end: metadata.amortizationEnd,
        amortization_mode: metadata.amortizationMode,
        closeout_date: metadata.closeoutDate
    };
}

function validateCloseoutSettings({ rowNumber, amortizationStart, amortizationEnd, amortizationMode, closeoutDate }) {
    if (amortizationMode !== 'CLOSEOUT') return;

    if (!closeoutDate) {
        const error = new Error(`Row ${rowNumber} requires a store closure month.`);
        error.statusCode = 400;
        throw error;
    }

    const startMonth = String(amortizationStart).slice(0, 7);
    const endMonth = String(amortizationEnd).slice(0, 7);
    const closeoutMonth = String(closeoutDate).slice(0, 7);
    if (closeoutMonth < startMonth || closeoutMonth > endMonth) {
        const error = new Error(`Row ${rowNumber} has a closure month outside the original amortization period.`);
        error.statusCode = 400;
        throw error;
    }
}

function calculateSourceAmortization(sourceMetadata, amountPaid, amortizationStart, amortizationEnd) {
    if (sourceMetadata.amortizationMode === 'CLOSEOUT') {
        return calculateBillAmortizationWithCloseout({
            amountPaid,
            amortizationStart,
            amortizationEnd,
            closeoutDate: sourceMetadata.closeoutDate
        });
    }

    return calculateBillAmortization({
        amountPaid,
        amortizationStart,
        amortizationEnd
    });
}

function tableSetupMessage(error, res) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) {
        res.status(503).json({
            success: false,
            code: 'PREPAID_TABLES_MISSING',
            message: 'Run backend/database/migrations/2026-07-10_prepaid_bill_source_generator.sql first.'
        });
        return true;
    }
    return false;
}

async function loadScheduleOr404(scheduleId, res) {
    const [rows] = await pool.query('SELECT * FROM prepaid_schedules WHERE id = ? LIMIT 1', [scheduleId]);
    if (!rows.length) {
        res.status(404).json({ success: false, message: 'Schedule was not found' });
        return null;
    }
    return rows[0];
}

router.get('/schedules', ...access('ver'), async (req, res) => {
    try {
        const where = [];
        const params = [];
        const requestedLimit = Number.parseInt(req.query.limit, 10);
        const limit = Number.isInteger(requestedLimit)
            ? Math.max(1, Math.min(requestedLimit, 500))
            : 200;

        if (['1', 'true', 'yes'].includes(String(req.query.saved || '').toLowerCase())) {
            where.push(`JSON_EXTRACT(ps.metadata_json, '$.saved_workbook.saved_at') IS NOT NULL`);
        }

        if (req.query.year) {
            where.push('ps.schedule_year = ?');
            params.push(parseYear(req.query.year));
        }

        if (req.query.brand) {
            where.push('ps.brand = ?');
            params.push(cleanText(req.query.brand));
        }

        const [records] = await pool.query(
            `SELECT ps.*
             FROM prepaid_schedules ps
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY ps.id DESC
             LIMIT ?`,
            [...params, limit]
        );

        const schedules = records.map(record => {
            const data = scheduleDataFromRecord(record);
            const summary = data.summary || {};
            return {
                ...record,
                metadata_json: parseJson(record.metadata_json, {}),
                expected_total: summary.expected_total || 0,
                actual_total: summary.actual_total || 0,
                difference_total: summary.difference_total || 0,
                matched_count: summary.matched_count || 0,
                difference_count: summary.difference_count || 0,
                missing_gl_count: summary.missing_gl_count || 0
            };
        });

        if (!['1', 'true', 'yes'].includes(String(req.query.saved || '').toLowerCase())) {
            for (const draft of draftSchedules.values()) {
                refreshDraftCounts(draft);
                schedules.unshift({
                    ...draft.schedule,
                    metadata_json: parseJson(draft.schedule.metadata_json, {}),
                    ...summarizeMonths(draft.months),
                    is_draft: true
                });
            }
        }

        res.json({ success: true, schedules });
    } catch (error) {
        console.error('Prepaid schedules could not be loaded:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Schedules could not be loaded' });
    }
});

router.post('/upload-bill-source', ...access('crear'), upload.single('billSourceFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No bill source file was received' });
        }

        const brand = cleanText(req.body.brand, 'PLK') || 'PLK';
        const sourceAccount = cleanAccount(req.body.source_account, '246000');
        const prepaidAccount = cleanAccount(req.body.prepaid_account || req.body.gl_account, '138500');
        const expenseAccount = cleanAccount(req.body.expense_account || req.body.expense_gl_account, '708500');
        const requestedTaxYear = req.body.tax_year ? parseYear(req.body.tax_year) : null;

        const parsed = parsePrepaidBillSource(req.file.buffer, {
            sourceAccount,
            prepaidAccount,
            expenseAccount,
            taxYear: requestedTaxYear
        });

        if (!parsed.rows.length) {
            return res.status(400).json({
                success: false,
                message: 'No paid PTAX bill rows were found in the uploaded file.'
            });
        }

        const inferredTaxYear = requestedTaxYear
            || parsed.rows.find(row => row.tax_year)?.tax_year
            || inferTaxYearFromText(req.file.originalname);
        const defaultPeriod = defaultAmortizationPeriod(inferredTaxYear);
        const amortizationStart = toSqlDate(req.body.amortization_start || defaultPeriod.start);
        const amortizationEnd = toSqlDate(req.body.amortization_end || defaultPeriod.end);
        const scheduleYear = parseYear(req.body.schedule_year, new Date(amortizationEnd).getUTCFullYear());
        const title = cleanText(
            req.body.title,
            `${brand} PTAX ${inferredTaxYear} Prepaid Amortization`
        );
        const entityMap = await loadPropertyManagementEntityMap();

        const scheduleId = nextDraftScheduleId;
        nextDraftScheduleId -= 1;
        const now = new Date();
        const draft = {
            schedule: {
                id: scheduleId,
                brand,
                schedule_year: scheduleYear,
                tax_year: inferredTaxYear,
                title,
                source_account: sourceAccount,
                prepaid_account: prepaidAccount,
                expense_account: expenseAccount,
                amortization_start: amortizationStart,
                amortization_end: amortizationEnd,
                status: 'SOURCE_LOADED',
                source_file_name: req.file.originalname,
                source_file_hash: hashBuffer(req.file.buffer),
                source_sheet_name: parsed.sheetName,
                source_row_count: parsed.rows.length,
                included_row_count: parsed.rows.filter(row => row.include_in_schedule).length,
                excluded_row_count: parsed.rows.filter(row => !row.include_in_schedule).length,
                generated_month_count: 0,
                metadata_json: JSON.stringify({ ...parsed.metadata, skippedRows: parsed.skippedRows, draft: true }),
                created_by: getUserId(req),
                departamento_id: getDepartmentId(req),
                generated_at: null,
                created_at: now,
                updated_at: now
            },
            sourceRows: parsed.rows.map(row => ({
                ...row,
                id: nextDraftRowId--,
                schedule_id: scheduleId,
                entity_code: resolveEntityForStore(entityMap, row.store_number, brand),
                tax_year: row.tax_year || inferredTaxYear,
                raw_json: JSON.stringify(row.raw_json)
            })),
            bills: [],
            months: []
        };
        draftSchedules.set(scheduleId, draft);

        res.json({
            success: true,
            schedule_id: scheduleId,
            extracted_rows: parsed.rows.length,
            skipped_rows: parsed.skippedRows.length,
            tax_year: inferredTaxYear,
            amortization_start: amortizationStart,
            amortization_end: amortizationEnd
        });
    } catch (error) {
        console.error('Prepaid bill source could not be imported:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: error.message || 'Bill source could not be imported' });
    }
});

router.get('/:scheduleId', ...access('ver'), async (req, res) => {
    try {
        const scheduleId = Number(req.params.scheduleId);
        const draft = getDraftSchedule(scheduleId);
        if (draft) {
            return res.json(draftForClient(draft));
        }

        const schedule = await loadScheduleOr404(scheduleId, res);
        if (!schedule) return;

        const data = scheduleDataFromRecord(schedule);
        const sourceRows = data.sourceRows.map(row => sourceRowForClient(row, schedule));
        const bills = data.bills;
        const months = data.months;
        const summary = data.summary || summarizeMonths(months);

        res.json({
            success: true,
            schedule: {
                ...schedule,
                metadata_json: parseJson(schedule.metadata_json, {})
            },
            source_rows: sourceRows,
            bills,
            rows: bills,
            months,
            comparison_rows: buildMonthlyValidationRows(months),
            summary
        });
    } catch (error) {
        console.error('Prepaid schedule detail could not be loaded:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Schedule detail could not be loaded' });
    }
});


router.put('/:scheduleId/source-rows', ...access('editar'), async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const scheduleId = Number(req.params.scheduleId);
        if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
            if (!isDraftScheduleId(scheduleId)) {
                return res.status(400).json({ success: false, message: 'A valid schedule is required.' });
            }
        }

        const draft = getDraftSchedule(scheduleId);
        if (draft) {
            if (!Array.isArray(req.body?.rows)) {
                return res.status(400).json({ success: false, message: 'The reviewed source rows are required.' });
            }

            const entityMap = await loadPropertyManagementEntityMap();
            const removedStoreNumbers = new Set(
                (Array.isArray(req.body.removed_store_numbers) ? req.body.removed_store_numbers : [])
                    .map(value => cleanText(value))
                    .filter(Boolean)
            );
            const existingById = new Map(draft.sourceRows.map(row => [Number(row.id), row]));
            const reviewedRows = [];

            for (let index = 0; index < req.body.rows.length; index += 1) {
                const input = req.body.rows[index] || {};
                const id = Number(input.id || 0) || null;
                const existing = id ? existingById.get(id) : null;
                const storeNumber = cleanText(input.store_number);
                if (removedStoreNumbers.has(storeNumber)) continue;

                const payee = cleanText(input.payee, existing?.payee || '');
                const amountPaid = roundMoney(input.amount_paid);
                const docDate = cleanSqlDate(input.doc_date || input.posted_date, existing?.doc_date || existing?.posted_date || null);
                const postedDate = cleanSqlDate(input.posted_date || input.doc_date, existing?.posted_date || existing?.doc_date || docDate);

                if (!storeNumber || !payee || !docDate || !Number.isFinite(amountPaid) || amountPaid <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Row ${index + 1} requires a store, concept, bill date, and amount greater than zero.`
                    });
                }

                const existingMetadata = getSourceRowReviewMetadata(existing || {}, draft.schedule);
                const isManual = Number(input.is_manual ?? (existingMetadata.isManual ? 1 : 0)) === 1;
                const amortizationStart = cleanSqlDate(input.amortization_start, existingMetadata.amortizationStart || draft.schedule.amortization_start);
                const amortizationEnd = cleanSqlDate(input.amortization_end, existingMetadata.amortizationEnd || draft.schedule.amortization_end);
                const amortizationMode = normalizeAmortizationMode(
                    input.amortization_mode ?? existingMetadata.amortizationMode
                );
                const closeoutDate = amortizationMode === 'CLOSEOUT'
                    ? cleanSqlDate(input.closeout_date, existingMetadata.closeoutDate)
                    : null;

                if (!amortizationStart || !amortizationEnd || amortizationStart > amortizationEnd) {
                    return res.status(400).json({ success: false, message: `Row ${index + 1} has an invalid amortization period.` });
                }
                validateCloseoutSettings({
                    rowNumber: index + 1,
                    amortizationStart,
                    amortizationEnd,
                    amortizationMode,
                    closeoutDate
                });

                reviewedRows.push({
                    id: existing?.id || nextDraftRowId--,
                    schedule_id: scheduleId,
                    source_row_number: existing?.source_row_number || Number(input.source_row_number || index + 1),
                    posted_date: postedDate,
                    doc_date: docDate,
                    doc_number: cleanText(input.doc_number, existing?.doc_number || ''),
                    memo_description: cleanText(input.memo_description, existing?.memo_description || ''),
                    department: cleanText(input.department, existing?.department || storeNumber),
                    store_number: storeNumber,
                    entity_code: resolveEntityForStore(entityMap, storeNumber, input.entity_code || existing?.entity_code || draft.schedule.brand),
                    txn_no: cleanText(input.txn_no, existing?.txn_no || ''),
                    journal: cleanText(input.journal, existing?.journal || (isManual ? 'MANUAL' : '')),
                    debit: roundMoney(input.debit ?? existing?.debit ?? amountPaid),
                    credit: roundMoney(input.credit ?? existing?.credit ?? 0),
                    balance: roundMoney(input.balance ?? existing?.balance ?? amountPaid),
                    payee,
                    tax_year: parseYear(input.tax_year, existing?.tax_year || draft.schedule.tax_year),
                    amount_paid: amountPaid,
                    source_account: cleanAccount(input.source_account || existing?.source_account, draft.schedule.source_account),
                    prepaid_account: cleanAccount(input.prepaid_account || existing?.prepaid_account, draft.schedule.prepaid_account),
                    expense_account: cleanAccount(input.expense_account || existing?.expense_account, draft.schedule.expense_account),
                    include_in_schedule: 1,
                    exception_reason: null,
                    raw_json: JSON.stringify({
                        ...(existingMetadata.raw || {}),
                        manual_entry: isManual ? 1 : 0,
                        amortization_mode: amortizationMode,
                        closeout_date: closeoutDate,
                        source_review: {
                            is_manual: isManual ? 1 : 0,
                            amortization_start: amortizationStart,
                            amortization_end: amortizationEnd,
                            amortization_mode: amortizationMode,
                            closeout_date: closeoutDate
                        }
                    })
                });
            }

            if (!reviewedRows.length) {
                return res.status(400).json({ success: false, message: 'At least one source row is required to generate the schedule.' });
            }

            draft.sourceRows = reviewedRows;
            draft.bills = [];
            draft.months = [];
            refreshDraftCounts(draft);
            return res.json({
                success: true,
                schedule_id: scheduleId,
                updated_rows: reviewedRows.length,
                needs_regenerate: true,
                source_rows: reviewedRows.map(row => sourceRowForClient(row, draft.schedule))
            });
        }

        const [[schedule]] = await connection.query(
            'SELECT * FROM prepaid_schedules WHERE id = ? LIMIT 1',
            [scheduleId]
        );
        if (!schedule) {
            return res.status(404).json({ success: false, message: 'Schedule was not found' });
        }

        if (!Array.isArray(req.body?.rows)) {
            return res.status(400).json({ success: false, message: 'The reviewed source rows are required.' });
        }
        if (req.body.rows.length > 10000) {
            return res.status(413).json({ success: false, message: 'Too many source rows were submitted.' });
        }

        const entityMap = await loadPropertyManagementEntityMap();
        const removedStoreNumbers = new Set(
            (Array.isArray(req.body.removed_store_numbers) ? req.body.removed_store_numbers : [])
                .map(value => cleanText(value))
                .filter(Boolean)
        );

        const existingRows = scheduleDataFromRecord(schedule).sourceRows.map(row =>
            normalizeSourceRowRecord(row, schedule)
        );
        const existingById = new Map(existingRows.map(row => [Number(row.id), row]));
        const receivedIds = new Set();
        const reviewedRows = [];

        for (let index = 0; index < req.body.rows.length; index += 1) {
            const input = req.body.rows[index] || {};
            const id = Number(input.id || 0) || null;
            const existing = id ? existingById.get(id) : null;

            if (id && !existing) {
                return res.status(400).json({
                    success: false,
                    message: `Source row ${id} does not belong to this schedule.`
                });
            }
            if (id && receivedIds.has(id)) {
                return res.status(400).json({
                    success: false,
                    message: `Source row ${id} was submitted more than once.`
                });
            }
            if (id) receivedIds.add(id);

            const storeNumber = cleanText(input.store_number);
            if (removedStoreNumbers.has(storeNumber)) continue;

            const payee = cleanText(input.payee, existing?.payee || '');
            const amountPaid = roundMoney(input.amount_paid);
            const docDate = cleanSqlDate(
                input.doc_date || input.posted_date,
                existing?.doc_date || existing?.posted_date || null
            );
            const postedDate = cleanSqlDate(
                input.posted_date || input.doc_date,
                existing?.posted_date || existing?.doc_date || docDate
            );

            if (!storeNumber || !payee || !docDate || !Number.isFinite(amountPaid) || amountPaid <= 0) {
                return res.status(400).json({
                    success: false,
                    message: `Row ${index + 1} requires a store, concept, bill date, and amount greater than zero.`
                });
            }

            const existingMetadata = getSourceRowReviewMetadata(existing || {}, schedule);
            const isManual = Number(input.is_manual ?? (existingMetadata.isManual ? 1 : 0)) === 1;
            const amortizationStart = cleanSqlDate(
                input.amortization_start,
                existingMetadata.amortizationStart || schedule.amortization_start
            );
            const amortizationEnd = cleanSqlDate(
                input.amortization_end,
                existingMetadata.amortizationEnd || schedule.amortization_end
            );
            const amortizationMode = normalizeAmortizationMode(
                input.amortization_mode ?? existingMetadata.amortizationMode
            );
            const closeoutDate = amortizationMode === 'CLOSEOUT'
                ? cleanSqlDate(input.closeout_date, existingMetadata.closeoutDate)
                : null;

            if (!amortizationStart || !amortizationEnd || amortizationStart > amortizationEnd) {
                return res.status(400).json({
                    success: false,
                    message: `Row ${index + 1} has an invalid amortization period.`
                });
            }
            validateCloseoutSettings({
                rowNumber: index + 1,
                amortizationStart,
                amortizationEnd,
                amortizationMode,
                closeoutDate
            });

            const rawJson = {
                ...(existingMetadata.raw || {}),
                manual_entry: isManual ? 1 : 0,
                amortization_mode: amortizationMode,
                closeout_date: closeoutDate,
                source_review: {
                    is_manual: isManual ? 1 : 0,
                    amortization_start: amortizationStart,
                    amortization_end: amortizationEnd,
                    amortization_mode: amortizationMode,
                    closeout_date: closeoutDate
                }
            };

            reviewedRows.push({
                id,
                // Existing rows keep their original source row number. New/manual rows
                // are numbered by the server after validation to avoid collisions with
                // imported Excel row numbers covered by uq_prepaid_source_row.
                sourceRowNumber: existing ? Number(existing.source_row_number) : null,
                postedDate,
                docDate,
                docNumber: cleanText(input.doc_number, existing?.doc_number || ''),
                memoDescription: cleanText(input.memo_description, existing?.memo_description || ''),
                department: cleanText(input.department, existing?.department || storeNumber),
                storeNumber,
                entityCode: resolveEntityForStore(entityMap, storeNumber, input.entity_code || existing?.entity_code || schedule.brand),
                txnNo: cleanText(input.txn_no, existing?.txn_no || ''),
                journal: cleanText(input.journal, existing?.journal || (isManual ? 'MANUAL' : '')),
                debit: roundMoney(input.debit ?? existing?.debit ?? amountPaid),
                credit: roundMoney(input.credit ?? existing?.credit ?? 0),
                balance: roundMoney(input.balance ?? existing?.balance ?? amountPaid),
                payee,
                taxYear: parseYear(input.tax_year, existing?.tax_year || schedule.tax_year),
                amountPaid,
                sourceAccount: cleanAccount(input.source_account || existing?.source_account, schedule.source_account),
                prepaidAccount: cleanAccount(input.prepaid_account || existing?.prepaid_account, schedule.prepaid_account),
                expenseAccount: cleanAccount(input.expense_account || existing?.expense_account, schedule.expense_account),
                rawJson: JSON.stringify(rawJson)
            });
        }

        if (!reviewedRows.length) {
            return res.status(400).json({
                success: false,
                message: 'At least one source row is required to generate the schedule.'
            });
        }

        // The unique key uq_prepaid_source_row uses (schedule_id, source_row_number).
        // Imported Excel rows can contain non-contiguous row numbers, so using
        // state.sourceRows.length + 1 for a manual row can reuse an existing number
        // (for example 36). Always allocate manual numbers above the current maximum.
        let nextSourceRowNumber = existingRows.reduce(
            (max, row) => Math.max(max, Number(row.source_row_number) || 0),
            0
        ) + 1;

        for (const row of reviewedRows) {
            if (row.id) continue;
            row.sourceRowNumber = nextSourceRowNumber;
            nextSourceRowNumber += 1;
        }

        const savedRows = reviewedRows.map(row => normalizeSourceRowRecord({
            id: row.id || nextDraftRowId--,
            schedule_id: scheduleId,
            source_row_number: row.sourceRowNumber,
            posted_date: row.postedDate,
            doc_date: row.docDate,
            doc_number: row.docNumber,
            memo_description: row.memoDescription,
            department: row.department,
            store_number: row.storeNumber,
            entity_code: row.entityCode,
            txn_no: row.txnNo,
            journal: row.journal,
            debit: row.debit,
            credit: row.credit,
            balance: row.balance,
            payee: row.payee,
            tax_year: row.taxYear,
            amount_paid: row.amountPaid,
            source_account: row.sourceAccount,
            prepaid_account: row.prepaidAccount,
            expense_account: row.expenseAccount,
            include_in_schedule: 1,
            exception_reason: null,
            raw_json: row.rawJson
        }, schedule));
        const metadata = parseJson(schedule.metadata_json, {}) || {};
        const payload = buildPersistentScheduleData(schedule, {
            sourceRows: savedRows,
            bills: [],
            months: [],
            status: 'SOURCE_LOADED',
            generated_at: null
        });

        await connection.beginTransaction();
        await updatePrepaidScheduleJson(connection, scheduleId, payload, {
            status: 'SOURCE_LOADED',
            generated_at: null,
            metadata
        });
        await connection.commit();

        res.json({
            success: true,
            schedule_id: scheduleId,
            updated_rows: savedRows.length,
            needs_regenerate: true,
            source_rows: savedRows.map(row => sourceRowForClient(row, schedule))
        });
    } catch (error) {
        await connection.rollback();
        console.error('Prepaid source rows could not be synchronized:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(Number(error.statusCode) || 500).json({ success: false, message: error.message || 'Source rows could not be saved' });
    } finally {
        connection.release();
    }
});

router.patch('/source-rows/:rowId', ...access('editar'), async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const rowId = Number(req.params.rowId);
        const [schedules] = await connection.query('SELECT * FROM prepaid_schedules ORDER BY id DESC');
        let schedule = null;
        let payload = null;
        let rowIndex = -1;

        for (const candidate of schedules) {
            const candidatePayload = scheduleDataFromRecord(candidate);
            const index = candidatePayload.sourceRows.findIndex(row => Number(row.id) === rowId);
            if (index >= 0) {
                schedule = candidate;
                payload = candidatePayload;
                rowIndex = index;
                break;
            }
        }

        if (!schedule || !payload || rowIndex < 0) {
            return res.status(404).json({ success: false, message: 'Source row was not found' });
        }

        const allowed = {
            include_in_schedule: value => (['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase()) || value === true ? 1 : 0),
            exception_reason: value => cleanText(value),
            payee: value => cleanText(value),
            store_number: value => cleanText(value),
            amount_paid: value => roundMoney(value),
            prepaid_account: value => cleanAccount(value, '138500'),
            expense_account: value => cleanAccount(value, '708500')
        };

        const updates = [];
        const params = [];

        Object.entries(allowed).forEach(([field, cleaner]) => {
            if (req.body[field] === undefined) return;
            updates.push(`${field} = ?`);
            params.push(cleaner(req.body[field]));
        });

        if (!updates.length) {
            return res.json({ success: true, schedule_id: schedule.id });
        }

        const sourceRows = payload.sourceRows.map(row => normalizeSourceRowRecord(row, schedule));
        Object.entries(allowed).forEach(([field, cleaner]) => {
            if (req.body[field] === undefined) return;
            sourceRows[rowIndex][field] = cleaner(req.body[field]);
        });

        const nextPayload = buildPersistentScheduleData(schedule, {
            sourceRows,
            bills: [],
            months: [],
            status: 'SOURCE_LOADED',
            generated_at: null
        });

        await connection.beginTransaction();
        await updatePrepaidScheduleJson(connection, schedule.id, nextPayload, {
            status: 'SOURCE_LOADED',
            generated_at: null,
            metadata: parseJson(schedule.metadata_json, {}) || {}
        });
        await connection.commit();

        res.json({ success: true, schedule_id: schedule.id, needs_regenerate: true });
    } catch (error) {
        await connection.rollback();
        console.error('Prepaid source row could not be updated:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Source row could not be updated' });
    } finally {
        connection.release();
    }
});

router.post('/:scheduleId/generate', ...access('crear'), async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const scheduleId = Number(req.params.scheduleId);
        const draft = getDraftSchedule(scheduleId);
        if (draft) {
            const sourceRows = draft.sourceRows.filter(row => Number(row.include_in_schedule ?? 1) === 1)
                .sort((a, b) => String(a.store_number).localeCompare(String(b.store_number), undefined, { numeric: true })
                    || Number(a.source_row_number || 0) - Number(b.source_row_number || 0));

            if (!sourceRows.length) {
                return res.status(400).json({ success: false, message: 'There are no included bills to amortize.' });
            }

            draft.bills = [];
            draft.months = [];

            for (const source of sourceRows) {
                const sourceMetadata = getSourceRowReviewMetadata(source, draft.schedule);
                const amortizationStart = sourceMetadata.amortizationStart || draft.schedule.amortization_start;
                const amortizationEnd = sourceMetadata.amortizationEnd || draft.schedule.amortization_end;
                const calculation = calculateSourceAmortization(
                    sourceMetadata,
                    source.amount_paid,
                    amortizationStart,
                    amortizationEnd
                );
                const billId = nextDraftBillId--;
                const bill = {
                    id: billId,
                    schedule_id: scheduleId,
                    source_row_id: source.id,
                    store_number: source.store_number,
                    entity_code: source.entity_code || draft.schedule.brand,
                    payee: source.payee,
                    doc_number: source.doc_number,
                    bill_date: source.doc_date || source.posted_date,
                    tax_year: source.tax_year || draft.schedule.tax_year,
                    amount_paid: source.amount_paid,
                    source_account: source.source_account || draft.schedule.source_account,
                    prepaid_account: source.prepaid_account || draft.schedule.prepaid_account,
                    expense_account: source.expense_account || draft.schedule.expense_account,
                    amortization_start: amortizationStart,
                    amortization_end: amortizationEnd,
                    total_months: calculation.totalMonths,
                    monthly_amount: calculation.monthlyAmount,
                    amortization_mode: calculation.isCloseout ? 'CLOSEOUT' : 'NORMAL',
                    closeout_date: calculation.closeoutDate || null,
                    closeout_amount: calculation.closeoutAmount ?? null
                };
                draft.bills.push(bill);

                for (const month of calculation.months) {
                    draft.months.push({
                        id: nextDraftMonthId--,
                        schedule_id: scheduleId,
                        bill_id: billId,
                        source_row_id: source.id,
                        store_number: source.store_number,
                        entity_code: source.entity_code || draft.schedule.brand,
                        payee: source.payee,
                        doc_number: source.doc_number,
                        period_year: month.period_year,
                        period_month: month.period_month,
                        period_code: month.period_code,
                        expected_amount: month.expected_amount,
                        gl_actual_amount: 0,
                        difference: month.expected_amount,
                        status: 'PENDING_GL'
                    });
                }
            }

            draft.schedule.generated_at = new Date();
            refreshDraftCounts(draft);
            return res.json({
                success: true,
                schedule_id: scheduleId,
                inserted_bills: draft.bills.length,
                inserted_months: draft.months.length,
                saved_to_server: false,
                needs_save: true
            });
        }

        const [[schedule]] = await connection.query('SELECT * FROM prepaid_schedules WHERE id = ? LIMIT 1', [scheduleId]);

        if (!schedule) {
            return res.status(404).json({ success: false, message: 'Schedule was not found' });
        }

        const entityMap = await loadPropertyManagementEntityMap();
        const sourceRows = scheduleDataFromRecord(schedule).sourceRows
            .map(row => {
                const normalized = normalizeSourceRowRecord(row, schedule);
                return {
                    ...normalized,
                    entity_code: resolveEntityForStore(entityMap, normalized.store_number, normalized.entity_code || schedule.brand)
                };
            })
            .filter(row => Number(row.include_in_schedule ?? 1) === 1)
            .sort((a, b) => String(a.store_number).localeCompare(String(b.store_number), undefined, { numeric: true })
                || Number(a.source_row_number || 0) - Number(b.source_row_number || 0));

        if (!sourceRows.length) {
            return res.status(400).json({ success: false, message: 'There are no included bills to amortize.' });
        }

        await connection.beginTransaction();

        const bills = [];
        const months = [];
        let nextBillId = -1;
        let nextMonthId = -1;

        for (const source of sourceRows) {
            const sourceMetadata = getSourceRowReviewMetadata(source, schedule);
            const amortizationStart = sourceMetadata.amortizationStart || schedule.amortization_start;
            const amortizationEnd = sourceMetadata.amortizationEnd || schedule.amortization_end;
            const calculation = calculateSourceAmortization(
                sourceMetadata,
                source.amount_paid,
                amortizationStart,
                amortizationEnd
            );

            const billId = nextBillId--;
            bills.push({
                id: billId,
                schedule_id: scheduleId,
                source_row_id: source.id,
                store_number: source.store_number,
                entity_code: source.entity_code || schedule.brand,
                payee: source.payee,
                doc_number: source.doc_number,
                bill_date: source.doc_date || source.posted_date,
                tax_year: source.tax_year || schedule.tax_year,
                amount_paid: source.amount_paid,
                source_account: source.source_account || schedule.source_account,
                prepaid_account: source.prepaid_account || schedule.prepaid_account,
                expense_account: source.expense_account || schedule.expense_account,
                amortization_start: amortizationStart,
                amortization_end: amortizationEnd,
                total_months: calculation.totalMonths,
                monthly_amount: calculation.monthlyAmount,
                amortization_mode: calculation.isCloseout ? 'CLOSEOUT' : 'NORMAL',
                closeout_date: calculation.closeoutDate || null,
                closeout_amount: calculation.closeoutAmount ?? null
            });

            calculation.months.forEach(month => {
                months.push({
                    id: nextMonthId--,
                    scheduleId,
                    schedule_id: scheduleId,
                    bill_id: billId,
                    source_row_id: source.id,
                    store_number: source.store_number,
                    entity_code: source.entity_code || schedule.brand,
                    payee: source.payee,
                    doc_number: source.doc_number,
                    period_year: month.period_year,
                    period_month: month.period_month,
                    period_code: month.period_code,
                    expected_amount: month.expected_amount,
                    gl_actual_amount: 0,
                    difference: month.expected_amount,
                    status: 'PENDING_GL'
                });
            });
        }

        const generatedAt = new Date();
        const payload = buildPersistentScheduleData(schedule, {
            sourceRows,
            bills,
            months,
            status: 'GENERATED',
            generated_at: generatedAt
        });

        await updatePrepaidScheduleJson(connection, scheduleId, payload, {
            status: 'GENERATED',
            generated_at: generatedAt,
            metadata: parseJson(schedule.metadata_json, {}) || {}
        });
        await connection.commit();

        // Generating only updates the database preview. The Excel workbook is
        // persisted on the server exclusively through POST /:scheduleId/save.
        res.json({
            success: true,
            schedule_id: scheduleId,
            inserted_bills: bills.length,
            inserted_months: months.length,
            saved_to_server: false,
            needs_save: true
        });
    } catch (error) {
        await connection.rollback();
        console.error('Prepaid schedule could not be generated:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(Number(error.statusCode) || 500).json({ success: false, message: error.message || 'Schedule could not be generated' });
    } finally {
        connection.release();
    }
});

router.post('/upload-gl', ...access('crear'), upload.single('glFile'), async (req, res) => {
    const connection = await pool.getConnection();

    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No monthly GL file was received'
            });
        }

        const scheduleId = Number(req.body.schedule_id);
        const parsed = parseMonthlyGlActuals(req.file.buffer);
        const inferredPeriod = inferGlPeriod(parsed);
        const periodYear = parseYear(
            req.body.period_year
                || req.body.schedule_year
                || inferredPeriod.year,
            inferredPeriod.year
        );
        const periodMonth = parseMonth(
            req.body.period_month || inferredPeriod.month
        );

        if (!scheduleId) {
            return res.status(400).json({
                success: false,
                message: 'Select a schedule before uploading the monthly GL.'
            });
        }

        if (!periodYear || !periodMonth) {
            return res.status(400).json({
                success: false,
                message: 'The monthly GL period could not be inferred from the report dates.'
            });
        }

        const glUpload = {
            file_name: req.file.originalname,
            file_hash: hashBuffer(req.file.buffer),
            sheet_name: parsed.sheetName,
            parsed_row_count: parsed.details.length,
            period_code: periodCode(periodMonth, periodYear),
            uploaded_by: getUserId(req),
            uploaded_at: new Date().toISOString()
        };

        const draft = getDraftSchedule(scheduleId);

        if (draft) {
            const periodRows = draft.months.filter(month =>
                Number(month.period_year) === periodYear
                && Number(month.period_month) === periodMonth
            );

            const validation = applyMonthlyGlByStore(
                periodRows,
                parsed.actualByStore,
                glUpload
            );

            refreshDraftCounts(draft);

            return res.json({
                success: true,
                schedule_id: scheduleId,
                period_code: periodCode(
                    periodMonth,
                    periodYear
                ),
                parsed_rows: parsed.details.length,
                matched: validation.matched,
                differences: validation.differences,
                missing_gl: validation.missing,
                difference_rows: validation.differenceRows,
                comparison_rows: validation.validationRows,
                validation_basis: 'STORE_PERIOD_TOTAL',
                saved_to_server: false,
                needs_save: true
            });
        }

        const schedule =
            await loadScheduleOr404(scheduleId, res);

        if (!schedule) return;

        const payload = scheduleDataFromRecord(schedule);

        const monthRows = payload.months.filter(row =>
            Number(row.period_year) === periodYear
            && Number(row.period_month) === periodMonth
        );

        const validation = applyMonthlyGlByStore(
            monthRows,
            parsed.actualByStore,
            glUpload
        );

        const summary = summarizeMonths(payload.months);

        const status =
            summary.difference_count
            || summary.missing_gl_count
                ? 'DIFFERENCE'
                : summary.pending_count
                    ? 'GENERATED'
                    : 'VALIDATED';

        const metadata =
            parseJson(schedule.metadata_json, {}) || {};

        metadata.last_gl_upload = {
            ...glUpload,
            period_year: periodYear,
            period_month: periodMonth,
            matched: validation.matched,
            differences: validation.differences,
            missing: validation.missing,
            validation_basis: 'STORE_PERIOD_TOTAL'
        };

        const nextPayload = buildPersistentScheduleData(
            schedule,
            {
                sourceRows: payload.sourceRows,
                bills: payload.bills,
                months: payload.months,
                status
            }
        );

        await connection.beginTransaction();

        await updatePrepaidScheduleJson(
            connection,
            scheduleId,
            nextPayload,
            {
                status,
                generated_at: schedule.generated_at,
                metadata
            }
        );

        await connection.commit();

        res.json({
            success: true,
            schedule_id: scheduleId,
            period_code: periodCode(
                periodMonth,
                periodYear
            ),
            parsed_rows: parsed.details.length,
            matched: validation.matched,
            differences: validation.differences,
            missing_gl: validation.missing,
            difference_rows: validation.differenceRows,
            comparison_rows: validation.validationRows,
            validation_basis: 'STORE_PERIOD_TOTAL',
            saved_to_server: false,
            needs_save: true
        });
    } catch (error) {
        await connection.rollback();

        console.error(
            'Prepaid GL could not be uploaded:',
            error
        );

        if (tableSetupMessage(error, res)) return;

        res.status(500).json({
            success: false,
            message:
                error.message
                || 'Monthly GL could not be uploaded'
        });
    } finally {
        connection.release();
    }
});

router.get('/:scheduleId/comparison', ...access('ver'), async (req, res) => {
    try {
        const scheduleId = Number(req.params.scheduleId);
        const draft = getDraftSchedule(scheduleId);
        if (draft) {
            return res.json({ success: true, rows: draft.months });
        }

        const schedule = await loadScheduleOr404(scheduleId, res);
        if (!schedule) return;
        const rows = scheduleDataFromRecord(schedule).months;

        res.json({ success: true, rows });
    } catch (error) {
        console.error('Prepaid comparison could not be loaded:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Comparison could not be loaded' });
    }
});

router.post('/:scheduleId/save', ...access('crear'), async (req, res) => {
    try {
        const scheduleId = Number(req.params.scheduleId);
        const draft = getDraftSchedule(scheduleId);
        if (draft) {
            refreshDraftCounts(draft);
            if (!draft.months.length) {
                return res.status(409).json({
                    success: false,
                    message: 'Generate the schedule before saving it.'
                });
            }

            const payload = buildScheduleDataPayload(draft);
            const metadata = parseJson(draft.schedule.metadata_json, {}) || {};
            const savedAt = new Date().toISOString();
            metadata.saved_workbook = {
                saved_at: savedAt,
                saved_by: getUserId(req)
            };

            let documentId = Number(draft.savedDocumentId || 0) || null;
            if (documentId) {
                await pool.query(
                    `UPDATE prepaid_schedules
                     SET brand = ?,
                         schedule_year = ?,
                         tax_year = ?,
                         title = ?,
                         source_account = ?,
                         prepaid_account = ?,
                         expense_account = ?,
                         amortization_start = ?,
                         amortization_end = ?,
                         status = ?,
                         source_file_name = ?,
                         source_file_hash = ?,
                         source_sheet_name = ?,
                         source_row_count = ?,
                         included_row_count = ?,
                         excluded_row_count = ?,
                         generated_month_count = ?,
                         metadata_json = ?,
                         datos_json = ?,
                         generated_at = ?
                     WHERE id = ?`,
                    [
                        draft.schedule.brand,
                        draft.schedule.schedule_year,
                        draft.schedule.tax_year,
                        draft.schedule.title,
                        draft.schedule.source_account,
                        draft.schedule.prepaid_account,
                        draft.schedule.expense_account,
                        draft.schedule.amortization_start,
                        draft.schedule.amortization_end,
                        draft.schedule.status,
                        draft.schedule.source_file_name,
                        draft.schedule.source_file_hash,
                        draft.schedule.source_sheet_name,
                        draft.schedule.source_row_count,
                        draft.schedule.included_row_count,
                        draft.schedule.excluded_row_count,
                        draft.schedule.generated_month_count,
                        JSON.stringify(metadata),
                        JSON.stringify(payload),
                        draft.schedule.generated_at,
                        documentId
                    ]
                );
            } else {
                const [result] = await pool.query(
                    `INSERT INTO prepaid_schedules
                     (brand, schedule_year, tax_year, title, source_account, prepaid_account, expense_account,
                      amortization_start, amortization_end, status, source_file_name, source_file_hash,
                      source_sheet_name, source_row_count, included_row_count, excluded_row_count,
                      generated_month_count, metadata_json, datos_json, created_by, departamento_id, generated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        draft.schedule.brand,
                        draft.schedule.schedule_year,
                        draft.schedule.tax_year,
                        draft.schedule.title,
                        draft.schedule.source_account,
                        draft.schedule.prepaid_account,
                        draft.schedule.expense_account,
                        draft.schedule.amortization_start,
                        draft.schedule.amortization_end,
                        draft.schedule.status,
                        draft.schedule.source_file_name,
                        draft.schedule.source_file_hash,
                        draft.schedule.source_sheet_name,
                        draft.schedule.source_row_count,
                        draft.schedule.included_row_count,
                        draft.schedule.excluded_row_count,
                        draft.schedule.generated_month_count,
                        JSON.stringify(metadata),
                        JSON.stringify(payload),
                        getUserId(req),
                        getDepartmentId(req),
                        draft.schedule.generated_at
                    ]
                );
                documentId = result.insertId;
                draft.savedDocumentId = documentId;
            }

            const savedWorkbook = await saveWorkbookFromPayload({ ...draft.schedule, id: documentId, metadata_json: JSON.stringify(metadata) }, payload);
            metadata.saved_workbook.filename = savedWorkbook.filename;
            metadata.saved_workbook.persisted = savedWorkbook.persisted !== false;
            if (savedWorkbook.write_error) metadata.saved_workbook.write_error = savedWorkbook.write_error;
            await pool.query(
                'UPDATE prepaid_schedules SET metadata_json = ? WHERE id = ?',
                [JSON.stringify(metadata), documentId]
            );

            res.json({
                success: true,
                message: 'Schedule saved on the server.',
                schedule_id: scheduleId,
                document_id: documentId,
                file_name: savedWorkbook.filename
            });
            return;
        }

        const schedule = await loadScheduleOr404(scheduleId, res);
        if (!schedule) return;

        if (!Number(schedule.generated_month_count || 0) && schedule.status === 'SOURCE_LOADED') {
            return res.status(409).json({
                success: false,
                message: 'Generate the schedule before saving it.'
            });
        }

        const payload = scheduleDataFromRecord(schedule);
        if (!payload.months.length) {
            return res.status(409).json({
                success: false,
                message: 'Generate the schedule before saving it.'
            });
        }
        const savedWorkbook = await saveWorkbookFromPayload(schedule, payload);
        const metadata = parseJson(schedule.metadata_json, {}) || {};
        metadata.saved_workbook = {
            filename: savedWorkbook.filename,
            persisted: savedWorkbook.persisted !== false,
            saved_at: new Date().toISOString(),
            saved_by: getUserId(req)
        };
        if (savedWorkbook.write_error) metadata.saved_workbook.write_error = savedWorkbook.write_error;
        await pool.query(
            'UPDATE prepaid_schedules SET metadata_json = ? WHERE id = ?',
            [JSON.stringify(metadata), scheduleId]
        );

        res.json({
            success: true,
            message: 'Schedule saved on the server.',
            schedule_id: scheduleId,
            file_name: savedWorkbook.filename
        });
    } catch (error) {
        console.error('Prepaid schedule could not be saved:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: error.message || 'Schedule could not be saved' });
    }
});

router.delete('/:scheduleId', ...access('eliminar'), async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const scheduleId = Number(req.params.scheduleId);
        const draft = getDraftSchedule(scheduleId);
        if (draft) {
            draftSchedules.delete(scheduleId);
            return res.json({
                success: true,
                message: 'Prepaid draft deleted successfully.',
                schedule_id: scheduleId
            });
        }

        const schedule = await loadScheduleOr404(scheduleId, res);
        if (!schedule) return;

        await connection.beginTransaction();
        await connection.query('DELETE FROM prepaid_schedules WHERE id = ?', [scheduleId]);
        await connection.commit();

        try {
            deleteSavedScheduleWorkbook(schedule);
        } catch (fileError) {
            console.warn('Prepaid workbook could not be deleted from disk:', fileError.message);
        }

        res.json({
            success: true,
            message: 'Prepaid schedule deleted successfully.',
            schedule_id: scheduleId
        });
    } catch (error) {
        await connection.rollback();
        console.error('Prepaid schedule could not be deleted:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: error.message || 'Prepaid schedule could not be deleted' });
    } finally {
        connection.release();
    }
});

router.get('/:scheduleId/export', ...access('exportar'), async (req, res) => {
    try {
        const scheduleId = Number(req.params.scheduleId);
        const draft = getDraftSchedule(scheduleId);
        if (draft) {
            if (!draft.months.length) {
                return res.status(409).json({
                    success: false,
                    message: 'Generate the schedule before downloading the Excel file.'
                });
            }
            const savedWorkbook = await saveWorkbookFromPayload(draft.schedule, buildScheduleDataPayload(draft));
            const downloadName = `${String(draft.schedule.title || 'prepaid-schedule')
                .replace(/[^a-z0-9]+/gi, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 90) || 'prepaid-schedule'}.xlsx`;

            return sendWorkbookDownload(res, savedWorkbook, downloadName);
        }

        const schedule = await loadScheduleOr404(scheduleId, res);
        if (!schedule) return;

        if (!Number(schedule.generated_month_count || 0) && schedule.status === 'SOURCE_LOADED') {
            return res.status(409).json({
                success: false,
                message: 'Generate the schedule before downloading the Excel file.'
            });
        }

        const downloadName = `${String(schedule.title || 'prepaid-schedule')
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 90) || 'prepaid-schedule'}.xlsx`;

        // Always rebuild the workbook from the current schedule data instead of
        // reusing a previously cached file on disk, which could predate later
        // changes (e.g. a store closeout applied after the last save).
        const generatedWorkbook = await saveWorkbookFromPayload(schedule, scheduleDataFromRecord(schedule));
        return sendWorkbookDownload(res, generatedWorkbook, downloadName);
    } catch (error) {
        console.error('Prepaid export could not be created:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: error.message || 'Export could not be created' });
    }
});

module.exports = router;
