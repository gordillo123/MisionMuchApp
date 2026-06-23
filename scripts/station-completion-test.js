/**
 * HERRAMIENTA TEMPORAL DE PRUEBAS
 *
 * Simula el recorrido terminado solo en el navegador y conserva una copia del
 * progreso real para restaurarlo al salir de la pantalla. El servidor decide
 * si esta herramienta se habilita mediante ENABLE_STATION_COMPLETION_TEST_MODE.
 *
 * Para retirarla por completo, elimina este archivo, su <script> en index.html
 * y el bloque temporal equivalente del backend y de registro.html.
 */
(function (window, document) {
  'use strict';

  const TEST_STATE_KEY = 'much_station_completion_test_state';
  const COMPLETED_STATIONS_KEY = 'much_completed_stations';
  const CURRENT_STATION_KEY = 'much_current_station';
  const REWARD_CLAIMED_KEY = 'much_mission_reward_claimed';
  const REWARD_CHOICE_KEY = 'much_mission_reward_ticket_choice';
  const QUIZ_PRIZE_KEY = 'much_quiz_prize';
  const TEST_STATIONS = ['1', '2', '3', '4', '5', '6'];
  const TEST_SCORE = 55;

  function getApiBaseUrl() {
    return window.location.hostname
      ? `http://${window.location.hostname}:3000`
      : 'http://127.0.0.1:3000';
  }

  function isLocalDevelopmentOrigin() {
    const hostname = String(window.location.hostname || '').toLowerCase();
    return window.location.protocol === 'file:'
      || hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '[::1]'
      || hostname === '::1';
  }

  function readTestState() {
    try {
      return JSON.parse(sessionStorage.getItem(TEST_STATE_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  function writeTestState(state) {
    sessionStorage.setItem(TEST_STATE_KEY, JSON.stringify(state));
  }

  function readCompletedStations() {
    try {
      return JSON.parse(localStorage.getItem(COMPLETED_STATIONS_KEY) || '{}');
    } catch (error) {
      return {};
    }
  }

  function snapshotRealProgress() {
    return {
      completedStations: localStorage.getItem(COMPLETED_STATIONS_KEY),
      currentStation: localStorage.getItem(CURRENT_STATION_KEY),
      rewardClaimed: localStorage.getItem(REWARD_CLAIMED_KEY),
      rewardChoice: localStorage.getItem(REWARD_CHOICE_KEY),
      quizPrize: localStorage.getItem(QUIZ_PRIZE_KEY)
    };
  }

  function restoreStorageValue(key, value) {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  }

  function restoreRealProgress(state, options = {}) {
    if (!state?.original || state.restored) return state;

    restoreStorageValue(COMPLETED_STATIONS_KEY, state.original.completedStations);
    restoreStorageValue(CURRENT_STATION_KEY, state.original.currentStation);
    restoreStorageValue(REWARD_CLAIMED_KEY, state.original.rewardClaimed);
    restoreStorageValue(REWARD_CHOICE_KEY, state.original.rewardChoice);

    if (options.restorePrize !== false) {
      restoreStorageValue(QUIZ_PRIZE_KEY, state.original.quizPrize);
    }

    const restoredState = {
      ...state,
      restored: true,
      restoredAt: new Date().toISOString()
    };
    writeTestState(restoredState);
    return restoredState;
  }

  async function isTestToolEnabled() {
    // Live Server suele ejecutarse sin el backend en el puerto 3000. En un
    // origen local el boton puede mostrarse de inmediato; el backend sigue
    // validando su propia bandera antes de generar un boleto verificable.
    if (isLocalDevelopmentOrigin()) return true;

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/testing/station-completion`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (!response.ok) return false;
      const data = await response.json();
      return data?.enabled === true;
    } catch (error) {
      console.warn('[Pruebas] No se pudo consultar el modo de estaciones completadas:', error);
      return false;
    }
  }

  function injectStyles() {
    if (document.getElementById('stationCompletionTestStyles')) return;

    const style = document.createElement('style');
    style.id = 'stationCompletionTestStyles';
    style.textContent = `
      .station-completion-test-tool {
        width: 100%;
        max-width: 340px;
        box-sizing: border-box;
        padding: 12px;
        border: 2px dashed #f59e0b;
        border-radius: 16px;
        background: rgba(245, 158, 11, 0.12);
        color: #fef3c7;
        text-align: center;
      }
      .station-completion-test-tool__label {
        display: block;
        margin-bottom: 8px;
        font-size: 0.72rem;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #fbbf24;
      }
      .station-completion-test-tool__button {
        width: 100%;
        min-height: 46px;
        padding: 10px 14px;
        border: 0;
        border-radius: 12px;
        background: linear-gradient(135deg, #f59e0b, #ea580c);
        color: #fff;
        font-family: inherit;
        font-size: 0.92rem;
        font-weight: 800;
        line-height: 1.2;
        cursor: pointer;
        box-shadow: 0 5px 0 #9a3412, 0 9px 18px rgba(154, 52, 18, 0.24);
      }
      .station-completion-test-tool__button:disabled {
        cursor: default;
        opacity: 0.78;
        box-shadow: none;
      }
      .station-completion-test-tool__status {
        display: block;
        min-height: 1.2em;
        margin-top: 8px;
        font-size: 0.75rem;
        line-height: 1.35;
        color: #fde68a;
      }
    `;
    document.head.appendChild(style);
  }

  function buildTestTool() {
    const resetButton = document.getElementById('btnResetProgress');
    if (!resetButton || document.getElementById('btnCompleteStationsForTest')) return null;

    injectStyles();

    const wrapper = document.createElement('div');
    wrapper.className = 'station-completion-test-tool';
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Herramienta temporal de pruebas');
    wrapper.innerHTML = `
      <span class="station-completion-test-tool__label">Temporal · Solo pruebas</span>
      <button id="btnCompleteStationsForTest" class="station-completion-test-tool__button" type="button">
        Completar estaciones para prueba
      </button>
      <span id="stationCompletionTestStatus" class="station-completion-test-tool__status" aria-live="polite">
        Simula 6 estaciones y 55 puntos sin modificar el progreso de la base de datos.
      </span>
    `;

    resetButton.parentElement.insertBefore(wrapper, resetButton);
    return wrapper;
  }

  function activateTestCompletion(button, status) {
    const previousState = readTestState();
    const original = previousState?.active && !previousState?.restored
      ? previousState.original
      : snapshotRealProgress();

    const completed = readCompletedStations();
    TEST_STATIONS.forEach((stationId) => {
      completed[stationId] = true;
    });

    localStorage.setItem(COMPLETED_STATIONS_KEY, JSON.stringify(completed));
    localStorage.setItem(CURRENT_STATION_KEY, '6');
    localStorage.removeItem(REWARD_CLAIMED_KEY);
    localStorage.removeItem(REWARD_CHOICE_KEY);
    localStorage.removeItem(QUIZ_PRIZE_KEY);

    writeTestState({
      active: true,
      restored: false,
      continuing: false,
      score: TEST_SCORE,
      stations: TEST_STATIONS,
      activatedAt: new Date().toISOString(),
      original
    });

    button.disabled = true;
    button.textContent = 'Estaciones completadas para prueba';
    status.textContent = 'Simulación activa: 6 palomitas, 55 puntos y premio final desbloqueado.';

    window.dispatchEvent(new CustomEvent('much:returnToMap', {
      detail: { testMode: true, score: TEST_SCORE }
    }));
  }

  function bindLifecycleCleanup() {
    document.addEventListener('click', (event) => {
      const continueButton = event.target.closest?.('#missionRewardContinue');
      if (!continueButton || continueButton.disabled) return;

      const state = readTestState();
      if (!state?.active || state.restored) return;
      writeTestState({ ...state, continuing: true });
    }, true);

    window.addEventListener('pagehide', () => {
      const state = readTestState();
      if (!state?.active || state.restored) return;

      const generatedPrize = state.continuing && localStorage.getItem(QUIZ_PRIZE_KEY);
      const restoredState = restoreRealProgress(state, { restorePrize: !generatedPrize });

      if (!generatedPrize) {
        sessionStorage.removeItem(TEST_STATE_KEY);
      } else {
        writeTestState({ ...restoredState, continuing: true });
      }
    });

    window.addEventListener('pageshow', (event) => {
      const state = readTestState();
      const testButton = document.getElementById('btnCompleteStationsForTest');
      if (event.persisted && (state?.restored || testButton?.disabled)) {
        sessionStorage.removeItem(TEST_STATE_KEY);
        window.location.reload();
      }
    });
  }

  async function init() {
    const staleState = readTestState();
    if (staleState?.active && !staleState.restored) {
      restoreRealProgress(staleState);
    }
    if (staleState) {
      sessionStorage.removeItem(TEST_STATE_KEY);
    }

    if (!(await isTestToolEnabled())) return;

    const wrapper = buildTestTool();
    if (!wrapper) return;

    const button = wrapper.querySelector('#btnCompleteStationsForTest');
    const status = wrapper.querySelector('#stationCompletionTestStatus');
    button.addEventListener('click', () => {
      const accepted = window.confirm(
        'Esta herramienta temporal simulara todas las estaciones completadas para probar el boleto. El progreso real de la base de datos no se modificara. ¿Continuar?'
      );
      if (accepted) activateTestCompletion(button, status);
    });

    bindLifecycleCleanup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(window, document);
