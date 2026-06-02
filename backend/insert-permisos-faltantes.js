// Script para insertar los permisos faltantes
require('dotenv').config();
const mysql = require('mysql2/promise');

async function insertMissingPermisos() {
    const config = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'excel_validator'
    };

    let connection;
    try {
        console.log('Conectando a MySQL...');
        connection = await mysql.createConnection(config);
        console.log('✓ Conexión exitosa');

        // Lista completa de permisos que deberían existir
        const permisos = [
            // Dashboard
            { nombre: 'view_dashboard', descripcion: 'Ver el dashboard principal', categoria: 'dashboard', icono: 'fa-gauge-high', nivel: 1 },
            { nombre: 'view_stats', descripcion: 'Ver estadísticas del sistema', categoria: 'dashboard', icono: 'fa-chart-line', nivel: 2 },
            
            // Archivos
            { nombre: 'view_archivos', descripcion: 'Ver lista de archivos', categoria: 'archivos', icono: 'fa-file-lines', nivel: 1 },
            { nombre: 'upload_files', descripcion: 'Subir archivos Excel', categoria: 'archivos', icono: 'fa-file-import', nivel: 1 },
            { nombre: 'download_files', descripcion: 'Descargar archivos Excel', categoria: 'archivos', icono: 'fa-file-export', nivel: 2 },
            { nombre: 'delete_files', descripcion: 'Eliminar archivos Excel', categoria: 'archivos', icono: 'fa-trash', nivel: 3 },
            { nombre: 'edit_file_notes', descripcion: 'Editar notas de archivos', categoria: 'archivos', icono: 'fa-pen', nivel: 2 },
            
            // Validaciones
            { nombre: 'validate_files', descripcion: 'Ejecutar validaciones de archivos', categoria: 'validaciones', icono: 'fa-circle-check', nivel: 2 },
            { nombre: 'view_validaciones', descripcion: 'Ver historial de validaciones', categoria: 'validaciones', icono: 'fa-clock-rotate-left', nivel: 1 },
            { nombre: 'export_validaciones', descripcion: 'Exportar reportes de validación', categoria: 'validaciones', icono: 'fa-file-pdf', nivel: 3 },
            
            // Tiendas
            { nombre: 'view_tiendas', descripcion: 'Ver tiendas/restaurantes', categoria: 'tiendas', icono: 'fa-store', nivel: 1 },
            { nombre: 'manage_tiendas', descripcion: 'Gestionar tiendas (crear/editar)', categoria: 'tiendas', icono: 'fa-store-slash', nivel: 3 },
            
            // Usuarios
            { nombre: 'manage_users', descripcion: 'Gestionar usuarios (crear/editar/desactivar)', categoria: 'usuarios', icono: 'fa-user-gear', nivel: 3 },
            { nombre: 'view_users', descripcion: 'Ver lista de usuarios', categoria: 'usuarios', icono: 'fa-users', nivel: 2 },
            { nombre: 'manage_roles', descripcion: 'Gestionar roles y permisos', categoria: 'usuarios', icono: 'fa-key', nivel: 3 },
            
            // Configuración
            { nombre: 'view_config', descripcion: 'Ver configuración del sistema', categoria: 'configuracion', icono: 'fa-sliders', nivel: 2 },
            { nombre: 'manage_config', descripcion: 'Modificar configuración del sistema', categoria: 'configuracion', icono: 'fa-screwdriver-wrench', nivel: 3 }
        ];

        console.log('\nInsertando/actualizando permisos...');
        
        for (const perm of permisos) {
            // Obtener ID de la categoría
            const [cats] = await connection.query(
                'SELECT id FROM categorias_permisos WHERE nombre = ?',
                [perm.categoria]
            );
            
            if (cats.length === 0) {
                console.log(`⚠ Categoría '${perm.categoria}' no encontrada para permiso '${perm.nombre}'`);
                continue;
            }
            
            const categoria_id = cats[0].id;
            
            // Insertar o actualizar permiso
            await connection.query(`
                INSERT INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    descripcion = VALUES(descripcion),
                    categoria_id = VALUES(categoria_id),
                    icono = VALUES(icono),
                    nivel = VALUES(nivel)
            `, [perm.nombre, perm.descripcion, categoria_id, perm.icono, perm.nivel]);
            
            console.log(`  ✓ ${perm.nombre}`);
        }

        // Insertar asignaciones de roles por defecto
        console.log('\nInsertando asignaciones de roles...');
        const asignaciones = [
            ['supervisor', 'view_dashboard'],
            ['supervisor', 'view_archivos'],
            ['supervisor', 'view_validaciones'],
            ['supervisor', 'validate_files'],
            ['supervisor', 'view_tiendas'],
            ['usuario', 'upload_files'],
            ['usuario', 'view_archivos']
        ];

        for (const [rol, permiso] of asignaciones) {
            await connection.query(`
                INSERT IGNORE INTO roles_permisos (rol, permiso_nombre) 
                VALUES (?, ?)
            `, [rol, permiso]);
            console.log(`  ✓ ${rol} -> ${permiso}`);
        }

        // Verificación final
        const [stats] = await connection.query(`
            SELECT 
                (SELECT COUNT(*) FROM permisos WHERE activo = TRUE) as total_permisos,
                (SELECT COUNT(*) FROM categorias_permisos WHERE activo = TRUE) as total_categorias,
                (SELECT COUNT(DISTINCT rol) FROM roles_permisos) as total_roles,
                (SELECT COUNT(*) FROM roles_permisos) as total_asignaciones
        `);

        console.log('\n=== RESUMEN ===');
        console.log(`Total permisos: ${stats[0].total_permisos}`);
        console.log(`Total categorías: ${stats[0].total_categorias}`);
        console.log(`Total roles: ${stats[0].total_roles}`);
        console.log(`Total asignaciones: ${stats[0].total_asignaciones}`);

        if (stats[0].total_permisos === 17) {
            console.log('\n✓ ¡Todos los permisos están correctamente configurados!');
        } else {
            console.log(`\n⚠ Se esperaban 17 permisos, pero hay ${stats[0].total_permisos}`);
        }

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

insertMissingPermisos();