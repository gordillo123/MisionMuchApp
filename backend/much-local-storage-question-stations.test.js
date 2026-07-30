const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'scripts', 'much-local-storage.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    dump() {
      return Object.fromEntries(store.entries());
    }
  };
}

function loadMuchLocalStorage(initialStorage = {}) {
  const localStorage = createStorage(initialStorage);
  const sessionStorage = createStorage();
  const context = {
    console,
    localStorage,
    sessionStorage,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    window: {
      localStorage,
      sessionStorage,
      dispatchEvent() {}
    }
  };

  vm.runInNewContext(scriptSource, context, { filename: scriptPath });
  return {
    api: context.window.MuchLocalStorage,
    localStorage
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('question stations require 7 to 10 correct answers out of at most 10', () => {
  const { api } = loadMuchLocalStorage();

  assert.equal(api.completeStation('3', { puntaje: 10, aciertos: 6, errores: 4 }), null);
  assert.equal(api.isStationCompleted('3'), false);

  assert.ok(api.completeStation('3', { puntaje: 10, aciertos: 7, errores: 3 }));
  assert.equal(api.isStationCompleted('3'), true);
});

test('question stations reject impossible totals above 10', () => {
  const { api } = loadMuchLocalStorage();

  assert.equal(api.completeStation('4', { puntaje: 10, aciertos: 7, errores: 4 }), null);
  assert.equal(api.isStationCompleted('4'), false);

  assert.equal(api.completeStation('5', { puntaje: 10, aciertos: 11, errores: 0 }), null);
  assert.equal(api.isStationCompleted('5'), false);
});

test('legacy checkmarks do not complete strict stations without evidence', () => {
  const { api } = loadMuchLocalStorage({
    much_completed_stations: JSON.stringify({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: true })
  });

  assert.deepEqual(plain(api.getCompletedStationsMap()), {});
});

test('dynamic stations require their own completion evidence', () => {
  const { api } = loadMuchLocalStorage();

  assert.equal(api.completeStation('1', { puntaje: 10 }), null);
  assert.equal(api.completeStation('2', { puntaje: 15 }), null);
  assert.equal(api.completeStation('6', { puntaje: 10 }), null);

  assert.equal(api.completeStation('1', { puntaje: 10, aciertos: 5, errores: 0 }), null);
  assert.equal(api.completeStation('2', { puntaje: 15, aciertos: 1, errores: 1 }), null);
  assert.equal(api.completeStation('6', { puntaje: 10, aciertos: 1, errores: 1 }), null);

  assert.ok(api.completeStation('1', { puntaje: 10, aciertos: 6, errores: 0 }));
  assert.ok(api.completeStation('2', { puntaje: 15, aciertos: 1, errores: 0 }));
  assert.ok(api.completeStation('6', { puntaje: 10, aciertos: 1, errores: 0 }));

  assert.deepEqual(plain(api.getCompletedStationsMap()), {
    1: true,
    2: true,
    6: true
  });
});

test('spinosaurio requires 15 jumps and a correct final answer', () => {
  const { api } = loadMuchLocalStorage();

  assert.equal(api.completeStation('2', { puntaje: 15, aciertos: 0, errores: 0, aprobada: true }), null);
  assert.equal(api.isStationCompleted('2'), false);

  assert.equal(api.completeStation('2', { puntaje: 15, aciertos: 1, errores: 1, aprobada: true }), null);
  assert.equal(api.isStationCompleted('2'), false);

  assert.ok(api.completeStation('2', { puntaje: 15, aciertos: 1, errores: 0, aprobada: true }));
  assert.equal(api.isStationCompleted('2'), true);
  assert.equal(api.getScore(), 15);
});

test('failed spinosaurio final question does not add score or completion', () => {
  const { api } = loadMuchLocalStorage();

  const attempt = api.recordStationAttempt('2', {
    puntaje: 0,
    aciertos: 0,
    errores: 1,
    aprobado: false,
    finalizado: true,
    id_intento: 'spinosaurio-final-wrong'
  }, { countAttempt: true, countFailure: true, finalizado: true });

  assert.equal(api.isStationCompleted('2'), false);
  assert.equal(api.getScore(), 0);
  assert.equal(attempt.completada, false);
  assert.equal(attempt.ultimo_puntaje, 0);
});

test('ticket claim remains blocked until every station has valid completion evidence', () => {
  const { api } = loadMuchLocalStorage();

  api.completeStation('1', { puntaje: 10, aciertos: 6, errores: 0 });
  api.completeStation('2', { puntaje: 15, aciertos: 1, errores: 0 });
  api.completeStation('3', { puntaje: 10, aciertos: 7, errores: 3 });
  api.completeStation('4', { puntaje: 10, aciertos: 7, errores: 3 });
  api.completeStation('5', { puntaje: 10, aciertos: 7, errores: 3 });

  assert.equal(api.getRouteState(), 'en_progreso');
  assert.equal(api.getClaimButtonState(), 'bloqueado');

  api.completeStation('6', { puntaje: 10, aciertos: 1, errores: 0 });

  assert.equal(api.getRouteState(), 'completado');
  assert.equal(api.getClaimButtonState(), 'activo');
});

test('repeating a completed station does not duplicate its score', () => {
  const { api } = loadMuchLocalStorage();

  api.completeStation('1', { puntaje: 10, aciertos: 6, errores: 0 });
  assert.equal(api.getScore(), 10);

  api.completeStation('1', { puntaje: 10, aciertos: 6, errores: 0 });
  assert.equal(api.getScore(), 10);
});

test('the route remains retryable until three global failed attempts are exhausted', () => {
  const { api } = loadMuchLocalStorage();

  let attempt = api.recordStationAttempt('1', {
    puntaje: 0,
    aciertos: 5,
    errores: 1,
    aprobado: false,
    finalizado: true,
    id_intento: 'taquilla-1'
  }, { countAttempt: true, countFailure: true, finalizado: true });

  assert.equal(api.isStationCompleted('1'), false);
  assert.equal(api.isStationFailed('1'), false);
  assert.equal(api.isStationBlocked('1'), false);
  assert.equal(attempt.intentos_fallidos, 1);
  assert.equal(api.getStationAttemptInfo('1').intentos_restantes, 2);

  attempt = api.recordStationAttempt('2', {
    puntaje: 0,
    aciertos: 0,
    errores: 1,
    aprobado: false,
    finalizado: true,
    id_intento: 'spinosaurio-1'
  }, { countAttempt: true, countFailure: true, finalizado: true });

  assert.equal(api.isStationFailed('2'), false);
  assert.equal(attempt.intentos_fallidos_globales, 2);
  assert.equal(api.getStationAttemptInfo('1').intentos_restantes, 1);
  assert.equal(api.getStationAttemptInfo('2').intentos_restantes, 1);

  attempt = api.recordStationAttempt('3', {
    puntaje: 0,
    aciertos: 6,
    errores: 4,
    aprobado: false,
    finalizado: true,
    id_intento: 'biodiversidad-1'
  }, { countAttempt: true, countFailure: true, finalizado: true });

  assert.equal(api.isStationCompleted('1'), false);
  assert.equal(api.isStationFailed('1'), true);
  assert.equal(api.isStationBlocked('2'), true);
  assert.equal(api.isStationBlocked('3'), true);
  assert.equal(attempt.intentos_fallidos_globales, 3);
  assert.equal(api.getStationAttemptInfo('1').intentos_restantes, 0);
  assert.equal(api.getStationAttemptInfo('3').intentos_restantes, 0);
});
