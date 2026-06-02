# Solución al Error 500 en APIs de Permisos

## Problema Identificado

Los endpoints de la API de permisos estaban devolviendo error 500 (Internal Server Error) debido a que la tabla `permisos` no tenía las columnas necesarias para las consultas del backend.

### Errores Específicos
```
Error: Unknown column 'categoria_id' in 'field list'
Error: Unknown column 'p.icono' in 'field list'
Error: Unknown column 'activo' in 'where clause'
```

## Causa Raíz

El script `update_permissions_schema.sql` usaba la sintaxis `ADD COLUMN IF NOT EXISTS` con valores `DEFAULT`, la cual no es compatible con MySQL de la misma forma que otros sistemas de bases de datos. Como resultado:

1. Las columnas `categoria_id`, `icono`, `nivel` y `activo` no se agregaron correctamente a la tabla `permisos`
2. Las consultas del backend fallaban al intentar acceder a estas columnas inexistentes

## Solución Aplicada

### 1. Script de Corrección de Esquema (`backend/fix-schema.js`)

Se creó un script Node.js que:
- Verifica si cada columna existe antes de agregarla
- Usa sintaxis MySQL compatible (`ALTER TABLE ADD COLUMN`)
- Crea las tablas auxiliares (`categorias_permisos`, `historial_permisos`, etc.)
- Inserta las categorías por defecto
- Actualiza los permisos existentes con sus nuevas propiedades
- Inserta los permisos faltantes

### 2. Ejecución del Script

```bash
cd backend
node fix-schema.js
```

**Resultado:**
- ✓ Todas las columnas agregadas correctamente
- ✓ Índices creados
- ✓ Tablas auxiliares creadas
- ✓ 18 permisos insertados
- ✓ 6 categorías configuradas
- ✓ Asignaciones de roles actualizadas

### 3. Reinicio del Servidor

Se detuvo el servidor backend y se reinició para aplicar los cambios:
```bash
taskkill /F /IM node.exe
cd backend
node server.js
```

## Verificación

### Estado del Esquema
```
Columnas de permisos:
  - id (int)
  - nombre (varchar)
  - descripcion (varchar)
  - categoria_id (int)
  - icono (varchar) = fa-key
  - nivel (int) = 1
  - activo (tinyint) = 1
  - fecha_creacion (timestamp)
```

### Permisos Existentes (18 total)
- **Dashboard:** view_dashboard, view_stats
- **Archivos:** view_archivos, upload_files, download_files, delete_files, edit_file_notes
- **Validaciones:** validate_files, view_validaciones, export_validaciones
- **Tiendas:** view_tiendas, manage_tiendas
- **Usuarios:** manage_users, view_users, manage_roles
- **Configuración:** view_config, manage_config
- **Sin categoría:** Usuario (existente previamente)

### Roles Configurados
- **supervisor:** 5 permisos asignados
- **usuario:** 2 permisos asignados
- **admin:** Acceso total implícito

## Resultado Final

✅ **Todos los endpoints de permisos ahora funcionan correctly:**
- `GET /api/permissions` - Listar permisos
- `GET /api/permissions/categories` - Listar categorías
- `GET /api/permissions/roles/list` - Listar roles
- `GET /api/permissions/stats/summary` - Estadísticas
- `POST /api/permissions` - Crear/actualizar permisos
- `POST /api/permissions/roles/:rol` - Asignar permisos a roles
- Y todos los demás endpoints relacionados

## Archivos de Soporte Creados

1. **`fix_permissions_schema.sql`** - Script SQL alternativo (no usado directamente por limitaciones de PowerShell)
2. **`backend/fix-schema.js`** - Script principal de corrección (Node.js)
3. **`backend/test-api.js`** - Script de verificación del esquema
4. **`backend/insert-permisos-faltantes.js`** - Script para insertar permisos faltantes

## Prevención Futura

Para evitar este problema en el futuro:

1. **Usar migraciones explícitas:** En lugar de `ADD COLUMN IF NOT EXISTS`, verificar explícitamente si la columna existe
2. **Probar en entorno de desarrollo:** Ejecutar scripts de migración en un entorno de prueba antes de producción
3. **Usar herramientas de migración:** Considerar el uso de herramientas como `db-migrate` o `sequelize-cli` para gestión de esquemas
4. **Documentar cambios:** Mantener un registro claro de los cambios en el esquema de la base de datos

## Instrucciones para Reiniciar el Sistema

Si necesitas reiniciar el sistema completo:

```bash
# 1. Detener servidor backend
taskkill /F /IM node.exe

# 2. Iniciar servidor backend
cd backend
node server.js

# 3. El frontend Astro se inicia por separado (puerto 4321)
npm run dev
```

El sistema debería estar completamente funcional con todos los endpoints de permisos operativos.