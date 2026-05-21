/* =================== Datos de Configuración =================== */
const params = new URLSearchParams(location.search);
const SALA = params.get('sala') || 'desarrollo-sustentable';

// 🛡️ BLINDAJE NIVEL DIOS: Guardar en memoria PERMANENTE
const LUGAR_EN_URL = (params.get('lugar') || '').trim();
if (LUGAR_EN_URL) {
  localStorage.setItem('much_lugar_seguro', LUGAR_EN_URL);
} else {
  localStorage.removeItem('much_lugar_seguro');
}
const LUGAR_QR = LUGAR_EN_URL || 'Sin Especificar';

const NUM_QUESTIONS = 10;
const QUESTION_SECONDS = 10;
// Función para mezclar arrays
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);

// Placeholder: Se llenará desde el JSON
let QUESTIONS = [];
// 🔒 BANDERA DE SEGURIDAD (Evita dobles registros al dar clic rápido)
let quizIniciando = false;

// 🎁 Clase dummy para mantener compatibilidad con el constructor de UIManager
class PrizeManager {
  constructor() {}
}


/* ================================================================= */
/* ==== SUPABASE: CONEXIÓN Y LÓGICA DE BASE DE DATOS =========== */
/* ================================================================= */

const SUPABASE_URL = 'https://qwgaeorsymfispmtsbut.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3Z2Flb3JzeW1maXNwbXRzYnV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzODcyODUsImV4cCI6MjA3Nzk2MzI4NX0.FThZIIpz3daC9u8QaKyRTpxUeW0v4QHs5sHX2s1U1eo';

// 🔒 ID EXACTO DE LA SALA "desarrollo-sustentable"
const SALA_ENTRADA_ID = '17fd001d-f6c5-4f98-ab25-d81624227bc2';

let supabase = null;

function getMexicoDateParts(date = new Date()) {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'shortOffset'
  }).formatToParts(date);

  return Object.fromEntries(
    formatted
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
}

function normalizeOffset(offsetValue) {
  const rawOffset = String(offsetValue || 'GMT-06:00').replace('GMT', '');
  const match = rawOffset.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return '-06:00';

  const [, sign, hours, minutes = '00'] = match;
  return `${sign}${hours.padStart(2, '0')}:${minutes}`;
}

function getMexicoDateKey(date = new Date()) {
  const parts = getMexicoDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Inicializa la librería
async function initSupabase() {
  if (supabase) return supabase;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabase;
}

async function guardarResultadoEstacionSupabase({ puntaje_total, num_correctas, num_preguntas, aprobado }) {
  try {
    const progreso = await import('../supabase-utils.js');
    const estacionId = 5;

    await progreso.guardarIntentoEstacion(estacionId, {
      aciertos: num_correctas,
      errores: Math.max(0, num_preguntas - num_correctas),
      puntaje: puntaje_total,
      aprobado
    });

    if (aprobado) {
      await progreso.guardarProgresoUsuario(estacionId, {
        metadata: {
          estacion: 'desarrollo-sustentable',
          puntaje_total,
          num_correctas,
          num_preguntas,
          ubicacion: LUGAR_QR
        }
      });
    }
  } catch (error) {
    console.error('[Supabase DB] No se pudo guardar desarrollo sustentable:', error);
  }
}

// ⏰ FUNCIÓN CRÍTICA: Obtener hora exacta de México
function getMexicoTime() {
  const parts = getMexicoDateParts();
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}${normalizeOffset(parts.timeZoneName)}`;
}

// ------------------------------------------------------------
// 1. CARGAR PREGUNTAS DESDE ARCHIVO JSON
// ------------------------------------------------------------
async function loadPreguntas() {
  try {
    const resp = await fetch('preguntas.json', { cache: 'no-store' });
    if (!resp.ok) throw new Error('No se pudo cargar preguntas.json: ' + resp.status);
    let bank = await resp.json();

    if (!Array.isArray(bank)) {
      const keys = Object.keys(bank || {});
      if (keys.length && bank[SALA]) {
        bank = bank[SALA];
      } else if (keys.length) {
        const firstKey = keys.find(k => Array.isArray(bank[k]));
        if (firstKey) bank = bank[firstKey];
      }
    }

    if (!Array.isArray(bank) || bank.length === 0)
      throw new Error('preguntas.json no contiene un array de preguntas');

    const normalize = (it) => {
      const text = it.text ?? it.pregunta ?? it.enunciado ?? 'Pregunta sin texto';
      const desc = it.desc ?? it.descripcion ?? '';
      let options = it.options ?? it.opciones ?? it.respuestas ?? [];
      let correctIndex = it.correctIndex ?? it.correcta_index;

      if (Array.isArray(options) && typeof options[0] === 'object') {
        const idx = options.findIndex(o => o.correcta === true || o.esCorrecta === true);
        if (correctIndex == null && idx >= 0) correctIndex = idx;
        options = options.map(o => o.text ?? o.texto ?? o.label ?? String(o));
      }

      if (correctIndex == null && typeof it.correcta === 'string') {
        const idx2 = options.findIndex(o => String(o).trim() === String(it.correcta).trim());
        if (idx2 >= 0) correctIndex = idx2;
      }

      if (correctIndex == null && (it.respuesta || it.respuesta_correcta)) {
        const num = (it.respuesta ?? it.respuesta_correcta) - 1;
        if (!Number.isNaN(num)) correctIndex = num;
      }

      const points = it.points ?? it.puntos ?? 10;

      if (!Array.isArray(options) || options.length === 0) {
        options = ['(sin opciones)'];
        correctIndex = 0;
      }
      if (correctIndex == null || correctIndex < 0 || correctIndex >= options.length) {
        correctIndex = 0;
      }
      return { text, options, correctIndex, points, desc };
    };

    const bySala = bank.filter(q =>
      !q?.sala && !q?.sala_codigo ? true :
        (q.sala === SALA || q.sala_codigo === SALA)
    );

    const pool = bySala.length ? bySala : bank;
    const normalized = pool.map(normalize);

    QUESTIONS = shuffle(normalized).slice(0, NUM_QUESTIONS);
    console.log('[loadPreguntas] JSON Cargado. Total preguntas:', QUESTIONS.length);
    return QUESTIONS;
  } catch (err) {
    console.warn('[loadPreguntas] Error en fetch, usando banco local:', err);
    const bankLocal = window.MUCH_PREGUNTAS_SUSTENTABLE || [];
    if (!bankLocal.length) {
      console.error('No hay preguntas locales disponibles.');
      throw err;
    }

    const normalize = (it) => {
      const text = it.text ?? it.pregunta ?? it.enunciado ?? 'Pregunta sin texto';
      const desc = it.desc ?? it.descripcion ?? '';
      let options = it.options ?? it.opciones ?? it.respuestas ?? [];
      let correctIndex = it.correctIndex ?? it.correcta_index;
      if (Array.isArray(options) && typeof options[0] === 'object') {
        const idx = options.findIndex(o => o.correcta === true || o.esCorrecta === true);
        if (correctIndex == null && idx >= 0) correctIndex = idx;
        options = options.map(o => o.text ?? o.texto ?? o.label ?? String(o));
      }
      const points = it.points ?? it.puntos ?? 10;
      if (!Array.isArray(options) || options.length === 0) { options = ['(sin opciones)']; correctIndex = 0; }
      if (correctIndex == null || correctIndex < 0 || correctIndex >= options.length) { correctIndex = 0; }
      return { text, options, correctIndex, points, desc };
    };

    QUESTIONS = shuffle(bankLocal.map(normalize)).slice(0, NUM_QUESTIONS);
    console.log('[loadPreguntas] Fallback local cargado. Total:', QUESTIONS.length);
    return QUESTIONS;
  }
}

// ------------------------------------------------------------
// 2. GESTIÓN DE PARTIDAS (DB TRACKING)
// ------------------------------------------------------------

async function startQuizInDB() {
  if (quizIniciando) return sessionStorage.getItem('much_current_quiz_id');
  quizIniciando = true;

  try {
    // 🌟 SE OBTIENE EL ID DEL USUARIO DESDE EL LOCALSTORAGE
    const savedUser = JSON.parse(localStorage.getItem('much_google_user') || '{}');
    const ID_JUGADOR = savedUser.email || 365;

    // Insertar nuevo intento
    const payload = {
      sala_id: SALA_ENTRADA_ID,
      participante_id: ID_JUGADOR,
      started_at: getMexicoTime(),
      num_preguntas: NUM_QUESTIONS,
      puntaje_total: 0,
      num_correctas: 0,
      estatus: 'activo',
      ubicacion: LUGAR_QR // 🌟 SE MANDA LA MEMORIA PERMANENTE
    };

    console.log("Guardando intento en BD...");
    const { data, error } = await supabase
      .from('quizzes')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      console.error("❌ Error Supabase (Start):", error.message);
      quizIniciando = false;
      startQuizLocal();
      return null;
    }

    console.log("✅ Intento iniciado. ID:", data.id);

    sessionStorage.setItem('much_current_quiz_id', data.id);
    localStorage.setItem('much_quiz_db_id', String(data.id));
    localStorage.setItem('much_quiz_last_quiz_id', String(data.id));

    return data.id;

  } catch (e) {
    console.error("Excepción al iniciar quiz:", e);
    quizIniciando = false;
    startQuizLocal();
    return null;
  }
}

async function endQuizInDB({ puntaje_total, num_correctas, num_preguntas }) {
  saveQuizResultLocal({ puntaje_total, num_correctas, num_preguntas });

  try {
    await initSupabase();
    const quizId = sessionStorage.getItem('much_current_quiz_id');
    if (!quizId) return;

    console.log(`🏁 Finalizando intento ${quizId}...`);

    const { error } = await supabase.from('quizzes').update({
      puntaje_total: puntaje_total,
      num_correctas: num_correctas,
      num_preguntas: num_preguntas,
      finished_at: getMexicoTime(),
      estatus: 'finalizado'
    }).eq('id', quizId);

    if (error) console.error("Error al finalizar (DB):", error.message);
    else console.log("✅ Intento actualizado en BD al finalizar.");

  } catch (e) { console.warn('Error endQuizInDB:', e); }
}

// Fallback Functions
function startQuizLocal() {
  if (sessionStorage.getItem('much_quiz_start')) return;
  const startTime = getMexicoTime();
  sessionStorage.setItem('much_quiz_start', startTime);
}

function saveQuizResultLocal(data) {
  const startTime = sessionStorage.getItem('much_quiz_start') || getMexicoTime();
  const quizData = { ...data, sala_id: SALA_ENTRADA_ID, started_at: startTime, finished_at: getMexicoTime() };

  localStorage.setItem('much_quiz_final_data', JSON.stringify(quizData));

  const dbId = sessionStorage.getItem('much_current_quiz_id');
  if (dbId) {
    localStorage.setItem('much_quiz_db_id', dbId);
    localStorage.setItem('much_quiz_last_quiz_id', dbId);
  }
}

/* =================== Clases UI =================== */
class SoundFX {
  constructor(toggleEl) { this.toggleEl = toggleEl; this.ctx = null; }
  beep(freq = 880, dur = 0.15, type = 'sine', vol = 0.08) {
    if (this.toggleEl && !this.toggleEl.checked) return;
    this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(this.ctx.destination); o.start();
    setTimeout(() => o.stop(), dur * 1000);
  }
  correct() { this.beep(880, .12, 'sine', .08); setTimeout(() => this.beep(1320, .12, 'sine', .07), 130); }
  wrong() { this.beep(200, .18, 'sawtooth', .07); }
}

class Confetti {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.pieces = []; this.resize(); addEventListener('resize', () => this.resize());
    this.loop();
  }
  resize() { this.canvas.width = innerWidth; this.canvas.height = innerHeight; }
  launch(n = 120) {
    for (let i = 0; i < n; i++) {
      this.pieces.push({ x: Math.random() * this.canvas.width, y: -10, r: 4 + Math.random() * 4, vy: 2 + Math.random() * 3, vx: -2 + Math.random() * 4, rot: Math.random() * Math.PI * 2 });
    }
  }
  loop() {
    requestAnimationFrame(() => this.loop());
    const { ctx, canvas } = this; ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += 0.05;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      const palette = ['#06b6d4', '#0891b2', '#d946ef', '#a21caf', '#22d3ee', '#f0abfc'];
      ctx.fillStyle = palette[(p.r | 0) % palette.length];
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2); ctx.restore();
    });
    this.pieces = this.pieces.filter(p => p.y < canvas.height + 20);
  }
}

class UIManager {
  constructor({ elements, sound, confetti, prizeMgr }) {
    this.e = elements; this.sound = sound; this.confetti = confetti; this.prizeMgr = prizeMgr;
    this.state = { idx: 0, selected: null, points: 0, correct: 0, locked: false, answers: [] };
    this.currentPrize = null;
    this.cheatingDetected = false;
    this.questionTimer = null;
    this.questionCountdown = QUESTION_SECONDS;

    if (this.e.nextBtn) this.e.nextBtn.classList.add('d-none');
    if (this.e.pillSala) this.e.pillSala.textContent = `Sala: ${SALA}`;
    if (this.e.qTotal) this.e.qTotal.textContent = QUESTIONS.length.toString();
    if (this.e.correctTotal) this.e.correctTotal.textContent = QUESTIONS.length.toString();
    this.bind();
    this.render();
    this.clock();
    this.startFocusDetection();
  }

  updateScoreboard() {
    const s = this.state;
    if (this.e.pointsEl) this.e.pointsEl.textContent = s.points.toString();
    if (this.e.correctCount) this.e.correctCount.textContent = s.correct.toString();
    if (this.e.correctTotal) this.e.correctTotal.textContent = QUESTIONS.length.toString();
  }

  startFocusDetection() {
    window.addEventListener('blur', this.handleFocusLoss.bind(this));
  }

  updateQuestionTimerDisplay() {
    if (!this.e.questionTimer) return;
    this.e.questionTimer.textContent = `⏳ ${this.questionCountdown}s`;
    this.e.questionTimer.classList.toggle('low', this.questionCountdown <= 5 && this.questionCountdown > 3);
    this.e.questionTimer.classList.toggle('urgent', this.questionCountdown <= 3);
  }

  stopQuestionTimer() {
    if (this.questionTimer) {
      clearInterval(this.questionTimer);
      this.questionTimer = null;
    }
  }

  startQuestionTimer() {
    this.stopQuestionTimer();
    this.questionCountdown = QUESTION_SECONDS;
    this.updateQuestionTimerDisplay();

    this.questionTimer = setInterval(() => {
      if (this.questionCountdown <= 0) {
        this.handleQuestionTimeout();
        return;
      }
      this.questionCountdown -= 1;
      this.updateQuestionTimerDisplay();
      if (this.questionCountdown <= 0) {
        this.handleQuestionTimeout();
      }
    }, 1000);
  }

  handleQuestionTimeout() {
    const s = this.state, { e } = this;
    if (s.locked || this.cheatingDetected || s.idx >= QUESTIONS.length) return;
    this.stopQuestionTimer();

    s.locked = true;
    s.selected = null;

    if (e.status) e.status.textContent = '⏰ Se acabó el tiempo. Respuesta incorrecta.';
    [...e.options.querySelectorAll('.option-btn')].forEach((btn, idx) => {
      btn.disabled = true;
      const correctIdx = QUESTIONS[s.idx].correctIndex;
      if (idx === correctIdx) {
        btn.classList.add('option-btn--correct');
      } else {
        btn.classList.add('option-btn--incorrect');
      }
    });

    const q = QUESTIONS[s.idx];
    s.answers.push({ qIndex: s.idx, question: q.text, choice: null, correct: false, timeout: true });
    this.updateScoreboard();

    if (e.questionTimer) e.questionTimer.textContent = '⏳ 0s';
    this.sound.wrong();

    setTimeout(() => {
      if (!this.cheatingDetected) {
        s.idx += 1;
        this.render();
      }
    }, 1400);
  }

  handleFocusLoss() {
    if (this.state.locked || this.cheatingDetected || this.state.idx >= QUESTIONS.length) return;
    this.cheatingDetected = true;
    this.state.locked = true;

    if (this.e.status) this.e.status.textContent = '🛑 ¡ATENCIÓN! No cambies de pestaña.';
    if (this.e.hint) this.e.hint.textContent = 'La ronda ha sido invalidada por salir del juego.';

    [...this.e.options.querySelectorAll('.option-btn')].forEach(btn => {
      btn.disabled = true;
      btn.classList.add('option-btn--incorrect');
    });

    this.e.nextBtn.textContent = '❌ Reintentar';
    this.e.nextBtn.classList.remove('btn-primary');
    this.e.nextBtn.classList.add('btn-danger');
    if (this.e.nextBtn) this.e.nextBtn.classList.remove('d-none');
    this.sound.wrong();
  }

  bind() {
    this.e.nextBtn.addEventListener('click', () => this.next());
    this.e.returnBtn.addEventListener('click', () => this.redirectToRegistration());
    this.e.openTicketBtn.addEventListener('click', () => this.redirectToRegistration());
    this.e.playAgainBtn1.addEventListener('click', () => location.reload());
    this.e.playAgainBtn2.addEventListener('click', () => location.reload());
  }

  clock() {
    const tick = () => {
      const t = new Date(), hh = String(t.getHours()).padStart(2, '0'), mm = String(t.getMinutes()).padStart(2, '0');
      if (this.e.timer) this.e.timer.textContent = `⏰ ${hh}:${mm}`;
      setTimeout(tick, 10_000);
    }; tick();
  }

  redirectToRegistration() {
    // Redirigir al mapa principal en la vista de preparación
    const searchParams = new URLSearchParams(window.location.search);

    window.location.href = '../index.html?' + searchParams.toString();
  }

  async render() {
    const s = this.state, { e } = this;
    const pct = Math.min(100, (s.idx / QUESTIONS.length * 100));
    e.bar.style.width = pct + '%';

    if (this.cheatingDetected) {
      this.stopQuestionTimer();
      e.quizView.classList.add('d-none');
      e.finalView.classList.remove('d-none');
      e.finalTitle.textContent = '¡Ronda Invalidada!';
      e.finalMsg.textContent = 'Se detectó actividad sospechosa. Intenta de nuevo.';
      e.giftRow.classList.add('d-none');
      e.retryRow.classList.remove('d-none');
      e.finalPoints.textContent = s.points.toString();
      e.finalCorrect.textContent = s.correct.toString();
      e.finalTotal.textContent = QUESTIONS.length.toString();
      return;
    }

    if (s.idx >= QUESTIONS.length) {
      this.stopQuestionTimer();
      e.quizView.classList.add('d-none');
      e.finalView.classList.remove('d-none');
      e.finalTitle.textContent = 'Verificando resultados...';
      e.finalMsg.textContent = 'Por favor espera.';
      e.giftRow.classList.add('d-none');
      e.retryRow.classList.add('d-none');

      const isPassed = s.correct >= 7; // 70% or more
      const puntajeFinal = s.correct * 10;

      saveQuizResultLocal({
        puntaje_total: puntajeFinal,
        num_correctas: s.correct,
        num_preguntas: QUESTIONS.length
      });

      await endQuizInDB({
        puntaje_total: puntajeFinal,
        num_correctas: s.correct,
        num_preguntas: QUESTIONS.length
      });

      await guardarResultadoEstacionSupabase({
        puntaje_total: puntajeFinal,
        num_correctas: s.correct,
        num_preguntas: QUESTIONS.length,
        aprobado: isPassed
      });

      e.finalPoints.textContent = s.points.toString();
      e.finalCorrect.textContent = s.correct.toString();
      e.finalTotal.textContent = QUESTIONS.length.toString();

      if (isPassed) {
        e.finalTitle.textContent = '¡Felicidades! 🎉';
        e.finalMsg.textContent = `¡Estación completada con éxito! Lograste un ${Math.round(s.correct / QUESTIONS.length * 100)}% de respuestas correctas. Tu avatar ha avanzado a la siguiente estación.`;
        e.giftRow.classList.remove('d-none');
        e.retryRow.classList.add('d-none');

        // Avanzar avatar en el mapa
        localStorage.setItem('much_current_station', '6');
        let completed = JSON.parse(localStorage.getItem('much_completed_stations') || '{}');
        completed['5'] = true;
        localStorage.setItem('much_completed_stations', JSON.stringify(completed));
      } else {
        e.finalTitle.textContent = 'Buen intento 👀';
        e.finalMsg.textContent = `Lograste un ${Math.round(s.correct / QUESTIONS.length * 100)}%. Necesitas al menos 70% de aciertos para completar la estación y avanzar.`;
        e.giftRow.classList.add('d-none');
        e.retryRow.classList.remove('d-none');
      }
      return;
    }

    const q = QUESTIONS[s.idx];
    if (e.qIndex) e.qIndex.textContent = (s.idx + 1).toString();
    if (e.qText) e.qText.textContent = q.text;
    if (e.qDesc) e.qDesc.textContent = q.desc || '';
    if (e.status) e.status.textContent = '';
    if (e.options) e.options.innerHTML = '';
    s.selected = null; s.locked = false;

    q.options.forEach((label, i) => {
      const col = document.createElement('div'); col.className = 'col-12';
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'option-btn';
      btn.setAttribute('data-index', i);
      btn.innerHTML = `<span class="emoji">🔹</span><span>${label}</span>`;
      btn.addEventListener('click', () => this.choose(i));
      col.appendChild(btn); e.options.appendChild(col);
    });

    e.nextBtn.textContent = s.idx === QUESTIONS.length - 1 ? 'Finalizar 🎉' : 'Siguiente ➡️';
    this.updateScoreboard();
    if (e.hint) e.hint.textContent = 'Tip: solo puedes elegir una respuesta';
    this.startQuestionTimer();
  }

  choose(i) {
    const s = this.state, { e } = this;
    if (s.locked) return;
    if (this.cheatingDetected) return;

    this.stopQuestionTimer();
    s.locked = true; s.selected = i;
    const q = QUESTIONS[s.idx], correctIdx = q.correctIndex;
    [...e.options.querySelectorAll('.option-btn')].forEach((btn, idx) => {
      btn.disabled = true; btn.classList.remove('option-btn--correct', 'option-btn--incorrect');
      if (idx === correctIdx) btn.classList.add('option-btn--correct');
      if (idx === i && i !== correctIdx) btn.classList.add('option-btn--incorrect');
    });
    if (i === correctIdx) {
      if (e.status) e.status.textContent = '✅ ¡Correcto!';
      s.points += q.points; s.correct += 1;
      this.sound.correct(); this.confetti.launch(40);
    } else {
      if (e.status) e.status.textContent = '❌ ¡Incorrecto!';
      this.sound.wrong();
    }
    s.answers.push({ qIndex: s.idx, question: q.text, choice: q.options[i], correct: i === correctIdx });
    this.updateScoreboard();

    // Auto-advance after 3 seconds (3000ms)
    setTimeout(() => {
      if (!this.cheatingDetected) {
        s.idx += 1;
        this.render();
      }
    }, 3000);
  }

  next() {
    const s = this.state, { e } = this;
    if (this.cheatingDetected) { location.reload(); return; }
    if (s.selected === null) { if (e.status) e.status.textContent = '⚠️ Selecciona una respuesta.'; return; }
    e.nextBtn.disabled = true; setTimeout(() => { e.nextBtn.disabled = false; }, 180);
    s.idx += 1; this.render();
  }
}

/* =================== Arranque =================== */
const elements = {
  pillSala: document.getElementById('pillSala'),
  bar: document.getElementById('bar'),
  timer: document.getElementById('timer'),
  quizView: document.getElementById('quizView'),
  finalView: document.getElementById('finalView'),
  qIndex: document.getElementById('qIndex'),
  qTotal: document.getElementById('qTotal'),
  qText: document.getElementById('qText'),
  qDesc: document.getElementById('qDesc'),
  questionTimer: document.getElementById('questionTimer'),
  options: document.getElementById('options'),
  status: document.getElementById('status'),
  nextBtn: document.getElementById('nextBtn'),
  pointsEl: document.getElementById('points'),
  correctCount: document.getElementById('correctCount'),
  correctTotal: document.getElementById('correctTotal'),
  hint: document.getElementById('hint'),
  finalTitle: document.getElementById('finalTitle'),
  finalMsg: document.getElementById('finalMsg'),
  finalPoints: document.getElementById('finalPoints'),
  finalCorrect: document.getElementById('finalCorrect'),
  finalTotal: document.getElementById('finalTotal'),
  giftRow: document.getElementById('giftRow'),
  retryRow: document.getElementById('retryRow'),
  openTicketBtn: document.getElementById('openTicketBtn'),
  returnBtn: document.getElementById('returnBtn'),
  playAgainBtn1: document.getElementById('playAgainBtn1'),
  playAgainBtn2: document.getElementById('playAgainBtn2'),
  soundToggle: document.getElementById('soundToggle'),
  logoEmoji: document.getElementById('logoEmoji'),
};

const sound = new SoundFX(elements.soundToggle || null);
const confetti = new Confetti(document.getElementById('confetti'));

document.addEventListener('DOMContentLoaded', () => {
  const welcome = document.getElementById('welcome');
  const quizShell = document.getElementById('quizShell');
  const startBtn = document.getElementById('startBtn');
  const prizeMgr = new PrizeManager();

  const start = async () => {
    try {
      await loadPreguntas();
      startQuizInDB();
      if (welcome) welcome.classList.add('hidden');
      if (quizShell) quizShell.classList.remove('hidden');
      new UIManager({ elements, sound, confetti, prizeMgr });
    } catch (err) {
      console.error('No se pudo iniciar el quiz:', err);
    }
  };

  if (startBtn && welcome) {
    startBtn.addEventListener('click', (e) => { e.preventDefault(); start(); });
  } else {
    start();
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
    let currentStationId = localStorage.getItem('much_current_station') || '5';
    
    // Si estamos en biodiversidad, forzamos la estación 3
    if (window.location.pathname.includes('SALA-Biodiversidad-y-Conocimiento')) {
      currentStationId = '3';
    } else if (window.location.pathname.includes('Juego_Spinosaurio')) {
      currentStationId = '2';
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

  initMiniMap();
});
