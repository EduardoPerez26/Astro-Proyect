const systemCenterState = {
    health: null,
    admin: null,
    errors: null
};

document.addEventListener('DOMContentLoaded', () => {
    document
        .getElementById('refreshSystemCenter')
        ?.addEventListener('click', loadSystemCenter);
    document
        .getElementById('exportSystemCenter')
        ?.addEventListener('click', exportSystemCenterReport);

    loadSystemCenter();
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
        const [health, admin, errors] = await Promise.all([
            fetchJson(`${window.API_URL}/dashboard/system-health`, { headers }),
            fetchJson(`${window.API_URL}/dashboard/admin`, { headers }),
            fetchJson(`${window.API_URL}/notificaciones/system-errors?status=open&limit=5`, { headers })
        ]);

        systemCenterState.health = health;
        systemCenterState.admin = admin;
        systemCenterState.errors = errors;

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

    const missingRequired = config.missingRequired || [];
    const missingRecommended = config.missingRecommended || [];
    const integrations = config.integrations || [];
    const enabledIntegrations = integrations.filter(item => item.enabled);
    const configuredIntegrations = integrations.filter(item => item.enabled && item.configured);
    const openErrors = Number(errorSummary.abiertos || 0);
    const criticalErrors = Number(errorSummary.criticos_abiertos || 0);
    const activeSessions = Number(summary.sesiones_activas || 0);
    const activeUsers = Number(summary.usuarios_activos || 0);

    const score = calculateReadinessScore({
        missingRequired,
        missingRecommended,
        enabledIntegrations,
        configuredIntegrations,
        openErrors,
        criticalErrors,
        activeUsers
    });

    setText('systemReadinessScore', `${score}%`);
    setText('systemReadinessLabel', score >= 90 ? 'Corporate ready' : score >= 75 ? 'Stable with attention' : 'Action required');
    setText('systemApiStatus', health.success ? 'Online' : 'Needs attention');
    setText('systemApiMeta', health.status || 'Health endpoint checked');
    setText('systemIntegrationCount', `${configuredIntegrations.length}/${enabledIntegrations.length || integrations.length}`);
    setText('systemIntegrationMeta', enabledIntegrations.length ? 'Enabled connectors configured' : 'No optional connectors enabled');
    setText('systemAttentionCount', missingRequired.length + criticalErrors + openErrors);
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

    renderChecklist({ missingRequired, missingRecommended, openErrors, criticalErrors, activeSessions, activeUsers });
    renderConfiguration(config);
    renderIntegrations(integrations);
    renderIncidents(errors.errores || [], errorSummary);
    renderAccess(summary);
    renderRecommendations({ missingRequired, missingRecommended, integrations, openErrors, criticalErrors, activeUsers });
}

function calculateReadinessScore(context) {
    let score = 100;

    score -= Math.min(context.missingRequired.length * 18, 54);
    score -= Math.min(context.missingRecommended.length * 6, 18);
    score -= Math.min(context.criticalErrors * 12, 36);
    score -= Math.min(context.openErrors * 2, 20);

    const enabled = context.enabledIntegrations.length;
    const configured = context.configuredIntegrations.length;
    if (enabled && configured < enabled) {
        score -= Math.min((enabled - configured) * 8, 16);
    }

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

function renderIntegrations(integrations) {
    const container = document.getElementById('systemIntegrationList');
    if (!container) return;

    if (!integrations.length) {
        container.innerHTML = '<div class="system-center-empty">No integration metadata returned.</div>';
        return;
    }

    container.innerHTML = integrations.map(integration => renderStatusRow({
        label: integration.name,
        value: integration.enabled
            ? (integration.configured ? 'Configured' : 'Incomplete')
            : 'Disabled',
        detail: integration.enabled
            ? `${integration.configuredKeys || 0} of ${integration.expectedKeys || 0} credential groups detected.`
            : 'Optional integration is not enabled.',
        tone: !integration.enabled ? 'neutral' : integration.configured ? 'success' : 'warning'
    })).join('');
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

    if (context.integrations.some(item => item.enabled && !item.configured)) {
        actions.push({
            title: 'Finish integration credentials',
            detail: 'At least one enabled connector is missing credential configuration.',
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

    ['systemConfigList', 'systemIntegrationList', 'systemIncidentList', 'systemAccessList', 'systemActionList'].forEach(id => {
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
    const integrations = config.integrations || [];
    const enabledIntegrations = integrations.filter(item => item.enabled);
    const configuredIntegrations = integrations.filter(item => item.enabled && item.configured);
    const score = calculateReadinessScore({
        missingRequired: config.missingRequired || [],
        missingRecommended: config.missingRecommended || [],
        enabledIntegrations,
        configuredIntegrations,
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
            missing_recommended: config.missingRecommended || [],
            integrations
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
