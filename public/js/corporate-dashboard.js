(function () {
    const root = document.getElementById('corporateExecutiveSummary');
    if (!root || !window.API_URL) return;

    const currency = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    });

    function setText(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
    }

    function setRate(value) {
        const safeValue = Math.max(0, Math.min(Number(value || 0), 100));
        setText('corporateCloseRate', `${safeValue}%`);
        const bar = document.getElementById('corporateCloseBar');
        if (bar) bar.style.width = `${safeValue}%`;
    }

    async function loadCorporateOverview() {
        const token = localStorage.getItem('token');
        if (!token) return;

        root.setAttribute('aria-busy', 'true');

        try {
            const response = await fetch(`${window.API_URL}/corporate/overview`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok || data.success === false) {
                throw new Error(data.message || 'Corporate overview is unavailable.');
            }

            const summary = data.summary || {};
            const workflow = data.document_workflow || {};

            setRate(summary.close_completion_rate);
            setText('corporateCloseMeta', `${Number(summary.close_tasks_completed || 0)} of ${Number(summary.close_tasks_total || 0)} tasks complete`);
            setText('corporateOpenExceptions', Number(summary.exceptions_open || 0).toLocaleString('en-US'));
            setText('corporateCriticalExceptions', `${Number(summary.exceptions_critical || 0)} critical`);
            setText('corporateExposure', currency.format(Number(summary.exceptions_open_amount || 0)));
            setText('corporateExposureMeta', 'Open exception exposure');
            setText('corporateScheduledReports', Number(summary.active_scheduled_reports || 0).toLocaleString('en-US'));
            setText('corporateReportsMeta', `${Number(summary.reports_due || 0)} currently due`);
            setText('corporateDocumentsReview', Number(workflow.under_review || 0).toLocaleString('en-US'));
            setText('corporateDocumentsMeta', `${Number(workflow.changes_requested || 0)} changes requested`);

            setText('corporateReconciliations', Number(summary.reconciliations_total || 0).toLocaleString('en-US'));
            setText('corporateReconciliationsMeta', `${Number(summary.reconciliations_pending || 0)} pending, last 30 days`);

            setText('corporateNotificationsUnread', Number(summary.notifications_unread || 0).toLocaleString('en-US'));
            setText('corporateNotificationsMeta', Number(summary.notifications_unread || 0) === 1 ? '1 unread for you' : `${Number(summary.notifications_unread || 0)} unread for you`);

            const health = data.integration_health;
            if (health) {
                setText('corporateIntegrationHealth', `${health.online}/${health.online + health.warning + health.offline}`);
                setText(
                    'corporateIntegrationMeta',
                    health.offline > 0
                        ? `${health.offline} offline, ${health.warning} degraded`
                        : health.warning > 0
                            ? `${health.warning} degraded`
                            : 'All connectors healthy'
                );
            } else {
                setText('corporateIntegrationHealth', '—');
                setText('corporateIntegrationMeta', 'Health check unavailable');
            }

            root.classList.remove('has-error');
        } catch (error) {
            console.warn('Corporate dashboard overview:', error);
            root.classList.add('has-error');
            setText('corporateCloseMeta', error.message || 'Corporate metrics could not be loaded.');
        } finally {
            root.setAttribute('aria-busy', 'false');
        }
    }

    window.addEventListener('xbfs:dashboard-refreshed', loadCorporateOverview);
    document.getElementById('refreshAdminDashboard')?.addEventListener('click', loadCorporateOverview);
    document.getElementById('corporateNotificationsTile')?.addEventListener('click', () => {
        document.getElementById('notificationsToggle')?.click();
    });
    loadCorporateOverview();
})();
