(function () {
    'use strict';

    const STORAGE_MODE_KEY = 'xbfs_session_mode';
    const BROWSER_SESSION_ID_KEY = 'xbfs_browser_session_id';
    const BROWSER_SESSION_COOKIE = 'xbfs_browser_session';

    const AUTH_KEYS = [
        'token',
        'usuario',
        'isLoggedIn',
        'modoOffline'
    ];

    function createSessionId() {
        if (
            window.crypto &&
            typeof window.crypto.randomUUID === 'function'
        ) {
            return window.crypto.randomUUID();
        }

        return [
            Date.now().toString(36),
            Math.random().toString(36).slice(2),
            Math.random().toString(36).slice(2)
        ].join('-');
    }

    function readCookie(name) {
        const prefix = `${encodeURIComponent(name)}=`;
        const parts = String(document.cookie || '').split(';');

        for (const part of parts) {
            const value = part.trim();

            if (value.startsWith(prefix)) {
                return decodeURIComponent(value.slice(prefix.length));
            }
        }

        return '';
    }

    function writeBrowserSessionCookie(sessionId) {
        const secure = window.location.protocol === 'https:'
            ? '; Secure'
            : '';

        document.cookie = [
            `${encodeURIComponent(BROWSER_SESSION_COOKIE)}=${encodeURIComponent(sessionId)}`,
            'Path=/',
            'SameSite=Lax',
            secure
        ].join('; ');
    }

    function removeBrowserSessionCookie() {
        const secure = window.location.protocol === 'https:'
            ? '; Secure'
            : '';

        document.cookie = [
            `${encodeURIComponent(BROWSER_SESSION_COOKIE)}=`,
            'Path=/',
            'Max-Age=0',
            'SameSite=Lax',
            secure
        ].join('; ');
    }

    function clearAuthValues() {
        AUTH_KEYS.forEach(function (key) {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });
    }

    function clearSession() {
        clearAuthValues();

        localStorage.removeItem(STORAGE_MODE_KEY);
        localStorage.removeItem(BROWSER_SESSION_ID_KEY);
        sessionStorage.removeItem(BROWSER_SESSION_ID_KEY);

        removeBrowserSessionCookie();
    }

    function saveSession(data, rememberSession) {
        if (!data || !data.token || !data.usuario) {
            throw new Error(
                'The authentication response does not contain a valid session.'
            );
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem(
            'usuario',
            JSON.stringify(data.usuario)
        );
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.removeItem('modoOffline');

        if (rememberSession) {
            localStorage.setItem(
                STORAGE_MODE_KEY,
                'persistent'
            );
            localStorage.removeItem(BROWSER_SESSION_ID_KEY);
            sessionStorage.removeItem(BROWSER_SESSION_ID_KEY);
            removeBrowserSessionCookie();
            return;
        }

        const sessionId = createSessionId();

        localStorage.setItem(
            STORAGE_MODE_KEY,
            'browser'
        );
        localStorage.setItem(
            BROWSER_SESSION_ID_KEY,
            sessionId
        );
        sessionStorage.setItem(
            BROWSER_SESSION_ID_KEY,
            sessionId
        );

        writeBrowserSessionCookie(sessionId);
    }

    function validateCurrentBrowserSession() {
        const mode = localStorage.getItem(STORAGE_MODE_KEY);

        if (mode !== 'browser') {
            return true;
        }

        const expectedSessionId =
            localStorage.getItem(BROWSER_SESSION_ID_KEY);

        const browserSessionId =
            readCookie(BROWSER_SESSION_COOKIE);

        if (
            expectedSessionId &&
            browserSessionId &&
            expectedSessionId === browserSessionId
        ) {
            sessionStorage.setItem(
                BROWSER_SESSION_ID_KEY,
                expectedSessionId
            );
            return true;
        }

        clearSession();
        return false;
    }

    validateCurrentBrowserSession();

    window.XBFSSessionPersistence = Object.freeze({
        save: saveSession,
        clear: clearSession,
        validate: validateCurrentBrowserSession,
        getMode: function () {
            return localStorage.getItem(STORAGE_MODE_KEY);
        },
        isPersistent: function () {
            return (
                localStorage.getItem(STORAGE_MODE_KEY) ===
                'persistent'
            );
        }
    });
})();
