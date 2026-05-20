const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

async function ensureUsuariosCorreoUnique() {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'usuarios_correo_key'
          AND conrelid = 'usuarios'::regclass
      ) THEN
        ALTER TABLE usuarios
        ADD CONSTRAINT usuarios_correo_key UNIQUE (correo);
      END IF;
    END $$;
  `);
}

// Middlewares
app.use(cors());
app.use(express.json());

// Ruta básica
app.get('/', (req, res) => {
  res.send('🚀 Backend de Misión MUCH funcionando correctamente.');
});

// Prueba de conexión (Health check)
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'success',
      message: 'Conexión a PostgreSQL exitosa.',
      time: result.rows[0].now
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Fallo la conexión a la base de datos.',
      error: error.message
    });
  }
});

// Obtener estaciones ordenadas
app.get('/api/estaciones', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM estaciones ORDER BY orden ASC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Registrar un usuario
app.post('/api/usuarios', async (req, res) => {
  const { nombre, correo, google_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO usuarios (nombre, correo, google_id) VALUES ($1, $2, $3) RETURNING *',
      [nombre, correo, google_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Registrar o actualizar usuario desde Google
app.post('/api/auth/google', async (req, res) => {
  const { nombre, correo, google_id } = req.body;
  const correoNormalizado = correo?.trim().toLowerCase();

  console.log('Datos recibidos desde Google:', { nombre, correo: correoNormalizado, google_id });

  if (!nombre || !correoNormalizado || !google_id) {
    return res.status(400).json({
      error: 'Faltan datos obligatorios: nombre, correo o google_id'
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, correo, google_id, fecha_registro)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (correo) DO UPDATE
       SET nombre = EXCLUDED.nombre,
           google_id = EXCLUDED.google_id
       RETURNING *`,
      [nombre.trim(), correoNormalizado, google_id]
    );

    console.log('Usuario guardado en PostgreSQL:', result.rows[0]);
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error al guardar usuario de Google:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Guardar progreso en una estación
app.post('/api/progreso', async (req, res) => {
  const { usuario_id, estacion_id } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO progreso_usuario (usuario_id, estacion_id) 
       VALUES ($1, $2) 
       ON CONFLICT (usuario_id, estacion_id) DO NOTHING 
       RETURNING *`,
      [usuario_id, estacion_id]
    );
    res.status(201).json({ message: 'Progreso guardado', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generar un boleto
app.post('/api/boletos', async (req, res) => {
  const { usuario_id } = req.body;

  // Generar folio simple: MUCH-Timestamp-Random
  const folio = `MUCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  try {
    const result = await pool.query(
      'INSERT INTO boletos (usuario_id, folio) VALUES ($1, $2) RETURNING *',
      [usuario_id, folio]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servidor
ensureUsuariosCorreoUnique()
  .then(() => {
    console.log('Restriccion UNIQUE de usuarios.correo verificada.');
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('No se pudo verificar usuarios.correo UNIQUE:', error.message);
    process.exit(1);
  });
