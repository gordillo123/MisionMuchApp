const test = require('node:test');
const assert = require('node:assert/strict');
const { pickSpinosaurioQuestion, clearSpinosaurioQuestionHistory } = require('../scripts/spinosaurio-question-pool.js');

test('pickSpinosaurioQuestion returns a unique question per attempt and cycles after the pool is exhausted', () => {
  const storage = createMemoryStorage();
  const first = pickSpinosaurioQuestion(storage, 'spinosaurio-test-1');
  const second = pickSpinosaurioQuestion(storage, 'spinosaurio-test-1');

  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.id, second.id);

  const all = [];
  for (let index = 0; index < 3; index += 1) {
    const picked = pickSpinosaurioQuestion(storage, 'spinosaurio-test-1');
    all.push(picked.id);
  }

  assert.equal(new Set(all).size, all.length);

  const afterCycle = pickSpinosaurioQuestion(storage, 'spinosaurio-test-1');
  assert.ok(afterCycle);
  clearSpinosaurioQuestionHistory(storage, 'spinosaurio-test-1');
});

test('pickSpinosaurioQuestion starts a new cycle without immediately repeating the last question', () => {
  const storage = createMemoryStorage();
  const playerId = 'spinosaurio-test-cycle';
  let lastPicked = null;

  for (let index = 0; index < 5; index += 1) {
    lastPicked = pickSpinosaurioQuestion(storage, playerId);
  }

  const afterCycle = pickSpinosaurioQuestion(storage, playerId);
  assert.ok(afterCycle);
  assert.notEqual(afterCycle.id, lastPicked.id);
});

test('pickSpinosaurioQuestion recovers from malformed saved history', () => {
  const storage = createMemoryStorage();
  storage.setItem('much_spinosaurio_questions_spinosaurio-test-malformed', '{bad json');

  const selected = pickSpinosaurioQuestion(storage, 'spinosaurio-test-malformed');

  assert.ok(selected);
  assert.ok(selected.id);
});

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}
