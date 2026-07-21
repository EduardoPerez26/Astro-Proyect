const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../config/database');
const { ensureCorporateSchema } = require('../services/departments/corporate/corporatePlatform.service');
const { runScheduledReport } = require('../services/departments/corporate/corporateReport.service');

function nextRun(frequency, hour) {
    const next = new Date();
    next.setHours(Number(hour || 8), 0, 0, 0);
    if (next <= new Date()) next.setDate(next.getDate() + 1);
    if (frequency === 'weekly') next.setDate(next.getDate() + ((8 - next.getDay()) % 7 || 7));
    if (frequency === 'monthly') {
        next.setMonth(next.getMonth() + 1, 1);
    }
    return next;
}

async function main() {
    await ensureCorporateSchema();
    const [reports] = await pool.query(
        `SELECT * FROM corporate_scheduled_reports
         WHERE active = TRUE
           AND next_run_at <= NOW()
         ORDER BY next_run_at
         LIMIT 20`
    );

    let successful = 0;
    let failed = 0;
    for (const report of reports) {
        const result = await runScheduledReport(report);
        await pool.query(
            `UPDATE corporate_scheduled_reports
             SET last_run_at = NOW(), last_status = ?, next_run_at = ?
             WHERE id = ?`,
            [result.status, nextRun(report.frequency, report.delivery_hour), report.id]
        );
        if (result.success) successful += 1;
        else failed += 1;
        console.log(`[reports] ${report.name}: ${result.status} (${result.message})`);
    }

    console.log(`[reports] processed=${reports.length} successful=${successful} failed=${failed}`);
    if (failed) process.exitCode = 1;
}

main()
    .catch(error => {
        console.error('[reports] worker failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
