const systemCenterState = {
    health: null,
    admin: null,
    errors: null,
    integrationHealth: null
};

const INTEGRATION_POLL_MS = 15000;
let integrationPollTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    document
        .getElementById('refreshSystemCenter')
        ?.addEventListener('click', loadSystemCenter);
    document
        .getElementById('exportSystemCenter')
        ?.addEventListener('click', exportSystemCenterReport);
    document
        .getElementById('systemIntegrationCards')
        ?.addEventListener('click', handleIntegrationCardClick);

    loadSystemCenter();

    integrationPollTimer = setInterval(() => {
        if (!document.hidden) loadIntegrationHealth();
    }, INTEGRATION_POLL_MS);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) loadIntegrationHealth();
    });
    window.addEventListener('beforeunload', () => clearInterval(integrationPollTimer));
});

async function loadSystemCenter() {
    const token = localStorage.getItem('token');
    const button = document.getElementById('refreshSystemCenter');

    if (!token) {
        window.location.href = '/';
        return;
    }

    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing';
    }

    try {
        const headers = { Authorization: `Bearer ${token}` };
        const [health, admin, errors, integrationHealth] = await Promise.all([
            fetchJson(`${window.API_URL}/dashboard/system-health`, { headers }),
            fetchJson(`${window.API_URL}/dashboard/admin`, { headers }),
            fetchJson(`${window.API_URL}/notificaciones/system-errors?status=open&limit=5`, { headers }),
            fetchJson(`${window.API_URL}/corporate/integrations/health`, { headers })
        ]);

        systemCenterState.health = health;
        systemCenterState.admin = admin;
        systemCenterState.errors = errors;
        systemCenterState.integrationHealth = integrationHealth;

        renderSystemCenter();
    } catch (error) {
        console.error('System center error:', error);
        renderSystemCenterError(error);
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fa-solid fa-rotate"></i> Refresh';
        }
    }
}

async function loadIntegrationHealth() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const integrationHealth = await fetchJson(`${window.API_URL}/corporate/integrations/health`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        systemCenterState.integrationHealth = integrationHealth;
        renderIntegrationHealth(integrationHealth);
    } catch (error) {
        console.warn('Integration health poll failed:', error);
    }
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok && response.status !== 503) {
        throw new Error(data.message || data.mensaje || `Request failed: ${response.status}`);
    }

    return {
        ...data,
        httpStatus: response.status
    };
}

function renderSystemCenter() {
    const health = systemCenterState.health || {};
    const admin = systemCenterState.admin || {};
    const errors = systemCenterState.errors || {};
    const config = health.configuration || {};
    const summary = admin.resumen || {};
    const errorSummary = errors.summary || {};
    const integrationHealth = systemCenterState.integrationHealth || {};
    const integrationSummary = integrationHealth.summary || {};

    const missingRequired = config.missingRequired || [];
    const missingRecommended = config.missingRecommended || [];
    const integrationsOnline = Number(integrationSummary.online || 0);
    const integrationsWarning = Number(integrationSummary.warning || 0);
    const integrationsOffline = Number(integrationSummary.offline || 0);
    const integrationsTotal = Number(integrationSummary.total || (integrationsOnline + integrationsWarning + integrationsOffline));
    const openErrors = Number(errorSummary.abiertos || 0);
    const criticalErrors = Number(errorSummary.criticos_abiertos || 0);
    const activeSessions = Number(summary.sesiones_activas || 0);
    const activeUsers = Number(summary.usuarios_activos || 0);

    const score = calculateReadinessScore({
        missingRequired,
        missingRecommended,
        integrationsWarning,
        integrationsOffline,
        openErrors,
        criticalErrors,
        activeUsers
    });

    setText('systemReadinessScore', `${score}%`);
    setText('systemReadinessLabel', score >= 90 ? 'Corporate ready' : score >= 75 ? 'Stable with attention' : 'Action required');
    setText('systemApiStatus', health.success ? 'Online' : 'Needs attention');
    setText('systemApiMeta', health.status || 'Health endpoint checked');
    setText('systemIntegrationCount', `${integrationsOnline}/${integrationsTotal}`);
    setText(
        'systemIntegrationMeta',
        integrationsOffline > 0
            ? `${integrationsOffline} offline, ${integrationsWarning} degraded`
            : integrationsWarning > 0
                ? `${integrationsWarning} degraded`
                : 'All connectors healthy'
    );
    setText('systemAttentionCount', missingRequired.length + criticalErrors + openErrors + integrationsOffline);
    setText('systemAttentionMeta', `${openErrors} open errors / ${missingRequired.length} required config gaps`);
    setText('systemCenterRingScore', `${score}%`);
    setText('systemCenterUpdated', `Updated ${formatDate(new Date(), true)}`);

    const ring = document.getElementById('systemCenterRing');
    if (ring) {
        ring.style.setProperty('--score', String(score));
        ring.classList.toggle('is-warning', score < 90 && score >= 75);
        ring.classList.toggle('is-danger', score < 75);
    }

    setText(
        'systemCenterHealthTitle',
        score >= 90 ? 'Platform is corporate ready' : score >= 75 ? 'Platform is stable' : 'Platform needs administrative attention'
    );
    setText(
        'systemCenterHealthText',
        buildHealthDescription(score, missingRequired, openErrors, criticalErrors)
    );

    renderChecklist({ missingRequired, missingRecommended, openErrors, criticalErrors, activeSessions, activeUsers, integrationsOffline, integrationsWarning });
    renderConfiguration(config);
    renderIntegrationHealth(integrationHealth);
    renderIncidents(errors.errores || [], errorSummary);
    renderAccess(summary);
    renderRecommendations({ missingRequired, missingRecommended, integrationsOffline, integrationsWarning, openErrors, criticalErrors, activeUsers });
}

function calculateReadinessScore(context) {
    let score = 100;

    score -= Math.min(context.missingRequired.length * 18, 54);
    score -= Math.min(context.missingRecommended.length * 6, 18);
    score -= Math.min(context.criticalErrors * 12, 36);
    score -= Math.min(context.openErrors * 2, 20);
    score -= Math.min((context.integrationsOffline || 0) * 10, 30);
    score -= Math.min((context.integrationsWarning || 0) * 4, 16);

    if (context.activeUsers <= 0) score -= 6;

    return Math.max(0, Math.min(100, Math.round(score)));
}

function buildHealthDescription(score, missingRequired, openErrors, criticalErrors) {
    if (missingRequired.length) {
        return 'Required backend configuration is incomplete. Review environment variables before production use.';
    }

    if (criticalErrors > 0) {
        return 'Critical backend incidents are open. Resolve them before considering the platform healthy.';
    }

    if (openErrors > 0) {
        return 'The platform is running, with non-critical incidents still waiting for review.';
    }

    if (score >= 90) {
        return 'Configuration, integrations, incidents, and access signals are within a strong operating range.';
    }

    return 'The platform is operational, with a few administrative items worth tightening.';
}

function renderChecklist(context) {
    const list = document.getElementById('systemCenterChecklist');
    if (!list) return;

    const items = [
        {
            ok: context.missingRequired.length === 0,
            text: context.missingRequired.length
                ? `${context.missingRequired.length} required environment variable(s) missing`
                : 'Required environment variables are present'
        },
        {
            ok: context.criticalErrors === 0,
            text: context.criticalErrors
                ? `${context.criticalErrors} critical incident(s) open`
                : 'No critical incidents open'
        },
        {
            ok: context.openErrors === 0,
            text: context.openErrors
                ? `${context.openErrors} total incident(s) awaiting review`
                : 'No open incident queue'
        },
        {
            ok: context.activeUsers > 0,
            text: `${context.activeSessions} active session(s) across ${context.activeUsers} active user(s)`
        },
        {
            ok: (context.integrationsOffline || 0) === 0 && (context.integrationsWarning || 0) === 0,
            text: context.integrationsOffline
                ? `${context.integrationsOffline} integration(s) offline`
                : context.integrationsWarning
                    ? `${context.integrationsWarning} integration(s) degraded`
                    : 'All integrations are online'
        }
    ];

    list.innerHTML = items.map(item => `
        <li class="${item.ok ? 'is-ok' : 'is-warning'}">
            <i class="fa-solid ${item.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>
            <span>${escapeHtml(item.text)}</span>
        </li>
    `).join('');
}

function renderConfiguration(config) {
    const container = document.getElementById('systemConfigList');
    if (!container) return;

    const required = config.missingRequired || [];
    const recommended = config.missingRecommended || [];
    const rows = [
        {
            label: 'Required configuration',
            value: required.length ? `${required.length} missing` : 'Complete',
            detail: required.length ? required.join(', ') : 'Database and auth essentials are configured.',
            tone: required.length ? 'danger' : 'success'
        },
        {
            label: 'Recommended hardening',
            value: recommended.length ? `${recommended.length} missing` : 'Complete',
            detail: recommended.length ? recommended.join(', ') : 'Recommended operational settings are present.',
            tone: recommended.length ? 'warning' : 'success'
        },
        {
            label: 'Health endpoint',
            value: systemCenterState.health?.httpStatus || '-',
            detail: systemCenterState.health?.timestamp
                ? `Last backend timestamp: ${formatDate(systemCenterState.health.timestamp)}`
                : 'Timestamp unavailable.',
            tone: systemCenterState.health?.success ? 'success' : 'warning'
        }
    ];

    container.innerHTML = rows.map(row => renderStatusRow(row)).join('');
}

function healthStatusTone(status) {
    if (status === 'online') return 'success';
    if (status === 'offline') return 'danger';
    return 'warning';
}

function healthStatusLabel(status) {
    if (status === 'online') return 'Online';
    if (status === 'offline') return 'Offline';
    return 'Warning';
}

function formatLatency(ms) {
    if (ms === null || ms === undefined) return '—';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
}

function renderIntegrationHealth(health) {
    const container = document.getElementById('systemIntegrationCards');
    if (!container) return;

    const live = document.getElementById('systemIntegrationLive');
    const summary = health.summary || {};
    if (live) {
        live.dataset.tone = summary.offline > 0 ? 'danger' : (summary.warning > 0 ? 'warning' : 'success');
        live.title = health.generated_at ? `Last checked ${formatDate(health.generated_at)}` : '';
    }

    const providers = health.providers || [];
    if (!providers.length) {
        container.innerHTML = '<div class="system-center-empty">No integration metadata returned.</div>';
        return;
    }

    container.innerHTML = providers.map(provider => `
        <article class="xb-panel xb-monitor-card" data-tone="${healthStatusTone(provider.status)}">
            <div class="xb-panel__body xb-stack">
                <div class="xb-actions" style="justify-content:space-between">
                    <span class="xb-metric-card__icon"><i class="fa-solid ${escapeHtml(provider.icon || 'fa-plug')}"></i></span>
                    <span class="xb-status xb-status--${healthStatusTone(provider.status)}">${healthStatusLabel(provider.status)}</span>
                </div>
                <div>
                    <h2 style="margin:0;font-size:16px">${escapeHtml(provider.name)}</h2>
                    <p style="margin:4px 0 0;color:#777;font-size:12px;line-height:1.5">${escapeHtml(provider.detail || '')}</p>
                </div>
                <dl class="xb-monitor-meta">
                    <div><dt>Latency</dt><dd>${formatLatency(provider.latency_ms)}</dd></div>
                    <div><dt>Last sync</dt><dd>${provider.last_sync ? formatDate(provider.last_sync, true) : '—'}</dd></div>
                </dl>
                ${provider.provider === 'sage-intacct' ? `
                    <div class="xb-actions">
                        <button class="xb-button xb-button--primary" type="button" data-integration-operation="connection_test" data-integration-provider="sage-intacct"><i class="fa-solid fa-plug-circle-check"></i> Test connection</button>
                    </div>
                ` : ''}
            </div>
        </article>
    `).join('');
}

async function handleIntegrationCardClick(event) {
    const button = event.target.closest('[data-integration-operation]');
    if (!button) return;

    const provider = button.dataset.integrationProvider;
    const operation = button.dataset.integrationOperation;
    const token = localStorage.getItem('token');
    if (!token) return;

    button.disabled = true;
    try {
        const response = await fetch(`${window.API_URL}/corporate/integrations/${provider}/runs`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ operation })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
            throw new Error(data.message || 'Integration request could not be completed.');
        }

        if (window.Swal) {
            Swal.fire({
                icon: data.status === 'failed' ? 'warning' : 'success',
                title: data.status === 'failed' ? 'Connection test failed' : 'Connection test passed',
                text: data.summary,
                timer: data.status === 'failed' ? undefined : 2200,
                showConfirmButton: data.status === 'failed'
            });
        }
        await loadIntegrationHealth();
    } catch (error) {
        if (window.Swal) {
            Swal.fire({ icon: 'error', title: 'Test failed', text: error.message });
        }
    } finally {
        button.disabled = false;
    }
}

function renderIncidents(errors, summary) {
    const container = document.getElementById('systemIncidentList');
    if (!container) return;

    if (!errors.length) {
        container.innerHTML = renderStatusRow({
            label: 'Open incidents',
            value: 'Clear',
            detail: `${Number(summary.resueltos || 0)} resolved incident(s) in the log.`,
            tone: 'success'
        });
        return;
    }

    container.innerHTML = errors.slice(0, 5).map(error => renderStatusRow({
        label: `${error.method || 'API'} ${error.normalized_path || error.request_path || 'Unknown route'}`,
        value: error.status_code >= 500 ? 'Critical' : 'Open',
        detail: truncate(error.error_message || error.error_name || error.error_hash || 'No message', 96),
        tone: error.status_code >= 500 ? 'danger' : 'warning',
        href: '/views/system-errors'
    })).join('');
}

function renderAccess(summary) {
    const container = document.getElementById('systemAccessList');
    if (!container) return;

    const usersTotal = Number(summary.usuarios_total || 0);
    const usersActive = Number(summary.usuarios_activos || 0);
    const sessions = Number(summary.sesiones_activas || 0);
    const departments = Number(summary.departamentos_activos || 0);

    container.innerHTML = [
        renderStatusRow({
            label: 'User availability',
            value: usersTotal ? `${Math.round((usersActive / usersTotal) * 100)}%` : '0%',
            detail: `${usersActive} active of ${usersTotal} registered users.`,
            tone: usersActive > 0 ? 'success' : 'warning'
        }),
        renderStatusRow({
            label: 'Active sessions',
            value: sessions,
            detail: `${Number(summary.inicios_hoy || 0)} sign-in(s) today.`,
            tone: sessions > 0 ? 'success' : 'neutral'
        }),
        renderStatusRow({
            label: 'Department coverage',
            value: departments,
            detail: `${Number(summary.departamentos_total || 0)} department(s) registered.`,
            tone: departments > 0 ? 'success' : 'warning'
        })
    ].join('');
}

function renderRecommendations(context) {
    const container = document.getElementById('systemActionList');
    if (!container) return;

    const actions = [];

    if (context.missingRequired.length) {
        actions.push({
            title: 'Complete required backend configuration',
            detail: `Set ${context.missingRequired.join(', ')} before production deployment.`,
            tone: 'danger'
        });
    }

    if (context.criticalErrors > 0) {
        actions.push({
            title: 'Resolve critical system incidents',
            detail: 'Open the error center and close HTTP 500+ failures first.',
            tone: 'danger',
            href: '/views/system-errors'
        });
    }

    if (context.missingRecommended.length) {
        actions.push({
            title: 'Harden recommended environment settings',
            detail: `Review ${context.missingRecommended.join(', ')} for stronger operational readiness.`,
            tone: 'warning'
        });
    }

    if (context.integrationsOffline > 0) {
        actions.push({
            title: 'Restore offline integrations',
            detail: `${context.integrationsOffline} connector(s) are unreachable. Check credentials and network access.`,
            tone: 'danger'
        });
    } else if (context.integrationsWarning > 0) {
        actions.push({
            title: 'Finish integration configuration',
            detail: `${context.integrationsWarning} connector(s) are degraded or missing configuration.`,
            tone: 'warning'
        });
    }

    if (context.activeUsers <= 0) {
        actions.push({
            title: 'Validate user activation and access policy',
            detail: 'No active users were reported by the admin dashboard summary.',
            tone: 'warning',
            href: '/views/usuarios'
        });
    }

    if (!actions.length) {
        actions.push({
            title: 'Maintain weekly corporate readiness review',
            detail: 'Configuration, incidents, integrations, and access posture are currently in good shape.',
            tone: 'success'
        });
    }

    container.innerHTML = actions.map(action => renderStatusRow({
        label: action.title,
        value: action.tone === 'success' ? 'Ready' : 'Action',
        detail: action.detail,
        tone: action.tone,
        href: action.href
    })).join('');
}

function renderStatusRow(row) {
    const tag = row.href ? 'a' : 'div';
    const href = row.href ? ` href="${escapeHtml(row.href)}"` : '';

    return `
        <${tag}${href} class="system-center-row is-${escapeHtml(row.tone || 'neutral')}">
            <span class="system-center-row-dot"></span>
            <span class="system-center-row-copy">
                <strong>${escapeHtml(row.label)}</strong>
                <small>${escapeHtml(row.detail)}</small>
            </span>
            <span class="system-center-row-value">${escapeHtml(row.value)}</span>
        </${tag}>
    `;
}

function renderSystemCenterError(error) {
    setText('systemCenterUpdated', 'Refresh failed');
    setText('systemReadinessScore', '--');
    setText('systemReadinessLabel', error.message);

    ['systemConfigList', 'systemIntegrationCards', 'systemIncidentList', 'systemAccessList', 'systemActionList'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.innerHTML = `<div class="system-center-empty">${escapeHtml(error.message)}</div>`;
        }
    });
}

function exportSystemCenterReport() {
    const report = buildSystemCenterReport();

    if (!report) {
        if (window.Swal) {
            Swal.fire({
                icon: 'info',
                title: 'Report unavailable',
                text: 'Refresh System center before exporting the report.'
            });
        }
        return;
    }

    const blob = new Blob(
        [JSON.stringify(report, null, 2)],
        { type: 'application/json;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `system-center-report-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function buildSystemCenterReport() {
    if (!systemCenterState.health && !systemCenterState.admin && !systemCenterState.errors) {
        return null;
    }

    const health = systemCenterState.health || {};
    const admin = systemCenterState.admin || {};
    const errors = systemCenterState.errors || {};
    const config = health.configuration || {};
    const summary = admin.resumen || {};
    const errorSummary = errors.summary || {};
    const integrationHealth = systemCenterState.integrationHealth || {};
    const integrationSummary = integrationHealth.summary || {};
    const score = calculateReadinessScore({
        missingRequired: config.missingRequired || [],
        missingRecommended: config.missingRecommended || [],
        integrationsWarning: Number(integrationSummary.warning || 0),
        integrationsOffline: Number(integrationSummary.offline || 0),
        openErrors: Number(errorSummary.abiertos || 0),
        criticalErrors: Number(errorSummary.criticos_abiertos || 0),
        activeUsers: Number(summary.usuarios_activos || 0)
    });

    return {
        generated_at: new Date().toISOString(),
        readiness_score: score,
        api_status: health.status || null,
        http_status: health.httpStatus || null,
        configuration: {
            missing_required: config.missingRequired || [],
            missing_recommended: config.missingRecommended || []
        },
        integrations: {
            summary: integrationSummary,
            providers: integrationHealth.providers || []
        },
        incidents: {
            summary: errorSummary,
            open_items: errors.errores || []
        },
        access: {
            total_users: Number(summary.usuarios_total || 0),
            active_users: Number(summary.usuarios_activos || 0),
            active_sessions: Number(summary.sesiones_activas || 0),
            active_departments: Number(summary.departamentos_activos || 0),
            sign_ins_today: Number(summary.inicios_hoy || 0)
        }
    };
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value ?? '';
}

function formatDate(value, short = false) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    return date.toLocaleString('en-US', short
        ? { hour: '2-digit', minute: '2-digit' }
        : { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function truncate(value, max) {
    const text = String(value || '');
    return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
