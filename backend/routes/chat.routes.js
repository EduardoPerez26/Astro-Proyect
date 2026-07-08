const express = require('express');
const router = express.Router();

const { pool } = require('../config/database');
const { verificarToken, checkPermission } = require('../middleware/auth.middleware');

router.use(verificarToken, checkPermission('chat'));

function getUsuarioId(req) {
    return req.usuario?.id || req.user?.id || req.usuario?.userId || null;
}

function parseJson(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;

    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}

function tienePermisoChat(usuario = {}) {
    if (usuario.rol === 'admin') return true;
    return parseJson(usuario.permisos).chat === true;
}

// Obtener conversaciones del usuario
// Obtener conversaciones del usuario
router.get('/conversaciones', async (req, res) => {
    try {
        const usuarioId = req.usuario?.id || req.user?.id;

        if (!usuarioId) {
            return res.status(401).json({
                success: false,
                message: 'Usuario no autenticado'
            });
        }

        const [rows] = await pool.query(`
    SELECT 
        c.id,
        c.tipo,
        c.titulo,
        c.created_at,

        (
            SELECT COALESCE(u.nombre_completo, u.username, u.email, 'User')
            FROM chat_conversaciones_usuarios cu2
            INNER JOIN usuarios u ON u.id = cu2.usuario_id
            WHERE cu2.conversacion_id = c.id
              AND cu2.usuario_id <> ?
            LIMIT 1
        ) AS otro_usuario_nombre,

        (
            SELECT u.foto_perfil_url
            FROM chat_conversaciones_usuarios cu2
            INNER JOIN usuarios u ON u.id = cu2.usuario_id
            WHERE cu2.conversacion_id = c.id
              AND cu2.usuario_id <> ?
            LIMIT 1
        ) AS otro_usuario_foto,

        (
            SELECT m.mensaje
            FROM chat_mensajes m
            WHERE m.conversacion_id = c.id
            ORDER BY m.id DESC
            LIMIT 1
        ) AS ultimo_mensaje,

        (
            SELECT m.created_at
            FROM chat_mensajes m
            WHERE m.conversacion_id = c.id
            ORDER BY m.id DESC
            LIMIT 1
        ) AS ultimo_mensaje_fecha,

        (
            SELECT COUNT(m.id)
            FROM chat_mensajes m
            WHERE m.conversacion_id = c.id
              AND m.usuario_id <> ?
              AND m.id > COALESCE(cu.ultimo_mensaje_leido_id, 0)
        ) AS mensajes_no_leidos

    FROM chat_conversaciones c
    INNER JOIN chat_conversaciones_usuarios cu
        ON cu.conversacion_id = c.id
    WHERE cu.usuario_id = ?
    ORDER BY COALESCE(ultimo_mensaje_fecha, c.created_at) DESC
`, [usuarioId, usuarioId, usuarioId, usuarioId]);

        const conversaciones = rows.map(row => ({
            ...row,
            titulo: row.tipo === 'directa'
                ? row.otro_usuario_nombre || `Conversation #${row.id}`
                : row.titulo || `Conversation #${row.id}`
        }));

        res.json({
            success: true,
            conversaciones
        });
    } catch (error) {
        console.error('Error cargando conversaciones:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'No se pudieron cargar las conversaciones'
        });
    }
});

// Crear o abrir conversación directa con otro usuario
router.post('/directa', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const usuarioActualId = getUsuarioId(req);
        const usuarioDestinoId = Number(req.body.usuario_id);

        if (!usuarioActualId) {
            return res.status(401).json({
                success: false,
                message: 'Usuario no autenticado'
            });
        }

        if (!usuarioDestinoId) {
            return res.status(400).json({
                success: false,
                message: 'Usuario destino requerido'
            });
        }

        if (Number(usuarioDestinoId) === Number(usuarioActualId)) {
            return res.status(400).json({
                success: false,
                message: 'No puedes crear un chat contigo mismo'
            });
        }

        await connection.beginTransaction();

        const [[usuarioDestino]] = await connection.query(`
            SELECT id, rol, permisos
            FROM usuarios
            WHERE id = ? AND activo = TRUE
            LIMIT 1
        `, [usuarioDestinoId]);

        if (!usuarioDestino) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Usuario destino no encontrado'
            });
        }

        if (!tienePermisoChat(usuarioDestino)) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: 'El usuario destino no tiene permiso para usar el chat'
            });
        }

        const [existente] = await connection.query(`
            SELECT c.id
            FROM chat_conversaciones c
            INNER JOIN chat_conversaciones_usuarios cu1
                ON cu1.conversacion_id = c.id AND cu1.usuario_id = ?
            INNER JOIN chat_conversaciones_usuarios cu2
                ON cu2.conversacion_id = c.id AND cu2.usuario_id = ?
            WHERE c.tipo = 'directa'
            LIMIT 1
        `, [usuarioActualId, usuarioDestinoId]);

        if (existente.length) {
            await connection.commit();

            return res.json({
                success: true,
                conversacion_id: existente[0].id
            });
        }

        const [result] = await connection.query(`
            INSERT INTO chat_conversaciones (tipo, titulo)
            VALUES ('directa', NULL)
        `);

        const conversacionId = result.insertId;

        await connection.query(`
            INSERT INTO chat_conversaciones_usuarios (conversacion_id, usuario_id)
            VALUES (?, ?), (?, ?)
        `, [
            conversacionId,
            usuarioActualId,
            conversacionId,
            usuarioDestinoId
        ]);

        await connection.commit();

        res.json({
            success: true,
            conversacion_id: conversacionId
        });
    } catch (error) {
        await connection.rollback();

        console.error('Error creando conversación:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'No se pudo crear la conversación'
        });
    } finally {
        connection.release();
    }
});

// Obtener mensajes de una conversación
router.get('/conversaciones/:id/mensajes', async (req, res) => {
    try {
        const usuarioId = getUsuarioId(req);
        const conversacionId = Number(req.params.id);
        const afterId = Number(req.query.after_id || 0);

        if (!usuarioId) {
            return res.status(401).json({
                success: false,
                message: 'Usuario no autenticado'
            });
        }

        const [[access]] = await pool.query(`
            SELECT id
            FROM chat_conversaciones_usuarios
            WHERE conversacion_id = ? AND usuario_id = ?
            LIMIT 1
        `, [conversacionId, usuarioId]);

        if (!access) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a esta conversación'
            });
        }

        const receiptsOnly = req.query.receipts_only === '1';
        const selectColumns = receiptsOnly
            ? `
                m.id,
                m.conversacion_id,
                m.usuario_id,
                m.created_at
            `
            : `
                m.id,
                m.conversacion_id,
                m.usuario_id,
                m.mensaje,
                m.created_at,
                COALESCE(u.nombre_completo, u.username, u.email, 'User') AS usuario_nombre,
                u.foto_perfil_url AS usuario_foto
            `;

        const ownMessageFilter = receiptsOnly ? 'AND m.usuario_id = ?' : '';
        const queryParams = receiptsOnly
            ? [conversacionId, afterId, usuarioId]
            : [conversacionId, afterId];

        const [rows] = await pool.query(`
            SELECT
                ${selectColumns},
                COUNT(DISTINCT reader.usuario_id) AS read_by_count,
                (
                    SELECT COUNT(*)
                    FROM chat_conversaciones_usuarios recipient
                    WHERE recipient.conversacion_id = m.conversacion_id
                      AND recipient.usuario_id <> m.usuario_id
                ) AS recipient_count,
                MAX(reader.ultimo_mensaje_leido_at) AS read_at
            FROM chat_mensajes m
            ${receiptsOnly ? '' : 'INNER JOIN usuarios u ON u.id = m.usuario_id'}
            LEFT JOIN chat_conversaciones_usuarios reader
                ON reader.conversacion_id = m.conversacion_id
               AND reader.usuario_id <> m.usuario_id
               AND reader.ultimo_mensaje_leido_id >= m.id
            WHERE m.conversacion_id = ?
              AND m.id > ?
              ${ownMessageFilter}
            GROUP BY
                ${receiptsOnly
                    ? 'm.id, m.conversacion_id, m.usuario_id, m.created_at'
                    : 'm.id, m.conversacion_id, m.usuario_id, m.mensaje, m.created_at, usuario_nombre, usuario_foto'}
            ORDER BY m.id ASC
            LIMIT 100
        `, queryParams);

        const mensajes = rows.map(row => {
            const readByCount = Number(row.read_by_count || 0);
            const recipientCount = Number(row.recipient_count || 0);

            return {
                ...row,
                read_by_count: readByCount,
                recipient_count: recipientCount,
                read_by_others: recipientCount > 0 && readByCount >= recipientCount
            };
        });

        res.json({
            success: true,
            mensajes
        });
    } catch (error) {
        console.error('Error cargando mensajes:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'No se pudieron cargar los mensajes'
        });
    }
});

// Enviar mensaje
router.post('/conversaciones/:id/mensajes', async (req, res) => {
    try {
        const usuarioId = getUsuarioId(req);
        const conversacionId = Number(req.params.id);
        const mensaje = String(req.body.mensaje || '').trim();

        if (!usuarioId) {
            return res.status(401).json({
                success: false,
                message: 'Usuario no autenticado'
            });
        }

        if (!mensaje) {
            return res.status(400).json({
                success: false,
                message: 'El mensaje no puede estar vacío'
            });
        }

        const [[access]] = await pool.query(`
            SELECT id
            FROM chat_conversaciones_usuarios
            WHERE conversacion_id = ? AND usuario_id = ?
            LIMIT 1
        `, [conversacionId, usuarioId]);

        if (!access) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a esta conversación'
            });
        }

        const [result] = await pool.query(`
            INSERT INTO chat_mensajes (conversacion_id, usuario_id, mensaje)
            VALUES (?, ?, ?)
        `, [conversacionId, usuarioId, mensaje]);

        res.json({
            success: true,
            mensaje_id: result.insertId
        });
    } catch (error) {
        console.error('Error enviando mensaje:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'No se pudo enviar el mensaje'
        });
    }
});

// Usuarios disponibles para iniciar chat
router.get('/usuarios', async (req, res) => {
    try {
        const usuarioId = getUsuarioId(req);

        if (!usuarioId) {
            return res.status(401).json({
                success: false,
                message: 'Usuario no autenticado'
            });
        }

        const [rows] = await pool.query(`
            SELECT 
                id,
                nombre_completo AS nombre,
                email,
                username,
                rol,
                permisos,
                foto_perfil_url
            FROM usuarios
            WHERE id <> ?
              AND activo = TRUE
            ORDER BY nombre_completo ASC
        `, [usuarioId]);

        res.json({
            success: true,
            usuarios: rows
                .filter(tienePermisoChat)
                .map(({ permisos, ...usuario }) => usuario)
        });
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'No se pudieron cargar los usuarios'
        });
    }
});

// Contador total de mensajes no leídos
router.get('/no-leidos', async (req, res) => {
    try {
        const usuarioId = req.usuario.id;

        const [[row]] = await pool.query(`
            SELECT COUNT(m.id) AS total
            FROM chat_conversaciones_usuarios cu
            INNER JOIN chat_mensajes m
                ON m.conversacion_id = cu.conversacion_id
            WHERE cu.usuario_id = ?
              AND m.usuario_id <> ?
              AND m.id > COALESCE(cu.ultimo_mensaje_leido_id, 0)
        `, [usuarioId, usuarioId]);

        res.json({
            success: true,
            total: row.total || 0
        });
    } catch (error) {
        console.error('Error contando mensajes no leídos:', error);
        res.status(500).json({
            success: false,
            message: 'No se pudieron contar los mensajes no leídos'
        });
    }
});

// Marcar conversación como leída
router.put('/conversaciones/:id/leida', async (req, res) => {
    try {
        const usuarioId = req.usuario.id;
        const conversacionId = Number(req.params.id);

        const [[access]] = await pool.query(`
            SELECT id
            FROM chat_conversaciones_usuarios
            WHERE conversacion_id = ? AND usuario_id = ?
            LIMIT 1
        `, [conversacionId, usuarioId]);

        if (!access) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a esta conversación'
            });
        }

        const [[lastMessage]] = await pool.query(`
            SELECT COALESCE(MAX(id), 0) AS ultimo_id
            FROM chat_mensajes
            WHERE conversacion_id = ?
        `, [conversacionId]);

        await pool.query(`
            UPDATE chat_conversaciones_usuarios
            SET ultimo_mensaje_leido_id = ?,
                ultimo_mensaje_leido_at = NOW()
            WHERE conversacion_id = ? AND usuario_id = ?
        `, [lastMessage.ultimo_id || 0, conversacionId, usuarioId]);

        res.json({
            success: true,
            ultimo_mensaje_leido_id: lastMessage.ultimo_id || 0
        });
    } catch (error) {
        console.error('Error marcando conversación como leída:', error);
        res.status(500).json({
            success: false,
            message: 'No se pudo marcar como leída'
        });
    }
});

// Actualizar estado "escribiendo"
router.put('/conversaciones/:id/typing', async (req, res) => {
    try {
        const usuarioId = req.usuario?.id || req.user?.id;
        const conversacionId = Number(req.params.id);
        const isTyping = req.body.typing === true ? 1 : 0;

        if (!usuarioId) {
            return res.status(401).json({
                success: false,
                message: 'Usuario no autenticado'
            });
        }

        const [[access]] = await pool.query(`
            SELECT id
            FROM chat_conversaciones_usuarios
            WHERE conversacion_id = ? AND usuario_id = ?
            LIMIT 1
        `, [conversacionId, usuarioId]);

        if (!access) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a esta conversación'
            });
        }

        await pool.query(`
            INSERT INTO chat_typing_status (
                conversacion_id,
                usuario_id,
                is_typing,
                updated_at
            )
            VALUES (?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                is_typing = VALUES(is_typing),
                updated_at = NOW()
        `, [conversacionId, usuarioId, isTyping]);

        res.json({
            success: true
        });
    } catch (error) {
        console.error('Error actualizando typing:', error);
        res.status(500).json({
            success: false,
            message: 'No se pudo actualizar el estado de escritura'
        });
    }
});

// Consultar quién está escribiendo
router.get('/conversaciones/:id/typing', async (req, res) => {
    try {
        const usuarioId = req.usuario?.id || req.user?.id;
        const conversacionId = Number(req.params.id);

        if (!usuarioId) {
            return res.status(401).json({
                success: false,
                message: 'Usuario no autenticado'
            });
        }

        const [[access]] = await pool.query(`
            SELECT id
            FROM chat_conversaciones_usuarios
            WHERE conversacion_id = ? AND usuario_id = ?
            LIMIT 1
        `, [conversacionId, usuarioId]);

        if (!access) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a esta conversación'
            });
        }

        const [rows] = await pool.query(`
            SELECT 
                u.id,
                COALESCE(u.nombre_completo, u.username, u.email, 'User') AS nombre
            FROM chat_typing_status t
            INNER JOIN usuarios u ON u.id = t.usuario_id
            WHERE t.conversacion_id = ?
              AND t.usuario_id <> ?
              AND t.is_typing = 1
              AND t.updated_at >= DATE_SUB(NOW(), INTERVAL 5 SECOND)
            ORDER BY t.updated_at DESC
        `, [conversacionId, usuarioId]);

        res.json({
            success: true,
            typing: rows.length > 0,
            usuarios: rows
        });
    } catch (error) {
        console.error('Error consultando typing:', error);
        res.status(500).json({
            success: false,
            message: 'No se pudo consultar el estado de escritura'
        });
    }
});

module.exports = router;
