const test = require('node:test');
const assert = require('node:assert/strict');
const { createQuestionDeck } = require('../scripts/question-pool.js');

test('createQuestionDeck returns unique station questions and no repeats within the same attempt', () => {
  const bank = [
    { text: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, points: 10, sala: 'biodiversidad' },
    { text: 'Q2', options: ['A', 'B', 'C', 'D'], correctIndex: 1, points: 10, sala: 'biodiversidad' },
    { text: 'Q3', options: ['A', 'B', 'C', 'D'], correctIndex: 2, points: 10, sala: 'energia' },
    { text: 'Q4', options: ['A', 'B', 'C', 'D'], correctIndex: 3, points: 10, sala: 'biodiversidad' }
  ];

  const storage = createMemoryStorage();
  const first = createQuestionDeck({
    questions: bank,
    stationKey: 'biodiversidad',
    count: 3,
    storage,
    playerId: 'player-1',
    historyKey: 'much_used_questions_biodiversidad_player-1',
    deckKey: 'much_question_deck_biodiversidad_player-1'
  });

  assert.equal(first.length, 3);
  assert.equal(new Set(first.map(q => q.id)).size, first.length);
  assert.ok(first.every(q => q.options.length >= 2));
  assert.ok(first.every(q => q.text));

  const second = createQuestionDeck({
    questions: bank,
    stationKey: 'biodiversidad',
    count: 3,
    storage,
    playerId: 'player-2',
    historyKey: 'much_used_questions_biodiversidad_player-2',
    deckKey: 'much_question_deck_biodiversidad_player-2'
  });

  assert.equal(second.length, 3);
  assert.equal(new Set(second.map(q => q.id)).size, second.length);
  assert.ok(second.every(q => q.options.length >= 2));
  assert.ok(second.every(q => q.text));
});

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); }
  };
}
