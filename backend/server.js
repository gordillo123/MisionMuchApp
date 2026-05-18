const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
