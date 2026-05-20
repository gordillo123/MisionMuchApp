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
const STATION_ID = '2';
const COMPLETED_STATIONS_KEY = 'much_completed_stations';

var jumpSound;
var quizData = null;
var quizAnswerIndex = null;
var quizVisible = false;
var navigatingToRegistro = false;
// Temporizador de pregunta especial
var QUESTION_SECONDS = 10;
var questionSecondsLeft = 0;
var questionTimerInterval = null;

function markStationCompleted() {
  try {
    const completed = JSON.parse(localStorage.getItem(COMPLETED_STATIONS_KEY) || '{}');
    completed[STATION_ID] = true;
    localStorage.setItem(COMPLETED_STATIONS_KEY, JSON.stringify(completed));
  } catch (e) {
    console.warn('No se pudo marcar estación completa:', e);
  }
}

// 🛑 Variables de la cuenta regresiva y estado del juego
var countdownActive = false;
var gameStarted = false;
var loopRequestId;
var orientationBlocked = false;

function isMobilePortrait() {
  const isCoarsePointer = window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) <= 900;
  return isSmallScreen && isCoarsePointer && window.innerHeight > window.innerWidth;
}

function updateOrientationGate() {
  orientationBlocked = isMobilePortrait();
  document.body.classList.toggle("orientation-blocked", orientationBlocked);
  return orientationBlocked;
}

function canStartLandscapeGame() {
  return !updateOrientationGate();
}

/* ===== INICIALIZACIÓN ===== */
if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(Init, 1);
} else {
  document.addEventListener("DOMContentLoaded", Init);
}

function Init() {
  updateOrientationGate();
  window.addEventListener("resize", updateOrientationGate, { passive: true });
  window.addEventListener("orientationchange", function () {
    setTimeout(updateOrientationGate, 120);
  }, { passive: true });

  Start();
  ConfigurarPortada(); // Arranca escuchando el botón de la portada integrada
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

  document.getElementById("btnRetry").addEventListener("click", function () { location.reload(); });
  document.getElementById("btnQuizOk").addEventListener("click", validarQuiz);

  // Nuevo: botón 'Siguiente' que aparece después de responder
  try {
    const btnNext = document.getElementById("btnQuizNext");
    if (btnNext) {
      btnNext.addEventListener("click", function () {
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
      if (!canStartLandscapeGame()) return;

      try {
        // 1. Pedimos Pantalla Completa
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
          await document.documentElement.webkitRequestFullscreen();
        }

        // 2. Forzamos rotación horizontal
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock("landscape");
        }
      } catch (err) {
        console.warn("No se pudo forzar rotación:", err);
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
      time = new Date();

      // 📝 Await the initial registration to ensure ultimo_intento_id is saved before any score updates
      await registrarIntentoInicial();

      Loop(); // 🚀 ARRANCA EL JUEGO
    }
  }, 1000);
}

/* ===== QUIZ JSON ===== */
async function cargarQuizJSON() {
  try {
    const res = await fetch("quiz.json?cb=" + Date.now());
    const data = await res.json();
    const list = Array.isArray(data.questions) ? data.questions : [];
    quizData = list.length ? list[Math.floor(Math.random() * list.length)] : null;
  } catch (e) {
    quizData = null;
  }
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
  n.style.bottom = 100 + Math.random() * (270 - 100) + "px"; nubes.push(n);
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

  if (score >= WIN_SCORE) {
    contenedor.classList.add("noche"); parado = true;
    dino.classList.remove("dino-corriendo"); mostrarQuiz(); return;
  }
  suelo.style.animationDuration = "3s";
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
    if (timerEl) { timerEl.style.display = 'block'; timerEl.textContent = questionSecondsLeft + 's'; }
    questionTimerInterval = setInterval(() => {
      questionSecondsLeft--;
      if (timerEl) timerEl.textContent = questionSecondsLeft + 's';
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
    const msg = document.getElementById('quizMsg'); if (msg) { msg.textContent = 'Tiempo agotado. Incorrecto.'; msg.className = 'quiz-msg err'; }
    var inputs = document.querySelectorAll('input[name="q1"]'); inputs.forEach(inp => inp.disabled = true);
    try { document.getElementById('btnQuizNext').style.display = 'inline-block'; } catch (e) {}
    try { document.getElementById('btnQuizOk').textContent = 'Volver a jugar'; } catch (e) {}
    // Reiniciar juego Espinosaurio automáticamente después de una pequeña pausa
    setTimeout(() => { location.reload(); }, 1400);
  } catch (e) { console.warn('handleQuestionTimeout error', e); }
}
function mostrarQuiz() {
  document.body.classList.add("quiz-mode");
  try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { }
  setTimeout(() => {
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock("portrait-primary"); } catch (e) { }
  }, 50);

  if (!quizData) {
    quizData = {
      title: "¡Muy bien!", subtitle: "Responde para continuar:",
      question: "¿Pregunta por defecto?", options: ["A", "B", "C", "D"], answerIndex: 3
    };
  }

  document.getElementById("quizTitle").textContent = quizData.title || "Pregunta final";
  document.getElementById("quizSub").textContent = quizData.subtitle || "";
  document.getElementById("quizQuestion").textContent = quizData.question || "";

  var box = document.getElementById("quizOptions"); box.innerHTML = "";
  quizAnswerIndex = Number(quizData.answerIndex) || 0;

  (quizData.options || []).forEach(function (txt, i) {
    var label = document.createElement("label"); label.className = "quiz-opt";
    label.innerHTML = '<input type="radio" name="q1" value="' + i + '"> <span>' + txt + "</span>";
    box.appendChild(label);
  });

  var o = document.getElementById("quizOverlay");
  var msg = document.getElementById("quizMsg"); msg.textContent = ""; msg.className = "quiz-msg";
  // Preparar botones: ocultar 'Siguiente' y restaurar 'Confirmar'
  try { document.getElementById('btnQuizNext').style.display = 'none'; } catch (e) {}
  try { const b = document.getElementById('btnQuizOk'); if (b) { b.disabled = false; b.textContent = 'Confirmar'; } } catch (e) {}

  o.classList.add("show"); quizVisible = true;
  try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { }
  // Iniciar temporizador de 10 segundos para la pregunta especial
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
    msg.textContent = "Selecciona una opción 😉"; msg.className = "quiz-msg err"; return;
  }

  if (Number(sel.value) === quizAnswerIndex) {
    msg.textContent = "¡Felicidades! ¡Correcto! Has completado esta estación con éxito y tu avatar avanzó a la siguiente estación. 🦖"; 
    msg.className = "quiz-msg ok";

    navigatingToRegistro = true; 
    quizVisible = false;

    // Deshabilitar radio buttons para evitar cambios
    var inputs = document.querySelectorAll('input[name="q1"]');
    inputs.forEach(inp => inp.disabled = true);

    // Marcar completado y avanzar avatar
    markStationCompleted();
    localStorage.setItem('much_current_station', '3');

    await registrarQuizEnSupabase(Number(score));

    // Mostrar botón Siguiente para que el usuario avance cuando quiera
    try { document.getElementById('btnQuizNext').style.display = 'inline-block'; } catch (e) {}
    btnOk.textContent = "Continuar";
  } else {
    msg.textContent = "Incorrecto. ¡Vuelve a jugar!"; msg.className = "quiz-msg err";

    var inputs = document.querySelectorAll('input[name="q1"]');
    inputs.forEach(inp => inp.disabled = true);

    // Mostrar botón Siguiente incluso en incorrecto para permitir navegación/recarga
    try { document.getElementById('btnQuizNext').style.display = 'inline-block'; } catch (e) {}
    btnOk.textContent = "Volver a jugar";
  }
}

function antiCheatGuard() {
  if (navigatingToRegistro || !quizVisible) return;
  try { document.getElementById("quizOverlay").classList.remove("show"); } catch (e) { }
  location.reload(); // Recarga para asegurar que vuelva a mostrar la portada
}
function blockShortcutsDuringQuiz(e) {
  if (!quizVisible) return;
  const k = (e.key || "").toLowerCase();
  if ((e.ctrlKey || e.metaKey) && ["l", "t", "n", "w", "k", "p", "r"].includes(k)) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
}

/* ===== SUPABASE LOGIC ===== */
async function registrarIntentoInicial() {
  if (!window.supabase) {
    console.error("❌ Supabase no está disponible en registrarIntentoInicial");
    return null;
  }

  try {
    const ID_SALA_SPINO = '0b4f04b0-5196-473d-8689-55d5f315df55';

    console.log("📝 Entró a registrarIntentoInicial");
    const savedUser = JSON.parse(localStorage.getItem('much_google_user') || '{}');
    const ID_PARTICIPANTE = savedUser.email || null;

    const payload = {
      sala_id: ID_SALA_SPINO,
      participante_id: ID_PARTICIPANTE,
      puntaje: 0,
      ubicacion: LUGAR_QR,
      estatus: 'activo',
      created_at: getMexicoTime()
    };
    const { data, error } = await window.supabase
      .from("intentos_juego")
      .insert(payload)
      .select("id")
      .single();

    console.log("🧪 Resultado insert intento inicial:", { data, error });

    if (error) {
      console.error("❌ Error Supabase al registrar intento inicial:", error);
      return null;
    }

    if (!data || !data.id) {
      console.warn("⚠️ Se insertó pero no regresó id. Posible problema de RLS en SELECT.");
      return null;
    }

    sessionStorage.setItem("ultimo_intento_id", String(data.id));
    console.log("✅ ultimo_intento_id guardado:", sessionStorage.getItem("ultimo_intento_id"));

    return data.id;
  } catch (e) {
    console.error("❌ Error crítico en registrarIntentoInicial:", e);
    return null;
  }
}

async function registrarQuizEnSupabase(puntajeFinal) {
  if (!window.supabase) {
    console.error("❌ Supabase no está disponible");
    return;
  }

  try {
    const intentoId = sessionStorage.getItem("ultimo_intento_id");
    const intentoIdNum = Number(intentoId);
    const ID_SALA_SPINO = '0b4f04b0-5196-473d-8689-55d5f315df55';
    const puntaje = Number(puntajeFinal);



    if (Number.isNaN(puntaje)) {
      console.error("❌ puntajeFinal no es válido:", puntajeFinal);
      return;
    }

      const savedUser = JSON.parse(localStorage.getItem('much_google_user') || '{}');
      const ID_PARTICIPANTE = savedUser.email || null;

      if (intentoId && !Number.isNaN(intentoIdNum)) {
        const payload = {
          puntaje: puntaje,
          estatus: 'finalizado'
        };

        if (ID_PARTICIPANTE) payload.participante_id = ID_PARTICIPANTE;

      const { data, error } = await window.supabase
        .from("intentos_juego")
        .update(payload)
        .eq("id", intentoIdNum)
        .select();

      if (error) {
        console.error("❌ Error Supabase al actualizar intento:", error);
      } else if (!data || data.length === 0) {
        console.warn("⚠️ No se actualizó ninguna fila con id:", intentoIdNum);
      } else {
        console.log("✅ Puntaje actualizado exitosamente →", puntaje, data);
      }
    } else {
      console.warn("⚠️ No se encontró ultimo_intento_id válido, haciendo insert fallback...");

      const payload = {
        sala_id: ID_SALA_SPINO,
        puntaje: puntaje,
        ubicacion: LUGAR_QR,
        estatus: 'finalizado',
        created_at: getMexicoTime()
      };

      // No ganadorId fallback here

      const { data, error } = await window.supabase
        .from("intentos_juego")
        .insert(payload)
        .select();

      if (error) {
        console.error("❌ Error Supabase al insertar fallback:", error);
      } else {
        console.log("✅ Puntaje guardado con insert fallback →", puntaje, data);
      }
    }
  } catch (e) {
    console.error("❌ Error crítico en el registro:", e);
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
