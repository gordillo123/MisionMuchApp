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

async function runSeed() {
  try {
    const seedPath = path.join(__dirname, '../database/seed.sql');
    const seedSql = fs.readFileSync(seedPath, 'utf8');

    console.log('⏳ Insertando datos iniciales...');
    
    await pool.query(seedSql);
    
    console.log('✅ Datos iniciales insertados correctamente.');
  } catch (error) {
    console.error('❌ Error al insertar datos:', error.message);
  } finally {
    pool.end();
  }
}

runSeed();
