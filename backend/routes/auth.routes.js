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

const PROFILE_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'perfiles');
const PROFILE_PHOTO_EXTENSIONS = {
    'image/jpeg': '.jpg', 
    'image/png': '.png',
    'image/webp': '.webp'
};

fs.mkdirSync(PROFILE_UPLOAD_DIR, { recursive: true });

const profilePhotoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, PROFILE_UPLOAD_DIR),
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
    limits: { fileSize: 3 * 1024 * 1024 },
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

async function registrarSesion(usuarioId, token, req) {
    const hash = tokenHash(token);

    try {
        await pool.query(
            `INSERT INTO sesiones
            (usuario_id, token, token_hash, ip_address, user_agent, fecha_expiracion, ultimo_uso)
            VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), NOW())`,
            [usuarioId, token, hash, req.ip, req.headers['user-agent']]
        );

        return true;
    } catch (error) {
        if (error.code === 'ER_BAD_FIELD_ERROR') {
            try {
                await pool.query(
                    `INSERT INTO sesiones
                    (usuario_id, token, ip_address, user_agent, fecha_expiracion)
                    VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
                    [usuarioId, token, req.ip, req.headers['user-agent']]
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

function opcionesCookieAuth(req) {
    const esProduccion = process.env.NODE_ENV === 'production';
    const origen = String(req.headers.origin || '');
    const esLocal = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origen);

    return {
        httpOnly: true,
        secure: esProduccion && !esLocal,
        sameSite: esProduccion && !esLocal ? 'none' : 'lax',
        maxAge: Number(process.env.JWT_COOKIE_MAX_AGE_MS || 24 * 60 * 60 * 1000),
        path: '/'
    };
}

function crearTokenSesion(usuario, contextoUsuario) {
    return jwt.sign(
        {
            id: usuario.id,
            username: usuario.username,
            rol: usuario.rol,
            departamento: contextoUsuario.departamento.codigo
        },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRES_IN || '24h'
        }
    );
}

async function finalizarLogin({ req, res, usuario, detalle = 'login_success' }) {
    const contextoUsuario = construirContextoUsuario(usuario);
    const token = crearTokenSesion(usuario, contextoUsuario);

    await registrarSesion(usuario.id, token, req);
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
        detalle: { departamento: contextoUsuario.departamento.codigo }
    });

    res.cookie('auth_token', token, opcionesCookieAuth(req));

    return res.json({
        error: false,
        mensaje: 'Login successful',
        token,
        usuario: contextoUsuario
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

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
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
                    purpose: 'mfa-login'
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
            detalle: 'login_success'
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
            detalle: 'login_success_mfa'
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
