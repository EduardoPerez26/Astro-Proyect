-- Elimina intentos duplicados ya registrados y evita que vuelvan a crearse.
-- Ejecutar después de 2026-06-20_historial_comparaciones.sql.

DELETE duplicada
FROM comparaciones_archivos duplicada
JOIN comparaciones_archivos original
  ON original.restaurante_id = duplicada.restaurante_id
 AND original.fecha_operacion = duplicada.fecha_operacion
 AND original.estado = duplicada.estado
 AND original.huella_datos = duplicada.huella_datos
 AND original.id < duplicada.id
WHERE duplicada.huella_datos IS NOT NULL;

SET @indice_existe = (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'comparaciones_archivos'
      AND index_name = 'uk_comparacion_huella'
);

SET @crear_indice = IF(
    @indice_existe = 0,
    'ALTER TABLE comparaciones_archivos ADD UNIQUE KEY uk_comparacion_huella (restaurante_id, fecha_operacion, estado, huella_datos)',
    'SELECT 1'
);

PREPARE sentencia FROM @crear_indice;
EXECUTE sentencia;
DEALLOCATE PREPARE sentencia;
