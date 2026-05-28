// backend/db.js
// Configuración de la conexión a MySQL usando mysql2/promise

const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('⏳ Intentando conectar con MySQL local...');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_DATABASE || 'mision_much',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Probar la conexión inicial
pool.query('SELECT 1')
  .then(() => console.log('✅ Conexión a MySQL establecida correctamente.'))
  .catch(err => console.error('❌ Error al conectar con MySQL:', err.message));

module.exports = pool;
