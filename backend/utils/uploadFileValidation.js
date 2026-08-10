const path = require('path');

const EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls', '.xlsm', '.csv']);
const EXCEL_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroenabled.12',
    'text/csv',
    'application/csv',
    'application/octet-stream'
]);

const DOCUMENT_EXTENSIONS = new Set([
    ...EXCEL_EXTENSIONS,
    '.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'
]);

const DOCUMENT_MIME_TYPES = new Set([
    ...EXCEL_MIME_TYPES,
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
]);

function createFileFilter(allowedExtensions, allowedMimeTypes, errorMessage) {
    return (req, file, callback) => {
        const extension = path.extname(file.originalname || '').toLowerCase();
        const mimeType = String(file.mimetype || '').toLowerCase();

        if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(mimeType)) {
            const error = new Error(errorMessage);
            error.code = 'INVALID_FILE_TYPE';
            callback(error);
            return;
        }

        file.originalname = path.basename(file.originalname)
            .replace(/[\/\x00-\x1f\x7f]/g, '_')
            .slice(0, 255);
        callback(null, true);
    };
}

const excelFileFilter = createFileFilter (
    EXCEL_EXTENSIONS,
    EXCEL_MIME_TYPES,
    'Only XLSX, XLS, XLSM, or CSV files are allowed'
);

const documentFileFilter = createFileFilter (
    DOCUMENT_EXTENSIONS,
    DOCUMENT_MIME_TYPES,
    'Only Excel, PDF, Word, or image (PNG/JPG) files are allowed'
);

module.exports = {excelFileFilter,documentFileFilter};