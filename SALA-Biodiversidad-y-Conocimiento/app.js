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
    window.location.href = '../index.htmlÁreason=location_required&msg=' + encodeURIComponent(msg);
    throw new Error('Acceso denegado: ubicación no válida.');
  }
})();

/* =================== Datos de Configuración =================== */
const params = new URLSearchParams(location.search);
const SALA = params.get('sala') || 'biodiversidad';
const STATION_KEY = (SALA || 'biodiversidad').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');


// 🛡️ BLINDAJE NIVEL DIOS: Guardar en memoria PERMANENTE
const LUGAR_EN_URL = (params.get('lugar') || '').trim();
if (LUGAR_EN_URL) {
  localStorage.setItem('much_lugar_seguro', LUGAR_EN_URL);
} else {
  localStorage.removeItem('much_lugar_seguro');
}
const LUGAR_QR = LUGAR_EN_URL || 'Sin Especificar';

const NUM_QUESTIONS = 10;
const QUESTION_SECONDS = 15;
const BIODIVERSIDAD_REQUIRED_QUESTIONS = [
  {
    id: 'biodiversidad-dispersion-semillas-mono-arana',
    sala: 'biodiversidad',
    text: '¿Cuál de los siguientes animales ayuda a dispersar semillas?',
    options: ['Mono araña', 'Cocodrilo', 'Tortuga marina', 'Tiburón'],
    correctIndex: 0,
    points: 10,
    _biodiversityRequired: true
  },
  {
    id: 'biodiversidad-no-dispersa-semillas-tiburon',
    sala: 'biodiversidad',
    text: '¿Cuál de los siguientes animales no ayuda a dispersar semillas?',
    options: ['Tucán', 'Murciélago frugívoro', 'Mono araña', 'Tiburón'],
    correctIndex: 3,
    points: 10,
    _biodiversityRequired: true
  },
  {
    id: 'biodiversidad-serpiente-no-importancia-medica-mazacuata',
    sala: 'biodiversidad',
    text: '¿Cuál de las siguientes serpientes no es considerada de importancia médica?',
    options: ['Nauyaca', 'Coralillo', 'Cascabel', 'Mazacuata o boa'],
    correctIndex: 3,
    points: 10,
    _biodiversityRequired: true
  }
];
const BIODIVERSIDAD_OPTIONAL_STATION_KEY = `${STATION_KEY}-complemento-v1`;
// Función para mezclar arrays
const shuffle = a => window.MuchQuestionPool?.shuffleArray
  ? window.MuchQuestionPool.shuffleArray(a)
  : a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);

function buildCorrectPositionPlan(count) {
  return shuffle(Array.from({ length: count }, (_, index) => index % 4));
}

function shuffleQuestionOptions(question, preferredCorrectIndex) {
  if (window.MuchQuestionPool?.shuffleQuestionOptions) {
    return window.MuchQuestionPool.shuffleQuestionOptions(question, preferredCorrectIndex);
  }

  let sourceCorrectIndex = Number(question.correctIndex);
  const optionItems = (question.options || []).map((label, index) => ({
    label,
    isCorrect: index === sourceCorrectIndex
  }));
  if (optionItems.length < 2) return question;
  if (!Number.isInteger(sourceCorrectIndex) || sourceCorrectIndex < 0 || sourceCorrectIndex >= optionItems.length) {
    sourceCorrectIndex = 0;
    optionItems[0].isCorrect = true;
  }

  const mixed = shuffle(optionItems);
  let correctIndex = mixed.findIndex(item => item.isCorrect);
  const targetIndex = preferredCorrectIndex % mixed.length;

  if (correctIndex >= 0 && correctIndex !== targetIndex) {
    const [correctItem] = mixed.splice(correctIndex, 1);
    mixed.splice(targetIndex, 0, correctItem);
    correctIndex = targetIndex;
  }

  return {
    ...question,
    options: mixed.map(item => item.label),
    correctIndex
  };
}

function distributeQuestionOptions(questions) {
  const positionPlan = buildCorrectPositionPlan(questions.length);
  return questions.map((question, index) => shuffleQuestionOptions(question, positionPlan[index]));
}

function cloneQuestion(question) {
  const copy = { ...question };
  if (Array.isArray(question?.options)) copy.options = question.options.slice();
  return copy;
}

function getQuestionText(question) {
  return question?.text ?? question?.pregunta ?? question?.enunciado ?? '';
}

function normalizeQuestionIdentity(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function sameQuestion(a, b) {
  const idA = String(a?.id || '').trim();
  const idB = String(b?.id || '').trim();
  if (idA && idB && idA === idB) return true;
  return normalizeQuestionIdentity(getQuestionText(a)) === normalizeQuestionIdentity(getQuestionText(b));
}

function mergeRequiredBiodiversityQuestions(bank) {
  const merged = Array.isArray(bank) ? bank.map(cloneQuestion) : [];

  BIODIVERSIDAD_REQUIRED_QUESTIONS.forEach((requiredQuestion) => {
    const existingIndex = merged.findIndex((question) => sameQuestion(question, requiredQuestion));
    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        id: merged[existingIndex].id || requiredQuestion.id,
        sala: merged[existingIndex].sala || requiredQuestion.sala,
        _biodiversityRequired: true
      };
      return;
    }

    merged.push(cloneQuestion(requiredQuestion));
  });

  return merged;
}

function buildBiodiversityQuestionDeck(questions) {
  if (window.MuchQuestionPool?.createQuestionDeck) {
    return window.MuchQuestionPool.createQuestionDeck({
      questions,
      stationKey: STATION_KEY,
      count: NUM_QUESTIONS,
      storage: window.localStorage,
      forceNew: !hasStationQuestionProgress(),
      preferDifficult: true
    });
  }

  return shuffle(questions).slice(0, NUM_QUESTIONS);
}

// Placeholder: Se llenará desde el JSON
let QUESTIONS = [];
// 🔒 BANDERA DE SEGURIDAD (Evita dobles registros al dar clic rápido)
let quizIniciando = false;

function clearStationQuestionDeck() {
  try {
    window.MuchQuestionPool?.clearQuestionDeck?.(STATION_KEY, window.localStorage, undefined, undefined, undefined, { preserveHistory: true });
    window.MuchQuestionPool?.clearQuestionDeck?.(BIODIVERSIDAD_OPTIONAL_STATION_KEY, window.localStorage, undefined, undefined, undefined, { preserveHistory: true });
  } catch (error) {
    console.warn('[question-pool] No se pudo limpiar el banco:', error);
  }
}

function hasStationQuestionProgress() {
  try {
    return sessionStorage.getItem(`much_quiz_progress_${SALA}`) !== null;
  } catch (error) {
    return false;
  }
}

class ProgressManager {
  constructor(storageKey) {
    this.storageKey = storageKey;
  }

  saveProgress(currentQuestionIndex) {
    const safeIndex = Number.isInteger(currentQuestionIndex) && currentQuestionIndex >= 0 ? currentQuestionIndex : 0;
    sessionStorage.setItem(this.storageKey, String(safeIndex));
  }

  loadProgress() {
    const raw = sessionStorage.getItem(this.storageKey);
    if (raw === null) return null;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 0) return null;
    return parsed;
  }

  resetProgress() {
    sessionStorage.removeItem(this.storageKey);
  }
}

class PrizeManager {
  constructor() {}
}


/* ================================================================= */
/* ==== MYSQL: CONEXION Y LOGICA DE BASE DE DATOS ================== */
/* ================================================================= */

const MYSQL_ESTACION_ID = 3;

// Background music helpers
function ensureBgMusic() {
  try { if (!window.bgMusic) { window.bgMusic = new Audio('../Sonidos/musica fondo.mp3'); window.bgMusic.loop = true; window.bgMusic.volume = 0.18; window.bgMusic.preload = 'auto'; } } catch (e) {}
}
function playBgMusic() { try { pauseBgMusic(); } catch (e) {} }
function pauseBgMusic() { try { if (window.bgMusic && !window.bgMusic.paused) window.bgMusic.pause(); } catch (e) {} }

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

async function guardarResultadoEstacionMySQL({ puntaje_total, num_correctas, num_preguntas, aprobado }) {
  try {
    const progreso = await import('../mysql-utils.js');
    const estacionId = MYSQL_ESTACION_ID;

    const attemptId = sessionStorage.getItem('much_current_attempt_id');
    if (!attemptId) {
      await progreso.guardarIntentoEstacion(estacionId, {
        aciertos: num_correctas,
        errores: Math.max(0, num_preguntas - num_correctas),
        puntaje: puntaje_total,
        aprobado
      });
    }

    // Pasar parámetros al primer nivel directamente
    await progreso.guardarProgresoUsuario(estacionId, {
      puntaje: puntaje_total,
      aciertos: num_correctas,
      errores: Math.max(0, num_preguntas - num_correctas),
      aprobada: aprobado
    });
  } catch (error) {
    console.error('[MySQL DB] No se pudo guardar biodiversidad:', error);
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
  console.log('[loadPreguntas] Iniciando carga...');
  try {
    let bank = [];
    
    // 1. Intentar Banco Local (preguntas-local.js) primero
    if (window.MUCH_PREGUNTAS_BIODIVERSIDAD && Array.isArray(window.MUCH_PREGUNTAS_BIODIVERSIDAD)) {
      bank = window.MUCH_PREGUNTAS_BIODIVERSIDAD;
      console.log('[loadPreguntas] Usando banco local (preguntas-local.js). Total:', bank.length);
    } else {
      console.log('[loadPreguntas] Banco local no detectado, intentando fetch...');
      try {
        const resp = await fetch('preguntas.json', { cache: 'force-cache' });
        if (resp.ok) {
          bank = await resp.json();
          console.log('[loadPreguntas] Fetch exitoso. Total:', bank.length);
        }
      } catch (fErr) {
        console.warn('[loadPreguntas] Fetch falló (CORS o Red):', fErr);
      }
    }

    if (!Array.isArray(bank) || bank.length === 0) {
      console.error('[loadPreguntas] No se encontraron preguntas en ninguna fuente.');
      throw new Error('Sin preguntas disponibles');
    }

    bank = mergeRequiredBiodiversityQuestions(bank);

    const normalize = (it) => {
      const id = it.id ?? it.id_pregunta ?? it.codigo ?? '';
      const sala = it.sala ?? it.sala_codigo ?? it.estacion ?? it.station ?? '';
      const text = it.text ?? it.pregunta ?? it.enunciado ?? '¿...?';
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

      const points = it.points ?? it.puntos ?? 10;
      if (!Array.isArray(options) || options.length === 0) { options = ['(sin opciones)']; correctIndex = 0; }
      if (correctIndex == null || correctIndex < 0 || correctIndex >= options.length) { correctIndex = 0; }
      
      return {
        id: id ? String(id) : undefined,
        sala,
        text,
        options,
        correctIndex,
        points,
        desc,
        difficulty: it.difficulty ?? it.dificultad ?? it.nivel ?? it.level ?? it.reto ?? it.challenge,
        hard: it.hard ?? it.dificil ?? it._hard ?? it._challenge,
        _biodiversityRequired: Boolean(it._biodiversityRequired)
      };
    };

    // Filtrar por sala si aplica
    const filtered = bank.filter(q => 
      !q?.sala && !q?.sala_codigo && !q?.estacion && !q?.station
        ? true
        : (window.MuchQuestionPool?.questionMatchesStation
          ? window.MuchQuestionPool.questionMatchesStation(q, STATION_KEY)
          : (q.sala === SALA || q.sala_codigo === SALA))
    );

    const pool = filtered.length ? filtered : [];
    const normalized = pool.map(normalize);
    const selectedDeck = buildBiodiversityQuestionDeck(normalized);

    QUESTIONS = distributeQuestionOptions((selectedDeck || []).map((question) => ({ ...question })));
    
    console.log('[loadPreguntas] Finalizado. Preguntas seleccionadas:', QUESTIONS.length);
    return QUESTIONS;
  } catch (err) {
    console.error('[loadPreguntas] ERROR FATAL:', err);
    // Banco de emergencia último recurso
    QUESTIONS = [{ text: 'Error al cargar preguntas. Revisa la consola.', options: ['Reintentar'], correctIndex: 0, points: 0, desc: '' }];
    return QUESTIONS;
  }
}

// ------------------------------------------------------------
// 2. GESTIÓN DE PARTIDAS (DB TRACKING)
// ------------------------------------------------------------

async function startQuizInDB() {
  if (quizIniciando) return sessionStorage.getItem('much_current_attempt_id');
  quizIniciando = true;

  try {
    const progreso = await import('../mysql-utils.js');
    const estacionId = 3; // Biodiversidad

    sessionStorage.removeItem('much_current_attempt_id');
    sessionStorage.removeItem('much_quiz_final_data');

    // 1. Inicializar progreso de usuario en MySQL
    await progreso.inicializarProgresoUsuario(estacionId);

    // 2. Registrar el intento inicial en intentos_estacion
    const result = await progreso.guardarIntentoEstacion(estacionId, {
      puntaje: 0,
      aciertos: 0,
      errores: 0,
      aprobado: false
    });

    if (!result?.id_intento) {
      console.info('[Sync] Intento remoto no disponible; el quiz continúa en modo local.');
      quizIniciando = false;
      return null;
    }

    console.log("✅ Intento iniciado en MySQL. ID Intento:", result.id_intento);

    sessionStorage.setItem('much_current_attempt_id', result.id_intento);
    return result.id_intento;

  } catch (e) {
    console.error("Excepción al iniciar quiz en MySQL:", e);
    quizIniciando = false;
    return null;
  }
}

async function endQuizInDB({ puntaje_total, num_correctas, num_preguntas }) {
  saveQuizResultLocal({ puntaje_total, num_correctas, num_preguntas });

  try {
    const progreso = await import('../mysql-utils.js');
    const attemptId = sessionStorage.getItem('much_current_attempt_id');
    if (!attemptId) return;

    console.log(`🏁 Finalizando intento ${attemptId} en MySQL...`);

    const isPassed = num_correctas >= 7;

    await progreso.actualizarIntentoEstacion(attemptId, {
      puntaje: puntaje_total,
      aciertos: num_correctas,
      errores: Math.max(0, num_preguntas - num_correctas),
      aprobado: isPassed
    });

    console.log("✅ Intento actualizado en MySQL al finalizar.");

  } catch (e) { console.warn('Error endQuizInDB en MySQL:', e); }
}

// Fallback Functions
function startQuizLocal() {
  if (sessionStorage.getItem('much_quiz_start')) return;
  const startTime = getMexicoTime();
  sessionStorage.setItem('much_quiz_start', startTime);
}

function saveQuizResultLocal(data) {
  const startTime = sessionStorage.getItem('much_quiz_start') || getMexicoTime();
  const quizData = { ...data, id_estacion: MYSQL_ESTACION_ID, started_at: startTime, finished_at: getMexicoTime() };

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
  victory() {
    if (this.toggleEl && !this.toggleEl.checked) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = this.ctx || new AudioCtx();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const now = this.ctx.currentTime + 0.02;
    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.22, now + 0.06);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
    master.connect(this.ctx.destination);

    [
      [523.25, 0.00, 0.16], [659.25, 0.18, 0.16], [783.99, 0.36, 0.22],
      [1046.50, 0.64, 0.30], [783.99, 1.02, 0.16], [1046.50, 1.20, 0.42],
      [1318.51, 1.72, 0.52], [261.63, 0.00, 0.72], [329.63, 0.00, 0.72],
      [392.00, 0.00, 0.72], [349.23, 0.82, 0.72], [440.00, 0.82, 0.72],
      [523.25, 0.82, 0.72], [392.00, 1.62, 1.00], [493.88, 1.62, 1.00],
      [659.25, 1.62, 1.00]
    ].forEach(note => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = note[0] < 500 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(note[0], now + note[1]);
      gain.gain.setValueAtTime(0.0001, now + note[1]);
      gain.gain.exponentialRampToValueAtTime(note[0] < 500 ? 0.08 : 0.18, now + note[1] + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note[1] + note[2]);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now + note[1]);
      osc.stop(now + note[1] + note[2] + 0.05);
    });
  }
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
    this.progressManager = new ProgressManager(`much_quiz_progress_${SALA}`);
    this.state = { idx: 0, selected: null, points: 0, correct: 0, locked: false, answers: [] };
    this.currentQuestionDeadline = null;
    const savedIndex = this.progressManager.loadProgress();
    if (savedIndex !== null && savedIndex < QUESTIONS.length) {
      this.state.idx = savedIndex;
    } else if (savedIndex !== null && savedIndex >= QUESTIONS.length) {
      this.progressManager.resetProgress();
    }
    this.currentPrize = null;
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
    window.addEventListener('pagehide', () => this.handlePageHide());
    window.addEventListener('beforeunload', () => this.handlePageHide());
  }

  goBackToMap() {
    try {
      if (this.e && this.e.returnBtn) {
        this.e.returnBtn.classList.add('pressed');
        setTimeout(() => this.e.returnBtn.classList.remove('pressed'), 160);
      }
      if (this.sound && typeof this.sound.beep === 'function') this.sound.beep(640, 0.06, 'sine', 0.06);
    } catch (e) { }

    setTimeout(() => {
      window.location.href = '../index.html?view=prep';
    }, 180);
  }

  updateScoreboard() {
    const s = this.state;
    if (this.e.pointsEl) this.e.pointsEl.textContent = s.points.toString();
    if (this.e.correctCount) this.e.correctCount.textContent = s.correct.toString();
    if (this.e.correctTotal) this.e.correctTotal.textContent = QUESTIONS.length.toString();
  }

  playCompletionSound() {
    try {
      const audio = new Audio('../Sonidos/Estación completada.mp3');
      audio.play().catch(e => console.warn('No se pudo reproducir audio de completado:', e));
    } catch (e) {
      console.warn('Error al reproducir audio:', e);
    }
  }

  playIncorrectSound() {
    try {
      const audio = new Audio('../Sonidos/respuesta incorrecta.mp3');
      audio.play().catch(e => console.warn('No se pudo reproducir audio de incorrecto:', e));
    } catch (e) {
      console.warn('Error al reproducir audio:', e);
    }
  }

  startFocusDetection() {
    window.addEventListener('blur', () => {
      this.markAsIncorrectCheat();
    }, { passive: true });
    
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.markAsIncorrectCheat();
      }
    });
  }

  async markAsIncorrectCheat() {
    const s = this.state, { e } = this;
    if (s.locked || s.idx >= QUESTIONS.length) return;

    this.stopQuestionTimer();
    s.locked = true;
    s.selected = -1; // -1 indica trampa / foco perdido
    const q = QUESTIONS[s.idx], correctIdx = q.correctIndex;
    
    [...e.options.querySelectorAll('.option-btn')].forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === correctIdx) btn.classList.add('option-btn--correct');
    });

    if (e.status) e.status.textContent = '❌ ¡Incorrecto! (Se detectó cambio de pantalla)';
    this.playIncorrectSound();
    
    s.answers.push({ qIndex: s.idx, question: q.text, choice: 'Trampa (Foco perdido)', correct: false });
    this.updateScoreboard();

    // Guardar respuesta de trampa en tiempo real en la base de datos
    try {
      const attemptId = sessionStorage.getItem('much_current_attempt_id');
      if (attemptId) {
        const progreso = await import('../mysql-utils.js');
        await progreso.guardarRespuestaUsuario(attemptId, 3, q.text, 'Trampa (Foco perdido)', false);
      }
    } catch (err) {
      console.error("Error al guardar respuesta de trampa:", err);
    }

    // Incrementar contador de trampas
    let cheatCount = Number(sessionStorage.getItem('much_cheat_count') || '0') + 1;
    sessionStorage.setItem('much_cheat_count', String(cheatCount));

    if (cheatCount >= 2) {
      this.blockCheatScreen();
    } else {
      setTimeout(() => {
        this.advanceToNextQuestion();
      }, 3000);
    }
  }

  async blockCheatScreen() {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "#b91c1c";
    overlay.style.color = "#fff";
    overlay.style.zIndex = "99999";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "20px";
    overlay.style.textAlign = "center";
    overlay.style.fontFamily = "'Outfit', sans-serif";
    document.body.appendChild(overlay);

    overlay.innerHTML = `
      <h1 style="font-size: clamp(24px, 6vw, 42px); font-weight: 900; margin-bottom: 12px; letter-spacing: 1px;">🚫 PANTALLA BLOQUEADA</h1>
      <p style="font-size: clamp(16px, 4vw, 22px); max-width: 600px; line-height: 1.4; margin-bottom: 20px;">
        Se ha detectado cambio de pantalla de manera persistente. Los puntos de esta estación han sido invalidados.
      </p>
      <div style="font-size: clamp(30px, 8vw, 48px); font-weight: 900;" id="cheatCountdown">15 s</div>
    `;

    // Registrar intento fallido sin borrar una palomita ya ganada.
    try {
      window.MuchLocalStorage?.recordStationAttempt?.('3', {
        aprobada: false,
        puntaje: 0,
        aciertos: 0,
        errores: QUESTIONS.length
      }, { countAttempt: true });
      
      const progreso = await import('../mysql-utils.js');
      await progreso.guardarProgresoUsuario('3', {
        puntaje: 0,
        aciertos: 0,
        errores: QUESTIONS.length,
        aprobada: false
      });
    } catch (e) {
      console.warn('Error al invalidar estación por trampa:', e);
    }

    let seconds = 15;
    const interval = setInterval(() => {
      seconds--;
      const cd = document.getElementById("cheatCountdown");
      if (cd) cd.textContent = seconds + " s";
      if (seconds <= 0) {
        clearInterval(interval);
        this.progressManager.resetProgress();
        location.reload();
      }
    }, 1000);
  }

  handlePageHide() {
    this.progressManager.resetProgress();
  }

  updateQuestionTimerDisplay() {
    if (!this.e.questionTimer) return;
    this.e.questionTimer.textContent = `⏳ ${this.questionCountdown} s`;
    this.e.questionTimer.classList.toggle('low', this.questionCountdown <= 5 && this.questionCountdown > 3);
    this.e.questionTimer.classList.toggle('urgent', this.questionCountdown <= 3);
  }

  stopQuestionTimer() {
    if (this.questionTimer) {
      clearTimeout(this.questionTimer);
      this.questionTimer = null;
    }
  }

  persistCurrentQuestionProgress() {
    this.progressManager.saveProgress(this.state.idx);
  }

  createQuestionDeadline() {
    // Siempre crear un nuevo deadline desde cero (15 segundos)
    this.currentQuestionDeadline = Date.now() + (QUESTION_SECONDS * 1000);
    this.persistCurrentQuestionProgress();
  }

  startQuestionTimer() {
    this.stopQuestionTimer();
    // Siempre crear un nuevo deadline al iniciar el timer
    this.createQuestionDeadline();

    const tick = () => {
      const remainingMs = this.currentQuestionDeadline - Date.now();
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      this.questionCountdown = remainingSeconds;
      this.updateQuestionTimerDisplay();

      if (remainingMs <= 0) {
        this.handleQuestionTimeout();
        return;
      }
      this.questionTimer = setTimeout(tick, 250);
    };

    tick();
  }

  advanceToNextQuestion() {
    const s = this.state;
    s.idx += 1;
    if (s.idx >= QUESTIONS.length) {
      this.currentQuestionDeadline = null;
      this.progressManager.resetProgress();
      this.render();
      return;
    }
    // El nuevo deadline se creará en render() cuando se llame startQuestionTimer()
    this.render();
  }

  handleQuestionTimeout() {
    const s = this.state, { e } = this;
    if (s.locked || s.idx >= QUESTIONS.length) return;
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

    // Guardar respuesta en la base de datos en tiempo real (Timeout)
    (async () => {
      try {
        const attemptId = sessionStorage.getItem('much_current_attempt_id');
        if (attemptId) {
          const progreso = await import('../mysql-utils.js');
          await progreso.guardarRespuestaUsuario(attemptId, 3, q.text, "Tiempo agotado", false);
        }
      } catch (err) {
        console.error("Error al guardar respuesta de timeout en tiempo real:", err);
      }
    })();

    if (e.questionTimer) e.questionTimer.textContent = '⏳ 0 s';
    this.sound.wrong();

    setTimeout(() => {
      this.advanceToNextQuestion();
    }, 1400);
  }

  handleFocusLoss() {
    // Anti-trampas desactivado.
  }

  bind() {
    this.e.nextBtn.addEventListener('click', () => this.next());
    this.e.returnBtn.addEventListener('click', () => this.goBackToMap());
    this.e.nextStationBtn.addEventListener('click', () => this.goBackToMap());
    this.e.playAgainBtn1.addEventListener('click', () => {
      clearStationQuestionDeck();
      this.progressManager.resetProgress();
      location.reload();
    });
    this.e.playAgainBtn2.addEventListener('click', () => {
      clearStationQuestionDeck();
      this.progressManager.resetProgress();
      location.reload();
    });
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

  redirectToNextStation(nextUrl, delay = 3000) {
    const target = new URL(nextUrl, window.location.href);
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.forEach((value, key) => {
      if (!target.searchParams.has(key)) target.searchParams.set(key, value);
    });

    setTimeout(() => {
      window.location.href = target.href;
    }, delay);
  }

  clearAutoTransition() {
    if (this.autoTransitionTimer) {
      clearTimeout(this.autoTransitionTimer);
      this.autoTransitionTimer = null;
    }
    if (this.autoTransitionInterval) {
      clearInterval(this.autoTransitionInterval);
      this.autoTransitionInterval = null;
    }
  }

  startAutoTransition(message, seconds, onComplete, tone = 'success') {
    const note = this.e.finalAutoNote;
    this.clearAutoTransition();
    if (!note) {
      this.autoTransitionTimer = setTimeout(onComplete, seconds * 1000);
      return;
    }

    let remaining = seconds;
    note.classList.remove('d-none', 'station-auto-note--retry');
    note.classList.toggle('station-auto-note--retry', tone === 'retry');

    const updateLabel = () => {
      note.innerHTML = `${message} <strong>${remaining} s</strong>`;
    };

    updateLabel();
    this.autoTransitionInterval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(this.autoTransitionInterval);
        this.autoTransitionInterval = null;
        return;
      }
      updateLabel();
    }, 1000);

    this.autoTransitionTimer = setTimeout(() => {
      this.clearAutoTransition();
      onComplete();
    }, seconds * 1000);
  }

  async render() {
    const s = this.state, { e } = this;
    const pct = Math.min(100, (s.idx / QUESTIONS.length * 100));
    e.bar.style.width = pct + '%';

    // Pause bg music while answering; resume when round ends
    try {
      if (s.idx < QUESTIONS.length) { pauseBgMusic(); }
      if (s.idx >= QUESTIONS.length) { playBgMusic(); }
    } catch (e) {}

    if (e.finalAutoNote) {
      e.finalAutoNote.classList.add('d-none');
      e.finalAutoNote.classList.remove('station-auto-note--retry');
      e.finalAutoNote.innerHTML = '';
    }

    if (s.idx >= QUESTIONS.length) {
      clearStationQuestionDeck();
      this.progressManager.resetProgress();
      this.stopQuestionTimer();
      e.quizView.classList.add('d-none');
      e.finalView.classList.remove('d-none');
      e.finalTitle.classList.remove('visually-hidden');
      e.finalTitle.textContent = 'Verificando resultados...';
      window.MuchStationCompletion?.clearInline(e.finalMsg, 'Por favor espera.');
      e.giftRow.classList.add('d-none');
      e.retryRow.classList.add('d-none');
      this.clearAutoTransition();

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

      await guardarResultadoEstacionMySQL({
        puntaje_total: puntajeFinal,
        num_correctas: s.correct,
        num_preguntas: QUESTIONS.length,
        aprobado: isPassed
      });

      e.finalPoints.textContent = s.points.toString();
      e.finalCorrect.textContent = s.correct.toString();
      e.finalTotal.textContent = QUESTIONS.length.toString();

      if (isPassed) {
        window.MuchStationCompletion?.renderInline(e.finalMsg, {
          stationId: '3',
          nextStationId: '4',
          onReturnToMap: () => {
            window.location.href = '../index.html?view=prep';
          }
        });
        e.finalTitle.classList.add('visually-hidden');
        e.giftRow.classList.add('d-none');
        e.retryRow.classList.add('d-none');
        this.sound.victory();
        this.playCompletionSound();
        try { playBgMusic(); } catch (e) {}
        // Avanzar avatar en el mapa
        localStorage.setItem('much_current_station', '4');
        let completed = JSON.parse(localStorage.getItem('much_completed_stations') || '{}');
        completed['3'] = true;
        localStorage.setItem('much_completed_stations', JSON.stringify(completed));
      } else {
        window.MuchLocalStorage?.recordStationAttempt?.('3', {
          aprobada: false,
          puntaje: 0,
          aciertos: s.correct || 0,
          errores: Math.max(0, QUESTIONS.length - (s.correct || 0))
        }, { countAttempt: true });

        e.finalTitle.classList.remove('visually-hidden');
        e.finalTitle.textContent = 'Sigue explorando ✨';
        window.MuchStationCompletion?.clearInline(
          e.finalMsg,
          `Lograste un ${Math.round(s.correct / QUESTIONS.length * 100)} %. Aún no completas esta estación, pero cada intento te acerca más. Presiona «Intentar de nuevo» cuando quieras seguir explorando.`
        );
        e.giftRow.classList.add('d-none');
        e.retryRow.classList.remove('d-none');
        this.playIncorrectSound();
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
    if (e.hint) e.hint.textContent = 'Consejo: solo puedes elegir una respuesta.';
    this.startQuestionTimer();
  }

  choose(i) {
    const s = this.state, { e } = this;
    if (s.locked) return;

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

    // Guardar respuesta en la base de datos en tiempo real
    (async () => {
      try {
        const attemptId = sessionStorage.getItem('much_current_attempt_id');
        if (attemptId) {
          const progreso = await import('../mysql-utils.js');
          await progreso.guardarRespuestaUsuario(attemptId, 3, q.text, q.options[i], i === correctIdx);
        }
      } catch (err) {
        console.error("Error al guardar respuesta en tiempo real:", err);
      }
    })();

    // Auto-advance after 3 seconds (3000ms)
    setTimeout(() => {
      this.advanceToNextQuestion();
    }, 3000);
  }

  next() {
    const s = this.state, { e } = this;
    if (s.selected === null) { if (e.status) e.status.textContent = '⚠️ Selecciona una respuesta.'; return; }
    e.nextBtn.disabled = true; setTimeout(() => { e.nextBtn.disabled = false; }, 180);
    this.advanceToNextQuestion();
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
  finalAutoNote: document.getElementById('finalAutoNote'),
  giftRow: document.getElementById('giftRow'),
  retryRow: document.getElementById('retryRow'),
  nextStationBtn: document.getElementById('nextStationBtn'),
  returnBtn: document.getElementById('returnBtn'),
  playAgainBtn1: document.getElementById('playAgainBtn1'),
  playAgainBtn2: document.getElementById('playAgainBtn2'),
  soundToggle: document.getElementById('soundToggle'),
  logoEmoji: document.getElementById('logoEmoji'),
};

const sound = new SoundFX(elements.soundToggle || null);
const confetti = new Confetti(document.getElementById('confetti'));

function verifyStationActive(estacionId) {
  import('../mysql-utils.js')
    .then(progreso => progreso.comprobarEstacionActiva(estacionId))
    .then(active => {
      if (!active) {
        alert('Esta estación se encuentra inactiva o cerrada.');
        window.location.href = '../index.html';
      }
    })
    .catch(err => console.warn('No se pudo verificar el estado de la estación:', err));
}

document.addEventListener('DOMContentLoaded', () => {
  const welcome = document.getElementById('welcome');
  const quizShell = document.getElementById('quizShell');
  const startBtn = document.getElementById('startBtn');
  const prizeMgr = new PrizeManager();

  const start = async () => {
    try {
      verifyStationActive(3);
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
    let currentStationId = localStorage.getItem('much_current_station') || '3';
    
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

