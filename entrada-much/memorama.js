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
    completionSaved: false,
    resultHandled: false,
    audioCtx: null
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
    failHost: document.getElementById('mmFailHost'),
    btnStart: document.getElementById('btnMemoramaStart'),
    btnContinue: document.getElementById('btnMemoramaContinue'),
    btnRetry: document.getElementById('btnMemoramaRetry'),
    btnBackStart: document.getElementById('btnBackStart'),
    btnBackGame: document.getElementById('btnBackGame'),
    btnBackBottom: document.getElementById('btnBackBottom'),
    btnBackVictory: document.getElementById('btnBackVictory'),
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

  function unlockAudio() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      const ctx = state.audioCtx || new AudioCtx();
      state.audioCtx = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      return ctx;
    } catch (_) {
      return null;
    }
  }

  function playSound(type) {
    try {
      const ctx = unlockAudio();
      if (!ctx) return;

      const now = ctx.currentTime + 0.01;
      const master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);

      const playTone = (freq, start, duration, volume, wave = 'sine') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain);
        gain.connect(master);
        osc.start(start);
        osc.stop(start + duration + 0.03);
      };

      const playCardBrush = (start, duration, volume) => {
        const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i += 1) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1700, start);
        filter.Q.setValueAtTime(0.95, start);
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        noise.buffer = buffer;
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        noise.start(start);
        noise.stop(start + duration);
      };

      if (type === 'flip') {
        playCardBrush(now, 0.07, 0.28);
        playTone(760, now + 0.014, 0.055, 0.08, 'triangle');
        return;
      }

      if (type === 'match') {
        playTone(988, now, 0.06, 0.16, 'square');
        playTone(1318, now + 0.05, 0.075, 0.15, 'square');
        playTone(1976, now + 0.11, 0.08, 0.08, 'triangle');
        return;
      }

      if (type === 'win') {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
          playTone(freq, now + index * 0.07, 0.16, 0.1, 'sine');
        });
        return;
      }

      if (type === 'lose') {
        playCardBrush(now, 0.055, 0.18);
        playTone(220, now, 0.08, 0.16, 'square');
        playTone(165, now + 0.08, 0.12, 0.14, 'square');
        playTone(110, now + 0.18, 0.16, 0.09, 'triangle');
      }
    } catch (_) {}
  }
  // --- Base de datos ---
  function verifyStationActive() {
    import('../mysql-utils.js')
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
      const progreso = await import('../mysql-utils.js');
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
    if (state.matched !== NUM_PAIRS) return;
    state.completionSaved = true;

    try {
      const progreso = await import('../mysql-utils.js');

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

  async function saveFailureToDB() {
    const payload = {
      puntaje: 0,
      aciertos: state.matched,
      errores: Math.max(1, NUM_PAIRS - state.matched),
      aprobado: false,
      finalizado: true
    };

    try {
      const progreso = await import('../mysql-utils.js');
      const result = state.attemptId
        ? await progreso.actualizarIntentoEstacion(state.attemptId, payload)
        : await progreso.guardarIntentoEstacion(Number(STATION_ID), payload);

      if (result) return window.MuchLocalStorage?.getStationAttemptInfo?.(STATION_ID) || result;
    } catch (err) {
      console.warn('[Memorama] No se pudo registrar intento fallido remoto:', err);
    }

    return window.MuchLocalStorage?.recordStationAttempt?.(STATION_ID, {
      ...payload,
      aprobada: false,
      id_intento: state.attemptId
    }, { countAttempt: true, countFailure: true, finalizado: true });
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

  function renderStandardResultMessage(target, options) {
    if (!target) return;
    try {
      if (window.MuchStationCompletion?.renderInline) {
        window.MuchStationCompletion.renderInline(target, options);
      }
    } catch (err) {
      console.warn('[Memorama] No se pudo renderizar el mensaje estándar:', err);
    }
    if (target.querySelector('.station-completion-card')) return;

    const passed = options.passed !== false;
    const title = passed ? '¡Excelente trabajo, explorador!' : 'Sigue intentando';
    const badge = passed ? 'Estación completada' : 'Intento fallido';
    const body = options.body || (passed
      ? 'Has completado <strong>Taquilla</strong> y sigues avanzando en tu misión MUCH.'
      : 'Tu misión MUCH continúa. Vuelve a intentarlo para completar esta estación.');
    const sealClass = passed ? 'station-completion-card__seal' : 'station-completion-card__seal station-completion-card__seal--fail';
    const seal = passed ? '&#10003;' : '&#10005;';
    const cta = options.ctaLabel || (passed ? 'Volver al mapa y continuar' : 'Volver al mapa');

    target.classList.add('station-completion-host');
    target.innerHTML = `
      <div class="station-completion-card">
        <div class="station-completion-card__head">
          <div class="${sealClass}" aria-hidden="true">${seal}</div>
          <div class="station-completion-card__intro">
            <div class="station-completion-card__kicker">${badge}</div>
            <h3 class="station-completion-card__title">${title}</h3>
          </div>
        </div>
        <p class="station-completion-card__body">${body}</p>
        <div class="station-completion-card__actions">
          <button type="button" class="station-completion-cta">${cta}</button>
        </div>
      </div>
    `;
    target.querySelector('.station-completion-cta')?.addEventListener('click', () => {
      if (typeof options.onReturnToMap === 'function') options.onReturnToMap();
      else goBackToMap();
    });
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
        playSound('lose');
        first.btn.classList.remove('is-flipped');
        second.btn.classList.remove('is-flipped');
        state.flipped = [];
        state.lockBoard = false;
      }, 900);
    }
  }

  function hasCompletedMemoramaOnTime() {
    const paresEncontrados = state.matched;
    const totalPares = NUM_PAIRS;
    return paresEncontrados === totalPares && state.timeLeft > 0;
  }

  async function handleVictory() {
    if (state.resultHandled) return;
    if (!hasCompletedMemoramaOnTime()) {
      handleTimeUp();
      return;
    }

    stopTimer();
    state.gameStarted = false;
    state.resultHandled = true;
    const finalScore = STATION_POINTS;
    playSound('win');

    if (!isStationCompleted()) await saveVictoryToDB(finalScore);

    showScreen('victory');
    if (els.victoryHost) {
      renderStandardResultMessage(els.victoryHost, {
        stationId: STATION_ID,
        nextStationId: '2',
        puntaje: finalScore,
        aciertos: NUM_PAIRS,
        errores: 0,
        silentSound: true,
        onReturnToMap: goBackToMap
      });
      if (els.btnContinue) els.btnContinue.style.display = 'none';
    }
  }

  function formatRetryBody(attemptInfo) {
    const currentInfo = window.MuchLocalStorage?.getStationAttemptInfo?.(STATION_ID) || attemptInfo || {};
    const remaining = Number(currentInfo?.intentos_restantes ?? Math.max(0, 3 - Number(currentInfo?.intentos_fallidos || 0)));
    if (remaining > 0) {
      return 'Tu misión MUCH continúa. No completaste todos los pares a tiempo. Puedes volver a intentarlo.';
    }
    const dateValue = currentInfo?.fecha_puede_volver_jugar || currentInfo?.fecha_puede_volver || '';
    const date = dateValue ? new Date(dateValue) : null;
    const dateText = date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'full', timeStyle: 'short' }).format(date)
      : 'la fecha indicada por el sistema';
    return `Has agotado tus 3 intentos del recorrido. Podrás volver a jugar el <strong>${dateText}</strong>.`;
  }

  async function handleTimeUp() {
    if (state.resultHandled) return;
    if (hasCompletedMemoramaOnTime()) return;
    stopTimer();
    state.gameStarted = false;
    state.resultHandled = true;
    playSound('lose');

    const attemptInfo = await saveFailureToDB();
    const remaining = Number(attemptInfo?.intentos_restantes ?? Math.max(0, 3 - Number(attemptInfo?.intentos_fallidos || 0)));

    showScreen('fail');
    if (els.failHost) {
      renderStandardResultMessage(els.failHost, {
        stationId: STATION_ID,
        passed: false,
        puntaje: 0,
        aciertos: state.matched,
        errores: Math.max(1, NUM_PAIRS - state.matched),
        body: formatRetryBody(attemptInfo),
        ctaLabel: remaining > 0 ? 'Reintentar' : 'Volver al mapa',
        silentSound: true,
        onReturnToMap: remaining > 0 ? startGame : goBackToMap
      });
    }
    if (els.btnRetry) els.btnRetry.style.display = 'none';
    if (remaining <= 0 && window.MuchLocalStorage?.blockByFailedAttempts && attemptInfo && !attemptInfo.bloqueada) {
      window.MuchLocalStorage.blockByFailedAttempts(STATION_ID, attemptInfo);
    }
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
    state.attemptId = null;
    state.completionSaved = false;
    state.resultHandled = false;
    [els.victoryHost, els.failHost].forEach((host) => {
      if (!host) return;
      if (window.MuchStationCompletion?.clearInline) window.MuchStationCompletion.clearInline(host);
      else {
        host.classList.remove('station-completion-host');
        host.innerHTML = '';
      }
    });
    updateStats();
    renderBoard();
  }

  async function startGame() {
    unlockAudio();
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
    document.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
    document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
    els.btnStart?.addEventListener('click', () => startGame());
    els.btnRetry?.addEventListener('click', () => startGame());
    els.btnContinue?.addEventListener('click', goBackToMap);
    els.btnBackStart?.addEventListener('click', goBackToMap);
    els.btnBackGame?.addEventListener('click', () => {
      if (state.gameStarted && !confirm('¿Salir del memorama? Tu partida actual se perderá.')) return;
      stopTimer();
      goBackToMap();
    });
    els.btnBackBottom?.addEventListener('click', () => {
      if (state.gameStarted && !confirm('¿Salir del memorama? Tu partida actual se perderá.')) return;
      stopTimer();
      goBackToMap();
    });
    els.btnBackVictory?.addEventListener('click', goBackToMap);
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

