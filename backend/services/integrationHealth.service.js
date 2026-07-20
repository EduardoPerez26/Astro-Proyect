// ============================================
// INTEGRATION HEALTH MONITOR
// Real-time health probes for corporate integrations.
// Each probe is isolated (timeout + try/catch) so a single
// failing provider never blocks the monitor response.
// ============================================

const nodemailer = require('nodemailer');

const { pool } = require('../config/database');
const { getIntacctConfigStatus } = require('./intacctConfig.service');
const { testIntacctConnection } = require('./intacctClient.service');
const { smtpStatus } = require('./corporateReport.service');
const { ensureCorporateSchema } = require('./corporatePlatform.service');
const { getAdminUserIds, getAdminEmails } = require('./error-notification.service');
const { createNotificationsForUsers } = require('./notifications.service');

const LATENCY_HISTORY_RETENTION_DAYS = 30;

const DEFAULT_TIMEOUT_MS = 6000;

// Status vocabulary shared with the frontend badges.
const STATUS = { ONLINE: 'online', WARNING: 'warning', OFFLINE: 'offline' };

function nowIso() {
    return new Date().toISOString();
}

// Run a probe, measuring latency and enforcing a hard timeout so a hung
// external service cannot stall the whole monitor.
async function runProbe(fn, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const startedAt = Date.now();
    try {
        const result = await Promise.race([
            Promise.resolve().then(fn),
            new Promise((_, reject) => {
                const timer = setTimeout(() => reject(Object.assign(new Error('Probe timed out'), { code: 'PROBE_TIMEOUT' })), timeoutMs);
                if (timer.unref) timer.unref();
            })
        ]);
        return { ...result, latency_ms: Date.now() - startedAt };
    } catch (error) {
        return {
            status: error.code === 'PROBE_TIMEOUT' ? STATUS.WARNING : STATUS.OFFLINE,
            detail: String(error.message || 'Health probe failed').slice(0, 400),
            latency_ms: Date.now() - startedAt
        };
    }
}

// Fetch with an AbortController-backed timeout.
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// -----------------------------------------------------------------------------
// Individual probes
// -----------------------------------------------------------------------------
function checkDatabase() {
    return runProbe(async () => {
        await pool.query('SELECT 1');
        return { status: STATUS.ONLINE, detail: 'Database responded to a health query.' };
    });
}

function checkSageIntacct() {
    const config = getIntacctConfigStatus();
    if (!config.ready) {
        return Promise.resolve({
            status: STATUS.WARNING,
            detail: `Not configured. Missing: ${(config.missing || []).join(', ') || 'credentials'}`,
            latency_ms: null,
            configured: false
        });
    }
    return runProbe(async () => {
        const connection = await testIntacctConnection();
        return {
            status: connection.sessionIssued ? STATUS.ONLINE : STATUS.WARNING,
            detail: connection.sessionIssued
                ? 'Credentials accepted and an API session was issued.'
                : 'Reachable, but no API session identifier was returned.',
            configured: true
        };
    });
}

function checkSmtp() {
    const smtp = smtpStatus();
    if (!smtp.ready) {
        return Promise.resolve({
            status: STATUS.WARNING,
            detail: 'SMTP host or sender is not configured. Email delivery is disabled.',
            latency_ms: null,
            configured: false
        });
    }
    return runProbe(async () => {
        const port = Number(process.env.SMTP_PORT || 587);
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port,
            secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
            auth: process.env.SMTP_USER
                ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
                : undefined,
            connectionTimeout: DEFAULT_TIMEOUT_MS
        });
        await transporter.verify();
        return { status: STATUS.ONLINE, detail: `SMTP server ${smtp.host} accepted the connection.`, configured: true };
    });
}

function checkAiAssistant() {
    const provider = String(process.env.AI_PROVIDER || 'openai').trim().toLowerCase();

    if (provider === 'ollama') {
        return runProbe(async () => {
            const base = String(process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/chat').replace(/\/api\/chat$/, '');
            const response = await fetchWithTimeout(`${base}/api/tags`, { headers: { Accept: 'application/json' } });
            if (!response.ok) {
                return { status: STATUS.WARNING, detail: `Ollama responded with HTTP ${response.status}.`, configured: true };
            }
            return { status: STATUS.ONLINE, detail: 'Ollama is reachable and serving local models.', configured: true };
        });
    }

    if (provider === 'gemini') {
        const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
        if (!apiKey) {
            return Promise.resolve({
                status: STATUS.WARNING,
                detail: 'GEMINI_API_KEY is not set. The AI assistant is disabled.',
                latency_ms: null,
                configured: false
            });
        }
        return runProbe(async () => {
            const response = await fetchWithTimeout(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
            );
            if (!response.ok) {
                return {
                    status: response.status === 400 || response.status === 401 ? STATUS.OFFLINE : STATUS.WARNING,
                    detail: `Gemini responded with HTTP ${response.status}.`,
                    configured: true
                };
            }
            return { status: STATUS.ONLINE, detail: 'Gemini API key is valid and the service is reachable.', configured: true };
        });
    }

    if (provider === 'claude' || provider === 'anthropic') {
        const apiKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
        if (!apiKey) {
            return Promise.resolve({
                status: STATUS.WARNING,
                detail: 'ANTHROPIC_API_KEY is not set. The AI assistant is disabled.',
                latency_ms: null,
                configured: false
            });
        }
        return runProbe(async () => {
            const response = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
                headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
            });
            if (!response.ok) {
                return {
                    status: response.status === 401 ? STATUS.OFFLINE : STATUS.WARNING,
                    detail: `Claude responded with HTTP ${response.status}.`,
                    configured: true
                };
            }
            return { status: STATUS.ONLINE, detail: 'Claude API key is valid and the service is reachable.', configured: true };
        });
    }

    const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) {
        return Promise.resolve({
            status: STATUS.WARNING,
            detail: 'OPENAI_API_KEY is not set. The AI assistant is disabled.',
            latency_ms: null,
            configured: false
        });
    }
    return runProbe(async () => {
        const response = await fetchWithTimeout('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` }
        });
        if (!response.ok) {
            return {
                status: response.status === 401 ? STATUS.OFFLINE : STATUS.WARNING,
                detail: `OpenAI responded with HTTP ${response.status}.`,
                configured: true
            };
        }
        return { status: STATUS.ONLINE, detail: 'OpenAI API key is valid and the service is reachable.', configured: true };
    });
}

function checkCdtfa() {
    // Public tax-rate API. A lightweight known-coordinate lookup confirms reachability.
    return runProbe(async () => {
        const url = 'https://services.maps.cdtfa.ca.gov/api/taxrate/GetRateByLngLat?longitude=-121.4944&latitude=38.5816';
        const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) {
            return { status: STATUS.WARNING, detail: `CDTFA responded with HTTP ${response.status}.`, configured: true };
        }
        return { status: STATUS.ONLINE, detail: 'CDTFA tax-rate API is reachable.', configured: true };
    });
}

// -----------------------------------------------------------------------------
// Aggregate monitor
// -----------------------------------------------------------------------------
const AI_PROVIDER_LABELS = {
    openai: 'OpenAI',
    gemini: 'Gemini',
    claude: 'Claude',
    anthropic: 'Claude',
    ollama: 'Ollama'
};

function aiAssistantName() {
    const provider = String(process.env.AI_PROVIDER || 'openai').trim().toLowerCase();
    return AI_PROVIDER_LABELS[provider] || 'AI assistant';
}

const PROVIDERS = [
    { provider: 'database', name: 'Base de datos', icon: 'fa-database', probe: checkDatabase },
    { provider: 'sage-intacct', name: 'Sage Intacct', icon: 'fa-building-columns', probe: checkSageIntacct },
    { provider: 'smtp', name: 'SMTP', icon: 'fa-envelope', probe: checkSmtp },
    { provider: 'ai-assistant', get name() { return aiAssistantName(); }, icon: 'fa-robot', probe: checkAiAssistant },
    { provider: 'cdtfa', name: 'CDTFA Tax API', icon: 'fa-percent', probe: checkCdtfa }
];

// Last recorded synchronization per provider, used for the "última sync" column.
async function lastSyncByProvider() {
    try {
        const [rows] = await pool.query(
            `SELECT provider, MAX(completed_at) AS last_sync
             FROM corporate_integration_runs
             WHERE status = 'completed' AND completed_at IS NOT NULL
             GROUP BY provider`
        );
        return new Map(rows.map(row => [row.provider, row.last_sync]));
    } catch (error) {
        // Table may not exist yet on a fresh install; degrade gracefully.
        return new Map();
    }
}

// Best-effort snapshot write: a monitoring hiccup should never break the health response.
async function recordLatencySnapshot(providers) {
    try {
        await ensureCorporateSchema();
        await Promise.all(
            providers.map(provider => pool.query(
                `INSERT INTO corporate_integration_latency_history (provider, status, latency_ms)
                 VALUES (?, ?, ?)`,
                [provider.provider, provider.status, provider.latency_ms]
            ))
        );
        await pool.query(
            `DELETE FROM corporate_integration_latency_history
             WHERE checked_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [LATENCY_HISTORY_RETENTION_DAYS]
        );
    } catch (error) {
        console.warn('Integration latency snapshot could not be recorded:', error.code || error.message);
    }
}

async function sendIntegrationOutageEmail(offlineProviders) {
    if (!offlineProviders.length) return;

    const smtp = smtpStatus();
    if (!smtp.ready) return;

    try {
        const emails = await getAdminEmails();
        if (!emails.length) return;

        const port = Number(process.env.SMTP_PORT || 587);
        const transporter = nodemailer.createTransport({
            host: smtp.host,
            port,
            secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
            auth: process.env.SMTP_USER
                ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
                : undefined
        });

        const providerList = offlineProviders
            .map(provider => `- ${provider.name}: ${provider.detail || 'no details available'}`)
            .join('\n');

        await transporter.sendMail({
            from: smtp.from,
            to: emails.join(', '),
            subject: `[XBFS] Integration outage: ${offlineProviders.map(p => p.name).join(', ')}`,
            text: `The following integrations failed their health check:\n\n${providerList}\n\nCheck System Center for details.`
        });
    } catch (error) {
        console.warn('Integration outage email could not be sent:', error.code || error.message);
    }
}

// Tracks each provider's previous status in memory so alerts fire only on
// transitions (never spams every 5-minute heartbeat while an outage persists).
const lastKnownStatus = new Map();

async function notifyAdminsAboutIntegrationIssues(providers) {
    const transitions = providers.filter(provider => {
        const previous = lastKnownStatus.get(provider.provider);
        lastKnownStatus.set(provider.provider, provider.status);

        return Boolean(previous) && previous !== provider.status &&
            (previous === STATUS.OFFLINE || provider.status === STATUS.OFFLINE);
    });

    if (!transitions.length) return;
    try {
        const adminIds = await getAdminUserIds();
        if (!adminIds.length) return;

        await Promise.all(transitions.map(provider => {
            const recovered = provider.status !== STATUS.OFFLINE;

            return createNotificationsForUsers(adminIds, {
                tipo: 'integracion',
                prioridad: recovered ? 'normal' : 'high',
                titulo: recovered
                    ? `${provider.name} is back online`
                    : `${provider.name} integration is offline`,
                mensaje: recovered
                    ? `${provider.name} recovered. Latency: ${provider.latency_ms ?? 'n/a'}ms.`
                    : `${provider.name} failed its health check: ${provider.detail || 'no details available'}.`,
                urlAccion: '/views/system-center',
                metadata: {
                    provider: provider.provider,
                    status: provider.status,
                    latency_ms: provider.latency_ms,
                    checked_at: provider.checked_at
                }
            });
        }));
    } catch (error) {
        console.warn('Integration status notification could not be sent:', error.code || error.message);
    }
}

// Recent raw points per provider for sparklines (oldest first).
async function getLatencySparklines(limit = 24) {
    try {
        await ensureCorporateSchema();
        const [rows] = await pool.query(
            `SELECT provider, latency_ms, checked_at
             FROM (
                 SELECT provider, latency_ms, checked_at,
                        ROW_NUMBER() OVER (PARTITION BY provider ORDER BY checked_at DESC) AS rn
                 FROM corporate_integration_latency_history
             ) ranked
             WHERE rn <= ?
             ORDER BY provider, checked_at ASC`,
            [limit]
        );

        const byProvider = {};
        rows.forEach(row => {
            if (!byProvider[row.provider]) byProvider[row.provider] = [];
            byProvider[row.provider].push(row.latency_ms === null ? null : Number(row.latency_ms));
        });

        return byProvider;
    } catch (error) {
        console.warn('Latency sparkline history could not be loaded:', error.code || error.message);
        return {};
    }
}

// Daily average latency per provider over the trailing window, for the "last N days" view.
async function getLatencyDailyAverages(days = 7) {
    try {
        await ensureCorporateSchema();
        const [rows] = await pool.query(
            `SELECT provider, DATE(checked_at) AS day, AVG(latency_ms) AS avg_latency_ms
             FROM corporate_integration_latency_history
             WHERE checked_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
               AND latency_ms IS NOT NULL
             GROUP BY provider, DATE(checked_at)
             ORDER BY provider, day ASC`,
            [days]
        );

        const byProvider = {};
        rows.forEach(row => {
            if (!byProvider[row.provider]) byProvider[row.provider] = [];
            byProvider[row.provider].push({
                day: row.day,
                avg_latency_ms: row.avg_latency_ms === null ? null : Math.round(Number(row.avg_latency_ms))
            });
        });

        return byProvider;
    } catch (error) {
        console.warn('Latency daily average history could not be loaded:', error.code || error.message);
        return {};
    }
}

async function checkAllIntegrations() {
    const lastSync = await lastSyncByProvider();
    const providers = await Promise.all(
        PROVIDERS.map(async definition => {
            const result = await definition.probe();
            return {
                provider: definition.provider,
                name: definition.name,
                icon: definition.icon,
                status: result.status || STATUS.OFFLINE,
                latency_ms: result.latency_ms === undefined ? null : result.latency_ms,
                detail: result.detail || null,
                configured: result.configured === undefined ? true : result.configured,
                last_sync: lastSync.get(definition.provider) || null,
                checked_at: nowIso()
            };
        })
    );

    const summary = {
        total: providers.length,
        online: providers.filter(p => p.status === STATUS.ONLINE).length,
        warning: providers.filter(p => p.status === STATUS.WARNING).length,
        offline: providers.filter(p => p.status === STATUS.OFFLINE).length
    };

    // Availability = share of providers currently online.
    summary.availability = summary.total
        ? Math.round((summary.online / summary.total) * 100)
        : 0;

    recordLatencySnapshot(providers);
    notifyAdminsAboutIntegrationIssues(providers);

    return { generated_at: nowIso(), summary, providers };
}

module.exports = {
    STATUS,
    checkAllIntegrations,
    getLatencySparklines,
    getLatencyDailyAverages
};
