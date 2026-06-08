const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    database: process.env.DB_DATABASE || 'mision_much',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  try {
    console.log('Reading seed_mysql.sql...');
    const sqlPath = path.join(__dirname, '../database/seed_mysql.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('Running seed statements...');
    await connection.query(sql);
    console.log('✅ MySQL seed applied successfully!');
  } catch (err) {
    console.error('Error seeding database:', err.message);
  } finally {
    await connection.end();
  }
}

run();
