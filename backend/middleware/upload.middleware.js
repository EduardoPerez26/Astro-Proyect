// ============================================
// CONFIGURACION DE MULTER - SUBIDA DE ARCHIVOS
// ============================================
// Multer maneja la subida de archivos al servidor.
// Configura donde se guardan y que tipos se permiten.
// ============================================

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Crear carpeta de uploads si no existe
const uploadDir = process.env.UPLOAD_FOLDER || './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configurar almacenamiento
const storage = multer.diskStorage({
    // Carpeta destino
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    
    // Nombre del archivo en el servidor
    filename: function (req, file, cb) {
        // Generar nombre unico: timestamp + nombre original
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext);
        cb(null, `${baseName}-${uniqueSuffix}${ext}`);
    }
});

// Filtro de archivos (solo Excel)
const fileFilter = (req, file, cb) => {
    // Tipos MIME permitidos para archivos Excel
    const allowedMimes = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream' // Algunos navegadores envian este tipo
    ];

    // Extensiones permitidas
    const allowedExts = ['.xls', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
        cb(null, true); // Aceptar archivo
    } else {
        cb(new Error('Solo se permiten archivos Excel (.xls, .xlsx)'), false);
    }
};

// Crear instancia de multer con la configuracion
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: (process.env.MAX_FILE_SIZE_MB || 50) * 1024 * 1024 // Convertir MB a bytes
    }
});

module.exports = upload;
