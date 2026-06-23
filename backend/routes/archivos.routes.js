// rutas/archivos.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const { verificarToken, checkPermission } = require('../middleware/auth.middleware');

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }
});

router.get(
    '/',
    verificarToken,
    checkPermission('view_archivos'),
    async (req, res) => {
        try {

            const [rows] = await pool.query(`
                SELECT
                    a.id,
                    a.usuario_id,
                    a.restaurante_id,
                    a.nombre_original,
                    a.nombre_servidor,
                    a.tamano_bytes,
                    a.tipo_mime,
                    a.ruta_archivo,
                    a.numero_hojas,
                    a.nombres_hojas,
                    a.estado,
                    a.periodo_fecha,
                    a.notas,
                    a.fecha_subida,
                    a.fecha_actualizacion,
                    (a.archivo_blob IS NOT NULL AND OCTET_LENGTH(a.archivo_blob) > 0) AS tiene_blob,
                    r.nombre AS restaurante_nombre,
                    r.codigo AS restaurante_codigo,
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
                    Boolean(row.tiene_blob) ||
                    Boolean(
                        row.ruta_archivo &&
                        fs.existsSync(row.ruta_archivo)
                    )
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
                size,
                mimetype,
                buffer
            } = req.file;
            const nombreServidor = `${Date.now()}-${originalname}`;
            const esReferenciaComparacion =
                String(req.body.es_referencia_comparacion || '').toLowerCase() === 'true';
            const esRevisionFuente =
                String(req.body.es_revision_fuente || '').toLowerCase() === 'true';
            let resumenContenido = null;

            if (esReferenciaComparacion && req.body.resumen_contenido) {
                try {
                    resumenContenido = JSON.parse(req.body.resumen_contenido);
                } catch {
                    resumenContenido = null;
                }
            }

            const notas = esReferenciaComparacion
                ? JSON.stringify({
                    tipo: 'referencia_comparacion',
                    fuente: req.body.tipo_fuente || 'sales',
                    hash: String(req.body.hash_contenido || '').slice(0, 64),
                    nombreOriginal: originalname,
                    resumen: resumenContenido
                })
                : esRevisionFuente
                ? JSON.stringify({
                    tipo: 'revision_fuente',
                    fuente: req.body.tipo_fuente || 'sales',
                    revision: Number(req.body.revision || 1),
                    hash: String(req.body.hash_contenido || '').slice(0, 64),
                    nombreOriginal: originalname
                })
                : (req.body.notas || null);

            if (esReferenciaComparacion) {
                const fuente = req.body.tipo_fuente || 'sales';
                const [candidatos] = await pool.query(
                    `SELECT id, notas
                     FROM archivos_excel
                     WHERE restaurante_id = ?
                     ORDER BY id DESC`,
                    [restauranteId]
                );
                const referenciaAnterior = candidatos.find(candidato => {
                    try {
                        const meta = JSON.parse(candidato.notas || '{}');
                        return (
                            ['referencia_comparacion', 'revision_fuente'].includes(meta.tipo) &&
                            meta.fuente === fuente
                        );
                    } catch {
                        return false;
                    }
                });

                if (referenciaAnterior) {
                    const nombresHojas = resumenContenido?.hojas
                        ?.map(hoja => hoja.nombre)
                        .join(', ') || null;

                    await pool.query(
                        `UPDATE archivos_excel
                         SET nombre_original = ?,
                             nombre_servidor = ?,
                             tamano_bytes = ?,
                             tipo_mime = ?,
                             archivo_blob = ?,
                             ruta_archivo = NULL,
                             numero_hojas = ?,
                             nombres_hojas = ?,
                             notas = ?,
                             estado = 'pendiente',
                             fecha_actualizacion = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [
                            originalname,
                            nombreServidor,
                            size,
                            mimetype,
                            buffer,
                            resumenContenido?.totalHojas || null,
                            nombresHojas,
                            notas,
                            referenciaAnterior.id
                        ]
                    );

                    return res.json({
                        success: true,
                        reemplazado: true,
                        archivo: { id: referenciaAnterior.id }
                    });
                }
            }

            const [result] = await pool.query(
                `
                INSERT INTO archivos_excel (
                    usuario_id,
                    restaurante_id,
                    nombre_original,
                    nombre_servidor,
                    tamano_bytes,
                    tipo_mime,
                    archivo_blob,
                    ruta_archivo,
                    notas,
                    estado
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    req.usuario.id,
                    restauranteId,
                    originalname,
                    nombreServidor,
                    size,
                    mimetype,
                    buffer,
                    null,
                    notas,
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

            if (archivo.archivo_blob) {
                const contenido = Buffer.isBuffer(archivo.archivo_blob)
                    ? archivo.archivo_blob
                    : Buffer.from(archivo.archivo_blob);

                res.setHeader(
                    'Content-Type',
                    archivo.tipo_mime || 'application/octet-stream'
                );
                res.setHeader('Content-Length', contenido.length);
                res.setHeader(
                    'Content-Disposition',
                    `attachment; filename*=UTF-8''${encodeURIComponent(archivo.nombre_original)}`
                );
                return res.send(contenido);
            }

            if (
                archivo.ruta_archivo &&
                fs.existsSync(archivo.ruta_archivo)
            ) {
                return res.download(
                    archivo.ruta_archivo,
                    archivo.nombre_original
                );
            }

            return res.status(410).json({
                error: true,
                message: 'El archivo anterior ya no existe en el almacenamiento temporal. Debe volver a cargarse.'
            });

        } catch (error) {

            console.error('Error descargando archivo:', error);

            res.status(500).json({
                error: true,
                message: 'Error descargando archivo'
            });
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
