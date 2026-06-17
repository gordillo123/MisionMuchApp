// backend/server.js
// Servidor backend principal en Express para "Misión MUCH"

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const pool = require('./db');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

// Asegurar existencia de la tabla de verificación de ubicación
(async () => {
  try {
    console.log('⏳ Verificando existencia de la tabla verificaciones_ubicacion...');
    await pool.query(`
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
    console.log('✅ Tabla verificaciones_ubicacion verificada/creada con éxito.');
  } catch (error) {
    console.error('❌ Error al verificar/crear la tabla verificaciones_ubicacion:', error.message);
  }
})();

const app = express();
const PORT = process.env.PORT || 3000;


// Cliente de Google OAuth
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const client = googleClientId ? new OAuth2Client(googleClientId) : null;

// Middlewares
app.use(cors());
app.use(express.json());

// Logger simple para peticiones
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Middleware de roles y simulación de usuario actual
// Para fines de desarrollo local y simplicidad, el frontend enviará las cabeceras:
// 'x-user-id' con el ID del usuario actual.
// 'x-user-email' con el correo del usuario actual.
async function obtenerRolUsuario(idUsuario) {
  if (!idUsuario) return [];
  try {
    const [roles] = await pool.query(
      `SELECT r.nombre 
       FROM roles r
       JOIN usuarios_roles ur ON r.id_rol = ur.id_rol
       WHERE ur.id_usuario = ?`,
      [idUsuario]
    );
    return roles.map(row => row.nombre);
  } catch (error) {
    console.error('Error al obtener roles de usuario:', error.message);
    return [];
  }
}

async function obtenerOCrearRolId(nombreRol, descripcion = '') {
  const [[rolExistente]] = await pool.query(
    'SELECT id_rol FROM roles WHERE nombre = ? LIMIT 1',
    [nombreRol]
  );

  if (rolExistente?.id_rol) {
    return rolExistente.id_rol;
  }

  const [insertResult] = await pool.query(
    'INSERT INTO roles (nombre, descripcion) VALUES (?, ?)',
    [nombreRol, descripcion]
  );

  return insertResult.insertId;
}

async function esAdmin(idUsuario) {
  const roles = await obtenerRolUsuario(idUsuario);
  return roles.includes('admin');
}

async function esTaquilla(idUsuario) {
  const roles = await obtenerRolUsuario(idUsuario);
  return roles.includes('taquilla') || roles.includes('admin');
}

// Generar Folio único de 6 caracteres alfanuméricos mezclados (ej: X7K9R2)
async function generarFolioUnico(connection) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let attempts = 0;
  while (attempts < 10) {
    let randomPart = '';
    for (let i = 0; i < 6; i++) {
      randomPart += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    const folio = randomPart;
    
    // Verificar si el folio ya existe para garantizar unicidad
    const [[exist]] = await connection.query('SELECT 1 FROM boletos WHERE folio = ? LIMIT 1', [folio]);
    if (!exist) {
      return folio;
    }
    attempts++;
  }
  // Fallback con timestamp en base 36
  return Date.now().toString(36).toUpperCase();
}

// Middleware de autorización de Admin
async function permitirAdmin(req, res, next) {
  const idUsuario = req.headers['x-user-id'];
  if (!idUsuario) {
    return res.status(401).json({ error: 'No autorizado. Falta cabecera x-user-id.' });
  }
  const admin = await esAdmin(idUsuario);
  if (!admin) {
    return res.status(403).json({ error: 'Permiso denegado. Se requiere rol de Administrador.' });
  }
  next();
}

// Middleware de autorización de Taquilla o Admin
async function permitirTaquillaOAdmin(req, res, next) {
  const idUsuario = req.headers['x-user-id'];
  if (!idUsuario) {
    return res.status(401).json({ error: 'No autorizado. Falta cabecera x-user-id.' });
  }
  const taquilla = await esTaquilla(idUsuario);
  if (!taquilla) {
    return res.status(403).json({ error: 'Permiso denegado. Se requiere rol de Taquilla o Admin.' });
  }
  next();
}

function obtenerIdUsuarioDePeticion(req) {
  return req.headers['x-user-id'] || req.body?.id_usuario || req.params?.id_usuario || req.params?.idUsuario;
}

function obtenerRangoFechasAdmin(req) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const rawStart = typeof req.query.startDate === 'string' && datePattern.test(req.query.startDate)
    ? req.query.startDate
    : '';
  const rawEnd = typeof req.query.endDate === 'string' && datePattern.test(req.query.endDate)
    ? req.query.endDate
    : '';

  if (!rawStart && !rawEnd) return null;

  let startDate = rawStart || rawEnd;
  let endDate = rawEnd || rawStart;
  if (startDate > endDate) {
    [startDate, endDate] = [endDate, startDate];
  }

  return { startDate, endDate };
}

function parametrosRangoFechas(range) {
  return range ? [range.startDate, range.endDate] : [];
}

function condicionRangoFechas(column, range) {
  return range ? `${column} >= ? AND ${column} < DATE_ADD(?, INTERVAL 1 DAY)` : '';
}

function whereDesdeCondiciones(conditions) {
  return conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
}

// Middleware de autorizacion de jugador.
// Admin y taquilla pueden conservar rol "usuario" por compatibilidad, pero no deben jugar.
async function permitirJugador(req, res, next) {
  const idUsuario = obtenerIdUsuarioDePeticion(req);
  if (!idUsuario) {
    return res.status(401).json({ error: 'No autorizado. Falta identificador de usuario.' });
  }

  const roles = await obtenerRolUsuario(idUsuario);
  if (roles.includes('admin') || roles.includes('taquilla')) {
    return res.status(403).json({
      error: 'Permiso denegado. Las cuentas de Administrador o Taquilla no pueden ejecutar acciones de jugador.'
    });
  }

  next();
}

// ==========================================
// 1. GET /api/health (Health check)
// ==========================================
app.get('/api/health', async (req, res) => {
  try {
    const [result] = await pool.query('SELECT 1');
    res.json({
      status: 'success',
      message: 'Conexión a MySQL exitosa.',
      database: process.env.DB_DATABASE || 'mision_much',
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Falló la conexión a la base de datos MySQL.',
      error: error.message
    });
  }
});

// ==========================================
// 2. POST /api/auth/google
// ==========================================
app.post('/api/auth/google', async (req, res) => {
  const { credential, userData } = req.body;
  let nombre = '';
  let correo = '';
  let googleId = '';
  let avatarUrl = '';

  try {
    if (credential && client) {
      // Flujo seguro: verificar el token de Google
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      });
      const payload = ticket.getPayload();
      nombre = payload.name;
      correo = payload.email?.trim().toLowerCase();
      googleId = payload.sub;
      avatarUrl = payload.picture || '';
    } else if (userData) {
      // Fallback para desarrollo local / simulación si no se configura Client ID
      nombre = userData.name || userData.nombre;
      correo = (userData.email || userData.correo)?.trim().toLowerCase();
      googleId = userData.google_id || userData.id || `sim_${Date.now()}`;
      avatarUrl = userData.picture || userData.avatar_url || '';
    } else {
      return res.status(400).json({
        error: 'Faltan credenciales o datos de usuario para iniciar sesión.'
      });
    }

    if (!nombre || !correo || !googleId) {
      return res.status(400).json({
        error: 'Faltan datos obligatorios de perfil (nombre, correo o google_id)'
      });
    }

    // 1. Guardar o actualizar usuario en MySQL
    await pool.query(
      `INSERT INTO usuarios (nombre, correo, google_id, avatar_url, ultimo_login)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE 
         nombre = VALUES(nombre), 
         google_id = VALUES(google_id), 
         avatar_url = VALUES(avatar_url), 
         ultimo_login = CURRENT_TIMESTAMP`,
      [nombre.trim(), correo, googleId, avatarUrl]
    );

    // Obtener el ID de usuario generado
    const [[usuario]] = await pool.query('SELECT * FROM usuarios WHERE correo = ?', [correo]);
    const idUsuario = usuario.id_usuario;

    // 2. Asignar rol de 'usuario' por defecto si no tiene ningún rol asignado
    const [rolesExistentes] = await pool.query(
      'SELECT 1 FROM usuarios_roles WHERE id_usuario = ?',
      [idUsuario]
    );

    if (rolesExistentes.length === 0) {
      const usuarioRoleId = await obtenerOCrearRolId(
        'usuario',
        'Usuario regular que juega las estaciones del recorrido'
      );
      await pool.query(
        'INSERT INTO usuarios_roles (id_usuario, id_rol) VALUES (?, ?)',
        [idUsuario, usuarioRoleId]
      );
    }

    // Para cuentas especiales, auto-asignar rol admin si el correo es planetariotuxtla@gmail.com, muchtuxtla@gmail.com o luceroynn@gmail.com
    const correosEspeciales = ['planetariotuxtla@gmail.com', 'muchtuxtla@gmail.com', 'luceroynn@gmail.com'];
    if (correosEspeciales.includes(correo)) {
      const adminRoleId = await obtenerOCrearRolId(
        'admin',
        'Administrador general del sistema con acceso completo a metricas y registros'
      );
      const taquillaRoleId = await obtenerOCrearRolId(
        'taquilla',
        'Operador de taquilla encargado de validar, escanear y canjear boletos'
      );

      // Verificar si ya tiene el rol admin y taquilla.
      const [adminRoleCheck] = await pool.query(
        'SELECT 1 FROM usuarios_roles WHERE id_usuario = ? AND id_rol = ?',
        [idUsuario, adminRoleId]
      );
      if (adminRoleCheck.length === 0) {
        await pool.query(
          'INSERT INTO usuarios_roles (id_usuario, id_rol) VALUES (?, ?)',
          [idUsuario, adminRoleId]
        );
      }
      const [taquillaRoleCheck] = await pool.query(
        'SELECT 1 FROM usuarios_roles WHERE id_usuario = ? AND id_rol = ?',
        [idUsuario, taquillaRoleId]
      );
      if (taquillaRoleCheck.length === 0) {
        await pool.query(
          'INSERT INTO usuarios_roles (id_usuario, id_rol) VALUES (?, ?)',
          [idUsuario, taquillaRoleId]
        );
      }
    }

    // Para operadores de taquilla especiales, auto-asignar rol taquilla
    const correosTaquilla = ['yadiran0514@gmail.com'];
    if (correosTaquilla.includes(correo)) {
      const taquillaRoleId = await obtenerOCrearRolId(
        'taquilla',
        'Operador de taquilla encargado de validar, escanear y canjear boletos'
      );
      const [taquillaRoleCheck] = await pool.query(
        'SELECT 1 FROM usuarios_roles WHERE id_usuario = ? AND id_rol = ?',
        [idUsuario, taquillaRoleId]
      );
      if (taquillaRoleCheck.length === 0) {
        await pool.query(
          'INSERT INTO usuarios_roles (id_usuario, id_rol) VALUES (?, ?)',
          [idUsuario, taquillaRoleId]
        );
      }
    }

    // 3. Obtener todos los roles asignados a este usuario
    const userRoles = await obtenerRolUsuario(idUsuario);

    // Devolver objeto completo de sesión
    res.json({
      id_usuario: idUsuario,
      nombre: usuario.nombre,
      correo: usuario.correo,
      avatar_url: usuario.avatar_url,
      roles: userRoles,
      activo: usuario.activo
    });

  } catch (error) {
    console.error('Error al iniciar sesión con Google:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 3. GET /api/estaciones
// ==========================================
app.get('/api/estaciones', async (req, res) => {
  try {
    const [estaciones] = await pool.query('SELECT * FROM estaciones WHERE activa = TRUE ORDER BY orden ASC');
    res.json(estaciones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 4. GET /api/preguntas/:id_estacion
// ==========================================
app.get('/api/preguntas/:id_estacion', async (req, res) => {
  const idEstacion = req.params.id_estacion;
  try {
    // Verificar si la estación está activa
    const [[estacion]] = await pool.query('SELECT activa FROM estaciones WHERE id_estacion = ?', [idEstacion]);
    if (!estacion || !estacion.activa) {
      return res.status(403).json({ error: 'La estación se encuentra inactiva.' });
    }

    // 1. Obtener todas las preguntas de la estación
    const [preguntas] = await pool.query(
      'SELECT id_pregunta, pregunta FROM preguntas WHERE id_estacion = ? AND activa = TRUE',
      [idEstacion]
    );

    if (preguntas.length === 0) {
      return res.json([]);
    }

    // 2. Para cada pregunta, obtener sus respuestas
    const idsPreguntas = preguntas.map(p => p.id_pregunta);
    const [respuestas] = await pool.query(
      'SELECT id_respuesta, id_pregunta, texto_respuesta, es_correcta FROM respuestas WHERE id_pregunta IN (?) AND activa = TRUE',
      [idsPreguntas]
    );

    // 3. Mapear las respuestas a sus respectivas preguntas
    const preguntasConRespuestas = preguntas.map(p => {
      const respDePregunta = respuestas
        .filter(r => r.id_pregunta === p.id_pregunta)
        .map(r => ({
          id_respuesta: r.id_respuesta,
          texto_respuesta: r.texto_respuesta,
          es_correcta: Boolean(r.es_correcta)
        }));

      return {
        id_pregunta: p.id_pregunta,
        pregunta: p.pregunta,
        respuestas: respDePregunta
      };
    });

    res.json(preguntasConRespuestas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 5. POST /api/progreso/completar
// ==========================================
app.post('/api/progreso/completar', permitirJugador, async (req, res) => {
  const { id_usuario, id_estacion, puntaje, aciertos, errores, aprobada } = req.body;

  if (!id_usuario || !id_estacion) {
    return res.status(400).json({ error: 'Faltan parámetros obligatorios: id_usuario o id_estacion.' });
  }

  try {
    const [[estacion]] = await pool.query('SELECT activa FROM estaciones WHERE id_estacion = ?', [id_estacion]);
    if (!estacion || !estacion.activa) {
      return res.status(403).json({ error: 'La estación se encuentra inactiva y no se puede guardar progreso.' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const isPassed = Boolean(aprobada);

    // 1. Consultar el progreso actual del usuario para esta estación
    const [[progresoExistente]] = await connection.query(
      'SELECT * FROM progreso_usuario WHERE id_usuario = ? AND id_estacion = ?',
      [id_usuario, id_estacion]
    );

    let nuevoPuntaje = puntaje || 0;
    let nuevosAciertos = aciertos || 0;
    let nuevosErrores = errores || 0;
    let nuevoCompletada = isPassed;
    let nuevoAprobada = isPassed;
    let nuevoFechaCompletado = isPassed ? new Date() : null;

    if (progresoExistente) {
      // Mantener completada / aprobada si ya era true
      nuevoCompletada = progresoExistente.completada || isPassed;
      nuevoAprobada = progresoExistente.aprobada || isPassed;

      // Mantener la mejor puntuación histórica
      if (progresoExistente.puntaje >= nuevoPuntaje) {
        nuevoPuntaje = progresoExistente.puntaje;
        nuevosAciertos = progresoExistente.aciertos;
        nuevosErrores = progresoExistente.errores;
        nuevoFechaCompletado = progresoExistente.fecha_completado;
      }
    }

    // 2. Insertar o actualizar el progreso
    await connection.query(
      `INSERT INTO progreso_usuario 
        (id_usuario, id_estacion, completada, aprobada, puntaje, aciertos, errores, fecha_inicio, fecha_completado)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
       ON DUPLICATE KEY UPDATE 
         completada = VALUES(completada),
         aprobada = VALUES(aprobada),
         puntaje = VALUES(puntaje),
         aciertos = VALUES(aciertos),
         errores = VALUES(errores),
         fecha_completado = VALUES(fecha_completado),
         updated_at = CURRENT_TIMESTAMP`,
      [id_usuario, id_estacion, nuevoCompletada, nuevoAprobada, nuevoPuntaje, nuevosAciertos, nuevosErrores, nuevoFechaCompletado]
    );

    // Registrar en auditoria_acciones que el usuario completó la estación
    await connection.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'usuario', 'COMPLETAR_ESTACION', 'progreso_usuario', ?, ?)`,
      [id_usuario, String(id_estacion), `Usuario completó estación ${id_estacion} con puntaje ${puntaje} (Guardado mejor puntaje: ${nuevoPuntaje})`]
    );

    // 3. Verificar si el usuario ha completado todas las estaciones obligatorias [2, 3, 4, 5, 6]
    const [progreso] = await connection.query(
      'SELECT id_estacion FROM progreso_usuario WHERE id_usuario = ? AND aprobada = TRUE',
      [id_usuario]
    );

    const estacionesAprobadas = progreso.map(p => p.id_estacion);
    const estacionesObligatorias = [2, 3, 4, 5, 6];
    const tieneTodoAprobado = estacionesObligatorias.every(id => estacionesAprobadas.includes(id));

    let boletoGenerado = null;

    if (tieneTodoAprobado) {
      console.log(`🎉 Usuario ${id_usuario} ha completado todo el recorrido!`);

      // Registrar auditoria de completar recorrido
      await connection.query(
        `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
         VALUES (?, 'usuario', 'COMPLETAR_RECORRIDO', 'progreso_usuario', ?, 'Usuario completó la totalidad del recorrido del museo (estaciones 2, 3, 4, 5, 6)')`,
        [id_usuario, String(id_usuario)]
      );

      // Verificar si ya tiene un boleto existente
      const [[boletoExistente]] = await connection.query(
        'SELECT * FROM boletos WHERE id_usuario = ?',
        [id_usuario]
      );

      if (!boletoExistente) {
        // Generar Folio y QR token únicos
        const folio = await generarFolioUnico(connection);
        const qrToken = crypto.randomBytes(16).toString('hex');
        const host = req.get('host') || 'localhost:3000';
        const qrData = `http://${host}/taquilla?token=${qrToken}`;

        // Insertar boleto
        const [boletoResult] = await connection.query(
          `INSERT INTO boletos (id_usuario, folio, qr_token, qr_data, estado, usado)
           VALUES (?, ?, ?, ?, 'activo', FALSE)`,
          [id_usuario, folio, qrToken, qrData]
        );

        const newBoletoId = boletoResult.insertId;

        // Registrar movimiento del boleto (Historial)
        await connection.query(
          `INSERT INTO movimientos_boleto (id_boleto, id_usuario, tipo_movimiento, observaciones)
           VALUES (?, ?, 'generacion', 'Boleto generado automáticamente por completar la totalidad del recorrido del museo')`,
          [newBoletoId, id_usuario]
        );

        // Registrar auditoría de boleto generado
        await connection.query(
          `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
           VALUES (?, 'usuario', 'GENERAR_BOLETO', 'boletos', ?, 'Boleto generado automáticamente por completar recorrido')`,
          [id_usuario, String(newBoletoId)]
        );



        // Obtener el boleto insertado para retornarlo
        const [[nuevoBoleto]] = await connection.query('SELECT * FROM boletos WHERE id_boleto = ?', [newBoletoId]);
        boletoGenerado = nuevoBoleto;
      } else {
        boletoGenerado = boletoExistente;
      }
    }

    await connection.commit();

    const [[progresoFinal]] = await pool.query(
      'SELECT * FROM progreso_usuario WHERE id_usuario = ? AND id_estacion = ?',
      [id_usuario, id_estacion]
    );

    res.json({ 
      message: 'Progreso guardado correctamente.', 
      progreso: { ...progresoFinal, boletoGenerado },
      boletoGenerado 
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error guardando progreso con transacción:', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// ==========================================
// 5a. POST /api/progreso/inicializar
// ==========================================
app.post('/api/progreso/inicializar', permitirJugador, async (req, res) => {
  const { id_usuario, id_estacion } = req.body;

  if (!id_usuario || !id_estacion) {
    return res.status(400).json({ error: 'Faltan parámetros obligatorios: id_usuario o id_estacion.' });
  }

  try {
    // Verificar si la estación está activa
    const [[estacion]] = await pool.query('SELECT activa FROM estaciones WHERE id_estacion = ?', [id_estacion]);
    if (!estacion || !estacion.activa) {
      return res.status(403).json({ error: 'La estación se encuentra inactiva.' });
    }

    // Intentar insertar registro inicial si no existe, o actualizar fecha_inicio solo si es NULL.
    // Esto evita duplicados y mantiene puntuaciones previas.
    await pool.query(
      `INSERT INTO progreso_usuario 
        (id_usuario, id_estacion, completada, aprobada, puntaje, aciertos, errores, fecha_inicio, fecha_completado)
       VALUES (?, ?, FALSE, FALSE, 0, 0, 0, CURRENT_TIMESTAMP, NULL)
       ON DUPLICATE KEY UPDATE 
         fecha_inicio = COALESCE(fecha_inicio, CURRENT_TIMESTAMP)`,
      [id_usuario, id_estacion]
    );

    const [[progreso]] = await pool.query(
      'SELECT * FROM progreso_usuario WHERE id_usuario = ? AND id_estacion = ?',
      [id_usuario, id_estacion]
    );

    res.json({ message: 'Progreso inicializado.', progreso });
  } catch (error) {
    console.error('Error inicializando progreso:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 5a-1. POST /api/progreso/reset
// ==========================================
app.post('/api/progreso/reset', permitirJugador, async (req, res) => {
  const { id_usuario } = req.body;

  if (!id_usuario) {
    return res.status(400).json({ error: 'Falta el parámetro id_usuario.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Eliminar todo el progreso e historial asociado al usuario
    await connection.query('DELETE FROM progreso_usuario WHERE id_usuario = ?', [id_usuario]);
    await connection.query('DELETE FROM intentos_estacion WHERE id_usuario = ?', [id_usuario]);
    await connection.query('DELETE FROM partidas_minijuego WHERE id_usuario = ?', [id_usuario]);
    await connection.query('DELETE FROM boletos WHERE id_usuario = ?', [id_usuario]);

    // Registrar en auditoria_acciones
    await connection.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'usuario', 'REINICIAR_PROGRESO', 'progreso_usuario', ?, 'Usuario reinició todo su progreso de estaciones y boletos')`,
      [id_usuario, String(id_usuario)]
    );

    await connection.commit();
    res.json({ message: 'Progreso reiniciado correctamente en la base de datos.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error al reiniciar progreso:', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// ==========================================
// 5b. POST /api/partidas-minijuego
// ==========================================
app.post('/api/partidas-minijuego', permitirJugador, async (req, res) => {
  const { id_usuario, id_estacion, puntaje, aprobado } = req.body;

  if (!id_usuario) {
    return res.status(400).json({ error: 'Falta el parámetro id_usuario.' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO partidas_minijuego (id_usuario, id_estacion, puntaje, aprobado, fecha_partida)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [id_usuario, id_estacion || null, puntaje || 0, Boolean(aprobado)]
    );

    res.status(201).json({
      message: 'Partida de minijuego registrada correctamente.',
      id_partida: result.insertId
    });
  } catch (error) {
    console.error('Error registrando partida de minijuego:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 6. POST /api/intentos
// ==========================================
app.post('/api/intentos', permitirJugador, async (req, res) => {
  const { id_usuario, id_estacion, puntaje, aciertos, errores, aprobado } = req.body;

  if (!id_usuario || !id_estacion) {
    return res.status(400).json({ error: 'Faltan parámetros: id_usuario o id_estacion' });
  }

  try {
    // Verificar si la estación está activa
    const [[estacion]] = await pool.query('SELECT activa FROM estaciones WHERE id_estacion = ?', [id_estacion]);
    if (!estacion || !estacion.activa) {
      return res.status(403).json({ error: 'La estación se encuentra inactiva.' });
    }

    const [result] = await pool.query(
      `INSERT INTO intentos_estacion (id_usuario, id_estacion, puntaje, aciertos, errores, aprobado)
       VALUES (?, ?, ?, ?, ?, ? )`,
      [id_usuario, id_estacion, puntaje || 0, aciertos || 0, errores || 0, Boolean(aprobado)]
    );

    res.status(201).json({
      message: 'Intento de estación registrado correctamente.',
      id_intento: result.insertId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 6a. PUT /api/intentos/:id_intento
// ==========================================
app.put('/api/intentos/:id_intento', permitirJugador, async (req, res) => {
  const idIntento = req.params.id_intento;
  const { puntaje, aciertos, errores, aprobado } = req.body;

  try {
    await pool.query(
      `UPDATE intentos_estacion 
       SET puntaje = ?, aciertos = ?, errores = ?, aprobado = ?
       WHERE id_intento = ?`,
      [puntaje || 0, aciertos || 0, errores || 0, Boolean(aprobado), idIntento]
    );

    res.json({ message: 'Intento de estación actualizado correctamente.' });
  } catch (error) {
    console.error('Error al actualizar intento:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 7. POST /api/respuestas-usuario
// ==========================================
app.post('/api/respuestas-usuario', permitirJugador, async (req, res) => {
  const { id_intento, id_usuario, id_estacion, pregunta_texto, respuesta_texto, es_correcta } = req.body;

  if (!id_intento || !id_usuario || !id_estacion || !pregunta_texto || !respuesta_texto) {
    return res.status(400).json({ error: 'Faltan parámetros obligatorios en la petición.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Buscar o insertar la pregunta en la tabla 'preguntas'
    let id_pregunta;
    const [[preguntaExistente]] = await connection.query(
      'SELECT id_pregunta FROM preguntas WHERE id_estacion = ? AND pregunta = ?',
      [id_estacion, pregunta_texto]
    );

    if (preguntaExistente) {
      id_pregunta = preguntaExistente.id_pregunta;
    } else {
      const [insertPregunta] = await connection.query(
        'INSERT INTO preguntas (id_estacion, pregunta, activa) VALUES (?, ?, TRUE)',
        [id_estacion, pregunta_texto]
      );
      id_pregunta = insertPregunta.insertId;
    }

    // 2. Buscar o insertar la respuesta en la tabla 'respuestas'
    let id_respuesta;
    const [[respuestaExistente]] = await connection.query(
      'SELECT id_respuesta FROM respuestas WHERE id_pregunta = ? AND texto_respuesta = ?',
      [id_pregunta, respuesta_texto]
    );

    if (respuestaExistente) {
      id_respuesta = respuestaExistente.id_respuesta;
    } else {
      const [insertRespuesta] = await connection.query(
        'INSERT INTO respuestas (id_pregunta, texto_respuesta, es_correcta, activa) VALUES (?, ?, ?, TRUE)',
        [id_pregunta, respuesta_texto, Boolean(es_correcta)]
      );
      id_respuesta = insertRespuesta.insertId;
    }

    // 3. Insertar la respuesta del usuario en 'respuestas_usuario'
    // Evitar insertar respuestas duplicadas para el mismo intento y pregunta
    const [[respuestaUsuarioExistente]] = await connection.query(
      'SELECT id_respuesta_usuario FROM respuestas_usuario WHERE id_intento = ? AND id_usuario = ? AND id_pregunta = ?',
      [id_intento, id_usuario, id_pregunta]
    );

    if (!respuestaUsuarioExistente) {
      await connection.query(
        `INSERT INTO respuestas_usuario 
          (id_intento, id_usuario, id_pregunta, id_respuesta, es_correcta, fecha_respuesta)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [id_intento, id_usuario, id_pregunta, id_respuesta, Boolean(es_correcta)]
      );
    } else {
      // Si ya existe en este intento, la actualizamos
      await connection.query(
        `UPDATE respuestas_usuario 
         SET id_respuesta = ?, es_correcta = ?, fecha_respuesta = CURRENT_TIMESTAMP
         WHERE id_intento = ? AND id_usuario = ? AND id_pregunta = ?`,
        [id_respuesta, Boolean(es_correcta), id_intento, id_usuario, id_pregunta]
      );
    }

    await connection.commit();
    res.status(201).json({ message: 'Respuesta guardada correctamente.', id_pregunta, id_respuesta });
  } catch (error) {
    await connection.rollback();
    console.error('Error guardando respuestas del usuario dinámicamente:', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// ==========================================
// 8. GET /api/progreso/:id_usuario
// ==========================================
app.get('/api/progreso/:id_usuario', permitirJugador, async (req, res) => {
  const idUsuario = req.params.id_usuario;
  try {
    const [progreso] = await pool.query(
      `SELECT p.*, e.nombre AS nombre_estacion, e.tipo AS tipo_estacion
       FROM progreso_usuario p
       JOIN estaciones e ON p.id_estacion = e.id_estacion
       WHERE p.id_usuario = ?`,
      [idUsuario]
    );
    res.json(progreso);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 9. POST /api/boletos
// ==========================================
app.post('/api/boletos', permitirJugador, async (req, res) => {
  const { id_usuario } = req.body;

  if (!id_usuario) {
    return res.status(400).json({ error: 'Falta el id_usuario.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Verificar si el usuario ha completado las estaciones clave [2, 3, 4, 5, 6]
    const [progreso] = await connection.query(
      'SELECT id_estacion FROM progreso_usuario WHERE id_usuario = ? AND aprobada = TRUE',
      [id_usuario]
    );

    const estacionesAprobadas = progreso.map(p => p.id_estacion);
    const estacionesObligatorias = [2, 3, 4, 5, 6];
    const tieneTodoAprobado = estacionesObligatorias.every(id => estacionesAprobadas.includes(id));

    if (!tieneTodoAprobado) {
      console.warn(`Usuario ${id_usuario} intenta generar boleto sin completar todo el recorrido. Estaciones aprobadas:`, estacionesAprobadas);
    }

    // 2. Verificar si ya tiene un boleto existente
    const [[boletoExistente]] = await connection.query(
      'SELECT * FROM boletos WHERE id_usuario = ?',
      [id_usuario]
    );

    if (boletoExistente) {
      await connection.commit();
      return res.json(boletoExistente);
    }

    // 3. Generar Folio y QR token únicos
    const folio = await generarFolioUnico(connection);
    const qrToken = crypto.randomBytes(16).toString('hex');
    const host = req.get('host') || 'localhost:3000';
    const qrData = `http://${host}/taquilla?token=${qrToken}`;

    // 4. Insertar en la BD
    const [boletoResult] = await connection.query(
      `INSERT INTO boletos (id_usuario, folio, qr_token, qr_data, estado, usado)
       VALUES (?, ?, ?, ?, 'activo', FALSE)`,
      [id_usuario, folio, qrToken, qrData]
    );

    const newBoletoId = boletoResult.insertId;



    // Registrar movimiento de boleto
    await connection.query(
      `INSERT INTO movimientos_boleto (id_boleto, id_usuario, tipo_movimiento, observaciones)
       VALUES (?, ?, 'generacion', 'Boleto generado al completar recorrido')`,
      [newBoletoId, id_usuario]
    );

    const [[nuevoBoleto]] = await connection.query('SELECT * FROM boletos WHERE id_boleto = ?', [newBoletoId]);

    // Registrar auditoría
    await connection.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'usuario', 'GENERAR_BOLETO', 'boletos', ?, 'Boleto generado al completar recorrido')`,
      [id_usuario, String(newBoletoId)]
    );

    await connection.commit();
    res.status(201).json(nuevoBoleto);
  } catch (error) {
    await connection.rollback();
    console.error('Error al generar boleto:', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// ==========================================
// 9b. GET /api/boletos/count-today
// ==========================================
app.get('/api/boletos/count-today', async (req, res) => {
  try {
    const [[result]] = await pool.query(
      `SELECT COUNT(*) AS count 
       FROM boletos 
       WHERE DATE(fecha_generacion) = CURDATE()`
    );
    res.json({ count: result.count || 0 });
  } catch (error) {
    console.error('Error al contar boletos de hoy:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 10. GET /api/boletos/:folio
// ==========================================
app.get('/api/boletos/:folio', async (req, res) => {
  const folio = req.params.folio;
  try {
    const [[boleto]] = await pool.query(
      `SELECT b.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario
       FROM boletos b
       JOIN usuarios u ON b.id_usuario = u.id_usuario
       WHERE b.folio = ?`,
      [folio]
    );

    if (!boleto) {
      return res.status(404).json({ error: 'Boleto no encontrado por folio.' });
    }

    res.json(boleto);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 11. GET /api/taquilla/boleto/folio/:folio
// ==========================================
app.get('/api/taquilla/boleto/folio/:folio', permitirTaquillaOAdmin, async (req, res) => {
  const folio = req.params.folio;
  const idOperador = req.headers['x-user-id'];

  try {
    const [[boleto]] = await pool.query(
      `SELECT b.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario, u.avatar_url AS avatar_usuario
       FROM boletos b
       JOIN usuarios u ON b.id_usuario = u.id_usuario
       WHERE b.folio = ?`,
      [folio]
    );

    if (!boleto) {
      return res.status(404).json({ error: 'Boleto no encontrado en taquilla.' });
    }

    // Registrar movimiento de consulta
    await pool.query(
      `INSERT INTO movimientos_boleto (id_boleto, id_usuario, realizado_por, tipo_movimiento, observaciones)
       VALUES (?, ?, ?, 'consulta', 'Consulta de boleto por folio en taquilla')`,
      [boleto.id_boleto, boleto.id_usuario, idOperador]
    );

    res.json(boleto);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 12. GET /api/taquilla/boleto/qr/:qr_token
// ==========================================
app.get('/api/taquilla/boleto/qr/:qr_token', permitirTaquillaOAdmin, async (req, res) => {
  const qrToken = req.params.qr_token;
  const idOperador = req.headers['x-user-id'];

  try {
    // 1. Buscar boleto por QR
    const [[boleto]] = await pool.query(
      `SELECT b.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario, u.avatar_url AS avatar_usuario
       FROM boletos b
       JOIN usuarios u ON b.id_usuario = u.id_usuario
       WHERE b.qr_token = ?`,
      [qrToken]
    );

    if (!boleto) {
      // Registrar escaneo como no encontrado
      await pool.query(
        `INSERT INTO escaneos_qr_boleto (qr_token, escaneado_por, resultado, observaciones)
         VALUES (?, ?, 'no_encontrado', 'QR no coincide con ningún boleto registrado')`,
        [qrToken, idOperador]
      );
      return res.status(404).json({ error: 'QR de boleto no registrado.' });
    }

    // 2. Registrar el escaneo
    const resultadoEscaneo = boleto.estado; // activo, canjeado, cancelado, vencido
    await pool.query(
      `INSERT INTO escaneos_qr_boleto (id_boleto, qr_token, escaneado_por, resultado, observaciones)
       VALUES (?, ?, ?, ?, 'Boleto escaneado por taquilla')`,
      [boleto.id_boleto, qrToken, idOperador, resultadoEscaneo]
    );

    // 3. Actualizar último escaneo
    await pool.query(
      'UPDATE boletos SET ultimo_escaneo = CURRENT_TIMESTAMP WHERE id_boleto = ?',
      [boleto.id_boleto]
    );

    // 4. Registrar movimiento tipo consulta_qr
    await pool.query(
      `INSERT INTO movimientos_boleto (id_boleto, id_usuario, realizado_por, tipo_movimiento, observaciones)
       VALUES (?, ?, ?, 'consulta_qr', 'Boleto escaneado y consultado vía QR')`,
      [boleto.id_boleto, boleto.id_usuario, idOperador]
    );

    res.json(boleto);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 13. POST /api/taquilla/boletos/:id_boleto/canjear
// ==========================================
app.post('/api/taquilla/boletos/:id_boleto/canjear', permitirTaquillaOAdmin, async (req, res) => {
  const idBoleto = req.params.id_boleto;
  const idOperador = req.headers['x-user-id'];
  const { observaciones } = req.body;

  try {
    // 1. Obtener boleto
    const [[boleto]] = await pool.query('SELECT * FROM boletos WHERE id_boleto = ?', [idBoleto]);

    if (!boleto) {
      return res.status(404).json({ error: 'Boleto no encontrado.' });
    }

    // 2. Validar que esté activo y no canjeado
    if (boleto.estado !== 'activo' || boleto.usado) {
      return res.status(400).json({
        error: `No se puede canjear el boleto. Estatus actual: ${boleto.estado}, Usado: ${boleto.usado ? 'Sí' : 'No'}`
      });
    }

    // 3. Actualizar boleto
    await pool.query(
      `UPDATE boletos 
       SET estado = 'canjeado',
           usado = TRUE,
           fecha_uso = CURRENT_TIMESTAMP,
           fecha_canje = CURRENT_TIMESTAMP,
           canjeado_por = ?
       WHERE id_boleto = ?`,
      [idOperador, idBoleto]
    );

    // 4. Registrar movimiento canje
    await pool.query(
      `INSERT INTO movimientos_boleto (id_boleto, id_usuario, realizado_por, tipo_movimiento, observaciones)
       VALUES (?, ?, ?, 'canje', ?)`,
      [idBoleto, boleto.id_usuario, idOperador, observaciones || 'Boleto canjeado en taquilla']
    );

    // 5. Registrar auditoría
    await pool.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'taquilla', 'CANJEAR_BOLETO', 'boletos', ?, 'Boleto canjeado por operador')`,
      [idOperador, idBoleto]
    );

    res.json({ message: 'Boleto canjeado exitosamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 14. POST /api/taquilla/boletos/:id_boleto/cancelar
// ==========================================
app.post('/api/taquilla/boletos/:id_boleto/cancelar', permitirTaquillaOAdmin, async (req, res) => {
  const idBoleto = req.params.id_boleto;
  const idOperador = req.headers['x-user-id'];
  const { observaciones } = req.body;

  try {
    const [[boleto]] = await pool.query('SELECT * FROM boletos WHERE id_boleto = ?', [idBoleto]);

    if (!boleto) {
      return res.status(404).json({ error: 'Boleto no encontrado.' });
    }

    // Actualizar estado a cancelado
    await pool.query(
      "UPDATE boletos SET estado = 'cancelado' WHERE id_boleto = ?",
      [idBoleto]
    );

    // Registrar movimiento cancelacion
    await pool.query(
      `INSERT INTO movimientos_boleto (id_boleto, id_usuario, realizado_por, tipo_movimiento, observaciones)
       VALUES (?, ?, ?, 'cancelacion', ?)`,
      [idBoleto, boleto.id_usuario, idOperador, observaciones || 'Boleto cancelado / dado de baja']
    );

    // Registrar auditoría
    await pool.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'taquilla', 'CANCELAR_BOLETO', 'boletos', ?, 'Boleto cancelado por operador')`,
      [idOperador, idBoleto]
    );

    res.json({ message: 'Boleto cancelado correctamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 14b. POST /api/admin/boletos/:id_boleto/activar (Solo Admin/Taquilla - Reactivar boleto)
// ==========================================
app.post('/api/admin/boletos/:id_boleto/activar', permitirTaquillaOAdmin, async (req, res) => {
  const idBoleto = req.params.id_boleto;
  const idOperador = req.headers['x-user-id'];
  const { observaciones } = req.body;

  try {
    const [[boleto]] = await pool.query('SELECT * FROM boletos WHERE id_boleto = ?', [idBoleto]);

    if (!boleto) {
      return res.status(404).json({ error: 'Boleto no encontrado.' });
    }

    // Actualizar estado a activo y usado a FALSE
    await pool.query(
      "UPDATE boletos SET estado = 'activo', usado = FALSE, fecha_uso = NULL, fecha_canje = NULL, canjeado_por = NULL WHERE id_boleto = ?",
      [idBoleto]
    );

    // Registrar movimiento reactivacion
    await pool.query(
      `INSERT INTO movimientos_boleto (id_boleto, id_usuario, realizado_por, tipo_movimiento, observaciones)
       VALUES (?, ?, ?, 'reactivacion', ?)`,
      [idBoleto, boleto.id_usuario, idOperador, observaciones || 'Boleto reactivado / activado']
    );

    // Registrar auditoría
    await pool.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'taquilla', 'REACTIVAR_BOLETO', 'boletos', ?, 'Boleto reactivado por operador')`,
      [idOperador, idBoleto]
    );

    res.json({ message: 'Boleto reactivado correctamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 14c. DELETE /api/admin/boletos/:id_boleto (Solo Admin/Taquilla - Eliminar boleto permanentemente)
// ==========================================
app.delete('/api/admin/boletos/:id_boleto', permitirTaquillaOAdmin, async (req, res) => {
  const idBoleto = req.params.id_boleto;
  const idOperador = req.headers['x-user-id'];

  try {
    const [[boleto]] = await pool.query('SELECT * FROM boletos WHERE id_boleto = ?', [idBoleto]);

    if (!boleto) {
      return res.status(404).json({ error: 'Boleto no encontrado.' });
    }

    // Eliminar boleto (las relaciones cascade se encargan de movimientos y escaneos asociados)
    await pool.query('DELETE FROM boletos WHERE id_boleto = ?', [idBoleto]);

    // Registrar auditoría
    await pool.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'taquilla', 'ELIMINAR_BOLETO', 'boletos', ?, ?)`,
      [idOperador, String(idBoleto), `Boleto folio ${boleto.folio} eliminado permanentemente por operador`]
    );

    res.json({ message: 'Boleto eliminado correctamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 15. GET /api/admin/usuarios (Solo Admin)
// ==========================================
app.get('/api/admin/usuarios', permitirAdmin, async (req, res) => {
  try {
    const range = obtenerRangoFechasAdmin(req);
    const conditions = [];
    const params = [];
    if (range) {
      conditions.push(condicionRangoFechas('u.fecha_registro', range));
      params.push(...parametrosRangoFechas(range));
    }

    const [usuarios] = await pool.query(
      `SELECT u.*, GROUP_CONCAT(r.nombre SEPARATOR ', ') AS roles
       FROM usuarios u
       LEFT JOIN usuarios_roles ur ON u.id_usuario = ur.id_usuario
       LEFT JOIN roles r ON ur.id_rol = r.id_rol
       ${whereDesdeCondiciones(conditions)}
       GROUP BY u.id_usuario
       ORDER BY u.fecha_registro DESC`,
      params
    );
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 16. GET /api/admin/boletos (Solo Admin)
// ==========================================
app.get('/api/admin/boletos', permitirAdmin, async (req, res) => {
  try {
    const range = obtenerRangoFechasAdmin(req);
    const params = [];
    let dateWhere = '';
    if (range) {
      const dateConditions = ['b.fecha_generacion', 'b.fecha_uso', 'b.fecha_canje', 'b.ultimo_escaneo']
        .map((column) => {
          params.push(...parametrosRangoFechas(range));
          return condicionRangoFechas(column, range);
        });
      dateWhere = `WHERE (${dateConditions.join(' OR ')})`;
    }

    const [boletos] = await pool.query(
      `SELECT b.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario, u2.nombre AS nombre_canjeador
       FROM boletos b
       JOIN usuarios u ON b.id_usuario = u.id_usuario
       LEFT JOIN usuarios u2 ON b.canjeado_por = u2.id_usuario
       ${dateWhere}
       ORDER BY b.fecha_generacion DESC`,
      params
    );
    res.json(boletos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 17. GET /api/admin/progreso (Solo Admin)
// ==========================================
app.get('/api/admin/progreso', permitirAdmin, async (req, res) => {
  try {
    const range = obtenerRangoFechasAdmin(req);
    const conditions = [];
    const params = [];
    if (range) {
      conditions.push(condicionRangoFechas('COALESCE(p.fecha_completado, p.updated_at, p.created_at)', range));
      params.push(...parametrosRangoFechas(range));
    }

    const [progreso] = await pool.query(
      `SELECT p.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario, e.nombre AS nombre_estacion
       FROM progreso_usuario p
       JOIN usuarios u ON p.id_usuario = u.id_usuario
       JOIN estaciones e ON p.id_estacion = e.id_estacion
       ${whereDesdeCondiciones(conditions)}
       ORDER BY p.updated_at DESC`,
      params
    );
    res.json(progreso);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 18. GET /api/admin/movimientos-boletos (Solo Admin)
// ==========================================
app.get('/api/admin/movimientos-boletos', permitirAdmin, async (req, res) => {
  try {
    const range = obtenerRangoFechasAdmin(req);
    const conditions = [];
    const params = [];
    if (range) {
      conditions.push(condicionRangoFechas('m.fecha_movimiento', range));
      params.push(...parametrosRangoFechas(range));
    }

    const [movimientos] = await pool.query(
      `SELECT m.*, b.folio AS folio_boleto, u.nombre AS nombre_usuario, u2.nombre AS nombre_operador
       FROM movimientos_boleto m
       JOIN boletos b ON m.id_boleto = b.id_boleto
       JOIN usuarios u ON m.id_usuario = u.id_usuario
       LEFT JOIN usuarios u2 ON m.realizado_por = u2.id_usuario
       ${whereDesdeCondiciones(conditions)}
       ORDER BY m.fecha_movimiento DESC`,
      params
    );
    res.json(movimientos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19. GET /api/admin/auditoria (Solo Admin)
// ==========================================
app.get('/api/admin/auditoria', permitirAdmin, async (req, res) => {
  try {
    const range = obtenerRangoFechasAdmin(req);
    const conditions = [];
    const params = [];
    if (range) {
      conditions.push(condicionRangoFechas('a.fecha_accion', range));
      params.push(...parametrosRangoFechas(range));
    }

    const [auditoria] = await pool.query(
      `SELECT a.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario
       FROM auditoria_acciones a
       LEFT JOIN usuarios u ON a.id_usuario = u.id_usuario
       ${whereDesdeCondiciones(conditions)}
       ORDER BY a.fecha_accion DESC`,
      params
    );
    res.json(auditoria);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19b. GET /api/usuarios/:id_usuario/roles (Consultar roles reales del usuario)
// ==========================================
app.get('/api/usuarios/:id_usuario/roles', async (req, res) => {
  const idUsuario = req.params.id_usuario;
  try {
    const roles = await obtenerRolUsuario(idUsuario);
    res.json({ id_usuario: idUsuario, roles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19c. GET /api/admin/dashboard-stats (Solo Admin)
// ==========================================
app.get('/api/admin/dashboard-stats', permitirAdmin, async (req, res) => {
  try {
    const range = obtenerRangoFechasAdmin(req);
    const rangeParams = () => parametrosRangoFechas(range);
    const whereDate = (column) => range ? `WHERE ${condicionRangoFechas(column, range)}` : '';
    const andDate = (column) => range ? `AND ${condicionRangoFechas(column, range)}` : '';

    const queries = {
      usuarios: {
        sql: `SELECT COUNT(*) AS count FROM usuarios ${whereDate('fecha_registro')}`,
        params: rangeParams()
      },
      estaciones: {
        sql: 'SELECT COUNT(*) AS count FROM estaciones',
        params: []
      },
      preguntas: {
        sql: `SELECT COUNT(*) AS count FROM preguntas ${whereDate('created_at')}`,
        params: rangeParams()
      },
      boletos: {
        sql: `SELECT COUNT(*) AS count FROM boletos ${whereDate('fecha_generacion')}`,
        params: rangeParams()
      },
      boletosUsados: {
        sql: `SELECT COUNT(*) AS count FROM boletos WHERE (usado = 1 OR estado = 'canjeado') ${andDate('COALESCE(fecha_canje, fecha_uso)')}`,
        params: rangeParams()
      },
      usuariosProgreso: {
        sql: `SELECT COUNT(DISTINCT id_usuario) AS count FROM progreso_usuario WHERE completada = 0 ${andDate('COALESCE(updated_at, created_at)')}`,
        params: rangeParams()
      },
      usuariosCompletado: {
        sql: `SELECT COUNT(*) AS count FROM (
          SELECT id_usuario, MAX(COALESCE(fecha_completado, updated_at, created_at)) AS fecha_final
          FROM progreso_usuario
          WHERE aprobada = TRUE AND id_estacion IN (2, 3, 4, 5, 6)
          GROUP BY id_usuario
          HAVING COUNT(DISTINCT id_estacion) = 5 ${range ? `AND ${condicionRangoFechas('fecha_final', range)}` : ''}
        ) AS sub`,
        params: rangeParams()
      },
      escaneos: {
        sql: `SELECT COUNT(*) AS count FROM escaneos_qr_boleto ${whereDate('fecha_escaneo')}`,
        params: rangeParams()
      },
      intentosPorEstacion: {
        sql: `SELECT e.id_estacion, e.nombre, COUNT(i.id_intento) AS total_intentos
          FROM estaciones e
          LEFT JOIN intentos_estacion i ON e.id_estacion = i.id_estacion ${range ? `AND ${condicionRangoFechas('i.fecha_intento', range)}` : ''}
          GROUP BY e.id_estacion
          ORDER BY e.orden`,
        params: rangeParams()
      }
    };

    const results = {};
    const keys = Object.keys(queries);
    const promises = keys.map(async (key) => {
      const queryConfig = queries[key];
      const [rows] = await pool.query(queryConfig.sql, queryConfig.params);
      if (key === 'intentosPorEstacion') {
        results[key] = rows;
      } else {
        results[key] = rows[0]?.count ?? 0;
      }
    });

    await Promise.all(promises);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19d. GET /api/admin/roles-permisos (Solo Admin)
// ==========================================
app.get('/api/admin/roles-permisos', permitirAdmin, async (req, res) => {
  try {
    const range = obtenerRangoFechasAdmin(req);
    const conditions = [];
    const params = [];
    if (range) {
      conditions.push(condicionRangoFechas('ur.fecha_asignacion', range));
      params.push(...parametrosRangoFechas(range));
    }

    const [roles] = await pool.query('SELECT * FROM roles ORDER BY id_rol');
    const [usuariosRoles] = await pool.query(
      `SELECT ur.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario, r.nombre AS nombre_rol, u2.nombre AS nombre_asignador
       FROM usuarios_roles ur
       JOIN usuarios u ON ur.id_usuario = u.id_usuario
       JOIN roles r ON ur.id_rol = r.id_rol
       LEFT JOIN usuarios u2 ON ur.asignado_por = u2.id_usuario
       ${whereDesdeCondiciones(conditions)}
       ORDER BY ur.fecha_asignacion DESC`,
      params
    );
    res.json({ roles, usuariosRoles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19e. GET /api/admin/estaciones (Solo Admin)
// ==========================================
app.get('/api/admin/estaciones', permitirAdmin, async (req, res) => {
  try {
    const [estaciones] = await pool.query('SELECT * FROM estaciones ORDER BY orden');
    res.json(estaciones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19f. GET /api/admin/preguntas-respuestas (Solo Admin)
// ==========================================
app.get('/api/admin/preguntas-respuestas', permitirAdmin, async (req, res) => {
  try {
    const range = obtenerRangoFechasAdmin(req);
    const conditions = [];
    const params = [];
    if (range) {
      conditions.push(condicionRangoFechas('p.created_at', range));
      params.push(...parametrosRangoFechas(range));
    }

    const [preguntas] = await pool.query(
      `SELECT p.*, e.nombre AS nombre_estacion 
       FROM preguntas p 
       JOIN estaciones e ON p.id_estacion = e.id_estacion
       ${whereDesdeCondiciones(conditions)}
       ORDER BY e.orden, p.id_pregunta`,
      params
    );
    const [respuestas] = await pool.query('SELECT * FROM respuestas ORDER BY id_pregunta, id_respuesta');
    
    // Agrupar respuestas por pregunta
    const respuestasPorPregunta = {};
    respuestas.forEach(r => {
      if (!respuestasPorPregunta[r.id_pregunta]) {
        respuestasPorPregunta[r.id_pregunta] = [];
      }
      respuestasPorPregunta[r.id_pregunta].push(r);
    });

    const result = preguntas.map(p => ({
      ...p,
      respuestas: respuestasPorPregunta[p.id_pregunta] || []
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19g. GET /api/admin/intentos-respuestas (Solo Admin)
// ==========================================
app.get('/api/admin/intentos-respuestas', permitirAdmin, async (req, res) => {
  try {
    const range = obtenerRangoFechasAdmin(req);
    const conditions = [];
    const params = [];
    if (range) {
      conditions.push(condicionRangoFechas('i.fecha_intento', range));
      params.push(...parametrosRangoFechas(range));
    }

    const [intentos] = await pool.query(
      `SELECT i.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario, e.nombre AS nombre_estacion
       FROM intentos_estacion i
       JOIN usuarios u ON i.id_usuario = u.id_usuario
       JOIN estaciones e ON i.id_estacion = e.id_estacion
       ${whereDesdeCondiciones(conditions)}
       ORDER BY i.fecha_intento DESC`,
      params
    );

    let respuestasUsuario = [];
    if (intentos.length > 0) {
      const intentoIds = intentos.map((intento) => intento.id_intento);
      const placeholders = intentoIds.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT ru.*, p.pregunta, r.texto_respuesta AS texto_respuesta_seleccionada, r2.texto_respuesta AS texto_respuesta_correcta
         FROM respuestas_usuario ru
         JOIN preguntas p ON ru.id_pregunta = p.id_pregunta
         JOIN respuestas r ON ru.id_respuesta = r.id_respuesta
         LEFT JOIN respuestas r2 ON p.id_pregunta = r2.id_pregunta AND r2.es_correcta = TRUE
         WHERE ru.id_intento IN (${placeholders})
         ORDER BY ru.fecha_respuesta DESC`,
        intentoIds
      );
      respuestasUsuario = rows;
    }

    // Agrupar respuestas por intento
    const respuestasPorIntento = {};
    respuestasUsuario.forEach(ru => {
      if (!respuestasPorIntento[ru.id_intento]) {
        respuestasPorIntento[ru.id_intento] = [];
      }
      respuestasPorIntento[ru.id_intento].push(ru);
    });

    const result = intentos.map(i => ({
      ...i,
      respuestas: respuestasPorIntento[i.id_intento] || []
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19h. GET /api/admin/minijuegos (Solo Admin)
// ==========================================
app.get('/api/admin/minijuegos', permitirAdmin, async (req, res) => {
  try {
    const range = obtenerRangoFechasAdmin(req);
    const conditions = [];
    const params = [];
    if (range) {
      conditions.push(condicionRangoFechas('p.fecha_partida', range));
      params.push(...parametrosRangoFechas(range));
    }

    const [partidas] = await pool.query(
      `SELECT p.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario, e.nombre AS nombre_estacion
       FROM partidas_minijuego p
       JOIN usuarios u ON p.id_usuario = u.id_usuario
       LEFT JOIN estaciones e ON p.id_estacion = e.id_estacion
       ${whereDesdeCondiciones(conditions)}
       ORDER BY p.fecha_partida DESC`,
      params
    );
    res.json(partidas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19i. GET /api/admin/escaneos-qr (Solo Admin u Operador)
// ==========================================
app.get('/api/admin/escaneos-qr', permitirTaquillaOAdmin, async (req, res) => {
  try {
    const range = obtenerRangoFechasAdmin(req);
    const conditions = [];
    const params = [];
    if (range) {
      conditions.push(condicionRangoFechas('e.fecha_escaneo', range));
      params.push(...parametrosRangoFechas(range));
    }

    const [escaneos] = await pool.query(
      `SELECT e.*, b.folio AS folio_boleto, u.nombre AS nombre_operador
       FROM escaneos_qr_boleto e
       LEFT JOIN boletos b ON e.id_boleto = b.id_boleto
       LEFT JOIN usuarios u ON e.escaneado_por = u.id_usuario
       ${whereDesdeCondiciones(conditions)}
       ORDER BY e.fecha_escaneo DESC`,
      params
    );
    res.json(escaneos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19i-b. POST /api/taquilla/escaneo-qr (Registrar un intento de escaneo)
// ==========================================
app.post('/api/taquilla/escaneo-qr', permitirTaquillaOAdmin, async (req, res) => {
  const { qr_token, resultado, observaciones } = req.body;
  const idOperador = req.headers['x-user-id'] || null;

  try {
    const [[boleto]] = await pool.query('SELECT id_boleto FROM boletos WHERE qr_token = ? OR folio = ?', [qr_token, qr_token]);
    const idBoleto = boleto ? boleto.id_boleto : null;

    await pool.query(
      `INSERT INTO escaneos_qr_boleto (id_boleto, qr_token, escaneado_por, resultado, observaciones)
       VALUES (?, ?, ?, ?, ?)`,
      [idBoleto, qr_token, idOperador, resultado, observaciones]
    );

    res.json({ message: 'Escaneo registrado con éxito.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19j. POST /api/admin/usuarios/:id_usuario/roles (Solo Admin - Modificar roles de usuario)
// ==========================================
app.post('/api/admin/usuarios/:id_usuario/roles', permitirAdmin, async (req, res) => {
  const idUsuario = req.params.id_usuario;
  const { roles } = req.body;
  const asignadoPor = req.headers['x-user-id'] || null;

  if (!Array.isArray(roles) || roles.length === 0) {
    return res.status(400).json({ error: 'Se requiere una lista de roles válida (arreglo no vacío).' });
  }

  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Eliminar roles existentes
      await connection.query('DELETE FROM usuarios_roles WHERE id_usuario = ?', [idUsuario]);

      // Insertar nuevos roles
      for (const rolId of roles) {
        await connection.query(
          'INSERT INTO usuarios_roles (id_usuario, id_rol, asignado_por) VALUES (?, ?, ?)',
          [idUsuario, rolId, asignadoPor]
        );
      }

      // Registrar en auditoría
      await connection.query(
        `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
         VALUES (?, 'admin', 'MODIFICAR_ROLES', 'usuarios_roles', ?, ?)`,
        [asignadoPor, String(idUsuario), `Roles modificados para usuario ${idUsuario}. Nuevos roles: ${roles.join(', ')}`]
      );

      await connection.commit();
      res.json({ message: 'Roles actualizados correctamente.' });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19j-b. POST /api/admin/usuarios/:id_usuario/toggle-activo (Solo Admin - Activar/Desactivar cuenta de usuario)
// ==========================================
app.post('/api/admin/usuarios/:id_usuario/toggle-activo', permitirAdmin, async (req, res) => {
  const idUsuario = req.params.id_usuario;
  const { activo } = req.body;
  const realizadoPor = req.headers['x-user-id'] || null;

  try {
    const [[usuario]] = await pool.query('SELECT * FROM usuarios WHERE id_usuario = ?', [idUsuario]);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    await pool.query('UPDATE usuarios SET activo = ? WHERE id_usuario = ?', [Boolean(activo), idUsuario]);

    // Registrar en auditoría
    const accion = activo ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO';
    const desc = `El usuario ${idUsuario} fue ${activo ? 'activado' : 'desactivado'} por administrador`;
    await pool.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'admin', ?, 'usuarios', ?, ?)`,
      [realizadoPor, accion, String(idUsuario), desc]
    );

    res.json({ message: `Usuario ${activo ? 'activado' : 'desactivado'} correctamente.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19j-c. DELETE /api/admin/usuarios/:id_usuario (Solo Admin - Eliminar usuario)
// ==========================================
app.delete('/api/admin/usuarios/:id_usuario', permitirAdmin, async (req, res) => {
  const idUsuario = req.params.id_usuario;
  const realizadoPor = req.headers['x-user-id'] || null;

  try {
    const [[usuario]] = await pool.query('SELECT * FROM usuarios WHERE id_usuario = ?', [idUsuario]);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Eliminar usuario (las relaciones cascade se encargan de eliminar dependencias en usuarios_roles, progreso_usuario, boletos etc.)
    await pool.query('DELETE FROM usuarios WHERE id_usuario = ?', [idUsuario]);

    // Registrar en auditoría
    await pool.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'admin', 'ELIMINAR_USUARIO', 'usuarios', ?, ?)`,
      [realizadoPor, String(idUsuario), `Usuario ${usuario.nombre} (ID ${idUsuario}) eliminado permanentemente por administrador`]
    );

    res.json({ message: 'Usuario eliminado permanentemente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19k. PUT /api/admin/estaciones/:id_estacion/toggle (Solo Admin - Activar/desactivar estación)
// ==========================================
app.put('/api/admin/estaciones/:id_estacion/toggle', permitirAdmin, async (req, res) => {
  const idEstacion = req.params.id_estacion;
  const realizadoPor = req.headers['x-user-id'] || null;
  try {
    const [[estacion]] = await pool.query('SELECT activa FROM estaciones WHERE id_estacion = ?', [idEstacion]);
    if (!estacion) {
      return res.status(404).json({ error: 'Estación no encontrada.' });
    }

    const nuevoEstado = estacion.activa ? 0 : 1;
    await pool.query('UPDATE estaciones SET activa = ? WHERE id_estacion = ?', [nuevoEstado, idEstacion]);

    // Registrar en auditoría
    await pool.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'admin', 'TOGGLE_ESTACION', 'estaciones', ?, ?)`,
      [realizadoPor, String(idEstacion), `Estación ${idEstacion} cambiada a ${nuevoEstado ? 'activa' : 'inactiva'}`]
    );

    res.json({ id_estacion: idEstacion, activa: nuevoEstado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19l. PUT /api/admin/preguntas/:id_pregunta/toggle (Solo Admin - Activar/desactivar pregunta)
// ==========================================
app.put('/api/admin/preguntas/:id_pregunta/toggle', permitirAdmin, async (req, res) => {
  const idPregunta = req.params.id_pregunta;
  const realizadoPor = req.headers['x-user-id'] || null;
  try {
    const [[pregunta]] = await pool.query('SELECT activa FROM preguntas WHERE id_pregunta = ?', [idPregunta]);
    if (!pregunta) {
      return res.status(404).json({ error: 'Pregunta no encontrada.' });
    }

    const nuevoEstado = pregunta.activa ? 0 : 1;
    await pool.query('UPDATE preguntas SET activa = ? WHERE id_pregunta = ?', [nuevoEstado, idPregunta]);

    // Registrar en auditoría
    await pool.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'admin', 'TOGGLE_PREGUNTA', 'preguntas', ?, ?)`,
      [realizadoPor, String(idPregunta), `Pregunta ${idPregunta} cambiada a ${nuevoEstado ? 'activa' : 'inactiva'}`]
    );

    res.json({ id_pregunta: idPregunta, activa: nuevoEstado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 20. GET /api/leaderboard (Leaderboard público)
// ==========================================
app.get('/api/leaderboard', async (req, res) => {
  try {
    const [leaderboard] = await pool.query(
      `SELECT u.nombre, u.correo, SUM(p.puntaje) AS puntaje_total, u.avatar_url
       FROM usuarios u
       JOIN progreso_usuario p ON u.id_usuario = p.id_usuario
       GROUP BY u.id_usuario
       ORDER BY puntaje_total DESC
       LIMIT 10`
    );
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 21. GET /api/usuarios/:id_usuario/perfil
// ==========================================
app.get('/api/usuarios/:id_usuario/perfil', permitirJugador, async (req, res) => {
  const idUsuario = req.params.id_usuario;
  try {
    // 1. Obtener datos del usuario
    const [[usuario]] = await pool.query(
      'SELECT nombre, correo, avatar_url, fecha_registro FROM usuarios WHERE id_usuario = ?',
      [idUsuario]
    );

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // 2. Obtener progreso y puntuación
    const [progreso] = await pool.query(
      'SELECT id_estacion, completada, aprobada, puntaje, aciertos, errores FROM progreso_usuario WHERE id_usuario = ?',
      [idUsuario]
    );

    // Obtener estaciones activas del recorrido (excluyendo la estación 1 de bienvenida)
    const [estacionesRecorrido] = await pool.query(
      'SELECT id_estacion AS id, nombre, puntos AS puntos_base, tipo FROM estaciones WHERE activa = TRUE AND id_estacion != 1 ORDER BY orden ASC'
    );

    let totalCompletadas = 0;
    let puntajeAcumuladoBase = 0;
    let puntajeAcumuladoDB = 0;
    const progresoEstaciones = [];

    // Determinar estación actual
    let estacionActual = 'Recorrido completado';
    let primeraFaltanteEncontrada = false;

    for (const est of estacionesRecorrido) {
      const p = progreso.find(row => row.id_estacion === est.id);
      const completada = p ? Boolean(p.aprobada || p.completada) : false;

      let scoreObtenido = 0;
      let detalle = 'Pendiente';

      if (completada) {
        totalCompletadas++;
        puntajeAcumuladoBase += est.puntos_base;
        scoreObtenido = p.puntaje || 0;
        puntajeAcumuladoDB += scoreObtenido;

        if (est.id === 2) {
          detalle = `${p.puntaje || 15} saltos`;
        } else {
          detalle = `${p.aciertos ?? 0}/10 aciertos`;
        }
      } else {
        if (!primeraFaltanteEncontrada) {
          estacionActual = est.nombre;
          primeraFaltanteEncontrada = true;
        }
      }

      progresoEstaciones.push({
        id_estacion: est.id,
        nombre: est.nombre,
        puntos_base: est.puntos_base,
        completada,
        puntaje_obtenido: scoreObtenido,
        detalle
      });
    }

    const totalEstaciones = estacionesRecorrido.length;
    const faltantes = totalEstaciones - totalCompletadas;
    const porcentajeAvance = Math.round((totalCompletadas / totalEstaciones) * 100);

    // 3. Rango del usuario según puntaje base acumulado
    let rango = 'Novato';
    if (puntajeAcumuladoBase >= 50) rango = 'Leyenda';
    else if (puntajeAcumuladoBase >= 35) rango = 'Experto';
    else if (puntajeAcumuladoBase >= 20) rango = 'Explorador';
    else if (puntajeAcumuladoBase >= 10) rango = 'Iniciado';

    // 4. Obtener historial de boletos
    const [boletos] = await pool.query(
      'SELECT id_boleto, folio, estado, usado, fecha_generacion, fecha_uso FROM boletos WHERE id_usuario = ? ORDER BY fecha_generacion DESC',
      [idUsuario]
    );

    const boletosFormateados = boletos.map(b => {
      // Determinar Tipo de boleto
      let tipo = 'MUCH';
      const folioUpper = (b.folio || '').toUpperCase();
      if (folioUpper.startsWith('PLAN')) {
        tipo = 'Planetario';
      } else if (folioUpper.startsWith('VGMP')) {
        tipo = 'MUCH';
      }

      // Mapear estado
      let estadoAmigable = 'activo';
      if (b.estado === 'cancelado') {
        estadoAmigable = 'cancelado';
      } else if (b.estado === 'canjeado' || b.usado) {
        estadoAmigable = 'usado';
      }

      return {
        id_boleto: b.id_boleto,
        folio: b.folio,
        tipo,
        fecha_generacion: b.fecha_generacion,
        estado: estadoAmigable
      };
    });

    res.json({
      usuario: {
        nombre: usuario.nombre,
        correo: usuario.correo,
        avatar_url: usuario.avatar_url,
        fecha_registro: usuario.fecha_registro
      },
      progreso: {
        porcentaje: porcentajeAvance,
        completadas: totalCompletadas,
        faltantes,
        estacion_actual: estacionActual
      },
      puntuacion: {
        total_base: puntajeAcumuladoBase,
        total_db: puntajeAcumuladoDB,
        rango,
        estaciones: progresoEstaciones
      },
      boletos: boletosFormateados
    });

  } catch (error) {
    console.error('Error al obtener perfil completo:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 10. POST /api/verificaciones-ubicacion
// ==========================================
app.post('/api/verificaciones-ubicacion', async (req, res) => {
  const {
    user_id,
    session_id,
    direccion_museo,
    latitud_usuario,
    longitud_usuario,
    precision_gps,
    latitud_museo,
    longitud_museo,
    radio_permitido_metros,
    distancia_metros,
    dentro_del_museo,
    permiso_ubicacion,
    mensaje_resultado
  } = req.body;

  if (!direccion_museo || latitud_museo === undefined || longitud_museo === undefined) {
    return res.status(400).json({ error: 'Faltan parámetros obligatorios de la ubicación del museo.' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO verificaciones_ubicacion (
        user_id, session_id, direccion_museo, latitud_usuario, longitud_usuario,
        precision_gps, latitud_museo, longitud_museo, radio_permitido_metros,
        distancia_metros, dentro_del_museo, permiso_ubicacion, mensaje_resultado, fecha_verificacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        user_id || null,
        session_id || null,
        direccion_museo,
        latitud_usuario !== undefined ? latitud_usuario : null,
        longitud_usuario !== undefined ? longitud_usuario : null,
        precision_gps !== undefined ? precision_gps : null,
        latitud_museo,
        longitud_museo,
        radio_permitido_metros || 150,
        distancia_metros !== undefined ? distancia_metros : null,
        Boolean(dentro_del_museo),
        Boolean(permiso_ubicacion),
        mensaje_resultado || null
      ]
    );

    res.status(201).json({
      message: 'Verificación de ubicación guardada correctamente.',
      id_verificacion: result.insertId
    });
  } catch (error) {
    console.error('Error al guardar verificación de ubicación:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 11. GET /api/verificaciones-ubicacion/ultima
// ==========================================
app.get('/api/verificaciones-ubicacion/ultima', async (req, res) => {
  const { user_id, session_id } = req.query;

  if (!user_id && !session_id) {
    return res.status(400).json({ error: 'Debe proporcionar user_id o session_id.' });
  }

  try {
    let query = `SELECT * FROM verificaciones_ubicacion WHERE `;
    let params = [];

    if (user_id && session_id) {
      query += `(user_id = ? OR session_id = ?) `;
      params.push(user_id, session_id);
    } else if (user_id) {
      query += `user_id = ? `;
      params.push(user_id);
    } else {
      query += `session_id = ? `;
      params.push(session_id);
    }

    query += `ORDER BY fecha_verificacion DESC LIMIT 1`;

    const [[ultima]] = await pool.query(query, params);

    res.json(ultima || null);
  } catch (error) {
    console.error('Error al obtener última verificación de ubicación:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 12. POST /api/verificaciones-ubicacion/invalidar
// ==========================================
app.post('/api/verificaciones-ubicacion/invalidar', async (req, res) => {
  const { user_id, session_id } = req.body;

  if (!user_id && !session_id) {
    return res.status(400).json({ error: 'Debe proporcionar user_id o session_id.' });
  }

  try {
    let query = `UPDATE verificaciones_ubicacion SET dentro_del_museo = false, mensaje_resultado = 'Verificación invalidada por cambio de sesión/cierre de sesión' WHERE `;
    let params = [];

    if (user_id && session_id) {
      query += `(user_id = ? OR session_id = ?)`;
      params.push(user_id, session_id);
    } else if (user_id) {
      query += `user_id = ?`;
      params.push(user_id);
    } else {
      query += `session_id = ?`;
      params.push(session_id);
    }

    await pool.query(query, params);
    res.json({ message: 'Verificaciones invalidadas correctamente.' });
  } catch (error) {
    console.error('Error al invalidar verificaciones de ubicación:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Ruta por defecto para index.html o frontend si se sirve de forma estática
app.use(express.static(path.join(__dirname, '../')));

// Iniciar servidor local
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor de Misión MUCH corriendo en http://localhost:${PORT}`);
});
