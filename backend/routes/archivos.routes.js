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
            const [rows] = await pool.query('SELECT * FROM archivos_excel ORDER BY id DESC');
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
    checkPermission('upload_files'), // mapea al JSON: documentos
    upload.single('archivo'),
    async (req, res) => {
        try {
            const { originalname, filename } = req.file;
            const result = await pool.query(
                'INSERT INTO archivos_excel (nombre_original, nombre_servidor, usuario_id) VALUES (?, ?, ?)',
                [originalname, filename, req.usuario.id]
            );
            res.json({ success: true, archivoId: result[0].insertId });
        } catch (error) {
            console.error('Error al subir archivo:', error);
            res.status(500).json({ error: true, message: 'Error al subir archivo' });
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

module.exports = router;