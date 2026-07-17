// File routes.
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const { verificarToken, checkPermission } = require('../middleware/auth.middleware');
const {
    ensureCorporateSchema,
    createFileHash,
    recordOperationalAudit
} = require('../services/corporatePlatform.service');

const storage = multer.memoryStorage();
const ALLOWED_EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls', '.xlsm', '.csv']);
const ALLOWED_EXCEL_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroenabled.12',
    'text/csv',
    'application/csv',
    'application/octet-stream'
]);

const upload = multer({
    storage,
    limits: { fileSize: Number(process.env.MAX_FILE_SIZE_MB || 50) * 1024 * 1024 },
    fileFilter(req, file, callback) {
        const extension = path.extname(file.originalname || '').toLowerCase();
        const mimeType = String(file.mimetype || '').toLowerCase();

        if (!ALLOWED_EXCEL_EXTENSIONS.has(extension) || !ALLOWED_EXCEL_MIME_TYPES.has(mimeType)) {
            const error = new Error('Only XLSX, XLS, XLSM, or CSV files are allowed.');
            error.code = 'INVALID_EXCEL_FILE';
            callback(error);
            return;
        }

        file.originalname = path.basename(file.originalname)
            .replace(/[\/\x00-\x1f\x7f]/g, '_')
            .slice(0, 255);
        callback(null, true);
    }
});

function cargarArchivoExcel(req, res, next) {
    upload.single('archivo')(req, res, error => {
        if (!error) return next();

        const isSizeError = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
        return res.status(isSizeError ? 413 : 400).json({
            error: true,
            code: error.code || 'FILE_UPLOAD_REJECTED',
            message: isSizeError
                ? `The file exceeds the ${Number(process.env.MAX_FILE_SIZE_MB || 50)} MB limit.`
                : (error.message || 'The file was rejected.')
        });
    });
}

function debeFiltrarPorDepartment(req) {
    return req.usuario?.rol !== 'superadmin' && Boolean(req.departamento?.id);
}

async function registrarVersionDocumento({
    archivoId,
    req,
    file,
    reemplazo = false,
    metadata = null
}) {
    try {
        await ensureCorporateSchema();

        const [versiones] = await pool.query(
            `SELECT id, version_number, workflow_status
             FROM corporate_document_versions
             WHERE archivo_id = ?
             ORDER BY version_number DESC
             LIMIT 1`,
            [archivoId]
        );

        const anterior = versiones[0] || null;
        const versionNumber = anterior
            ? Number(anterior.version_number || 0) + 1
            : 1;
        const fileHash = createFileHash(file?.buffer || '');

        if (anterior && ['approved', 'posted', 'archived'].includes(anterior.workflow_status)) {
            await pool.query(
                `UPDATE corporate_document_versions
                 SET locked_at = COALESCE(locked_at, NOW())
                 WHERE id = ?`,
                [anterior.id]
            );
        }

        const [resultado] = await pool.query(
            `INSERT INTO corporate_document_versions
                (archivo_id, version_number, workflow_status, file_hash,
                 source_filename, owner_id, departamento_id, metadata_json)
             VALUES (?, ?, 'uploaded', ?, ?, ?, ?, ?)`,
            [
                archivoId,
                versionNumber,
                fileHash,
                file?.originalname || null,
                req.usuario?.id || null,
                req.departamento?.id || null,
                JSON.stringify({
                    size: Number(file?.size || 0),
                    mimetype: file?.mimetype || null,
                    replacement: Boolean(reemplazo),
                    ...(metadata || {})
                })
            ]
        );

        await pool.query(
            `INSERT INTO corporate_document_events
                (archivo_id, version_id, event_type, previous_status,
                 new_status, actor_id, notes, metadata_json)
             VALUES (?, ?, ?, ?, 'uploaded', ?, ?, ?)`,
            [
                archivoId,
                resultado.insertId,
                reemplazo ? 'version_created' : 'uploaded',
                anterior?.workflow_status || null,
                req.usuario?.id || null,
                reemplazo
                    ? `Version ${versionNumber} uploaded as a replacement.`
                    : 'Initial document version uploaded.',
                JSON.stringify({
                    requestId: req.requestId || null,
                    fileHash
                })
            ]
        );

        await recordOperationalAudit({
            req,
            action: reemplazo ? 'document_version_created' : 'document_uploaded',
            resourceType: 'archivo_excel',
            resourceId: archivoId,
            after: {
                versionId: resultado.insertId,
                versionNumber,
                workflowStatus: 'uploaded',
                fileHash
            }
        });
    } catch (error) {
        console.warn(
            'Document lifecycle registration could not be completed:',
            error.code || error.message
        );
    }
}

async function obtenerArchivoPorId(req, archivoId) {
    if (!debeFiltrarPorDepartment(req)) {
        const [archivos] = await pool.query(
            'SELECT * FROM archivos_excel WHERE id = ?',
            [archivoId]
        );
        return archivos;
    }

    try {
        const [archivos] = await pool.query(
            `SELECT *
             FROM archivos_excel
             WHERE id = ?
               AND (departamento_id = ? OR departamento_id IS NULL)`,
            [archivoId, req.departamento.id]
        );
        return archivos;
    } catch (error) {
        if (error.code !== 'ER_BAD_FIELD_ERROR') throw error;

        const [archivos] = await pool.query(
            'SELECT * FROM archivos_excel WHERE id = ?',
            [archivoId]
        );
        return archivos;
    }
}

router.get(
    '/',
    verificarToken,
    checkPermission('view_archivos'),
    async (req, res) => {
        try {

            let rows;
            const whereDepartment = debeFiltrarPorDepartment(req)
                ? 'WHERE (a.departamento_id = ? OR a.departamento_id IS NULL)'
                : '';
            const paramsDepartment = debeFiltrarPorDepartment(req)
                ? [req.departamento.id]
                : [];

            try {
                [rows] = await pool.query(`
                    SELECT
                        a.id,
                        a.usuario_id,
                        a.departamento_id,
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
                    ${whereDepartment}
                    ORDER BY a.id DESC
                `, paramsDepartment);
            } catch (error) {
                if (error.code !== 'ER_BAD_FIELD_ERROR') throw error;

                [rows] = await pool.query(`
                    SELECT
                        a.id,
                        a.usuario_id,
                        NULL AS departamento_id,
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
            }

            let workflowByFile = new Map();
            try {
                await ensureCorporateSchema();
                const [workflowRows] = await pool.query(
                    `SELECT v.archivo_id, v.workflow_status, v.version_number,
                            v.approved_at, v.locked_at
                     FROM corporate_document_versions v
                     INNER JOIN (
                        SELECT archivo_id, MAX(version_number) AS latest_version
                        FROM corporate_document_versions
                        GROUP BY archivo_id
                     ) latest
                        ON latest.archivo_id = v.archivo_id
                       AND latest.latest_version = v.version_number`
                );
                workflowByFile = new Map(
                    workflowRows.map(item => [Number(item.archivo_id), item])
                );
            } catch (workflowError) {
                console.warn(
                    'Document workflow status could not be joined:',
                    workflowError.code || workflowError.message
                );
            }

            const archivos = rows.map(row => {
                const workflow = workflowByFile.get(Number(row.id));
                return {
                    ...row,
                    estado_legacy: row.estado,
                    estado: workflow?.workflow_status || row.estado,
                    workflow_version: workflow?.version_number || null,
                    workflow_locked_at: workflow?.locked_at || null,
                    workflow_approved_at: workflow?.approved_at || null,
                    archivoExiste: (
                        Boolean(row.tiene_blob) ||
                        Boolean(
                            row.ruta_archivo &&
                            fs.existsSync(row.ruta_archivo)
                        )
                    )
                };
            });

            res.json(archivos);

        } catch (error) {

            console.error('Files could not be loaded:', error);

            res.status(500).json({
                error: true,
                message: 'Files could not be loaded'
            });
        }
    }
);

router.post(
    '/subir',
    verificarToken,
    checkPermission('upload_files'),
    cargarArchivoExcel,
    async (req, res) => {
        try {

            if (!req.file) {
                return res.status(400).json({
                    error: true,
                    message: 'No file was received'
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
                    message: 'Restaurant not found'
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
            const esReviewFuente =
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
                : esReviewFuente
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

                    await registrarVersionDocumento({
                        archivoId: referenciaAnterior.id,
                        req,
                        file: req.file,
                        reemplazo: true,
                        metadata: {
                            source: 'comparison_reference',
                            restaurantId: restauranteId
                        }
                    });

                    return res.json({
                        success: true,
                        reemplazado: true,
                        archivo: { id: referenciaAnterior.id }
                    });
                }
            }

            function normalizarFechaArchivo(valor) {
                if (!valor) return '';

                if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
                    return valor.toISOString().slice(0, 10);
                }

                const texto = String(valor).trim();

                // Ya viene como YYYY-MM-DD
                if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
                    return texto.slice(0, 10);
                }

                // Viene como MM/DD/YYYY
                const matchUsa = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (matchUsa) {
                    return `${matchUsa[3]}-${matchUsa[1].padStart(2, '0')}-${matchUsa[2].padStart(2, '0')}`;
                }

                const fecha = new Date(texto);

                if (!Number.isNaN(fecha.getTime())) {
                    return fecha.toISOString().slice(0, 10);
                }

                return texto;
            }

            const reemplazarSiExiste =
                String(req.body.reemplazar_si_existe || '').toLowerCase() === 'true';

            const archivoReemplazarId =
                Number(req.body.archivo_reemplazar_id || 0);

            const confirmacionReemplazo =
                String(req.body.confirmacion_reemplazo || '')
                    .trim()
                    .toUpperCase();

            const limpiarCampo = value => {
                const texto = String(value || '').trim();

                if (
                    !texto ||
                    texto === 'undefined' ||
                    texto === 'null'
                ) {
                    return '';
                }

                return texto;
            };

            const tipoDocumento =
                limpiarCampo(req.body.tipo_documento);

            const fechaDocumento =
                limpiarCampo(
                    req.body.fecha_conciliacion ||
                    req.body.periodo_fecha
                );

            const esArchivoGeneradoConciliacion =
                /_(Conciliacion|EBT)\./i.test(String(originalname || ''));

            const fechaDocumentoNormalizada =
                normalizarFechaArchivo(fechaDocumento);

            const parsearNotasArchivo = valor => {
                try {
                    return typeof valor === 'string'
                        ? JSON.parse(valor)
                        : valor || {};
                } catch {
                    return {};
                }
            };

            const actualizarArchivoExistente = async id => {
                await pool.query(
                    `
                    UPDATE archivos_excel
                    SET nombre_original = ?,
                        nombre_servidor = ?,
                        tamano_bytes = ?,
                        tipo_mime = ?,
                        archivo_blob = ?,
                        ruta_archivo = NULL,
                        periodo_fecha = ?,
                        notas = ?,
                        estado = 'pendiente',
                        fecha_actualizacion = CURRENT_TIMESTAMP
                    WHERE id = ?
                    `,
                    [
                        originalname,
                        nombreServidor,
                        size,
                        mimetype,
                        buffer,
                        fechaDocumentoNormalizada || null,
                        notas,
                        id
                    ]
                );

                await registrarVersionDocumento({
                    archivoId: id,
                    req,
                    file: req.file,
                    reemplazo: true,
                    metadata: {
                        documentType: tipoDocumento || null,
                        periodDate: fechaDocumentoNormalizada || null,
                        restaurantId: restauranteId
                    }
                });

                return res.json({
                    success: true,
                    reemplazado: true,
                    archivo: {
                        id
                    }
                });
            };

            if (archivoReemplazarId) {
                if (
                    !reemplazarSiExiste ||
                    confirmacionReemplazo !== 'REEMPLAZAR'
                ) {
                    return res.status(400).json({
                        error: true,
                        code: 'CONFIRMACION_REEMPLAZO_REQUERIDA',
                        message: 'The replacement confirmation is not valid.'
                    });
                }

                const [archivoConfirmado] = await pool.query(
                    `SELECT id
                     FROM archivos_excel
                     WHERE id = ?
                       AND restaurante_id = ?
                     LIMIT 1`,
                    [archivoReemplazarId, restauranteId]
                );

                if (!archivoConfirmado.length) {
                    return res.status(409).json({
                        error: true,
                        code: 'ARCHIVO_REEMPLAZO_NO_DISPONIBLE',
                        message: 'The file you confirmed for replacement is no longer available. Refresh the page and try again.'
                    });
                }

                return await actualizarArchivoExistente(archivoReemplazarId);
            }

            const validarDuplicadosGenerados =
                Boolean(
                    tipoDocumento ||
                    fechaDocumentoNormalizada ||
                    esArchivoGeneradoConciliacion ||
                    reemplazarSiExiste
                );

            if (validarDuplicadosGenerados) {
                const [candidatos] = await pool.query(
                    `SELECT id, nombre_original, periodo_fecha, notas
                     FROM archivos_excel
                     WHERE restaurante_id = ?
                     ORDER BY id DESC
                     LIMIT 500`,
                    [restauranteId]
                );

                const duplicado = candidatos.find(candidato => {
                    const nombreActual = String(candidato.nombre_original || '');
                    const mismoNombre =
                        nombreActual.trim().toLowerCase() ===
                        String(originalname || '').trim().toLowerCase();

                    const meta = parsearNotasArchivo(candidato.notas);
                    const fechaCandidato = normalizarFechaArchivo(
                        meta.fecha ||
                        meta.fecha_conciliacion ||
                        candidato.periodo_fecha
                    );

                    const mismoTipo =
                        tipoDocumento &&
                        (
                            meta.tipoDocumento === tipoDocumento ||
                            (
                                tipoDocumento === 'conciliacion' &&
                                /_Conciliacion\./i.test(nombreActual)
                            ) ||
                            (
                                tipoDocumento === 'ebt' &&
                                /_EBT\./i.test(nombreActual)
                            )
                        );

                    const mismaFecha =
                        fechaDocumentoNormalizada &&
                        (
                            fechaCandidato === fechaDocumentoNormalizada ||
                            nombreActual.includes(fechaDocumentoNormalizada)
                        );

                    return mismoNombre || (mismoTipo && mismaFecha);
                });

                if (duplicado) {
                    return res.status(409).json({
                        error: true,
                        code: 'ARCHIVO_DUPLICADO',
                        message: 'A file already exists for this restaurant and document. Confirm the replacement before uploading.',
                        archivo: {
                            id: duplicado.id,
                            nombre_original: duplicado.nombre_original
                        }
                    });
                }
            }


            let result;
            const paramsArchivo = [
                req.usuario.id,
                req.departamento?.id || null,
                restauranteId,
                originalname,
                nombreServidor,
                size,
                mimetype,
                buffer,
                null,
                fechaDocumentoNormalizada || null,
                notas,
                'pendiente'
            ];

            try {
                [result] = await pool.query(
                    `
                    INSERT INTO archivos_excel (
                    usuario_id,
                    departamento_id,
                    restaurante_id,
                    nombre_original,
                    nombre_servidor,
                    tamano_bytes,
                    tipo_mime,
                    archivo_blob,
                    ruta_archivo,
                    periodo_fecha,
                    notas,
                    estado
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `,
                    paramsArchivo
                );
            } catch (error) {
                if (error.code !== 'ER_BAD_FIELD_ERROR') throw error;

                [result] = await pool.query(
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
                    periodo_fecha,
                    notas,
                    estado
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        fechaDocumentoNormalizada || null,
                        notas,
                        'pendiente'
                    ]
                );
            }

            await registrarVersionDocumento({
                archivoId: result.insertId,
                req,
                file: req.file,
                reemplazo: false,
                metadata: {
                    documentType: tipoDocumento || null,
                    periodDate: fechaDocumentoNormalizada || null,
                    restaurantId: restauranteId
                }
            });

            res.json({
                success: true,
                archivo: {
                    id: result.insertId
                }
            });

        } catch (error) {

            console.error('Error uploading file:', error);

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
    checkPermission('download_files'),
    async (req, res) => {
        try {

            const archivos = await obtenerArchivoPorId(req, req.params.id);

            if (!archivos.length) {
                return res.status(404).json({
                    error: true,
                    message: 'File not found'
                });
            }

            const archivo = archivos[0];

            await recordOperationalAudit({
                req,
                action: 'document_downloaded',
                resourceType: 'archivo_excel',
                resourceId: archivo.id,
                metadata: {
                    filename: archivo.nombre_original,
                    size: archivo.tamano_bytes || null
                }
            });

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
                message: 'The previous file no longer exists in temporary storage. It must be uploaded again.'
            });

        } catch (error) {

            console.error('Error downloading file:', error);

            res.status(500).json({
                error: true,
                message: 'Error downloading file'
            });
        }
    }
);

router.delete(
    '/:id',
    verificarToken,
    checkPermission('delete_files'),
    async (req, res) => {
        try {

            const archivos = await obtenerArchivoPorId(req, req.params.id);

            if (!archivos.length) {
                return res.status(404).json({
                    error: true,
                    message: 'File not found'
                });
            }

            const archivo = archivos[0];

            try {
                await ensureCorporateSchema();
                const [versions] = await pool.query(
                    `SELECT id, version_number, workflow_status, locked_at
                     FROM corporate_document_versions
                     WHERE archivo_id = ?
                     ORDER BY version_number DESC
                     LIMIT 1`,
                    [archivo.id]
                );
                const latestVersion = versions[0];

                if (
                    latestVersion &&
                    (
                        latestVersion.locked_at ||
                        ['approved', 'posted', 'archived'].includes(latestVersion.workflow_status)
                    )
                ) {
                    return res.status(409).json({
                        error: true,
                        code: 'DOCUMENT_VERSION_LOCKED',
                        message: 'Approved, posted, or archived documents cannot be deleted. Preserve the record and use the archive workflow.'
                    });
                }

                await pool.query(
                    `INSERT INTO corporate_document_events
                        (archivo_id, version_id, event_type, previous_status,
                         new_status, actor_id, notes, metadata_json)
                     VALUES (?, ?, 'deleted', ?, 'deleted', ?, ?, ?)`,
                    [
                        archivo.id,
                        latestVersion?.id || null,
                        latestVersion?.workflow_status || archivo.estado || null,
                        req.usuario.id,
                        'Document deleted before final approval.',
                        JSON.stringify({ request_id: req.requestId || null })
                    ]
                );
            } catch (workflowError) {
                console.warn(
                    'Document deletion governance check could not be completed:',
                    workflowError.code || workflowError.message
                );
            }

            await recordOperationalAudit({
                req,
                action: 'document_deleted',
                resourceType: 'archivo_excel',
                resourceId: archivo.id,
                before: {
                    filename: archivo.nombre_original,
                    status: archivo.estado,
                    restaurantId: archivo.restaurante_id
                }
            });

            if (
                archivo.ruta_archivo &&
                fs.existsSync(archivo.ruta_archivo)
            ) {
                fs.unlinkSync(archivo.ruta_archivo);
            }

            await pool.query(
                'DELETE FROM archivos_excel WHERE id = ?',
                [req.params.id]
            );

            res.json({
                success: true,
                message: 'File deleted successfully'
            });

        } catch (error) {

            console.error(
                'Error deleting file:',
                error
            );

            res.status(500).json({
                error: true,
                message: 'Error deleting file'
            });
        }
    }
);

module.exports = router;
