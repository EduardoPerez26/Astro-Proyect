// rutas/archivos.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const { verificarToken, checkPermission } = require('../middleware/auth.middleware');

// ============================================
// MULTER
// ============================================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads');

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        cb(null, uploadDir);
    },

    filename: function (req, file, cb) {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

// ============================================
// GET ARCHIVOS
// ============================================

router.get(
    '/',
    verificarToken,
    checkPermission('view_archivos'),
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

            const archivos = rows.map(row => ({
                ...row,
                archivoExiste: (
                    row.ruta_archivo
                        ? fs.existsSync(row.ruta_archivo)
                        : false
                )
            }));

            res.json(archivos);

        } catch (error) {

            console.error('Error al obtener archivos:', error);

            res.status(500).json({
                error: true,
                message: 'Error al obtener archivos'
            });
        }
    }
);

// ============================================
// SUBIR ARCHIVO
// ============================================

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
            console.log('FILE PATH:', req.file.path);
            console.log('================================');

            const restauranteCodigo = req.body.restaurante_id;

            const [restaurantes] = await pool.query(
                'SELECT id FROM restaurantes WHERE codigo = ? LIMIT 1',
                [restauranteCodigo]
            );

            if (!restaurantes.length) {
                return res.status(400).json({
                    error: true,
                    message: 'Restaurante no encontrado'
                });
            }

            const restauranteId = restaurantes[0].id;

            const {
                originalname,
                filename,
                size,
                mimetype,
                path: filePath
            } = req.file;

            const [result] = await pool.query(
                `
                INSERT INTO archivos_excel (
                    usuario_id,
                    restaurante_id,
                    nombre_original,
                    nombre_servidor,
                    tamano_bytes,
                    tipo_mime,
                    ruta_archivo,
                    estado
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    req.usuario.id,
                    restauranteId,
                    originalname,
                    filename,
                    size,
                    mimetype,
                    filePath,
                    'pendiente'
                ]
            );

            res.json({
                success: true,
                archivo: {
                    id: result.insertId
                }
            });

        } catch (error) {

            console.error('Error al subir archivo:', error);

            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
);

// ============================================
// DESCARGAR
// ============================================

router.get(
    '/:id/descargar',
    verificarToken,
    checkPermission('view_archivos'),
    async (req, res) => {
        try {

            console.log('================================');
            console.log('DESCARGAR ARCHIVO');
            console.log('ID:', req.params.id);

            const [archivos] = await pool.query(
                'SELECT * FROM archivos_excel WHERE id = ?',
                [req.params.id]
            );

            if (!archivos.length) {
                return res.status(404).json({
                    error: true,
                    message: 'Archivo no encontrado'
                });
            }

            const archivo = archivos[0];

            console.log('Current dir:', process.cwd());
            console.log('__dirname:', __dirname);

            console.log(
                'Contenido uploads:',
                fs.existsSync('/app/uploads')
                    ? fs.readdirSync('/app/uploads')
                    : 'NO EXISTE /app/uploads'
            );

            if (!fs.existsSync(archivo.ruta_archivo)) {

                console.log('NO EXISTE EL ARCHIVO');

                return res.status(404).json({
                    error: true,
                    message: 'Archivo físico no existe'
                });
            }

            console.log('DESCARGA OK');

            res.download(
                archivo.ruta_archivo,
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

// ============================================
// ELIMINAR
// ============================================

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

            if (!archivos.length) {
                return res.status(404).json({
                    error: true,
                    message: 'Archivo no encontrado'
                });
            }

            const archivo = archivos[0];

            console.log('================================');
            console.log('ELIMINANDO ARCHIVO');
            console.log('ID:', archivo.id);
            console.log('Ruta:', archivo.ruta_archivo);
            console.log('================================');

            // Eliminar archivo físico si existe
            if (
                archivo.ruta_archivo &&
                fs.existsSync(archivo.ruta_archivo)
            ) {
                fs.unlinkSync(archivo.ruta_archivo);

                console.log(
                    'Archivo físico eliminado:',
                    archivo.ruta_archivo
                );
            } else {
                console.log(
                    'El archivo físico no existe:',
                    archivo.ruta_archivo
                );
            }

            // Eliminar registro de la BD
            await pool.query(
                'DELETE FROM archivos_excel WHERE id = ?',
                [req.params.id]
            );

            res.json({
                success: true,
                message: 'Archivo eliminado correctamente'
            });

        } catch (error) {

            console.error(
                'Error eliminando archivo:',
                error
            );

            res.status(500).json({
                error: true,
                message: 'Error eliminando archivo'
            });
        }
    }
);

module.exports = router;