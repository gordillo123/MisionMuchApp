const mysql = require('mysql2/promise');
require('dotenv').config();

async function check() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    database: process.env.DB_DATABASE || 'mision_much',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  console.log('Conectado a la base de datos.');

  try {
    const [rows] = await connection.query(`SHOW TABLES LIKE 'verificaciones_ubicacion'`);
    if (rows.length > 0) {
      console.log('¡La tabla ya existe!');
    } else {
      console.log('La tabla no existe. Creándola...');
      await connection.query(`
        CREATE TABLE IF NOT EXISTS verificaciones_ubicacion (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NULL,
          session_id VARCHAR(255) NULL,
          direccion_museo TEXT NOT NULL,
          latitud_usuario DOUBLE PRECISION NULL,
          longitud_usuario DOUBLE PRECISION NULL,
          precision_gps DOUBLE PRECISION NULL,
          latitud_museo DOUBLE PRECISION NOT NULL,
          longitud_museo DOUBLE PRECISION NOT NULL,
          radio_permitido_metros INT NOT NULL DEFAULT 150,
          distancia_metros DOUBLE PRECISION NULL,
          dentro_del_museo BOOLEAN NOT NULL DEFAULT false,
          permiso_ubicacion BOOLEAN NOT NULL DEFAULT false,
          mensaje_resultado TEXT NULL,
          fecha_verificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_vu_usuario FOREIGN KEY (user_id) REFERENCES usuarios (id_usuario) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log('¡Tabla creada con éxito!');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await connection.end();
  }
}

check();
