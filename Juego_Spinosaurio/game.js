// Validar ubicación antes de permitir jugar
(function() {
  // DESACTIVADO TEMPORALMENTE para permitir pruebas y juego remoto
  return;

  const raw = sessionStorage.getItem('much_last_location_verification');
  let valid = false;
  let msg = 'Para jugar necesitas estar en el Museo Chiapas y verificar tu ubicación.';
  if (raw) {
    try {
      const verif = JSON.parse(raw);
      const transcurrido = Date.now() - verif.timestamp;
      const vigenciaMs = 15 * 60 * 1000; // 15 minutos
      if (transcurrido <= vigenciaMs && verif.dentro_del_museo) {
        valid = true;
      } else if (transcurrido > vigenciaMs) {
        msg = 'La verificación de ubicación ha expirado. Por favor, verifícala de nuevo.';
      } else {
        msg = verif.mensaje_resultado || 'No te encuentras en el Museo Chiapas de Ciencia y Tecnología.';
      }
    } catch (e) {}
  }
  if (!valid) {
    alert(msg);
    window.location.href = '../index.html?reason=location_required&msg=' + encodeURIComponent(msg);
    throw new Error('Acceso denegado: ubicación no válida.');
  }
})();

/* ===== Funciones de Tiempo y Utilidades ===== */
function getMexicoTime() {
  return new Date().toISOString(); // Let Supabase handle the timezone
}

/* ===== BLINDAJE POI: Captura de ubicación desde URL ===== */
(function () {
  const params = new URLSearchParams(window.location.search);
  const lugarURL = params.get('lugar');
  if (lugarURL && lugarURL.trim() !== "") {
    localStorage.setItem('much_lugar_seguro', lugarURL);
  } else if (!lugarURL && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')) {
    localStorage.removeItem('much_lugar_seguro');
  }
})();
const LUGAR_QR = localStorage.getItem('much_lugar_seguro') || 'Sin Especificar';

/* ====== LOOP BASE Y VARIABLES GLOBALES ====== */
var time = new Date(), deltaTime = 0;
var sueloY = 2;
var velY = 0, impulso = 980, gravedad = 2400;
var dinoPosX = 24, dinoPosY = sueloY;
var sueloX = 0, velEscenario = 1280 / 3, gameVel = 1, score = 0;
var parado = false, saltando = false;
var tiempoHastaObstaculo = 2, tiempoObstaculoMin = 0.7, tiempoObstaculoMax = 1.8, obstaculos = [];
var tiempoHastaNube = 0.5, tiempoNubeMin = 0.7, tiempoNubeMax = 2.7, nubes = [], velNube = 0.5;

var contenedor, dino, textoScore, suelo, gameOver;
var WIN_SCORE = 15;
var QUIZ_WARNING_SCORE = 12;
const STATION_ID = '2';
const COMPLETED_STATIONS_KEY = 'much_completed_stations';

var jumpSound;
var victoryAudioContext = null;
var quizData = null;
var quizAnswerIndex = null;
var quizVisible = false;
var quizWarningShown = false;
var navigatingToRegistro = false;
var spinosaurioPlayerId = null;
// Temporizador de pregunta especial
var QUESTION_SECONDS = 15;
var questionSecondsLeft = 0;
var questionTimerInterval = null;

function getSpinosaurioPlayerId() {
  if (spinosaurioPlayerId) return spinosaurioPlayerId;
  const existing = sessionStorage.getItem('much_spinosaurio_player_id') || localStorage.getItem('much_spinosaurio_player_id');
  if (existing) {
    spinosaurioPlayerId = existing;
    return spinosaurioPlayerId;
  }
  spinosaurioPlayerId = `spinosaurio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  sessionStorage.setItem('much_spinosaurio_player_id', spinosaurioPlayerId);
  localStorage.setItem('much_spinosaurio_player_id', spinosaurioPlayerId);
  return spinosaurioPlayerId;
}

function resolveSpinosaurioQuizData() {
  try {
    const pool = window.MuchSpinosaurioQuestionPool;
    if (pool && typeof pool.pickSpinosaurioQuestion === 'function') {
      const question = pool.pickSpinosaurioQuestion(sessionStorage, getSpinosaurioPlayerId());
      if (question) return question;
    }
  } catch (error) {
    console.warn('No se pudo cargar la pregunta del Espinosaurio:', error);
  }

  return {
    title: '¡Pregunta final del Espinosaurio!',
    subtitle: 'Responde con cuidado',
    question: '¿Qué tipo de dinosaurio era el Espinosaurio?',
    options: ['Herbívoro', 'Carnívoro', 'Dinosaurio volador', 'Dinosaurio marino pequeño'],
    answerIndex: 1
  };
}

function playCompletionSound() {
  try {
    const audio = new Audio('../Sonidos/Estacion completada.mp3');
    audio.play().catch(e => console.warn('No se pudo reproducir audio de completado:', e));
  } catch (e) {
    console.warn('Error al reproducir audio:', e);
  }
}

function playIncorrectSound() {
  try {
    const audio = new Audio('../Sonidos/respuesta incorrecta.mp3');
    audio.play().catch(e => console.warn('No se pudo reproducir audio de incorrecto:', e));
  } catch (e) {
    console.warn('Error al reproducir audio:', e);
  }
}

function markStationCompleted() {
  try {
    const completed = JSON.parse(localStorage.getItem(COMPLETED_STATIONS_KEY) || '{}');
    completed[STATION_ID] = true;
    localStorage.setItem(COMPLETED_STATIONS_KEY, JSON.stringify(completed));
  } catch (e) {
    console.warn('No se pudo marcar estación completa:', e);
  }
}

function isStationCompleted(stationId) {
  try {
    const completed = JSON.parse(localStorage.getItem(COMPLETED_STATIONS_KEY) || '{}');
    return Boolean(completed[String(stationId)]);
  } catch (e) {
    return false;
  }
}

// Background music control
function ensureBgMusic() {
  try {
    if (!window.bgMusic) {
      window.bgMusic = new Audio('../Sonidos/musica fondo.mp3');
      window.bgMusic.loop = true;
      window.bgMusic.volume = 0.18;
      window.bgMusic.preload = 'auto';
    }
  } catch (e) { console.warn('bgMusic error', e); }
}

function playBgMusic() {
  try { pauseBgMusic(); } catch (e) {}
}

function pauseBgMusic() {
  try { if (window.bgMusic && !window.bgMusic.paused) window.bgMusic.pause(); } catch (e) {}
}

function playVictoryMusic() {
  try {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!victoryAudioContext) victoryAudioContext = new AudioCtx();
    var ctx = victoryAudioContext;
    if (ctx.state === "suspended") ctx.resume();

    var now = ctx.currentTime + 0.02;
    var master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.22, now + 0.06);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
    master.connect(ctx.destination);

    var melody = [
      [523.25, 0.00, 0.16], [659.25, 0.18, 0.16], [783.99, 0.36, 0.22],
      [1046.50, 0.64, 0.30], [783.99, 1.02, 0.16], [1046.50, 1.20, 0.42],
      [1318.51, 1.72, 0.52]
    ];

    var chords = [
      [261.63, 0.00, 0.72], [329.63, 0.00, 0.72], [392.00, 0.00, 0.72],
      [349.23, 0.82, 0.72], [440.00, 0.82, 0.72], [523.25, 0.82, 0.72],
      [392.00, 1.62, 1.00], [493.88, 1.62, 1.00], [659.25, 1.62, 1.00]
    ];

    melody.concat(chords).forEach(function (note) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = note[0] < 500 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(note[0], now + note[1]);
      gain.gain.setValueAtTime(0.0001, now + note[1]);
      gain.gain.exponentialRampToValueAtTime(note[0] < 500 ? 0.08 : 0.18, now + note[1] + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note[1] + note[2]);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now + note[1]);
      osc.stop(now + note[1] + note[2] + 0.05);
    });
  } catch (e) {
    console.warn("No se pudo reproducir la musica de victoria:", e);
  }
}

function goToNextStationAfterVictory(delay) {
  return;
}

async function guardarSpinosaurioEnSupabase(puntajeFinal, aprobado) {
  try {
    const progreso = await import('../supabase-utils.js');
    await progreso.guardarPartidaMinijuego({
      puntaje: puntajeFinal,
      aprobado
    });

    await progreso.guardarIntentoEstacion(STATION_ID, {
      aciertos: aprobado ? 1 : 0,
      errores: aprobado ? 0 : 1,
      puntaje: puntajeFinal,
      aprobado
    });

    // Enviar los campos al primer nivel para que guardarProgresoUsuario los reciba bien
    await progreso.guardarProgresoUsuario(STATION_ID, {
      puntaje: puntajeFinal,
      aciertos: aprobado ? 1 : 0,
      errores: aprobado ? 0 : 1,
      aprobada: aprobado
    });
  } catch (error) {
    console.error('[Supabase DB] No se pudo guardar Spinosaurio:', error);
  }
}

// 🛑 Variables de la cuenta regresiva y estado del juego
var countdownActive = false;
var gameStarted = false;
var restartingGame = false;
var loopRequestId;
var orientationBlocked = false;

function isMobilePortrait() {
  return false;
}

function updateOrientationGate() {
  orientationBlocked = false;
  document.body.classList.remove("orientation-blocked");
  updateResponsiveScale();
  return orientationBlocked;
}

function canStartLandscapeGame() {
  updateOrientationGate();
  if (orientationBlocked) return false;
  try { window.lockLandscapeOrientation?.(); } catch (e) {}
  return true;
}

function updateResponsiveScale() {
  var w = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 320);
  var h = Math.max(280, window.innerHeight || document.documentElement.clientHeight || 280);
  var scale = Math.min(1, Math.max(0.5, Math.min(w / 920, h / 520)));
  document.documentElement.style.setProperty("--game-scale", scale.toFixed(3));
}

/* ===== INICIALIZACIÓN ===== */
if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(Init, 1);
} else {
  document.addEventListener("DOMContentLoaded", Init);
}

var LOCKOUT_UNTIL_KEY = 'much_lockout_until_2';
var CHEAT_COUNT_KEY = 'much_cheat_count_2';

function checkLockoutActive() {
  try {
    const lockoutUntil = localStorage.getItem(LOCKOUT_UNTIL_KEY);
    if (lockoutUntil && Date.now() < Number(lockoutUntil)) {
      return true;
    }
  } catch (e) {
    console.warn(e);
  }
  return false;
}

function showLockoutScreen() {
  const lockoutUntil = Number(localStorage.getItem(LOCKOUT_UNTIL_KEY));
  const overlay = document.createElement('div');
  overlay.id = 'lockoutOverlay';
  overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.98); z-index: 1000000; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 20px;';
  
  overlay.innerHTML = `
    <div style="font-size: clamp(3rem, 10vh, 5rem); margin-bottom: 20px; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.3));">⚠️</div>
    <h2 style="font-size: clamp(1.8rem, 5vh, 2.5rem); margin-bottom: 12px; color: #ef4444; font-weight: 900; letter-spacing: 0.5px;">Acceso Bloqueado Temporalmente</h2>
    <p style="font-size: clamp(1rem, 3vh, 1.25rem); max-width: 550px; margin-bottom: 24px; line-height: 1.6; color: #cbd5e1; font-weight: 500;">
      Se ha detectado un cambio de pantalla persistente (búsqueda de respuestas). El acceso a esta estación se ha bloqueado temporalmente por seguridad.
    </p>
    <div id="lockoutCountdown" style="font-size: clamp(2rem, 6vh, 3.5rem); font-weight: 900; color: #f59e0b; background: rgba(245, 158, 11, 0.1); border: 2px solid rgba(245, 158, 11, 0.3); padding: 8px 32px; border-radius: 999px; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(245, 158, 11, 0.15);">--s</div>
    <button id="btnLockoutExit" style="appearance: none; border: 2px solid rgba(255, 255, 255, 0.5); cursor: pointer; padding: 12px 24px; border-radius: 14px; font-weight: 800; font-size: 16px; color: white; background: rgba(255,255,255,0.1); transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">Volver al mapa</button>
  `;
  document.body.appendChild(overlay);

  // Bind exit button
  document.getElementById('btnLockoutExit').addEventListener('click', function() {
    const mapParams = new URLSearchParams(window.location.search);
    mapParams.set('view', 'prep');
    window.location.href = '../index.html?' + mapParams.toString();
  });

  const timerInterval = setInterval(() => {
    const timeLeft = Math.ceil((lockoutUntil - Date.now()) / 1000);
    const countdownEl = document.getElementById('lockoutCountdown');
    if (countdownEl) {
      countdownEl.textContent = timeLeft + 's';
    }
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      localStorage.removeItem(LOCKOUT_UNTIL_KEY);
      localStorage.setItem(CHEAT_COUNT_KEY, '0');
      overlay.remove();
      location.reload();
    }
  }, 1000);
}

async function inicializarProgresoSpinosaurio() {
  try {
    const progreso = await import('../supabase-utils.js');
    const active = await progreso.comprobarEstacionActiva(2);
    if (!active) {
      alert('Esta estación se encuentra inactiva o cerrada.');
      window.location.href = '../index.html';
      return;
    }
    await progreso.inicializarProgresoUsuario(2);
    console.log("Progreso de Spinosaurio inicializado en MySQL.");
  } catch (error) {
    console.error("Error al inicializar progreso de Spinosaurio:", error);
  }
}

function Init() {
  if (checkLockoutActive()) {
    showLockoutScreen();
    return;
  }

  updateOrientationGate();
  window.addEventListener("resize", updateOrientationGate, { passive: true });
  window.addEventListener("orientationchange", function () {
    setTimeout(updateOrientationGate, 120);
  }, { passive: true });

  Start();
  ConfigurarPortada(); // Arranca escuchando el botón de la portada integrada
  inicializarProgresoSpinosaurio();
}

function Loop() {
  deltaTime = (new Date() - time) / 1000;
  time = new Date();
  Update();
  loopRequestId = requestAnimationFrame(Loop);
}

/* ===== START (Asignación de eventos y elementos) ===== */
function Start() {
  gameOver = document.querySelector(".game-over");
  suelo = document.querySelector(".suelo");
  contenedor = document.querySelector(".contenedor");
  textoScore = document.querySelector(".score");
  dino = document.querySelector(".dino");
  jumpSound = document.getElementById("jumpSound");

  document.addEventListener("keydown", HandleKeyDown, { passive: false });
  contenedor.addEventListener("click", function (e) { e.preventDefault(); Saltar(); }, { passive: false });
  contenedor.addEventListener("touchstart", function (e) {
    e.preventDefault();
    if (!parado && gameStarted && !countdownActive) Saltar();
  }, { passive: false });
  window.addEventListener("pointerdown", GlobalTap, { passive: false });

  document.getElementById("btnRetry").addEventListener("click", restartGameInPlace);
  document.getElementById("btnQuizOk").addEventListener("click", validarQuiz);

  var btnExit = document.getElementById("btnExitToMap");
  if (btnExit) {
    var goBack = function (e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const mapParams = new URLSearchParams(window.location.search);
      mapParams.set('view', 'prep');
      window.location.href = '../index.html?' + mapParams.toString();
    };
    btnExit.addEventListener("click", goBack);
    btnExit.addEventListener("touchstart", goBack, { passive: false });
  }

  // Nuevo: botón 'Siguiente' que aparece después de responder
  try {
    const btnNext = document.getElementById("btnQuizNext");
    if (btnNext) {
      btnNext.addEventListener("click", function () {
        const mapParams = new URLSearchParams(window.location.search);
        mapParams.set('view', 'prep');
        try { window.lockPortraitOrientation?.(); } catch (e) {}
        window.location.href = '../index.html?' + mapParams.toString();
        return;
        // Navegar a la siguiente estación basada en localStorage (misma lógica que index.html)
        try {
          const searchParams = new URLSearchParams(window.location.search);
          // Valor esperado ya actualizado en validarQuiz() a '3' tras completar
          let target = localStorage.getItem('much_current_station') || '3';

          // Si por alguna razón target es la misma estación actual, avanzar 1
          if (target === STATION_ID) {
            target = String(Number(target) + 1);
          }

          let url = '../index.html?' + searchParams.toString();
          if (target === '3') url = '../SALA-Biodiversidad-y-Conocimiento/index.html?from=portada&sala=biodiversidad';
          else if (target === '4') url = '../sala_energia/index.html?from=portada&sala=energia';
          else if (target === '5') url = '../Sala_Desarrollo_Sustentable/index.html?from=portada&sala=desarrollo-sustentable';
          else if (target === '6') url = '../Sbeel_Dinosaurios/index.html';

          window.location.href = url;
        } catch (e) {
          // Fallback: volver al mapa
          const searchParams = new URLSearchParams(window.location.search);
          window.location.href = '../index.html?' + searchParams.toString();
        }
      });
    }
  } catch (e) { /* noop */ }

  document.getElementById("btnQuizCancel").addEventListener("click", function () {
    navigatingToRegistro = true;
    quizVisible = false;
    try { document.getElementById("quizOverlay").classList.remove("show"); } catch (e) { }
    document.body.classList.remove("quiz-mode");
    stopQuestionTimer();
    location.reload(); // Volvemos a mostrar la portada recargando
  });

  cargarQuizJSON();

  window.addEventListener("blur", antiCheatGuard, { passive: true });
  document.addEventListener("visibilitychange", function () { if (document.hidden) antiCheatGuard(); });
  window.addEventListener("pagehide", antiCheatGuard, { passive: true });

  document.addEventListener("keydown", blockShortcutsDuringQuiz, { capture: true });
  document.addEventListener("contextmenu", function (e) { if (quizVisible) e.preventDefault(); });
}

/* ===== LÓGICA DE PORTADA INTEGRADA Y CUENTA REGRESIVA ===== */
function ConfigurarPortada() {
  const btnJugar = document.getElementById("btnJugarPortada");
  const portada = document.getElementById("portadaOverlay");

  if (btnJugar) {
    btnJugar.addEventListener("click", async () => {
      try { await window.lockLandscapeOrientation?.(); } catch (e) {}
      if (!canStartLandscapeGame()) return;

      try {
        // 1. Pedimos Pantalla Completa
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
          await document.documentElement.webkitRequestFullscreen();
        }

        try { await window.lockLandscapeOrientation?.(); } catch (e) {}
        updateResponsiveScale();
      } catch (err) {
        console.warn("No se pudo activar pantalla completa:", err);
      }

      if (!canStartLandscapeGame()) return;

      // 3. Ocultar la portada
      if (portada) portada.classList.remove("show");

      // 4. Iniciar la cuenta de 5 segundos
      runCountdown();
    });
  }
}

async function runCountdown() {
  if (!canStartLandscapeGame()) return;
  if (gameStarted || countdownActive) return;
  countdownActive = true;

  let count = 3;
  const stage = document.querySelector(".stage");
  const overlay = document.createElement("div");

  overlay.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:140px;font-weight:900;color:#fff;text-shadow:0 8px 25px rgba(0,0,0,0.8);z-index:9999;background:rgba(0,0,0,0.5);font-family:sans-serif;margin:0;";
  stage.appendChild(overlay);

  overlay.innerText = count;

  if (jumpSound) { jumpSound.currentTime = 0; jumpSound.play().catch(() => { }); }

  const timer = setInterval(async () => {
    count--;
    if (count > 0) {
      overlay.innerText = count;
      if (jumpSound) { jumpSound.currentTime = 0; jumpSound.play().catch(() => { }); }
    } else if (count === 0) {
      overlay.innerText = "¡YA!";
      overlay.style.color = "#00c9b7";
    } else {
      clearInterval(timer);
      overlay.remove();
      countdownActive = false;
      gameStarted = true;
      try { pauseBgMusic(); } catch (e) {}
      time = new Date();

      // 📝 Await the initial registration to ensure ultimo_intento_id is saved before any score updates
      await registrarIntentoInicial();

      Loop(); // 🚀 ARRANCA EL JUEGO
    }
  }, 1000);
}

function removeGameElements(list) {
  for (var i = list.length - 1; i >= 0; i--) {
    if (list[i] && list[i].parentNode) list[i].parentNode.removeChild(list[i]);
  }
  list.length = 0;
}

function resetGameState() {
  stopQuestionTimer();

  parado = false;
  saltando = false;
  countdownActive = false;
  quizVisible = false;
  navigatingToRegistro = false;
  gameStarted = true;

  dinoPosX = 24;
  dinoPosY = sueloY;
  velY = 0;
  sueloX = 0;
  gameVel = 1;
  score = 0;
  tiempoHastaObstaculo = 2;
  tiempoHastaNube = 0.5;
  quizWarningShown = false;

  removeGameElements(obstaculos);
  removeGameElements(nubes);

  if (textoScore) textoScore.innerText = "0";
  if (suelo) suelo.style.left = "0px";
  if (dino) {
    dino.style.bottom = sueloY + "px";
    dino.classList.remove("dino-estrellado");
    dino.classList.add("dino-corriendo");
  }
  if (contenedor) contenedor.classList.remove("mediodia", "tarde", "noche");
  if (gameOver) gameOver.style.display = "none";

  var wrap = document.getElementById("retryWrap");
  if (wrap) wrap.classList.remove("show");

  var quizOverlay = document.getElementById("quizOverlay");
  if (quizOverlay) quizOverlay.classList.remove("show");
  document.body.classList.remove("quiz-mode");

  var warning = document.getElementById("quizWarning");
  if (warning) warning.classList.remove("show");

  var portada = document.getElementById("portadaOverlay");
  if (portada) portada.classList.remove("show");

  time = new Date();
}

async function restartGameInPlace(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  if (restartingGame) return;
  if (!canStartLandscapeGame()) return;

  restartingGame = true;
  try {
    resetGameState();
    parado = true;
    gameStarted = false;
    try { sessionStorage.removeItem("ultimo_intento_id"); } catch (err) {}
    try { pauseBgMusic(); } catch (err) {}
    await registrarIntentoInicial();
  } finally {
    parado = false;
    gameStarted = true;
    restartingGame = false;
    time = new Date();

    if (!loopRequestId) Loop();
  }
}

/* ===== QUIZ JSON ===== */
async function cargarQuizJSON() {
  try {
    quizData = resolveSpinosaurioQuizData();
  } catch (e) {
    quizData = null;
  }
}

function shuffleQuizOptionItems(items) {
  var mixed = items.slice();
  for (var i = mixed.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = mixed[i];
    mixed[i] = mixed[j];
    mixed[j] = tmp;
  }
  return mixed;
}

function prepareQuizOptions(data) {
  if (!data) return data;

  var options = Array.isArray(data.options) ? data.options : [];
  var answerIndex = Number(data.answerIndex);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
    answerIndex = 0;
  }
  if (options.length < 2) {
    return { ...data, options: options.slice(), answerIndex: answerIndex };
  }

  var mixed = shuffleQuizOptionItems(options.map(function (text, index) {
    return { text: text, isCorrect: index === answerIndex };
  }));
  var newAnswerIndex = mixed.findIndex(function (item) {
    return item.isCorrect;
  });

  return {
    ...data,
    options: mixed.map(function (item) { return item.text; }),
    answerIndex: newAnswerIndex >= 0 ? newAnswerIndex : 0
  };
}

/* ===== CONTROLES ===== */
function GlobalTap(e) {
  if (orientationBlocked) return;
  if (parado || quizVisible || countdownActive || !gameStarted) return;
  var target = e.target;
  if (target.closest("#retryWrap") || target.closest("#quizOverlay")) return;
  var tag = (target.tagName || "").toLowerCase();
  if (tag === "button" || tag === "a") return;
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  Saltar();
}

function HandleKeyDown(ev) {
  if (orientationBlocked) return;
  if (quizVisible || countdownActive || !gameStarted) return;
  if (ev.code === "Space" || ev.keyCode === 32 || ev.code === "ArrowUp" || ev.keyCode === 38) {
    ev.preventDefault(); Saltar();
  }
}

/* ===== UPDATE (Lógica de movimiento y colisiones) ===== */
function Update() {
  if (orientationBlocked) return;
  if (parado) return;
  MoverDinosaurio();
  MoverSuelo();
  DecidirCrearObstaculos();
  DecidirCrearNubes();
  MoverObstaculos();
  MoverNubes();
  DetectarColision();
  velY -= gravedad * deltaTime;
}

function Saltar() {
  if (dinoPosY === sueloY) {
    saltando = true; velY = impulso; dino.classList.remove("dino-corriendo");
    if (jumpSound) { jumpSound.currentTime = 0; jumpSound.play().catch(() => { }); }
  }
}

function MoverDinosaurio() {
  dinoPosY += velY * deltaTime;
  if (dinoPosY < sueloY) TocarSuelo();
  dino.style.bottom = dinoPosY + "px";
}
function TocarSuelo() {
  dinoPosY = sueloY; velY = 0;
  if (saltando) dino.classList.add("dino-corriendo");
  saltando = false;
}
function MoverSuelo() {
  sueloX += velEscenario * deltaTime * gameVel;
  suelo.style.left = -(sueloX % contenedor.clientWidth) + "px";
}
function Estrellarse() {
  dino.classList.remove("dino-corriendo");
  dino.classList.add("dino-estrellado");
  parado = true;
}
function DecidirCrearObstaculos() {
  tiempoHastaObstaculo -= deltaTime;
  if (tiempoHastaObstaculo <= 0) CrearObstaculo();
}
function DecidirCrearNubes() {
  tiempoHastaNube -= deltaTime;
  if (tiempoHastaNube <= 0) CrearNube();
}
function CrearObstaculo() {
  var stage = document.querySelector(".stage");
  var o = document.createElement("div"); stage.appendChild(o);
  o.classList.add("cactus");
  o.classList.add("cactus-suelo");

  if (Math.random() > 0.5) o.classList.add("cactus2");
  else o.classList.add("cactus1");

  o.posX = stage.clientWidth; o.style.left = o.posX + "px"; obstaculos.push(o);
  tiempoHastaObstaculo = tiempoObstaculoMin + (Math.random() * (tiempoObstaculoMax - tiempoObstaculoMin)) / gameVel;
}
function CrearNube() {
  var n = document.createElement("div"); contenedor.appendChild(n);
  n.classList.add("nube"); n.posX = contenedor.clientWidth; n.style.left = n.posX + "px";
  var minBottom = Math.max(70, contenedor.clientHeight * 0.28);
  var maxBottom = Math.max(minBottom + 20, contenedor.clientHeight * 0.78);
  n.style.bottom = minBottom + Math.random() * (maxBottom - minBottom) + "px"; nubes.push(n);
  tiempoHastaNube = tiempoNubeMin + Math.random() * (tiempoNubeMax - tiempoNubeMin) / gameVel;
}
function MoverObstaculos() {
  for (var i = obstaculos.length - 1; i >= 0; i--) {
    if (obstaculos[i].posX < -obstaculos[i].clientWidth) {
      obstaculos[i].parentNode.removeChild(obstaculos[i]);
      obstaculos.splice(i, 1); GanarPuntos();
    } else {
      obstaculos[i].posX -= velEscenario * deltaTime * gameVel;
      obstaculos[i].style.left =  obstaculos[i].posX + "px";
    }
  }
}
function MoverNubes() {
  for (var i = nubes.length - 1; i >= 0; i--) {
    if (nubes[i].posX < -nubes[i].clientWidth) {
      nubes[i].parentNode.removeChild(nubes[i]); nubes.splice(i, 1);
    } else {
      nubes[i].posX -= velEscenario * deltaTime * gameVel * velNube;
      nubes[i].style.left = nubes[i].posX + "px";
    }
  }
}

/* ===== SCORE / QUIZ ===== */
function GanarPuntos() {
  score++; textoScore.innerText = score;
  gameVel = 1;

  if (score == 5) { contenedor.classList.add("mediodia"); }
  else if (score == 10) { contenedor.classList.add("tarde"); }

  if (!quizWarningShown && score >= QUIZ_WARNING_SCORE && score < WIN_SCORE) {
    showQuizWarning();
  }

  if (score >= WIN_SCORE) {
    contenedor.classList.add("noche"); parado = true;
    dino.classList.remove("dino-corriendo"); mostrarQuiz(); return;
  }
  suelo.style.animationDuration = "3s";
}

function showQuizWarning() {
  quizWarningShown = true;
  var warning = document.getElementById("quizWarning");
  if (!warning) return;

  warning.classList.add("show");
  setTimeout(function () {
    warning.classList.remove("show");
  }, 3200);
}

async function GameOver() {
  if (parado) return;
  parado = true;

  dino.classList.remove("dino-corriendo");
  dino.classList.add("dino-estrellado");
  gameOver.style.display = "grid";

  var wrap = document.getElementById("retryWrap");
  if (wrap) wrap.classList.add("show");

  await registrarQuizEnSupabase(Number(score));

  try {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) { }
}
function DetectarColision() {
  for (var i = 0; i < obstaculos.length; i++) {
    if (obstaculos[i].posX > dinoPosX + dino.clientWidth) break;

    var obs = obstaculos[i];
    var pt = 30, pr = 60, pb = 8, pl = 60;

    if (IsCollision(dino, obs, pt, pr, pb, pl)) GameOver();
  }
}
function IsCollision(a, b, pt, pr, pb, pl) {
  var A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
  return !(A.top + A.height - pb < B.top || A.top + pt > B.top + B.height ||
    A.left + A.width - pr < B.left || A.left + pl > B.left + B.width);
}

/* ===== QUIZ UI ===== */
// Temporizador de pregunta: iniciar / detener / manejar timeout
function startQuestionTimer(seconds) {
  try {
    stopQuestionTimer();
    questionSecondsLeft = typeof seconds === 'number' ? seconds : QUESTION_SECONDS;
    const timerEl = document.getElementById('quizTimer');
    if (timerEl) { timerEl.style.display = 'block'; timerEl.textContent = questionSecondsLeft + ' s'; }
    questionTimerInterval = setInterval(() => {
      questionSecondsLeft--;
      if (timerEl) timerEl.textContent = questionSecondsLeft + ' s';
      if (questionSecondsLeft <= 0) {
        stopQuestionTimer();
        handleQuestionTimeout();
      }
    }, 1000);
  } catch (e) { console.warn('Timer start error', e); }
}

function stopQuestionTimer() {
  try {
    if (questionTimerInterval) { clearInterval(questionTimerInterval); questionTimerInterval = null; }
    const timerEl = document.getElementById('quizTimer'); if (timerEl) timerEl.style.display = 'none';
  } catch (e) { }
}

function handleQuestionTimeout() {
  try {
    const msg = document.getElementById('quizMsg'); if (msg) { msg.textContent = 'Se acabó el tiempo. La respuesta se considera incorrecta.'; msg.className = 'quiz-msg err'; }
    var inputs = document.querySelectorAll('input[name="q1"]'); inputs.forEach(inp => inp.disabled = true);
    try { document.getElementById('btnQuizNext').style.display = 'none'; } catch (e) {}
    try { document.getElementById('btnQuizOk').textContent = 'Volver a jugar'; } catch (e) {}
    // Reiniciar juego Espinosaurio automáticamente después de una pequeña pausa
    setTimeout(() => { location.reload(); }, 1400);
  } catch (e) { console.warn('handleQuestionTimeout error', e); }
}
function mostrarQuiz() {
  document.body.classList.add("quiz-mode");
  try { window.lockLandscapeOrientation?.(); } catch (e) { }

  if (!quizData) {
    quizData = {
        title: "¡Pregunta final del Espinosaurio!", subtitle: "Responde con cuidado",
        question: "¿Qué tipo de dinosaurio era el Espinosaurio?", options: ["Herbívoro", "Carnívoro", "Dinosaurio volador", "Dinosaurio marino pequeño"], answerIndex: 1
      };
  }

  var preparedQuiz = prepareQuizOptions(quizData);

  document.getElementById("quizTitle").textContent = "MUCH \u2022 Quiz Interactivo";
  document.getElementById("quizSub").textContent = [preparedQuiz.title, preparedQuiz.subtitle].filter(Boolean).join(" \u00b7 ") || "Pregunta final";
  document.getElementById("quizQuestion").textContent = preparedQuiz.question || "";

  var box = document.getElementById("quizOptions"); box.innerHTML = "";
  quizAnswerIndex = Number(preparedQuiz.answerIndex) || 0;

  (preparedQuiz.options || []).forEach(function (txt, i) {
    var label = document.createElement("label"); label.className = "quiz-opt";
    label.innerHTML = '<input type="radio" name="q1" value="' + i + '"> <span>' + txt + "</span>";
    box.appendChild(label);
  });

  var o = document.getElementById("quizOverlay");
  var msg = document.getElementById("quizMsg"); msg.textContent = ""; msg.className = "quiz-msg";
  // Preparar botones: ocultar 'Siguiente' y restaurar 'Confirmar'
  try { document.getElementById('btnQuizNext').style.display = 'none'; } catch (e) {}
  try { const b = document.getElementById('btnQuizOk'); if (b) { b.disabled = false; b.style.display = 'inline-block'; b.textContent = 'Confirmar'; } } catch (e) {}

  o.classList.add("show"); quizVisible = true;
  try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { }
  // Iniciar temporizador de 15 segundos para la pregunta especial
  startQuestionTimer(QUESTION_SECONDS);
}

async function validarQuiz() {
  var msg = document.getElementById("quizMsg");
  var sel = document.querySelector('input[name="q1"]:checked');
  var btnOk = document.getElementById("btnQuizOk");

  // Detener temporizador al confirmar respuesta
  try { stopQuestionTimer(); } catch (e) {}

  if (btnOk.textContent === "Continuar") {
    window.location.href = "../index.html";
    return;
  }

  if (btnOk.textContent === "Volver a jugar") {
    location.reload();
    return;
  }

  if (!sel) {
    window.MuchStationCompletion?.clearInline(msg, 'Selecciona una opción. 😉');
    msg.className = "quiz-msg err";
    return;
  }

  // Deshabilitar radio buttons y aplicar estilos visuales de correcto/incorrecto
  var labels = document.querySelectorAll('.quiz-opt');
  labels.forEach((label, idx) => {
    var radio = label.querySelector('input');
    if (radio) radio.disabled = true;
    if (idx === quizAnswerIndex) {
      label.style.background = '#d1fae5';
      label.style.borderColor = '#10b981';
      label.style.color = '#065f46';
      label.style.transition = 'all 0.3s ease';
    } else if (idx === Number(sel.value)) {
      label.style.background = '#fee2e2';
      label.style.borderColor = '#ef4444';
      label.style.color = '#991b1b';
      label.style.transition = 'all 0.3s ease';
    }
  });

  if (Number(sel.value) === quizAnswerIndex) {
    window.MuchStationCompletion?.clearInline(msg);
    msg.textContent = '¡Respuesta correcta! Estación completada con éxito. 🎉';
    msg.className = "quiz-msg ok";

    const btnNext = document.getElementById('btnQuizNext');
    if (btnNext) {
      btnNext.style.display = 'inline-block';
      btnNext.textContent = 'Regresar al mapa';
    }
    if (btnOk) btnOk.disabled = true;

    playVictoryMusic();
    playCompletionSound();

    // Marcar completado y avanzar avatar, guardando solo una vez por estación
    var alreadyCompleted = isStationCompleted(STATION_ID);
    if (!alreadyCompleted) {
      markStationCompleted();
      await guardarSpinosaurioEnSupabase(Number(score), true);
    }
    localStorage.setItem('much_current_station', '3');
    navigatingToRegistro = true;

    // Retrasar el cierre 1.8 segundos para que se aprecien los triggers sonoros/visuales
    setTimeout(() => {
      quizVisible = false;
      try { document.getElementById('quizOverlay').classList.remove('show'); } catch (e) {}
      document.body.classList.remove('quiz-mode');

      try {
        window.MuchStationCompletion?.showFloatingNotice({
          stationId: '2',
          passed: true,
          onReturnToMap: function () {
            const mapParams = new URLSearchParams(window.location.search);
            mapParams.set('view', 'prep');
            window.location.href = '../index.html?' + mapParams.toString();
          }
        });
      } catch (e) {
        window.location.href = '../index.html?view=prep';
      }
    }, 1800);

  } else {
    window.MuchStationCompletion?.clearInline(msg);
    msg.textContent = 'Respuesta incorrecta. El Spinosaurio quedó incompleto.';
    msg.className = "quiz-msg err";
    const btnNext = document.getElementById('btnQuizNext');
    if (btnNext) {
      btnNext.style.display = 'inline-block';
      btnNext.textContent = 'Regresar al mapa';
    }
    if (btnOk) btnOk.disabled = true;
    playIncorrectSound();

    // Forzar la estación a Incompleta (en local y BD), borrando progreso previo
    await guardarSpinosaurioEnSupabase(0, false);

    // Retrasar 1.8 segundos para los efectos visuales/sonoros antes de mostrar el aviso flotante
    setTimeout(() => {
      quizVisible = false;
      try { document.getElementById('quizOverlay').classList.remove('show'); } catch (e) {}
      document.body.classList.remove('quiz-mode');

      try {
        window.MuchStationCompletion?.showFloatingNotice({
          stationId: '2',
          passed: false,
          onReturnToMap: function () {
            location.reload();
          }
        });
      } catch (e) {
        btnOk.textContent = "Volver a jugar";
        btnOk.style.display = 'inline-block';
      }
    }, 1800);
  }
}

var cheatCount = 0;
var cheatOverlay = null;

function handleCheatChange() {
  if (navigatingToRegistro || !quizVisible) return;
  cheatCount++;
  stopQuestionTimer();
  if (cheatCount >= 2) {
    blockCheatScreen();
  } else {
    marcarIncorrectoPorTrampa();
  }
}

async function marcarIncorrectoPorTrampa() {
  quizVisible = false;
  playIncorrectSound();
  var msg = document.getElementById("quizMsg");
  if (msg) {
    msg.textContent = "¡SE DETECTÓ CAMBIO DE PANTALLA! Pregunta marcada como INCORRECTA.";
    msg.className = "quiz-msg err";
  }
  var labels = document.querySelectorAll('.quiz-opt');
  labels.forEach(label => {
    var radio = label.querySelector('input');
    if (radio) radio.disabled = true;
  });
  await guardarSpinosaurioEnSupabase(0, false);
  setTimeout(() => {
    try { document.getElementById('quizOverlay').classList.remove('show'); } catch (e) {}
    document.body.classList.remove('quiz-mode');
    try {
      window.MuchStationCompletion?.showFloatingNotice({
        stationId: '2',
        passed: false,
        onReturnToMap: function () {
          location.reload();
        }
      });
    } catch (e) {
      location.reload();
    }
  }, 2500);
}

function blockCheatScreen() {
  if (!cheatOverlay) {
    cheatOverlay = document.createElement("div");
    cheatOverlay.style.position = "fixed";
    cheatOverlay.style.inset = "0";
    cheatOverlay.style.background = "#b91c1c";
    cheatOverlay.style.color = "#fff";
    cheatOverlay.style.zIndex = "99999";
    cheatOverlay.style.display = "flex";
    cheatOverlay.style.flexDirection = "column";
    cheatOverlay.style.alignItems = "center";
    cheatOverlay.style.justifyContent = "center";
    cheatOverlay.style.padding = "20px";
    cheatOverlay.style.textAlign = "center";
    cheatOverlay.style.fontFamily = "'Outfit', sans-serif";
    document.body.appendChild(cheatOverlay);
  }
  cheatOverlay.innerHTML = `
    <h1 style="font-size: clamp(24px, 6vw, 42px); font-weight: 900; margin-bottom: 12px; letter-spacing: 1px;">🚫 PANTALLA BLOQUEADA</h1>
    <p style="font-size: clamp(16px, 4vw, 22px); max-width: 600px; line-height: 1.4; margin-bottom: 20px;">
      Se ha detectado cambio de pantalla de manera persistente. Los puntos de esta estación han sido invalidados.
    </p>
    <div style="font-size: clamp(30px, 8vw, 48px); font-weight: 900;" id="cheatCountdown">10 s</div>
  `;
  try { document.getElementById('quizOverlay').classList.remove('show'); } catch (e) {}
  document.body.classList.remove('quiz-mode');
  var seconds = 10;
  var interval = setInterval(() => {
    seconds--;
    var cd = document.getElementById("cheatCountdown");
    if (cd) cd.textContent = seconds + " s";
    if (seconds <= 0) {
      clearInterval(interval);
      location.reload();
    }
  }, 1000);
}

function antiCheatGuard() {
  handleCheatChange();
}
function blockShortcutsDuringQuiz(e) {
  if (!quizVisible) return;
  const k = (e.key || "").toLowerCase();
  if ((e.ctrlKey || e.metaKey) && ["l", "t", "n", "w", "k", "p", "r"].includes(k)) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
}

/* ===== BACKEND EXPRESS/MYSQL LOGIC ===== */
const API_BASE_URL = window.location.hostname ? `http://${window.location.hostname}:3000` : 'http://127.0.0.1:3000';

async function registrarIntentoInicial() {
  try {
    const progreso = await import('../supabase-utils.js');
    const data = await progreso.guardarIntentoEstacion(STATION_ID, {
      puntaje: 0,
      aciertos: 0,
      errores: 0,
      aprobado: false,
      finalizado: false
    });
    if (data?.id_intento) {
      sessionStorage.setItem("ultimo_intento_id", String(data.id_intento));
      return data.id_intento;
    }
  } catch (error) {
    console.error('Error al registrar intento inicial en MySQL:', error);
  }
  return null;
}

async function registrarQuizEnSupabase(puntajeFinal) {
  try {
    const progreso = await import('../supabase-utils.js');
    const puntaje = Number(puntajeFinal);
    const aprobado = puntaje >= WIN_SCORE;
    const payload = {
      id_estacion: Number(STATION_ID),
      puntaje,
      aciertos: puntaje,
      errores: aprobado ? 0 : 1,
      aprobado,
      finalizado: true
    };
    const intentoId = sessionStorage.getItem("ultimo_intento_id");

    if (intentoId) {
      const actualizado = await progreso.actualizarIntentoEstacion(intentoId, payload);
      if (actualizado) return;
      try { sessionStorage.removeItem("ultimo_intento_id"); } catch (e) {}
    }

    const data = await progreso.guardarIntentoEstacion(STATION_ID, payload);
    if (data?.id_intento) sessionStorage.setItem("ultimo_intento_id", String(data.id_intento));
  } catch (error) {
    console.error('Error al registrar quiz en MySQL:', error);
  }
}

// === INICIALIZAR MINI-MAPA ===
function initMiniMap() {
  const miniMapAvatar = document.getElementById('miniMapAvatar');
  const miniMapAvatarImg = document.getElementById('miniMapAvatarImg');
  if (!miniMapAvatar || !miniMapAvatarImg) return;

  // 1. Obtener Avatar
  const savedAvatar = JSON.parse(localStorage.getItem('much_selected_avatar') || '{}');
  if (savedAvatar && savedAvatar.id) {
    miniMapAvatarImg.src = `../avatars/${savedAvatar.id}.png`;
  } else {
    miniMapAvatarImg.src = `../avatars/dino1.png`; // Fallback
  }

  // 2. Obtener Estación Actual
  const stations = {
    '1': { x: 80, y: 18 },
    '2': { x: 56, y: 42 },
    '3': { x: 21, y: 24 },
    '4': { x: 10, y: 44 },
    '5': { x: 30, y: 43 },
    '6': { x: 42, y: 66 }
  };

  // Identificar sala actual para forzar la posición correcta
  let currentStationId = localStorage.getItem('much_current_station') || '2';
  
  if (window.location.pathname.includes('Juego_Spinosaurio')) {
    currentStationId = '2';
  } else if (window.location.pathname.includes('SALA-Biodiversidad-y-Conocimiento')) {
    currentStationId = '3';
  } else if (window.location.pathname.includes('sala_energia')) {
    currentStationId = '4';
  } else if (window.location.pathname.includes('Sala_Desarrollo_Sustentable')) {
    currentStationId = '5';
  }

  const pos = stations[currentStationId];
  if (pos) {
    miniMapAvatar.style.left = `${pos.x}%`;
    miniMapAvatar.style.top = `${pos.y}%`;
  }
}

// Inicializar Mini-Mapa inmediatamente
initMiniMap();

