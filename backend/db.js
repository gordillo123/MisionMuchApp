// backend/db.js
// Configuración de la conexión a MySQL usando mysql2/promise

const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('⏳ Intentando conectar con MySQL local...');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_DATABASE || 'mision_much',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Crear pool exportado de forma mutable para poder reasignarlo al reintentar
let pool = mysql.createPool(dbConfig);

// Probar la conexión inicial y reintentar con contraseña vacía si falla por credenciales
let readyPromise = pool.query('SELECT 1')
  .then(() => {
    console.log('✅ Conexión a MySQL establecida correctamente.');
  })
  .catch(async (err) => {
    if (err.code === 'ER_ACCESS_DENIED_ERROR' && dbConfig.password !== '') {
      console.log('⚠️ Conexión con contraseña de .env denegada. Reintentando con contraseña vacía...');
      dbConfig.password = '';
      pool = mysql.createPool(dbConfig);
      readyPromise = pool.query('SELECT 1').then(() => {
        console.log('✅ Conexión a MySQL establecida correctamente (sin contraseña).');
      });
      await readyPromise;
    } else {
      throw err;
    }
  });

// Creamos un objeto wrapper para delegar las llamadas al pool activo esperando a que esté listo
const poolWrapper = {
  query: async (...args) => {
    await readyPromise;
    return pool.query(...args);
  },
  getConnection: async (...args) => {
    await readyPromise;
    return pool.getConnection(...args);
  },
  end: async (...args) => {
    await readyPromise;
    return pool.end(...args);
  }
};

module.exports = poolWrapper;
