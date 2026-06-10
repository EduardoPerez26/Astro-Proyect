// middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'mi_secreto_seguro';

function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: true, mensaje: 'Token no proporcionado' });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: true, mensaje: 'Token mal formado' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.usuario = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: true, mensaje: 'Token inválido o expirado' });
    }
}

// Middleware opcional para verificar admin
function esAdmin(req, res, next) {
    if (req.usuario && req.usuario.rol === 'admin') return next();
    return res.status(403).json({ error: true, mensaje: 'Requiere rol admin' });
}

module.exports = { verificarToken, esAdmin };