const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { createRateLimiter, resolveRateLimitIdentity } = require('../middleware/security.middleware');

function fakeReq({ userId, ip = '10.0.0.1' } = {}) {
    const headers = { 'x-forwarded-for': ip };
    if (userId) {
        headers.authorization = `Bearer ${jwt.sign({ id: userId }, 'test-secret')}`;
    }
    return { headers, ip, socket: {} };
}

function fakeRes() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; }
    };
}

test('resolveRateLimitIdentity reads the user id out of the bearer token', () => {
    const token = jwt.sign({ id: 77 }, 'whatever-secret');
    const identity = resolveRateLimitIdentity({ headers: { authorization: `Bearer ${token}` } });
    assert.equal(identity, 'user:77');
});

test('resolveRateLimitIdentity returns null when there is no bearer token', () => {
    assert.equal(resolveRateLimitIdentity({ headers: {} }), null);
});

test('two authenticated users behind the same IP get independent buckets', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 60000, keyPrefix: 'test-shared-ip' });
    const userA = fakeReq({ userId: 1 });
    const userB = fakeReq({ userId: 2 });

    limiter(userA, fakeRes(), () => {});
    limiter(userA, fakeRes(), () => {});

    const blockedRes = fakeRes();
    let userAAllowed = false;
    limiter(userA, blockedRes, () => { userAAllowed = true; });
    assert.equal(userAAllowed, false);
    assert.equal(blockedRes.statusCode, 429);

    const freshRes = fakeRes();
    let userBAllowed = false;
    limiter(userB, freshRes, () => { userBAllowed = true; });
    assert.equal(userBAllowed, true);
});

test('unauthenticated requests still fall back to per-IP limiting', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60000, keyPrefix: 'test-anon' });
    const anon = { headers: { 'x-forwarded-for': '10.0.0.9' }, ip: '10.0.0.9', socket: {} };

    limiter(anon, fakeRes(), () => {});

    const blockedRes = fakeRes();
    let allowed = false;
    limiter(anon, blockedRes, () => { allowed = true; });
    assert.equal(allowed, false);
    assert.equal(blockedRes.statusCode, 429);
});
