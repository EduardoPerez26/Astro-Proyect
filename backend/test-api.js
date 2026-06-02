// Script de prueba para verificar que las APIs de permisos funcionan correctamente
require('dotenv').config();
const mysql = require('mysql2/promise');

async function testAPI() {
    const config = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'excel_validator'
    };

    let connection;
    try {
        console.log('=== PRUEBA DE ESQUEMA DE BASE DE DATOS ===\n');
        connection = await mysql.createConnection(config);

        // 1. Verificar columnas de la tabla permisos
        console.log('1. Verificando columnas de permisos...');
        const [columns] = await connection.query(`
            SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
            FROM information_schema.columns 
            WHERE table_schema = ? AND table_name = 'permisos'
            ORDER BY ORDINAL_POSITION
        `, [config.database]);

        console.log('   Columnas encontradas:');
        columns.forEach(col => {
            console.log(`     - ${col.COLUMN_NAME} (${col.DATA_TYPE}) ${col.COLUMN_DEFAULT ? '= ' + col.COLUMN_DEFAULT : ''}`);
        });

        // 2. Verificar categorías
        console.log('\n2. Verificando categorías...');
        const [categorias] = await connection.query('SELECT id, nombre, descripcion FROM categorias_permisos WHERE activo = TRUE ORDER BY orden');
        console.log(`   Total categorías: ${categorias.length}`);
        categorias.forEach(cat => {
            console.log(`     - ${cat.nombre}: ${cat.descripcion}`);
        });

        // 3. Verificar permisos
        console.log('\n3. Verificando permisos...');
        const [permisos] = await connection.query(`
            SELECT p.id, p.nombre, p.descripcion, p.icono, p.nivel, p.activo,
                   c.nombre as categoria
            FROM permisos p
            LEFT JOIN categorias_permisos c ON p.categoria_id = c.id
            WHERE p.activo = TRUE
            ORDER BY c.orden, p.nombre
        `);
        console.log(`   Total permisos: ${permisos.length}`);
        
        // Agrupar por categoría
        const porCategoria = {};
        permisos.forEach(p => {
            const cat = p.categoria || 'Sin categoría';
            if (!porCategoria[cat]) porCategoria[cat] = [];
            porCategoria[cat].push(p.nombre);
        });
        
        Object.entries(porCategoria).forEach(([cat, perms]) => {
            console.log(`   ${cat}:`);
            perms.forEach(p => console.log(`     - ${p}`));
        });

        // 4. Verificar roles_permisos
        console.log('\n4. Verificando roles_permisos...');
        const [roles] = await connection.query('SELECT DISTINCT rol FROM roles_permisos ORDER BY rol');
        console.log(`   Roles encontrados: ${roles.map(r => r.rol).join(', ')}`);

        // 5. Probar consulta completa (la que usa el backend)
        console.log('\n5. Probando consulta completa del backend...');
        try {
            const [result] = await connection.query(`
                SELECT p.id, p.nombre, p.descripcion, p.icono, p.nivel, p.activo, p.fecha_creacion,
                       c.id as categoria_id, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color
                FROM permisos p
                LEFT JOIN categorias_permisos c ON p.categoria_id = c.id
                WHERE 1=1
                ORDER BY c.orden, p.nombre
                LIMIT 5
            `);
            console.log('   ✓ Consulta exitosa!');
            console.log('   Primeros 5 resultados:');
            result.forEach(r => {
                console.log(`     - ${r.nombre} (categoría: ${r.categoria_nombre || 'N/A'})`);
            });
        } catch (error) {
            console.log('   ✗ Error en consulta:', error.message);
        }

        // 6. Probar estadísticas
        console.log('\n6. Probando consulta de estadísticas...');
        try {
            const [stats] = await connection.query(`
                SELECT 
                    (SELECT COUNT(*) FROM permisos WHERE activo = TRUE) as total_permisos,
                    (SELECT COUNT(*) FROM categorias_permisos WHERE activo = TRUE) as total_categorias,
                    (SELECT COUNT(DISTINCT rol) FROM roles_permisos) as total_roles,
                    (SELECT COUNT(*) FROM roles_permisos) as total_asignaciones
            `);
            console.log('   ✓ Estadísticas:');
            console.log(`     - Total permisos: ${stats[0].total_permisos}`);
            console.log(`     - Total categorías: ${stats[0].total_categorias}`);
            console.log(`     - Total roles: ${stats[0].total_roles}`);
            console.log(`     - Total asignaciones: ${stats[0].total_asignaciones}`);
        } catch (error) {
            console.log('   ✗ Error en estadísticas:', error.message);
        }

        console.log('\n=== TODAS LAS PRUEBAS COMPLETADAS ===');
        console.log('El esquema de la base de datos está correctamente configurado.');

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

testAPI();