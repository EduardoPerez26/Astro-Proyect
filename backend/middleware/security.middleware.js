const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const rateLimiterRegistry = [];

function requestContext(req, res, next) {
    const incoming = String(req.headers['x-request-id'] || '').trim();
    const requestId = /^[A-Za-z0-9._:-]{8,80}$/.test(incoming)
        ? incoming
        : crypto.randomUUID();

    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
}

function securityHeaders(req, res, next) {
    const isProduction = process.env.NODE_ENV === 'production';

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Origin-Agent-Cluster', '?1');
    res.setHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()'
    );

    // The frontend currently uses inline Astro scripts and approved CDNs.
    // This policy limits sources without breaking the deployed application.
    res.setHeader(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
            "object-src 'none'",
            "form-action 'self'",
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.sheetjs.com",
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
            "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:",
            "img-src 'self' data: blob: https:",
            "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
            "worker-src 'self' blob:"
        ].join('; ')
    );

    if (isProduction) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    if (req.path.startsWith('/api/auth')) {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
    } else if (req.path.startsWith('/api')) {
        res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
    }

    next();
}

function sanitizeValue(value, depth = 0) {
    if (depth > 20) return null;
    if (Array.isArray(value)) return value.map(item => sanitizeValue(item, depth + 1));
    if (!value || typeof value !== 'object') return value;

    const clean = {};
    for (const [key, item] of Object.entries(value)) {
        if (BLOCKED_KEYS.has(key)) continue;
        clean[key] = sanitizeValue(item, depth + 1);
    }
    return clean;
}

function sanitizeRequest(req, res, next) {
    if (req.body && typeof req.body === 'object') req.body = sanitizeValue(req.body);
    if (req.query && typeof req.query === 'object') req.query = sanitizeValue(req.query);
    if (req.params && typeof req.params === 'object') req.params = sanitizeValue(req.params);
    next();
}

function resolveRateLimitIdentity(req) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return null;

    try {
        const decoded = jwt.decode(authHeader.slice(7).trim());
        return decoded?.id ? `user:${decoded.id}` : null;
    } catch {
        return null;
    }
}

function createRateLimiter({
    windowMs = 15 * 60 * 1000,
    max = 300,
    keyPrefix = 'global',
    skip = () => false,
    message = 'Too many requests. Try again later.'
} = {}) {
    const buckets = new Map();
    let lastCleanup = Date.now();
    const stats = { totalRequests: 0, totalBlocked: 0 };

    rateLimiterRegistry.push({ keyPrefix, max, windowMs, buckets, stats });

    return (req, res, next) => {
        if (skip(req)) return next();

        stats.totalRequests += 1;

        const now = Date.now();
        if (now - lastCleanup > windowMs) {
            for (const [key, bucket] of buckets.entries()) {
                if (bucket.resetAt <= now) buckets.delete(key);
            }
            lastCleanup = now;
        }

        const ip = String(req.headers['x-forwarded-for'] || '')
            .split(',')[0]
            .trim() || req.ip || req.socket?.remoteAddress || 'unknown';
        const identity = resolveRateLimitIdentity(req) || `ip:${ip}`;
        const key = `${keyPrefix}:${identity}`;
        const current = buckets.get(key);
        const bucket = !current || current.resetAt <= now
            ? { count: 0, resetAt: now + windowMs }
            : current;

        bucket.count += 1;
        buckets.set(key, bucket);

        const remaining = Math.max(max - bucket.count, 0);
        res.setHeader('RateLimit-Limit', String(max));
        res.setHeader('RateLimit-Remaining', String(remaining));
        res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

        if (bucket.count > max) {
            stats.totalBlocked += 1;
            res.setHeader('Retry-After', String(Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1)));
            return res.status(429).json({
                error: true,
                message,
                request_id: req.requestId || null
            });
        }

        next();
    };
}

function getRateLimiterStats() {
    const now = Date.now();
    return rateLimiterRegistry.map(entry => ({
        key: entry.keyPrefix,
        limit: entry.max,
        window_ms: entry.windowMs,
        active_clients: Array.from(entry.buckets.values()).filter(bucket => bucket.resetAt > now).length,
        total_requests: entry.stats.totalRequests,
        total_blocked: entry.stats.totalBlocked
    }));
}



function csrfOriginGuard(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    const authorization = String(req.headers.authorization || '');
    const cookieHeader = String(req.headers.cookie || '');
    const usesAuthCookie = /(?:^|;\s*)auth_token=/.test(cookieHeader);

    // Bearer-authenticated API clients are not vulnerable to browser form CSRF.
    if (!usesAuthCookie || authorization.startsWith('Bearer ')) return next();

    const configuredOrigins = String(process.env.FRONTEND_ORIGINS || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    const requestOrigin = String(req.headers.origin || '').trim();
    const refererOrigin = (() => {
        try {
            return req.headers.referer ? new URL(req.headers.referer).origin : '';
        } catch {
            return '';
        }
    })();
    const candidateOrigin = requestOrigin || refererOrigin;
    const hostOrigin = `${req.protocol}://${req.get('host')}`;
    const isLocal = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(candidateOrigin);
    const allowed = candidateOrigin && (
        candidateOrigin === hostOrigin ||
        configuredOrigins.includes(candidateOrigin) ||
        isLocal
    );
    const hasRequestId = /^[A-Za-z0-9._:-]{8,80}$/.test(
        String(req.headers['x-request-id'] || '')
    );

    if (!allowed || !hasRequestId) {
        return res.status(403).json({
            error: true,
            message: 'The request could not be validated against cross-site request forgery.',
            code: 'CSRF_VALIDATION_FAILED',
            request_id: req.requestId || null
        });
    }

    next();
}

function uploadStaticHeaders(res, filePath) {
    const lower = String(filePath || '').toLowerCase();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('Cache-Control', 'private, max-age=300');

    if (/\.(html?|svg|js|mjs|cjs)$/i.test(lower)) {
        res.setHeader('Content-Type', 'application/octet-stream');
    }
}

module.exports = {
    requestContext,
    securityHeaders,
    sanitizeRequest,
    createRateLimiter,
    getRateLimiterStats,
    csrfOriginGuard,
    uploadStaticHeaders
};

