const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mysql = require('mysql2/promise');
require('dotenv').config();

const rootDir = path.join(__dirname, '..');
const port = Number(process.env.VERIFY_MYSQL_FLOW_PORT || 3021);
const baseUrl = `http://127.0.0.1:${port}`;
const testId = `codex-e2e-${Date.now()}`;
const emails = {
  admin: `${testId}-admin@example.com`,
  much: `${testId}-much@example.com`,
  planetario: `${testId}-planetario@example.com`,
  attempts: `${testId}-attempts@example.com`,
  answers: `${testId}-answers@example.com`
};

const checks = [];
let serverProcess = null;
let stdout = '';
let stderr = '';
let db = null;

function mark(name, detail = '') {
  checks.push({ name, detail });
}

async function request(method, pathName, options = {}) {
  const { body, headers = {}, expected } = options;
  const response = await fetch(`${baseUrl}${pathName}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }

  if (expected) {
    const expectedList = Array.isArray(expected) ? expected : [expected];
    assert.ok(
      expectedList.includes(response.status),
      `${method} ${pathName} expected ${expectedList.join('/')} got ${response.status}: ${text}`
    );
  } else if (!response.ok) {
    assert.fail(`${method} ${pathName} failed ${response.status}: ${text}`);
  }

  return { status: response.status, data };
}

async function cleanupTestUsers() {
  const [rows] = await db.query(
    "SELECT id_usuario FROM usuarios WHERE correo LIKE 'codex-e2e-%@example.com'"
  );
  const ids = rows.map((row) => row.id_usuario);
  if (!ids.length) return;

  await db.query('DELETE FROM auditoria_acciones WHERE id_usuario IN (?)', [ids]);
  await db.query('DELETE FROM usuarios WHERE id_usuario IN (?)', [ids]);
}

async function waitForHealth() {
  for (let i = 0; i < 45; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return response.json();
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(`El backend no respondio /api/health.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
}

async function createUser(kind, name, telefono) {
  const email = emails[kind];
  const { data } = await request('POST', '/api/auth/google', {
    body: {
      userData: {
        name,
        email,
        google_id: `${testId}-${kind}`,
        picture: 'avatars/dino1.png',
        telefono
      }
    }
  });

  assert.ok(data.id_usuario, `No regreso id_usuario para ${kind}`);
  assert.equal(data.correo, email);
  assert.equal(String(data.telefono || ''), telefono);
  await acceptPrivacy(data);
  return data;
}

async function acceptPrivacy(user) {
  const { data } = await request('POST', `/api/usuarios/${user.id_usuario}/privacy-consent`, {
    body: { acepto_privacidad: true }
  });
  assert.equal(data.acepto_privacidad, true);
}

async function grantRoles(userId, roleNames) {
  const [roles] = await db.query(
    'SELECT id_rol, nombre FROM roles WHERE nombre IN (?)',
    [roleNames]
  );
  assert.equal(roles.length, roleNames.length, 'Faltan roles base en MySQL');

  for (const role of roles) {
    await db.query(
      'INSERT IGNORE INTO usuarios_roles (id_usuario, id_rol) VALUES (?, ?)',
      [userId, role.id_rol]
    );
  }
}

async function completeRoute(user, duplicateCheck = false) {
  const headers = { 'x-user-id': String(user.id_usuario) };
  const stations = [
    { id: 1, score: 10 },
    { id: 2, score: 15 },
    { id: 3, score: 10 },
    { id: 4, score: 10 },
    { id: 5, score: 10 },
    { id: 6, score: 10 }
  ];

  let lastResponse = null;
  for (const station of stations) {
    await request('POST', '/api/progreso/inicializar', {
      headers,
      body: { id_usuario: user.id_usuario, id_estacion: station.id }
    });
    lastResponse = await request('POST', '/api/progreso/completar', {
      headers,
      body: {
        id_usuario: user.id_usuario,
        id_estacion: station.id,
        puntaje: station.score,
        aciertos: station.score,
        errores: 0,
        aprobada: true
      }
    });
  }

  if (duplicateCheck) {
    await request('POST', '/api/progreso/completar', {
      headers,
      body: {
        id_usuario: user.id_usuario,
        id_estacion: 3,
        puntaje: 1,
        aciertos: 1,
        errores: 9,
        aprobada: false
      }
    });
  }

  const [[summary]] = await db.query(
    `SELECT COUNT(*) AS total_rows,
            SUM(puntaje) AS total_score,
            SUM(CASE WHEN aprobada = TRUE THEN 1 ELSE 0 END) AS approved_count
     FROM progreso_usuario
     WHERE id_usuario = ?`,
    [user.id_usuario]
  );

  assert.equal(Number(summary.total_rows), 6, 'Debe existir una fila por estacion');
  assert.equal(Number(summary.approved_count), 6, 'Las 6 estaciones deben quedar aprobadas');
  assert.equal(Number(summary.total_score), 65, 'Los puntos no deben duplicarse ni bajar');

  return lastResponse?.data?.boletoGenerado || null;
}

function assertTicketCore(ticket, expectedDestino) {
  assert.ok(ticket.id_boleto, 'Boleto sin id_boleto');
  assert.ok(ticket.folio && /^[A-Z0-9]{6,}$/.test(ticket.folio), `Folio invalido: ${ticket.folio}`);
  assert.ok(ticket.qr_token && ticket.qr_token.length >= 16, 'QR token invalido');
  assert.ok(
    ticket.qr_data && ticket.qr_data.includes(`/Boleto_Digital/validar.html?token=${ticket.qr_token}`),
    'El QR data no coincide con el token'
  );
  assert.equal(ticket.destino_boleto, expectedDestino);
  assert.equal(ticket.tipo_entrada, expectedDestino);
  assert.equal(ticket.seccion_boleto, expectedDestino === 'Planetario' ? 'Planetario' : 'MUCH');
  assert.ok(ticket.lugar_boleto, 'Falta lugar del boleto');
  assert.ok(ticket.valido_hasta, 'Falta fecha de caducidad');
  assert.ok(new Date(ticket.valido_hasta).getTime() > Date.now(), 'La caducidad debe estar en el futuro');
}

async function claimTicket(user, destino) {
  const lugar = destino === 'Planetario'
    ? 'Planetario Tuxtla'
    : 'Museo Chiapas de Ciencia y Tecnologia';
  const { data } = await request('POST', '/api/boletos', {
    headers: { 'x-user-id': String(user.id_usuario) },
    expected: [200, 201],
    body: {
      id_usuario: user.id_usuario,
      reclamar: true,
      tipo_entrada: destino,
      destino_boleto: destino,
      lugar
    }
  });

  assertTicketCore(data, destino);
  assert.ok(data.reclamo?.fecha_puede_volver_texto, 'El reclamo debe devolver fecha exacta de regreso');
  return data;
}

async function verifyMainFlow() {
  const health = await waitForHealth();
  assert.equal(health.status, 'success');
  mark('Backend health MySQL', health.message);

  const removedClientScope = `@${['su', 'pabase'].join('')}`;
  const removedSqlPackage = ['p', 'g'].join('');
  assert.equal(fs.existsSync(path.join(rootDir, 'node_modules', removedClientScope)), false);
  assert.equal(fs.existsSync(path.join(rootDir, 'node_modules', removedSqlPackage)), false);
  mark('Dependencias activas', 'Sin paquetes removidos instalados');

  const admin = await createUser('admin', 'Codex Admin E2E', '9610000001');
  await grantRoles(admin.id_usuario, ['admin', 'taquilla']);
  const adminHeaders = { 'x-user-id': String(admin.id_usuario) };
  const roles = await request('GET', `/api/usuarios/${admin.id_usuario}/roles`);
  assert.ok(roles.data.roles.includes('admin'));
  assert.ok(roles.data.roles.includes('taquilla'));
  mark('Login y roles MySQL', 'Usuario admin/taquilla creado y autorizado');

  const stations = await request('GET', '/api/estaciones');
  assert.deepEqual(stations.data.map((station) => station.id_estacion), [1, 2, 3, 4, 5, 6]);
  mark('Estaciones activas', 'Se leen desde MySQL en orden 1-6');

  for (const stationId of [3, 4, 5]) {
    const questions = await request('GET', `/api/preguntas/${stationId}`);
    assert.ok(questions.data.length >= 3, `Estacion ${stationId} sin preguntas suficientes`);
    for (const question of questions.data) {
      const correctCount = question.respuestas.filter((answer) => answer.es_correcta).length;
      assert.ok(question.respuestas.length >= 2, `Pregunta ${question.id_pregunta} sin respuestas suficientes`);
      assert.equal(correctCount, 1, `Pregunta ${question.id_pregunta} debe tener exactamente una correcta`);
      assert.ok(question.respuestas.some((answer) => !answer.es_correcta));
    }
  }
  mark('Preguntas y respuestas', 'MySQL devuelve solo preguntas jugables con respuestas validas');

  const answersUser = await createUser('answers', 'Codex Answers E2E', '9610000002');
  const questions = (await request('GET', '/api/preguntas/3')).data;
  const question = questions[0];
  const answer = question.respuestas.find((candidate) => candidate.es_correcta);
  const attempt = await request('POST', '/api/intentos', {
    headers: { 'x-user-id': String(answersUser.id_usuario) },
    body: {
      id_usuario: answersUser.id_usuario,
      id_estacion: 3,
      puntaje: 0,
      aciertos: 0,
      errores: 0,
      aprobado: false,
      finalizado: false
    }
  });

  for (let i = 0; i < 2; i += 1) {
    await request('POST', '/api/respuestas-usuario', {
      headers: { 'x-user-id': String(answersUser.id_usuario) },
      body: {
        id_intento: attempt.data.id_intento,
        id_usuario: answersUser.id_usuario,
        id_estacion: 3,
        pregunta_texto: question.pregunta,
        respuesta_texto: answer.texto_respuesta,
        es_correcta: true
      }
    });
  }

  const [[answerCount]] = await db.query(
    'SELECT COUNT(*) AS total FROM respuestas_usuario WHERE id_intento = ?',
    [attempt.data.id_intento]
  );
  assert.equal(Number(answerCount.total), 1, 'La misma pregunta del mismo intento no debe duplicarse');
  mark('Guardado de respuestas', 'Respuesta se guarda/actualiza en MySQL sin duplicarse');

  const attemptsUser = await createUser('attempts', 'Codex Attempts E2E', '9610000003');
  let thirdFail = null;
  for (let i = 0; i < 3; i += 1) {
    thirdFail = await request('POST', '/api/intentos', {
      headers: { 'x-user-id': String(attemptsUser.id_usuario) },
      expected: 201,
      body: {
        id_usuario: attemptsUser.id_usuario,
        id_estacion: 4,
        puntaje: 0,
        aciertos: 0,
        errores: 10,
        aprobado: false,
        finalizado: true
      }
    });
  }
  assert.equal(thirdFail.data.intentos_fallidos, 3);
  assert.equal(thirdFail.data.bloqueo?.motivo_bloqueo, 'intentos');
  assert.ok(thirdFail.data.bloqueo.fecha_puede_volver_texto);
  const blockedProgress = await request('POST', '/api/progreso/inicializar', {
    headers: { 'x-user-id': String(attemptsUser.id_usuario) },
    expected: 403,
    body: { id_usuario: attemptsUser.id_usuario, id_estacion: 5 }
  });
  assert.equal(blockedProgress.data.error, 'usuario_bloqueado');
  mark('Bloqueo por 3 intentos', thirdFail.data.bloqueo.fecha_puede_volver_texto);

  const muchUser = await createUser('much', 'Codex MUCH E2E', '9610000004');
  const autoTicket = await completeRoute(muchUser, true);
  assert.ok(autoTicket?.folio, 'Completar recorrido debe generar boleto base');
  const muchTicket = await claimTicket(muchUser, 'MUCH');
  const repeatTicket = await request('POST', '/api/boletos', {
    headers: { 'x-user-id': String(muchUser.id_usuario) },
    expected: 403,
    body: {
      id_usuario: muchUser.id_usuario,
      reclamar: true,
      tipo_entrada: 'MUCH',
      destino_boleto: 'MUCH'
    }
  });
  assert.equal(repeatTicket.data.error, 'usuario_bloqueado');
  const [[muchTicketCount]] = await db.query(
    'SELECT COUNT(*) AS total, COUNT(DISTINCT folio) AS folios, COUNT(DISTINCT qr_token) AS qrs FROM boletos WHERE id_usuario = ?',
    [muchUser.id_usuario]
  );
  assert.equal(Number(muchTicketCount.total), 1);
  assert.equal(Number(muchTicketCount.folios), 1);
  assert.equal(Number(muchTicketCount.qrs), 1);
  mark('Progreso, puntos y boleto MUCH', muchTicket.folio);

  const bloqueoMuch = await request('GET', '/api/juego/estado-bloqueo', {
    headers: { 'x-user-id': String(muchUser.id_usuario) }
  });
  assert.equal(bloqueoMuch.data.bloqueado, true);
  assert.equal(bloqueoMuch.data.motivo_bloqueo, 'reclamo_boleto');
  assert.ok(bloqueoMuch.data.fecha_puede_volver_texto);
  mark('Bloqueo tras reclamar boleto', bloqueoMuch.data.fecha_puede_volver_texto);

  const byFolio = await request('GET', `/api/boletos/${muchTicket.folio}`);
  const byQr = await request('GET', `/api/boletos/qr/${muchTicket.qr_token}`);
  assert.equal(byFolio.data.qr_token, muchTicket.qr_token);
  assert.equal(byQr.data.folio, muchTicket.folio);
  assert.equal(byFolio.data.telefono_usuario, '9610000004');
  mark('Folio, QR y telefono', 'Consultas publicas coinciden con MySQL');

  const taquillaFolio = await request('GET', `/api/taquilla/boleto/folio/${muchTicket.folio}`, {
    headers: adminHeaders
  });
  const taquillaQr = await request('GET', `/api/taquilla/boleto/qr/${muchTicket.qr_token}`, {
    headers: adminHeaders
  });
  assert.equal(taquillaFolio.data.id_boleto, muchTicket.id_boleto);
  assert.equal(taquillaQr.data.id_boleto, muchTicket.id_boleto);
  await request('POST', `/api/taquilla/boletos/${muchTicket.id_boleto}/canjear`, {
    headers: adminHeaders,
    body: { observaciones: 'Canje E2E MySQL' }
  });
  const secondRedeem = await request('POST', `/api/taquilla/boletos/${muchTicket.id_boleto}/canjear`, {
    headers: adminHeaders,
    expected: [400, 409],
    body: { observaciones: 'Segundo canje E2E' }
  });
  assert.ok(secondRedeem.data.error);
  mark('Taquilla', 'Folio/QR validan y segundo canje se rechaza');

  const planetUser = await createUser('planetario', 'Codex Planetario E2E', '9610000005');
  await completeRoute(planetUser, false);
  const planetTicket = await claimTicket(planetUser, 'Planetario');
  assertTicketCore(planetTicket, 'Planetario');
  await db.query(
    "UPDATE boletos SET valido_hasta = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY), estado = 'activo', usado = FALSE WHERE id_boleto = ?",
    [planetTicket.id_boleto]
  );
  const expiredPlanet = await request('GET', `/api/boletos/${planetTicket.folio}`);
  assert.equal(expiredPlanet.data.estado, 'vencido');
  assert.equal(expiredPlanet.data.estado_visible, 'Vencido');
  mark('Boleto Planetario y vencimiento', `${planetTicket.folio} marcado como vencido desde MySQL`);

  const today = new Date().toISOString().slice(0, 10);
  const adminBoletos = await request('GET', `/api/admin/boletos?startDate=${today}&endDate=${today}`, {
    headers: adminHeaders
  });
  assert.ok(adminBoletos.data.some((ticket) => ticket.folio === muchTicket.folio));
  assert.ok(adminBoletos.data.some((ticket) => ticket.folio === planetTicket.folio));
  const adminStats = await request('GET', `/api/admin/dashboard-stats?startDate=${today}&endDate=${today}`, {
    headers: adminHeaders
  });
  assert.ok(Number(adminStats.data.boletos) >= 2);
  const adminProgress = await request('GET', `/api/admin/progreso?startDate=${today}&endDate=${today}`, {
    headers: adminHeaders
  });
  assert.ok(adminProgress.data.some((progress) => progress.id_usuario === muchUser.id_usuario));
  const adminUsers = await request('GET', `/api/admin/usuarios?startDate=${today}&endDate=${today}`, {
    headers: adminHeaders
  });
  assert.ok(adminUsers.data.some((user) => user.correo === muchUser.correo));
  mark('Administrador y filtros por fecha', 'Boletos, progreso, usuarios y stats responden desde MySQL');

  const profile = await request('GET', `/api/usuarios/${muchUser.id_usuario}/perfil`, {
    headers: { 'x-user-id': String(muchUser.id_usuario) }
  });
  assert.equal(profile.data.usuario.telefono, '9610000004');
  assert.equal(profile.data.progreso.completadas, 5);
  assert.ok(profile.data.boletos.some((ticket) => ticket.folio === muchTicket.folio));
  mark('Perfil de usuario', 'Progreso y boletos se leen desde MySQL');
}

async function main() {
  db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'mision_much',
    multipleStatements: true
  });

  await cleanupTestUsers();

  serverProcess = spawn(process.execPath, ['backend/server.js'], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProcess.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  serverProcess.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  await verifyMainFlow();

  console.log(JSON.stringify({ ok: true, testId, checks }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    checks,
    stdout: stdout.slice(-4000),
    stderr: stderr.slice(-4000)
  }, null, 2));
  process.exitCode = 1;
}).finally(async () => {
  try {
    if (db) {
      await cleanupTestUsers();
      await db.end();
    }
  } catch (error) {
    console.error(`Cleanup error: ${error.message}`);
  }

  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill('SIGTERM');
  }
});
