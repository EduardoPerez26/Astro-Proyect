
// ============================================
// SERVIDOR PRINCIPAL - EXPRESS
// ============================================

const express = require('express');
const cors = require('cors');
const path = require('path');

require('dotenv').config({
    path: path.join(__dirname, '.env')
});

const {
    getConfigurationStatus,
    validateEnvironment
} = require('./config/env.validation');

validateEnvironment();

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
const propertyManagementRoutes = require('./routes/propertyManagement.routes');
const chatRoutes = require('./routes/chat.routes');
const chatbotRoutes = require('./routes/chatbot.routes');
const notificacionesRoutes = require('./routes/notificaciones.routes');
const prepaidRoutes = require('./routes/prepaid.routes');
const { attachErrorNotificationCapture } = require('./middleware/error-notification.middleware');

const app = express();
app.disable('x-powered-by');
const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || '10mb';
const uploadRoot = process.env.UPLOAD_FOLDER
    ? path.resolve(__dirname, process.env.UPLOAD_FOLDER)
    : path.join(__dirname, 'uploads');

// Captures 5xx / critical backend errors and notifies administrators.
app.use(attachErrorNotificationCapture());

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

        callback(new Error('Origin is not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Preflight requests
app.options('*', cors());

app.use((req, res, next) => {
    const isProduction = process.env.NODE_ENV === 'production';

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), payment=()'
    );
    res.setHeader(
        'Cache-Control',
        req.path.startsWith('/api/auth')
            ? 'no-store'
            : 'private, max-age=0, must-revalidate'
    );

    if (isProduction) {
        res.setHeader(
            'Strict-Transport-Security',
            'max-age=15552000; includeSubDomains'
        );
    }

    next();
});

// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: requestBodyLimit }));
app.use(express.urlencoded({
    extended: true,
    limit: requestBodyLimit
}));

// Static files
app.use('/uploads', express.static(uploadRoot));

// ============================================
// RUTAS DE LA API
// ============================================

app.get('/api', (req, res) => {
    res.json({
        mensaje: 'Excel Validation System API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            archivos: '/api/archivos',
            usuarios: '/api/usuarios',
            restaurantes: '/api/restaurantes',
            validaciones: '/api/validaciones',
            conciliaciones: '/api/conciliaciones',
            dashboard: '/api/dashboard/resumen',
            propertyManagement: '/api/property-management',
            chat: '/api/chat',
            chatbot: '/api/chatbot',
            notificaciones: '/api/notificaciones',
            systemErrors: '/api/notificaciones/system-errors',
            prepaids: '/api/prepaids'
        }
    });
});

app.get('/api/health', (req, res) => {
    const config = getConfigurationStatus();

    res.status(config.ok ? 200 : 503).json({
        success: config.ok,
        status: config.ok ? 'ok' : 'configuration_attention',
        service: 'XBFS Operations Hub API',
        timestamp: new Date().toISOString()
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
app.use('/api/property-management', propertyManagementRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/notificaciones', notificacionesRoutes);
app.use('/api/prepaids', prepaidRoutes);


// ============================================
// MANEJO DE ERRORES
// ============================================

// Route not found
app.use((req, res, next) => {
    res.status(404).json({
        error: true,
        mensaje: 'Route not found',
        ruta: req.originalUrl
    });
});

// General errors
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.locals.errorForAdmin = err;

    const status = Number(err.status || err.statusCode) || 500;
    const esContenidoGrande = status === 413 || err.type === 'entity.too.large';

    res.status(status).json({
        error: true,
        mensaje: esContenidoGrande
            ? 'The reconciliation contains too much data to send to the server'
            : 'Internal server error',
        code: err.code || err.type || 'INTERNAL_SERVER_ERROR',
        detalle: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log('============================================');
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
    console.log('============================================');
});
