

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verificarToken } = require('../middleware/auth.middleware');


router.get('/', verificarToken, async (req, res) => {
    try {
        const { limite = 100, pagina = 1, resultado, tipo, fecha } = req.query;
        const offset = (pagina - 1) * limite;
        
        let query = `
            SELECT 
                hv.id,
                hv.archivo_id,
                ae.nombre_original as archivo_nombre,
                hv.usuario_id,
                u.nombre_completo as usuario_nombre,
                hv.tipo_validacion,
                hv.resultado,
                hv.total_errores,
                hv.detalle_errores,
                hv.duracion_segundos,
                hv.fecha_validacion
            FROM historial_validaciones hv
            LEFT JOIN archivos_excel ae ON hv.archivo_id = ae.id
            LEFT JOIN usuarios u ON hv.usuario_id = u.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (resultado) {
            query += ' AND hv.resultado = ?';
            params.push(resultado);
        }
        
        if (tipo) {
            query += ' AND hv.tipo_validacion = ?';
            params.push(tipo);
        }
        
        if (fecha) {
            query += ' AND DATE(hv.fecha_validacion) = ?';
            params.push(fecha);
        }
        
        query += ' ORDER BY hv.fecha_validacion DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limite), parseInt(offset));
        
        const [validaciones] = await pool.query(query, params);
        
        // Contar total para paginacion
        const [countResult] = await pool.query(
            'SELECT COUNT(*) as total FROM historial_validaciones'
        );
        
        res.json({
            success: true,
            validaciones,
            total: countResult[0].total,
            pagina: parseInt(pagina),
            totalPaginas: Math.ceil(countResult[0].total / limite)
        });
        
    } catch (error) {
        console.error('Error obteniendo validaciones:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener historial de validaciones'
        });
    }
});


router.get('/:id', verificarToken, async (req, res) => {
    try {
        const [validaciones] = await pool.query(`
            SELECT 
                hv.*,
                ae.nombre_original as archivo_nombre,
                u.nombre_completo as usuario_nombre
            FROM historial_validaciones hv
            LEFT JOIN archivos_excel ae ON hv.archivo_id = ae.id
            LEFT JOIN usuarios u ON hv.usuario_id = u.id
            WHERE hv.id = ?
        `, [req.params.id]);
        
        if (validaciones.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Validacion no encontrada'
            });
        }
        
        res.json({
            success: true,
            validacion: validaciones[0]
        });
        
    } catch (error) {
        console.error('Error obteniendo validacion:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener validacion'
        });
    }
});


router.post('/', verificarToken, async (req, res) => {
    try {

        const {
            archivo_id = null,
            tipo_validacion = 'conceptos',
            resultado = 'exitoso',
            total_errores = 0,
            detalle_errores = null,
            duracion_segundos = null
        } = req.body;

        console.log('================================');
        console.log('NUEVA VALIDACION');
        console.log({
            archivo_id,
            usuario_id: req.usuario.id,
            tipo_validacion,
            resultado,
            total_errores,
            detalle_errores,
            duracion_segundos
        });

        const [result] = await pool.query(`
            INSERT INTO historial_validaciones (
                archivo_id,
                usuario_id,
                tipo_validacion,
                resultado,
                total_errores,
                detalle_errores,
                duracion_segundos
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            archivo_id,
            req.usuario.id,
            tipo_validacion,
            resultado,
            total_errores,
            typeof detalle_errores === 'string'
                ? detalle_errores
                : JSON.stringify(detalle_errores || {}),
            duracion_segundos
        ]);

        console.log('VALIDACION GUARDADA');
        console.log('INSERT ID:', result.insertId);

        // Actualizar estado del archivo
        if (archivo_id) {

            let nuevoEstado = 'pendiente';

            if (resultado === 'exitoso') {
                nuevoEstado = 'validado';
            } else if (
                resultado === 'con_errores' ||
                resultado === 'con_advertencias'
            ) {
                nuevoEstado = 'con_errores';
            }

            await pool.query(
                'UPDATE archivos_excel SET estado = ? WHERE id = ?',
                [nuevoEstado, archivo_id]
            );

            console.log(
                'ARCHIVO ACTUALIZADO',
                archivo_id,
                nuevoEstado
            );
        }

        console.log('================================');

        return res.status(201).json({
            success: true,
            message: 'Validacion registrada',
            id: result.insertId
        });

    } catch (dbError) {

        console.error('================================');
        console.error('ERROR GUARDANDO VALIDACION');
        console.error('MESSAGE:', dbError.message);
        console.error('CODE:', dbError.code);
        console.error('SQLSTATE:', dbError.sqlState);
        console.error('ERRNO:', dbError.errno);
        console.error('SQL:', dbError.sql);
        console.error(dbError);
        console.error('================================');

        return res.status(500).json({
            success: false,
            message: 'Error al guardar validacion',
            error: dbError.message,
            code: dbError.code,
            sqlState: dbError.sqlState,
            errno: dbError.errno
        });
    }
});

router.get('/stats/resumen', verificarToken, async (req, res) => {
    try {
        const [stats] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN resultado = 'exitoso' THEN 1 ELSE 0 END) as exitosas,
                SUM(CASE WHEN resultado = 'con_errores' THEN 1 ELSE 0 END) as con_errores,
                SUM(CASE WHEN resultado = 'fallido' THEN 1 ELSE 0 END) as fallidas,
                AVG(duracion_segundos) as tiempo_promedio
            FROM historial_validaciones
        `);
        
        res.json({
            success: true,
            estadisticas: stats[0]
        });
        
    } catch (error) {
        console.error('Error obteniendo estadisticas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadisticas'
        });
    }
});

module.exports = router;
