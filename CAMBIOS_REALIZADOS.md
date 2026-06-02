# Cambios Realizados - Sistema de Permisos y Usuarios

## Resumen

Se han realizado las siguientes mejoras al sistema:

### 1. Corrección del EsqueMA de Base de Datos (`update_permissions_schema.sql`)

El script SQL fue actualizado para ser compatible con MySQL usando verificaciones dinámicas:

- **Tablas creadas:**
  - `categorias_permisos` - Categorías para agrupar permisos
  - `historial_permisos` - Auditoría de cambios en permisos
  - `permisos_usuario_excepcion` - Excepciones de permisos por usuario

- **Columnas agregadas a `permisos`:**
  - `categoria_id` - Relación con categorías
  - `icono` - Icono de FontAwesome
  - `nivel` - Nivel de acceso (1=básico, 2=intermedio, 3=avanzado)
  - `activo` - Estado del permiso

- **Datos iniciales:**
  - 6 categorías (dashboard, archivos, validaciones, tiendas, usuarios, configuracion)
  - 17 permisos con descripciones, iconos y niveles actualizados

### 2. Rediseño de la Interfaz de Permisos (`src/pages/views/permisos.astro`)

**Nueva interfaz moderna con:**

- **Header mejorado:** Icono grande con gradiente, título y subtítulo descriptivo
- **Tarjetas de estadísticas:** Diseño con borde de color lateral, iconos más grandes, tendencias
- **Panel de permisos:** Búsqueda en tiempo real, filtro por categoría, diseño de tarjetas colapsables
- **Panel de roles:** Selector estilizado, tarjeta de información del rol, matriz de permisos con checkboxes
- **Formulario de creación:** Grid de 3 columnas, iconos con emoji en el selector, preview del icono
- **Historial:** Línea de tiempo vertical con iconos de colores por tipo de acción
- **Modal para usuarios:** Diseño moderno con backdrop blur, animación de entrada

**Nueva sección de Usuarios:**

- Tabla moderna con avatares, badges de rol y estado
- Botones de acción (editar, activar/desactivar)
- Estadísticas de usuarios en la parte superior
- Modal para crear nuevos usuarios con validación

### 3. JavaScript Actualizado (`public/js/permissions.js`)

- Búsqueda en tiempo real con debounce
- Renderizado con nuevas clases CSS modernas
- Función de exportación de permisos
- Preview de icono al seleccionar
- Toast notifications en lugar de alertas grandes

### 4. Nuevo JavaScript para Usuarios (`public/js/users.js`)

- **Funcionalidades:**
  - Cargar y mostrar usuarios en tabla
  - Búsqueda en tiempo real
  - Filtro por rol
  - Crear nuevo usuario con validación
  - Activar/desactivar usuarios
  - Estadísticas de usuarios
  - Modal con validaciones

### 5. Backend Actualizado (`backend/routes/usuarios.routes.js`)

**Nuevas rutas agregadas:**

- `GET /api/usuarios/stats` - Estadísticas de usuarios
- `POST /api/usuarios` - Crear nuevo usuario (con validaciones)
- `PATCH /api/usuarios/:id/status` - Cambiar estado de usuario

**Mejoras:**
- Validación de roles válidos
- Verificación de username/email duplicados
- Hash de contraseña con bcrypt
- Transacciones para consistencia de datos

---

## Instrucciones de Instalación

### 1. Ejecutar el Script SQL

```sql
-- En MySQL Workbench o phpMyAdmin:
source update_permissions_schema.sql;
-- O copiar y pegar el contenido del archivo
```

### 2. Reiniciar el Servidor Backend

```bash
cd backend
npm install  # Si hay nuevas dependencias
node server.js
```

### 3. Reiniciar el Servidor de Astro

```bash
npm run dev
```

### 4. Acceder a la Página de Permisos

- URL: `http://localhost:4321/views/permisos`
- Solo administradores pueden acceder

---

## Estructura de la Página de Permisos

```
┌─────────────────────────────────────────────────────────────┐
│  🛡️  Gestión de Permisos                                    │
│     Administra permisos, roles y asignaciones...    [Actualizar] │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐│
│  │ 🔑 17       │ │ 📁 6        │ │ 👮 3        │ │ 🔗 24   ││
│  │ Permisos    │ │ Categorías  │ │ Roles       │ │ Asign.  ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘│
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────┐ ┌─────────────────────────┐│
│  │ 📂 Permisos del Sistema     │ │ 👤 Asignación de Roles  ││
│  │ [🔍 Buscar...] [Filtro ▼]   │ │ Seleccionar Rol: [▼]    ││
│  │                             │ │                         ││
│  │ ┌─ 📊 Dashboard (3) ──────┐ │ │ ┌─ admin ────────────┐ ││
│  │ │  view_dashboard    N1    │ │ │ │ ☑ view_dashboard   │ ││
│  │ │  view_stats        N2    │ │ │ │ ☑ view_stats       │ ││
│  │ └─────────────────────────┘ │ │ │ ☑ manage_users     │ ││
│  │                             │ │ └────────────────────┘ ││
│  │ ┌─ 📁 Archivos (5) ───────┐ │ │ [💾 Guardar Cambios]  ││
│  │ │  view_archivos     N1    │ │ │                       ││
│  │ │  upload_files      N1    │ │ │                       ││
│  │ │  download_files    N2    │ │ │                       ││
│  │ └─────────────────────────┘ │ │                       ││
│  └─────────────────────────────┴─────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────┐ ┌─────────────────────────┐│
│  │ ➕ Crear Nuevo Permiso      │ │ 🕐 Historial de Cambios ││
│  │ [Formulario...]             │ │ • Admin Creó view_x    ││
│  │                             │ │ • Admin Asignó admin   ││
│  │ [Crear] [Limpiar]           │ │ • Admin Modificó perm  ││
│  └─────────────────────────────┘ └─────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## Estructura de la Sección de Usuarios

```
┌─────────────────────────────────────────────────────────────┐
│  👥  Gestión de Usuarios                                    │
│     Administra usuarios, roles y estados...    [+ Nuevo Usuario]│
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐│
│  │ 👥 5        │ │ ✅ 4        │ │ 👮 2        │ │ 📅 15 Jun││
│  │ Usuarios    │ │ Activos     │ │ Admins      │ │ Últ. Reg││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘│
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 📋 Listado de Usuarios                                  ││
│  │ [🔍 Buscar...] [Todos los roles ▼]                      ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ Usuario  │ Nombre     │ Email           │ Rol  │ Estado ││
│  │ 👤 admin │ Admin      │ admin@...       │ Admin│ ✅ Act ││
│  │ 👤 ed    │ Eduardo    │ edu@...         │ Admin│ ✅ Act ││
│  │ 👤 juan  │ Juan P.    │ juan@...        │ User │ ⭕ Ina ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Permisos
- `GET /api/permissions` - Listar permisos
- `GET /api/permissions/categories` - Listar categorías
- `POST /api/permissions` - Crear permiso
- `DELETE /api/permissions/:nombre` - Eliminar permiso
- `GET /api/permissions/roles/list` - Listar roles
- `GET /api/permissions/roles/:rol` - Ver permisos de un rol
- `POST /api/permissions/roles/:rol` - Asignar permisos a rol
- `GET /api/permissions/stats/summary` - Estadísticas
- `GET /api/permissions/history` - Historial de cambios

### Usuarios
- `GET /api/usuarios` - Listar usuarios
- `GET /api/usuarios/stats` - Estadísticas de usuarios
- `POST /api/usuarios` - Crear usuario
- `GET /api/usuarios/:id` - Ver usuario
- `PUT /api/usuarios/:id` - Actualizar usuario
- `PATCH /api/usuarios/:id/status` - Cambiar estado
- `DELETE /api/usuarios/:id` - Desactivar usuario

---

## Notas Importantes

1. **Solo administradores** pueden acceder a estas páginas
2. Las contraseñas se guardan con hash bcrypt
3. El sistema valida username y email únicos
4. Los permisos se organizan en 6 categorías
5. Los roles disponibles son: admin, supervisor, usuario