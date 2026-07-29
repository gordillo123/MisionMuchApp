// backend/server.js
// Servidor backend principal en Express para "MisiÃ³n MUCH"

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const pool = require('./db');
const { createPlaytimeBlockService } = require('./playtime-block');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const playtime = createPlaytimeBlockService(pool);
const TICKET_VALIDITY_DAYS = Math.max(1, Number(process.env.TICKET_VALIDITY_DAYS || process.env.BOLETO_VALIDEZ_DIAS || 7));
const FAILED_ATTEMPT_LIMIT = 3;
const QUESTION_STATION_RULES = {
  3: { minCorrect: 7, maxQuestions: 10 },
  4: { minCorrect: 7, maxQuestions: 10 },
  5: { minCorrect: 7, maxQuestions: 10 }
};
const DYNAMIC_STATION_RULES = {
  1: { minScore: 10, minCorrect: 6, maxErrors: 0 },
  2: { minScore: 15, minCorrect: 1, maxErrors: 0 },
  6: { minScore: 1, minCorrect: 1, maxErrors: 0 }
};

function tieneTexto(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function calcularFechaVencimientoBoleto(fechaBase = new Date()) {
  const base = fechaBase instanceof Date ? new Date(fechaBase.getTime()) : new Date(fechaBase);
  base.setDate(base.getDate() + TICKET_VALIDITY_DAYS);
  return base;
}

function normalizarDestinoBoleto(destino, tipoEntrada) {
  const descriptor = `${destino || ''} ${tipoEntrada || ''}`.toLowerCase();
  if (descriptor.includes('planetario')) return 'Planetario';
  if (descriptor.includes('much') || descriptor.includes('museo')) return 'MUCH';
  return '';
}

function normalizarTipoEntrada(tipoEntrada, destino) {
  const destinoNormalizado = normalizarDestinoBoleto(destino, tipoEntrada);
  if (destinoNormalizado) return destinoNormalizado;
  return tieneTexto(tipoEntrada) ? tipoEntrada.trim() : '';
}

function esBoletoPlanetario(destino) {
  return String(destino || '').toLowerCase().includes('planetario');
}

async function columnaExiste(tableName, columnName) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(row?.total || 0) > 0;
}

async function agregarColumnaSiFalta(tableName, columnName, ddl) {
  if (await columnaExiste(tableName, columnName)) return;
  await pool.query(ddl);
}

async function ensureTicketSchema() {
  const [[table]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'boletos'`
  );
  if (!Number(table?.total || 0)) return;

  await agregarColumnaSiFalta('boletos', 'tipo_entrada', "ALTER TABLE boletos ADD COLUMN tipo_entrada VARCHAR(100) NULL AFTER qr_data");
  await agregarColumnaSiFalta('boletos', 'destino_boleto', "ALTER TABLE boletos ADD COLUMN destino_boleto VARCHAR(50) NULL AFTER tipo_entrada");
  await agregarColumnaSiFalta('boletos', 'seccion_boleto', "ALTER TABLE boletos ADD COLUMN seccion_boleto VARCHAR(100) NULL AFTER destino_boleto");
  await agregarColumnaSiFalta('boletos', 'valido_desde', "ALTER TABLE boletos ADD COLUMN valido_desde TIMESTAMP NULL AFTER usado");
  await agregarColumnaSiFalta('boletos', 'valido_hasta', "ALTER TABLE boletos ADD COLUMN valido_hasta TIMESTAMP NULL AFTER valido_desde");
}

async function ensureAttemptSchema() {
  const [[table]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'intentos_estacion'`
  );
  if (Number(table?.total || 0)) {
    await agregarColumnaSiFalta('intentos_estacion', 'finalizado', "ALTER TABLE intentos_estacion ADD COLUMN finalizado BOOLEAN NOT NULL DEFAULT FALSE AFTER aprobado");
  }

  // Verificar y agregar columnas de progreso y bloqueo a 'progreso_usuario'
  const [[progressTable]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'progreso_usuario'`
  );
  if (Number(progressTable?.total || 0)) {
    await agregarColumnaSiFalta('progreso_usuario', 'fallida', "ALTER TABLE progreso_usuario ADD COLUMN fallida BOOLEAN NOT NULL DEFAULT FALSE AFTER aprobada");
    await agregarColumnaSiFalta('progreso_usuario', 'bloqueada', "ALTER TABLE progreso_usuario ADD COLUMN bloqueada BOOLEAN NOT NULL DEFAULT FALSE AFTER fallida");
    await agregarColumnaSiFalta('progreso_usuario', 'fecha_bloqueo', "ALTER TABLE progreso_usuario ADD COLUMN fecha_bloqueo TIMESTAMP NULL AFTER bloqueada");
    await agregarColumnaSiFalta('progreso_usuario', 'fecha_puede_volver_jugar', "ALTER TABLE progreso_usuario ADD COLUMN fecha_puede_volver_jugar TIMESTAMP NULL AFTER fecha_bloqueo");
  }
}

async function ensurePrivacyConsentSchema() {
  const [[table]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios'`
  );
  if (!Number(table?.total || 0)) return;

  await agregarColumnaSiFalta('usuarios', 'telefono', "ALTER TABLE usuarios ADD COLUMN telefono VARCHAR(20) NULL AFTER correo");
  await agregarColumnaSiFalta('usuarios', 'acepto_privacidad', "ALTER TABLE usuarios ADD COLUMN acepto_privacidad BOOLEAN NOT NULL DEFAULT FALSE AFTER activo");
  await agregarColumnaSiFalta('usuarios', 'privacidad_aceptada_en', "ALTER TABLE usuarios ADD COLUMN privacidad_aceptada_en TIMESTAMP NULL AFTER acepto_privacidad");
}

function inferirIntentoFinalizado({ finalizado, aprobado, puntaje, aciertos, errores }) {
  if (finalizado !== undefined) return Boolean(finalizado);
  return Boolean(aprobado)
    || Number(puntaje || 0) > 0
    || Number(aciertos || 0) > 0
    || Number(errores || 0) > 0;
}
function calcularPuntajeMinimoEstacion(estacion = {}) {
  const puntos = Number(estacion.puntos || 0);
  const minimoConfigurado = Number(estacion.puntaje_minimo || 0);
  const minimoBase = puntos > 0 ? Math.min(puntos, 10) : 10;
  return Math.max(1, minimoBase, minimoConfigurado);
}

function getQuestionTotal(metricas = {}, aciertos = 0) {
  if (metricas.num_preguntas !== undefined) return Math.max(0, Number(metricas.num_preguntas || 0));
  if (metricas.totalPreguntas !== undefined) return Math.max(0, Number(metricas.totalPreguntas || 0));
  if (metricas.total !== undefined) return Math.max(0, Number(metricas.total || 0));
  if (metricas.errores !== undefined) return aciertos + Math.max(0, Number(metricas.errores || 0));
  return 10;
}

function estacionTieneReglaEstricta(idEstacion) {
  const id = Number(idEstacion || 0);
  return Boolean(QUESTION_STATION_RULES[id] || DYNAMIC_STATION_RULES[id]);
}

function evaluarAprobacionEstacion(estacion = {}, puntaje = 0, aprobadaSolicitada = false, metricas = {}) {
  const puntajeNumerico = Math.max(0, Number(puntaje || 0));
  const puntajeMinimo = calcularPuntajeMinimoEstacion(estacion);
  const idEstacion = Number(estacion.id_estacion || estacion.id || metricas.id_estacion || 0);
  const reglaPreguntas = QUESTION_STATION_RULES[idEstacion];
  const reglaDinamica = DYNAMIC_STATION_RULES[idEstacion];
  const aprobacionSolicitada = Boolean(aprobadaSolicitada);

  let aprobada = aprobacionSolicitada && puntajeNumerico >= puntajeMinimo;
  if (reglaPreguntas) {
    const aciertos = Math.max(0, Number(metricas.aciertos || metricas.num_correctas || 0));
    const totalPreguntas = getQuestionTotal(metricas, aciertos);
    aprobada = aprobacionSolicitada
      && totalPreguntas > 0
      && totalPreguntas <= reglaPreguntas.maxQuestions
      && aciertos <= reglaPreguntas.maxQuestions
      && aciertos >= reglaPreguntas.minCorrect;
  } else if (reglaDinamica) {
    const aciertos = Math.max(0, Number(metricas.aciertos || metricas.num_correctas || 0));
    const errores = Math.max(0, Number(metricas.errores || 0));
    const erroresValidos = reglaDinamica.maxErrors === undefined || errores <= reglaDinamica.maxErrors;
    aprobada = aprobacionSolicitada
      && puntajeNumerico >= reglaDinamica.minScore
      && aciertos >= reglaDinamica.minCorrect
      && erroresValidos;
  }

  return {
    puntaje: puntajeNumerico,
    puntaje_minimo: puntajeMinimo,
    aprobada
  };
}

function progresoCumpleAprobacionEstacion(row = {}) {
  if (!row || !(row.aprobada || row.completada)) return false;
  return evaluarAprobacionEstacion({
    id_estacion: row.id_estacion,
    puntos: row.puntos_estacion ?? row.puntos,
    puntaje_minimo: row.puntaje_minimo_estacion ?? row.puntaje_minimo
  }, row.puntaje, true, {
    id_estacion: row.id_estacion,
    aciertos: row.aciertos,
    errores: row.errores,
    num_preguntas: row.num_preguntas
  }).aprobada;
}

function normalizarProgresoAprobacion(row = {}) {
  if (!estacionTieneReglaEstricta(row.id_estacion)) return row;
  if (progresoCumpleAprobacionEstacion(row)) return row;
  return {
    ...row,
    completada: false,
    aprobada: false
  };
}

async function autoUnlockEstaciones(connection, idUsuario) {
  // Buscar estaciones bloqueadas del usuario cuyo tiempo de bloqueo ya expirÃ³
  const [blockedStations] = await connection.query(
    `SELECT id_estacion 
     FROM progreso_usuario 
     WHERE id_usuario = ? 
       AND bloqueada = TRUE 
       AND fecha_puede_volver_jugar <= CURRENT_TIMESTAMP`,
    [idUsuario]
  );

  for (const row of blockedStations) {
    const idEstacion = row.id_estacion;
    console.log(`ðŸ”“ Auto-desbloqueando estaciÃ³n ${idEstacion} para el usuario ${idUsuario}`);
    
    // 1. Restablecer progreso de la estaciÃ³n
    await connection.query(
      `UPDATE progreso_usuario 
       SET completada = FALSE,
           aprobada = FALSE,
           fallida = FALSE,
           bloqueada = FALSE,
           fecha_bloqueo = NULL,
           fecha_puede_volver_jugar = NULL,
           puntaje = 0,
           aciertos = 0,
           errores = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_usuario = ? AND id_estacion = ?`,
      [idUsuario, idEstacion]
    );

    // 2. Eliminar intentos histÃ³ricos de la estaciÃ³n para que tenga 3 intentos nuevos
    await connection.query(
      `DELETE FROM intentos_estacion WHERE id_usuario = ? AND id_estacion = ?`,
      [idUsuario, idEstacion]
    );
  }
}

async function evaluarBloqueoPorIntentos(connection, idUsuario, idEstacion) {
  const [[progress]] = await connection.query(
    `SELECT p.id_estacion, p.aprobada, p.completada, p.fallida, p.bloqueada, p.puntaje, p.aciertos, p.errores,
            e.puntos AS puntos_estacion, e.puntaje_minimo AS puntaje_minimo_estacion
     FROM progreso_usuario p
     JOIN estaciones e ON e.id_estacion = p.id_estacion
     WHERE p.id_usuario = ? AND p.id_estacion = ?`,
    [idUsuario, idEstacion]
  );
  if (progresoCumpleAprobacionEstacion(progress)) {
    return { fallos: 0, bloqueo: null };
  }

  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS fallos
     FROM intentos_estacion
     WHERE id_usuario = ?
       AND id_estacion = ?
       AND aprobado = FALSE
       AND finalizado = TRUE`,
    [idUsuario, idEstacion]
  );
  const fallos = Number(row?.fallos || 0);
  if (fallos < FAILED_ATTEMPT_LIMIT) {
    return { fallos, bloqueo: null };
  }

  const bloqueoGlobal = await playtime.registrarBloqueoPorIntentos(idUsuario, idEstacion, connection);
  const fechaPuedeVolver = bloqueoGlobal?.fecha_puede_volver
    ? new Date(bloqueoGlobal.fecha_puede_volver)
    : playtime.calcularFechaDesbloqueo(new Date(), await playtime.getConfig());

  console.log(`âš ï¸ Usuario ${idUsuario} agotÃ³ sus intentos en la estaciÃ³n ${idEstacion}. Bloqueando hasta ${fechaPuedeVolver.toISOString()}.`);
  await connection.query(
    `INSERT INTO progreso_usuario 
      (id_usuario, id_estacion, completada, aprobada, fallida, bloqueada, fecha_bloqueo, fecha_puede_volver_jugar, puntaje, aciertos, errores, fecha_inicio, fecha_completado)
     VALUES (?, ?, FALSE, FALSE, TRUE, TRUE, CURRENT_TIMESTAMP, ?, 0, 0, 0, CURRENT_TIMESTAMP, NULL)
     ON DUPLICATE KEY UPDATE 
       completada = FALSE,
       aprobada = FALSE,
       fallida = TRUE,
       bloqueada = TRUE,
       fecha_bloqueo = CURRENT_TIMESTAMP,
       fecha_puede_volver_jugar = VALUES(fecha_puede_volver_jugar),
       updated_at = CURRENT_TIMESTAMP`,
    [idUsuario, idEstacion, fechaPuedeVolver]
  );

  const bloqueo = {
    bloqueado: true,
    habilitado: false,
    motivo_bloqueo: 'intentos',
    tipo: 'juego',
    id_estacion: idEstacion,
    fecha_finalizacion: new Date().toISOString(),
    fecha_puede_volver: fechaPuedeVolver.toISOString(),
    fecha_puede_volver_texto: playtime.formatFechaMX(fechaPuedeVolver),
    mensaje: bloqueoGlobal?.mensaje || playtime.buildMensajeBloqueoIntentos(fechaPuedeVolver, bloqueoGlobal?.premio?.detalle_bloqueo || 'esta estaciÃ³n')
  };

  return { fallos, bloqueo };
}

// Asegurar existencia de la tabla de verificaciÃ³n de ubicaciÃ³n
(async () => {
  try {
    console.log('â³ Verificando existencia de la tabla verificaciones_ubicacion...');
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
    console.log('âœ… Tabla verificaciones_ubicacion verificada/creada con Ã©xito.');
  } catch (error) {
    console.error('âŒ Error al verificar/crear la tabla verificaciones_ubicacion:', error.message);
  }

  try {
    await playtime.ensureTables();
    await ensureTicketSchema();
    await ensureAttemptSchema();
    await ensurePrivacyConsentSchema();
    console.log('âœ… Tablas de bloqueo de juego verificadas/creadas con Ã©xito.');
  } catch (error) {
    console.error('âŒ Error al verificar/crear tablas de bloqueo de juego:', error.message);
  }
})();

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'much_session';
const SESSION_MAX_AGE_MS = Math.max(1, Number(process.env.SESSION_MAX_AGE_HOURS || 24)) * 60 * 60 * 1000;
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';


// Cliente de Google OAuth
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const client = googleClientId ? new OAuth2Client(googleClientId) : null;

// Middlewares
app.set('trust proxy', 1);
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Logger simple para peticiones
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Middleware de roles y simulaciÃ³n de usuario actual
// Para fines de desarrollo local y simplicidad, el frontend enviarÃ¡ las cabeceras:
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


function parseCookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf('=');
      if (index === -1) return cookies;
      cookies[decodeURIComponent(part.slice(0, index))] = decodeURIComponent(part.slice(index + 1));
      return cookies;
    }, {});
}

function getSessionSecret() {
  if (SESSION_SECRET) return SESSION_SECRET;
  if (IS_PRODUCTION) throw new Error('SESSION_SECRET es obligatorio en producción.');
  return 'dev-only-change-this-session-secret';
}

function signSessionPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch (_) {
    return null;
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload?.id_usuario || !payload?.exp || Date.now() > Number(payload.exp)) return null;
  return payload;
}

function setSessionCookie(res, usuario) {
  const token = signSessionPayload({
    id_usuario: usuario.id_usuario,
    correo: usuario.correo,
    exp: Date.now() + SESSION_MAX_AGE_MS
  });
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? 'none' : 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/'
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? 'none' : 'lax',
    path: '/'
  });
}

async function obtenerUsuarioSesion(req) {
  const payload = verifySessionToken(parseCookies(req)[SESSION_COOKIE_NAME]);
  if (!payload) return null;
  const [[usuario]] = await pool.query(
    `SELECT id_usuario, nombre, correo, telefono, google_id, avatar_url, fecha_registro,
            ultimo_login, activo, acepto_privacidad, privacidad_aceptada_en
     FROM usuarios
     WHERE id_usuario = ?
     LIMIT 1`,
    [payload.id_usuario]
  );
  if (!usuario || !usuario.activo) return null;
  usuario.roles = await obtenerRolUsuario(usuario.id_usuario);
  return usuario;
}

function serializarUsuarioSesion(usuario) {
  return {
    id_usuario: usuario.id_usuario,
    nombre: usuario.nombre,
    correo: usuario.correo,
    telefono: usuario.telefono,
    google_id: usuario.google_id,
    avatar_url: usuario.avatar_url,
    roles: usuario.roles || [],
    activo: Boolean(usuario.activo),
    acepto_privacidad: Boolean(usuario.acepto_privacidad),
    privacidad_aceptada_en: usuario.privacidad_aceptada_en || null
  };
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

async function usuarioTieneConsentimientoPrivacidad(idUsuario) {
  if (!idUsuario) return false;
  const [[usuario]] = await pool.query(
    `SELECT acepto_privacidad
     FROM usuarios
     WHERE id_usuario = ?
     LIMIT 1`,
    [idUsuario]
  );
  return Boolean(usuario?.acepto_privacidad);
}

async function usuarioExiste(idUsuario, connection = pool) {
  if (!idUsuario) return false;
  const [[usuario]] = await connection.query(
    'SELECT id_usuario FROM usuarios WHERE id_usuario = ? LIMIT 1',
    [idUsuario]
  );
  return Boolean(usuario);
}

// Generar Folio Ãºnico de 6 caracteres alfanumÃ©ricos mezclados (ej: X7K9R2)
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

// Middleware de autorizaciÃ³n de Admin
async function permitirAdmin(req, res, next) {
  const sesion = await obtenerUsuarioSesion(req);
  if (sesion) req.usuarioSesion = sesion;
  const idUsuario = sesion?.id_usuario || req.headers['x-user-id'];
  if (!idUsuario) {
    return res.status(401).json({ error: 'Sesión expirada. Inicia sesión nuevamente.' });
  }
  const admin = await esAdmin(idUsuario);
  if (!admin) {
    return res.status(403).json({ error: 'Permiso denegado. Se requiere rol de Administrador.' });
  }
  next();
}

// Middleware de autorizaciÃ³n de Taquilla o Admin
async function permitirTaquillaOAdmin(req, res, next) {
  const sesion = await obtenerUsuarioSesion(req);
  if (sesion) req.usuarioSesion = sesion;
  const idUsuario = sesion?.id_usuario || req.headers['x-user-id'];
  if (!idUsuario) {
    return res.status(401).json({ error: 'Sesión expirada. Inicia sesión nuevamente.' });
  }
  const taquilla = await esTaquilla(idUsuario);
  if (!taquilla) {
    return res.status(403).json({ error: 'Permiso denegado. Se requiere rol de Taquilla o Admin.' });
  }
  next();
}

function obtenerIdUsuarioDePeticion(req) {
  return req.usuarioSesion?.id_usuario || req.headers['x-user-id'] || req.body?.id_usuario || req.params?.id_usuario || req.params?.idUsuario;
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

function anexarMetadataBoleto(boleto) {
  if (!boleto) return boleto;

  let metadata = {};
  if (typeof boleto.observaciones === 'string' && boleto.observaciones.trim().startsWith('{')) {
    try {
      metadata = JSON.parse(boleto.observaciones);
    } catch (error) {
      metadata = {};
    }
  }

  const tipoEntradaRaw = boleto.tipo_entrada || metadata.tipo_entrada || '';
  const destinoBoleto = normalizarDestinoBoleto(boleto.destino_boleto || metadata.destino_boleto, tipoEntradaRaw);
  const tipoEntrada = normalizarTipoEntrada(tipoEntradaRaw, destinoBoleto);
  const validoHasta = boleto.valido_hasta || metadata.valido_hasta || null;
  const vencido = Boolean(
    validoHasta
    && !boleto.usado
    && String(boleto.estado || '').toLowerCase() === 'activo'
    && new Date(validoHasta).getTime() < Date.now()
  );
  const estadoNormalizado = vencido ? 'vencido' : boleto.estado;

  return {
    ...boleto,
    estado: estadoNormalizado,
    tipo_entrada: tipoEntrada,
    destino_boleto: destinoBoleto,
    seccion_boleto: boleto.seccion_boleto || metadata.seccion_boleto || (destinoBoleto ? (esBoletoPlanetario(destinoBoleto) ? 'Planetario' : 'MUCH') : ''),
    lugar_boleto: boleto.lugar_boleto || metadata.lugar || '',
    valido_desde: boleto.valido_desde || metadata.valido_desde || boleto.fecha_generacion || null,
    valido_hasta: validoHasta,
    estado_visible: boleto.usado ? 'Utilizado' : (vencido ? 'Vencido' : 'Disponible')
  };
}

async function marcarBoletoVencidoSiAplica(boleto, connection = pool) {
  const boletoNormalizado = anexarMetadataBoleto(boleto);
  if (boletoNormalizado?.estado === 'vencido' && String(boleto?.estado || '').toLowerCase() !== 'vencido') {
    await connection.query(
      "UPDATE boletos SET estado = 'vencido', ultimo_escaneo = CURRENT_TIMESTAMP WHERE id_boleto = ?",
      [boleto.id_boleto]
    );
  }
  return boletoNormalizado;
}

// Middleware de autorizacion de jugador.
// Admin y taquilla pueden conservar rol "usuario" por compatibilidad, pero no deben jugar.
async function permitirJugador(req, res, next) {
  const sesion = await obtenerUsuarioSesion(req);
  if (sesion) req.usuarioSesion = sesion;
  const idUsuario = sesion?.id_usuario || obtenerIdUsuarioDePeticion(req);
  if (!idUsuario) {
    return res.status(401).json({ error: 'Sesión expirada. Inicia sesión nuevamente.' });
  }

  if (!(await usuarioExiste(idUsuario))) {
    return res.status(401).json({ error: 'Usuario no encontrado. Inicia sesiÃ³n nuevamente.' });
  }

  const roles = await obtenerRolUsuario(idUsuario);
  if (roles.includes('admin') || roles.includes('taquilla')) {
    return res.status(403).json({
      error: 'Permiso denegado. Las cuentas de Administrador o Taquilla no pueden ejecutar acciones de jugador.'
    });
  }

  if (!(await usuarioTieneConsentimientoPrivacidad(idUsuario))) {
    return res.status(403).json({
      error: 'privacy_consent_required',
      mensaje: 'Debes aceptar el aviso de privacidad para continuar.'
    });
  }

  req.idUsuario = idUsuario;
  next();
}

const verificarBloqueoJugador = playtime.middlewareVerificarBloqueo(obtenerIdUsuarioDePeticion);

function esReinicioDePrueba(req) {
  const body = req.body || {};
  const headerMode = String(req.get('x-reset-mode') || '').toLowerCase();
  return body.force_reset === true
    || body.force_reset === 'true'
    || body.force_reset === 1
    || body.force_reset === '1'
    || body.modo_prueba === true
    || body.modo_prueba === 'true'
    || headerMode === 'test';
}

function verificarBloqueoExceptoReinicioPrueba(req, res, next) {
  if (esReinicioDePrueba(req)) {
    req.playtimeEstado = { bloqueado: false, habilitado: true, motivo: 'reinicio_prueba' };
    return next();
  }

  return verificarBloqueoJugador(req, res, next);
}

// ==========================================
// 1. GET /api/health (Health check)
// ==========================================
app.get('/api/health', async (req, res) => {
  try {
    const [result] = await pool.query('SELECT 1');
    res.json({
      status: 'success',
      message: 'ConexiÃ³n a MySQL exitosa.',
      database: process.env.DB_DATABASE || 'mision_much',
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'FallÃ³ la conexiÃ³n a la base de datos MySQL.',
      error: error.message
    });
  }
});

// ==========================================
// 2. Autenticacion con Google y sesion segura
// ==========================================
async function iniciarSesionConPayloadGoogle(payload, res) {
  const nombre = String(payload.name || '').trim();
  const correo = String(payload.email || '').trim().toLowerCase();
  const googleId = String(payload.sub || '').trim();
  const avatarUrl = String(payload.picture || '').trim();
  if (!payload.email_verified) { const error = new Error('Google no ha verificado este correo electrónico.'); error.statusCode = 403; throw error; }
  if (!nombre || !correo || !googleId) { const error = new Error('Google no devolvió nombre, correo o identificador suficientes.'); error.statusCode = 400; throw error; }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[existente]] = await connection.query('SELECT * FROM usuarios WHERE correo = ? OR google_id = ? LIMIT 1 FOR UPDATE', [correo, googleId]);
    let idUsuario;
    if (existente) {
      if (!existente.activo) { const error = new Error('Cuenta deshabilitada. Contacta al administrador.'); error.statusCode = 403; throw error; }
      idUsuario = existente.id_usuario;
      await connection.query(`UPDATE usuarios SET nombre = ?, correo = ?, google_id = ?, avatar_url = ?, ultimo_login = CURRENT_TIMESTAMP WHERE id_usuario = ?`, [nombre, correo, googleId, avatarUrl || existente.avatar_url || null, idUsuario]);
    } else {
      const [insertResult] = await connection.query(`INSERT INTO usuarios (nombre, correo, google_id, avatar_url, ultimo_login, activo) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, TRUE)`, [nombre, correo, googleId, avatarUrl || null]);
      idUsuario = insertResult.insertId;
    }
    const usuarioRoleId = await obtenerOCrearRolId('usuario', 'Jugador regular que usa las estaciones del recorrido');
    const [rolesExistentes] = await connection.query('SELECT 1 FROM usuarios_roles WHERE id_usuario = ? LIMIT 1', [idUsuario]);
    if (rolesExistentes.length === 0) await connection.query('INSERT INTO usuarios_roles (id_usuario, id_rol) VALUES (?, ?)', [idUsuario, usuarioRoleId]);
    await connection.commit();
    const [[usuario]] = await pool.query(`SELECT id_usuario, nombre, correo, telefono, google_id, avatar_url, activo, acepto_privacidad, privacidad_aceptada_en FROM usuarios WHERE id_usuario = ?`, [idUsuario]);
    usuario.roles = await obtenerRolUsuario(idUsuario);
    setSessionCookie(res, usuario);
    return serializarUsuarioSesion(usuario);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

app.get('/api/auth/config', (req, res) => {
  res.json({ googleClientId: googleClientId || '' });
});

app.get('/api/auth/google/start', (req, res) => {
  if (!googleClientId) return res.status(500).send('GOOGLE_CLIENT_ID no está configurado.');
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || ('http://localhost:' + PORT + '/api/auth/google/callback');
  const oauthClient = new OAuth2Client(googleClientId, process.env.GOOGLE_CLIENT_SECRET || '', redirectUri);
  const url = oauthClient.generateAuthUrl({ access_type: 'online', scope: ['openid', 'email', 'profile'], prompt: 'select_account' });
  res.redirect(url);
});

app.get('/api/auth/google/callback', async (req, res) => {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || ('http://localhost:' + PORT + '/api/auth/google/callback');
  const returnTo = process.env.GOOGLE_LOGIN_SUCCESS_URL || '/?login=success';
  try {
    if (!process.env.GOOGLE_CLIENT_SECRET) throw new Error('GOOGLE_CLIENT_SECRET no está configurado en .env.');
    const oauthClient = new OAuth2Client(googleClientId, process.env.GOOGLE_CLIENT_SECRET, redirectUri);
    const { tokens } = await oauthClient.getToken(req.query.code);
    if (!tokens.id_token) throw new Error('Google no devolvió id_token.');
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: googleClientId });
    await iniciarSesionConPayloadGoogle(ticket.getPayload(), res);
    res.redirect(returnTo);
  } catch (error) {
    console.error('Error en callback de Google:', error.message);
    res.redirect('/?login=error&msg=' + encodeURIComponent(error.message || 'Error de Google'));
  }
});

app.get('/api/auth/session', async (req, res) => {
  try {
    const usuario = await obtenerUsuarioSesion(req);
    if (!usuario) {
      return res.status(401).json({ error: 'Sesión expirada. Inicia sesión nuevamente.' });
    }
    res.json({ user: serializarUsuarioSesion(usuario) });
  } catch (error) {
    res.status(500).json({ error: 'Error al validar la sesión.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  clearSessionCookie(res);
  res.json({ message: 'Sesión cerrada correctamente.' });
});

app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!googleClientId || !client) return res.status(500).json({ error: 'Google Client ID no está configurado en el servidor.' });
  if (!credential || typeof credential !== 'string') return res.status(400).json({ error: 'Token de Google faltante o inválido.' });
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: googleClientId });
    const usuario = await iniciarSesionConPayloadGoogle(ticket.getPayload(), res);
    res.json(usuario);
  } catch (error) {
    console.error('Error al consultar o registrar usuario Google en MySQL:', error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Error al consultar o registrar el usuario en MySQL.' });
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
    // Verificar si la estaciÃ³n estÃ¡ activa
    const [[estacion]] = await pool.query('SELECT activa FROM estaciones WHERE id_estacion = ?', [idEstacion]);
    if (!estacion || !estacion.activa) {
      return res.status(403).json({ error: 'La estaciÃ³n se encuentra inactiva.' });
    }

    // 1. Obtener todas las preguntas de la estaciÃ³n
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
    }).filter(p => {
      const correctas = p.respuestas.filter(r => r.es_correcta).length;
      const incorrectas = p.respuestas.length - correctas;
      return p.respuestas.length >= 2 && correctas === 1 && incorrectas >= 1;
    });

    res.json(preguntasConRespuestas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 5. POST /api/progreso/completar
// ==========================================
app.post('/api/progreso/completar', permitirJugador, verificarBloqueoJugador, async (req, res) => {
  const { id_usuario, id_estacion, puntaje, aciertos, errores, aprobada } = req.body;

  if (!id_usuario || !id_estacion) {
    return res.status(400).json({ error: 'Faltan parÃ¡metros obligatorios: id_usuario o id_estacion.' });
  }

  let estacion = null;
  try {
    [[estacion]] = await pool.query('SELECT id_estacion, activa, nombre, puntos, puntaje_minimo FROM estaciones WHERE id_estacion = ?', [id_estacion]);
    if (!estacion || !estacion.activa) {
      return res.status(403).json({ error: 'La estaciÃ³n se encuentra inactiva y no se puede guardar progreso.' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const validacionEstacion = evaluarAprobacionEstacion(estacion, puntaje, aprobada, { id_estacion, aciertos, errores });
    const isPassed = validacionEstacion.aprobada;

    // 1. Consultar el progreso actual del usuario para esta estaciÃ³n
    const [[progresoExistente]] = await connection.query(
      'SELECT * FROM progreso_usuario WHERE id_usuario = ? AND id_estacion = ?',
      [id_usuario, id_estacion]
    );

    let nuevoPuntaje = isPassed
      ? validacionEstacion.puntaje
      : (estacionTieneReglaEstricta(id_estacion) ? 0 : validacionEstacion.puntaje);
    let nuevosAciertos = aciertos || 0;
    let nuevosErrores = errores || 0;
    let nuevoCompletada = isPassed;
    let nuevoAprobada = isPassed;
    let nuevoFechaCompletado = isPassed ? new Date() : null;

    if (progresoExistente) {
      const progresoPrevioValido = progresoCumpleAprobacionEstacion({
        ...estacion,
        ...progresoExistente,
        puntos_estacion: estacion.puntos,
        puntaje_minimo_estacion: estacion.puntaje_minimo
      });
      nuevoCompletada = progresoPrevioValido || isPassed;
      nuevoAprobada = progresoPrevioValido || isPassed;

      // Mantener la mejor puntuaciÃ³n vÃ¡lida ya ganada si el intento actual no mejora el progreso.
      if (progresoPrevioValido && (!isPassed || progresoExistente.puntaje >= nuevoPuntaje)) {
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

    // Registrar en auditoria_acciones que el usuario completÃ³ la estaciÃ³n
    await connection.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'usuario', 'COMPLETAR_ESTACION', 'progreso_usuario', ?, ?)`,
      [id_usuario, String(id_estacion), `Usuario registrÃ³ estaciÃ³n ${id_estacion} con puntaje ${puntaje} de ${validacionEstacion.puntaje_minimo} requeridos (aprobada: ${isPassed})`]
    );

    // 3. Verificar si el usuario ha completado todas las estaciones obligatorias [1, 2, 3, 4, 5, 6]
    const [progreso] = await connection.query(
      `SELECT p.id_estacion, p.completada, p.aprobada, p.puntaje, p.aciertos, p.errores,
              e.puntos AS puntos_estacion, e.puntaje_minimo AS puntaje_minimo_estacion
       FROM progreso_usuario p
       JOIN estaciones e ON e.id_estacion = p.id_estacion
       WHERE p.id_usuario = ?`,
      [id_usuario]
    );

    const estacionesAprobadas = progreso
      .filter(progresoCumpleAprobacionEstacion)
      .map(p => p.id_estacion);
    const estacionesObligatorias = [1, 2, 3, 4, 5, 6];
    const tieneTodoAprobado = estacionesObligatorias.every(id => estacionesAprobadas.includes(id));

    let boletoGenerado = null;
    let bloqueoFinalizacion = null;

    if (tieneTodoAprobado) {
      console.log(`ðŸŽ‰ Usuario ${id_usuario} ha completado todo el recorrido!`);

      // Registrar auditoria de completar recorrido
      await connection.query(
        `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
         VALUES (?, 'usuario', 'COMPLETAR_RECORRIDO', 'progreso_usuario', ?, 'Usuario completÃ³ la totalidad del recorrido del museo (estaciones 1, 2, 3, 4, 5, 6)')`,
        [id_usuario, String(id_usuario)]
      );

      // Verificar si ya tiene un boleto existente
      const [[boletoExistente]] = await connection.query(
        `SELECT *
         FROM boletos
         WHERE id_usuario = ?
           AND usado = FALSE
           AND LOWER(estado) = 'activo'
           AND (valido_hasta IS NULL OR valido_hasta > CURRENT_TIMESTAMP)
         ORDER BY id_boleto DESC
         LIMIT 1`,
        [id_usuario]
      );

      if (!boletoExistente) {
        // Generar Folio y QR token Ãºnicos
        const folio = await generarFolioUnico(connection);
        const qrToken = crypto.randomBytes(16).toString('hex');
        const host = req.get('host') || 'localhost:3000';
        const qrData = `http://${host}/Boleto_Digital/validar.html?token=${qrToken}`;

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
           VALUES (?, ?, 'generacion', 'Boleto generado automÃ¡ticamente por completar la totalidad del recorrido del museo')`,
          [newBoletoId, id_usuario]
        );

        // Registrar auditorÃ­a de boleto generado
        await connection.query(
          `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
           VALUES (?, 'usuario', 'GENERAR_BOLETO', 'boletos', ?, 'Boleto generado automÃ¡ticamente por completar recorrido')`,
          [id_usuario, String(newBoletoId)]
        );



        // Obtener el boleto insertado para retornarlo
        const [[nuevoBoleto]] = await connection.query('SELECT * FROM boletos WHERE id_boleto = ?', [newBoletoId]);
        boletoGenerado = nuevoBoleto;
        bloqueoFinalizacion = await playtime.registrarGanado(id_usuario, newBoletoId, connection);
      } else {
        boletoGenerado = boletoExistente;
        if (tieneTodoAprobado) {
          bloqueoFinalizacion = await playtime.registrarGanado(id_usuario, boletoExistente.id_boleto, connection);
        }
      }
    }

    await connection.commit();

    const [[progresoFinal]] = await pool.query(
      'SELECT * FROM progreso_usuario WHERE id_usuario = ? AND id_estacion = ?',
      [id_usuario, id_estacion]
    );

    const fechaPuedeVolver = bloqueoFinalizacion?.fecha_puede_volver_jugar
      ? new Date(bloqueoFinalizacion.fecha_puede_volver_jugar)
      : null;
    const finalizacion = bloqueoFinalizacion ? {
      recorrido_completado: true,
      fecha_finalizacion: bloqueoFinalizacion.fecha_finalizacion || bloqueoFinalizacion.fecha_ganado,
      fecha_puede_volver: fechaPuedeVolver ? fechaPuedeVolver.toISOString() : null,
      fecha_puede_volver_texto: fechaPuedeVolver ? playtime.formatFechaMX(fechaPuedeVolver) : null,
      dias_bloqueo: bloqueoFinalizacion.cantidad_bloqueo,
      mensaje: fechaPuedeVolver ? playtime.buildMensajeBloqueo(fechaPuedeVolver) : null
    } : null;

    res.json({ 
      message: 'Progreso guardado correctamente.', 
      progreso: { ...progresoFinal, boletoGenerado, finalizacion },
      boletoGenerado,
      finalizacion
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error guardando progreso con transacciÃ³n:', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// ==========================================
// 5a. POST /api/progreso/inicializar
// ==========================================
app.post('/api/progreso/inicializar', permitirJugador, verificarBloqueoJugador, async (req, res) => {
  const { id_usuario, id_estacion } = req.body;

  if (!id_usuario || !id_estacion) {
    return res.status(400).json({ error: 'Faltan parÃ¡metros obligatorios: id_usuario o id_estacion.' });
  }

  try {
    // Verificar si la estaciÃ³n estÃ¡ activa
    const [[estacion]] = await pool.query('SELECT activa, nombre, puntos, puntaje_minimo FROM estaciones WHERE id_estacion = ?', [id_estacion]);
    if (!estacion || !estacion.activa) {
      return res.status(403).json({ error: 'La estaciÃ³n se encuentra inactiva.' });
    }

    await playtime.asegurarParticipacionActiva(pool, id_usuario);

    await pool.query(
      `INSERT INTO progreso_usuario 
        (id_usuario, id_estacion, completada, aprobada, puntaje, aciertos, errores, fecha_inicio, fecha_completado)
       VALUES (?, ?, FALSE, FALSE, 0, 0, 0, CURRENT_TIMESTAMP, NULL)
       ON DUPLICATE KEY UPDATE 
          completada = completada,
          aprobada = aprobada,
          fecha_completado = fecha_completado,
          puntaje = puntaje,
          aciertos = aciertos,
          errores = errores,
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
app.post('/api/progreso/reset', permitirJugador, verificarBloqueoExceptoReinicioPrueba, async (req, res) => {
  const { id_usuario } = req.body;
  const forceReset = esReinicioDePrueba(req);
  const idUsuarioAutorizado = req.idUsuario;

  if (!id_usuario) {
    return res.status(400).json({ error: 'Falta el parÃ¡metro id_usuario.' });
  }

  if (String(id_usuario) !== String(idUsuarioAutorizado)) {
    return res.status(403).json({ error: 'No puedes reiniciar el progreso de otro usuario.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Eliminar todo el progreso e historial asociado al usuario
    await connection.query('DELETE FROM progreso_usuario WHERE id_usuario = ?', [id_usuario]);
    await connection.query('DELETE FROM intentos_estacion WHERE id_usuario = ?', [id_usuario]);
    await connection.query('DELETE FROM partidas_minijuego WHERE id_usuario = ?', [id_usuario]);
    await connection.query('DELETE FROM boletos WHERE id_usuario = ?', [id_usuario]);

    if (forceReset) {
      await connection.query(
        `UPDATE premios
         SET ciclo_reiniciado_at = COALESCE(ciclo_reiniciado_at, CURRENT_TIMESTAMP),
             estado_bloqueo = 'desbloqueado',
             fecha_puede_volver_jugar = CURRENT_TIMESTAMP,
             motivo_bloqueo = NULL,
             detalle_bloqueo = NULL
         WHERE id_usuario = ?`,
        [id_usuario]
      );

      await connection.query(
        `UPDATE participaciones
         SET estado = 'habilitado',
             fecha_fin = COALESCE(fecha_fin, CURRENT_TIMESTAMP)
         WHERE id_usuario = ?
           AND estado IN ('en_curso', 'ganado', 'reclamado')`,
        [id_usuario]
      );
    }

    // Registrar en auditoria_acciones
    await connection.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'usuario', 'REINICIAR_PROGRESO', 'progreso_usuario', ?, ?)`,
      [
        id_usuario,
        String(id_usuario),
        forceReset
          ? 'Usuario reinicio todo su progreso desde el boton de prueba'
          : 'Usuario reiniciÃ³ todo su progreso de estaciones y boletos'
      ]
    );

    await connection.commit();
    res.json({
      message: 'Progreso reiniciado correctamente en la base de datos.',
      modo_prueba: forceReset
    });
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
app.post('/api/partidas-minijuego', permitirJugador, verificarBloqueoJugador, async (req, res) => {
  const { id_usuario, id_estacion, puntaje, aprobado } = req.body;

  if (!id_usuario) {
    return res.status(400).json({ error: 'Falta el parÃ¡metro id_usuario.' });
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
app.post('/api/intentos', permitirJugador, verificarBloqueoJugador, async (req, res) => {
  const { id_usuario, id_estacion, puntaje, aciertos, errores, aprobado, finalizado } = req.body;

  if (!id_usuario || !id_estacion) {
    return res.status(400).json({ error: 'Faltan parÃ¡metros: id_usuario o id_estacion' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Auto-desbloquear estaciones expiradas primero
    await autoUnlockEstaciones(connection, id_usuario);

    const [[estacion]] = await connection.query('SELECT activa, nombre, puntos, puntaje_minimo FROM estaciones WHERE id_estacion = ?', [id_estacion]);
    if (!estacion || !estacion.activa) {
      await connection.rollback();
      return res.status(403).json({ error: 'La estaciÃ³n se encuentra inactiva.' });
    }

    const [[progress]] = await connection.query(
      `SELECT id_estacion, completada, aprobada, bloqueada, fecha_puede_volver_jugar, puntaje, aciertos, errores
       FROM progreso_usuario
       WHERE id_usuario = ? AND id_estacion = ?`,
      [id_usuario, id_estacion]
    );

    const progresoAprobado = progresoCumpleAprobacionEstacion({
      ...progress,
      puntos_estacion: estacion.puntos,
      puntaje_minimo_estacion: estacion.puntaje_minimo
    });

    if (progresoAprobado) {
      await connection.rollback();
      return res.status(403).json({ error: 'Ya has aprobado esta estaciÃ³n.' });
    }

    if (progress?.bloqueada) {
      await connection.rollback();
      return res.status(403).json({
        error: 'estacion_bloqueada',
        mensaje: 'Esta estaciÃ³n estÃ¡ bloqueada temporalmente por lÃ­mite de intentos.',
        fecha_puede_volver_jugar: progress.fecha_puede_volver_jugar
      });
    }

    // Buscar si ya hay un intento activo no finalizado para este usuario y estaciÃ³n
    const [[activeAttempt]] = await connection.query(
      `SELECT id_intento 
       FROM intentos_estacion 
       WHERE id_usuario = ? AND id_estacion = ? AND finalizado = FALSE 
       LIMIT 1`,
      [id_usuario, id_estacion]
    );

    if (activeAttempt) {
      const [[failuresRow]] = await connection.query(
        `SELECT COUNT(*) AS fallos
         FROM intentos_estacion
         WHERE id_usuario = ?
           AND id_estacion = ?
           AND aprobado = FALSE
           AND finalizado = TRUE`,
        [id_usuario, id_estacion]
      );
      const fallos = Number(failuresRow?.fallos || 0);

      await connection.commit();
      return res.status(200).json({
        message: 'Intento de estaciÃ³n activo reutilizado.',
        id_intento: activeAttempt.id_intento,
        finalizado: false,
        aprobado: false,
        intentos_fallidos: fallos,
        limite_intentos: FAILED_ATTEMPT_LIMIT,
        bloqueo: null
      });
    }

    const validacionEstacion = evaluarAprobacionEstacion(estacion, puntaje, aprobado, { id_estacion, aciertos, errores });
    const aprobadoValidado = validacionEstacion.aprobada;
    const intentoFinalizado = inferirIntentoFinalizado({ finalizado, aprobado: aprobadoValidado, puntaje, aciertos, errores });
    const [result] = await connection.query(
      `INSERT INTO intentos_estacion (id_usuario, id_estacion, puntaje, aciertos, errores, aprobado, finalizado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id_usuario, id_estacion, validacionEstacion.puntaje, aciertos || 0, errores || 0, aprobadoValidado, intentoFinalizado]
    );

    const intentos = (!aprobadoValidado && intentoFinalizado)
      ? await evaluarBloqueoPorIntentos(connection, id_usuario, id_estacion)
      : { fallos: 0, bloqueo: null };

    await connection.commit();

    res.status(201).json({
      message: 'Intento de estaciÃ³n registrado correctamente.',
      id_intento: result.insertId,
      finalizado: intentoFinalizado,
      aprobado: aprobadoValidado,
      intentos_fallidos: intentos.fallos,
      limite_intentos: FAILED_ATTEMPT_LIMIT,
      bloqueo: intentos.bloqueo
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

async function intentosLegacyDisabledNotMounted(req, res) {
  const { id_usuario, id_estacion, puntaje, aciertos, errores, aprobado, finalizado } = req.body;

  if (!id_usuario || !id_estacion) {
    return res.status(400).json({ error: 'Faltan parÃ¡metros: id_usuario o id_estacion' });
  }

  try {
    // Verificar si la estaciÃ³n estÃ¡ activa
    const [[estacion]] = await pool.query('SELECT activa, nombre, puntos, puntaje_minimo FROM estaciones WHERE id_estacion = ?', [id_estacion]);
    if (!estacion || !estacion.activa) {
      return res.status(403).json({ error: 'La estaciÃ³n se encuentra inactiva.' });
    }

    const [result] = await pool.query(
      `INSERT INTO intentos_estacion (id_usuario, id_estacion, puntaje, aciertos, errores, aprobado)
       VALUES (?, ?, ?, ?, ?, ? )`,
      [id_usuario, id_estacion, puntaje || 0, aciertos || 0, errores || 0, Boolean(aprobado)]
    );

    res.status(201).json({
      message: 'Intento de estaciÃ³n registrado correctamente.',
      id_intento: result.insertId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// ==========================================
// 6a. PUT /api/intentos/:id_intento
// ==========================================
app.put('/api/intentos/:id_intento', permitirJugador, verificarBloqueoJugador, async (req, res) => {
  const idIntento = req.params.id_intento;
  const { puntaje, aciertos, errores, aprobado, finalizado } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[intentoActual]] = await connection.query(
      `SELECT i.id_usuario, i.id_estacion, e.activa, e.nombre, e.puntos, e.puntaje_minimo
       FROM intentos_estacion i
       JOIN estaciones e ON e.id_estacion = i.id_estacion
       WHERE i.id_intento = ?`,
      [idIntento]
    );

    if (!intentoActual) {
      await connection.rollback();
      return res.status(404).json({ error: 'Intento no encontrado.' });
    }

    if (!intentoActual.activa) {
      await connection.rollback();
      return res.status(403).json({ error: 'La estaciÃ³n se encuentra inactiva.' });
    }

    const validacionEstacion = evaluarAprobacionEstacion(intentoActual, puntaje, aprobado, {
      id_estacion: intentoActual.id_estacion,
      aciertos,
      errores
    });
    const aprobadoValidado = validacionEstacion.aprobada;
    const intentoFinalizado = finalizado === undefined
      ? true
      : inferirIntentoFinalizado({ finalizado, aprobado: aprobadoValidado, puntaje, aciertos, errores });

    await connection.query(
      `UPDATE intentos_estacion
       SET puntaje = ?, aciertos = ?, errores = ?, aprobado = ?, finalizado = ?
       WHERE id_intento = ?`,
      [validacionEstacion.puntaje, aciertos || 0, errores || 0, aprobadoValidado, intentoFinalizado, idIntento]
    );

    let intentos = { fallos: 0, bloqueo: null };
    if (!aprobadoValidado && intentoFinalizado) {
      await autoUnlockEstaciones(connection, intentoActual.id_usuario);
      intentos = await evaluarBloqueoPorIntentos(connection, intentoActual.id_usuario, intentoActual.id_estacion);
    }

    await connection.commit();

    res.json({
      message: 'Intento de estaciÃ³n actualizado correctamente.',
      finalizado: intentoFinalizado,
      aprobado: aprobadoValidado,
      intentos_fallidos: intentos.fallos,
      limite_intentos: FAILED_ATTEMPT_LIMIT,
      bloqueo: intentos.bloqueo
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error al actualizar intento:', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

async function actualizarIntentoLegacyDisabledNotMounted(req, res) {
  const idIntento = req.params.id_intento;
  const { puntaje, aciertos, errores, aprobado } = req.body;

  try {
    await pool.query(
      `UPDATE intentos_estacion 
       SET puntaje = ?, aciertos = ?, errores = ?, aprobado = ?
       WHERE id_intento = ?`,
      [puntaje || 0, aciertos || 0, errores || 0, Boolean(aprobado), idIntento]
    );

    res.json({ message: 'Intento de estaciÃ³n actualizado correctamente.' });
  } catch (error) {
    console.error('Error al actualizar intento:', error.message);
    res.status(500).json({ error: error.message });
  }
}

// ==========================================
// 7. POST /api/respuestas-usuario
// ==========================================
app.post('/api/respuestas-usuario', permitirJugador, verificarBloqueoJugador, async (req, res) => {
  const { id_intento, id_usuario, id_estacion, pregunta_texto, respuesta_texto, es_correcta } = req.body;

  if (!id_intento || !id_usuario || !id_estacion || !pregunta_texto || !respuesta_texto) {
    return res.status(400).json({ error: 'Faltan parÃ¡metros obligatorios en la peticiÃ³n.' });
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
        'INSERT INTO preguntas (id_estacion, pregunta, activa) VALUES (?, ?, FALSE)',
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
        'INSERT INTO respuestas (id_pregunta, texto_respuesta, es_correcta, activa) VALUES (?, ?, ?, FALSE)',
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
    console.error('Error guardando respuestas del usuario dinÃ¡micamente:', error.message);
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
  const connection = await pool.getConnection();
  try {
    await autoUnlockEstaciones(connection, idUsuario);
    const [progreso] = await connection.query(
      `SELECT p.*, e.nombre AS nombre_estacion, e.tipo AS tipo_estacion,
              e.puntos AS puntos_estacion, e.puntaje_minimo AS puntaje_minimo_estacion
       FROM progreso_usuario p
       JOIN estaciones e ON p.id_estacion = e.id_estacion
       WHERE p.id_usuario = ?`,
      [idUsuario]
    );
    res.json(progreso.map(normalizarProgresoAprobacion));
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// ==========================================
// 9. POST /api/boletos
// ==========================================
app.post('/api/boletos', permitirJugador, async (req, res) => {
  const { id_usuario, reclamar, tipo_entrada, destino_boleto, lugar } = req.body;

  if (!id_usuario) {
    return res.status(400).json({ error: 'Falta el id_usuario.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Verificar si el usuario estÃ¡ bloqueado por el playtime block
    const estadoBloqueo = await playtime.getEstadoBloqueo(id_usuario);
    const puedeReclamarPremioPendiente = Boolean(
      reclamar
      && estadoBloqueo.bloqueado
      && estadoBloqueo.premio
      && estadoBloqueo.premio.estado === 'pendiente'
    );
    if (estadoBloqueo.bloqueado && !puedeReclamarPremioPendiente) {
      console.warn(`Usuario ${id_usuario} intentÃ³ generar boleto estando bloqueado. Vuelve el:`, estadoBloqueo.fecha_puede_volver);
      await connection.rollback();
      return res.status(403).json({
        error: 'usuario_bloqueado',
        mensaje: estadoBloqueo.mensaje,
        motivo_bloqueo: estadoBloqueo.motivo_bloqueo,
        fecha_puede_volver: estadoBloqueo.fecha_puede_volver,
        fecha_puede_volver_texto: estadoBloqueo.fecha_puede_volver_texto
      });
    }

    // 2. Verificar si ya existe un boleto y su estado
    const [[boletoExistente]] = await connection.query(
      `SELECT *
       FROM boletos
       WHERE id_usuario = ?
         AND usado = FALSE
         AND LOWER(estado) = 'activo'
         AND (valido_hasta IS NULL OR valido_hasta > CURRENT_TIMESTAMP)
       ORDER BY id_boleto DESC
       LIMIT 1`,
      [id_usuario]
    );

    if (boletoExistente && (boletoExistente.usado || boletoExistente.estado === 'canjeado')) {
      console.warn(`Usuario ${id_usuario} intentÃ³ generar/modificar un boleto que ya fue usado o canjeado.`);
      await connection.rollback();
      return res.status(403).json({
        error: 'usuario_bloqueado',
        mensaje: 'Ya has reclamado y utilizado tu boleto. No se permite generar otro boleto.'
      });
    }

    // Auto-desbloquear primero
    await autoUnlockEstaciones(connection, id_usuario);

    const [progreso] = await connection.query(
      `SELECT p.id_estacion, p.completada, p.aprobada, p.fallida, p.bloqueada, p.puntaje, p.aciertos, p.errores,
              e.puntos AS puntos_estacion, e.puntaje_minimo AS puntaje_minimo_estacion
       FROM progreso_usuario p
       JOIN estaciones e ON e.id_estacion = p.id_estacion
       WHERE p.id_usuario = ?`,
      [id_usuario]
    );

    const estacionesAprobadas = progreso
      .filter(progresoCumpleAprobacionEstacion)
      .map(p => p.id_estacion);
    const tieneAlgunaFallidaOBloqueada = progreso.some(p => p.fallida || p.bloqueada);
    const estacionesObligatorias = [1, 2, 3, 4, 5, 6];
    const tieneTodoAprobado = estacionesObligatorias.every(id => estacionesAprobadas.includes(id));

    if (!tieneTodoAprobado || tieneAlgunaFallidaOBloqueada) {
      console.warn(`Usuario ${id_usuario} intenta generar boleto sin cumplir requisitos. Aprobadas:`, estacionesAprobadas, `Tiene fallida/bloqueada:`, tieneAlgunaFallidaOBloqueada);
      await connection.rollback();
      return res.status(403).json({
        error: 'requisitos_insuficientes',
        mensaje: tieneAlgunaFallidaOBloqueada
          ? 'No puedes reclamar tu boleto porque tienes una estaciÃ³n fallida o bloqueada.'
          : 'Debes completar y aprobar todas las estaciones antes de reclamar tu boleto.'
      });
    }

    const recibioSeleccionBoleto = [tipo_entrada, destino_boleto, lugar].some(tieneTexto);
    const destinoNormalizado = recibioSeleccionBoleto ? normalizarDestinoBoleto(destino_boleto, tipo_entrada) : '';
    const tipoEntradaNormalizado = recibioSeleccionBoleto ? normalizarTipoEntrada(tipo_entrada, destinoNormalizado) : '';
    const fechaEmisionBoleto = new Date();
    const fechaVencimientoBoleto = calcularFechaVencimientoBoleto(fechaEmisionBoleto);
    const seccionBoleto = destinoNormalizado ? (esBoletoPlanetario(destinoNormalizado) ? 'Planetario' : 'MUCH') : '';
    const lugarBoleto = typeof lugar === 'string' && lugar.trim()
      ? lugar.trim()
      : (destinoNormalizado ? (esBoletoPlanetario(destinoNormalizado) ? 'Planetario Tuxtla' : 'Museo Chiapas de Ciencia y TecnologÃ­a') : '');
    const ticketMetadata = recibioSeleccionBoleto ? {
      tipo_entrada: tipoEntradaNormalizado,
      destino_boleto: destinoNormalizado,
      seccion_boleto: seccionBoleto,
      lugar: lugarBoleto,
      valido_desde: fechaEmisionBoleto.toISOString(),
      valido_hasta: fechaVencimientoBoleto.toISOString()
    } : null;
    const hasTicketMetadata = Boolean(ticketMetadata);
    const ticketObservaciones = hasTicketMetadata ? JSON.stringify(ticketMetadata) : null;

    let boletoRespuesta = boletoExistente;
    let esNuevo = false;

    if (!boletoExistente) {
      const folio = await generarFolioUnico(connection);
      const qrToken = crypto.randomBytes(16).toString('hex');
      const host = req.get('host') || 'localhost:3000';
      const qrData = `http://${host}/Boleto_Digital/validar.html?token=${qrToken}`;

      const [boletoResult] = await connection.query(
        `INSERT INTO boletos (id_usuario, folio, qr_token, qr_data, tipo_entrada, destino_boleto, seccion_boleto, estado, usado, valido_desde, valido_hasta, observaciones)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'activo', FALSE, ?, ?, ?)`,
        [
          id_usuario,
          folio,
          qrToken,
          qrData,
          tipoEntradaNormalizado || null,
          destinoNormalizado || null,
          seccionBoleto || null,
          hasTicketMetadata ? fechaEmisionBoleto : null,
          hasTicketMetadata ? fechaVencimientoBoleto : null,
          ticketObservaciones
        ]
      );

      const newBoletoId = boletoResult.insertId;

      await connection.query(
        `INSERT INTO movimientos_boleto (id_boleto, id_usuario, tipo_movimiento, observaciones)
         VALUES (?, ?, 'generacion', ?)`,
        [
          newBoletoId,
          id_usuario,
          'Boleto generado al completar recorrido'
        ]
      );

      const [[nuevoBoleto]] = await connection.query('SELECT * FROM boletos WHERE id_boleto = ?', [newBoletoId]);
      boletoRespuesta = nuevoBoleto;
      esNuevo = true;

      await connection.query(
        `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
         VALUES (?, 'usuario', 'GENERAR_BOLETO', 'boletos', ?, ?)`,
        [
          id_usuario,
          String(newBoletoId),
          'Boleto generado al completar recorrido'
        ]
      );

      await playtime.registrarGanado(id_usuario, newBoletoId, connection);
    } else if (hasTicketMetadata) {
      const host = req.get('host') || 'localhost:3000';
      const qrDataActualizado = boletoExistente.qr_token
        ? `http://${host}/Boleto_Digital/validar.html?token=${boletoExistente.qr_token}`
        : boletoExistente.qr_data;
      await connection.query(
        `UPDATE boletos
         SET qr_data = CASE
               WHEN qr_data IS NULL OR qr_data = '' OR LOCATE('/taquilla', qr_data) > 0 THEN ?
               ELSE qr_data
             END,
             tipo_entrada = COALESCE(NULLIF(tipo_entrada, ''), ?),
             destino_boleto = COALESCE(NULLIF(destino_boleto, ''), ?),
             seccion_boleto = COALESCE(NULLIF(seccion_boleto, ''), ?),
             valido_desde = COALESCE(valido_desde, ?),
             valido_hasta = COALESCE(valido_hasta, ?),
             observaciones = CASE
               WHEN observaciones IS NULL OR observaciones = '' OR observaciones NOT LIKE '{%' THEN ?
               ELSE observaciones
             END
         WHERE id_boleto = ?`,
        [
          qrDataActualizado,
          tipoEntradaNormalizado,
          destinoNormalizado,
          seccionBoleto,
          fechaEmisionBoleto,
          fechaVencimientoBoleto,
          ticketObservaciones,
          boletoExistente.id_boleto
        ]
      );
      const [[boletoActualizado]] = await connection.query('SELECT * FROM boletos WHERE id_boleto = ?', [boletoExistente.id_boleto]);
      boletoRespuesta = boletoActualizado;
    }

    let reclamoInfo = null;
    if (reclamar) {
      reclamoInfo = await playtime.registrarReclamo(id_usuario, boletoRespuesta.id_boleto, connection);
    }

    await connection.commit();

    const payload = anexarMetadataBoleto({ ...boletoRespuesta });
    if (ticketMetadata?.tipo_entrada && !payload.tipo_entrada) {
      payload.tipo_entrada = ticketMetadata.tipo_entrada;
    }
    if (ticketMetadata?.destino_boleto && !payload.destino_boleto) {
      payload.destino_boleto = ticketMetadata.destino_boleto;
    }
    payload.valido_desde = payload.valido_desde || ticketMetadata?.valido_desde || null;
    payload.valido_hasta = payload.valido_hasta || ticketMetadata?.valido_hasta || null;
    payload.seccion_boleto = payload.seccion_boleto || ticketMetadata?.seccion_boleto || '';
    if (reclamoInfo) {
      payload.reclamo = reclamoInfo;
    }

    res.status(esNuevo ? 201 : 200).json(payload);
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
// 9c. GET /api/boletos/qr/:qr_token
// ==========================================
app.get('/api/boletos/qr/:qr_token', async (req, res) => {
  const qrToken = req.params.qr_token;
  try {
    const [[boleto]] = await pool.query(
      `SELECT b.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario, u.telefono AS telefono_usuario
       FROM boletos b
       JOIN usuarios u ON b.id_usuario = u.id_usuario
       WHERE b.qr_token = ?`,
      [qrToken]
    );

    if (!boleto) {
      return res.status(404).json({ error: 'QR de boleto no registrado.' });
    }

    res.json(await marcarBoletoVencidoSiAplica(boleto));
  } catch (error) {
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
      `SELECT b.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario, u.telefono AS telefono_usuario
       FROM boletos b
       JOIN usuarios u ON b.id_usuario = u.id_usuario
       WHERE b.folio = ?`,
      [folio]
    );

    if (!boleto) {
      return res.status(404).json({ error: 'Boleto no encontrado por folio.' });
    }

    const [[premioBoleto]] = await pool.query(
      `SELECT estado AS estado_premio, fecha_finalizacion, fecha_puede_volver_jugar
       FROM premios
       WHERE id_usuario = ?
         AND (id_boleto = ? OR id_boleto IS NULL)
       ORDER BY (id_boleto = ?) DESC, COALESCE(fecha_finalizacion, fecha_ganado, created_at) DESC
       LIMIT 1`,
      [boleto.id_usuario, boleto.id_boleto, boleto.id_boleto]
    );

    const boletoActualizado = await marcarBoletoVencidoSiAplica(boleto);
    res.json({
      ...boletoActualizado,
      estado_premio: premioBoleto?.estado_premio || null,
      fecha_finalizacion: premioBoleto?.fecha_finalizacion || null,
      fecha_puede_volver: premioBoleto?.fecha_puede_volver_jugar || null
    });
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
      `SELECT b.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario, u.telefono AS telefono_usuario, u.avatar_url AS avatar_usuario
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

    res.json(await marcarBoletoVencidoSiAplica(boleto));
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
      `SELECT b.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario, u.telefono AS telefono_usuario, u.avatar_url AS avatar_usuario
       FROM boletos b
       JOIN usuarios u ON b.id_usuario = u.id_usuario
       WHERE b.qr_token = ?`,
      [qrToken]
    );

    if (!boleto) {
      // Registrar escaneo como no encontrado
      await pool.query(
        `INSERT INTO escaneos_qr_boleto (qr_token, escaneado_por, resultado, observaciones)
         VALUES (?, ?, 'no_encontrado', 'QR no coincide con ningÃºn boleto registrado')`,
        [qrToken, idOperador]
      );
      return res.status(404).json({ error: 'QR de boleto no registrado.' });
    }

    const boletoNormalizado = await marcarBoletoVencidoSiAplica(boleto);

    // 2. Registrar el escaneo
    const estadoEscaneo = String(boletoNormalizado.estado || '').toLowerCase();
    const resultadoEscaneo = estadoEscaneo === 'activo'
      ? 'valido'
      : (estadoEscaneo === 'canjeado' || boletoNormalizado.usado ? 'duplicado' : estadoEscaneo || 'invalido');
    await pool.query(
      `INSERT INTO escaneos_qr_boleto (id_boleto, qr_token, escaneado_por, resultado, observaciones)
       VALUES (?, ?, ?, ?, 'Boleto escaneado por taquilla')`,
      [boleto.id_boleto, qrToken, idOperador, resultadoEscaneo]
    );

    // 3. Actualizar Ãºltimo escaneo
    await pool.query(
      'UPDATE boletos SET ultimo_escaneo = CURRENT_TIMESTAMP WHERE id_boleto = ?',
      [boleto.id_boleto]
    );

    // 4. Registrar movimiento tipo consulta_qr
    await pool.query(
      `INSERT INTO movimientos_boleto (id_boleto, id_usuario, realizado_por, tipo_movimiento, observaciones)
       VALUES (?, ?, ?, 'consulta_qr', 'Boleto escaneado y consultado vÃ­a QR')`,
      [boleto.id_boleto, boleto.id_usuario, idOperador]
    );

    res.json(boletoNormalizado);
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

    // 2. Validar que estÃ© activo y no canjeado
    const vencido = boleto.valido_hasta && new Date(boleto.valido_hasta).getTime() < Date.now();
    if (vencido && boleto.estado === 'activo' && !boleto.usado) {
      await pool.query(
        "UPDATE boletos SET estado = 'vencido', ultimo_escaneo = CURRENT_TIMESTAMP WHERE id_boleto = ?",
        [idBoleto]
      );
      await pool.query(
        `INSERT INTO movimientos_boleto (id_boleto, id_usuario, realizado_por, tipo_movimiento, observaciones)
         VALUES (?, ?, ?, 'vencimiento', ?)`,
        [idBoleto, boleto.id_usuario, idOperador, observaciones || 'Intento de canje rechazado por boleto vencido']
      );
      return res.status(400).json({
        error: 'boleto_vencido',
        mensaje: 'El boleto estÃ¡ vencido y no puede validarse.'
      });
    }

    if (boleto.estado !== 'activo' || boleto.usado) {
      return res.status(400).json({
        error: `No se puede canjear el boleto. Estatus actual: ${boleto.estado}, Usado: ${boleto.usado ? 'SÃ­' : 'No'}`
      });
    }

    // 3. Actualizar boleto
    const [canjeResult] = await pool.query(
      `UPDATE boletos 
       SET estado = 'canjeado',
           usado = TRUE,
           fecha_uso = CURRENT_TIMESTAMP,
           fecha_canje = CURRENT_TIMESTAMP,
           canjeado_por = ?,
           ultimo_escaneo = CURRENT_TIMESTAMP
       WHERE id_boleto = ?
         AND estado = 'activo'
         AND usado = FALSE
         AND (valido_hasta IS NULL OR valido_hasta >= CURRENT_TIMESTAMP)`,
      [idOperador, idBoleto]
    );

    if (!canjeResult.affectedRows) {
      return res.status(409).json({
        error: 'boleto_no_disponible',
        mensaje: 'El boleto ya no estÃ¡ disponible para validarse.'
      });
    }

    // 4. Registrar movimiento canje
    await pool.query(
      `INSERT INTO movimientos_boleto (id_boleto, id_usuario, realizado_por, tipo_movimiento, observaciones)
       VALUES (?, ?, ?, 'canje', ?)`,
      [idBoleto, boleto.id_usuario, idOperador, observaciones || 'Boleto canjeado en taquilla']
    );

    // 5. Registrar auditorÃ­a
    await pool.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'taquilla', 'CANJEAR_BOLETO', 'boletos', ?, 'Boleto canjeado por operador')`,
      [idOperador, idBoleto]
    );

    const [[premio]] = await pool.query(
      'SELECT id_premio FROM premios WHERE id_boleto = ? ORDER BY id_premio DESC LIMIT 1',
      [idBoleto]
    );
    if (premio) {
      await playtime.marcarEntregado(premio.id_premio);
    }

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

    // Registrar auditorÃ­a
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

    // Registrar auditorÃ­a
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

    // Registrar auditorÃ­a
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
      const dateConditions = ['b.fecha_generacion', 'b.fecha_uso', 'b.fecha_canje', 'b.ultimo_escaneo', 'b.valido_hasta']
        .map((column) => {
          params.push(...parametrosRangoFechas(range));
          return condicionRangoFechas(column, range);
        });
      params.push(...parametrosRangoFechas(range));
      dateConditions.push(`EXISTS (
        SELECT 1
        FROM movimientos_boleto mb
        WHERE mb.id_boleto = b.id_boleto
          AND ${condicionRangoFechas('mb.fecha_movimiento', range)}
      )`);
      dateWhere = `WHERE (${dateConditions.join(' OR ')})`;
    }

    const [boletos] = await pool.query(
      `SELECT b.*, u.nombre AS nombre_usuario, u.correo AS correo_usuario, u.telefono AS telefono_usuario, u2.nombre AS nombre_canjeador
       FROM boletos b
       JOIN usuarios u ON b.id_usuario = u.id_usuario
       LEFT JOIN usuarios u2 ON b.canjeado_por = u2.id_usuario
       ${dateWhere}
       ORDER BY b.fecha_generacion DESC`,
      params
    );
    res.json(boletos.map(anexarMetadataBoleto));
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
    const exists = await usuarioExiste(idUsuario);
    if (!exists) {
      return res.json({ id_usuario: idUsuario, exists: false, roles: [] });
    }

    const roles = await obtenerRolUsuario(idUsuario);
    res.json({ id_usuario: idUsuario, exists: true, roles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19b-2. GET /api/usuarios/:id_usuario/privacy-consent
// ==========================================
app.get('/api/usuarios/:id_usuario/privacy-consent', async (req, res) => {
  const idUsuario = req.params.id_usuario;
  try {
    const [[usuario]] = await pool.query(
      `SELECT id_usuario, acepto_privacidad, privacidad_aceptada_en
       FROM usuarios
       WHERE id_usuario = ?`,
      [idUsuario]
    );

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    res.json({
      id_usuario: usuario.id_usuario,
      acepto_privacidad: Boolean(usuario.acepto_privacidad),
      privacidad_aceptada_en: usuario.privacidad_aceptada_en,
      completo: Boolean(usuario.acepto_privacidad)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 19b-3. POST /api/usuarios/:id_usuario/privacy-consent
// ==========================================
app.post('/api/usuarios/:id_usuario/privacy-consent', async (req, res) => {
  const idUsuario = req.params.id_usuario;
  const { acepto_privacidad } = req.body || {};

  try {
    if (!(await usuarioExiste(idUsuario))) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    if (acepto_privacidad !== true) {
      return res.status(400).json({ error: 'Debes aceptar el aviso de privacidad.' });
    }

    await pool.query(
      `UPDATE usuarios
       SET acepto_privacidad = TRUE,
           privacidad_aceptada_en = CURRENT_TIMESTAMP
       WHERE id_usuario = ?`,
      [idUsuario]
    );

    const [[usuario]] = await pool.query(
      `SELECT id_usuario, acepto_privacidad, privacidad_aceptada_en
       FROM usuarios
       WHERE id_usuario = ?`,
      [idUsuario]
    );

    res.json({
      id_usuario: usuario.id_usuario,
      acepto_privacidad: Boolean(usuario.acepto_privacidad),
      privacidad_aceptada_en: usuario.privacidad_aceptada_en,
      completo: true
    });
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
          WHERE aprobada = TRUE AND id_estacion IN (1, 2, 3, 4, 5, 6)
          GROUP BY id_usuario
          HAVING COUNT(DISTINCT id_estacion) = 6 ${range ? `AND ${condicionRangoFechas('fecha_final', range)}` : ''}
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
      `SELECT e.*, b.folio AS folio_boleto, b.tipo_entrada, b.destino_boleto, b.seccion_boleto,
              b.valido_hasta, visitante.nombre AS nombre_visitante, u.nombre AS nombre_operador
       FROM escaneos_qr_boleto e
       LEFT JOIN boletos b ON e.id_boleto = b.id_boleto
       LEFT JOIN usuarios visitante ON b.id_usuario = visitante.id_usuario
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
  const { id_boleto, qr_token, resultado, observaciones } = req.body;
  const idOperador = req.headers['x-user-id'] || null;

  try {
    let idBoleto = Number(id_boleto) || null;
    if (!idBoleto) {
      const [[boleto]] = await pool.query('SELECT id_boleto FROM boletos WHERE qr_token = ? OR folio = ?', [qr_token, qr_token]);
      idBoleto = boleto ? boleto.id_boleto : null;
    }

    await pool.query(
      `INSERT INTO escaneos_qr_boleto (id_boleto, qr_token, escaneado_por, resultado, observaciones)
       VALUES (?, ?, ?, ?, ?)`,
      [idBoleto, qr_token, idOperador, resultado, observaciones]
    );

    res.json({ message: 'Escaneo registrado con Ã©xito.' });
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
    return res.status(400).json({ error: 'Se requiere una lista de roles vÃ¡lida (arreglo no vacÃ­o).' });
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

      // Registrar en auditorÃ­a
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

    // Registrar en auditorÃ­a
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

    // Registrar en auditorÃ­a
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
// 19k. PUT /api/admin/estaciones/:id_estacion/toggle (Solo Admin - Activar/desactivar estaciÃ³n)
// ==========================================
app.put('/api/admin/estaciones/:id_estacion/toggle', permitirAdmin, async (req, res) => {
  const idEstacion = req.params.id_estacion;
  const realizadoPor = req.headers['x-user-id'] || null;
  try {
    const [[estacion]] = await pool.query('SELECT activa FROM estaciones WHERE id_estacion = ?', [idEstacion]);
    if (!estacion) {
      return res.status(404).json({ error: 'EstaciÃ³n no encontrada.' });
    }

    const nuevoEstado = estacion.activa ? 0 : 1;
    await pool.query('UPDATE estaciones SET activa = ? WHERE id_estacion = ?', [nuevoEstado, idEstacion]);

    // Registrar en auditorÃ­a
    await pool.query(
      `INSERT INTO auditoria_acciones (id_usuario, rol_accion, accion, tabla_afectada, id_registro, descripcion)
       VALUES (?, 'admin', 'TOGGLE_ESTACION', 'estaciones', ?, ?)`,
      [realizadoPor, String(idEstacion), `EstaciÃ³n ${idEstacion} cambiada a ${nuevoEstado ? 'activa' : 'inactiva'}`]
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

    // Registrar en auditorÃ­a
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
// 20. GET /api/leaderboard (Leaderboard pÃºblico)
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
      'SELECT nombre, correo, telefono, avatar_url, fecha_registro FROM usuarios WHERE id_usuario = ?',
      [idUsuario]
    );

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // 2. Obtener progreso y puntuaciÃ³n
    const [progreso] = await pool.query(
      'SELECT id_estacion, completada, aprobada, puntaje, aciertos, errores FROM progreso_usuario WHERE id_usuario = ?',
      [idUsuario]
    );

    // Obtener estaciones activas del recorrido (excluyendo la estaciÃ³n 1 de bienvenida)
    const [estacionesRecorrido] = await pool.query(
      'SELECT id_estacion AS id, nombre, puntos AS puntos_base, tipo FROM estaciones WHERE activa = TRUE AND id_estacion != 1 ORDER BY orden ASC'
    );

    let totalCompletadas = 0;
    let puntajeAcumuladoBase = 0;
    let puntajeAcumuladoDB = 0;
    const progresoEstaciones = [];

    // Determinar estaciÃ³n actual
    let estacionActual = 'Recorrido completado';
    let primeraFaltanteEncontrada = false;

    for (const est of estacionesRecorrido) {
      const p = progreso.find(row => row.id_estacion === est.id);
      const completada = p ? progresoCumpleAprobacionEstacion({
        ...p,
        id_estacion: est.id,
        puntos_estacion: est.puntos_base
      }) : false;

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

    // 3. Rango del usuario segÃºn puntaje base acumulado
    let rango = 'Novato';
    if (puntajeAcumuladoBase >= 50) rango = 'Leyenda';
    else if (puntajeAcumuladoBase >= 35) rango = 'Experto';
    else if (puntajeAcumuladoBase >= 20) rango = 'Explorador';
    else if (puntajeAcumuladoBase >= 10) rango = 'Iniciado';

    // 4. Obtener historial de boletos
    const [boletos] = await pool.query(
      `SELECT b.id_boleto, b.folio, b.qr_token, b.tipo_entrada, b.destino_boleto, b.seccion_boleto,
              b.estado, b.usado, b.fecha_generacion, b.fecha_uso, b.valido_desde, b.valido_hasta,
              p.estado AS estado_premio, p.fecha_finalizacion, p.fecha_puede_volver_jugar AS fecha_puede_volver
       FROM boletos b
       LEFT JOIN premios p ON p.id_premio = (
         SELECT p2.id_premio
         FROM premios p2
         WHERE p2.id_usuario = b.id_usuario
           AND (p2.id_boleto = b.id_boleto OR p2.id_boleto IS NULL)
         ORDER BY (p2.id_boleto = b.id_boleto) DESC, COALESCE(p2.fecha_finalizacion, p2.fecha_ganado, p2.created_at) DESC
         LIMIT 1
       )
       WHERE b.id_usuario = ?
       ORDER BY b.fecha_generacion DESC`,
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
        qr_token: b.qr_token || '',
        tipo,
        tipo_entrada: b.tipo_entrada || tipo,
        destino_boleto: b.destino_boleto || '',
        seccion_boleto: b.seccion_boleto || '',
        valido_desde: b.valido_desde || '',
        valido_hasta: b.valido_hasta || '',
        fecha_generacion: b.fecha_generacion,
        fecha_finalizacion: b.fecha_finalizacion || null,
        fecha_puede_volver: b.fecha_puede_volver || null,
        estado_premio: b.estado_premio || null,
        estado: estadoAmigable
      };
    });

    res.json({
      usuario: {
        nombre: usuario.nombre,
        correo: usuario.correo,
        telefono: usuario.telefono,
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
    return res.status(400).json({ error: 'Faltan parÃ¡metros obligatorios de la ubicaciÃ³n del museo.' });
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
      message: 'VerificaciÃ³n de ubicaciÃ³n guardada correctamente.',
      id_verificacion: result.insertId
    });
  } catch (error) {
    console.error('Error al guardar verificaciÃ³n de ubicaciÃ³n:', error.message);
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
    console.error('Error al obtener Ãºltima verificaciÃ³n de ubicaciÃ³n:', error.message);
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
    let query = `UPDATE verificaciones_ubicacion SET dentro_del_museo = false, mensaje_resultado = 'VerificaciÃ³n invalidada por cambio de sesiÃ³n/cierre de sesiÃ³n' WHERE `;
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
    console.error('Error al invalidar verificaciones de ubicaciÃ³n:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// Bloqueo de tiempo de juego â€” jugador
// ==========================================
app.get('/api/juego/estado-bloqueo', permitirJugador, async (req, res) => {
  try {
    const idUsuario = obtenerIdUsuarioDePeticion(req);
    const estado = await playtime.getEstadoBloqueo(idUsuario);
    res.json(estado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// Bloqueo de tiempo de juego â€” administraciÃ³n
// ==========================================
app.get('/api/admin/configuracion-juego', permitirAdmin, async (req, res) => {
  try {
    const config = await playtime.getConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/configuracion-juego', permitirAdmin, async (req, res) => {
  try {
    const idAdmin = obtenerIdUsuarioDePeticion(req);
    const config = await playtime.updateConfig(req.body, idAdmin);
    const result = await playtime.aplicarConfiguracionABloqueosActivos(idAdmin);
    const bloqueosActualizados = result.actualizados;

    res.json({ config, bloqueos_actualizados: bloqueosActualizados });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/bloqueos-juego', permitirAdmin, async (req, res) => {
  try {
    const usuarios = await playtime.listarUsuariosBloqueo();
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/bloqueos-juego/:id_usuario/historial', permitirAdmin, async (req, res) => {
  try {
    const historial = await playtime.historialPremiosUsuario(req.params.id_usuario);
    res.json(historial);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/bloqueos-juego/:id_usuario/desbloquear', permitirAdmin, async (req, res) => {
  try {
    const estado = await playtime.desbloquearUsuario(req.params.id_usuario);
    res.json({ message: 'Usuario desbloqueado manualmente.', estado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/bloqueos-juego/:id_usuario/fecha', permitirAdmin, async (req, res) => {
  try {
    const { fecha_puede_volver } = req.body;
    if (!fecha_puede_volver) {
      return res.status(400).json({ error: 'Debe proporcionar fecha_puede_volver.' });
    }
    const estado = await playtime.actualizarFechaPermitida(req.params.id_usuario, fecha_puede_volver);
    res.json({ message: 'Fecha de desbloqueo actualizada.', estado });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/admin/premios/:id_premio/entregado', permitirAdmin, async (req, res) => {
  try {
    const premio = await playtime.marcarEntregado(req.params.id_premio);
    res.json({ message: 'Premio marcado como entregado.', premio });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta por defecto para index.html o frontend si se sirve de forma estÃ¡tica
app.use(express.static(path.join(__dirname, '../')));

// Iniciar servidor local
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ðŸš€ Servidor de MisiÃ³n MUCH corriendo en http://localhost:${PORT}`);
});



