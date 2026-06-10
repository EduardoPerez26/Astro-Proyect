# Astro Excel Validator

Proyecto dividido en dos partes independientes:

```
.
├── frontend/   # Aplicación Astro (UI, páginas, componentes, JS público)
└── backend/    # API Express + MySQL (rutas, middleware, SQL, scripts)
```

## Frontend (Astro)

Ubicado en `frontend/`. Contiene `src/` (páginas, layouts, componentes),
`public/` (JS y estilos servidos al navegador) y la configuración de Astro.

```bash
cd frontend
npm install
npm run dev      # http://localhost:4321
npm run build
npm run preview
```

La URL de la API se configura en `frontend/public/js/config.js`.

## Backend (Express)

Ubicado en `backend/`. Contiene el servidor Express, rutas, middleware,
los esquemas SQL (`schema.sql`, `fix_permissions_schema.sql`,
`update_permissions_schema.sql`) y utilidades como `hash.js`.

```bash
cd backend
npm install
npm run dev      # http://localhost:3001 (nodemon)
npm start
```

El backend habilita CORS para el origen del frontend (`http://localhost:4321`).
