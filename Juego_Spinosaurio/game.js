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
var WIN_SCORE = 10;

var jumpSound;
var quizData = null;
var quizAnswerIndex = null;
var quizVisible = false;
var navigatingToRegistro = false;

// 🛑 Variables de la cuenta regresiva y estado del juego
var countdownActive = false;
var gameStarted = false;
var loopRequestId;

/* ===== INICIALIZACIÓN ===== */
if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(Init, 1);
} else {
  document.addEventListener("DOMContentLoaded", Init);
}

function Init() {
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

  document.getElementById("btnQuizCancel").addEventListener("click", function () {
    navigatingToRegistro = true;
    quizVisible = false;
    try { document.getElementById("quizOverlay").classList.remove("show"); } catch (e) { }
    document.body.classList.remove("quiz-mode");
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

      // 3. Ocultar la portada
      if (portada) portada.classList.remove("show");

      // 4. Iniciar la cuenta de 5 segundos
      runCountdown();
    });
  }
}

async function runCountdown() {
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
  if (parado || quizVisible || countdownActive || !gameStarted) return;
  var target = e.target;
  if (target.closest("#retryWrap") || target.closest("#quizOverlay")) return;
  var tag = (target.tagName || "").toLowerCase();
  if (tag === "button" || tag === "a") return;
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  Saltar();
}

function HandleKeyDown(ev) {
  if (quizVisible || countdownActive || !gameStarted) return;
  if (ev.code === "Space" || ev.keyCode === 32 || ev.code === "ArrowUp" || ev.keyCode === 38) {
    ev.preventDefault(); Saltar();
  }
}

/* ===== UPDATE (Lógica de movimiento y colisiones) ===== */
function Update() {
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

  if (score == WIN_SCORE) {
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
  o.classList.add("show"); quizVisible = true;
  try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { }
}

async function validarQuiz() {
  var msg = document.getElementById("quizMsg");
  var sel = document.querySelector('input[name="q1"]:checked');
  var btnOk = document.getElementById("btnQuizOk");

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
    msg.textContent = "¡Correcto! Has completado esta estación. Puedes continuar explorando las demás. 🦖"; 
    msg.className = "quiz-msg ok";

    navigatingToRegistro = true; 
    quizVisible = false;

    // Deshabilitar radio buttons para evitar cambios
    var inputs = document.querySelectorAll('input[name="q1"]');
    inputs.forEach(inp => inp.disabled = true);

    await registrarQuizEnSupabase(Number(score));

    btnOk.textContent = "Continuar";
  } else {
    msg.textContent = "Incorrecto. ¡Vuelve a jugar!"; msg.className = "quiz-msg err";

    var inputs = document.querySelectorAll('input[name="q1"]');
    inputs.forEach(inp => inp.disabled = true);

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
