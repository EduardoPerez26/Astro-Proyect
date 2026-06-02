// Script para corregir el esquema de la base de datos
// Ejecutar con: node fix-schema.js

require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixSchema() {
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
        console.log('¡Conexión exitosa!');

        // 1. Crear tabla categorias_permisos si no existe
        console.log('\n1. Creando tabla categorias_permisos...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS categorias_permisos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(50) NOT NULL UNIQUE,
                descripcion VARCHAR(255),
                icono VARCHAR(50) DEFAULT 'fa-folder',
                color VARCHAR(20) DEFAULT 'primary',
                orden INT DEFAULT 0,
                activo BOOLEAN DEFAULT TRUE,
                fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('   ✓ Tabla categorias_permisos lista');

        // 2. Verificar y agregar columnas faltantes a permisos
        console.log('\n2. Verificando columnas de permisos...');
        
        // Verificar categoria_id
        const [cols1] = await connection.query(`
            SELECT COUNT(*) as count FROM information_schema.columns 
            WHERE table_schema = ? AND table_name = 'permisos' AND column_name = 'categoria_id'
        `, [config.database]);
        
        if (cols1[0].count === 0) {
            await connection.query('ALTER TABLE permisos ADD COLUMN categoria_id INT AFTER descripcion');
            console.log('   ✓ Columna categoria_id agregada');
        } else {
            console.log('   ✓ Columna categoria_id ya existe');
        }

        // Verificar icono
        const [cols2] = await connection.query(`
            SELECT COUNT(*) as count FROM information_schema.columns 
            WHERE table_schema = ? AND table_name = 'permisos' AND column_name = 'icono'
        `, [config.database]);
        
        if (cols2[0].count === 0) {
            await connection.query("ALTER TABLE permisos ADD COLUMN icono VARCHAR(50) DEFAULT 'fa-key' AFTER categoria_id");
            console.log('   ✓ Columna icono agregada');
        } else {
            console.log('   ✓ Columna icono ya existe');
        }

        // Verificar nivel
        const [cols3] = await connection.query(`
            SELECT COUNT(*) as count FROM information_schema.columns 
            WHERE table_schema = ? AND table_name = 'permisos' AND column_name = 'nivel'
        `, [config.database]);
        
        if (cols3[0].count === 0) {
            await connection.query('ALTER TABLE permisos ADD COLUMN nivel INT DEFAULT 1 AFTER icono');
            console.log('   ✓ Columna nivel agregada');
        } else {
            console.log('   ✓ Columna nivel ya existe');
        }

        // Verificar activo
        const [cols4] = await connection.query(`
            SELECT COUNT(*) as count FROM information_schema.columns 
            WHERE table_schema = ? AND table_name = 'permisos' AND column_name = 'activo'
        `, [config.database]);
        
        if (cols4[0].count === 0) {
            await connection.query('ALTER TABLE permisos ADD COLUMN activo BOOLEAN DEFAULT TRUE AFTER nivel');
            console.log('   ✓ Columna activo agregada');
        } else {
            console.log('   ✓ Columna activo ya existe');
        }

        // 3. Agregar foreign key
        console.log('\n3. Verificando foreign key...');
        const [fks] = await connection.query(`
            SELECT COUNT(*) as count FROM information_schema.table_constraints 
            WHERE table_schema = ? AND table_name = 'permisos' AND constraint_name = 'fk_permisos_categoria'
        `, [config.database]);
        
        if (fks[0].count === 0) {
            await connection.query('ALTER TABLE permisos ADD CONSTRAINT fk_permisos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias_permisos(id) ON DELETE SET NULL');
            console.log('   ✓ Foreign key agregada');
        } else {
            console.log('   ✓ Foreign key ya existe');
        }

        // 4. Crear índices
        console.log('\n4. Creando índices...');
        
        // Verificar y crear índice categoria_id
        const [idx1] = await connection.query(`
            SELECT COUNT(*) as count FROM information_schema.statistics 
            WHERE table_schema = ? AND table_name = 'permisos' AND index_name = 'idx_permisos_categoria'
        `, [config.database]);
        
        if (idx1[0].count === 0) {
            await connection.query('CREATE INDEX idx_permisos_categoria ON permisos (categoria_id)');
            console.log('   ✓ Índice idx_permisos_categoria creado');
        } else {
            console.log('   ✓ Índice idx_permisos_categoria ya existe');
        }

        // Verificar y crear índice activo
        const [idx2] = await connection.query(`
            SELECT COUNT(*) as count FROM information_schema.statistics 
            WHERE table_schema = ? AND table_name = 'permisos' AND index_name = 'idx_permisos_activo'
        `, [config.database]);
        
        if (idx2[0].count === 0) {
            await connection.query('CREATE INDEX idx_permisos_activo ON permisos (activo)');
            console.log('   ✓ Índice idx_permisos_activo creado');
        } else {
            console.log('   ✓ Índice idx_permisos_activo ya existe');
        }

        // 5. Crear tabla historial_permisos
        console.log('\n5. Creando tabla historial_permisos...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS historial_permisos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT NOT NULL,
                accion VARCHAR(50) NOT NULL,
                tipo_objeto VARCHAR(50) NOT NULL,
                objeto_id INT,
                objeto_nombre VARCHAR(255),
                detalles_anteriores JSON,
                detalles_nuevos JSON,
                ip_address VARCHAR(45),
                user_agent VARCHAR(255),
                fecha_accion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                INDEX idx_usuario (usuario_id),
                INDEX idx_fecha (fecha_accion),
                INDEX idx_accion (accion)
            )
        `);
        console.log('   ✓ Tabla historial_permisos lista');

        // 6. Insertar categorías por defecto
        console.log('\n6. Insertando categorías...');
        await connection.query(`
            INSERT INTO categorias_permisos (nombre, descripcion, icono, color, orden) VALUES
            ('dashboard', 'Permisos del dashboard y vista principal', 'fa-gauge', 'info', 1),
            ('archivos', 'Gestión de archivos Excel', 'fa-file-excel', 'success', 2),
            ('validaciones', 'Validaciones y reportes', 'fa-clipboard-check', 'warning', 3),
            ('tiendas', 'Gestión de tiendas/restaurantes', 'fa-store', 'primary', 4),
            ('usuarios', 'Administración de usuarios', 'fa-users', 'danger', 5),
            ('configuracion', 'Configuración del sistema', 'fa-gear', 'secondary', 6)
            ON DUPLICATE KEY UPDATE 
                descripcion = VALUES(descripcion),
                icono = VALUES(icono),
                color = VALUES(color),
                orden = VALUES(orden)
        `);
        console.log('   ✓ Categorías insertadas');

        // 7. Actualizar permisos existentes
        console.log('\n7. Actualizando permisos existentes...');
        await connection.query(`
            UPDATE permisos SET 
                descripcion = CASE nombre
                    WHEN 'view_dashboard' THEN 'Ver el dashboard principal'
                    WHEN 'view_archivos' THEN 'Ver lista de archivos'
                    WHEN 'upload_files' THEN 'Subir archivos Excel'
                    WHEN 'validate_files' THEN 'Ejecutar validaciones de archivos'
                    WHEN 'view_validaciones' THEN 'Ver historial de validaciones'
                    WHEN 'view_tiendas' THEN 'Ver tiendas/restaurantes'
                    WHEN 'manage_users' THEN 'Gestionar usuarios (crear/editar/desactivar)'
                    WHEN 'view_stats' THEN 'Ver estadísticas del sistema'
                    WHEN 'download_files' THEN 'Descargar archivos Excel'
                    WHEN 'delete_files' THEN 'Eliminar archivos Excel'
                    WHEN 'edit_file_notes' THEN 'Editar notas de archivos'
                    WHEN 'export_validaciones' THEN 'Exportar reportes de validación'
                    WHEN 'manage_tiendas' THEN 'Gestionar tiendas (crear/editar)'
                    WHEN 'view_users' THEN 'Ver lista de usuarios'
                    WHEN 'manage_roles' THEN 'Gestionar roles y permisos'
                    WHEN 'view_config' THEN 'Ver configuración del sistema'
                    WHEN 'manage_config' THEN 'Modificar configuración del sistema'
                    ELSE descripcion
                END,
                icono = CASE nombre
                    WHEN 'view_dashboard' THEN 'fa-gauge-high'
                    WHEN 'view_archivos' THEN 'fa-file-lines'
                    WHEN 'upload_files' THEN 'fa-file-import'
                    WHEN 'validate_files' THEN 'fa-circle-check'
                    WHEN 'view_validaciones' THEN 'fa-clock-rotate-left'
                    WHEN 'view_tiendas' THEN 'fa-store'
                    WHEN 'manage_users' THEN 'fa-user-gear'
                    WHEN 'view_stats' THEN 'fa-chart-line'
                    WHEN 'download_files' THEN 'fa-file-export'
                    WHEN 'delete_files' THEN 'fa-trash'
                    WHEN 'edit_file_notes' THEN 'fa-pen'
                    WHEN 'export_validaciones' THEN 'fa-file-pdf'
                    WHEN 'manage_tiendas' THEN 'fa-store-slash'
                    WHEN 'view_users' THEN 'fa-users'
                    WHEN 'manage_roles' THEN 'fa-key'
                    WHEN 'view_config' THEN 'fa-sliders'
                    WHEN 'manage_config' THEN 'fa-screwdriver-wrench'
                    ELSE icono
                END,
                nivel = CASE nombre
                    WHEN 'view_dashboard' THEN 1
                    WHEN 'view_archivos' THEN 1
                    WHEN 'upload_files' THEN 1
                    WHEN 'validate_files' THEN 2
                    WHEN 'view_validaciones' THEN 1
                    WHEN 'view_tiendas' THEN 1
                    WHEN 'manage_users' THEN 3
                    WHEN 'view_stats' THEN 2
                    WHEN 'download_files' THEN 2
                    WHEN 'delete_files' THEN 3
                    WHEN 'edit_file_notes' THEN 2
                    WHEN 'export_validaciones' THEN 3
                    WHEN 'manage_tiendas' THEN 3
                    WHEN 'view_users' THEN 2
                    WHEN 'manage_roles' THEN 3
                    WHEN 'view_config' THEN 2
                    WHEN 'manage_config' THEN 3
                    ELSE nivel
                END
            WHERE nombre IN ('view_dashboard', 'view_archivos', 'upload_files', 'validate_files', 
                             'view_validaciones', 'view_tiendas', 'manage_users', 'view_stats',
                             'download_files', 'delete_files', 'edit_file_notes', 'export_validaciones',
                             'manage_tiendas', 'view_users', 'manage_roles', 'view_config', 'manage_config')
        `);
        console.log('   ✓ Permisos actualizados');

        // Asignar categorías a permisos
        await connection.query(`
            UPDATE permisos p
            JOIN categorias_permisos c ON c.nombre = CASE p.nombre
                WHEN 'view_dashboard' THEN 'dashboard'
                WHEN 'view_stats' THEN 'dashboard'
                WHEN 'view_archivos' THEN 'archivos'
                WHEN 'upload_files' THEN 'archivos'
                WHEN 'download_files' THEN 'archivos'
                WHEN 'delete_files' THEN 'archivos'
                WHEN 'edit_file_notes' THEN 'archivos'
                WHEN 'validate_files' THEN 'validaciones'
                WHEN 'view_validaciones' THEN 'validaciones'
                WHEN 'export_validaciones' THEN 'validaciones'
                WHEN 'view_tiendas' THEN 'tiendas'
                WHEN 'manage_tiendas' THEN 'tiendas'
                WHEN 'view_users' THEN 'usuarios'
                WHEN 'manage_users' THEN 'usuarios'
                WHEN 'manage_roles' THEN 'usuarios'
                WHEN 'view_config' THEN 'configuracion'
                WHEN 'manage_config' THEN 'configuracion'
            END
            SET p.categoria_id = c.id
            WHERE p.nombre IN ('view_dashboard', 'view_stats', 'view_archivos', 'upload_files', 
                               'download_files', 'delete_files', 'edit_file_notes', 'validate_files', 
                               'view_validaciones', 'export_validaciones', 'view_tiendas', 'manage_tiendas',
                               'view_users', 'manage_users', 'manage_roles', 'view_config', 'manage_config')
        `);
        console.log('   ✓ Categorías asignadas a permisos');

        // 8. Insertar permisos faltantes
        console.log('\n8. Insertando permisos faltantes...');
        const permisosInsert = [
            ['view_stats', 'Ver estadísticas del sistema', 'dashboard', 'fa-chart-line', 2],
            ['download_files', 'Descargar archivos Excel', 'archivos', 'fa-file-export', 2],
            ['delete_files', 'Eliminar archivos Excel', 'archivos', 'fa-trash', 3],
            ['edit_file_notes', 'Editar notas de archivos', 'archivos', 'fa-pen', 2],
            ['export_validaciones', 'Exportar reportes de validación', 'validaciones', 'fa-file-pdf', 3],
            ['manage_tiendas', 'Gestionar tiendas (crear/editar)', 'tiendas', 'fa-store-slash', 3],
            ['view_users', 'Ver lista de usuarios', 'usuarios', 'fa-users', 2],
            ['manage_roles', 'Gestionar roles y permisos', 'usuarios', 'fa-key', 3],
            ['view_config', 'Ver configuración del sistema', 'configuracion', 'fa-sliders', 2],
            ['manage_config', 'Modificar configuración del sistema', 'configuracion', 'fa-screwdriver-wrench', 3]
        ];

        for (const [nombre, desc, cat, icon, nivel] of permisosInsert) {
            await connection.query(`
                INSERT IGNORE INTO permisos (nombre, descripcion, categoria_id, icono, nivel) 
                SELECT ?, ?, c.id, ?, ?
                FROM categorias_permisos c WHERE c.nombre = ?
            `, [nombre, desc, icon, nivel, cat]);
        }
        console.log('   ✓ Permisos faltantes insertados');

        // 9. Verificación final
        console.log('\n9. Verificación final...');
        const [stats] = await connection.query(`
            SELECT 
                (SELECT COUNT(*) FROM categorias_permisos WHERE activo = TRUE) as total_categorias,
                (SELECT COUNT(*) FROM permisos WHERE activo = TRUE) as total_permisos
        `);
        console.log(`   Total categorías: ${stats[0].total_categorias}`);
        console.log(`   Total permisos: ${stats[0].total_permisos}`);

        console.log('\n========================================');
        console.log('¡ESQUEMA ACTUALIZADO CORRECTAMENTE!');
        console.log('========================================');

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

fixSchema();