const crypto = require('crypto');
const { pool } = require('../config/database');

function tokenHash(token) {
    return crypto
        .createHash('sha256')
        .update(String(token || ''))
        .digest('hex');
}

function isSchemaError(error) {
    return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR', 'ER_PARSE_ERROR'].includes(error.code);
}

function getClientIp(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '')
        .split(',')[0]
        .trim();

    return forwarded || req.ip || req.socket?.remoteAddress || '';
}

function getUserAgent(req) {
    return String(req.headers['user-agent'] || '').slice(0, 255);
}

async function registrarEventoSeguridad({
    usuarioId = null,
    departamentoId = null,
    evento,
    req,
    detalle = {}
}) {
    try {
        await pool.query(
            `INSERT INTO auditoria_seguridad
             (usuario_id, departamento_id, evento, ip_address, user_agent, detalle)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                usuarioId,
                departamentoId,
                String(evento || 'evento').slice(0, 80),
                getClientIp(req),
                getUserAgent(req),
                JSON.stringify(detalle || {})
            ]
        );
    } catch (error) {
        if (!isSchemaError(error)) {
            console.warn('No se pudo registrar auditoria de seguridad:', error.code || error.message);
        }
    }
}

async function registrarIntentoLogin({
    username,
    req,
    exitoso,
    detalle = ''
}) {
    try {
        await pool.query(
            `INSERT INTO seguridad_login_intentos
             (username, ip_address, exitoso, detalle)
             VALUES (?, ?, ?, ?)`,
            [
                String(username || '').slice(0, 120),
                getClientIp(req),
                Boolean(exitoso),
                String(detalle || '').slice(0, 255)
            ]
        );
    } catch (error) {
        if (!isSchemaError(error)) {
            console.warn('No se pudo registrar intento de login:', error.code || error.message);
        }
    }
}

async function contarIntentosFallidos({
    username,
    req,
    ventanaMinutos = 15
}) {
    try {
        const [rows] = await pool.query(
            `SELECT COUNT(*) AS total
             FROM seguridad_login_intentos
             WHERE username = ?
               AND ip_address = ?
               AND exitoso = FALSE
               AND fecha_creacion >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
            [
                String(username || '').slice(0, 120),
                getClientIp(req),
                Number(ventanaMinutos || 15)
            ]
        );

        return Number(rows[0]?.total || 0);
    } catch (error) {
        if (!isSchemaError(error)) {
            console.warn('No se pudo consultar intentos de login:', error.code || error.message);
        }
        return 0;
    }
}

module.exports = {
    tokenHash,
    registrarEventoSeguridad,
    registrarIntentoLogin,
    contarIntentosFallidos,
    isSchemaError
};
