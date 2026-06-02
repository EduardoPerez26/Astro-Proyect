# 📋 Instrucciones de Instalación - Sistema de Permisos Mejorado

## ⚠️ IMPORTANTE: Actualización de Base de Datos Requerida

El nuevo sistema de permisos requiere que actualices tu base de datos MySQL. Hay errores 500 porque las nuevas tablas y campos no existen en tu base de datos actual.

---

## 🔄 Opción 1: Actualizar Base de Datos Existente (Recomendado)

Si ya tienes el sistema funcionando y quieres mantener tus datos actuales:

### Paso 1: Ejecutar Script de Actualización

```bash
# Conéctate a MySQL
mysql -u root -p

# Selecciona la base de datos
USE excel_validator;

# Ejecuta el script de actualización
source update_permissions_schema.sql;
```

O en una sola línea desde la terminal:

```bash
mysql -u root -p excel_validator < update_permissions_schema.sql
```

### Paso 2: Reiniciar el Servidor Backend

```bash
# Detener el servidor (Ctrl+C si está corriendo)
# Luego iniciar nuevamente
cd backend
npm start
# o
node server.js
```

### Paso 3: Verificar Instalación

1. Inicia sesión como admin
2. Navega a la página de "Permisos" en el dashboard
3. Deberías ver:
   - 4 tarjetas de estadísticas en la parte superior
   - Panel izquierdo con permisos agrupados por categorías
   - Panel derecho con selector de roles
   - Formulario para crear nuevos permisos
   - Historial de cambios

---

## 🆕 Opción 2: Nueva Instalación (Base de Datos Limpia)

Si estás comenzando desde cero o quieres reinstalar todo:

### Paso 1: Eliminar Base de Datos Existente (Opcional)

```sql
DROP DATABASE IF EXISTS excel_validator;
```

### Paso 2: Ejecutar Schema Completo

```bash
mysql -u root -p < schema.sql
```

### Paso 3: Reiniciar Backend

```bash
cd backend
npm start
```

---

## 🛠️ Solución de Problemas

### Error: "Table 'excel_validator.categorias_permisos' doesn't exist"

**Causa:** No ejecutaste el script de actualización.

**Solución:**
```bash
mysql -u root -p excel_validator < update_permissions_schema.sql
```

### Error: "Column 'categoria_id' not found"

**Causa:** La tabla `permisos` no tiene las nuevas columnas.

**Solución:** Ejecutar el script de actualización (ver arriba).

### Error 500 en las APIs

**Causa:** El backend está intentando consultar tablas/columnas que no existen.

**Solución:**
1. Verificar que el script de actualización se ejecutó correctamente
2. Reiniciar el servidor backend
3. Verificar logs del backend para más detalles

### Permisos no se muestran

**Causa:** Posiblemente los permisos no tienen categoría asignada.

**Solución:**
```sql
-- Verificar permisos existentes
SELECT * FROM permisos;

-- Si están vacíos, insertar permisos por defecto
-- (El script de actualización ya lo hace automáticamente)
```

---

## 📊 Verificación Post-Instalación

Ejecuta estas consultas para verificar que todo esté correcto:

```sql
-- Ver categorías
SELECT COUNT(*) as total_categorias FROM categorias_permisos WHERE activo = TRUE;

-- Ver permisos
SELECT COUNT(*) as total_permisos FROM permisos WHERE activo = TRUE;

-- Ver permisos por categoría
SELECT c.nombre as categoria, COUNT(p.id) as total_permisos
FROM categorias_permisos c
LEFT JOIN permisos p ON p.categoria_id = c.id
GROUP BY c.id, c.nombre
ORDER BY c.orden;

-- Ver historial (debería estar vacío al inicio)
SELECT COUNT(*) as total_registros FROM historial_permisos;
```

**Resultados esperados:**
- `total_categorias`: 6
- `total_permisos`: 18 (7 existentes + 11 nuevos)
- Distribución por categoría:
  - dashboard: 2
  - archivos: 5
  - validaciones: 3
  - tiendas: 2
  - usuarios: 3
  - configuracion: 2
- `total_registros` en historial: 0 (o más si ya hiciste cambios)

---

## 🔒 Permisos por Defecto

Después de la instalación, estos son los permisos asignados a cada rol:

### Rol: admin
- Todos los permisos (implícito)

### Rol: supervisor
- `view_dashboard` - Ver el dashboard principal
- `view_archivos` - Ver lista de archivos
- `view_validaciones` - Ver historial de validaciones
- `validate_files` - Ejecutar validaciones de archivos
- `view_tiendas` - Ver tiendas/restaurantes

### Rol: usuario
- `upload_files` - Subir archivos Excel
- `view_archivos` - Ver lista de archivos

---

## 📝 Notas Importantes

1. **Backup:** Siempre haz un backup de tu base de datos antes de actualizar
2. **Mantenimiento:** Los permisos existentes se actualizan automáticamente
3. **Compatibilidad:** El sistema es compatible con instalaciones anteriores
4. **Reinicio:** Es necesario reiniciar el backend después de actualizar la BD

---

## 🆘 Soporte

Si tienes problemas:

1. Revisa los logs del backend: `backend/logs/` o la consola
2. Verifica que MySQL esté corriendo
3. Confirma que el usuario de BD tenga permisos suficientes
4. Ejecuta las consultas de verificación (ver arriba)

---

**Fecha de última actualización:** 02/06/2026  
**Versión del sistema de permisos:** 2.0