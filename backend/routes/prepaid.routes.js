const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const XLSX = require('xlsx');
const { pool } = require('../config/database');
const {
    verificarToken,
    checkPermission,
    requireDepartment
} = require('../middleware/auth.middleware');
const {
    parsePrepaidBillSource,
    parseMonthlyGlActuals,
    normalizeText
} = require('../services/prepaidBillSourceParser');
const {
    calculateBillAmortization,
    defaultAmortizationPeriod,
    inferTaxYearFromText,
    parseDate,
    toSqlDate,
    periodCode,
    roundMoney
} = require('../services/prepaidAmortizationCalculator');

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 75 * 1024 * 1024 }
});

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

async function updateScheduleCounts(connection, scheduleId) {
    const [[sourceCounts]] = await connection.query(
        `SELECT COUNT(*) AS source_row_count,
                SUM(include_in_schedule = 1) AS included_row_count,
                SUM(include_in_schedule = 0) AS excluded_row_count
         FROM prepaid_source_rows
         WHERE schedule_id = ?`,
        [scheduleId]
    );

    const [[monthCounts]] = await connection.query(
        `SELECT COUNT(*) AS generated_month_count
         FROM prepaid_amortization_months
         WHERE schedule_id = ?`,
        [scheduleId]
    );

    await connection.query(
        `UPDATE prepaid_schedules
         SET source_row_count = ?,
             included_row_count = ?,
             excluded_row_count = ?,
             generated_month_count = ?
         WHERE id = ?`,
        [
            Number(sourceCounts?.source_row_count || 0),
            Number(sourceCounts?.included_row_count || 0),
            Number(sourceCounts?.excluded_row_count || 0),
            Number(monthCounts?.generated_month_count || 0),
            scheduleId
        ]
    );
}

async function refreshScheduleStatus(connection, scheduleId) {
    const [[summary]] = await connection.query(
        `SELECT COUNT(*) AS month_count,
                SUM(status = 'DIFFERENCE') AS difference_count,
                SUM(status = 'MISSING_GL') AS missing_count,
                SUM(status = 'PENDING_GL') AS pending_count
         FROM prepaid_amortization_months
         WHERE schedule_id = ?`,
        [scheduleId]
    );

    let status = 'SOURCE_LOADED';
    if (Number(summary?.month_count || 0) > 0) {
        status = 'GENERATED';
        if (Number(summary?.difference_count || 0) > 0 || Number(summary?.missing_count || 0) > 0) {
            status = 'DIFFERENCE';
        } else if (Number(summary?.pending_count || 0) === 0) {
            status = 'VALIDATED';
        }
    }

    await connection.query('UPDATE prepaid_schedules SET status = ? WHERE id = ?', [status, scheduleId]);
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

        if (req.query.year) {
            where.push('ps.schedule_year = ?');
            params.push(parseYear(req.query.year));
        }

        if (req.query.brand) {
            where.push('ps.brand = ?');
            params.push(cleanText(req.query.brand));
        }

        const [schedules] = await pool.query(
            `SELECT ps.*,
                    (SELECT COALESCE(SUM(expected_amount), 0)
                     FROM prepaid_amortization_months
                     WHERE schedule_id = ps.id) AS expected_total,
                    (SELECT COALESCE(SUM(gl_actual_amount), 0)
                     FROM prepaid_amortization_months
                     WHERE schedule_id = ps.id) AS actual_total,
                    (SELECT COALESCE(SUM(difference), 0)
                     FROM prepaid_amortization_months
                     WHERE schedule_id = ps.id) AS difference_total,
                    (SELECT COUNT(*)
                     FROM prepaid_amortization_months
                     WHERE schedule_id = ps.id AND status = 'MATCHED') AS matched_count,
                    (SELECT COUNT(*)
                     FROM prepaid_amortization_months
                     WHERE schedule_id = ps.id AND status = 'DIFFERENCE') AS difference_count,
                    (SELECT COUNT(*)
                     FROM prepaid_amortization_months
                     WHERE schedule_id = ps.id AND status = 'MISSING_GL') AS missing_gl_count
             FROM prepaid_schedules ps
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY ps.created_at DESC, ps.id DESC`,
            params
        );

        res.json({ success: true, schedules });
    } catch (error) {
        console.error('Prepaid schedules could not be loaded:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Schedules could not be loaded' });
    }
});

router.post('/upload-bill-source', ...access('crear'), upload.single('billSourceFile'), async (req, res) => {
    const connection = await pool.getConnection();

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

        await connection.beginTransaction();

        const [scheduleResult] = await connection.query(
            `INSERT INTO prepaid_schedules
             (brand, schedule_year, tax_year, title, source_account, prepaid_account, expense_account,
              amortization_start, amortization_end, status, source_file_name, source_file_hash,
              source_sheet_name, metadata_json, created_by, departamento_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SOURCE_LOADED', ?, ?, ?, ?, ?, ?)`,
            [
                brand,
                scheduleYear,
                inferredTaxYear,
                title,
                sourceAccount,
                prepaidAccount,
                expenseAccount,
                amortizationStart,
                amortizationEnd,
                req.file.originalname,
                hashBuffer(req.file.buffer),
                parsed.sheetName,
                JSON.stringify({ ...parsed.metadata, skippedRows: parsed.skippedRows }),
                getUserId(req),
                getDepartmentId(req)
            ]
        );

        const scheduleId = scheduleResult.insertId;
        const sourceValues = parsed.rows.map(row => [
            scheduleId,
            row.source_row_number,
            row.posted_date,
            row.doc_date,
            row.doc_number,
            row.memo_description,
            row.department,
            row.store_number,
            row.txn_no,
            row.journal,
            row.debit,
            row.credit,
            row.balance,
            row.payee,
            row.tax_year || inferredTaxYear,
            row.amount_paid,
            row.source_account,
            row.prepaid_account,
            row.expense_account,
            row.include_in_schedule ? 1 : 0,
            row.exception_reason,
            JSON.stringify(row.raw_json)
        ]);

        await connection.query(
            `INSERT INTO prepaid_source_rows
             (schedule_id, source_row_number, posted_date, doc_date, doc_number, memo_description,
              department, store_number, txn_no, journal, debit, credit, balance, payee, tax_year,
              amount_paid, source_account, prepaid_account, expense_account, include_in_schedule,
              exception_reason, raw_json)
             VALUES ?`,
            [sourceValues]
        );

        await updateScheduleCounts(connection, scheduleId);
        await connection.commit();

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
        await connection.rollback();
        console.error('Prepaid bill source could not be imported:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: error.message || 'Bill source could not be imported' });
    } finally {
        connection.release();
    }
});

router.get('/:scheduleId', ...access('ver'), async (req, res) => {
    try {
        const scheduleId = Number(req.params.scheduleId);
        const schedule = await loadScheduleOr404(scheduleId, res);
        if (!schedule) return;

        const [sourceRows] = await pool.query(
            `SELECT *
             FROM prepaid_source_rows
             WHERE schedule_id = ?
             ORDER BY include_in_schedule DESC, store_number + 0, store_number, source_row_number`,
            [scheduleId]
        );

        const [bills] = await pool.query(
            `SELECT *
             FROM prepaid_bills
             WHERE schedule_id = ?
             ORDER BY store_number + 0, store_number, id`,
            [scheduleId]
        );

        const [months] = await pool.query(
            `SELECT pam.id,
                    pam.bill_id,
                    pam.source_row_id,
                    pam.store_number,
                    pb.payee,
                    pb.doc_number,
                    pam.period_year,
                    pam.period_month,
                    pam.period_code,
                    pam.expected_amount,
                    pam.gl_actual_amount,
                    pam.difference,
                    pam.status
             FROM prepaid_amortization_months pam
             JOIN prepaid_bills pb ON pb.id = pam.bill_id
             WHERE pam.schedule_id = ?
             ORDER BY pam.period_year, pam.period_month, pam.store_number + 0, pam.store_number`,
            [scheduleId]
        );

        const [[summary]] = await pool.query(
            `SELECT COALESCE(SUM(expected_amount), 0) AS expected_total,
                    COALESCE(SUM(gl_actual_amount), 0) AS actual_total,
                    COALESCE(SUM(difference), 0) AS difference_total,
                    COALESCE(SUM(status = 'MATCHED'), 0) AS matched_count,
                    COALESCE(SUM(status = 'DIFFERENCE'), 0) AS difference_count,
                    COALESCE(SUM(status = 'MISSING_GL'), 0) AS missing_gl_count,
                    COALESCE(SUM(status = 'PENDING_GL'), 0) AS pending_count
             FROM prepaid_amortization_months
             WHERE schedule_id = ?`,
            [scheduleId]
        );

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
            comparison_rows: months,
            summary: summary || {}
        });
    } catch (error) {
        console.error('Prepaid schedule detail could not be loaded:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Schedule detail could not be loaded' });
    }
});

router.patch('/source-rows/:rowId', ...access('editar'), async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const rowId = Number(req.params.rowId);
        const [[existing]] = await connection.query(
            `SELECT id, schedule_id
             FROM prepaid_source_rows
             WHERE id = ?
             LIMIT 1`,
            [rowId]
        );

        if (!existing) {
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
            return res.json({ success: true, schedule_id: existing.schedule_id });
        }

        await connection.beginTransaction();
        await connection.query(
            `UPDATE prepaid_source_rows
             SET ${updates.join(', ')}
             WHERE id = ?`,
            [...params, rowId]
        );
        await connection.query('DELETE FROM prepaid_amortization_months WHERE schedule_id = ?', [existing.schedule_id]);
        await connection.query('DELETE FROM prepaid_bills WHERE schedule_id = ?', [existing.schedule_id]);
        await updateScheduleCounts(connection, existing.schedule_id);
        await connection.query('UPDATE prepaid_schedules SET status = "SOURCE_LOADED", generated_at = NULL WHERE id = ?', [existing.schedule_id]);
        await connection.commit();

        res.json({ success: true, schedule_id: existing.schedule_id, needs_regenerate: true });
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
        const [[schedule]] = await connection.query('SELECT * FROM prepaid_schedules WHERE id = ? LIMIT 1', [scheduleId]);

        if (!schedule) {
            return res.status(404).json({ success: false, message: 'Schedule was not found' });
        }

        const [sourceRows] = await connection.query(
            `SELECT *
             FROM prepaid_source_rows
             WHERE schedule_id = ?
               AND include_in_schedule = 1
             ORDER BY store_number + 0, store_number, source_row_number`,
            [scheduleId]
        );

        if (!sourceRows.length) {
            return res.status(400).json({ success: false, message: 'There are no included bills to amortize.' });
        }

        await connection.beginTransaction();
        await connection.query('DELETE FROM prepaid_amortization_months WHERE schedule_id = ?', [scheduleId]);
        await connection.query('DELETE FROM prepaid_bills WHERE schedule_id = ?', [scheduleId]);

        let insertedBills = 0;
        let insertedMonths = 0;

        for (const source of sourceRows) {
            const calculation = calculateBillAmortization({
                amountPaid: source.amount_paid,
                amortizationStart: schedule.amortization_start,
                amortizationEnd: schedule.amortization_end
            });

            const [billResult] = await connection.query(
                `INSERT INTO prepaid_bills
                 (schedule_id, source_row_id, store_number, payee, doc_number, bill_date, tax_year,
                  amount_paid, source_account, prepaid_account, expense_account, amortization_start,
                  amortization_end, total_months, monthly_amount)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    scheduleId,
                    source.id,
                    source.store_number,
                    source.payee,
                    source.doc_number,
                    source.doc_date || source.posted_date,
                    source.tax_year || schedule.tax_year,
                    source.amount_paid,
                    source.source_account || schedule.source_account,
                    source.prepaid_account || schedule.prepaid_account,
                    source.expense_account || schedule.expense_account,
                    schedule.amortization_start,
                    schedule.amortization_end,
                    calculation.totalMonths,
                    calculation.monthlyAmount
                ]
            );

            insertedBills += 1;

            if (calculation.months.length) {
                const monthValues = calculation.months.map(month => [
                    scheduleId,
                    billResult.insertId,
                    source.id,
                    source.store_number,
                    month.period_year,
                    month.period_month,
                    month.period_code,
                    month.expected_amount,
                    0,
                    month.expected_amount,
                    'PENDING_GL'
                ]);

                await connection.query(
                    `INSERT INTO prepaid_amortization_months
                     (schedule_id, bill_id, source_row_id, store_number, period_year, period_month,
                      period_code, expected_amount, gl_actual_amount, difference, status)
                     VALUES ?`,
                    [monthValues]
                );

                insertedMonths += monthValues.length;
            }
        }

        await updateScheduleCounts(connection, scheduleId);
        await connection.query('UPDATE prepaid_schedules SET status = "GENERATED", generated_at = NOW() WHERE id = ?', [scheduleId]);
        await connection.commit();

        res.json({
            success: true,
            schedule_id: scheduleId,
            inserted_bills: insertedBills,
            inserted_months: insertedMonths
        });
    } catch (error) {
        await connection.rollback();
        console.error('Prepaid schedule could not be generated:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: error.message || 'Schedule could not be generated' });
    } finally {
        connection.release();
    }
});

router.post('/upload-gl', ...access('crear'), upload.single('glFile'), async (req, res) => {
    const connection = await pool.getConnection();

    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No monthly GL file was received' });
        }

        const scheduleId = Number(req.body.schedule_id);
        const parsed = parseMonthlyGlActuals(req.file.buffer);
        const inferredPeriod = inferGlPeriod(parsed);
        const periodYear = parseYear(req.body.period_year || req.body.schedule_year || inferredPeriod.year, inferredPeriod.year);
        const periodMonth = parseMonth(req.body.period_month || inferredPeriod.month);

        if (!scheduleId) {
            return res.status(400).json({ success: false, message: 'Select a schedule before uploading the monthly GL.' });
        }

        if (!periodYear || !periodMonth) {
            return res.status(400).json({ success: false, message: 'The monthly GL period could not be inferred from the report dates.' });
        }

        await connection.beginTransaction();

        await connection.query(
            `DELETE d
             FROM prepaid_gl_details d
             JOIN prepaid_gl_uploads u ON u.id = d.gl_upload_id
             WHERE u.schedule_id = ?
               AND u.period_year = ?
               AND u.period_month = ?`,
            [scheduleId, periodYear, periodMonth]
        );
        await connection.query(
            `DELETE FROM prepaid_gl_uploads
             WHERE schedule_id = ?
               AND period_year = ?
               AND period_month = ?`,
            [scheduleId, periodYear, periodMonth]
        );

        const [uploadResult] = await connection.query(
            `INSERT INTO prepaid_gl_uploads
             (schedule_id, period_year, period_month, file_name, file_hash, sheet_name,
              parsed_row_count, uploaded_by, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                scheduleId,
                periodYear,
                periodMonth,
                req.file.originalname,
                hashBuffer(req.file.buffer),
                parsed.sheetName,
                parsed.details.length,
                getUserId(req),
                JSON.stringify({ periodCode: periodCode(periodMonth, periodYear) })
            ]
        );

        if (parsed.details.length) {
            await connection.query(
                `INSERT INTO prepaid_gl_details
                 (gl_upload_id, source_row_number, posted_date, doc_date, doc_number, memo_description,
                  store_number, debit, credit, signed_amount, actual_amount, raw_json)
                 VALUES ?`,
                [parsed.details.map(detail => [
                    uploadResult.insertId,
                    detail.source_row_number,
                    detail.posted_date,
                    detail.doc_date,
                    detail.doc_number,
                    detail.memo_description,
                    detail.store_number,
                    detail.debit,
                    detail.credit,
                    detail.signed_amount,
                    detail.actual_amount,
                    JSON.stringify(detail.raw_json)
                ])]
            );
        }

        const [monthRows] = await connection.query(
            `SELECT id, store_number, expected_amount
             FROM prepaid_amortization_months
             WHERE schedule_id = ?
               AND period_year = ?
               AND period_month = ?`,
            [scheduleId, periodYear, periodMonth]
        );

        let matched = 0;
        let differences = 0;
        let missing = 0;

        for (const row of monthRows) {
            const actual = roundMoney(parsed.actualByStore.get(String(row.store_number)) || 0);
            const expected = roundMoney(row.expected_amount);
            const difference = roundMoney(actual - expected);
            let status = 'MATCHED';

            if (Math.abs(actual) <= 0.01 && Math.abs(expected) > 0.01) {
                status = 'MISSING_GL';
                missing += 1;
            } else if (Math.abs(difference) > 0.01) {
                status = 'DIFFERENCE';
                differences += 1;
            } else {
                matched += 1;
            }

            await connection.query(
                `UPDATE prepaid_amortization_months
                 SET gl_actual_amount = ?,
                     difference = ?,
                     status = ?,
                     gl_upload_id = ?
                 WHERE id = ?`,
                [actual, difference, status, uploadResult.insertId, row.id]
            );
        }

        await connection.query(
            `UPDATE prepaid_gl_uploads
             SET matched_count = ?,
                 difference_count = ?,
                 missing_count = ?
             WHERE id = ?`,
            [matched, differences, missing, uploadResult.insertId]
        );
        await refreshScheduleStatus(connection, scheduleId);

        const [differenceRows] = await connection.query(
            `SELECT pam.store_number,
                    pb.payee,
                    pb.doc_number,
                    pam.expected_amount,
                    pam.gl_actual_amount,
                    pam.difference,
                    pam.status
             FROM prepaid_amortization_months pam
             JOIN prepaid_bills pb ON pb.id = pam.bill_id
             WHERE pam.schedule_id = ?
               AND pam.period_year = ?
               AND pam.period_month = ?
               AND pam.status IN ('DIFFERENCE', 'MISSING_GL')
             ORDER BY ABS(pam.difference) DESC, pam.store_number + 0, pam.store_number`,
            [scheduleId, periodYear, periodMonth]
        );

        await connection.commit();

        res.json({
            success: true,
            schedule_id: scheduleId,
            period_code: periodCode(periodMonth, periodYear),
            parsed_rows: parsed.details.length,
            matched,
            differences,
            missing_gl: missing,
            difference_rows: differenceRows
        });
    } catch (error) {
        await connection.rollback();
        console.error('Prepaid GL could not be uploaded:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: error.message || 'Monthly GL could not be uploaded' });
    } finally {
        connection.release();
    }
});

router.get('/:scheduleId/comparison', ...access('ver'), async (req, res) => {
    try {
        const scheduleId = Number(req.params.scheduleId);
        const [rows] = await pool.query(
            `SELECT pam.id,
                    pam.store_number,
                    pb.payee,
                    pb.doc_number,
                    pam.period_code,
                    pam.period_year,
                    pam.period_month,
                    pam.expected_amount,
                    pam.gl_actual_amount,
                    pam.difference,
                    pam.status
             FROM prepaid_amortization_months pam
             JOIN prepaid_bills pb ON pb.id = pam.bill_id
             WHERE pam.schedule_id = ?
             ORDER BY pam.period_year, pam.period_month, pam.store_number + 0, pam.store_number`,
            [scheduleId]
        );

        res.json({ success: true, rows });
    } catch (error) {
        console.error('Prepaid comparison could not be loaded:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Comparison could not be loaded' });
    }
});

router.get('/:scheduleId/export', ...access('exportar'), async (req, res) => {
    try {
        const scheduleId = Number(req.params.scheduleId);
        const schedule = await loadScheduleOr404(scheduleId, res);
        if (!schedule) return;

        const [sourceRows] = await pool.query(
            `SELECT source_row_number, include_in_schedule, exception_reason, store_number, payee,
                    doc_number, doc_date, tax_year, amount_paid, source_account, prepaid_account,
                    expense_account, memo_description
             FROM prepaid_source_rows
             WHERE schedule_id = ?
             ORDER BY source_row_number`,
            [scheduleId]
        );

        const [billRows] = await pool.query(
            `SELECT store_number, payee, doc_number, bill_date, tax_year, amount_paid,
                    source_account, prepaid_account, expense_account, amortization_start,
                    amortization_end, total_months, monthly_amount
             FROM prepaid_bills
             WHERE schedule_id = ?
             ORDER BY store_number + 0, store_number`,
            [scheduleId]
        );

        const [monthRows] = await pool.query(
            `SELECT pam.store_number, pb.payee, pb.doc_number, pam.period_code,
                    pam.expected_amount, pam.gl_actual_amount, pam.difference, pam.status
             FROM prepaid_amortization_months pam
             JOIN prepaid_bills pb ON pb.id = pam.bill_id
             WHERE pam.schedule_id = ?
             ORDER BY pam.period_year, pam.period_month, pam.store_number + 0, pam.store_number`,
            [scheduleId]
        );

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sourceRows), 'Source Bills');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(billRows), 'Bill Summary');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(monthRows), 'Monthly Validation');

        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const safeTitle = String(schedule.title || 'prepaid-schedule')
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 90);

        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle || 'prepaid-schedule'}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Prepaid export could not be created:', error);
        if (tableSetupMessage(error, res)) return;
        res.status(500).json({ success: false, message: 'Export could not be created' });
    }
});

module.exports = router;
