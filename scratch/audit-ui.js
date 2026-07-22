const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1366, height: 768 }
];

const pagesToSmoke = [
  { name: 'home', url: '/index.html' },
  { name: 'entrada', url: '/entrada-much/index.html?from=portada&sala=entrada' },
  { name: 'spinosaurio', url: '/Juego_Spinosaurio/index.html' },
  { name: 'biodiversidad', url: '/SALA-Biodiversidad-y-Conocimiento/index.html?from=portada&sala=biodiversidad' },
  { name: 'energia', url: '/sala_energia/index.html?from=portada&sala=energia' },
  { name: 'desarrollo', url: '/Sala_Desarrollo_Sustentable/index.html?from=portada&sala=desarrollo-sustentable' },
  { name: 'sbeel', url: '/Sbeel_Dinosaurios/index.html' },
  { name: 'registro-boleto', url: '/Boleto_Digital/registro.html?sala=mision-much&premio=entrada-gratis&destino=much' },
  { name: 'boleto', url: '/Boleto_Digital/boleto.html' },
  { name: 'admin', url: '/ADMINISTRADOR.html' },
  { name: 'taquilla', url: '/ADMINISTRADOR.html?section=taquilla' }
];

function chromeExecutable() {
  return CHROME_PATHS.find((candidate) => fs.existsSync(candidate));
}

function absoluteUrl(url) {
  return new URL(url, BASE_URL).toString();
}

async function createAuditUser({ name, email, googleId }) {
  const res = await fetch(absoluteUrl('/api/auth/google'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userData: {
        name,
        email,
        google_id: googleId,
        picture: 'avatars/dino1.png'
      }
    })
  });
  if (!res.ok) {
    throw new Error(`No se pudo crear usuario de auditoria: ${res.status}`);
  }
  return await res.json();
}

async function createAuditTicket() {
  const suffix = Date.now();
  const ticketUser = await createAuditUser({
    name: 'Beneficiario Auditoria',
    email: `boleto.auditoria.${suffix}@example.com`,
    googleId: `audit_ticket_${suffix}`
  });

  for (const stationId of [1, 2, 3, 4, 5, 6]) {
    const res = await fetch(absoluteUrl('/api/progreso/completar'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(ticketUser.id_usuario)
      },
      body: JSON.stringify({
        id_usuario: ticketUser.id_usuario,
        id_estacion: stationId,
        puntaje: 10,
        aciertos: 5,
        errores: 0,
        aprobada: true
      })
    });
    if (!res.ok) {
      throw new Error(`No se pudo completar estacion ${stationId} para boleto de auditoria: ${res.status}`);
    }
  }

  const res = await fetch(absoluteUrl('/api/boletos'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': String(ticketUser.id_usuario)
    },
    body: JSON.stringify({
      id_usuario: ticketUser.id_usuario,
      reclamar: true,
      tipo_entrada: 'MUCH',
      destino_boleto: 'MUCH',
      lugar: 'Museo Chiapas de Ciencia y Tecnología'
    })
  });
  if (!res.ok) {
    throw new Error(`No se pudo generar boleto de auditoria: ${res.status}`);
  }

  return {
    user: ticketUser,
    boleto: await res.json()
  };
}

function seedScript() {
  return (auditData) => {
    const user = {
      id: auditData.user.id_usuario,
      id_usuario: auditData.user.id_usuario,
      name: auditData.user.nombre || 'Usuario Auditoria',
      email: auditData.user.correo || 'auditoria@example.com',
      roles: auditData.user.roles || ['usuario']
    };
    const admin = {
      id: auditData.admin.id_usuario,
      id_usuario: auditData.admin.id_usuario,
      name: auditData.admin.nombre || 'Admin Auditoria',
      email: auditData.admin.correo || 'muchtuxtla@gmail.com',
      roles: auditData.admin.roles || ['admin', 'taquilla']
    };
    const avatar = { id: 'dino1', name: 'Dino' };
    const ticket = auditData.ticket;
    const currentPath = location.pathname.toLowerCase();
    const isAdmin = currentPath.endsWith('/administrador.html');
    const activeUser = isAdmin ? admin : user;
    sessionStorage.setItem('much_internal_navigation', 'true');
    sessionStorage.setItem('much_last_location_verification', JSON.stringify({
      dentro_del_museo: true,
      timestamp: Date.now(),
      mensaje_resultado: 'Auditoria local'
    }));
    localStorage.setItem('much_google_user', JSON.stringify(activeUser));
    localStorage.setItem('much_selected_avatar', JSON.stringify(avatar));
    localStorage.setItem('much_avatar_seleccionado', JSON.stringify(avatar));
    localStorage.setItem('much_current_station', '1');
    localStorage.setItem('much_datos_boleto', JSON.stringify(ticket));
    localStorage.setItem('much_user_ticket', JSON.stringify(ticket));
    localStorage.setItem('much_quiz_prize', JSON.stringify({
      key: 'mision_much_boleto_much',
      title: 'MISION MUCH - Boleto MUCH',
      acceso: 'MUCH',
      tipo_entrada: 'MUCH',
      destino_boleto: 'MUCH',
      lugar: 'Museo Chiapas de Ciencia y Tecnología'
    }));
  };
}

function attachCollectors(page, bucket) {
  page.on('console', (msg) => {
    if (!['error', 'warning'].includes(msg.type())) return;
    const text = msg.text();
    if (/favicon|DevTools|Autoplay|Permissions-Policy/i.test(text)) return;
    bucket.console.push({ type: msg.type(), text });
  });
  page.on('pageerror', (error) => {
    bucket.pageErrors.push(error.message);
  });
  page.on('requestfailed', (request) => {
    bucket.requestFailed.push({
      url: request.url(),
      failure: request.failure() ? request.failure().errorText : 'unknown'
    });
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      bucket.badResponses.push({ status, url: response.url() });
    }
  });
}

async function collectLayout(page) {
  return await page.evaluate(() => {
    const isVisible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1;
    };
    const selector = 'button,a,input,select,textarea,[role="button"],[role="radio"]';
    const offscreen = [];
    document.querySelectorAll(selector).forEach((el) => {
      if (!isVisible(el)) return;
      const rect = el.getBoundingClientRect();
      const label = (el.innerText || el.getAttribute('aria-label') || el.id || el.className || el.tagName).toString().trim().slice(0, 80);
      if (rect.left < -3 || rect.right > innerWidth + 3 || rect.top < -3 || rect.bottom > innerHeight + 3) {
        offscreen.push({
          label,
          tag: el.tagName.toLowerCase(),
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom)
        });
      }
    });

    const textOverflow = [];
    document.querySelectorAll('button,a,label,h1,h2,h3,p,span,strong').forEach((el) => {
      if (!isVisible(el)) return;
      const style = getComputedStyle(el);
      if (style.whiteSpace === 'normal') return;
      if (el.scrollWidth > el.clientWidth + 3) {
        textOverflow.push({
          text: (el.textContent || '').trim().slice(0, 80),
          tag: el.tagName.toLowerCase(),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth
        });
      }
    });

    return {
      title: document.title,
      url: location.href,
      bodyClass: document.body.className,
      offscreen: offscreen.slice(0, 20),
      textOverflow: textOverflow.slice(0, 20),
      buttons: Array.from(document.querySelectorAll(selector))
        .filter(isVisible)
        .map((el) => (el.innerText || el.getAttribute('aria-label') || el.id || el.tagName).toString().trim().slice(0, 60))
        .slice(0, 30)
    };
  });
}

async function smokePage(browser, viewport, pageDef, auditData) {
  const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
  await context.addInitScript(seedScript(), auditData);
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(10000);
  const bucket = { console: [], pageErrors: [], requestFailed: [], badResponses: [] };
  attachCollectors(page, bucket);
  await page.goto(absoluteUrl(pageDef.url), { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(1000);
  const layout = await collectLayout(page);
  await context.close();
  return { page: pageDef.name, viewport: viewport.name, ...bucket, layout };
}

async function testMainFlow(browser, auditData) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, ignoreHTTPSErrors: true });
  await context.addInitScript(seedScript(), auditData);
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(10000);
  const bucket = { console: [], pageErrors: [], requestFailed: [], badResponses: [] };
  attachCollectors(page, bucket);
  await page.goto(absoluteUrl('/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  await page.locator('.btn-play').first().click({ timeout: 10000 });
  await page.waitForTimeout(800);
  const prepState = await page.evaluate(() => ({
    activePrep: document.querySelector('#viewPrep')?.classList.contains('active') || false,
    markerCount: document.querySelectorAll('.map-marker').length,
    hasStartButton: Boolean(document.querySelector('#btnComenzar')),
    completedChecksInitiallyVisible: Array.from(document.querySelectorAll('.map-marker:not(.completed) .map-marker-check')).some((el) => {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
    }),
    rewardVisibleWithoutCompletion: !document.querySelector('#rewardClaimBox')?.classList.contains('is-hidden')
  }));

  const stationResults = [];
  const expected = {
    '1': '/entrada-much/index.html',
    '2': '/Juego_Spinosaurio/index.html',
    '3': '/SALA-Biodiversidad-y-Conocimiento/index.html',
    '4': '/sala_energia/index.html',
    '5': '/Sala_Desarrollo_Sustentable/index.html',
    '6': '/Sbeel_Dinosaurios/index.html'
  };

  for (const stationId of Object.keys(expected)) {
    await page.goto(absoluteUrl('/index.html'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    await page.locator('.btn-play').first().click();
    await page.waitForTimeout(800);
    await page.locator(`.map-marker[data-station="${stationId}"]`).click();
    await page.waitForTimeout(200);
    await page.locator('#btnComenzar').click();
    await page.waitForTimeout(400);
    const rulesTitle = await page.locator('#rulesOverlay .modal-title').innerText().catch(() => '');
    await page.locator('#btnCerrarReglas').click();
    await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(350);
    stationResults.push({
      stationId,
      rulesTitle,
      url: page.url(),
      expectedPath: expected[stationId],
      ok: page.url().includes(expected[stationId])
    });
  }

  await context.close();
  return { name: 'main-flow', ...bucket, prepState, stationResults };
}

async function testSbeel(browser, auditData) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  await context.addInitScript(seedScript(), auditData);
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(10000);
  const bucket = { console: [], pageErrors: [], requestFailed: [], badResponses: [] };
  attachCollectors(page, bucket);
  await page.goto(absoluteUrl('/Sbeel_Dinosaurios/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => ({
    pieces: document.querySelectorAll('.puzzle-piece').length,
    solved: Array.from(document.querySelectorAll('.puzzle-piece')).every((el, index) => Number(el.dataset.id) === index),
    fixed: document.querySelectorAll('.puzzle-piece.is-fixed').length
  }));
  const firstBefore = await page.locator('.puzzle-piece').first().getAttribute('data-id').catch(() => '');
  await page.locator('#reset-btn').click();
  await page.waitForTimeout(600);
  const afterReset = await page.evaluate(() => ({
    pieces: document.querySelectorAll('.puzzle-piece').length,
    solved: Array.from(document.querySelectorAll('.puzzle-piece')).every((el, index) => Number(el.dataset.id) === index),
    fixed: document.querySelectorAll('.puzzle-piece.is-fixed').length
  }));
  const firstAfter = await page.locator('.puzzle-piece').first().getAttribute('data-id').catch(() => '');
  await context.close();
  return { name: 'sbeel-puzzle', ...bucket, before, afterReset, firstChanged: firstBefore !== firstAfter };
}

async function testSpino(browser, auditData) {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, ignoreHTTPSErrors: true });
  await context.addInitScript(seedScript(), auditData);
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(10000);
  const bucket = { console: [], pageErrors: [], requestFailed: [], badResponses: [] };
  attachCollectors(page, bucket);
  await page.goto(absoluteUrl('/Juego_Spinosaurio/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const portadaVisible = await page.locator('#portadaOverlay.show').count();
  await page.locator('#btnJugarPortada').click();
  await page.waitForTimeout(1600);
  const started = await page.evaluate(() => ({
    portadaVisible: document.querySelector('#portadaOverlay')?.classList.contains('show') || false,
    score: document.querySelector('.score')?.textContent || '',
    retryVisible: getComputedStyle(document.querySelector('#retryWrap')).display !== 'none'
  }));
  await page.evaluate(() => {
    if (typeof GameOver === 'function') return GameOver();
    return null;
  }).catch(() => {});
  await page.waitForTimeout(500);
  const gameOverVisible = await page.evaluate(() => getComputedStyle(document.querySelector('.game-over')).display);
  const urlBeforeRetry = page.url();
  await page.locator('#btnRetry').click();
  await page.waitForTimeout(800);
  const urlAfterRetry = page.url();
  const afterRetry = await page.evaluate(() => ({
    gameOver: getComputedStyle(document.querySelector('.game-over')).display,
    score: document.querySelector('.score')?.textContent || ''
  }));
  await context.close();
  return { name: 'spino-game', ...bucket, portadaVisible: portadaVisible > 0, started, gameOverVisible, retrySameUrl: urlBeforeRetry === urlAfterRetry, afterRetry };
}

function auditQuestionFiles() {
  const files = [
    'entrada-much/preguntas.json',
    'sala_energia/preguntas.json',
    'Sala_Desarrollo_Sustentable/preguntas.json',
    'SALA-Biodiversidad-y-Conocimiento/preguntas.json',
    'Juego_Spinosaurio/quiz.json'
  ];
  return files.map((relative) => {
    const full = path.join(ROOT, relative);
    const raw = fs.readFileSync(full, 'utf8');
    const parsed = JSON.parse(raw);
    const questions = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.questions) ? parsed.questions : []);
    const indexes = questions.map((question) => {
      const idx = question.correctIndex ?? question.answerIndex;
      return Number(idx);
    });
    const invalid = questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => {
        const options = question.options || [];
        const idx = Number(question.correctIndex ?? question.answerIndex);
        return !Array.isArray(options) || options.length < 2 || !Number.isInteger(idx) || idx < 0 || idx >= options.length;
      })
      .map(({ index }) => index);
    return {
      file: relative,
      count: questions.length,
      invalid,
      correctIndexHistogram: indexes.reduce((acc, idx) => {
        acc[idx] = (acc[idx] || 0) + 1;
        return acc;
      }, {})
    };
  });
}

(async () => {
  const executablePath = chromeExecutable();
  const auditData = {
    user: await createAuditUser({
      name: 'Usuario Auditoria',
      email: 'auditoria@example.com',
      googleId: 'audit_usuario'
    }),
    admin: await createAuditUser({
      name: 'Admin Auditoria',
      email: 'muchtuxtla@gmail.com',
      googleId: 'audit_admin_much'
    }),
    ticketInfo: await createAuditTicket()
  };
  auditData.ticket = {
    ...auditData.ticketInfo.boleto,
    nombre: auditData.ticketInfo.user.nombre,
    email: auditData.ticketInfo.user.correo,
    telefono: '9611234567',
    codigo_alfanumerico: auditData.ticketInfo.boleto.folio
  };

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--disable-web-security', '--use-fake-ui-for-media-stream']
  });

  const results = {
    baseUrl: BASE_URL,
    chromeExecutable: executablePath || 'playwright-default',
    auditUserId: auditData.user.id_usuario,
    auditAdminId: auditData.admin.id_usuario,
    auditTicketFolio: auditData.ticket.folio,
    questionFiles: auditQuestionFiles(),
    mainFlow: null,
    sbeel: null,
    spino: null,
    smoke: []
  };

  console.log('running main-flow');
  results.mainFlow = await testMainFlow(browser, auditData);
  console.log('running sbeel');
  results.sbeel = await testSbeel(browser, auditData);
  console.log('running spino');
  results.spino = await testSpino(browser, auditData);

  for (const viewport of viewports) {
    for (const pageDef of pagesToSmoke) {
      console.log(`smoke ${viewport.name} ${pageDef.name}`);
      results.smoke.push(await smokePage(browser, viewport, pageDef, auditData));
    }
  }

  await browser.close();

  const outFile = path.join(ROOT, 'scratch', 'audit-ui-report.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({
    report: outFile,
    smokePages: results.smoke.length,
    mainFlowOk: results.mainFlow.stationResults.every((row) => row.ok),
    sbeelSolvedAtStart: results.sbeel.before.solved,
    spinoRetrySameUrl: results.spino.retrySameUrl
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
