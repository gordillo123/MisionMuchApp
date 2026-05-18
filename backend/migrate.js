const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function runMigration() {
  try {
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('⏳ Ejecutando migración de la base de datos...');
    
    await pool.query(schemaSql);
    
    console.log('✅ Migración completada. Las tablas se han creado correctamente.');
  } catch (error) {
    console.error('❌ Error durante la migración:', error.message);
  } finally {
    pool.end();
  }
}

runMigration();
