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

    return { generated_at: nowIso(), summary, providers };
}

module.exports = {
    STATUS,
    checkAllIntegrations
};
