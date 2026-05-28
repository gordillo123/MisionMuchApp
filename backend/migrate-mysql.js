// backend/migrate-mysql.js
// Script de migración para crear la base de datos y las tablas en MySQL

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  console.log('⏳ Iniciando migración a MySQL local...');

  // 1. Conexión inicial sin base de datos para crearla si no existe
  const connectionConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  };

  let connection;

  try {
    connection = await mysql.createConnection(connectionConfig);
    console.log('✅ Conectado al servidor MySQL.');

    const dbName = process.env.DB_DATABASE || 'mision_much';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    console.log(`✅ Base de datos "${dbName}" verificada/creada.`);

    // 2. Conectarse a la base de datos específica
    await connection.changeUser({ database: dbName });
    console.log(`✅ Conectado a la base de datos "${dbName}".`);

    // 3. Leer y ejecutar el archivo schema_mysql.sql
    const schemaPath = path.join(__dirname, '../database/schema_mysql.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`No se encontró el archivo de esquema en: ${schemaPath}`);
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    console.log('⏳ Ejecutando sentencias del esquema SQL...');
    await connection.query(schemaSql);
    console.log('✅ Tablas creadas correctamente en MySQL.');

  } catch (error) {
    console.error('❌ Error durante la migración a MySQL:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexión a MySQL cerrada.');
    }
  }
}

runMigration();
