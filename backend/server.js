
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
const corporateRoutes = require('./routes/corporate.routes');
const { checkAllIntegrations } = require('./services/integrationHealth.service');
const { attachErrorNotificationCapture } = require('./middleware/error-notification.middleware');
const {
    requestContext,
    securityHeaders,
    sanitizeRequest,
    createRateLimiter,
    csrfOriginGuard,
    uploadStaticHeaders
} = require('./middleware/security.middleware');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || '10mb';
const uploadRoot = process.env.UPLOAD_FOLDER
    ? path.resolve(__dirname, process.env.UPLOAD_FOLDER)
    : path.join(__dirname, 'uploads');

// Corporate request context and baseline HTTP security.
app.use(requestContext);
app.use(securityHeaders);

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

// CORS must run before rate limiting: a 429 (or any other) response still
// needs Access-Control-Allow-Origin, or the browser reports it as a CORS
// failure instead of the real "too many requests" error.
const corsMiddleware = cors({
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
});

app.use(corsMiddleware);
app.options('*', corsMiddleware);

app.use(createRateLimiter({
    windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.API_RATE_LIMIT_MAX || 600),
    keyPrefix: 'api',
    skip: req => req.path === '/api/health'
}));
app.use('/api/auth', createRateLimiter({
    windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.AUTH_RATE_LIMIT_MAX || 40),
    keyPrefix: 'auth',
    message: 'Too many authentication requests. Wait a few minutes and try again.'
}));

// Captures 5xx / critical backend errors and notifies administrators.
app.use(attachErrorNotificationCapture());

// Protect state-changing cookie-authenticated requests from CSRF.
app.use('/api', csrfOriginGuard);

// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: requestBodyLimit }));
app.use(express.urlencoded({
    extended: true,
    limit: requestBodyLimit
}));
app.use(sanitizeRequest);

// Static files
app.use('/uploads', express.static(uploadRoot, {
    dotfiles: 'deny',
    fallthrough: false,
    setHeaders: uploadStaticHeaders
}));

// ============================================
// RUTAS DE LA API
// ============================================

app.get('/api', (req, res) => {
    res.json({
        mensaje: 'Excel Validation System API',
        version: '2.0.0',
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
            prepaids: '/api/prepaids',
            corporate: '/api/corporate',
            integrations: '/api/corporate/integrations/health',
            audit: '/api/corporate/audit'
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
app.use('/api/corporate', corporateRoutes);


// ============================================
// MANEJO DE ERRORES
// ============================================

// Route not found
app.use((req, res, next) => {
    res.status(404).json({
        error: true,
        mensaje: 'Route not found',
        ruta: req.originalUrl,
        request_id: req.requestId || null
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
        detalle: process.env.NODE_ENV === 'development' ? err.message : undefined,
        request_id: req.requestId || null
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
    console.log('============================================');
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
    console.log('============================================');
});

// Keeps integration latency history populated even when nobody has System Center open.
const INTEGRATION_HEARTBEAT_MS = 5 * 60 * 1000;
const integrationHeartbeat = setInterval(() => {
    checkAllIntegrations().catch(error => {
        console.warn('[heartbeat] Integration health check failed:', error.message);
    });
}, INTEGRATION_HEARTBEAT_MS);
integrationHeartbeat.unref();


function shutdown(signal) {
    console.log(`[shutdown] ${signal} received. Closing HTTP server.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
