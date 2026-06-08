const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    database: process.env.DB_DATABASE || 'mision_much',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    const [rows] = await connection.query('SELECT * FROM estaciones');
    console.log('Estaciones table rows:');
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await connection.end();
  }
}

run();
