// ============================================
// CONFIGURACION DE BASE DE DATOS - MySQL
// ============================================
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST ,
    port: process.env.DB_PORT ,
    user: process.env.DB_USER ,
    password: process.env.DB_PASSWORD ,
    database: process.env.DB_NAME ,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('Conexion a MySQL exitosa');
        connection.release();
        return true;
    } catch (error) {
        console.error('Error conectando a MySQL:', error.message);
        return false;
    }
}

module.exports = {
    pool,
    testConnection
};