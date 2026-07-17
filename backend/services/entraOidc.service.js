const crypto = require('crypto');
const jwt = require('jsonwebtoken');

let discoveryCache = null;
let discoveryExpiresAt = 0;
let jwksCache = null;
let jwksExpiresAt = 0;

function value(key) {
    return String(process.env[key] || '').trim();
}

function getEntraConfigStatus() {
    const required = [
        'ENTRA_TENANT_ID',
        'ENTRA_CLIENT_ID',
        'ENTRA_CLIENT_SECRET',
        'ENTRA_REDIRECT_URI'
    ];
    const missing = required.filter(key => !value(key));

    return {
        enabled: missing.length === 0,
        missing,
        tenantId: value('ENTRA_TENANT_ID'),
        clientId: value('ENTRA_CLIENT_ID'),
        redirectUri: value('ENTRA_REDIRECT_URI'),
        allowedDomains: value('ENTRA_ALLOWED_DOMAINS')
            .split(',')
            .map(item => item.trim().toLowerCase())
            .filter(Boolean)
    };
}

function randomBase64Url(bytes = 32) {
    return crypto.randomBytes(bytes).toString('base64url');
}

function sha256Base64Url(input) {
    return crypto.createHash('sha256').update(input).digest('base64url');
}

async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                ...(options.headers || {})
            }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(
                data.error_description || data.error || `Microsoft identity request failed (${response.status}).`
            );
            error.status = response.status;
            throw error;
        }
        return data;
    } finally {
        clearTimeout(timeout);
    }
}

async function getDiscovery() {
    const config = getEntraConfigStatus();
    if (!config.enabled) {
        const error = new Error(`Microsoft Entra ID is not configured: ${config.missing.join(', ')}`);
        error.code = 'ENTRA_NOT_CONFIGURED';
        throw error;
    }

    if (discoveryCache && discoveryExpiresAt > Date.now()) return discoveryCache;

    const tenant = encodeURIComponent(config.tenantId);
    discoveryCache = await fetchJson(
        `https://login.microsoftonline.com/${tenant}/v2.0/.well-known/openid-configuration`
    );
    discoveryExpiresAt = Date.now() + 60 * 60 * 1000;
    return discoveryCache;
}

async function getJwks(uri) {
    if (jwksCache && jwksExpiresAt > Date.now()) return jwksCache;
    jwksCache = await fetchJson(uri);
    jwksExpiresAt = Date.now() + 60 * 60 * 1000;
    return jwksCache;
}

async function createAuthorizationContext({ rememberSession = false }) {
    const config = getEntraConfigStatus();
    const discovery = await getDiscovery();
    const state = randomBase64Url(24);
    const nonce = randomBase64Url(24);
    const codeVerifier = randomBase64Url(48);
    const codeChallenge = sha256Base64Url(codeVerifier);

    const contextToken = jwt.sign(
        {
            purpose: 'entra-oauth-context',
            state,
            nonce,
            codeVerifier,
            rememberSession: Boolean(rememberSession)
        },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
    );

    const authorizeUrl = new URL(discovery.authorization_endpoint);
    authorizeUrl.search = new URLSearchParams({
        client_id: config.clientId,
        response_type: 'code',
        redirect_uri: config.redirectUri,
        response_mode: 'query',
        scope: 'openid profile email',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account'
    }).toString();

    return {
        contextToken,
        authorizationUrl: authorizeUrl.toString()
    };
}

function verifyAuthorizationContext(contextToken, returnedState) {
    const context = jwt.verify(contextToken, process.env.JWT_SECRET);
    if (context.purpose !== 'entra-oauth-context' || context.state !== returnedState) {
        const error = new Error('Microsoft sign-in state validation failed.');
        error.code = 'ENTRA_STATE_INVALID';
        throw error;
    }
    return context;
}

async function exchangeAuthorizationCode({ code, context }) {
    const config = getEntraConfigStatus();
    const discovery = await getDiscovery();
    const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: value('ENTRA_CLIENT_SECRET'),
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        code_verifier: context.codeVerifier,
        scope: 'openid profile email'
    });

    return fetchJson(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });
}

async function verifyIdentityToken(idToken, expectedNonce) {
    const config = getEntraConfigStatus();
    const discovery = await getDiscovery();
    const decoded = jwt.decode(idToken, { complete: true });

    if (!decoded?.header?.kid || decoded.header.alg !== 'RS256') {
        const error = new Error('Microsoft identity token header is invalid.');
        error.code = 'ENTRA_TOKEN_HEADER_INVALID';
        throw error;
    }

    const jwks = await getJwks(discovery.jwks_uri);
    const jwk = Array.isArray(jwks.keys)
        ? jwks.keys.find(item => item.kid === decoded.header.kid && item.kty === 'RSA')
        : null;

    if (!jwk) {
        jwksCache = null;
        jwksExpiresAt = 0;
        const error = new Error('Microsoft signing key was not found.');
        error.code = 'ENTRA_SIGNING_KEY_NOT_FOUND';
        throw error;
    }

    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const claims = jwt.verify(idToken, publicKey, {
        algorithms: ['RS256'],
        audience: config.clientId,
        issuer: discovery.issuer,
        clockTolerance: 60
    });

    if (!claims.nonce || claims.nonce !== expectedNonce) {
        const error = new Error('Microsoft identity nonce validation failed.');
        error.code = 'ENTRA_NONCE_INVALID';
        throw error;
    }

    const email = String(
        claims.preferred_username || claims.email || claims.upn || ''
    ).trim().toLowerCase();
    const domain = email.includes('@') ? email.split('@').pop() : '';

    if (!email) {
        const error = new Error('Microsoft did not return an account email address.');
        error.code = 'ENTRA_EMAIL_MISSING';
        throw error;
    }

    if (config.allowedDomains.length && !config.allowedDomains.includes(domain)) {
        const error = new Error('The Microsoft account domain is not allowed.');
        error.code = 'ENTRA_DOMAIN_NOT_ALLOWED';
        throw error;
    }

    return {
        subject: claims.sub,
        objectId: claims.oid || null,
        tenantId: claims.tid || null,
        email,
        username: email,
        name: claims.name || email,
        claims
    };
}

module.exports = {
    getEntraConfigStatus,
    createAuthorizationContext,
    verifyAuthorizationContext,
    exchangeAuthorizationCode,
    verifyIdentityToken
};
