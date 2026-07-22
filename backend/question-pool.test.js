const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createQuestionDeck,
  getDifficultyScore,
  getQuestionId,
  shuffleArray,
  shuffleQuestionOptions
} = require('../scripts/question-pool.js');

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

test('createQuestionDeck uses stable fallback ids for questions without explicit id', () => {
  const question = {
    text: 'Pregunta sin id',
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 2,
    sala: 'energia'
  };

  assert.equal(getQuestionId(question), getQuestionId({ ...question, options: question.options.slice() }));
});

test('shuffleArray returns a shuffled copy without mutating the original array', () => {
  const source = ['a', 'b', 'c', 'd'];
  const shuffled = shuffleArray(source);

  assert.notEqual(shuffled, source);
  assert.deepEqual(source, ['a', 'b', 'c', 'd']);
  assert.deepEqual(shuffled.slice().sort(), source.slice().sort());
});

test('shuffleQuestionOptions moves options while preserving the correct answer index', () => {
  const source = {
    question: 'Pregunta de prueba',
    options: ['Incorrecta A', 'Respuesta correcta', 'Incorrecta B', 'Incorrecta C'],
    answerIndex: 1
  };

  const shuffled = shuffleQuestionOptions(source, 3);

  assert.deepEqual(source.options, ['Incorrecta A', 'Respuesta correcta', 'Incorrecta B', 'Incorrecta C']);
  assert.equal(shuffled.answerIndex, 3);
  assert.equal(shuffled.correctIndex, 3);
  assert.equal(shuffled.options[3], 'Respuesta correcta');
  assert.equal(new Set(shuffled.options).size, source.options.length);
});

test('createQuestionDeck does not fall back to questions from another station', () => {
  const bank = [
    { id: 'energia-1', text: 'Energía 1', options: ['A', 'B'], correctIndex: 0, sala: 'energia' },
    { id: 'energia-2', text: 'Energía 2', options: ['A', 'B'], correctIndex: 0, sala: 'energia' }
  ];

  const deck = createQuestionDeck({
    questions: bank,
    stationKey: 'biodiversidad',
    count: 2,
    storage: createMemoryStorage(),
    playerId: 'player-station'
  });

  assert.deepEqual(deck, []);
});

test('createQuestionDeck can force a fresh deck while avoiding repeated questions when possible', () => {
  const bank = [
    { id: 'q1', text: 'Q1', options: ['A', 'B'], correctIndex: 0, sala: 'taquilla' },
    { id: 'q2', text: 'Q2', options: ['A', 'B'], correctIndex: 0, sala: 'taquilla' },
    { id: 'q3', text: 'Q3', options: ['A', 'B'], correctIndex: 0, sala: 'taquilla' },
    { id: 'q4', text: 'Q4', options: ['A', 'B'], correctIndex: 0, sala: 'taquilla' }
  ];
  const storage = createMemoryStorage();

  const first = createQuestionDeck({
    questions: bank,
    stationKey: 'taquilla',
    count: 2,
    storage,
    playerId: 'player-fresh'
  });
  const second = createQuestionDeck({
    questions: bank,
    stationKey: 'taquilla',
    count: 2,
    storage,
    playerId: 'player-fresh',
    forceNew: true
  });

  const firstIds = new Set(first.map(question => question.id));
  assert.equal(second.length, 2);
  assert.ok(second.every(question => !firstIds.has(question.id)));
});

test('createQuestionDeck treats saved station questions as already shown in a fresh attempt', () => {
  const bank = [
    { id: 'bio-1', text: 'Bio 1', options: ['A', 'B'], correctIndex: 0, sala: 'biodiversidad' },
    { id: 'bio-2', text: 'Bio 2', options: ['A', 'B'], correctIndex: 0, sala: 'biodiversidad' },
    { id: 'bio-3', text: 'Bio 3', options: ['A', 'B'], correctIndex: 0, sala: 'biodiversidad' },
    { id: 'bio-4', text: 'Bio 4', options: ['A', 'B'], correctIndex: 0, sala: 'biodiversidad' }
  ];
  const storage = createMemoryStorage();

  storage.setItem('deck-biodiversity', JSON.stringify(bank.slice(0, 2)));

  const next = createQuestionDeck({
    questions: bank,
    stationKey: 'biodiversidad',
    count: 2,
    storage,
    playerId: 'player-saved',
    historyKey: 'history-biodiversity',
    deckKey: 'deck-biodiversity',
    forceNew: true,
    preferDifficult: false
  });

  assert.deepEqual(next.map(question => question.id).sort(), ['bio-3', 'bio-4']);
  assert.deepEqual(JSON.parse(storage.getItem('history-biodiversity')).sort(), ['bio-1', 'bio-2', 'bio-3', 'bio-4']);
});

test('createQuestionDeck keeps Sala A, Sala B and Sala C pools isolated', () => {
  const bank = [
    { id: 'bio-1', text: 'Bio 1', options: ['A', 'B'], correctIndex: 0, sala: 'biodiversidad' },
    { id: 'bio-2', text: 'Bio 2', options: ['A', 'B'], correctIndex: 0, sala: 'biodiversidad' },
    { id: 'bio-3', text: 'Bio 3', options: ['A', 'B'], correctIndex: 0, sala: 'biodiversidad' },
    { id: 'ene-1', text: 'Energía 1', options: ['A', 'B'], correctIndex: 0, sala: 'energia' },
    { id: 'ene-2', text: 'Energía 2', options: ['A', 'B'], correctIndex: 0, sala: 'energia' },
    { id: 'ene-3', text: 'Energía 3', options: ['A', 'B'], correctIndex: 0, sala: 'energia' },
    { id: 'sus-1', text: 'Sustentable 1', options: ['A', 'B'], correctIndex: 0, sala: 'desarrollo-sustentable' },
    { id: 'sus-2', text: 'Sustentable 2', options: ['A', 'B'], correctIndex: 0, sala: 'desarrollo-sustentable' },
    { id: 'sus-3', text: 'Sustentable 3', options: ['A', 'B'], correctIndex: 0, sala: 'desarrollo-sustentable' }
  ];
  const storage = createMemoryStorage();
  const playerId = 'player-abc';

  const bio = createQuestionDeck({
    questions: bank,
    stationKey: 'biodiversidad',
    count: 2,
    storage,
    playerId,
    forceNew: true,
    preferDifficult: false
  });
  const energy = createQuestionDeck({
    questions: bank,
    stationKey: 'energia',
    count: 2,
    storage,
    playerId,
    forceNew: true,
    preferDifficult: false
  });
  const sustainable = createQuestionDeck({
    questions: bank,
    stationKey: 'desarrollo-sustentable',
    count: 2,
    storage,
    playerId,
    forceNew: true,
    preferDifficult: false
  });

  assert.equal(bio.length, 2);
  assert.equal(energy.length, 2);
  assert.equal(sustainable.length, 2);
  assert.ok(bio.every(question => question.sala === 'biodiversidad'));
  assert.ok(energy.every(question => question.sala === 'energia'));
  assert.ok(sustainable.every(question => question.sala === 'desarrollo-sustentable'));

  const bioIds = new Set(bio.map(question => question.id));
  const remainingBio = createQuestionDeck({
    questions: bank,
    stationKey: 'biodiversidad',
    count: 1,
    storage,
    playerId,
    forceNew: true,
    preferDifficult: false
  });

  assert.equal(remainingBio.length, 1);
  assert.ok(!bioIds.has(remainingBio[0].id));
  assert.equal(remainingBio[0].sala, 'biodiversidad');
  assert.ok(JSON.parse(storage.getItem(`much_used_questions_biodiversidad_${playerId}`)).every(id => id.startsWith('bio-')));
  assert.ok(JSON.parse(storage.getItem(`much_used_questions_energia_${playerId}`)).every(id => id.startsWith('ene-')));
  assert.ok(JSON.parse(storage.getItem(`much_used_questions_desarrollo-sustentable_${playerId}`)).every(id => id.startsWith('sus-')));
});

test('getDifficultyScore gives more weight to challenge questions', () => {
  const easy = { text: 'Que accion ayuda a cuidar el agua?', options: ['Cerrar la llave', 'Tirar agua'], correctIndex: 0 };
  const hard = { text: 'Que porcentaje de emisiones mundiales provienen de 15 paises?', options: ['10 %', '20 %', '70 %', '90 %'], correctIndex: 2, difficulty: 'avanzado' };

  assert.ok(getDifficultyScore(hard) > getDifficultyScore(easy));
});

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); }
  };
}
