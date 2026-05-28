// backend/seed-mysql.js
// Script para insertar datos iniciales en la base de datos MySQL local

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runSeed() {
  console.log('⏳ Iniciando sembrado de datos (seed) en MySQL local...');

  const dbName = process.env.DB_DATABASE || 'mision_much';
  const connectionConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: dbName,
    multipleStatements: true
  };

  let connection;

  try {
    connection = await mysql.createConnection(connectionConfig);
    console.log(`✅ Conectado a la base de datos "${dbName}".`);

    // Leer y ejecutar el archivo seed_mysql.sql
    const seedPath = path.join(__dirname, '../database/seed_mysql.sql');
    if (!fs.existsSync(seedPath)) {
      throw new Error(`No se encontró el archivo de semilla (seed) en: ${seedPath}`);
    }

    const seedSql = fs.readFileSync(seedPath, 'utf8');
    console.log('⏳ Insertando registros iniciales...');
    await connection.query(seedSql);
    console.log('✅ Sembrado de datos completado con éxito.');

  } catch (error) {
    console.error('❌ Error durante el sembrado de datos en MySQL:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexión a MySQL cerrada.');
    }
  }
}

runSeed();
