(function () {
    const STORAGE_KEY = 'xbfsFloatingChatbotMessages';
    const MAX_STORED_MESSAGES = 12;

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
                aria-label="Open AI assistant"
                title="AI assistant"
            >
                <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
            </button>

            <section
                class="floating-chatbot-panel"
                id="floatingChatbotPanel"
                aria-label="AI assistant"
                hidden
            >
                <header class="floating-chatbot-header">
                    <div>
                        <strong>XBFS Assistant</strong>
                        <span>AI support</span>
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
                    <i class="fa-solid fa-sparkles" aria-hidden="true"></i>
                    <strong>How can I help?</strong>
                    <span>Ask about reconciliations, documents, permissions, or workflows.</span>
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
