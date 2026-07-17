const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { pool } = require('../config/database');
const {
    verificarToken,
    esAdmin,
    checkPermission
} = require('../middleware/auth.middleware');
const { buildDepartmentContext } = require('../config/departments');
const {
    normalizeUserPermissions,
    isSuperAdmin
} = require('../config/permissions');
const {
    tokenHash,
    registrarEventoSeguridad,
    registrarIntentoLogin,
    contarIntentosFallidos
} = require('../services/securityAudit.service');
const {
    cifrarSecreto,
    descifrarSecreto,
    crearOtpauthUrl,
    crearQrDataUrl,
    generarSecretoAuthenticator,
    verificarCodigoTotp
} = require('../services/mfa.service');
const {
    getEntraConfigStatus,
    createAuthorizationContext,
    verifyAuthorizationContext,
    exchangeAuthorizationCode,
    verifyIdentityToken
} = require('../services/entraOidc.service');

const PROFILE_UPLOAD_DIR = process.env.PROFILE_UPLOAD_DIR
    ? path.resolve(process.env.PROFILE_UPLOAD_DIR)
    : path.join(__dirname, '..', 'uploads', 'perfiles');
const PROFILE_PHOTO_EXTENSIONS = {
    'image/jpeg': '.jpg', 
    'image/png': '.png',
    'image/webp': '.webp'
};

function ensureProfileUploadDir() {
    fs.mkdirSync(PROFILE_UPLOAD_DIR, { recursive: true });
    fs.accessSync(PROFILE_UPLOAD_DIR, fs.constants.W_OK);
}

const profilePhotoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            ensureProfileUploadDir();
            cb(null, PROFILE_UPLOAD_DIR);
        } catch (error) {
            error.message = 'Profile photo storage is not writable. Configure PROFILE_UPLOAD_DIR with a writable folder.';
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const extension = PROFILE_PHOTO_EXTENSIONS[file.mimetype]
            || path.extname(file.originalname || '').toLowerCase()
            || '.jpg';
        const safeExtension = ['.jpg', '.jpeg', '.png', '.webp'].includes(extension)
            ? extension.replace('.jpeg', '.jpg')
            : '.jpg';

        cb(null, `perfil-${req.usuario.id}-${Date.now()}${safeExtension}`);
    }
});

const uploadProfilePhoto = multer({
    storage: profilePhotoStorage,
    limits: { fileSize: Number(process.env.PROFILE_PHOTO_MAX_MB || 3) * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!PROFILE_PHOTO_EXTENSIONS[file.mimetype]) {
            cb(new Error('Only JPG, PNG, or WebP images are allowed.'));
            return;
        }

        cb(null, true);
    }
});

function cargarFotoPerfil(req, res, next) {
    uploadProfilePhoto.fields([
        { name: 'foto', maxCount: 1 },
        { name: 'foto_perfil', maxCount: 1 }
    ])(req, res, (error) => {
        if (!error) {
            next();
            return;
        }

        const mensaje = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
            ? 'The photo cannot exceed 3 MB.'
            : error.message || 'The profile photo could not be uploaded.';

        res.status(400).json({
            error: true,
            mensaje
        });
    });
}

function obtenerFotoPerfilSubida(req) {
    return req.files?.foto?.[0] || req.files?.foto_perfil?.[0] || null;
}

function construirUrlFotoPerfil(file) {
    return file ? `/uploads/perfiles/${file.filename}` : null;
}

function eliminarFotoPerfil(urlFoto) {
    if (!urlFoto || !String(urlFoto).startsWith('/uploads/perfiles/')) return;

    const filePath = path.join(PROFILE_UPLOAD_DIR, path.basename(urlFoto));
    fs.unlink(filePath, () => {});
}

function esErrorColumnaFoto(error) {
    const detalle = [
        error.sqlMessage,
        error.message,
        error.sql
    ].filter(Boolean).join(' ');

    return error.code === 'ER_BAD_FIELD_ERROR' && /foto_perfil_url/i.test(detalle);
}

function construirContextoUsuario(usuario) {
    const departamento = buildDepartmentContext(usuario);
    const permisos = normalizeUserPermissions(
        usuario.permisos,
        usuario.rol,
        { departmentCode: departamento.codigo }
    );

    return {
        id: usuario.id,
        username: usuario.username,
        nombre: usuario.nombre_completo,
        email: usuario.email,
        foto_perfil_url: usuario.foto_perfil_url || null,
        mfa_enabled: Boolean(usuario.mfa_enabled),
        rol: usuario.rol,
        permisos,
        departamento
    };
}

async function obtenerUsuarioConDepartamento(condicion, params) {
    let usuarios;

    try {
        [usuarios] = await pool.query(
            `SELECT u.*,
                    d.codigo AS departamento_codigo,
                    d.nombre AS departamento_nombre,
                    d.activo AS departamento_activo
             FROM usuarios u
             LEFT JOIN departamentos d ON d.id = u.departamento_id
             WHERE ${condicion}
             LIMIT 1`,
            params
        );
    } catch (error) {
        if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) {
            throw error;
        }

        [usuarios] = await pool.query(
            `SELECT u.*,
                    NULL AS departamento_codigo,
                    NULL AS departamento_nombre,
                    NULL AS departamento_activo
             FROM usuarios u
             WHERE ${condicion}
             LIMIT 1`,
            params
        );
    }

    return usuarios[0] || null;
}

function esErrorEsquema(error) {
    return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code);
}

function esErrorEsquemaSesiones(error) {
    const detalle = [
        error.sqlMessage,
        error.message,
        error.sql
    ].filter(Boolean).join(' ');

    return esErrorEsquema(error) && /sesiones/i.test(detalle);
}

function obtenerDuracionSesion(mantenerSesion) {
    const horas = mantenerSesion
        ? Number(process.env.JWT_REMEMBER_HOURS || 24 * 30)
        : Number(process.env.JWT_SESSION_HOURS || 8);

    return Number.isFinite(horas) && horas > 0 ? horas : (mantenerSesion ? 720 : 8);
}

async function registrarSesion(usuarioId, token, req, mantenerSesion = false) {
    const hash = tokenHash(token);
    const fechaExpiracion = new Date(
        Date.now() + obtenerDuracionSesion(mantenerSesion) * 60 * 60 * 1000
    );

    try {
        await pool.query(
            `INSERT INTO sesiones
            (usuario_id, token, token_hash, ip_address, user_agent, fecha_expiracion, ultimo_uso)
            VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [usuarioId, token, hash, req.ip, req.headers['user-agent'], fechaExpiracion]
        );

        return true;
    } catch (error) {
        if (error.code === 'ER_BAD_FIELD_ERROR') {
            try {
                await pool.query(
                    `INSERT INTO sesiones
                    (usuario_id, token, ip_address, user_agent, fecha_expiracion)
                    VALUES (?, ?, ?, ?, ?)`,
                    [usuarioId, token, req.ip, req.headers['user-agent'], fechaExpiracion]
                );
            } catch (fallbackError) {
                if (fallbackError.code === 'ER_DATA_TOO_LONG') {
                    console.warn(
                        'The session could not be stored because sesiones.token is too short. Login will continue with JWT.',
                        fallbackError.code
                    );
                    return false;
                }

                throw fallbackError;
            }

            return true;
        }

        if (error.code === 'ER_DATA_TOO_LONG') {
            console.warn(
                'The session could not be stored because sesiones.token is too short. Login will continue with JWT.',
                error.code
            );
            return false;
        }

        if (!esErrorEsquemaSesiones(error)) {
            throw error;
        }

        console.warn(
            'The session could not be stored because the sesiones table needs to be updated. Login will continue with JWT.',
            error.code
        );
        return false;
    }
}

function opcionesCookieAuth(req, mantenerSesion = false) {
    const esProduccion = process.env.NODE_ENV === 'production';
    const origen = String(req.headers.origin || '');
    const esLocal = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origen);
    const options = {
        httpOnly: true,
        secure: esProduccion && !esLocal,
        sameSite: esProduccion && !esLocal ? 'none' : 'lax',
        path: '/'
    };

    if (mantenerSesion) {
        options.maxAge = obtenerDuracionSesion(true) * 60 * 60 * 1000;
    }

    return options;
}

function crearTokenSesion(usuario, contextoUsuario, mantenerSesion = false) {
    return jwt.sign(
        {
            id: usuario.id,
            username: usuario.username,
            rol: usuario.rol,
            departamento: contextoUsuario.departamento.codigo,
            session_mode: mantenerSesion ? 'persistent' : 'browser'
        },
        process.env.JWT_SECRET,
        {
            expiresIn: mantenerSesion
                ? (process.env.JWT_REMEMBER_EXPIRES_IN || '30d')
                : (process.env.JWT_EXPIRES_IN || '8h')
        }
    );
}

async function finalizarLogin({
    req,
    res,
    usuario,
    detalle = 'login_success',
    mantenerSesion = false
}) {
    const contextoUsuario = construirContextoUsuario(usuario);
    const token = crearTokenSesion(usuario, contextoUsuario, mantenerSesion);

    await registrarSesion(usuario.id, token, req, mantenerSesion);
    await registrarIntentoLogin({
        username: usuario.username,
        req,
        exitoso: true,
        detalle
    });
    await registrarEventoSeguridad({
        usuarioId: usuario.id,
        departamentoId: contextoUsuario.departamento.id,
        evento: detalle,
        req,
        detalle: {
            departamento: contextoUsuario.departamento.codigo,
            sessionMode: mantenerSesion ? 'persistent' : 'browser'
        }
    });

    res.cookie('auth_token', token, opcionesCookieAuth(req, mantenerSesion));

    return res.json({
        error: false,
        mensaje: 'Login successful',
        token,
        usuario: contextoUsuario,
        session: {
            mode: mantenerSesion ? 'persistent' : 'browser',
            expiresInHours: obtenerDuracionSesion(mantenerSesion)
        }
    });
}

function esErrorColumnasMfa(error) {
    const detalle = [
        error.sqlMessage,
        error.message,
        error.sql
    ].filter(Boolean).join(' ');

    return error.code === 'ER_BAD_FIELD_ERROR' && /mfa_/i.test(detalle);
}


const ENTRA_CONTEXT_COOKIE = 'xbfs_entra_oauth_context';

function leerCookie(req, name) {
    const prefix = `${name}=`;
    return String(req.headers.cookie || '')
        .split(';')
        .map(item => item.trim())
        .find(item => item.startsWith(prefix))
        ?.slice(prefix.length) || '';
}

function opcionesCookieEntra(req) {
    const isProduction = process.env.NODE_ENV === 'production';
    const origin = String(req.headers.origin || '');
    const isLocal = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

    return {
        httpOnly: true,
        secure: isProduction && !isLocal,
        sameSite: 'lax',
        maxAge: 10 * 60 * 1000,
        path: '/api/auth/entra'
    };
}

function limpiarCookieEntra(req, res) {
    const options = opcionesCookieEntra(req);
    delete options.maxAge;
    res.clearCookie(ENTRA_CONTEXT_COOKIE, options);
}

function obtenerUrlRetornoEntra(req, parameters = {}) {
    const configured = String(process.env.ENTRA_FRONTEND_RETURN_URL || '').trim();
    const firstOrigin = String(process.env.FRONTEND_ORIGINS || '')
        .split(',')
        .map(item => item.trim())
        .find(Boolean);
    const base = configured || firstOrigin || `${req.protocol}://${req.get('host')}`;
    const url = new URL(base);

    Object.entries(parameters).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });
    return url.toString();
}

async function asegurarTablaTicketsEntra() {
    await pool.query(
        `CREATE TABLE IF NOT EXISTS auth_exchange_tickets (
            id BIGINT NOT NULL AUTO_INCREMENT,
            token_hash CHAR(64) NOT NULL,
            usuario_id INT NOT NULL,
            remember_session BOOLEAN NOT NULL DEFAULT FALSE,
            identity_provider VARCHAR(40) NOT NULL DEFAULT 'microsoft-entra',
            identity_subject VARCHAR(255) NULL,
            identity_email VARCHAR(255) NULL,
            ip_address VARCHAR(64) NULL,
            user_agent VARCHAR(255) NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_auth_exchange_ticket_hash (token_hash),
            INDEX idx_auth_exchange_ticket_expiry (expires_at, used_at),
            INDEX idx_auth_exchange_ticket_user (usuario_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
}

router.get('/entra/config', (req, res) => {
    const status = getEntraConfigStatus();
    res.json({
        error: false,
        enabled: status.enabled,
        missing: process.env.NODE_ENV === 'development' ? status.missing : [],
        login_url: `${req.baseUrl}/entra/login`
    });
});

router.get('/entra/login', async (req, res) => {
    try {
        const status = getEntraConfigStatus();
        if (!status.enabled) {
            return res.redirect(obtenerUrlRetornoEntra(req, { entra_error: 'not-configured' }));
        }

        const context = await createAuthorizationContext({
            rememberSession: String(req.query.remember || '').toLowerCase() === 'true'
        });

        res.cookie(ENTRA_CONTEXT_COOKIE, context.contextToken, opcionesCookieEntra(req));
        return res.redirect(context.authorizationUrl);
    } catch (error) {
        console.error('Microsoft Entra authorization start error:', error);
        return res.redirect(obtenerUrlRetornoEntra(req, { entra_error: 'authorization-start-failed' }));
    }
});

router.get('/entra/callback', async (req, res) => {
    try {
        if (req.query.error) {
            return res.redirect(obtenerUrlRetornoEntra(req, { entra_error: 'access-denied' }));
        }

        const code = String(req.query.code || '').trim();
        const state = String(req.query.state || '').trim();
        const contextToken = decodeURIComponent(leerCookie(req, ENTRA_CONTEXT_COOKIE));
        if (!code || !state || !contextToken) {
            return res.redirect(obtenerUrlRetornoEntra(req, { entra_error: 'callback-invalid' }));
        }

        const context = verifyAuthorizationContext(contextToken, state);
        const tokenResponse = await exchangeAuthorizationCode({ code, context });
        const identity = await verifyIdentityToken(tokenResponse.id_token, context.nonce);
        const usuario = await obtenerUsuarioConDepartamento(
            `(LOWER(u.email) = LOWER(?) OR LOWER(u.username) = LOWER(?))
             AND u.activo = TRUE`,
            [identity.email, identity.email]
        );

        if (!usuario) {
            await registrarEventoSeguridad({
                evento: 'entra_account_not_provisioned',
                req,
                detalle: { email: identity.email, tenantId: identity.tenantId }
            });
            return res.redirect(obtenerUrlRetornoEntra(req, { entra_error: 'account-not-provisioned' }));
        }

        if (
            usuario.rol !== 'superadmin' &&
            usuario.departamento_id &&
            usuario.departamento_activo === 0
        ) {
            return res.redirect(obtenerUrlRetornoEntra(req, { entra_error: 'department-inactive' }));
        }

        await asegurarTablaTicketsEntra();
        const rawTicket = require('crypto').randomBytes(32).toString('base64url');
        await pool.query(
            `INSERT INTO auth_exchange_tickets
                (token_hash, usuario_id, remember_session, identity_subject,
                 identity_email, ip_address, user_agent, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 2 MINUTE))`,
            [
                tokenHash(rawTicket),
                usuario.id,
                Boolean(context.rememberSession),
                identity.objectId || identity.subject,
                identity.email,
                req.ip,
                String(req.headers['user-agent'] || '').slice(0, 255)
            ]
        );

        limpiarCookieEntra(req, res);
        return res.redirect(obtenerUrlRetornoEntra(req, { entra_ticket: rawTicket }));
    } catch (error) {
        console.error('Microsoft Entra callback error:', error);
        limpiarCookieEntra(req, res);
        return res.redirect(obtenerUrlRetornoEntra(req, { entra_error: error.code || 'callback-failed' }));
    }
});

router.post('/entra/exchange', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const rawTicket = String(req.body.ticket || '').trim();
        if (!rawTicket) {
            return res.status(400).json({ error: true, mensaje: 'Microsoft sign-in ticket is required' });
        }

        await asegurarTablaTicketsEntra();
        await connection.beginTransaction();
        const [rows] = await connection.query(
            `SELECT *
             FROM auth_exchange_tickets
             WHERE token_hash = ?
               AND used_at IS NULL
               AND expires_at > NOW()
             LIMIT 1
             FOR UPDATE`,
            [tokenHash(rawTicket)]
        );
        const ticket = rows[0];

        if (!ticket) {
            await connection.rollback();
            return res.status(401).json({ error: true, mensaje: 'Microsoft sign-in ticket is invalid or expired' });
        }

        await connection.query(
            'UPDATE auth_exchange_tickets SET used_at = NOW() WHERE id = ?',
            [ticket.id]
        );
        await connection.commit();

        const usuario = await obtenerUsuarioConDepartamento(
            'u.id = ? AND u.activo = TRUE',
            [ticket.usuario_id]
        );
        if (!usuario) {
            return res.status(401).json({ error: true, mensaje: 'The linked user is inactive or no longer exists' });
        }

        return finalizarLogin({
            req,
            res,
            usuario,
            detalle: 'login_success_entra',
            mantenerSesion: Boolean(ticket.remember_session)
        });
    } catch (error) {
        try { await connection.rollback(); } catch {}
        console.error('Microsoft Entra ticket exchange error:', error);
        return res.status(500).json({ error: true, mensaje: 'Microsoft sign-in could not be completed' });
    } finally {
        connection.release();
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password, mantenerSesion } = req.body;
        const usernameNormalizado = String(username || '').trim();

        // Validate submitted credentials
        if (!usernameNormalizado || !password) {
            return res.status(400).json({
                error: true,
                mensaje: 'Username and password are required'
            });
        }

        const intentosFallidos = await contarIntentosFallidos({
            username: usernameNormalizado,
            req,
            ventanaMinutos: Number(process.env.AUTH_LOCK_WINDOW_MINUTES || 15)
        });
        const maxIntentos = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS || 7);

        if (intentosFallidos >= maxIntentos) {
            await registrarEventoSeguridad({
                evento: 'login_bloqueado',
                req,
                detalle: { username: usernameNormalizado, intentosFallidos }
            });

            return res.status(429).json({
                error: true,
                mensaje: 'Too many attempts. Wait a few minutes and try again.'
            });
        }

        // Find user
        const usuario = await obtenerUsuarioConDepartamento(
            'u.username = ? AND u.activo = TRUE',
            [usernameNormalizado]
        );

        if (!usuario) {
            await registrarIntentoLogin({
                username: usernameNormalizado,
                req,
                exitoso: false,
                detalle: 'user_not_found'
            });

            return res.status(401).json({
                error: true,
                mensaje: 'Invalid username or password'
            });
        }

        if (
            usuario.rol !== 'superadmin' &&
            usuario.departamento_id &&
            usuario.departamento_activo === 0
        ) {
            await registrarEventoSeguridad({
                usuarioId: usuario.id,
                departamentoId: usuario.departamento_id,
                evento: 'login_departamento_inactivo',
                req
            });

            return res.status(403).json({
                error: true,
                mensaje: 'Your department is inactive. Contact your administrator.'
            });
        }

        const passwordValido = await bcrypt.compare(
            password,
            usuario.password
        );

        if (!passwordValido) {
            await registrarIntentoLogin({
                username: usernameNormalizado,
                req,
                exitoso: false,
                detalle: 'incorrect_password'
            });

            return res.status(401).json({
                error: true,
                mensaje: 'Invalid username or password'
            });
        }

        if (usuario.mfa_enabled && usuario.mfa_secret_encrypted) {
            const mfaToken = jwt.sign(
                {
                    id: usuario.id,
                    username: usuario.username,
                    purpose: 'mfa-login',
                    mantenerSesion: Boolean(mantenerSesion)
                },
                process.env.JWT_SECRET,
                { expiresIn: '5m' }
            );

            await registrarEventoSeguridad({
                usuarioId: usuario.id,
                departamentoId: usuario.departamento_id || null,
                evento: 'login_mfa_required',
                req
            });

            return res.json({
                error: false,
                mfa_required: true,
                mensaje: 'Authenticator code required',
                mfaToken,
                usuario: {
                    id: usuario.id,
                    username: usuario.username,
                    nombre: usuario.nombre_completo,
                    email: usuario.email
                }
            });
        }

        return finalizarLogin({
            req,
            res,
            usuario,
            detalle: 'login_success',
            mantenerSesion: Boolean(mantenerSesion)
        });

    } catch (error) {
        console.error('ERROR LOGIN:', error);

        res.status(500).json({
            error: true,
            mensaje: 'Sign-in failed',
            code: error.code
        });
    }
});

router.post('/mfa/login', async (req, res) => {
    try {
        const { mfaToken, code } = req.body;

        if (!mfaToken || !code) {
            return res.status(400).json({
                error: true,
                mensaje: 'Authenticator code is required'
            });
        }

        const decoded = jwt.verify(mfaToken, process.env.JWT_SECRET);

        if (decoded.purpose !== 'mfa-login') {
            return res.status(401).json({
                error: true,
                mensaje: 'The authenticator session is invalid'
            });
        }

        const usuario = await obtenerUsuarioConDepartamento(
            'u.id = ? AND u.activo = TRUE',
            [decoded.id]
        );

        if (!usuario || !usuario.mfa_enabled || !usuario.mfa_secret_encrypted) {
            return res.status(401).json({
                error: true,
                mensaje: 'Authenticator verification is not available'
            });
        }

        const secret = descifrarSecreto(usuario.mfa_secret_encrypted);
        const codeValido = verificarCodigoTotp(secret, code);

        if (!codeValido) {
            await registrarIntentoLogin({
                username: usuario.username,
                req,
                exitoso: false,
                detalle: 'mfa_invalid_code'
            });
            await registrarEventoSeguridad({
                usuarioId: usuario.id,
                departamentoId: usuario.departamento_id || null,
                evento: 'mfa_invalid_code',
                req
            });

            return res.status(401).json({
                error: true,
                mensaje: 'The authenticator code is not valid'
            });
        }

        return finalizarLogin({
            req,
            res,
            usuario,
            detalle: 'login_success_mfa',
            mantenerSesion: Boolean(decoded.mantenerSesion)
        });
    } catch (error) {
        console.error('MFA login error:', error);

        res.status(401).json({
            error: true,
            mensaje: 'Authenticator verification failed'
        });
    }
});

router.post('/mfa/setup', verificarToken, async (req, res) => {
    try {
        const usuario = await obtenerUsuarioConDepartamento(
            'u.id = ? AND u.activo = TRUE',
            [req.usuario.id]
        );

        if (!usuario) {
            return res.status(404).json({
                error: true,
                mensaje: 'User not found'
            });
        }

        const secret = generarSecretoAuthenticator();
        const encryptedSecret = cifrarSecreto(secret);
        const accountName = usuario.email || usuario.username;
        const otpauthUrl = crearOtpauthUrl({ secret, accountName });
        const qrDataUrl = await crearQrDataUrl(otpauthUrl);

        await pool.query(
            `UPDATE usuarios
             SET mfa_pending_secret_encrypted = ?
             WHERE id = ?`,
            [encryptedSecret, usuario.id]
        );

        await registrarEventoSeguridad({
            usuarioId: usuario.id,
            departamentoId: usuario.departamento_id || null,
            evento: 'mfa_setup_started',
            req
        });

        res.json({
            error: false,
            mensaje: 'Authenticator setup started',
            secret,
            otpauthUrl,
            qrDataUrl,
            alreadyEnabled: Boolean(usuario.mfa_enabled)
        });
    } catch (error) {
        console.error('MFA setup error:', error);

        res.status(500).json({
            error: true,
            mensaje: esErrorColumnasMfa(error)
                ? 'Run the Microsoft Authenticator MFA migration first.'
                : 'Authenticator setup could not be started'
        });
    }
});

router.post('/mfa/confirm', verificarToken, async (req, res) => {
    try {
        const { code } = req.body;
        const usuario = await obtenerUsuarioConDepartamento(
            'u.id = ? AND u.activo = TRUE',
            [req.usuario.id]
        );

        if (!usuario) {
            return res.status(404).json({
                error: true,
                mensaje: 'User not found'
            });
        }

        if (!usuario.mfa_pending_secret_encrypted) {
            return res.status(400).json({
                error: true,
                mensaje: 'Start authenticator setup before confirming it'
            });
        }

        const secret = descifrarSecreto(usuario.mfa_pending_secret_encrypted);

        if (!verificarCodigoTotp(secret, code)) {
            return res.status(400).json({
                error: true,
                mensaje: 'The authenticator code is not valid'
            });
        }

        await pool.query(
            `UPDATE usuarios
             SET mfa_enabled = TRUE,
                 mfa_secret_encrypted = mfa_pending_secret_encrypted,
                 mfa_pending_secret_encrypted = NULL,
                 mfa_enabled_at = NOW()
             WHERE id = ?`,
            [usuario.id]
        );

        await registrarEventoSeguridad({
            usuarioId: usuario.id,
            departamentoId: usuario.departamento_id || null,
            evento: 'mfa_enabled',
            req
        });

        const usuarioActualizado = await obtenerUsuarioConDepartamento(
            'u.id = ? AND u.activo = TRUE',
            [req.usuario.id]
        );

        res.json({
            error: false,
            mensaje: 'Microsoft Authenticator is now enabled',
            usuario: construirContextoUsuario(usuarioActualizado)
        });
    } catch (error) {
        console.error('MFA confirm error:', error);

        res.status(500).json({
            error: true,
            mensaje: esErrorColumnasMfa(error)
                ? 'Run the Microsoft Authenticator MFA migration first.'
                : 'Authenticator could not be enabled'
        });
    }
});

router.post('/mfa/disable', verificarToken, async (req, res) => {
    try {
        const { password, code } = req.body;
        const usuario = await obtenerUsuarioConDepartamento(
            'u.id = ? AND u.activo = TRUE',
            [req.usuario.id]
        );

        if (!usuario) {
            return res.status(404).json({
                error: true,
                mensaje: 'User not found'
            });
        }

        if (!usuario.mfa_enabled || !usuario.mfa_secret_encrypted) {
            return res.status(400).json({
                error: true,
                mensaje: 'Microsoft Authenticator is not enabled'
            });
        }

        const passwordValido = await bcrypt.compare(String(password || ''), usuario.password);

        if (!passwordValido) {
            return res.status(400).json({
                error: true,
                mensaje: 'The current password is not correct'
            });
        }

        const secret = descifrarSecreto(usuario.mfa_secret_encrypted);

        if (!verificarCodigoTotp(secret, code)) {
            return res.status(400).json({
                error: true,
                mensaje: 'The authenticator code is not valid'
            });
        }

        await pool.query(
            `UPDATE usuarios
             SET mfa_enabled = FALSE,
                 mfa_secret_encrypted = NULL,
                 mfa_pending_secret_encrypted = NULL,
                 mfa_enabled_at = NULL
             WHERE id = ?`,
            [usuario.id]
        );

        await registrarEventoSeguridad({
            usuarioId: usuario.id,
            departamentoId: usuario.departamento_id || null,
            evento: 'mfa_disabled',
            req
        });

        const usuarioActualizado = await obtenerUsuarioConDepartamento(
            'u.id = ? AND u.activo = TRUE',
            [req.usuario.id]
        );

        res.json({
            error: false,
            mensaje: 'Microsoft Authenticator was disabled',
            usuario: construirContextoUsuario(usuarioActualizado)
        });
    } catch (error) {
        console.error('MFA disable error:', error);

        res.status(500).json({
            error: true,
            mensaje: esErrorColumnasMfa(error)
                ? 'Run the Microsoft Authenticator MFA migration first.'
                : 'Authenticator could not be disabled'
        });
    }
});

router.post(
    '/register',
    verificarToken,
    esAdmin,
    checkPermission('create_users'),
    async (req, res) => {
    try {
        const { username, password, nombre_completo, email, rol } = req.body;
        const requestedRole = rol || 'usuario';

        // Validate required fields
        if (!username || !password || !nombre_completo || !email) {
            return res.status(400).json({
                error: true,
                mensaje: 'All fields are required'
            });
        }

        if (
            !['superadmin', 'admin', 'supervisor', 'usuario'].includes(requestedRole) ||
            (!isSuperAdmin(req.usuario) && ['superadmin', 'admin'].includes(requestedRole))
        ) {
            return res.status(403).json({
                error: true,
                mensaje: 'You cannot create a user with this role'
            });
        }

        // Check whether the user already exists
        const [existente] = await pool.query(
            'SELECT id FROM usuarios WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existente.length > 0) {
            return res.status(400).json({
                error: true,
                mensaje: 'The username or email already exists'
            });
        }

        // Encrypt password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insert user
        const [resultado] = await pool.query(
            `INSERT INTO usuarios (username, password, nombre_completo, email, rol)
             VALUES (?, ?, ?, ?, ?)`,
            [username, passwordHash, nombre_completo, email, requestedRole]
        );

        res.status(201).json({
            error: false,
            mensaje: 'User registered successfully',
            usuarioId: resultado.insertId
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            error: true,
            mensaje: 'User registration failed'
        });
    }
});

router.get('/verify', verificarToken, async (req, res) => {
    try {
        const usuario = await obtenerUsuarioConDepartamento(
            'u.id = ? AND u.activo = TRUE',
            [req.usuario.id]
        );

        if (!usuario) {
            return res.status(404).json({
                error: true,
                mensaje: 'User not found or inactive'
            });
        }

        res.json({
            error: false,
            mensaje: 'Token is valid',
            usuario: construirContextoUsuario(usuario)
        });
    } catch (error) {
        res.status(500).json({
            error: true,
            mensaje: 'Token verification failed'
        });
    }
});

router.get('/profile', verificarToken, async (req, res) => {
    try {
        const usuario = await obtenerUsuarioConDepartamento(
            'u.id = ? AND u.activo = TRUE',
            [req.usuario.id]
        );

        if (!usuario) {
            return res.status(404).json({
                error: true,
                mensaje: 'User not found'
            });
        }

        res.json({
            error: false,
            usuario: construirContextoUsuario(usuario)
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Profile data could not be loaded'
        });
    }
});

async function actualizarPerfil(req, res) {
    const fotoSubida = obtenerFotoPerfilSubida(req);
    const nuevaFotoUrl = construirUrlFotoPerfil(fotoSubida);

    try {
        const nombre = String(req.body.nombre || req.body.nombre_completo || '').trim();
        const passwordActual = String(req.body.password_actual || '');
        const passwordNueva = String(req.body.password_nueva || '');
        const passwordConfirmacion = String(req.body.password_confirmacion || '');
        const cambiaPassword = Boolean(passwordActual || passwordNueva || passwordConfirmacion);

        if (!nombre || nombre.length < 2 || nombre.length > 100) {
            eliminarFotoPerfil(nuevaFotoUrl);
            return res.status(400).json({
                error: true,
                mensaje: 'Enter a valid name between 2 and 100 characters.'
            });
        }

        if (cambiaPassword) {
            if (!passwordActual || !passwordNueva || !passwordConfirmacion) {
                eliminarFotoPerfil(nuevaFotoUrl);
                return res.status(400).json({
                    error: true,
                    mensaje: 'To change your password, complete all three password fields.'
                });
            }

            if (passwordNueva.length < 6) {
                eliminarFotoPerfil(nuevaFotoUrl);
                return res.status(400).json({
                    error: true,
                    mensaje: 'The new password must be at least 6 characters.'
                });
            }

            if (passwordNueva !== passwordConfirmacion) {
                eliminarFotoPerfil(nuevaFotoUrl);
                return res.status(400).json({
                    error: true,
                    mensaje: 'The confirmation does not match the new password.'
                });
            }
        }

        const usuarioActual = await obtenerUsuarioConDepartamento(
            'u.id = ? AND u.activo = TRUE',
            [req.usuario.id]
        );

        if (!usuarioActual) {
            eliminarFotoPerfil(nuevaFotoUrl);
            return res.status(404).json({
                error: true,
                mensaje: 'User not found'
            });
        }

        const cambios = [];
        const params = [];
        const detalleAuditoria = {};

        if (nombre !== usuarioActual.nombre_completo) {
            cambios.push('nombre_completo = ?');
            params.push(nombre);
            detalleAuditoria.nombre_actualizado = true;
        }

        if (cambiaPassword) {
            const passwordValido = await bcrypt.compare(passwordActual, usuarioActual.password);

            if (!passwordValido) {
                eliminarFotoPerfil(nuevaFotoUrl);
                return res.status(400).json({
                    error: true,
                    mensaje: 'The current password is not correct.'
                });
            }

            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(passwordNueva, salt);

            cambios.push('password = ?');
            params.push(passwordHash);
            detalleAuditoria.password_actualizado = true;
        }

        if (nuevaFotoUrl) {
            cambios.push('foto_perfil_url = ?');
            params.push(nuevaFotoUrl);
            detalleAuditoria.foto_actualizada = true;
        }

        if (cambios.length > 0) {
            params.push(req.usuario.id);
            await pool.query(
                `UPDATE usuarios
                 SET ${cambios.join(', ')}
                 WHERE id = ?`,
                params
            );

            if (
                nuevaFotoUrl &&
                usuarioActual.foto_perfil_url &&
                usuarioActual.foto_perfil_url !== nuevaFotoUrl
            ) {
                eliminarFotoPerfil(usuarioActual.foto_perfil_url);
            }

            await registrarEventoSeguridad({
                usuarioId: req.usuario.id,
                departamentoId: req.departamento?.id || usuarioActual.departamento_id || null,
                evento: 'profile_updated',
                req,
                detalle: detalleAuditoria
            });
        }

        const usuarioActualizado = await obtenerUsuarioConDepartamento(
            'u.id = ? AND u.activo = TRUE',
            [req.usuario.id]
        );

        res.json({
            error: false,
            mensaje: cambios.length > 0
                ? 'Profile updated successfully'
                : 'There were no changes to save',
            usuario: construirContextoUsuario(usuarioActualizado)
        });
    } catch (error) {
        eliminarFotoPerfil(nuevaFotoUrl);

        if (esErrorColumnaFoto(error)) {
            return res.status(500).json({
                error: true,
                mensaje: 'Run the profile migration before saving photos.'
            });
        }

        console.error('Error updating profile:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Profile could not be updated'
        });
    }
}

router.put('/profile', verificarToken, cargarFotoPerfil, actualizarPerfil);
router.patch('/profile', verificarToken, cargarFotoPerfil, actualizarPerfil);


router.post('/sessions/revoke-all', verificarToken, async (req, res) => {
    try {
        let affectedRows = 0;

        try {
            const [result] = await pool.query(
                `UPDATE sesiones
                 SET activa = FALSE,
                     fecha_expiracion = NOW(),
                     fecha_revocacion = NOW(),
                     revocada_por = ?,
                     motivo_revocacion = 'user_revoke_all'
                 WHERE usuario_id = ?
                   AND activa = TRUE`,
                [req.usuario.id, req.usuario.id]
            );
            affectedRows = result.affectedRows || 0;
        } catch (error) {
            if (error.code === 'ER_BAD_FIELD_ERROR') {
                const [result] = await pool.query(
                    `UPDATE sesiones
                     SET activa = FALSE,
                         fecha_expiracion = NOW()
                     WHERE usuario_id = ?
                       AND activa = TRUE`,
                    [req.usuario.id]
                );
                affectedRows = result.affectedRows || 0;
            } else if (!esErrorEsquemaSesiones(error)) {
                throw error;
            }
        }

        await registrarEventoSeguridad({
            usuarioId: req.usuario.id,
            departamentoId: req.departamento?.id || null,
            evento: 'all_sessions_revoked',
            req,
            detalle: { affectedRows }
        });

        res.clearCookie('auth_token', opcionesCookieAuth(req));
        res.json({
            error: false,
            mensaje: 'All active sessions were revoked',
            affectedSessions: affectedRows
        });
    } catch (error) {
        console.error('Revoke all sessions error:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Sessions could not be revoked'
        });
    }
});

router.post('/logout', verificarToken, async (req, res) => {
    try {
        const token = req.authToken;
        const hash = tokenHash(token);

        // Mark the session as inactive
        try {
            await pool.query(
                `UPDATE sesiones
                 SET activa = FALSE,
                     fecha_expiracion = NOW(),
                     fecha_revocacion = NOW(),
                     revocada_por = ?,
                     motivo_revocacion = 'logout_usuario'
                 WHERE token_hash = ? OR token = ?`,
                [req.usuario.id, hash, token]
            );
        } catch (error) {
            if (error.code === 'ER_BAD_FIELD_ERROR') {
                await pool.query(
                    'UPDATE sesiones SET activa = FALSE WHERE token = ?',
                    [token]
                );
            } else if (!esErrorEsquemaSesiones(error)) {
                throw error;
            }
        }

        await registrarEventoSeguridad({
            usuarioId: req.usuario.id,
            departamentoId: req.departamento?.id || null,
            evento: 'user_logout',
            req
        });

        res.clearCookie('auth_token', opcionesCookieAuth(req));

        res.json({
            error: false,
            mensaje: 'Session closed successfully'
        });
    } catch (error) {
        res.status(500).json({
            error: true,
            mensaje: 'Session could not be closed'
        });
    }
});

module.exports = router;
