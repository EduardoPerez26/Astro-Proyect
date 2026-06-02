// ============================================
// SERVIDOR PRINCIPAL - EXPRESS
// ============================================
// Este archivo es el punto de entrada del backend.
// Configura Express, middlewares y rutas.
// ============================================

// Cargar variables de entorno desde .env
require('dotenv').config();

// Importar dependencias
const express = require('express');
const cors = require('cors');
const path = require('path');

// Importar rutas
const authRoutes = require('./routes/auth.routes');
const archivosRoutes = require('./routes/archivos.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const restaurantesRoutes = require('./routes/restaurantes.routes');
const permissionsRoutes = require('./routes/permissions.routes');
const statsRoutes = require('./routes/stats.routes');

// Crear aplicacion Express
const app = express();

// ============================================
// MIDDLEWARES
// ============================================

// CORS: Permite peticiones desde el frontend (localhost:4321 para Astro)
app.use(cors({
    origin: [
        'http://localhost:4321',
        'http://localhost:4322',
        'http://localhost:3000',
        'http://127.0.0.1:4321',
        'http://127.0.0.1:4322'
    ],
    credentials: true
}));

// Parsear JSON en el body de las peticiones
app.use(express.json());

// Parsear datos de formularios
app.use(express.urlencoded({ extended: true }));

// Servir archivos estaticos de la carpeta uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================
// RUTAS DE LA API
// ============================================

// Ruta de prueba para verificar que el servidor funciona
app.get('/api', (req, res) => {
    res.json({
        mensaje: 'API del Sistema de Validacion de Excel',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            archivos: '/api/archivos',
            usuarios: '/api/usuarios',
            restaurantes: '/api/restaurantes'
        }
    });
});

// Montar las rutas
app.use('/api/auth', authRoutes);
app.use('/api/archivos', archivosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/restaurantes', restaurantesRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/stats', statsRoutes);

// ============================================
// MANEJO DE ERRORES
// ============================================

// Ruta no encontrada (404)
app.use((req, res, next) => {
    res.status(404).json({
        error: true,
        mensaje: 'Ruta no encontrada',
        ruta: req.originalUrl
    });
});

// Errores generales (500)
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: true,
        mensaje: 'Error interno del servidor',
        detalle: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('============================================');
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`API disponible en http://localhost:${PORT}/api`);
    console.log('============================================');
});
