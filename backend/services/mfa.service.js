const crypto = require('crypto');
const QRCode = require('qrcode');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const MFA_ISSUER = process.env.MFA_ISSUER || 'XBFS Operations Hub';

function toBase32(buffer) {
    let bits = '';
    let output = '';

    for (const byte of buffer) {
        bits += byte.toString(2).padStart(8, '0');
    }

    for (let index = 0; index < bits.length; index += 5) {
        const chunk = bits.slice(index, index + 5).padEnd(5, '0');
        output += BASE32_ALPHABET[parseInt(chunk, 2)];
    }

    return output;
}

function fromBase32(secret) {
    const clean = String(secret || '')
        .replace(/[^A-Z2-7]/gi, '')
        .toUpperCase();
    let bits = '';
    const bytes = [];

    for (const char of clean) {
        const value = BASE32_ALPHABET.indexOf(char);
        if (value === -1) continue;
        bits += value.toString(2).padStart(5, '0');
    }

    for (let index = 0; index + 8 <= bits.length; index += 8) {
        bytes.push(parseInt(bits.slice(index, index + 8), 2));
    }

    return Buffer.from(bytes);
}

function obtenerLlaveCifrado() {
    const fuente = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET;

    if (!fuente) {
        throw new Error('MFA_ENCRYPTION_KEY or JWT_SECRET is required for authenticator secrets.');
    }

    return crypto.createHash('sha256').update(String(fuente)).digest();
}

function cifrarSecreto(secret) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', obtenerLlaveCifrado(), iv);
    const encrypted = Buffer.concat([
        cipher.update(String(secret), 'utf8'),
        cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    return [
        'v1',
        iv.toString('base64url'),
        tag.toString('base64url'),
        encrypted.toString('base64url')
    ].join(':');
}

function descifrarSecreto(payload) {
    const [version, ivBase64, tagBase64, encryptedBase64] = String(payload || '').split(':');

    if (version !== 'v1' || !ivBase64 || !tagBase64 || !encryptedBase64) {
        throw new Error('The authenticator secret has an invalid format.');
    }

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        obtenerLlaveCifrado(),
        Buffer.from(ivBase64, 'base64url')
    );

    decipher.setAuthTag(Buffer.from(tagBase64, 'base64url'));

    return Buffer.concat([
        decipher.update(Buffer.from(encryptedBase64, 'base64url')),
        decipher.final()
    ]).toString('utf8');
}

function generarSecretoAuthenticator() {
    return toBase32(crypto.randomBytes(20));
}

function crearOtpauthUrl({ secret, accountName, issuer = MFA_ISSUER }) {
    const label = `${issuer}:${accountName || 'user'}`;
    const params = new URLSearchParams({
        secret,
        issuer,
        algorithm: 'SHA1',
        digits: '6',
        period: '30'
    });

    return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

function hotp(secret, counter) {
    const key = fromBase32(secret);
    const counterBuffer = Buffer.alloc(8);
    const high = Math.floor(counter / 0x100000000);
    const low = counter >>> 0;

    counterBuffer.writeUInt32BE(high, 0);
    counterBuffer.writeUInt32BE(low, 4);

    const hmac = crypto
        .createHmac('sha1', key)
        .update(counterBuffer)
        .digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = (
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff)
    );

    return String(binary % 1000000).padStart(6, '0');
}

function verificarCodigoTotp(secret, code, options = {}) {
    const cleanCode = String(code || '').replace(/\D/g, '');
    const window = Number.isInteger(options.window) ? options.window : 1;
    const period = Number(options.period || 30);
    const now = Number(options.now || Date.now());
    const currentCounter = Math.floor(now / 1000 / period);

    if (!/^\d{6}$/.test(cleanCode)) return false;

    for (let offset = -window; offset <= window; offset += 1) {
        const expected = hotp(secret, currentCounter + offset);
        const expectedBuffer = Buffer.from(expected);
        const codeBuffer = Buffer.from(cleanCode);

        if (
            expectedBuffer.length === codeBuffer.length &&
            crypto.timingSafeEqual(expectedBuffer, codeBuffer)
        ) {
            return true;
        }
    }

    return false;
}

async function crearQrDataUrl(otpauthUrl) {
    return QRCode.toDataURL(otpauthUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 240
    });
}

module.exports = {
    MFA_ISSUER,
    cifrarSecreto,
    descifrarSecreto,
    crearOtpauthUrl,
    crearQrDataUrl,
    generarSecretoAuthenticator,
    verificarCodigoTotp
};
