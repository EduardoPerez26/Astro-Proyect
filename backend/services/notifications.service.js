const { pool } = require('../config/database');
const { sendToUser , sendToUsers} = require('./sse.service');
const VALID_PRIORITIES = new Set(['low', 'normal', 'high']);

function normalizePriority(priority) {
    return VALID_PRIORITIES.has(priority) ? priority : 'normal';
}

function normalizeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
}

function normalizeUrl(value) {
    const url = String(value ?? '').trim();
    if (!url) return null;

    // Internal URLs are preferred. Absolute URLs are accepted for future extensibility.
    if (url.startsWith('/') || /^https?:\/\//i.test(url)) return url;

    return `/${url.replace(/^\/+/, '')}`;
}

async function createNotification(options = {}) {
    const usuarioId = Number(options.usuarioId || options.usuario_id);
    const titulo = normalizeText(options.titulo || options.title);
    const mensaje = normalizeText(options.mensaje || options.message);

    if (!usuarioId || !titulo || !mensaje) {
        return null;
    }

    const metadata = options.metadata && typeof options.metadata === 'object'
        ? JSON.stringify(options.metadata)
        : null;

    const [result] = await pool.query(`
        INSERT INTO notificaciones (
            usuario_id,
            creado_por,
            tipo,
            titulo,
            mensaje,
            url_accion,
            prioridad,
            metadata
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        usuarioId,
        options.creadoPor || options.creado_por || null,
        normalizeText(options.tipo || options.type, 'system').slice(0, 40),
        titulo.slice(0, 160),
        mensaje,
        normalizeUrl(options.urlAccion || options.url_accion || options.actionUrl),
        normalizePriority(options.prioridad || options.priority),
        metadata
    ]);

    sendToUser(usuarioId, 'notification',{
        id: result.insertId,
        tipo: normalizeText(options.tipo || options.type, 'system').slice(0, 40),
        titulo:titulo.slice(0, 160),
        mensaje,
        url_accion: normalizeUrl(options.urlAccion || options.url_accion || options.actionUrl),
        prioridad: normalizePriority(options.prioridad || options.priority),
        leida: false,
        fecha_creacion: new Date().toISOString()
    });

    return result.insertId;
}

async function createNotificationsForUsers(usuarioIds = [], options = {}) {
    const uniqueIds = [...new Set(
        usuarioIds
            .map(id => Number(id))
            .filter(id => Number.isInteger(id) && id > 0)
    )];

    if (!uniqueIds.length) {
        return { inserted: 0, userIds: [] };
    }

    const titulo = normalizeText(options.titulo || options.title).slice(0, 160);
    const mensaje = normalizeText(options.mensaje || options.message);

    if (!titulo || !mensaje) {
        return { inserted: 0, userIds: [] };
    }

    const metadata = options.metadata && typeof options.metadata === 'object'
        ? JSON.stringify(options.metadata)
        : null;

    const values = uniqueIds.map(usuarioId => [
        usuarioId,
        options.creadoPor || options.creado_por || null,
        normalizeText(options.tipo || options.type, 'system').slice(0, 40),
        titulo,
        mensaje,
        normalizeUrl(options.urlAccion || options.url_accion || options.actionUrl),
        normalizePriority(options.prioridad || options.priority),
        metadata
    ]);

    const [result] = await pool.query(`
        INSERT INTO notificaciones (
            usuario_id,
            creado_por,
            tipo,
            titulo,
            mensaje,
            url_accion,
            prioridad,
            metadata
        )
        VALUES ?
    `, [values]);

    uniqueIds.forEach((usuarioId,index) => {
        sendToUser(usuarioId, 'notification',{
            id: result.insertId ? result.insertId + index : null,
            tipo:normalizeText(options.tipo || options.type, 'system').slice(0, 40),
            titulo,
            mensaje,
            url_accion: normalizeUrl(options.urlAccion || options.url_accion || options.actionUrl),
            prioridad: normalizePriority(options.prioridad || options.priority), 
            leida: false,
            fecha_creacion: new Date().toISOString()
        });
    });

    return {
        inserted: result.affectedRows || 0,
        userIds: uniqueIds
    };
}

async function createChatMessageNotifications({
    conversacionId,
    senderId,
    senderName,
    mensaje,
    messageId
}) {
    const [recipients] = await pool.query(`
        SELECT cu.usuario_id
        FROM chat_conversaciones_usuarios cu
        WHERE cu.conversacion_id = ?
          AND cu.usuario_id <> ?
    `, [conversacionId, senderId]);

    const recipientIds = recipients.map(row => row.usuario_id);

    if (!recipientIds.length) {
        return { inserted: 0, userIds: [] };
    }

    const cleanMessage = normalizeText(mensaje, 'New message');
    const preview = cleanMessage.length > 120
        ? `${cleanMessage.slice(0, 117)}...`
        : cleanMessage;

    const result = await createNotificationsForUsers(recipientIds, {
        creadoPor: senderId,
        tipo: 'chat',
        prioridad: 'normal',
        titulo: `New message from ${normalizeText(senderName, 'User')}`,
        mensaje: preview,
        urlAccion: `/views/chat?conversation=${conversacionId}`,
        metadata: {
            conversacion_id: conversacionId,
            mensaje_id: messageId,
            sender_id: senderId
        }
    });

    sendToUsers(recipientIds,'chat-message',{
        conversacion_id: conversacionId,
        mensaje_id:messageId,
        sender_id:senderId,
        sender_name: senderName,
        mensaje:cleanMessage
    });

    return result;
}

module.exports = {
    createNotification,
    createNotificationsForUsers,
    createChatMessageNotifications
};
