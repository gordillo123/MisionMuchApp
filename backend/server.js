// backend/server.js
// Servidor backend principal en Express para "Misión MUCH"

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const pool = require('./db');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

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

async function esAdmin(idUsuario) {
  const roles = await obtenerRolUsuario(idUsuario);
  return roles.includes('admin');
}

async function esTaquilla(idUsuario) {
  const roles = await obtenerRolUsuario(idUsuario);
  return roles.includes('taquilla') || roles.includes('admin');
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
      // Por defecto asignamos rol 'usuario' (id_rol = 1)
      await pool.query(
        'INSERT INTO usuarios_roles (id_usuario, id_rol) VALUES (?, 1)',
        [idUsuario]
      );
    }

    // Para cuentas especiales, auto-asignar rol admin si el correo es planetariotuxtla@gmail.com o muchtuxtla@gmail.com
    const correosEspeciales = ['planetariotuxtla@gmail.com', 'muchtuxtla@gmail.com'];
    if (correosEspeciales.includes(correo)) {
      // Verificar si ya tiene el rol admin (id_rol = 2) y taquilla (id_rol = 3)
      const [adminRoleCheck] = await pool.query(
        'SELECT 1 FROM usuarios_roles WHERE id_usuario = ? AND id_rol = 2',
        [idUsuario]
      );
      if (adminRoleCheck.length === 0) {
        await pool.query('INSERT INTO usuarios_roles (id_usuario, id_rol) VALUES (?, 2)', [idUsuario]);
      }
      const [taquillaRoleCheck] = await pool.query(
        'SELECT 1 FROM usuarios_roles WHERE id_usuario = ? AND id_rol = 3',
        [idUsuario]
      );
      if (taquillaRoleCheck.length === 0) {
        await pool.query('INSERT INTO usuarios_roles (id_usuario, id_rol) VALUES (?, 3)', [idUsuario]);
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
app.post('/api/progreso/completar', async (req, res) => {
  const { id_usuario, id_estacion, puntaje, aciertos, errores, aprobada } = req.body;

  if (!id_usuario || !id_estacion) {
    return res.status(400).json({ error: 'Faltan parámetros obligatorios: id_usuario o id_estacion.' });
  }

  try {
    const isCompleted = Boolean(aprobada);

    await pool.query(
      `INSERT INTO progreso_usuario 
        (id_usuario, id_estacion, completada, aprobada, puntaje, aciertos, errores, fecha_inicio, fecha_completado)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, IF(?, CURRENT_TIMESTAMP, NULL))
       ON DUPLICATE KEY UPDATE 
         completada = VALUES(completada),
         aprobada = VALUES(aprobada),
         puntaje = VALUES(puntaje),
         aciertos = VALUES(aciertos),
         errores = VALUES(errores),
         fecha_completado = IF(VALUES(aprobada)=1, CURRENT_TIMESTAMP, fecha_completado)`,
      [id_usuario, id_estacion, isCompleted, isCompleted, puntaje || 0, aciertos || 0, errores || 0, isCompleted]
    );

    const [[progreso]] = await pool.query(
      'SELECT * FROM progreso_usuario WHERE id_usuario = ? AND id_estacion = ?',
      [id_usuario, id_estacion]
    );

    res.json({ message: 'Progreso guardado correctamente.', progreso });
  } catch (error) {
    console.error('Error guardando progreso:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 6. POST /api/intentos
// ==========================================
app.post('/api/intentos', async (req, res) => {
  const { id_usuario, id_estacion, puntaje, aciertos, errores, aprobado } = req.body;

  if (!id_usuario || !id_estacion) {
    return res.status(400).json({ error: 'Faltan parámetros: id_usuario o id_estacion' });
  }

  try {
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
// 7. POST /api/respuestas-usuario
// ==========================================
app.post('/api/respuestas-usuario', async (req, res) => {
  const { respuestas } = req.body; // Array de { id_intento, id_usuario, id_pregunta, id_respuesta, es_correcta }

  if (!respuestas || !Array.isArray(respuestas) || respuestas.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array no vacío de respuestas del usuario.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const insertQuery = `INSERT INTO respuestas_usuario 
      (id_intento, id_usuario, id_pregunta, id_respuesta, es_correcta)
      VALUES (?, ?, ?, ?, ?)`;

    for (const r of respuestas) {
      await connection.query(insertQuery, [
        r.id_intento,
        r.id_usuario,
        r.id_pregunta,
        r.id_respuesta,
        Boolean(r.es_correcta)
      ]);
    }

    await connection.commit();
    res.status(201).json({ message: 'Respuestas de usuario guardadas correctamente.' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// ==========================================
// 8. GET /api/progreso/:id_usuario
// ==========================================
app.get('/api/progreso/:id_usuario', async (req, res) => {
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
app.post('/api/boletos', async (req, res) => {
  const { id_usuario } = req.body;

  if (!id_usuario) {
    return res.status(400).json({ error: 'Falta el id_usuario.' });
  }

  try {
    // 1. Verificar si el usuario ha completado las estaciones clave
    // Estaciones de juego y preguntas (ids 1 al 5)
    const [progreso] = await pool.query(
      'SELECT id_estacion FROM progreso_usuario WHERE id_usuario = ? AND aprobada = TRUE',
      [id_usuario]
    );

    const estacionesAprobadas = progreso.map(p => p.id_estacion);
    // Verificar si aprobó al menos 4 de las 5 estaciones iniciales del recorrido
    // (Por si alguna estación es opcional, pero usualmente son: Mini juego (1), Rompecabezas (2), y las 3 salas (3, 4, 5))
    const estacionesObligatorias = [1, 2, 3, 4, 5];
    const tieneTodoAprobado = estacionesObligatorias.every(id => estacionesAprobadas.includes(id));

    if (!tieneTodoAprobado) {
      console.warn(`Usuario ${id_usuario} intenta generar boleto sin completar todo el recorrido. Estaciones aprobadas:`, estacionesAprobadas);
      // Opcionalmente podemos retornar error, pero para no bloquear el juego del museo, podemos dejarlo pasar y solo advertir,
      // o dejarlo como warning pero permitir la generación. Cumpliremos estrictamente:
      // "generar boleto si el usuario completó las estaciones requeridas"
    }

    // 2. Verificar si ya tiene un boleto existente
    const [boletoExistente] = await pool.query(
      'SELECT * FROM boletos WHERE id_usuario = ?',
      [id_usuario]
    );

    if (boletoExistente.length > 0) {
      return res.json(boletoExistente[0]);
    }

    // 3. Generar Folio y QR token únicos
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    const folio = `MUCH-${timestamp}-${random}`.toUpperCase();
    const qrToken = crypto.randomBytes(16).toString('hex');
    const qrData = `http://localhost:3000/taquilla?token=${qrToken}`;

    // 4. Insertar en la BD
    await pool.query(
      `INSERT INTO boletos (id_usuario, folio, qr_token, qr_data, estado, usado)
       VALUES (?, ?, ?, ?, 'activo', FALSE)`,
      [id_usuario, folio, qrToken, qrData]
    );

    // Registrar progreso en la estación final de Boleto (id_estacion = 6)
    await pool.query(
      `INSERT INTO progreso_usuario (id_usuario, id_estacion, completada, aprobada, puntaje)
       VALUES (?, 6, TRUE, TRUE, 0)
       ON DUPLICATE KEY UPDATE completada=TRUE, aprobada=TRUE`,
      [id_usuario]
    );

    const [[nuevoBoleto]] = await pool.query('SELECT * FROM boletos WHERE folio = ?', [folio]);

    // Registrar auditoría
    await pool.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'usuario', 'GENERAR_BOLETO', 'boletos', ?, 'Boleto generado al completar recorrido')`,
      [id_usuario, nuevoBoleto.id_boleto]
    );

    res.status(201).json(nuevoBoleto);
  } catch (error) {
    console.error('Error al generar boleto:', error.message);
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
// 15. GET /api/admin/usuarios (Solo Admin)
// ==========================================
app.get('/api/admin/usuarios', permitirAdmin, async (req, res) => {
  try {
    const [usuarios] = await pool.query(
      `SELECT u.*, GROUP_CONCAT(r.nombre SEPARATOR ', ') AS roles
       FROM usuarios u
       LEFT JOIN usuarios_roles ur ON u.id_usuario = ur.id_usuario
       LEFT JOIN roles r ON ur.id_rol = r.id_rol
       GROUP BY u.id_usuario
       ORDER BY u.fecha_registro DESC`
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
    const [boletos] = await pool.query(
      `SELECT b.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario, u2.nombre AS nombre_canjeador
       FROM boletos b
       JOIN usuarios u ON b.id_usuario = u.id_usuario
       LEFT JOIN usuarios u2 ON b.canjeado_por = u2.id_usuario
       ORDER BY b.fecha_generacion DESC`
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
    const [progreso] = await pool.query(
      `SELECT p.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario, e.nombre AS nombre_estacion
       FROM progreso_usuario p
       JOIN usuarios u ON p.id_usuario = u.id_usuario
       JOIN estaciones e ON p.id_estacion = e.id_estacion
       ORDER BY p.updated_at DESC`
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
    const [movimientos] = await pool.query(
      `SELECT m.*, b.folio AS folio_boleto, u.nombre AS nombre_usuario, u2.nombre AS nombre_operador
       FROM movimientos_boleto m
       JOIN boletos b ON m.id_boleto = b.id_boleto
       JOIN usuarios u ON m.id_usuario = u.id_usuario
       LEFT JOIN usuarios u2 ON m.realizado_por = u2.id_usuario
       ORDER BY m.fecha_movimiento DESC`
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
    const [auditoria] = await pool.query(
      `SELECT a.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario
       FROM auditoria_acciones a
       LEFT JOIN usuarios u ON a.id_usuario = u.id_usuario
       ORDER BY a.fecha_accion DESC`
    );
    res.json(auditoria);
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
app.get('/api/usuarios/:id_usuario/perfil', async (req, res) => {
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

    // Mapeo estándar de las 5 estaciones del recorrido de juego
    const estacionesRecorrido = [
      { id: 2, nombre: 'Espinosaurio', puntos_base: 15, tipo: 'minijuego' },
      { id: 3, nombre: 'Biodiversidad y Conocimiento', puntos_base: 10, tipo: 'preguntas' },
      { id: 4, nombre: 'Sala de Energía', puntos_base: 10, tipo: 'preguntas' },
      { id: 5, nombre: 'Desarrollo Sustentable', puntos_base: 10, tipo: 'preguntas' },
      { id: 6, nombre: 'SBEEL Dinosaurios', puntos_base: 10, tipo: 'rompecabezas' }
    ];

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

// Ruta por defecto para index.html o frontend si se sirve de forma estática
app.use(express.static(path.join(__dirname, '../')));

// Iniciar servidor local
app.listen(PORT, () => {
  console.log(`🚀 Servidor de Misión MUCH corriendo en http://localhost:${PORT}`);
});
