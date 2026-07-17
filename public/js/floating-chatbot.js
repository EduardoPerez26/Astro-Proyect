(function () {
    const STORAGE_KEY = 'xbfsFloatingChatbotMessages';
    const MAX_STORED_MESSAGES = 12;
    const CLEAR_AT_KEY = 'xbfsFloatingChatbotClearAt';
    const CONVERSATION_TTL_MS = 5 * 60 * 1000;
    let autoClearTimer = null;

    const MASCOT_SVG = `
        <svg class="floating-chatbot-mascot-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <line x1="12" y1="2" x2="12" y2="4.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            <circle cx="12" cy="1.6" r="1.1" fill="currentColor"/>
            <circle class="floating-chatbot-mascot-face" cx="12" cy="13" r="9.5" fill="currentColor"/>
            <circle cx="8.6" cy="11.8" r="1.4" fill="var(--franchie-ink, #15191d)"/>
            <circle cx="15.4" cy="11.8" r="1.4" fill="var(--franchie-ink, #15191d)"/>
            <path d="M8 15.4c1.2 1.6 2.6 2.4 4 2.4s2.8-.8 4-2.4" stroke="var(--franchie-ink, #15191d)" stroke-width="1.5" stroke-linecap="round" fill="none"/>
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
                            <span>Your XBFS assistant</span>
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

        renderMessages();
        triggerLoginWelcome();
        scheduleAutoClear();
        window.addEventListener('beforeunload', () => {
            if (autoClearTimer) window.clearTimeout(autoClearTimer);
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

        window.setTimeout(() => {
            openPanel();
            addMessage('assistant', buildWelcomeMessage());
        }, 900);
    }

    function buildWelcomeMessage() {
        const firstName = getUserFirstName();
        const greeting = firstName ? `Welcome back, ${firstName}!` : 'Welcome back!';

        return `${greeting} I'm Franchie, your XBFS assistant. I can help you find any screen or answer ` +
            'questions about reconciliations, documents, permissions, reports, or Property Management. ' +
            'What can I help you with today?';
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

    function togglePanel() {
        state.isOpen ? closePanel() : openPanel();
    }

    function openPanel() {
        const panel = document.getElementById('floatingChatbotPanel');
        const toggle = document.getElementById('floatingChatbotToggle');

        if (!panel || !toggle) return;

        state.isOpen = true;
        panel.hidden = false;
        toggle.setAttribute('aria-label', 'Close AI assistant');

        window.setTimeout(() => {
            document.getElementById('floatingChatbotInput')?.focus();
            scrollMessagesToBottom();
        }, 0);
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
        addMessage('user', message);
        setSending(true);

        try {
            const reply = await requestAssistantReply(message);
            addMessage('assistant', reply || 'I could not generate a reply.');
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

    function addMessage(role, content) {
        state.messages.push({
            role,
            content,
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
                </div>
            `;
            return;
        }

        container.innerHTML = state.messages.map(message => `
            <div class="floating-chatbot-message is-${message.role}">
                <p>${escapeHtml(message.content)}</p>
            </div>
        `).join('');

        scrollMessagesToBottom();
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

        return content ? { role, content, createdAt: message.createdAt || '' } : null;
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
