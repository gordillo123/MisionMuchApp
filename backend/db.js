const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Probar conexión inicial
pool.connect()
  .then(() => console.log('✅ Conexión a PostgreSQL establecida correctamente.'))
  .catch(err => console.error('❌ Error al conectar con PostgreSQL:', err.message));

module.exports = pool;
