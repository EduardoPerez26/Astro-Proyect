const crypto = require('crypto');
const { pool } = require('../config/database');

function obtenerHuella(datos) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(datos || []))
        .digest('hex');
}

function aNumero(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : null;
}

function aplanarDiferencias(resultado, fechaOperacion) {
    return (resultado?.diferencias || []).flatMap(diferencia => {
        if (diferencia.tipo !== 'montos_diferentes') {
            return [{
                tienda: diferencia.tienda || 'Sin tienda',
                fechaOperacion: diferencia.fecha || fechaOperacion,
                tipo: diferencia.tipo,
                campo: null,
                anterior: null,
                nuevo: null,
                diferencia: null
            }];
        }

        return (diferencia.cambios || []).map(cambio => ({
            tienda: diferencia.tienda || 'Sin tienda',
            fechaOperacion: diferencia.fecha || fechaOperacion,
            tipo: diferencia.tipo,
            campo: cambio.campo,
            anterior: aNumero(cambio.anterior),
            nuevo: aNumero(cambio.nuevo),
            diferencia: aNumero(cambio.diferencia)
        }));
    });
}

async function registrarComparacion({
    restauranteId,
    usuarioId,
    departamentoId = null,
    archivoReferenciaId = null,
    conciliacionReferenciaId = null,
    fechaOperacion,
    estado,
    datosNuevos,
    resultado
}) {
    const detalles = aplanarDiferencias(resultado, fechaOperacion);
    const montoAbsoluto = detalles.reduce(
        (total, detalle) => total + Math.abs(detalle.diferencia || 0),
        0
    );
    const huellaDatos = obtenerHuella(datosNuevos);
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [existentes] = await connection.query(
            `SELECT id
             FROM comparaciones_archivos
             WHERE restaurante_id = ?
               AND fecha_operacion = ?
               AND estado = ?
               AND huella_datos = ?
             ORDER BY id DESC
             LIMIT 1
             FOR UPDATE`,
            [restauranteId, fechaOperacion, estado, huellaDatos]
        );

        if (existentes.length) {
            await connection.commit();
            return existentes[0].id;
        }

        let registro;
        const parametrosRegistro = [
            restauranteId,
            usuarioId || null,
            departamentoId || null,
            archivoReferenciaId || null,
            conciliacionReferenciaId || null,
            fechaOperacion,
            estado,
            Number(resultado?.tiendasComparadas || 0),
            Number(resultado?.tiendasConDiferencias || 0),
            detalles.length,
            montoAbsoluto,
            huellaDatos,
            JSON.stringify({
                existeReferencia: Boolean(
                    archivoReferenciaId || conciliacionReferenciaId
                ),
                estado
            })
        ];

        try {
            [registro] = await connection.query(
                `INSERT INTO comparaciones_archivos
                 (restaurante_id, usuario_id, departamento_id, archivo_referencia_id, conciliacion_id,
                  fecha_operacion, estado, tiendas_comparadas,
                  tiendas_con_diferencias, total_diferencias,
                  monto_diferencia_absoluta, huella_datos, resumen)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                parametrosRegistro
            );
        } catch (error) {
            if (error.code !== 'ER_BAD_FIELD_ERROR') throw error;

            [registro] = await connection.query(
                `INSERT INTO comparaciones_archivos
                 (restaurante_id, usuario_id, archivo_referencia_id, conciliacion_id,
                  fecha_operacion, estado, tiendas_comparadas,
                  tiendas_con_diferencias, total_diferencias,
                  monto_diferencia_absoluta, huella_datos, resumen)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    restauranteId,
                    usuarioId || null,
                    archivoReferenciaId || null,
                    conciliacionReferenciaId || null,
                    fechaOperacion,
                    estado,
                    Number(resultado?.tiendasComparadas || 0),
                    Number(resultado?.tiendasConDiferencias || 0),
                    detalles.length,
                    montoAbsoluto,
                    huellaDatos,
                    JSON.stringify({
                        existeReferencia: Boolean(
                            archivoReferenciaId || conciliacionReferenciaId
                        ),
                        estado
                    })
                ]
            );
        }

        for (let inicio = 0; inicio < detalles.length; inicio += 400) {
            const lote = detalles.slice(inicio, inicio + 400);
            const marcadores = lote.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
            const parametros = lote.flatMap(detalle => [
                registro.insertId,
                detalle.tienda,
                detalle.fechaOperacion,
                detalle.tipo,
                detalle.campo,
                detalle.anterior,
                detalle.nuevo,
                detalle.diferencia
            ]);

            await connection.query(
                `INSERT INTO comparacion_diferencias
                 (comparacion_id, tienda, fecha_operacion, tipo, campo,
                  valor_anterior, valor_nuevo, diferencia)
                 VALUES ${marcadores}`,
                parametros
            );
        }

        await connection.commit();
        return registro.insertId;
    } catch (error) {
        if (connection) await connection.rollback();
        if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) {
            console.warn('Historial de comparaciones no instalado:', error.code);
            return null;
        }
        throw error;
    } finally {
        if (connection) connection.release();
    }
}

async function vincularComparacion(comparacionId, conciliacionId, usuarioId) {
    if (!comparacionId || !conciliacionId) return;

    try {
        await pool.query(
            `UPDATE comparaciones_archivos
             SET conciliacion_id = ?
             WHERE id = ? AND (usuario_id = ? OR usuario_id IS NULL)`,
            [conciliacionId, comparacionId, usuarioId || null]
        );
    } catch (error) {
        if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) {
            throw error;
        }
    }
}

module.exports = {
    registrarComparacion,
    vincularComparacion
};
