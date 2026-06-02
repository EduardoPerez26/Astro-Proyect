# 📋 Mejoras en el Sistema de Permisos y Roles

## 🎯 Resumen de Cambios

Se ha realizado una mejora completa del sistema de gestión de permisos y roles, incluyendo:

1. **Ampliación de la base de datos** con nuevas tablas y campos
2. **Rediseño completo de la interfaz** de la página de permisos
3. **Nuevas funcionalidades** en el backend
4. **Mejoras en la experiencia de usuario**

---

## 🗄️ Cambios en la Base de Datos

### Nuevas Tablas Creadas

#### 1. `categorias_permisos`
Agrupa los permisos por áreas funcionales del sistema.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INT | ID único (autoincremental) |
| nombre | VARCHAR(50) | Nombre de la categoría (único) |
| descripcion | VARCHAR(255) | Descripción de la categoría |
| icono | VARCHAR(50) | Icono de FontAwesome |
| color | VARCHAR(20) | Color CSS para la categoría |
| orden | INT | Orden de visualización |
| activo | BOOLEAN | Estado de la categoría |
| fecha_creacion | TIMESTAMP | Fecha de creación |

**Categorías por defecto:**
- `dashboard` - Permisos del dashboard
- `archivos` - Gestión de archivos Excel
- `validaciones` - Validaciones y reportes
- `tiendas` - Gestión de tiendas/restaurantes
- `usuarios` - Administración de usuarios
- `configuracion` - Configuración del sistema

#### 2. `historial_permisos`
Registro de auditoría de todos los cambios realizados en permisos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INT | ID único (autoincremental) |
| usuario_id | INT | Usuario que realizó la acción |
| accion | VARCHAR(50) | Tipo de acción (crear, modificar, eliminar, asignar) |
| tipo_objeto | VARCHAR(50) | Tipo de objeto (permiso, rol_permiso, categoria) |
| objeto_id | INT | ID del objeto afectado |
| objeto_nombre | VARCHAR(255) | Nombre del objeto afectado |
| detalles_anteriores | JSON | Estado anterior (para auditoría) |
| detalles_nuevos | JSON | Estado nuevo (para auditoría) |
| ip_address | VARCHAR(45) | IP del usuario |
| user_agent | VARCHAR(255) | Navegador del usuario |
| fecha_accion | TIMESTAMP | Fecha de la acción |

#### 3. `permisos_usuario_excepcion`
Permite asignar permisos especiales a usuarios individuales (excepciones al rol).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INT | ID único (autoincremental) |
| usuario_id | INT | Usuario de la excepción |
| permiso_nombre | VARCHAR(100) | Permiso afectado |
| tipo | ENUM | 'conceder' o 'denegar' |
| razon | VARCHAR(255) | Razón de la excepción |
| fecha_asignacion | TIMESTAMP | Fecha de asignación |
| fecha_expiracion | TIMESTAMP | Fecha de expiración (opcional) |
| activo | BOOLEAN | Estado de la excepción |

### Cambios en la Tabla `permisos`

Se agregaron los siguientes campos:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| categoria_id | INT | Relación con categoría |
| icono | VARCHAR(50) | Icono de FontAwesome |
| nivel | INT | Nivel del permiso (1=básico, 2=intermedio, 3=avanzado) |
| activo | BOOLEAN | Estado del permiso |

### Nuevos Permisos del Sistema

Se agregaron 11 nuevos permisos además de los 7 existentes:

**Dashboard:**
- `view_stats` - Ver estadísticas del sistema

**Archivos:**
- `download_files` - Descargar archivos Excel
- `delete_files` - Eliminar archivos Excel
- `edit_file_notes` - Editar notas de archivos

**Validaciones:**
- `export_validaciones` - Exportar reportes de validación

**Tiendas:**
- `manage_tiendas` - Gestionar tiendas (crear/editar)

**Usuarios:**
- `view_users` - Ver lista de usuarios
- `manage_roles` - Gestionar roles y permisos

**Configuración:**
- `view_config` - Ver configuración del sistema
- `manage_config` - Modificar configuración del sistema

---

## 🎨 Mejoras en la Interfaz

### Nueva Página de Permisos (`src/pages/views/permisos.astro`)

#### 1. Tarjetas de Estadísticas
- Total de permisos
- Total de categorías
- Total de roles
- Total de asignaciones

#### 2. Panel de Permisos por Categoría
- Visualización agrupada por categorías
- Iconos y colores distintivos
- Niveles de permiso (básico, intermedio, avanzado)
- Filtro por categoría
- Diseño moderno con hover effects

#### 3. Panel de Asignación de Roles
- Selector de roles mejorado
- Matriz de permisos organizada por categorías
- Checkboxes para asignar/quitar permisos
- Contador de permisos asignados
- Botón de guardado con feedback

#### 4. Formulario de Creación de Permisos
- Campos completos: nombre, descripción, categoría, icono, nivel
- Validación de formato (solo minúsculas y guiones bajos)
- Selector de iconos FontAwesome
- Selector de nivel de permiso

#### 5. Historial de Cambios
- Lista de últimas acciones
- Iconos por tipo de acción (crear, modificar, eliminar, asignar)
- Información de usuario y fecha
- Diseño limpio y legible

### Estilos CSS Mejorados

- **Stats Grid**: Diseño de cuadrícula responsive
- **Category Groups**: Agrupación visual con colores
- **Permission Items**: Tarjetas con iconos y badges
- **Role Permissions Matrix**: Matriz organizada por categorías
- **Formularios**: Inputs modernos con focus states
- **History List**: Timeline de actividades
- **Responsive Design**: Adaptado a móviles y tablets

---

## 🔧 Nuevas Funcionalidades del Backend

### Nuevas Rutas API (`backend/routes/permissions.routes.js`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/permissions` | Listar permisos (con filtros opcionales) |
| GET | `/api/permissions/categories` | Listar categorías de permisos |
| POST | `/api/permissions` | Crear/actualizar un permiso |
| DELETE | `/api/permissions/:nombre` | Eliminar un permiso |
| GET | `/api/permissions/roles/:rol` | Obtener permisos de un rol |
| POST | `/api/permissions/roles/:rol` | Asignar permisos a un rol |
| GET | `/api/permissions/roles/list` | Listar todos los roles disponibles |
| GET | `/api/permissions/stats/summary` | Obtener estadísticas de permisos |
| GET | `/api/permissions/history` | Obtener historial de cambios |

### Características del Backend

- **Auditoría completa**: Todas las acciones se registran en `historial_permisos`
- **Transacciones**: Uso de transacciones para consistencia de datos
- **Validación**: Verificación de existencia de permisos antes de asignar
- **Filtros**: Búsqueda por categoría y estado
- **Seguridad**: Todas las rutas requieren autenticación y rol de admin

---

## 📄 Archivos Modificados/Creados

### Archivos Modificados:
1. `schema.sql` - Esquema completo de la base de datos
2. `backend/routes/permissions.routes.js` - Rutas del backend
3. `src/pages/views/permisos.astro` - Página de permisos
4. `public/js/permissions.js` - Lógica del frontend

### Archivos Creados:
1. `update_permissions_schema.sql` - Script de actualización para bases de datos existentes
2. `CAMBIOS_PERMISOS.md` - Este archivo de documentación

---

## 🚀 Instrucciones de Instalación

### Para una nueva instalación:

1. Ejecutar el script `schema.sql` completo en MySQL:
```bash
mysql -u root -p < schema.sql
```

### Para actualizar una instalación existente:

1. Ejecutar el script de actualización:
```bash
mysql -u root -p excel_validator < update_permissions_schema.sql
```

2. Reiniciar el servidor backend:
```bash
cd backend
npm restart
# o
node server.js
```

3. Acceder a la página de permisos desde el dashboard

---

## 📊 Ejemplo de Uso

### Crear un nuevo permiso desde la interfaz:

1. Ir a la pestaña "Permisos" en el dashboard
2. En el formulario "Crear Nuevo Permiso":
   - Nombre: `export_reports` (solo minúsculas y guiones)
   - Descripción: `Exportar reportes en PDF`
   - Categoría: `validaciones`
   - Icono: `fa-file-pdf`
   - Nivel: `3 - Avanzado`
3. Hacer clic en "Crear Permiso"

### Asignar permisos a un rol:

1. En el panel derecho "Asignación de Roles"
2. Seleccionar un rol (admin, supervisor, usuario)
3. Marcar/desmarcar los permisos deseados
4. Hacer clic en "Guardar Cambios"

---

## 🔒 Consideraciones de Seguridad

- Solo usuarios con rol `admin` pueden acceder a esta página
- Todas las acciones quedan registradas en el historial
- Los permisos se validan en el backend antes de guardar
- Se usan transacciones para evitar inconsistencias

---

## 📝 Notas Adicionales

- Los permisos existentes se mantienen y se actualizan automáticamente
- Las nuevas categorías ayudan a organizar mejor los permisos
- El sistema de niveles permite identificar la criticidad de cada permiso
- El historial permite auditar todos los cambios realizados

---

**Fecha de actualización:** 02/06/2026  
**Versión:** 2.0