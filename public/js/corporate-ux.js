(function () {
    const state = {
        dirtyForms: new WeakSet(),
        sessionWarningShown: false,
        originalFetch: window.fetch.bind(window)
    };

    function createRequestId() {
        if (window.crypto?.randomUUID) return window.crypto.randomUUID();
        return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    window.fetch = function corporateFetch(input, init = {}) {
        try {
            const url = typeof input === 'string' ? input : input?.url || '';
            const apiBase = String(window.API_URL || '');
            const isApiRequest = apiBase && String(url).startsWith(apiBase);

            if (!isApiRequest) return state.originalFetch(input, init);

            const headers = new Headers(
                init.headers || (typeof input !== 'string' ? input.headers : undefined) || {}
            );
            if (!headers.has('X-Request-ID')) headers.set('X-Request-ID', createRequestId());

            return state.originalFetch(input, { ...init, headers });
        } catch (error) {
            return state.originalFetch(input, init);
        }
    };

    function decodeTokenPayload(token) {
        try {
            const payload = token.split('.')[1];
            if (!payload) return null;
            const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
            return JSON.parse(decodeURIComponent(escape(window.atob(normalized))));
        } catch {
            return null;
        }
    }

    function clearSession() {
        window.XBFSSessionPersistence?.clear?.();
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('modoOffline');
    }

    function checkSessionExpiration() {
        const token = localStorage.getItem('token');
        if (!token) return;

        const payload = decodeTokenPayload(token);
        if (!payload?.exp) return;

        const remainingMs = (payload.exp * 1000) - Date.now();
        if (remainingMs <= 0) {
            clearSession();
            if (window.location.pathname !== '/') window.location.replace('/?reason=session-expired');
            return;
        }

        if (remainingMs <= 5 * 60 * 1000 && !state.sessionWarningShown) {
            state.sessionWarningShown = true;
            const minutes = Math.max(Math.ceil(remainingMs / 60000), 1);

            if (window.Swal) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Session expiring soon',
                    text: `Your session expires in approximately ${minutes} minute${minutes === 1 ? '' : 's'}. Save your changes.`,
                    confirmButtonText: 'Understood',
                    confirmButtonColor: '#17191d'
                });
            } else {
                showTransientBanner('session', `Session expires in approximately ${minutes} minutes.`);
            }
        }
    }

    function showTransientBanner(type, message, stateName = '') {
        const className = type === 'network' ? 'xb-network-banner' : 'xb-session-banner';
        let banner = document.querySelector(`.${className}`);

        if (!banner) {
            banner = document.createElement('div');
            banner.className = className;
            document.body.appendChild(banner);
        }

        banner.dataset.state = stateName;
        banner.innerHTML = `<i class="fa-solid ${stateName === 'offline' ? 'fa-wifi-slash' : 'fa-circle-info'}" aria-hidden="true"></i><span>${message}</span>`;
        banner.hidden = false;

        if (stateName !== 'offline') {
            window.setTimeout(() => {
                banner.hidden = true;
            }, 4200);
        }
    }

    function configureNetworkStatus() {
        const update = () => {
            if (!navigator.onLine) {
                showTransientBanner(
                    'network',
                    'Network connection lost. Unsaved changes may not reach the server.',
                    'offline'
                );
                return;
            }

            const banner = document.querySelector('.xb-network-banner');
            if (banner && banner.dataset.state === 'offline') {
                showTransientBanner('network', 'Connection restored.', 'online');
            }
        };

        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        update();
    }

    function configureUnsavedChanges() {
        document.querySelectorAll('form[data-track-changes]').forEach(form => {
            const markDirty = () => {
                state.dirtyForms.add(form);
                form.dataset.dirty = 'true';
            };

            form.addEventListener('input', markDirty);
            form.addEventListener('change', markDirty);
            form.addEventListener('submit', () => {
                state.dirtyForms.delete(form);
                form.dataset.dirty = 'false';
            });
        });

        window.addEventListener('beforeunload', event => {
            const hasDirtyForm = Array.from(document.querySelectorAll('form[data-track-changes]'))
                .some(form => form.dataset.dirty === 'true');
            if (!hasDirtyForm) return;
            event.preventDefault();
            event.returnValue = '';
        });
    }

    function configureKeyboardShortcuts() {
        document.addEventListener('keydown', event => {
            const target = event.target;
            const typing = target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                target?.isContentEditable;

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                document.getElementById('globalNavSearch')?.focus();
                return;
            }

            if (!typing && event.key === '/') {
                event.preventDefault();
                document.getElementById('sidebarSearch')?.focus();
            }

            if (event.key === 'Escape') {
                document.querySelectorAll('[data-dismissible].is-open').forEach(element => {
                    element.classList.remove('is-open');
                });
            }
        });
    }

    window.XBFSCorporateUX = {
        clearFormDirty(form) {
            if (!form) return;
            state.dirtyForms.delete(form);
            form.dataset.dirty = 'false';
        },
        notify(message, tone = 'info') {
            if (window.Swal) {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    timer: 2600,
                    showConfirmButton: false,
                    icon: ['success', 'warning', 'error', 'info'].includes(tone) ? tone : 'info',
                    title: message
                });
            }
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        configureNetworkStatus();
        configureUnsavedChanges();
        configureKeyboardShortcuts();
        checkSessionExpiration();
        window.setInterval(checkSessionExpiration, 60 * 1000);
    });
})();
