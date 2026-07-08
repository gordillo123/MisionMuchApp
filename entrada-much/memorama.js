/**
 * Memorama del MUCH — Estación 1
 * Reemplaza la trivia anterior manteniendo integración con progreso y puntaje.
 */
(function () {
  'use strict';

  const STATION_ID = '1';
  const STATION_POINTS = 10;
  const TIME_LIMIT_SEC = 60; // 1 minuto
  const NUM_PAIRS = 6;

  const CARD_PAIRS = [
    { id: 'dino', emoji: '🦴', label: 'Fósil' },
    { id: 'planeta', emoji: '🪐', label: 'Planeta' },
    { id: 'micro', emoji: '🔬', label: 'Microscopio' },
    { id: 'satelite', emoji: '🛰️', label: 'Satélite' },
    { id: 'boleto', emoji: '🎟️', label: 'Boleto MUCH' },
    { id: 'lupa', emoji: '🔍', label: 'Lupa' }
  ];

  const state = {
    cards: [],
    flipped: [],
    matched: 0,
    attempts: 0,
    score: 0,
    timeLeft: TIME_LIMIT_SEC,
    timerId: null,
    lockBoard: false,
    gameStarted: false,
    attemptId: null,
    completionSaved: false
  };

  const screens = {
    start: document.getElementById('screenStart'),
    game: document.getElementById('screenGame'),
    victory: document.getElementById('screenVictory'),
    fail: document.getElementById('screenFail'),
    alreadyDone: document.getElementById('screenAlreadyDone')
  };

  const els = {
    timer: document.getElementById('mmTimer'),
    score: document.getElementById('mmScore'),
    attempts: document.getElementById('mmAttempts'),
    board: document.getElementById('mmBoard'),
    victoryPoints: document.getElementById('mmVictoryPoints'),
    victoryHost: document.getElementById('mmVictoryHost'),
    btnStart: document.getElementById('btnMemoramaStart'),
    btnContinue: document.getElementById('btnMemoramaContinue'),
    btnRetry: document.getElementById('btnMemoramaRetry'),
    btnBackStart: document.getElementById('btnBackStart'),
    btnBackGame: document.getElementById('btnBackGame'),
    btnBackDone: document.getElementById('btnBackDone')
  };

  // --- Utilidades ---
  function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      if (!el) return;
      el.classList.toggle('is-active', key === name);
    });
  }

  function goBackToMap() {
    window.location.href = '../index.html?view=prep';
  }

  function isStationCompleted() {
    if (window.MuchLocalStorage?.isStationCompleted) {
      return window.MuchLocalStorage.isStationCompleted(STATION_ID);
    }
    try {
      const completed = JSON.parse(localStorage.getItem('much_completed_stations') || '{}');
      return Boolean(completed[STATION_ID]);
    } catch (_) {
      return false;
    }
  }

  function playSound(type) {
    const map = {
      flip: null,
      match: null,
      win: '../Sonidos/Estacion completada.mp3',
      lose: '../Sonidos/respuesta incorrecta.mp3'
    };
    const src = map[type];
    if (!src) return;
    try {
      const audio = new Audio(src);
      audio.volume = 0.6;
      audio.play().catch(() => {});
    } catch (_) {}
  }

  // --- Base de datos ---
  function verifyStationActive() {
    import('../supabase-utils.js')
      .then((m) => m.comprobarEstacionActiva(Number(STATION_ID)))
      .then((active) => {
        if (!active) {
          alert('Esta estación se encuentra inactiva o cerrada.');
          goBackToMap();
        }
      })
      .catch((err) => console.warn('No se pudo verificar estación:', err));
  }

  async function startGameInDB() {
    try {
      const progreso = await import('../supabase-utils.js');
      await progreso.inicializarProgresoUsuario(Number(STATION_ID));
      const result = await progreso.guardarIntentoEstacion(Number(STATION_ID), {
        puntaje: 0,
        aciertos: 0,
        errores: 0,
        aprobado: false
      });
      if (result?.id_intento) {
        state.attemptId = result.id_intento;
        sessionStorage.setItem('much_current_attempt_id', result.id_intento);
      }
    } catch (err) {
      console.warn('[Memorama] Modo local — sin sincronización remota:', err);
    }
  }

  async function saveVictoryToDB(finalScore) {
    if (state.completionSaved) return;
    state.completionSaved = true;

    try {
      const progreso = await import('../supabase-utils.js');

      if (state.attemptId) {
        await progreso.actualizarIntentoEstacion(state.attemptId, {
          puntaje: finalScore,
          aciertos: NUM_PAIRS,
          errores: 0,
          aprobado: true
        });
      }

      await progreso.guardarProgresoUsuario(Number(STATION_ID), {
        puntaje: finalScore,
        aciertos: NUM_PAIRS,
        errores: 0,
        aprobada: true
      });
    } catch (err) {
      console.error('[Memorama] Error al guardar progreso:', err);
    }
  }

  // --- Juego ---
  function buildDeck() {
    const deck = [];
    CARD_PAIRS.slice(0, NUM_PAIRS).forEach((pair, index) => {
      deck.push({ uid: `${pair.id}-a`, pairId: pair.id, emoji: pair.emoji, label: pair.label });
      deck.push({ uid: `${pair.id}-b`, pairId: pair.id, emoji: pair.emoji, label: pair.label });
    });
    return shuffle(deck);
  }

  function renderBoard() {
    if (!els.board) return;
    els.board.innerHTML = '';

    state.cards.forEach((card, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mm-card';
      btn.dataset.index = String(index);
      btn.setAttribute('aria-label', 'Carta oculta');
      btn.innerHTML = `
        <div class="mm-card-inner">
          <div class="mm-card-face mm-card-back" aria-hidden="true">✨</div>
          <div class="mm-card-face mm-card-front">
            <span class="mm-card-emoji">${card.emoji}</span>
            <span class="mm-card-label">${card.label}</span>
          </div>
        </div>
      `;
      btn.addEventListener('click', () => flipCard(index));
      els.board.appendChild(btn);
    });
  }

  function updateStats() {
    if (els.timer) {
      els.timer.textContent = formatTime(state.timeLeft);
      const statBox = els.timer.closest('.mm-stat');
      if (statBox) {
        statBox.classList.toggle('time-warning', state.timeLeft <= 15);
      }
    }
    if (els.score) els.score.textContent = `${state.matched}/${NUM_PAIRS}`;
    if (els.attempts) els.attempts.textContent = String(state.attempts);
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    state.timerId = setInterval(() => {
      state.timeLeft -= 1;
      updateStats();
      if (state.timeLeft <= 0) {
        stopTimer();
        handleTimeUp();
      }
    }, 1000);
  }

  function flipCard(index) {
    if (state.lockBoard) return;
    const card = state.cards[index];
    const btn = els.board?.children[index];
    if (!card || !btn || btn.classList.contains('is-flipped') || btn.classList.contains('is-matched')) {
      return;
    }

    btn.classList.add('is-flipped');
    state.flipped.push({ index, card, btn });
    playSound('flip');

    if (state.flipped.length < 2) return;

    state.lockBoard = true;
    state.attempts += 1;
    updateStats();

    const [first, second] = state.flipped;

    if (first.card.pairId === second.card.pairId) {
      setTimeout(() => {
        first.btn.classList.add('is-matched');
        second.btn.classList.add('is-matched');
        state.matched += 1;
        updateStats();
        state.flipped = [];
        state.lockBoard = false;
        playSound('match');

        if (state.matched >= NUM_PAIRS) {
          handleVictory();
        }
      }, 400);
    } else {
      setTimeout(() => {
        first.btn.classList.remove('is-flipped');
        second.btn.classList.remove('is-flipped');
        state.flipped = [];
        state.lockBoard = false;
      }, 900);
    }
  }

  async function handleVictory() {
    stopTimer();
    state.gameStarted = false;
    const finalScore = STATION_POINTS;
    playSound('win');

    if (!isStationCompleted()) {
      await saveVictoryToDB(finalScore);
    }

    if (els.victoryPoints) {
      els.victoryPoints.textContent = `+${finalScore} puntos`;
    }

    showScreen('victory');

    if (els.victoryHost && window.MuchStationCompletion?.renderInline) {
      window.MuchStationCompletion.renderInline(els.victoryHost, {
        stationId: STATION_ID,
        nextStationId: '2',
        badge: 'Estación completada',
        title: '¡Muy bien!',
        body: 'Encontraste todos los pares y completaste la <strong>Estación 1</strong>. Tu memoria es increíble. ¡Sigue así y continúa el recorrido!',
        detailLabel: 'Puntos obtenidos',
        detailValue: `${finalScore} pts`,
        ctaLabel: 'CONTINUAR',
        onReturnToMap: goBackToMap
      });

      if (els.btnContinue) {
        els.btnContinue.style.display = 'none';
      }
    }
  }

  function handleTimeUp() {
    if (state.matched >= NUM_PAIRS) return;
    state.gameStarted = false;
    playSound('lose');

    window.MuchLocalStorage?.recordStationAttempt?.(STATION_ID, {
      aprobada: false,
      puntaje: 0,
      aciertos: state.matched,
      errores: 1
    }, { countAttempt: true });

    showScreen('fail');
  }

  function resetGameState() {
    stopTimer();
    state.cards = buildDeck();
    state.flipped = [];
    state.matched = 0;
    state.attempts = 0;
    state.score = 0;
    state.timeLeft = TIME_LIMIT_SEC;
    state.lockBoard = false;
    state.gameStarted = false;
    state.completionSaved = false;
    updateStats();
    renderBoard();
  }

  async function startGame() {
    if (isStationCompleted()) {
      showScreen('alreadyDone');
      return;
    }

    resetGameState();
    showScreen('game');
    state.gameStarted = true;
    await startGameInDB();
    startTimer();
  }

  function bindEvents() {
    els.btnStart?.addEventListener('click', () => startGame());
    els.btnRetry?.addEventListener('click', () => startGame());
    els.btnContinue?.addEventListener('click', goBackToMap);
    els.btnBackStart?.addEventListener('click', goBackToMap);
    els.btnBackGame?.addEventListener('click', () => {
      if (state.gameStarted && !confirm('¿Salir del memorama? Tu partida actual se perderá.')) return;
      stopTimer();
      goBackToMap();
    });
    els.btnBackDone?.addEventListener('click', goBackToMap);
  }

  function init() {
    verifyStationActive();
    bindEvents();
    updateStats();

    if (isStationCompleted()) {
      showScreen('alreadyDone');
    } else {
      startGame();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
