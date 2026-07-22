const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const mysql = require('mysql2/promise');
const { chromium } = require('playwright');
require('dotenv').config();

const rootDir = require('node:path').join(__dirname, '..');
const port = 3000;
const baseUrl = `http://127.0.0.1:${port}`;
const testId = `codex-ui-${Date.now()}`;
const emails = {
  admin: `${testId}-admin@example.com`,
  player: `${testId}-player@example.com`,
  ticket: `${testId}-ticket@example.com`
};

const viewports = [
  { name: 'celular', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'ipad', width: 1024, height: 1366 },
  { name: 'desktop', width: 1440, height: 900 }
];

const routeChecks = [
  { name: 'Inicio', path: '/', session: 'player' },
  { name: 'Administrador', path: '/ADMINISTRADOR.html', session: 'admin', adminActions: true },
  { name: 'Registro boleto', path: '/Boleto_Digital/registro.html', session: 'none' },
  { name: 'Boleto digital', path: '/Boleto_Digital/boleto.html', session: 'ticket', ticketActions: true },
  { name: 'Validacion QR', path: null, session: 'admin', validateActions: true },
  { name: 'Entrada MUCH', path: '/entrada-much/index.html', session: 'player' },
  { name: 'Entrada portada', path: '/entrada-much/portada.html', session: 'player' },
  { name: 'Spinosaurio', path: '/Juego_Spinosaurio/index.html', session: 'player' },
  { name: 'Spinosaurio portada', path: '/Juego_Spinosaurio/portada.html', session: 'player' },
  { name: 'Biodiversidad', path: '/SALA-Biodiversidad-y-Conocimiento/index.html', session: 'player' },
  { name: 'Energia', path: '/sala_energia/index.html', session: 'player' },
  { name: 'Desarrollo sustentable', path: '/Sala_Desarrollo_Sustentable/index.html', session: 'player' },
  { name: 'SBEEL Dinosaurios', path: '/Sbeel_Dinosaurios/index.html', session: 'player' }
];

let db = null;
let serverProcess = null;
let stdout = '';
let stderr = '';
let browser = null;
const checks = [];

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
    assert.ok(expectedList.includes(response.status), `${method} ${pathName} ${response.status}: ${text}`);
  } else if (!response.ok) {
    assert.fail(`${method} ${pathName} ${response.status}: ${text}`);
  }
  return data;
}

async function cleanupTestUsers() {
  const [rows] = await db.query(
    "SELECT id_usuario FROM usuarios WHERE correo LIKE 'codex-ui-%@example.com'"
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
  throw new Error(`El backend no respondio en ${baseUrl}.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
}

async function createUser(kind, name, telefono) {
  const user = await request('POST', '/api/auth/google', {
    body: {
      userData: {
        name,
        email: emails[kind],
        google_id: `${testId}-${kind}`,
        picture: 'avatars/dino1.png',
        telefono
      }
    }
  });
  await request('POST', `/api/usuarios/${user.id_usuario}/privacy-consent`, {
    body: { acepto_privacidad: true }
  });
  return user;
}

async function grantRoles(userId, roleNames) {
  const [roles] = await db.query('SELECT id_rol, nombre FROM roles WHERE nombre IN (?)', [roleNames]);
  assert.equal(roles.length, roleNames.length);
  for (const role of roles) {
    await db.query('INSERT IGNORE INTO usuarios_roles (id_usuario, id_rol) VALUES (?, ?)', [userId, role.id_rol]);
  }
}

async function completeRouteAndClaim(user) {
  const headers = { 'x-user-id': String(user.id_usuario) };
  const stations = [
    { id: 1, score: 10 },
    { id: 2, score: 15 },
    { id: 3, score: 10 },
    { id: 4, score: 10 },
    { id: 5, score: 10 },
    { id: 6, score: 10 }
  ];
  for (const station of stations) {
    await request('POST', '/api/progreso/inicializar', {
      headers,
      body: { id_usuario: user.id_usuario, id_estacion: station.id }
    });
    await request('POST', '/api/progreso/completar', {
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

  return request('POST', '/api/boletos', {
    headers,
    expected: [200, 201],
    body: {
      id_usuario: user.id_usuario,
      reclamar: true,
      tipo_entrada: 'MUCH',
      destino_boleto: 'MUCH',
      lugar: 'Museo Chiapas de Ciencia y Tecnologia'
    }
  });
}

function sessionPayload(user, roles = ['usuario']) {
  return {
    id: user.id_usuario,
    id_usuario: user.id_usuario,
    name: user.nombre,
    nombre: user.nombre,
    email: user.correo,
    correo: user.correo,
    picture: user.avatar_url || 'avatars/dino1.png',
    avatar_url: user.avatar_url || 'avatars/dino1.png',
    roles,
    acepto_privacidad: true,
    privacidad_aceptada_en: new Date().toISOString()
  };
}

async function createContext(session, data) {
  const context = await browser.newContext({
    viewport: data.viewport,
    acceptDownloads: true
  });
  await context.addInitScript(({ sessionName, player, admin, ticketUser, ticket }) => {
    localStorage.setItem('much_session_id', `ui-smoke-${Date.now()}`);
    sessionStorage.setItem('much_internal_navigation', 'true');
    if (sessionName === 'admin') {
      localStorage.setItem('much_google_user', JSON.stringify(admin));
    } else if (sessionName === 'ticket') {
      localStorage.setItem('much_google_user', JSON.stringify(ticketUser));
      localStorage.setItem('much_user_ticket', JSON.stringify({
        id_boleto: ticket.id_boleto,
        folio: ticket.folio,
        qr_token: ticket.qr_token,
        qr_data: ticket.qr_data,
        tipo_entrada: ticket.tipo_entrada,
        destino_boleto: ticket.destino_boleto,
        valido_hasta: ticket.valido_hasta,
        estado: ticket.estado
      }));
    } else if (sessionName === 'player') {
      localStorage.setItem('much_google_user', JSON.stringify(player));
    }
  }, {
    sessionName: session,
    player: data.playerSession,
    admin: data.adminSession,
    ticketUser: data.ticketSession,
    ticket: data.ticket
  });
  return context;
}

async function auditPage(route, viewport, data) {
  const context = await createContext(route.session, { ...data, viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const dialogs = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    if (['document', 'script', 'xhr', 'fetch'].includes(request.resourceType())) {
      failedRequests.push(`${request.resourceType()} ${request.url()} ${request.failure()?.errorText || ''}`);
    }
  });
  page.on('dialog', async (dialog) => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss();
  });

  const pathName = route.path || `/Boleto_Digital/validar.html?token=${encodeURIComponent(data.ticket.qr_token)}`;
  await page.goto(`${baseUrl}${pathName}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {});
  await page.waitForTimeout(700);

  if (route.adminActions) {
    const refresh = page.locator('#btnRefreshTop');
    if (await refresh.count()) await refresh.click({ timeout: 3000 }).catch(() => {});
    const filter = page.locator('.filter-chip[data-filter="vigente"]').first();
    if (await filter.count()) await filter.click({ timeout: 3000 }).catch(() => {});
  }

  if (route.ticketActions) {
    await page.locator('#tAlfanumerico').waitFor({ timeout: 10000 });
    const folioText = await page.locator('#tAlfanumerico').innerText();
    assert.ok(folioText.includes(data.ticket.folio), 'La pantalla de boleto no muestra el codigo de MySQL');
    await page.locator('#qrcode canvas, #qrcode img').first().waitFor({ state: 'attached', timeout: 10000 });
    const qrSize = await page.locator('#qrcode canvas, #qrcode img').first().evaluate((node) => ({
      width: Number(node.getAttribute('width') || node.naturalWidth || node.clientWidth || 0),
      height: Number(node.getAttribute('height') || node.naturalHeight || node.clientHeight || 0)
    }));
    assert.ok(qrSize.width >= 100 && qrSize.height >= 100, 'El QR no tiene dimensiones validas');

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
    await page.locator('#btnDownloadImage').click();
    const download = await downloadPromise;
    assert.ok(download.suggestedFilename().endsWith('.png'), 'La descarga del boleto no genero PNG');
  }

  if (route.validateActions) {
    await page.locator('#statusBox').waitFor({ timeout: 10000 });
    const statusText = await page.locator('#statusBox').innerText();
    assert.ok(/DISPONIBLE|VALIDADO|USADO/i.test(statusText), `Estado de QR inesperado: ${statusText}`);
    const canjear = page.locator('#btnCanjear');
    if (await canjear.isVisible()) {
      await canjear.click();
      let validated = false;
      for (let i = 0; i < 20; i += 1) {
        await page.waitForTimeout(400);
        const currentStatus = await page.locator('#statusBox').innerText();
        if (/VALIDADO/i.test(currentStatus)) {
          validated = true;
          break;
        }
      }
      assert.ok(validated, 'El boton de validacion QR no marco el boleto como validado');
    }
  }

  const audit = await page.evaluate(() => {
    const doc = document.documentElement;
    const visibleControls = Array.from(document.querySelectorAll('button, a, input, select, textarea'))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        const label = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
        return {
          visible,
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          label,
          width: rect.width,
          height: rect.height,
          overflow: el.scrollWidth > Math.ceil(el.clientWidth) + 8
        };
      })
      .filter((item) => item.visible);

    return {
      textLength: (document.body?.innerText || '').trim().length,
      horizontalOverflow: Math.max(0, doc.scrollWidth - doc.clientWidth),
      blankControls: visibleControls.filter((item) => !item.label && item.tag !== 'input').slice(0, 5),
      overflowingControls: visibleControls.filter((item) => item.overflow).slice(0, 5),
      buttonCount: visibleControls.filter((item) => item.tag === 'button' || item.tag === 'a').length
    };
  });

  assert.ok(audit.textLength > 0, `${route.name} quedo sin contenido visible`);
  assert.ok(audit.horizontalOverflow <= 4, `${route.name} tiene overflow horizontal ${audit.horizontalOverflow}px en ${viewport.name}`);
  assert.equal(audit.blankControls.length, 0, `${route.name} tiene controles visibles sin etiqueta: ${JSON.stringify(audit.blankControls)}`);
  assert.equal(audit.overflowingControls.length, 0, `${route.name} tiene controles con texto desbordado: ${JSON.stringify(audit.overflowingControls)}`);
  assert.equal(pageErrors.length, 0, `${route.name} page errors: ${pageErrors.join(' | ')}`);
  assert.equal(consoleErrors.length, 0, `${route.name} console errors: ${consoleErrors.join(' | ')}`);
  assert.equal(failedRequests.length, 0, `${route.name} failed requests: ${failedRequests.join(' | ')}`);

  await context.close();
  return {
    route: route.name,
    viewport: viewport.name,
    buttons: audit.buttonCount,
    dialogs: dialogs.length
  };
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

  await waitForHealth();

  const adminUser = await createUser('admin', 'Codex UI Admin', '9611000001');
  await grantRoles(adminUser.id_usuario, ['admin', 'taquilla']);
  const playerUser = await createUser('player', 'Codex UI Player', '9611000002');
  const ticketUser = await createUser('ticket', 'Codex UI Ticket', '9611000003');
  const ticket = await completeRouteAndClaim(ticketUser);

  const data = {
    adminSession: sessionPayload(adminUser, ['admin', 'taquilla']),
    playerSession: sessionPayload(playerUser, ['usuario']),
    ticketSession: sessionPayload(ticketUser, ['usuario']),
    ticket
  };

  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of viewports) {
    for (const route of routeChecks) {
      results.push(await auditPage(route, viewport, data));
    }
  }

  mark('Pantallas responsive', `${results.length} cargas verificadas sin errores de consola`);
  mark('Boton Descargar boleto', 'Genero un archivo PNG desde la pantalla del boleto');
  mark('Validacion QR UI', 'Canje con sesion real de admin/taquilla');
  console.log(JSON.stringify({ ok: true, testId, checks, results }, null, 2));
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
    if (browser) await browser.close();
  } catch (_) {}
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
