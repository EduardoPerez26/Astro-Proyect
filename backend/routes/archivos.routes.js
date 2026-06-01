// ============================================
// RUTAS DE ARCHIVOS EXCEL
// ============================================
// Maneja subida, descarga y procesamiento de archivos Excel.
// Esta es la parte mas importante del sistema.
// ============================================

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { pool } = require('../config/database');
const { verificarToken } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

// ============================================
// POST /api/archivos/subir
// ============================================
// Sube un archivo Excel al servidor y lo procesa
router.post('/subir', verificarToken, upload.single('archivo'), async (req, res) => {
    try {
        // Verificar que se subio un archivo
        if (!req.file) {
            return res.status(400).json({
                error: true,
                mensaje: 'No se envio ningun archivo'
            });
        }

        const { restaurante_id, restaurante, periodo_fecha, notas } = req.body;
        let restauranteId = restaurante_id;

        // Validar restaurante por ID o codigo
        if (!restauranteId && restaurante) {
            const [restaurantes] = await pool.query(
                'SELECT id FROM restaurantes WHERE codigo = ? LIMIT 1',
                [restaurante]
            );
            if (restaurantes.length > 0) {
                restauranteId = restaurantes[0].id;
            }
        }

        if (!restauranteId) {
            // Eliminar archivo subido si hay error
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                error: true,
                mensaje: 'El restaurante es requerido'
            });
        }

        // Leer el archivo Excel para extraer informacion
        const workbook = XLSX.readFile(req.file.path);
        const nombresHojas = workbook.SheetNames;

        // Leer el archivo como buffer para guardarlo en la BD (opcional)
        const archivoBuffer = fs.readFileSync(req.file.path);

        // Insertar registro en la base de datos
        const [resultado] = await pool.query(
            `INSERT INTO archivos_excel 
             (usuario_id, restaurante_id, nombre_original, nombre_servidor, tamano_bytes, 
              ruta_archivo, numero_hojas, nombres_hojas, periodo_fecha, notas, archivo_blob)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.usuario.id,
                restauranteId,
                req.file.originalname,
                req.file.filename,
                req.file.size,
                req.file.path,
                nombresHojas.length,
                nombresHojas.join(','),
                periodo_fecha || null,
                notas || null,
                archivoBuffer // Guardar el archivo en la BD (opcional)
            ]
        );

        const archivoId = resultado.insertId;

        // Procesar y extraer datos de la hoja de conciliacion
        await procesarDatosExcel(archivoId, workbook);

        res.status(201).json({
            success: true,
            error: false,
            mensaje: 'Archivo subido exitosamente',
            archivo: {
                id: archivoId,
                nombre: req.file.originalname,
                tamano: req.file.size,
                hojas: nombresHojas
            }
        });

    } catch (error) {
        console.error('Error al subir archivo:', error);
        
        // Eliminar archivo si hubo error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: true,
            mensaje: 'Error al subir el archivo',
            detalle: error.message
        });
    }
});

// ============================================
// GET /api/archivos
// ============================================
// Lista todos los archivos del usuario (o todos si es admin)
router.get('/', verificarToken, async (req, res) => {
    try {
        let query = `
            SELECT 
                a.id,
                a.nombre_original,
                a.tamano_bytes,
                a.numero_hojas,
                a.estado,
                a.fecha_subida,
                u.nombre_completo AS subido_por,
                r.nombre AS restaurante
            FROM archivos_excel a
            JOIN usuarios u ON a.usuario_id = u.id
            JOIN restaurantes r ON a.restaurante_id = r.id
        `;

        let params = [];

        // Si no es admin, solo ver sus archivos
        if (req.usuario.rol !== 'admin') {
            query += ' WHERE a.usuario_id = ?';
            params.push(req.usuario.id);
        }

        query += ' ORDER BY a.fecha_subida DESC';

        const [archivos] = await pool.query(query, params);

        res.json({
            error: false,
            archivos
        });

    } catch (error) {
        console.error('Error al listar archivos:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al obtener archivos'
        });
    }
});

// ============================================
// POST /api/archivos/:id/validaciones
// ============================================
// Guarda el resultado de una validacion para un archivo
router.post('/:id/validaciones', verificarToken, async (req, res) => {
    try {
        const archivoId = req.params.id;
        const {
            tipo_validacion,
            resultado,
            total_errores,
            detalle_errores,
            duracion_segundos
        } = req.body;

        const [archivos] = await pool.query(
            'SELECT * FROM archivos_excel WHERE id = ?',
            [archivoId]
        );

        if (archivos.length === 0) {
            return res.status(404).json({
                error: true,
                mensaje: 'Archivo no encontrado'
            });
        }

        const archivo = archivos[0];

        if (req.usuario.rol !== 'admin' && archivo.usuario_id !== req.usuario.id) {
            return res.status(403).json({
                error: true,
                mensaje: 'No tienes permiso para guardar esta validacion'
            });
        }

        const [resultadoInsert] = await pool.query(
            `INSERT INTO historial_validaciones
             (archivo_id, usuario_id, tipo_validacion, resultado, total_errores, detalle_errores, duracion_segundos)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                archivoId,
                req.usuario.id,
                tipo_validacion || 'validacion',
                resultado || 'con_errores',
                total_errores || 0,
                detalle_errores ? JSON.stringify(detalle_errores) : null,
                duracion_segundos || 0
            ]
        );

        res.status(201).json({
            error: false,
            mensaje: 'Validacion guardada correctamente',
            validacion_id: resultadoInsert.insertId
        });
    } catch (error) {
        console.error('Error al guardar validacion:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al guardar validacion'
        });
    }
});

// ============================================
// GET /api/validaciones
// ============================================
// Lista el historial de validaciones desde la base de datos
router.get('/validaciones', verificarToken, async (req, res) => {
    try {
        let query = `
            SELECT
                v.id,
                v.archivo_id,
                v.tipo_validacion,
                v.resultado,
                v.total_errores,
                v.detalle_errores,
                v.duracion_segundos,
                v.fecha_validacion,
                a.nombre_original,
                r.nombre AS restaurante,
                u.nombre_completo AS validado_por
            FROM historial_validaciones v
            JOIN archivos_excel a ON v.archivo_id = a.id
            JOIN restaurantes r ON a.restaurante_id = r.id
            JOIN usuarios u ON v.usuario_id = u.id
        `;

        const params = [];

        if (req.usuario.rol !== 'admin') {
            query += ' WHERE a.usuario_id = ?';
            params.push(req.usuario.id);
        }

        query += ' ORDER BY v.fecha_validacion DESC';

        const [validaciones] = await pool.query(query, params);

        res.json({
            error: false,
            validaciones
        });
    } catch (error) {
        console.error('Error al obtener historial de validaciones:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al obtener historial de validaciones'
        });
    }
});

// ============================================
// GET /api/archivos/:id
// ============================================
// Obtiene detalle de un archivo especifico
router.get('/:id', verificarToken, async (req, res) => {
    try {
        const [archivos] = await pool.query(
            `SELECT 
                a.*,
                u.nombre_completo AS subido_por,
                r.nombre AS restaurante,
                r.codigo AS restaurante_codigo
             FROM archivos_excel a
             JOIN usuarios u ON a.usuario_id = u.id
             JOIN restaurantes r ON a.restaurante_id = r.id
             WHERE a.id = ?`,
            [req.params.id]
        );

        if (archivos.length === 0) {
            return res.status(404).json({
                error: true,
                mensaje: 'Archivo no encontrado'
            });
        }

        // Obtener datos de conciliacion asociados
        const [datos] = await pool.query(
            'SELECT * FROM datos_conciliacion WHERE archivo_id = ? ORDER BY numero_tienda',
            [req.params.id]
        );

        res.json({
            error: false,
            archivo: archivos[0],
            datos_conciliacion: datos
        });

    } catch (error) {
        console.error('Error al obtener archivo:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al obtener archivo'
        });
    }
});

// ============================================
// GET /api/archivos/:id/descargar
// ============================================
// Descarga el archivo Excel original
router.get('/:id/descargar', verificarToken, async (req, res) => {
    try {
        const [archivos] = await pool.query(
            'SELECT nombre_original, ruta_archivo, archivo_blob FROM archivos_excel WHERE id = ?',
            [req.params.id]
        );

        if (archivos.length === 0) {
            return res.status(404).json({
                error: true,
                mensaje: 'Archivo no encontrado'
            });
        }

        const archivo = archivos[0];

        // Opcion 1: Descargar desde el sistema de archivos
        if (archivo.ruta_archivo && fs.existsSync(archivo.ruta_archivo)) {
            return res.download(archivo.ruta_archivo, archivo.nombre_original);
        }

        // Opcion 2: Descargar desde la base de datos (BLOB)
        if (archivo.archivo_blob) {
            res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombre_original}"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            return res.send(archivo.archivo_blob);
        }

        res.status(404).json({
            error: true,
            mensaje: 'Archivo no disponible para descarga'
        });

    } catch (error) {
        console.error('Error al descargar archivo:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al descargar archivo'
        });
    }
});

// ============================================
// DELETE /api/archivos/:id
// ============================================
// Elimina un archivo
router.delete('/:id', verificarToken, async (req, res) => {
    try {
        // Verificar que el archivo existe y pertenece al usuario (o es admin)
        const [archivos] = await pool.query(
            'SELECT * FROM archivos_excel WHERE id = ?',
            [req.params.id]
        );

        if (archivos.length === 0) {
            return res.status(404).json({
                error: true,
                mensaje: 'Archivo no encontrado'
            });
        }

        const archivo = archivos[0];

        // Verificar permisos
        if (req.usuario.rol !== 'admin' && archivo.usuario_id !== req.usuario.id) {
            return res.status(403).json({
                error: true,
                mensaje: 'No tienes permiso para eliminar este archivo'
            });
        }

        // Eliminar archivo fisico si existe
        if (archivo.ruta_archivo && fs.existsSync(archivo.ruta_archivo)) {
            fs.unlinkSync(archivo.ruta_archivo);
        }

        // Eliminar de la base de datos (CASCADE eliminara datos_conciliacion)
        await pool.query('DELETE FROM archivos_excel WHERE id = ?', [req.params.id]);

        res.json({
            error: false,
            mensaje: 'Archivo eliminado exitosamente'
        });

    } catch (error) {
        console.error('Error al eliminar archivo:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al eliminar archivo'
        });
    }
});

// ============================================
// FUNCION AUXILIAR: Procesar datos del Excel
// ============================================
async function procesarDatosExcel(archivoId, workbook) {
    try {
        // Buscar hoja de Conciliacion o similar
        const hojasConciliacion = workbook.SheetNames.filter(nombre => 
            nombre.toLowerCase().includes('concili') || 
            nombre.toLowerCase().includes('resumen')
        );

        if (hojasConciliacion.length === 0) {
            // Si no hay hoja de conciliacion, usar la primera hoja
            hojasConciliacion.push(workbook.SheetNames[0]);
        }

        for (const nombreHoja of hojasConciliacion) {
            const hoja = workbook.Sheets[nombreHoja];
            const datos = XLSX.utils.sheet_to_json(hoja, { header: 1 });

            // Encontrar la fila de encabezados
            let headerRow = -1;
            for (let i = 0; i < Math.min(datos.length, 10); i++) {
                const fila = datos[i];
                if (fila && fila.some(cell => 
                    String(cell).toLowerCase().includes('store') ||
                    String(cell).toLowerCase().includes('tienda')
                )) {
                    headerRow = i;
                    break;
                }
            }

            if (headerRow === -1) continue;

            const headers = Array.isArray(datos[headerRow])
                ? datos[headerRow].map(h => String(h || '').toLowerCase().trim())
                : [];

            if (headers.length === 0) continue;

            const safeIncludes = (value) => (h) => typeof h === 'string' && h.includes(value);

            // Mapear columnas
            const colMap = {
                tienda: headers.findIndex(h => safeIncludes('store')(h) || safeIncludes('tienda')(h)),
                sales_tax: headers.findIndex(safeIncludes('sales tax')),
                gross_sales: headers.findIndex(h => safeIncludes('gross')(h) && safeIncludes('sales')(h)),
                discounts: headers.findIndex(safeIncludes('discount')),
                promo: headers.findIndex(safeIncludes('promo')),
                donations: headers.findIndex(safeIncludes('donat')),
                net_sales: headers.findIndex(h => safeIncludes('net')(h) && safeIncludes('sales')(h)),
                gc_sold: headers.findIndex(h => safeIncludes('gc')(h) && safeIncludes('sold')(h)),
                paid_out: headers.findIndex(h => safeIncludes('paid')(h) && safeIncludes('out')(h)),
                paid_in: headers.findIndex(h => safeIncludes('paid')(h) && safeIncludes('in')(h))
            };

            if (colMap.tienda === -1) {
                console.warn(`No se pudo mapear la columna tienda en la hoja ${nombreHoja}`);
                continue;
            }

            // Procesar filas de datos
            for (let i = headerRow + 1; i < datos.length; i++) {
                const fila = datos[i];
                if (!fila || !fila[colMap.tienda]) continue;

                const tienda = String(fila[colMap.tienda]).trim();
                if (!tienda || isNaN(parseInt(tienda))) continue;

                // Insertar datos en la base de datos
                await pool.query(
                    `INSERT INTO datos_conciliacion 
                     (archivo_id, numero_tienda, nombre_hoja, sales_tax, gross_sales_pos, 
                      discounts, promo, donations, net_sales, gc_sold, paid_out, paid_in)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        archivoId,
                        tienda,
                        nombreHoja,
                        parseFloat(fila[colMap.sales_tax]) || 0,
                        parseFloat(fila[colMap.gross_sales]) || 0,
                        parseFloat(fila[colMap.discounts]) || 0,
                        parseFloat(fila[colMap.promo]) || 0,
                        parseFloat(fila[colMap.donations]) || 0,
                        parseFloat(fila[colMap.net_sales]) || 0,
                        parseFloat(fila[colMap.gc_sold]) || 0,
                        parseFloat(fila[colMap.paid_out]) || 0,
                        parseFloat(fila[colMap.paid_in]) || 0
                    ]
                );
            }
        }
    } catch (error) {
        console.error('Error procesando datos del Excel:', error);
        // No lanzamos el error para no interrumpir la subida del archivo
    }
}

module.exports = router;
