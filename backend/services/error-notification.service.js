const crypto = require('crypto');
const { pool } = require('../config/database');
const { createNotificationsForUsers } = require('./notifications.service');

const DEFAULT_COOLDOWN_MINUTES = 10;
const MAX_FIELD_LENGTH = 500;
const MAX_STACK_LENGTH = 8000;
const MAX_BODY_LENGTH = 5000;
const recentNotifications = new Map();

function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function truncate(value, maxLength = MAX_FIELD_LENGTH) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function normalizePath(path) {
    return String(path || '')
        .replace(/\/\d+(?=\/|$)/g, '/:id')
        .replace(/[a-f0-9]{16,}/gi, ':hash')
        .slice(0, 500);
}

function getUsuarioId(req) {
    return req?.usuario?.id || req?.user?.id || req?.usuario?.userId || null;
}

function getUserLabel(req) {
    const usuario = req?.usuario || req?.user || {};
    return truncate(
        usuario.nombre_completo ||
        usuario.nombre ||
        usuario.username ||
        usuario.email ||
        (usuario.id ? `User #${usuario.id}` : 'Unauthenticated'),
        160
    );
}

function getClientIp(req) {
    const forwarded = req?.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req?.ip || req?.socket?.remoteAddress || null;
}

function sanitizeObject(value, depth = 0) {
    if (value === null || value === undefined) return value;
    if (depth > 3) return '[Max depth reached]';

    if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
    if (Array.isArray(value)) {
        return value.slice(0, 30).map(item => sanitizeObject(item, depth + 1));
    }

    if (typeof value === 'object') {
        const output = {};
        const secretPattern = /(password|pass|token|secret|authorization|cookie|mfa|otp|code|jwt|key)/i;

        Object.entries(value).slice(0, 50).forEach(([key, item]) => {
            if (secretPattern.test(key)) {
                output[key] = '[REDACTED]';
            } else if (item && typeof item === 'object' && item.buffer && item.originalname) {
                output[key] = `[Uploaded file: ${item.originalname}]`;
            } else {
                output[key] = sanitizeObject(item, depth + 1);
            }
        });

        return output;
    }

    if (typeof value === 'string') {
        return value.length > 1000 ? `${value.slice(0, 997)}...` : value;
    }

    return value;
}

function safeJson(value, maxLength = MAX_BODY_LENGTH) {
    if (value === undefined) return null;

    try {
        const sanitized = sanitizeObject(value);
        const json = JSON.stringify(sanitized);

        if (!json || json.length <= maxLength) {
            return json;
        }

        return JSON.stringify({
            truncated: true,
            original_length: json.length,
            preview: json.slice(0, Math.max(0, maxLength - 100))
        });
    } catch {
        return null;
    }
}

function extractErrorData({ req, res, err, responseBody, metadata = {} }) {
    const bodyMessage = responseBody && typeof responseBody === 'object'
        ? responseBody.message || responseBody.mensaje || responseBody.error || responseBody.code
        : null;

    const errorMessage = truncate(
        err?.message ||
        metadata.message ||
        bodyMessage ||
        `HTTP ${res?.statusCode || 500} response`,
        1000
    );

    const errorCode = truncate(
        err?.code ||
        err?.type ||
        responseBody?.code ||
        metadata.code ||
        'UNHANDLED_SERVER_ERROR',
        120
    );

    const method = String(req?.method || metadata.method || 'UNKNOWN').toUpperCase();
    const originalPath = req?.originalUrl || req?.url || metadata.path || '';
    const normalizedPath = normalizePath(req?.route?.path || req?.path || originalPath);
    const statusCode = Number(res?.statusCode || err?.status || err?.statusCode || metadata.statusCode || 500);
    const errorName = truncate(err?.name || metadata.name || 'ServerError', 160);
    const routeLabel = truncate(`${method} ${normalizedPath || originalPath}`, 220);

    const hashPayload = [
        method,
        normalizedPath || originalPath,
        statusCode,
        errorCode,
        errorMessage
    ].join('|');

    return {
        errorHash: crypto.createHash('sha256').update(hashPayload).digest('hex'),
        statusCode,
        method,
        path: truncate(originalPath, 500),
        normalizedPath: truncate(normalizedPath, 500),
        routeLabel,
        userId: getUsuarioId(req),
        userLabel: getUserLabel(req),
        ipAddress: truncate(getClientIp(req), 80),
        userAgent: truncate(req?.headers?.['user-agent'], 500),
        errorName,
        errorCode,
        errorMessage,
        stackTrace: truncate(err?.stack, MAX_STACK_LENGTH),
        queryParams: safeJson(req?.query, 3000),
        bodySnapshot: safeJson(req?.body, MAX_BODY_LENGTH),
        responseSnapshot: safeJson(responseBody, 3000),
        metadata: safeJson(metadata, 3000)
    };
}

async function getAdminUserIds() {
    const [rows] = await pool.query(`
        SELECT id
        FROM usuarios
        WHERE activo = TRUE
          AND rol IN ('superadmin', 'admin')
    `);

    return rows.map(row => row.id);
}

async function upsertErrorLog(errorData) {
    const [result] = await pool.query(`
        INSERT INTO system_error_logs (
            error_hash,
            status_code,
            method,
            request_path,
            normalized_path,
            user_id,
            user_label,
            ip_address,
            user_agent,
            error_name,
            error_code,
            error_message,
            stack_trace,
            query_params,
            body_snapshot,
            response_snapshot,
            metadata,
            first_seen_at,
            last_seen_at,
            occurrences
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 1)
        ON DUPLICATE KEY UPDATE
            status_code = VALUES(status_code),
            method = VALUES(method),
            request_path = VALUES(request_path),
            normalized_path = VALUES(normalized_path),
            user_id = VALUES(user_id),
            user_label = VALUES(user_label),
            ip_address = VALUES(ip_address),
            user_agent = VALUES(user_agent),
            error_name = VALUES(error_name),
            error_code = VALUES(error_code),
            error_message = VALUES(error_message),
            stack_trace = VALUES(stack_trace),
            query_params = VALUES(query_params),
            body_snapshot = VALUES(body_snapshot),
            response_snapshot = VALUES(response_snapshot),
            metadata = VALUES(metadata),
            last_seen_at = NOW(),
            occurrences = occurrences + 1,
            resolved_at = NULL,
            resolved_by = NULL,
            resolution_notes = NULL
    `, [
        errorData.errorHash,
        errorData.statusCode,
        errorData.method,
        errorData.path,
        errorData.normalizedPath,
        errorData.userId,
        errorData.userLabel,
        errorData.ipAddress,
        errorData.userAgent,
        errorData.errorName,
        errorData.errorCode,
        errorData.errorMessage,
        errorData.stackTrace,
        errorData.queryParams || null,
        errorData.bodySnapshot || null,
        errorData.responseSnapshot || null,
        errorData.metadata || null
    ]);

    const [[row]] = await pool.query(`
        SELECT id, occurrences, first_seen_at, last_seen_at
        FROM system_error_logs
        WHERE error_hash = ?
        LIMIT 1
    `, [errorData.errorHash]);

    return {
        id: row?.id || result.insertId,
        occurrences: Number(row?.occurrences || 1),
        firstSeenAt: row?.first_seen_at || null,
        lastSeenAt: row?.last_seen_at || null
    };
}

function shouldNotify(errorHash, statusCode) {
    const cooldownMinutes = toNumber(
        process.env.ERROR_NOTIFICATION_COOLDOWN_MINUTES,
        DEFAULT_COOLDOWN_MINUTES
    );
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const now = Date.now();
    const lastSent = recentNotifications.get(errorHash) || 0;

    if (now - lastSent < cooldownMs) {
        return false;
    }

    // Always alert for 5xx errors. Also alert for oversized payloads because they usually
    // require a frontend/export fix.
    const alertable = statusCode >= 500 || statusCode === 413;
    if (!alertable) return false;

    recentNotifications.set(errorHash, now);

    if (recentNotifications.size > 1000) {
        for (const [key, value] of recentNotifications.entries()) {
            if (now - value > cooldownMs * 2) recentNotifications.delete(key);
        }
    }

    return true;
}

function buildNotificationPayload(errorData, logInfo) {
    const title = `Backend error ${errorData.statusCode}: ${errorData.routeLabel}`.slice(0, 160);
    const userPart = errorData.userLabel ? `User: ${errorData.userLabel}` : 'User: unknown';
    const ipPart = errorData.ipAddress ? `IP: ${errorData.ipAddress}` : 'IP: unknown';
    const countPart = logInfo.occurrences > 1 ? `Occurrences: ${logInfo.occurrences}` : 'First occurrence';
    const message = [
        errorData.errorMessage || 'An unexpected backend error occurred.',
        userPart,
        ipPart,
        countPart
    ].join(' | ');

    return {
        tipo: 'error',
        prioridad: 'high',
        titulo: title,
        mensaje: message.slice(0, 900),
        urlAccion: '/views/dashboard-admin?section=system-errors',
        metadata: {
            error_log_id: logInfo.id,
            error_hash: errorData.errorHash,
            status_code: errorData.statusCode,
            method: errorData.method,
            path: errorData.path,
            normalized_path: errorData.normalizedPath,
            error_code: errorData.errorCode,
            occurrences: logInfo.occurrences
        }
    };
}

async function notifyAdminsAboutError({ req, res, err, responseBody, metadata } = {}) {
    try {
        const errorData = extractErrorData({ req, res, err, responseBody, metadata });
        const logInfo = await upsertErrorLog(errorData);

        if (!shouldNotify(errorData.errorHash, errorData.statusCode)) {
            return { notified: false, logId: logInfo.id, reason: 'cooldown_or_not_alertable' };
        }

        const adminIds = await getAdminUserIds();
        if (!adminIds.length) {
            return { notified: false, logId: logInfo.id, reason: 'no_admins' };
        }

        const notification = buildNotificationPayload(errorData, logInfo);
        const result = await createNotificationsForUsers(adminIds, notification);

        return {
            notified: result.inserted > 0,
            inserted: result.inserted,
            logId: logInfo.id,
            adminIds
        };
    } catch (notificationError) {
        console.error('Admin error notification failed:', notificationError);
        return { notified: false, reason: 'notification_failed' };
    }
}

module.exports = {
    notifyAdminsAboutError,
    extractErrorData,
    sanitizeObject
};
