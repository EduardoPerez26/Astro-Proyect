(function () {
    const STORAGE_KEY = 'xbfsFloatingChatbotMessages';
    const MAX_STORED_MESSAGES = 12;
    const CLEAR_AT_KEY = 'xbfsFloatingChatbotClearAt';
    const CONVERSATION_TTL_MS = 5 * 60 * 1000;
    const TIP_IDLE_MS = 25000;
    const TIP_VISIBLE_MS = 12000;
    let autoClearTimer = null;
    let idleTimer = null;
    let tipHideTimer = null;
    let tipPayload = null;
    let lastErrorMessage = '';
    let lastErrorShownAt = 0;
    let placeholderTimer = null;
    let placeholderIndex = 0;
    const CHAR_COUNT_WARN_AT = 2700;
    const CHAR_COUNT_MAX = 3000;

    const PAGE_TIPS = {
        '/views/tiendas': {
            default: "Tip: use the store filters to jump straight to a pending reconciliation."
        },
        '/views/documentos': {
            default: "Tip: you can drag and drop files here to upload them faster.",
            ar: "Tip: as AR, this is where every reconciliation source file lives — drag and drop to upload faster."
        },
        '/views/historial': {
            default: "Tip: History keeps a full trail of every reconciliation change."
        },
        '/views/departments/dashboard-property': {
            default: "Tip: Property Management schedules show upcoming and overdue tasks at a glance."
        },
        '/views/departments/property-management-documents': {
            default: "Tip: Property Management keeps its own documents, separate from AR."
        },
        '/views/approval-center': {
            default: "Tip: filter by department here to review only what your team owns.",
            admin: "Tip: as admin you can filter by department here to focus on one team at a time.",
            supervisor: "Tip: as supervisor, this list is already scoped to your department — filter further by status or type."
        },
        '/views/report-center': {
            default: "Tip: you can schedule a report to be delivered automatically."
        },
        '/views/dashboard-admin': {
            default: "Tip: the executive dashboard summarizes every department in one view."
        },
        '/views/system-center': {
            default: "Tip: System Center shows live health for the database, Sage Intacct, email, and the AI assistant."
        },
        '/views/audit-center': {
            default: "Tip: Audit Center logs every sensitive action across the platform."
        },
        '/views/usuarios': {
            default: "Tip: you can set a department for each user to control what they see."
        },
        '/views/restaurantes': {
            default: "Tip: keep store data current here so reconciliations map correctly."
        },
        '/views/system-errors': {
            default: "Tip: system errors here are the same ones logged in System Center."
        },
        '/views/perfil': {
            default: "Tip: you can update your password and preferences here anytime."
        }
    };

    const MODULE_LINKS = [
        { label: 'Stores', path: '/views/tiendas', keywords: ['tienda', 'store'] },
        { label: 'Reconciliation ledger', path: '/views/conciliacion', keywords: ['conciliacion', 'reconciliation', 'ledger'] },
        { label: 'Documents', path: '/views/documentos', keywords: ['documento', 'document', 'archivo excel', 'uploaded file'] },
        { label: 'History', path: '/views/historial', keywords: ['historial', 'history'] },
        { label: 'Property schedules', path: '/views/departments/dashboard-property', keywords: ['property schedule', 'cronograma'] },
        { label: 'Prepaid amortization', path: '/views/departments/prepaid-amortization', keywords: ['prepaid', 'amortiz'] },
        { label: 'Property Management documents', path: '/views/departments/property-management-documents', keywords: ['property management document', 'pm document'] },
        { label: 'Approval Center', path: '/views/approval-center', keywords: ['aprobacion', 'approval'] },
        { label: 'Reports Center', path: '/views/report-center', keywords: ['reporte', 'report'] },
        { label: 'Admin dashboard', path: '/views/dashboard-admin', keywords: ['dashboard admin', 'executive dashboard'] },
        { label: 'System Center', path: '/views/system-center', keywords: ['system center', 'integration monitor', 'integracion'] },
        { label: 'Audit Center', path: '/views/audit-center', keywords: ['auditoria', 'audit center', 'operational audit'] },
        { label: 'Users', path: '/views/usuarios', keywords: ['user directory', 'directorio de usuarios'] },
        { label: 'Permissions', path: '/views/permisos', keywords: ['permiso', 'permission'] },
        { label: 'Restaurant control', path: '/views/restaurantes', keywords: ['restaurante', 'restaurant'] },
        { label: 'System errors', path: '/views/system-errors', keywords: ['system error', 'error del sistema'] },
        { label: 'Profile & security', path: '/views/perfil', keywords: ['perfil', 'profile', 'password', 'contraseña', 'mfa'] },
        { label: 'Team chat', path: '/views/chat', keywords: ['team chat', 'chat interno', 'internal messaging'] }
    ];

    const SUGGESTION_CHIPS = [
        'How do I approve a document?',
        'Show me pending reconciliations',
        'Where do I manage users?',
        'What changed recently?'
    ];

    const PLACEHOLDER_EXAMPLES = [
        'Ask something...',
        'e.g. How do I upload a document?',
        'e.g. Show pending approvals',
        'e.g. Where is the audit log?'
    ];

    const QUICK_COMMANDS = {
        '/approvals': { path: '/views/approval-center', label: 'Approval Center' },
        '/documents': { path: '/views/documentos', label: 'Documents' },
        '/reports': { path: '/views/report-center', label: 'Reports Center' },
        '/users': { path: '/views/usuarios', label: 'Users' },
        '/profile': { path: '/views/perfil', label: 'Profile & security' },
        '/history': { path: '/views/historial', label: 'History' },
        '/stores': { path: '/views/tiendas', label: 'Stores' },
        '/system': { path: '/views/system-center', label: 'System Center' },
        '/audit': { path: '/views/audit-center', label: 'Audit Center' },
        '/permissions': { path: '/views/permisos', label: 'Permissions' },
        '/property': { path: '/views/departments/dashboard-property', label: 'Property schedules' }
    };

    const DEPARTMENT_TOUR = {
        default: ['Stores', 'Documents', 'History'],
        ar: ['Stores', 'Documents', 'History'],
        ap: ['Documents'],
        operations: ['Stores', 'Documents'],
        'property-management': ['Property schedules', 'Prepaid amortization', 'Property Management documents'],
        hr: ['Documents'],
        it: ['Admin dashboard', 'System Center', 'Users']
    };

    const MASCOT_SVG = `
        <svg class="floating-chatbot-mascot-svg" viewBox="2 -1.5 26 26" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <g class="floating-chatbot-mascot-antenna">
                <line x1="14" y1="1.5" x2="14" y2="3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                <circle cx="14" cy="1.1" r="1" fill="currentColor"/>
            </g>
            <path class="floating-chatbot-mascot-face" d="M8 5 H12 C12.5 3.1 15.5 3.1 16 5 H20 C21.7 5 23 6.3 23 8 V11 C24.9 11.5 24.9 15 23 15.5 V20 C23 21.7 21.7 23 20 23 H8 C6.3 23 5 21.7 5 20 V8 C5 6.3 6.3 5 8 5 Z" fill="currentColor"/>
            <g class="floating-chatbot-mascot-eyes">
                <circle cx="11.5" cy="13" r="1.4" fill="var(--franchie-ink, #15191d)"/>
                <circle cx="17.5" cy="13" r="1.4" fill="var(--franchie-ink, #15191d)"/>
            </g>
            <path class="floating-chatbot-mascot-mouth" d="M11.3 16.6c.9.9 1.8 1.3 2.7 1.3s1.8-.4 2.7-1.3" stroke="var(--franchie-ink, #15191d)" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        </svg>
    `;

    const state = {
        isOpen: false,
        isSending: false,
        messages: loadMessages()
    };

    document.addEventListener('DOMContentLoaded', initFloatingChatbot);

    function initFloatingChatbot() {
        if (!getToken()) return;
        if (document.getElementById('xbfsFloatingChatbot')) return;

        const root = document.createElement('div');
        root.id = 'xbfsFloatingChatbot';
        root.className = 'floating-chatbot';
        root.innerHTML = `
            <button
                type="button"
                class="floating-chatbot-toggle"
                id="floatingChatbotToggle"
                aria-label="Open Franchie, your AI assistant"
                title="Franchie"
            >
                <span class="floating-chatbot-mascot">${MASCOT_SVG}</span>
            </button>

            <div class="floating-chatbot-tip" id="floatingChatbotTip" hidden>
                <button
                    type="button"
                    class="floating-chatbot-tip-dismiss"
                    id="floatingChatbotTipDismiss"
                    aria-label="Dismiss tip"
                >
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
                <p id="floatingChatbotTipText"></p>
            </div>

            <section
                class="floating-chatbot-panel"
                id="floatingChatbotPanel"
                aria-label="Franchie, your AI assistant"
                hidden
            >
                <header class="floating-chatbot-header">
                    <div class="floating-chatbot-header-identity">
                        <span class="floating-chatbot-mascot floating-chatbot-mascot--header">${MASCOT_SVG}</span>
                        <div>
                            <strong>Franchie</strong>
                            <span><span class="floating-chatbot-status-dot" aria-hidden="true"></span>Online</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        class="floating-chatbot-close"
                        id="floatingChatbotClose"
                        aria-label="Close AI assistant"
                        title="Close"
                    >
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                </header>

                <div class="floating-chatbot-messages" id="floatingChatbotMessages"></div>

                <form class="floating-chatbot-form" id="floatingChatbotForm">
                    <div class="floating-chatbot-input-pill">
                        <textarea
                            id="floatingChatbotInput"
                            class="floating-chatbot-input"
                            rows="1"
                            maxlength="3000"
                            placeholder="Ask something..."
                            aria-label="Message"
                        ></textarea>

                        <button
                            type="submit"
                            class="floating-chatbot-send"
                            id="floatingChatbotSend"
                            aria-label="Send message"
                            title="Send"
                        >
                            <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
                        </button>
                    </div>
                    <span class="floating-chatbot-char-count" id="floatingChatbotCharCount" hidden></span>
                </form>
            </section>
        `;

        document.body.appendChild(root);

        document
            .getElementById('floatingChatbotToggle')
            ?.addEventListener('click', togglePanel);
        document
            .getElementById('floatingChatbotClose')
            ?.addEventListener('click', closePanel);
        document
            .getElementById('floatingChatbotForm')
            ?.addEventListener('submit', handleSubmit);
        document
            .getElementById('floatingChatbotInput')
            ?.addEventListener('keydown', handleInputKeydown);
        document
            .getElementById('floatingChatbotInput')
            ?.addEventListener('input', handleInputChange);
        document
            .getElementById('floatingChatbotInput')
            ?.addEventListener('focus', stopPlaceholderRotation);
        document
            .getElementById('floatingChatbotInput')
            ?.addEventListener('blur', startPlaceholderRotation);
        document
            .getElementById('floatingChatbotMessages')
            ?.addEventListener('click', handleSuggestionClick);
        document
            .getElementById('floatingChatbotTip')
            ?.addEventListener('click', handleTipClick);
        document
            .getElementById('floatingChatbotTipDismiss')
            ?.addEventListener('click', handleTipDismiss);

        renderMessages();
        triggerLoginWelcome();
        scheduleAutoClear();
        setupIdleWatcher();
        setupErrorWatcher();
        startPlaceholderRotation();
        window.addEventListener('beforeunload', () => {
            if (autoClearTimer) window.clearTimeout(autoClearTimer);
            if (idleTimer) window.clearTimeout(idleTimer);
            if (tipHideTimer) window.clearTimeout(tipHideTimer);
            if (placeholderTimer) window.clearInterval(placeholderTimer);
        });
    }

    function startPlaceholderRotation() {
        const input = document.getElementById('floatingChatbotInput');
        if (!input || placeholderTimer) return;

        placeholderTimer = window.setInterval(() => {
            if (document.activeElement === input) return;
            placeholderIndex = (placeholderIndex + 1) % PLACEHOLDER_EXAMPLES.length;
            input.setAttribute('placeholder', PLACEHOLDER_EXAMPLES[placeholderIndex]);
        }, 3200);
    }

    function stopPlaceholderRotation() {
        const input = document.getElementById('floatingChatbotInput');
        if (placeholderTimer) {
            window.clearInterval(placeholderTimer);
            placeholderTimer = null;
        }
        placeholderIndex = 0;
        input?.setAttribute('placeholder', PLACEHOLDER_EXAMPLES[0]);
    }

    function handleInputChange(event) {
        const counter = document.getElementById('floatingChatbotCharCount');
        if (!counter) return;

        const length = event.target.value.length;
        if (length >= CHAR_COUNT_WARN_AT) {
            counter.textContent = `${length}/${CHAR_COUNT_MAX}`;
            counter.hidden = false;
        } else {
            counter.hidden = true;
        }
    }

    function handleSuggestionClick(event) {
        const chip = event.target.closest('.floating-chatbot-suggestion-chip');
        if (!chip) return;

        const text = chip.dataset.suggestion || chip.textContent.trim();
        sendUserMessage(text);
    }

    function setupIdleWatcher() {
        const activityEvents = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
        activityEvents.forEach(eventName => {
            window.addEventListener(eventName, resetIdleTimer, { passive: true });
        });
        document.addEventListener('visibilitychange', resetIdleTimer);
        resetIdleTimer();
    }

    function resetIdleTimer() {
        if (idleTimer) window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(maybeShowProactiveTip, TIP_IDLE_MS);
    }

    function maybeShowProactiveTip() {
        if (state.isOpen) return;
        if (document.visibilityState !== 'visible') return;

        const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
        const entry = PAGE_TIPS[pathname];
        if (!entry) return;

        const tip = resolveTip(entry);
        if (!tip) return;

        const shownKey = `xbfsFranchieTip:${pathname}`;
        try {
            if (sessionStorage.getItem(shownKey)) return;
            sessionStorage.setItem(shownKey, '1');
        } catch {
            // Proceed even if we cannot remember; showing once too often beats never.
        }

        showProactiveTip(tip);
    }

    function resolveTip(entry) {
        if (typeof entry === 'string') return entry;
        const role = getUserRole();
        const departmentCode = getDepartmentCode();
        return entry[role] || entry[departmentCode] || entry.default || '';
    }

    function showProactiveTip(text, options = {}) {
        const bubble = document.getElementById('floatingChatbotTip');
        const textEl = document.getElementById('floatingChatbotTipText');
        const toggle = document.getElementById('floatingChatbotToggle');

        if (!bubble || !textEl) return;

        tipPayload = {
            mode: options.mode || 'info',
            errorText: options.errorText || '',
            text
        };

        textEl.textContent = text;
        bubble.hidden = false;
        bubble.classList.toggle('is-error', tipPayload.mode === 'error');
        requestAnimationFrame(() => bubble.classList.add('is-visible'));

        const mascotSvg = toggle?.querySelector('.floating-chatbot-mascot-svg');
        if (mascotSvg) {
            mascotSvg.classList.add('is-waving');
            mascotSvg.addEventListener(
                'animationend',
                () => mascotSvg.classList.remove('is-waving'),
                { once: true }
            );
        }

        if (tipHideTimer) window.clearTimeout(tipHideTimer);
        tipHideTimer = window.setTimeout(hideProactiveTip, TIP_VISIBLE_MS);
    }

    function hideProactiveTip() {
        const bubble = document.getElementById('floatingChatbotTip');
        if (!bubble || bubble.hidden) return;

        bubble.classList.remove('is-visible');
        window.setTimeout(() => {
            if (!bubble.classList.contains('is-visible')) bubble.hidden = true;
        }, 200);
    }

    function handleTipClick(event) {
        if (event.target.closest('#floatingChatbotTipDismiss')) return;

        const payload = tipPayload;
        hideProactiveTip();
        if (!payload) return;

        openPanel();

        if (payload.mode === 'error') {
            sendUserMessage(`Explain this error and what I should do about it: ${payload.errorText}`);
        } else {
            addMessage('assistant', payload.text);
        }
    }

    function handleTipDismiss(event) {
        event.stopPropagation();
        hideProactiveTip();
    }

    function setupErrorWatcher() {
        window.addEventListener('error', event => {
            reportRuntimeIssue(event?.error?.message || event?.message);
        });
        window.addEventListener('unhandledrejection', event => {
            const reason = event?.reason;
            reportRuntimeIssue(reason instanceof Error ? reason.message : String(reason || ''));
        });
    }

    function reportRuntimeIssue(rawMessage) {
        const text = String(rawMessage || '').trim();
        if (!text || text === 'Script error.' || text.includes('ResizeObserver')) return;
        if (state.isOpen) return;

        const now = Date.now();
        if (text === lastErrorMessage && now - lastErrorShownAt < 60000) return;
        lastErrorMessage = text;
        lastErrorShownAt = now;

        showProactiveTip('Something just went wrong on this page. Want me to explain what happened?', {
            mode: 'error',
            errorText: text
        });
    }

    function scheduleAutoClear() {
        let clearAt = Number(localStorage.getItem(CLEAR_AT_KEY) || 0);
        const now = Date.now();

        if (!clearAt || Number.isNaN(clearAt)) {
            clearAt = now + CONVERSATION_TTL_MS;
            try {
                localStorage.setItem(CLEAR_AT_KEY, String(clearAt));
            } catch {
                // Ignore storage failures; the timer still runs for this page view.
            }
        }

        if (autoClearTimer) window.clearTimeout(autoClearTimer);

        if (now >= clearAt) {
            performAutoClear();
            return;
        }

        autoClearTimer = window.setTimeout(performAutoClear, clearAt - now);
    }

    function performAutoClear() {
        const hasUserActivity = state.messages.some(message => message.role === 'user');

        if (hasUserActivity) {
            state.messages = [];
            saveMessages();
            renderMessages();
            addMessage(
                'assistant',
                "Just a heads-up: I clear our conversation every 5 minutes to keep things tidy. " +
                "Feel free to ask me anything again!"
            );
        }

        const nextClearAt = Date.now() + CONVERSATION_TTL_MS;
        try {
            localStorage.setItem(CLEAR_AT_KEY, String(nextClearAt));
        } catch {
            // Ignore storage failures; the next check will simply restart the countdown.
        }
        autoClearTimer = window.setTimeout(performAutoClear, CONVERSATION_TTL_MS);
    }

    function triggerLoginWelcome() {
        let pending = false;
        try {
            pending = sessionStorage.getItem('franchieWelcomePending') === '1';
            if (pending) sessionStorage.removeItem('franchieWelcomePending');
        } catch {
            pending = false;
        }

        if (!pending) return;

        const toggle = document.getElementById('floatingChatbotToggle');
        if (toggle) {
            toggle.classList.add('is-entrance');
            toggle.addEventListener(
                'animationend',
                () => toggle.classList.remove('is-entrance'),
                { once: true }
            );
        }

        window.setTimeout(async () => {
            openPanel({ silent: true });
            markBriefingShownToday();
            addMessage('assistant', await buildWelcomeMessage());
            maybeShowGuidedTour();
        }, 900);
    }

    async function buildWelcomeMessage() {
        const firstName = getUserFirstName();
        const greeting = firstName ? `Welcome back, ${firstName}!` : 'Welcome back!';
        const briefing = await fetchBriefingLine();

        const base = `${greeting} I'm Franchie, your XBFS assistant. I can help you find any screen or answer ` +
            'questions about reconciliations, documents, permissions, reports, or Property Management. ' +
            'What can I help you with today?';

        return briefing ? `${base}\n\n${briefing}` : base;
    }

    async function fetchBriefingLine() {
        try {
            const apiBase = getApiBase();
            if (!apiBase) return '';

            const response = await fetch(`${apiBase}/dashboard/approval-center`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (!response.ok) return '';

            const data = await response.json().catch(() => ({}));
            const summary = data?.summary;
            if (!summary) return '';

            const parts = [];
            if (summary.total_tasks) parts.push(`${summary.total_tasks} pending approval item(s)`);
            if (summary.overdue) parts.push(`${summary.overdue} overdue`);
            if (summary.incidents_open) parts.push(`${summary.incidents_open} open system incident(s)`);

            return parts.length ? `Quick status: ${parts.join(', ')}.` : '';
        } catch {
            return '';
        }
    }

    function maybeShowDailyBriefing() {
        if (hasShownBriefingToday()) return;
        markBriefingShownToday();

        fetchBriefingLine().then(line => {
            if (line) addMessage('assistant', line);
        });
    }

    function hasShownBriefingToday() {
        try {
            return localStorage.getItem('franchieBriefingDate') === todayKey();
        } catch {
            return true;
        }
    }

    function markBriefingShownToday() {
        try {
            localStorage.setItem('franchieBriefingDate', todayKey());
        } catch {
            // Ignore storage failures; the briefing will simply be offered again next open.
        }
    }

    function todayKey() {
        return new Date().toISOString().slice(0, 10);
    }

    function maybeShowGuidedTour() {
        let seen = false;
        try {
            seen = localStorage.getItem('franchieTourSeen') === '1';
        } catch {
            seen = false;
        }

        if (seen) return;

        try {
            localStorage.setItem('franchieTourSeen', '1');
        } catch {
            // Ignore storage failures; the tour will simply repeat on later logins.
        }

        const departmentCode = getDepartmentCode();
        const tour = DEPARTMENT_TOUR[departmentCode] || DEPARTMENT_TOUR.default;

        window.setTimeout(() => {
            addMessage(
                'assistant',
                `Since this looks like your first time here: you'll mostly use ${tour.join(', ')}. ` +
                'Ask me anytime if you need help finding something.'
            );
        }, 1600);
    }

    function getUserFirstName() {
        try {
            const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
            const fullName = String(usuario?.nombre || '').trim();
            return fullName ? fullName.split(/\s+/)[0] : '';
        } catch {
            return '';
        }
    }

    function getUserRole() {
        try {
            const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
            return String(usuario?.rol || '').toLowerCase();
        } catch {
            return '';
        }
    }

    function getDepartmentCode() {
        try {
            const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
            return String(usuario?.departamento?.codigo || '').toLowerCase();
        } catch {
            return '';
        }
    }

    function togglePanel() {
        state.isOpen ? closePanel() : openPanel();
    }

    function openPanel(options = {}) {
        const panel = document.getElementById('floatingChatbotPanel');
        const toggle = document.getElementById('floatingChatbotToggle');

        if (!panel || !toggle) return;

        hideProactiveTip();
        state.isOpen = true;
        panel.hidden = false;
        toggle.setAttribute('aria-label', 'Close AI assistant');

        const headerMascot = panel.querySelector('.floating-chatbot-mascot--header .floating-chatbot-mascot-svg');
        if (headerMascot) {
            headerMascot.classList.add('is-waving');
            headerMascot.addEventListener(
                'animationend',
                () => headerMascot.classList.remove('is-waving'),
                { once: true }
            );
        }

        window.setTimeout(() => {
            document.getElementById('floatingChatbotInput')?.focus();
            scrollMessagesToBottom();
        }, 0);

        if (!options.silent) {
            maybeShowDailyBriefing();
        }
    }

    function closePanel() {
        const panel = document.getElementById('floatingChatbotPanel');
        const toggle = document.getElementById('floatingChatbotToggle');

        if (!panel || !toggle) return;

        state.isOpen = false;
        panel.hidden = true;
        toggle.setAttribute('aria-label', 'Open AI assistant');
    }

    async function handleSubmit(event) {
        event.preventDefault();

        const input = document.getElementById('floatingChatbotInput');
        const message = String(input?.value || '').trim();

        if (!message || state.isSending) return;

        input.value = '';

        if (handleQuickCommand(message)) return;

        await sendUserMessage(message);
    }

    function handleQuickCommand(message) {
        const normalized = message.trim().toLowerCase();

        if (normalized === '/help') {
            addMessage('user', message);
            const list = Object.entries(QUICK_COMMANDS)
                .map(([command, target]) => `${command} → ${target.label}`)
                .join('\n');
            addMessage('assistant', `Quick commands:\n${list}`);
            return true;
        }

        const target = QUICK_COMMANDS[normalized];
        if (!target) return false;

        addMessage('user', message);
        addMessage('assistant', `Opening ${target.label}...`, [{ label: target.label, path: target.path }]);
        window.setTimeout(() => {
            window.location.href = target.path;
        }, 500);
        return true;
    }

    async function sendUserMessage(message) {
        if (!message || state.isSending) return;

        addMessage('user', message);
        setSending(true);

        try {
            const reply = await requestAssistantReply(message);
            const links = computeMessageLinks(`${message} ${reply || ''}`);
            addMessage('assistant', reply || 'I could not generate a reply.', links);
        } catch (error) {
            console.error('Floating chatbot error:', error);
            addMessage(
                'assistant',
                error.message || 'The assistant could not answer right now.'
            );
        } finally {
            setSending(false);
        }
    }

    function computeMessageLinks(text) {
        const haystack = String(text || '').toLowerCase();
        const matches = [];

        for (const entry of MODULE_LINKS) {
            if (matches.length >= 2) break;
            if (entry.keywords.some(keyword => haystack.includes(keyword))) {
                matches.push({ label: entry.label, path: entry.path });
            }
        }

        return matches;
    }

    function handleInputKeydown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            document.getElementById('floatingChatbotForm')?.requestSubmit();
        }
    }

    async function requestAssistantReply(message) {
        const apiBase = getApiBase();

        if (!apiBase) {
            throw new Error('API URL is not configured.');
        }

        const response = await fetch(`${apiBase}/chatbot/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                message,
                messages: state.messages.slice(-MAX_STORED_MESSAGES)
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Assistant request failed.');
        }

        return data.reply;
    }

    function addMessage(role, content, links = []) {
        state.messages.push({
            role,
            content,
            links: Array.isArray(links) ? links : [],
            createdAt: new Date().toISOString()
        });

        state.messages = state.messages.slice(-MAX_STORED_MESSAGES);
        saveMessages();
        renderMessages();
    }

    function renderMessages() {
        const container = document.getElementById('floatingChatbotMessages');
        if (!container) return;

        if (!state.messages.length) {
            container.innerHTML = `
                <div class="floating-chatbot-empty">
                    <span class="floating-chatbot-mascot floating-chatbot-mascot--empty">${MASCOT_SVG}</span>
                    <strong>Hi, I'm Franchie!</strong>
                    <span>Ask me about reconciliations, documents, permissions, or any workflow in the app.</span>
                    <div class="floating-chatbot-suggestions">
                        ${SUGGESTION_CHIPS.map(text => `
                            <button type="button" class="floating-chatbot-suggestion-chip" data-suggestion="${escapeHtml(text)}">${escapeHtml(text)}</button>
                        `).join('')}
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = state.messages.map(message => `
            <div class="floating-chatbot-message is-${message.role}">
                <p>${escapeHtml(message.content)}</p>
                ${renderMessageLinks(message.links)}
                ${renderMessageTime(message.createdAt)}
            </div>
        `).join('') + (state.isSending ? `
            <div class="floating-chatbot-message is-assistant">
                <div class="floating-chatbot-typing" aria-label="Franchie is typing">
                    <span></span><span></span><span></span>
                </div>
            </div>
        ` : '');

        scrollMessagesToBottom();
    }

    function renderMessageTime(createdAt) {
        if (!createdAt) return '';
        const date = new Date(createdAt);
        if (Number.isNaN(date.getTime())) return '';

        const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        return `<span class="floating-chatbot-message-time">${escapeHtml(time)}</span>`;
    }

    function renderMessageLinks(links) {
        if (!Array.isArray(links) || !links.length) return '';

        return `
            <div class="floating-chatbot-message-links">
                ${links.map(link => `
                    <a class="floating-chatbot-message-link" href="${escapeHtml(link.path)}">
                        <i class="fa-solid fa-arrow-right" aria-hidden="true"></i> ${escapeHtml(link.label)}
                    </a>
                `).join('')}
            </div>
        `;
    }

    function scrollMessagesToBottom() {
        const container = document.getElementById('floatingChatbotMessages');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    function setSending(isSending) {
        const button = document.getElementById('floatingChatbotSend');
        const input = document.getElementById('floatingChatbotInput');

        state.isSending = isSending;

        if (button) {
            button.disabled = isSending;
            button.innerHTML = isSending
                ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>'
                : '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i>';
        }

        if (input) {
            input.disabled = isSending;
        }

        renderMessages();
    }

    function loadMessages() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(parsed)
                ? parsed
                    .map(normalizeStoredMessage)
                    .filter(Boolean)
                    .slice(-MAX_STORED_MESSAGES)
                : [];
        } catch {
            return [];
        }
    }

    function saveMessages() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.messages));
        } catch {
            // Ignore storage failures; the assistant still works for the session.
        }
    }

    function normalizeStoredMessage(message) {
        const role = message?.role === 'assistant' ? 'assistant' : 'user';
        const content = String(message?.content || '').trim();
        const links = Array.isArray(message?.links)
            ? message.links
                .filter(link => link && typeof link.path === 'string' && typeof link.label === 'string')
                .slice(0, 2)
            : [];

        return content ? { role, content, links, createdAt: message.createdAt || '' } : null;
    }

    function getApiBase() {
        return String(window.API_URL || '').replace(/\/$/, '');
    }

    function getToken() {
        return localStorage.getItem('token') || '';
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }
})();
