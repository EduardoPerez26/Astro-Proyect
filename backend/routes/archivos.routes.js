// rutas/archivos.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const { verificarToken, checkPermission } = require('../middleware/auth.middleware');

// Configuración de multer para subir archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// ============================================
// RUTAS DE ARCHIVOS
// ============================================

// GET /api/archivos - listar archivos
router.get(
    '/',
    verificarToken,
    checkPermission('view_archivos'), // mapea al JSON: documentos
    async (req, res) => {
        try {
            const [rows] = await pool.query(`
    SELECT
        a.*,
        r.nombre AS restaurante_nombre,
        u.username,
        u.nombre_completo AS usuario_nombre
    FROM archivos_excel a
    LEFT JOIN restaurantes r
        ON r.id = a.restaurante_id
    LEFT JOIN usuarios u
        ON u.id = a.usuario_id
    ORDER BY a.id DESC
`);
            res.json(rows);
        } catch (error) {
            console.error('Error al obtener archivos:', error);
            res.status(500).json({ error: true, message: 'Error al obtener archivos' });
        }
    }
);

// POST /api/archivos/subir - subir archivo
router.post(
    '/subir',
    verificarToken,
    checkPermission('upload_files'),
    upload.single('archivo'),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    error: true,
                    message: 'No se recibió ningún archivo'
                });
            }

            console.log('================================');
            console.log('SUBIR ARCHIVO');
            console.log('BODY:', req.body);
            console.log('FILE:', req.file.originalname);
            console.log('================================');

            const restauranteCodigo = req.body.restaurante_id;

            if (!restauranteCodigo) {
                return res.status(400).json({
                    error: true,
                    message: 'Restaurante no especificado'
                });
            }

            // Buscar el ID real del restaurante usando el código
            const [restaurantes] = await pool.query(
                'SELECT id, codigo, nombre FROM restaurantes WHERE codigo = ? LIMIT 1',
                [restauranteCodigo]
            );

            if (restaurantes.length === 0) {
                return res.status(400).json({
                    error: true,
                    message: `No existe un restaurante con código: ${restauranteCodigo}`
                });
            }

            const restauranteId = restaurantes[0].id;

            const { originalname, filename, size, mimetype } = req.file;

            const [result] = await pool.query(
                `INSERT INTO archivos_excel
    (
        usuario_id,
        restaurante_id,
        nombre_original,
        nombre_servidor,
        tamano_bytes,
        tipo_mime,
        ruta_archivo,
        estado
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    req.usuario.id,
                    restauranteId,
                    originalname,
                    filename,
                    size,
                    mimetype,
                    `/uploads/${filename}`,
                    'pendiente'
                ]
            );

            console.log('Archivo guardado. ID:', result.insertId);

            res.json({
                success: true,
                message: 'Archivo guardado correctamente',
                archivo: {
                    id: result.insertId,
                    nombre_original: originalname,
                    nombre_servidor: filename,
                    restaurante_id: restauranteId
                }
            });

        } catch (error) {
            console.error('Error al subir archivo:', error);

            res.status(500).json({
                error: true,
                message: error.message || 'Error al subir archivo'
            });
        }
    }
);

// POST /api/archivos/:id/validaciones - agregar validación a archivo
router.post(
    '/:id/validaciones',
    verificarToken,
    checkPermission('validate_files'), // mapea al JSON: documentos
    async (req, res) => {
        try {
            const archivoId = req.params.id;
            const { observaciones } = req.body;
            await pool.query(
                'INSERT INTO validaciones (archivo_id, usuario_id, observaciones) VALUES (?, ?, ?)',
                [archivoId, req.usuario.id, observaciones]
            );
            res.json({ success: true });
        } catch (error) {
            console.error('Error al agregar validación:', error);
            res.status(500).json({ error: true, message: 'Error al agregar validación' });
        }
    }
);

// GET /api/archivos/validaciones - listar validaciones
router.get(
    '/validaciones',
    verificarToken,
    checkPermission('view_validaciones'), // mapea al JSON: historial
    async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT * FROM validaciones ORDER BY id DESC');
            res.json(rows);
        } catch (error) {
            console.error('Error al obtener validaciones:', error);
            res.status(500).json({ error: true, message: 'Error al obtener validaciones' });
        }
    }
);
router.delete(
    '/:id',
    verificarToken,
    checkPermission('upload_files'),
    async (req, res) => {
        try {

            const [archivos] = await pool.query(
                'SELECT * FROM archivos_excel WHERE id = ?',
                [req.params.id]
            );

            if (archivos.length === 0) {
                return res.status(404).json({
                    error: true,
                    message: 'Archivo no encontrado'
                });
            }

            const archivo = archivos[0];

            const rutaCompleta = path.join(
                __dirname,
                '..',
                archivo.ruta_archivo
            );

            if (fs.existsSync(rutaCompleta)) {
                fs.unlinkSync(rutaCompleta);
            }

            await pool.query(
                'DELETE FROM archivos_excel WHERE id = ?',
                [req.params.id]
            );

            res.json({
                success: true,
                message: 'Archivo eliminado'
            });

        } catch (error) {
            console.error('Error eliminando archivo:', error);

            res.status(500).json({
                error: true,
                message: 'Error eliminando archivo'
            });
        }
    }
);

router.get(
    '/:id/descargar',
    verificarToken,
    checkPermission('view_archivos'),
    async (req, res) => {
        try {

            console.log('=== DESCARGAR ===');
            console.log('ID solicitado:', req.params.id);

            const [archivos] = await pool.query(
                'SELECT * FROM archivos_excel WHERE id = ?',
                [req.params.id]
            );

            console.log('Resultado BD:', archivos);

            if (!archivos.length) {
                console.log('NO EXISTE EN LA BD');
                return res.status(404).json({
                    error: true,
                    message: 'Archivo no encontrado'
                });
            }

            const archivo = archivos[0];

            const rutaCompleta = archivo.ruta_archivo;

            console.log('Ruta guardada:', archivo.ruta_archivo);
            console.log('Ruta completa:', rutaCompleta);
            console.log('Existe archivo:', fs.existsSync(rutaCompleta));

            if (!fs.existsSync(rutaCompleta)) {
                return res.status(404).json({
                    error: true,
                    message: 'El archivo físico no existe'
                });
            }

            res.download(
                rutaCompleta,
                archivo.nombre_original
            );

        } catch (error) {
            console.error('Error descargando archivo:', error);

            res.status(500).json({
                error: true,
                message: 'Error descargando archivo'
            });
        }
    }
);

module.exports = router;