const mysql = require('mysql2/promise');
require('dotenv').config();

async function check() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'mision_much',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  try {
    const [roles] = await pool.query('SELECT * FROM roles');
    console.log('Roles in DB:', roles);

    const [estaciones] = await pool.query('SELECT * FROM estaciones');
    console.log('Estaciones in DB:', estaciones);

    const [usuarios] = await pool.query('SELECT * FROM usuarios LIMIT 5');
    console.log('Usuarios in DB (first 5):', usuarios);

    const [ur] = await pool.query('SELECT * FROM usuarios_roles LIMIT 5');
    console.log('Usuarios Roles in DB:', ur);

  } catch (error) {
    console.error('Error querying DB:', error);
  } finally {
    await pool.end();
  }
}

check();
