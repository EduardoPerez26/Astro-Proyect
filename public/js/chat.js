let chatState = {
    usuario: null,
    conversacionActual: null,
    ultimoMensajeId: 0,
    polling: null,
    typingPolling: null,
    typingTimer: null,
    isTypingSent: false
};

document.addEventListener('DOMContentLoaded', function () {
    chatState.usuario = JSON.parse(localStorage.getItem('usuario') || '{}');

    const form = document.getElementById('chatForm');
    if (form) {
        form.addEventListener('submit', enviarMensaje);
    }

    const messageInput = document.getElementById('chatMessageInput');

    if (messageInput) {
        messageInput.addEventListener('input', manejarTypingInput);
        messageInput.addEventListener('blur', function () {
            enviarTyping(false);
        });
    }

    cargarConversaciones();
    const searchInput = document.getElementById('chatSearchInput');

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            cargarConversaciones(false);
        });
    }

    chatState.polling = setInterval(function () {
        if (chatState.conversacionActual) {
            cargarMensajes(true);
        }

        cargarConversaciones(false);
    }, 2000);

    chatState.typingPolling = setInterval(function () {
        if (chatState.conversacionActual) {
            consultarTyping();
        }
    }, 1500);
});

function getToken() {
    return localStorage.getItem('token') || '';
}

function getApiBase() {
    return String(window.API_URL || '').replace(/\/$/, '');
}

async function cargarConversaciones(showLoading = true) {
    const container = document.getElementById('chatConversations');
    const token = getToken();

    if (showLoading && container) {
        container.innerHTML = '<div class="chat-empty">Loading conversations...</div>';
    }

    try {
        const response = await fetch(`${getApiBase()}/chat/conversaciones`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Could not load conversations');
        }

        renderConversaciones(data.conversaciones || []);
    } catch (error) {
        console.error(error);

        if (container) {
            container.innerHTML = '<div class="chat-empty">Could not load conversations.</div>';
        }
    }
}

function renderConversaciones(conversaciones) {
    const container = document.getElementById('chatConversations');
    if (!container) return;

    const searchTerm = String(document.getElementById('chatSearchInput')?.value || '')
        .trim()
        .toLowerCase();

    const filtered = conversaciones.filter(function (conv) {
        const title = String(conv.otro_usuario_nombre || conv.titulo || `Conversation #${conv.id}`).toLowerCase();
        const lastMessage = String(conv.ultimo_mensaje || '').toLowerCase();

        return !searchTerm || title.includes(searchTerm) || lastMessage.includes(searchTerm);
    });

    if (!filtered.length) {
        container.innerHTML = `
            <div class="chat-empty">
                <i class="fa-solid fa-comments"></i>
                No conversations found.
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(function (conv) {
        const title = conv.otro_usuario_nombre || conv.titulo || `Conversation #${conv.id}`;
        const activeClass = Number(conv.id) === Number(chatState.conversacionActual) ? 'is-active' : '';
        const lastMessage = conv.ultimo_mensaje || 'No messages yet';
        const time = formatShortDate(conv.ultimo_mensaje_fecha || conv.created_at);

        return `
        <button
            class="chat-conversation ${activeClass}"
            type="button"
            data-title="${escapeAttr(title)}"
            data-photo="${escapeAttr(conv.otro_usuario_foto || '')}"
            onclick="abrirConversacion(${conv.id}, this.dataset.title, this.dataset.photo)"
        >
            ${renderChatAvatar(title, conv.otro_usuario_foto, 'chat-conversation-avatar')}

            <div class="chat-conversation-body">
                <div class="chat-conversation-top">
                    <strong>${escapeHtml(title)}</strong>
                    <small class="chat-conversation-time">${escapeHtml(time)}</small>
                </div>

                <span class="chat-last-message">${escapeHtml(lastMessage)}</span>
            </div>
        </button>
    `;
    }).join('');
}

async function abrirConversacion(conversacionId, title = 'Chat', photoUrl = '') {
    if (chatState.conversacionActual && Number(chatState.conversacionActual) !== Number(conversacionId)) {
        await enviarTyping?.(false, chatState.conversacionActual);
    }

    chatState.conversacionActual = conversacionId;
    chatState.ultimoMensajeId = 0;
    chatState.isTypingSent = false;

    const emptyState = document.getElementById('chatEmptyState');
    const chatWindow = document.getElementById('chatWindow');
    const messages = document.getElementById('chatMessages');
    const chatTitle = document.getElementById('chatTitle');
    const chatSubtitle = document.getElementById('chatSubtitle');
    const chatCurrentAvatar = document.getElementById('chatCurrentAvatar');

    if (emptyState) emptyState.hidden = true;
    if (chatWindow) chatWindow.hidden = false;
    if (messages) messages.innerHTML = '';

    if (chatTitle) chatTitle.textContent = title || 'Chat';
    if (chatSubtitle) chatSubtitle.textContent = 'Internal message thread';

    if (chatCurrentAvatar) {
        const resolvedPhoto = resolverUrlFotoChat(photoUrl);

        chatCurrentAvatar.classList.toggle('has-image', Boolean(resolvedPhoto));

        if (resolvedPhoto) {
            chatCurrentAvatar.textContent = '';
            chatCurrentAvatar.style.backgroundImage = `url("${resolvedPhoto}")`;
            chatCurrentAvatar.style.backgroundSize = 'cover';
            chatCurrentAvatar.style.backgroundPosition = 'center';
            chatCurrentAvatar.style.backgroundRepeat = 'no-repeat';
        } else {
            chatCurrentAvatar.removeAttribute('style');
            chatCurrentAvatar.textContent = getInitials(title);
        }
    }

    await cargarMensajes(false);

    if (typeof marcarConversacionLeida === 'function') {
        await marcarConversacionLeida();
    }

    await cargarConversaciones(false);
}

async function cargarMensajes(soloNuevos = false) {
    if (!chatState.conversacionActual) return;

    const token = getToken();
    const afterId = soloNuevos ? chatState.ultimoMensajeId : 0;

    try {
        const response = await fetch(
            `${getApiBase()}/chat/conversaciones/${chatState.conversacionActual}/mensajes?after_id=${afterId}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Could not load messages');
        }

        renderMensajes(data.mensajes || [], soloNuevos);
        if ((data.mensajes || []).length > 0) {
            await marcarConversacionLeida();
        }
    } catch (error) {
        console.error(error);
    }
}

function renderMensajes(mensajes, append = false) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    if (!append) {
        container.innerHTML = '';
    }

    if (!mensajes.length && !append) {
        container.innerHTML = `
            <div class="chat-empty">
                <i class="fa-solid fa-message"></i>
                No messages yet. Start the conversation.
            </div>
        `;
        return;
    }

    mensajes.forEach(function (msg) {
        chatState.ultimoMensajeId = Math.max(chatState.ultimoMensajeId, Number(msg.id));

        const isOwn = Number(msg.usuario_id) === Number(chatState.usuario.id);
        const userName = msg.usuario_nombre || 'User';

        const ownPhoto =
            chatState.usuario.foto_perfil_url ||
            chatState.usuario.fotoPerfilUrl ||
            chatState.usuario.foto_perfil ||
            chatState.usuario.foto ||
            '';

        const photoUrl = isOwn
            ? (msg.usuario_foto || ownPhoto)
            : msg.usuario_foto;

        const row = document.createElement('div');
        row.className = `chat-message-row ${isOwn ? 'is-own' : ''}`;
        row.innerHTML = `
            ${renderChatAvatar(userName, photoUrl, 'chat-message-avatar')}

            <div class="chat-message">
                <strong>${escapeHtml(isOwn ? 'You' : userName)}</strong>
                <p>${escapeHtml(msg.mensaje)}</p>
                <small>${formatDate(msg.created_at)}</small>
            </div>
        `;

        container.appendChild(row);
    });

    if (mensajes.length) {
        container.scrollTop = container.scrollHeight;
    }
}

async function enviarMensaje(event) {
    event.preventDefault();

    if (!chatState.conversacionActual) return;

    const input = document.getElementById('chatMessageInput');
    const mensaje = input?.value.trim();

    if (!mensaje) return;

    const token = getToken();

    try {
        await enviarTyping(false);

        const response = await fetch(
            `${getApiBase()}/chat/conversaciones/${chatState.conversacionActual}/mensajes`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ mensaje })
            }
        );
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Message could not be sent');
        }

        input.value = '';
        await cargarMensajes(true);
        await cargarConversaciones(false);
    } catch (error) {
        console.error(error);

        Swal.fire({
            icon: 'error',
            title: 'Message error',
            text: error.message || 'The message could not be sent.'
        });
    }
}

async function openNewChatModal() {
    const token = getToken();

    try {
        const response = await fetch(`${getApiBase()}/chat/usuarios`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'No se pudieron cargar los usuarios');
        }

        const usuarios = (data.usuarios || []).filter(function (user) {
            return Number(user.id) !== Number(chatState.usuario.id);
        });

        if (!usuarios.length) {
            Swal.fire({
                icon: 'info',
                title: 'Sin usuarios disponibles',
                text: 'No hay usuarios disponibles para iniciar un chat.'
            });
            return;
        }

        let selectedUserId = null;

        const getUserPhoto = function (user) {
            return (
                user.foto_perfil_url ||
                user.fotoPerfilUrl ||
                user.foto_perfil ||
                user.foto ||
                user.avatar ||
                ''
            );
        };

        const renderUserList = function (term = '') {
            const container = document.getElementById('newChatUserResults');
            if (!container) return;

            const search = String(term || '').trim().toLowerCase();

            const filtered = usuarios.filter(function (user) {
                const nombre = String(user.nombre || user.nombre_completo || user.username || '').toLowerCase();
                const email = String(user.email || '').toLowerCase();

                return !search || nombre.includes(search) || email.includes(search);
            });

            if (!filtered.length) {
                container.innerHTML = `
                    <div class="new-chat-empty">
                        <i class="fa-solid fa-user-slash"></i>
                        No se encontraron usuarios.
                    </div>
                `;
                return;
            }

            container.innerHTML = filtered.map(function (user) {
                const nombre = user.nombre || user.nombre_completo || user.username || 'Usuario';
                const email = user.email || '';
                const photo = getUserPhoto(user);
                const activeClass = Number(selectedUserId) === Number(user.id) ? 'is-selected' : '';

                return `
                    <button
                        type="button"
                        class="new-chat-user ${activeClass}"
                        data-user-id="${escapeAttr(user.id)}"
                    >
                        ${renderChatAvatar(nombre, photo, 'new-chat-user-avatar')}

                        <span class="new-chat-user-info">
                            <strong>${escapeHtml(nombre)}</strong>
                            <small>${escapeHtml(email)}</small>
                        </span>

                        <i class="fa-solid fa-check new-chat-check"></i>
                    </button>
                `;
            }).join('');

            container.querySelectorAll('.new-chat-user').forEach(function (button) {
                button.addEventListener('click', function () {
                    selectedUserId = this.dataset.userId;

                    container.querySelectorAll('.new-chat-user').forEach(function (item) {
                        item.classList.remove('is-selected');
                    });

                    this.classList.add('is-selected');
                    updateNewChatConfirmButton();
                });
            });
        };

        const updateNewChatConfirmButton = function () {
            const confirmButton = Swal.getConfirmButton();
            const messageInput = document.getElementById('newChatMessageInput');
            const mensaje = String(messageInput?.value || '').trim();

            if (confirmButton) {
                confirmButton.disabled = !selectedUserId || !mensaje;
            }
        };

        const result = await Swal.fire({
            title: 'Empezar nuevo chat',
            html: `
                <div class="new-chat-modal-body">
                    <div class="new-chat-search">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <input
                            type="text"
                            id="newChatSearchInput"
                            placeholder="Buscar usuario por nombre o correo..."
                            autocomplete="off"
                        />
                    </div>

                    <div id="newChatUserResults" class="new-chat-user-results"></div>

                    <div class="new-chat-message">
                        <label for="newChatMessageInput">Mensaje</label>
                        <textarea
                            id="newChatMessageInput"
                            placeholder="Escribe el mensaje que quieres enviar..."
                            maxlength="1000"
                        ></textarea>
                    </div>
                </div>
            `,
            customClass: {
                popup: 'new-chat-swal',
                confirmButton: 'new-chat-confirm'
            },
            showCancelButton: true,
            confirmButtonText: 'Mandar mensaje',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#0b4778',
            cancelButtonColor: '#8a9aad',
            focusConfirm: false,
            didOpen: function () {
                const searchInput = document.getElementById('newChatSearchInput');
                const messageInput = document.getElementById('newChatMessageInput');
                const confirmButton = Swal.getConfirmButton();

                if (confirmButton) {
                    confirmButton.disabled = true;
                }

                renderUserList();

                if (searchInput) {
                    searchInput.addEventListener('input', function () {
                        renderUserList(this.value);
                    });
                }

                if (messageInput) {
                    messageInput.addEventListener('input', updateNewChatConfirmButton);
                }
            },
            preConfirm: function () {
                const messageInput = document.getElementById('newChatMessageInput');
                const mensaje = String(messageInput?.value || '').trim();

                if (!selectedUserId) {
                    Swal.showValidationMessage('Selecciona un usuario');
                    return false;
                }

                if (!mensaje) {
                    Swal.showValidationMessage('Escribe un mensaje');
                    return false;
                }

                const usuarioSeleccionado = usuarios.find(function (user) {
                    return Number(user.id) === Number(selectedUserId);
                });

                return {
                    usuarioId: selectedUserId,
                    mensaje,
                    usuario: usuarioSeleccionado || null
                };
            }
        });

        if (!result.isConfirmed || !result.value) return;

        await crearChatDirecto(
            result.value.usuarioId,
            result.value.mensaje,
            result.value.usuario
        );

    } catch (error) {
        console.error(error);

        Swal.fire({
            icon: 'error',
            title: 'Error de chat',
            text: error.message || 'No se pudo iniciar el chat.'
        });
    }
}

async function crearChatDirecto(usuarioId, mensajeInicial = '', usuarioSeleccionado = null) {
    const token = getToken();

    const response = await fetch(`${getApiBase()}/chat/directa`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            usuario_id: usuarioId
        })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
        throw new Error(data.message || 'No se pudo crear el chat');
    }

    const conversacionId = data.conversacion_id || data.id;

    if (!conversacionId) {
        throw new Error('No se recibió el ID de la conversación');
    }

    const mensaje = String(mensajeInicial || '').trim();

    if (mensaje) {
        const messageResponse = await fetch(
            `${getApiBase()}/chat/conversaciones/${conversacionId}/mensajes`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ mensaje })
            }
        );

        const messageData = await messageResponse.json();

        if (!messageResponse.ok || !messageData.success) {
            throw new Error(messageData.message || 'No se pudo enviar el mensaje');
        }
    }

    await cargarConversaciones(false);

    const fallbackTitle =
        usuarioSeleccionado?.nombre ||
        usuarioSeleccionado?.nombre_completo ||
        usuarioSeleccionado?.username ||
        'Chat';

    const fallbackPhoto =
        usuarioSeleccionado?.foto_perfil_url ||
        usuarioSeleccionado?.fotoPerfilUrl ||
        usuarioSeleccionado?.foto_perfil ||
        usuarioSeleccionado?.foto ||
        usuarioSeleccionado?.avatar ||
        '';

    await abrirConversacion(conversacionId, fallbackTitle, fallbackPhoto);

    if (typeof window.actualizarContadorChat === 'function') {
        window.actualizarContadorChat();
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatDate(value) {
    if (!value) return '';

    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
}

function getInitials(value) {
    return String(value || 'User')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(part => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'U';
}

function escapeAttr(value) {
    return escapeHtml(value).replaceAll('`', '&#096;');
}

function formatShortDate(value) {
    if (!value) return '';

    try {
        const date = new Date(value);
        return date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return '';
    }
}

async function marcarConversacionLeida() {
    if (!chatState.conversacionActual) return;

    const token = getToken();

    try {
        await fetch(`${getApiBase()}/chat/conversaciones/${chatState.conversacionActual}/leida`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (typeof window.actualizarContadorChat === 'function') {
            window.actualizarContadorChat();
        }
    } catch (error) {
        console.warn('No se pudo marcar la conversación como leída:', error);
    }
}

function manejarTypingInput() {
    if (!chatState.conversacionActual) return;

    enviarTyping(true);

    clearTimeout(chatState.typingTimer);

    chatState.typingTimer = setTimeout(function () {
        enviarTyping(false);
    }, 1800);
}

async function enviarTyping(typing, conversacionId = chatState.conversacionActual) {
    if (!conversacionId) return;

    if (typing === chatState.isTypingSent) return;

    chatState.isTypingSent = typing;

    const token = getToken();

    try {
        await fetch(`${getApiBase()}/chat/conversaciones/${conversacionId}/typing`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                typing
            })
        });
    } catch (error) {
        console.warn('Typing status could not be updated:', error);
    }
}

async function consultarTyping() {
    if (!chatState.conversacionActual) return;

    const token = getToken();

    try {
        const response = await fetch(
            `${getApiBase()}/chat/conversaciones/${chatState.conversacionActual}/typing`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Typing status could not be loaded');
        }

        renderTypingIndicator(data.usuarios || []);
    } catch (error) {
        console.warn('Typing status error:', error);
    }
}

function renderTypingIndicator(usuarios) {
    const indicator = document.getElementById('chatTypingIndicator');
    const text = document.getElementById('chatTypingText');

    if (!indicator || !text) return;

    if (!usuarios.length) {
        indicator.hidden = true;
        text.textContent = '';
        return;
    }

    const nombres = usuarios.map(user => user.nombre).filter(Boolean);

    if (nombres.length === 1) {
        text.textContent = `${nombres[0]} is typing`;
    } else {
        text.textContent = `${nombres.length} people are typing`;
    }

    indicator.hidden = false;
}

function obtenerApiOriginChat() {
    const apiBase = String(window.API_URL || '').replace(/\/$/, '');
    return apiBase.replace(/\/api$/, '') || window.location.origin;
}

function resolverUrlFotoChat(url) {
    if (!url) return '';

    const value = String(url).trim();

    if (/^(https?:|data:|blob:)/i.test(value)) {
        return value;
    }

    const origin = obtenerApiOriginChat();

    return value.startsWith('/')
        ? `${origin}${value}`
        : `${origin}/${value}`;
}

function renderChatAvatar(name, photoUrl, className) {
    const resolvedPhoto = resolverUrlFotoChat(photoUrl);
    const initials = escapeHtml(getInitials(name));

    if (resolvedPhoto) {
        return `
            <div
                class="${className} has-image"
                style="background-image: url('${escapeAttr(resolvedPhoto)}');"
                title="${escapeAttr(name || 'User')}"
            ></div>
        `;
    }

    return `
        <div class="${className}" title="${escapeAttr(name || 'User')}">
            ${initials}
        </div>
    `;
}