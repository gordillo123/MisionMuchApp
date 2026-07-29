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

test('legacy checkmarks do not complete question stations without answer evidence', () => {
  const { api } = loadMuchLocalStorage({
    much_completed_stations: JSON.stringify({ 1: true, 3: true, 4: true, 5: true })
  });

  assert.deepEqual(plain(api.getCompletedStationsMap()), { 1: true });
});

test('non-question stations keep their existing score-based completion behavior', () => {
  const { api } = loadMuchLocalStorage();

  assert.ok(api.completeStation('1', { puntaje: 10 }));
  assert.ok(api.completeStation('2', { puntaje: 15 }));
  assert.ok(api.completeStation('6', { puntaje: 10 }));

  assert.deepEqual(plain(api.getCompletedStationsMap()), {
    1: true,
    2: true,
    6: true
  });
});
