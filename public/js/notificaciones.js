(() => {
    const POLL_INTERVAL_MS = 90000;
    let pollInterval = null;
    let previousUnreadTotal = null;
    let isLoading = false;
    let notificationFilter = 'all';
    let lastNotifications = [];

    document.addEventListener('DOMContentLoaded', () => {
        const center = document.getElementById('notificationCenter');
        const toggle = document.getElementById('notificationsToggle');
        const panel = document.getElementById('notificationsPanel');
        const markAllButton = document.getElementById('notificationsMarkAll');
        const filterBar = document.getElementById('notificationsFilter');

        if (!center || !toggle || !panel) return;

        toggle.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const willOpen = panel.hidden;
            setPanelOpen(willOpen);

            if (willOpen) {
                await loadNotifications({ silent: true });
            }
        });

        panel.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        document.addEventListener('click', () => {
            setPanelOpen(false);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                setPanelOpen(false);
            }
        });

        markAllButton?.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await markAllAsRead();
        });

        filterBar?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-notification-filter]');
            if (!button) return;

            notificationFilter = button.dataset.notificationFilter || 'all';
            updateNotificationFilterState();
            renderNotifications(lastNotifications);
        });

        loadNotifications({ silent: true });
        connectNotificationStream();
        startPolling();
    });

    function setPanelOpen(open) {
        const panel = document.getElementById('notificationsPanel');
        const toggle = document.getElementById('notificationsToggle');
        const center = document.getElementById('notificationCenter');

        if (!panel || !toggle) return;

        panel.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        center?.classList.toggle('is-open', open);
    }

    async function requestJson(path, options = {}) {
        const token = localStorage.getItem('token');
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(`${window.API_URL}${path}`, {
            credentials: 'include',
            ...options,
            headers
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.success === false) {
            throw new Error(data.message || 'Request failed');
        }

        return data;
    }

    async function loadNotifications(options = {}) {
        if (isLoading || !window.API_URL || window.isOfflineMode?.() === true) return;

        const token = localStorage.getItem('token');
        if (!token && !localStorage.getItem('isLoggedIn')) return;

        isLoading = true;

        try {
            const data = await requestJson('/notificaciones?limit=12&include_read=1');
            const total = Number(data.total_no_leidas || 0);
            lastNotifications = data.notificaciones || [];

            renderNotificationBadge(total);
            updateNotificationFilterState();
            renderNotifications(lastNotifications);

            const panelIsClosed = document.getElementById('notificationsPanel')?.hidden !== false;

            if (
                previousUnreadTotal !== null &&
                total > previousUnreadTotal &&
                !options.silent &&
                panelIsClosed
            ) {
                showNotificationToast();
            }

            previousUnreadTotal = total;
        } catch (error) {
            console.warn('Notifications could not be loaded:', error);
            renderNotificationsError();
        } finally {
            isLoading = false;
        }
    }

    function renderNotificationBadge(total) {
        const badge = document.getElementById('notificationsBadge');
        const toggle = document.getElementById('notificationsToggle');

        if (!badge) return;

        badge.hidden = total <= 0;
        badge.textContent = total > 99 ? '99+' : String(total);
        badge.title = total > 0
            ? `${total} unread notification${total === 1 ? '' : 's'}`
            : 'No unread notifications';
        toggle?.classList.toggle('has-notifications', total > 0);
    }

    function renderNotifications(notifications) {
        const list = document.getElementById('notificationsList');
        if (!list) return;

        const visibleNotifications = filterNotifications(notifications);

        if (!visibleNotifications.length) {
            list.innerHTML = `
                <div class="notifications-empty">
                    <i class="fa-regular fa-bell-slash" aria-hidden="true"></i>
                    <strong>No notifications</strong>
                    <span>${getNotificationEmptyCopy()}</span>
                </div>
            `;
            return;
        }

        list.innerHTML = visibleNotifications.map(renderNotificationItem).join('');

        list.querySelectorAll('[data-notification-id]').forEach(item => {
            item.addEventListener('click', async () => {
                const id = item.getAttribute('data-notification-id');
                const url = item.getAttribute('data-action-url');
                await markAsRead(id);

                if (url) {
                    window.location.href = url;
                } else {
                    await loadNotifications({ silent: true });
                }
            });
        });

        list.querySelectorAll('[data-dismiss-notification]').forEach(button => {
            button.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();

                const id = button.getAttribute('data-dismiss-notification');
                await archiveNotification(id);
            });
        });
    }

    function renderNotificationItem(notification) {
        const unreadClass = notification.leida ? '' : ' is-unread';
        const priorityClass = notification.prioridad ? ` priority-${escapeHtml(notification.prioridad)}` : '';
        const typeClass = notification.tipo ? ` type-${escapeHtml(notification.tipo)}` : '';
        const icon = getNotificationIcon(notification.tipo);
        const actionUrl = notification.url_accion || '';

        return `
            <button
                type="button"
                class="notification-item${unreadClass}${priorityClass}${typeClass}"
                data-notification-id="${escapeHtml(notification.id)}"
                data-action-url="${escapeHtml(actionUrl)}"
            >
                <span class="notification-item-icon" aria-hidden="true">
                    <i class="${icon}"></i>
                </span>
                <span class="notification-item-body">
                    <strong>${escapeHtml(notification.titulo || 'Notification')}</strong>
                    <span>${escapeHtml(notification.mensaje || '')}</span>
                    <small>${formatDate(notification.fecha_creacion)}</small>
                </span>
                <span class="notification-item-actions">
                    ${notification.leida ? '' : '<span class="notification-unread-dot" aria-label="Unread"></span>'}
                    <span
                        role="button"
                        tabindex="0"
                        class="notification-dismiss"
                        data-dismiss-notification="${escapeHtml(notification.id)}"
                        aria-label="Dismiss notification"
                    >
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </span>
                </span>
            </button>
        `;
    }

    function filterNotifications(notifications) {
        const systemTypes = ['error', 'warning', 'system', 'security'];

        return notifications.filter(notification => {
            if (notificationFilter === 'unread') {
                return notification.leida !== true;
            }

            if (notificationFilter === 'approval') {
                return notification.tipo === 'approval';
            }

            if (notificationFilter === 'system') {
                return systemTypes.includes(notification.tipo);
            }

            return true;
        });
    }

    function updateNotificationFilterState() {
        const filterBar = document.getElementById('notificationsFilter');
        if (!filterBar) return;

        filterBar
            .querySelectorAll('[data-notification-filter]')
            .forEach(button => {
                button.classList.toggle(
                    'is-active',
                    button.dataset.notificationFilter === notificationFilter
                );
            });
    }

    function getNotificationEmptyCopy() {
        return {
            unread: 'No unread items in your queue.',
            approval: 'No approval updates are pending.',
            system: 'No system alerts are visible.'
        }[notificationFilter] || 'You are all caught up.';
    }

    function getNotificationIcon(type) {
        const icons = {
            chat: 'fa-solid fa-comments',
            document: 'fa-solid fa-file-excel',
            approval: 'fa-solid fa-clipboard-check',
            reconciliation: 'fa-solid fa-scale-balanced',
            security: 'fa-solid fa-shield-halved',
            error: 'fa-solid fa-bug',
            warning: 'fa-solid fa-triangle-exclamation',
            system: 'fa-solid fa-circle-info'
        };

        return icons[type] || icons.system;
    }

    function renderNotificationsError() {
        const list = document.getElementById('notificationsList');
        if (!list) return;

        list.innerHTML = `
            <div class="notifications-empty notifications-error">
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                <strong>Notifications unavailable</strong>
                <span>Try again later.</span>
            </div>
        `;
    }

    async function markAsRead(id) {
        if (!id) return;

        try {
            await requestJson(`/notificaciones/${id}/leida`, { method: 'PUT' });
        } catch (error) {
            console.warn('Notification could not be marked as read:', error);
        }
    }

    async function markAllAsRead() {
        try {
            await requestJson('/notificaciones/leidas', { method: 'PUT' });
            await loadNotifications({ silent: true });
        } catch (error) {
            console.warn('Notifications could not be marked as read:', error);
        }
    }

    async function archiveNotification(id) {
        if (!id) return;

        try {
            await requestJson(`/notificaciones/${id}`, { method: 'DELETE' });
            await loadNotifications({ silent: true });
        } catch (error) {
            console.warn('Notification could not be dismissed:', error);
        }
    }

    function showNotificationToast() {
        if (!window.Swal) return;

        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: 'New notification',
            showConfirmButton: false,
            timer: 2600,
            timerProgressBar: true
        });
    }

    let notificationStream = null;

    function connectNotificationStream(){
        if(notificationStream || typeof  EventSource === 'undefined') return;

        const token = localStorage.getItem('token');
        if (!token || !window.API_URL) return;

        const url = `${window.API_URL}/notifications-stream?token=${encodeURIComponent(token)}`;
        notificationStream = new EventSource(url);

        notificationStream.addEventListener('notification',()=> {
            loadNotifications({silent: false});
        });

        notificationStream.onerror = () => {
            console.warn('Notification stream disconnected, retry automatically.');
        }
    }

    function startPolling() {
        console.log("Polling iniciado");
        if (pollInterval) return;

        pollInterval = setInterval(() => {
            loadNotifications({ silent: false });
        }, POLL_INTERVAL_MS);
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatDate(value) {
        if (!value) return '';

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';

        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    window.actualizarNotificaciones = () => loadNotifications({ silent: true });
})();
