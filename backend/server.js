// ============================================
// SERVIDOR PRINCIPAL - EXPRESS
// ============================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// Rutas
const authRoutes = require('./routes/auth.routes');
const archivosRoutes = require('./routes/archivos.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const restaurantesRoutes = require('./routes/restaurantes.routes');
const validacionesRoutes = require('./routes/validaciones.routes');
const conciliacionesRoutes = require('./routes/conciliaciones.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const departamentosRoutes = require('./routes/departamentos.routes');
const comparacionesRoutes = require('./routes/comparaciones.routes');
const taxRatesRoutes = require('./routes/taxRates.routes');

const app = express();

// ============================================
// MIDDLEWARES
// ============================================

const allowedOrigins = [
    'https://astro-proyect-akfs.vercel.app',
    'https://astro-proyect-tau.vercel.app',
    ...(process.env.FRONTEND_ORIGINS || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean)
];

// CORS
app.use(cors({
    origin(origin, callback) {
        const isLocal = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(
            origin || ''
        );

        if (!origin || isLocal || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error('Origen no permitido por CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Para preflight requests
app.options('*', cors());

// Parsear JSON y urlencoded
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({
    extended: true,
    limit: '10mb'
}));

// Archivos estáticos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================
// RUTAS DE LA API
// ============================================

app.get('/api', (req, res) => {
    res.json({
        mensaje: 'API del Sistema de Validacion de Excel',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            archivos: '/api/archivos',
            usuarios: '/api/usuarios',
            restaurantes: '/api/restaurantes',
            validaciones: '/api/validaciones',
            conciliaciones: '/api/conciliaciones',
            dashboard: '/api/dashboard/resumen'
        }
    });
});

// Montar rutas
app.use('/api/auth', authRoutes);
app.use('/api/archivos', archivosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/restaurantes', restaurantesRoutes);
app.use('/api/validaciones', validacionesRoutes);
app.use('/api/conciliaciones', conciliacionesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/departamentos', departamentosRoutes);
app.use('/api/comparaciones', comparacionesRoutes);
app.use('/api/tax-rates', taxRatesRoutes);

// ============================================
// MANEJO DE ERRORES
// ============================================

// Ruta no encontrada
app.use((req, res, next) => {
    res.status(404).json({
        error: true,
        mensaje: 'Ruta no encontrada',
        ruta: req.originalUrl
    });
});

// Errores generales
app.use((err, req, res, next) => {
    console.error('Error:', err);
    const status = Number(err.status || err.statusCode) || 500;
    const esContenidoGrande = status === 413 || err.type === 'entity.too.large';

    res.status(status).json({
        error: true,
        mensaje: esContenidoGrande
            ? 'La conciliación contiene demasiados datos para enviarse al servidor'
            : 'Error interno del servidor',
        code: err.code || err.type || 'INTERNAL_SERVER_ERROR',
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
