(function (root) {
  const QUESTIONS = [
    {
      id: 'espinosaurio-1',
      title: '¡Pregunta final del Espinosaurio!',
      subtitle: 'Responde con cuidado',
      question: '¿Qué tipo de dinosaurio era el Espinosaurio?',
      options: ['Herbívoro', 'Carnívoro', 'Dinosaurio volador', 'Dinosaurio marino pequeño'],
      answerIndex: 1
    },
    {
      id: 'espinosaurio-2',
      title: '¡Pregunta final del Espinosaurio!',
      subtitle: 'Responde con cuidado',
      question: '¿Qué alimento le gustaba comer al Espinosaurio?',
      options: ['Peces', 'Flores', 'Pasto', 'Frutas'],
      answerIndex: 0
    },
    {
      id: 'espinosaurio-3',
      title: '¡Pregunta final del Espinosaurio!',
      subtitle: 'Responde con cuidado',
      question: '¿Dónde pasaba mucho tiempo el Espinosaurio?',
      options: ['Cerca del agua', 'En la nieve', 'En el desierto', 'En cuevas oscuras'],
      answerIndex: 0
    },
    {
      id: 'espinosaurio-4',
      title: '¡Pregunta final del Espinosaurio!',
      subtitle: 'Responde con cuidado',
      question: '¿Qué parte de su cuerpo le ayudaba a atrapar peces?',
      options: ['Sus alas', 'Su trompa corta', 'Su hocico largo y sus dientes', 'Sus orejas grandes'],
      answerIndex: 2
    },
    {
      id: 'espinosaurio-5',
      title: '¡Pregunta final del Espinosaurio!',
      subtitle: 'Responde con cuidado',
      question: '¿Por qué el Espinosaurio era un dinosaurio especial?',
      options: ['Porque podía vivir cerca del agua y cazar peces', 'Porque podía volar como un ave', 'Porque era del tamaño de una hormiga', 'Porque solo comía hojas'],
      answerIndex: 0
    }
  ];

  function createStorage(storage) {
    if (storage) return storage;
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    return {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    };
  }

  function randomNumber() {
    const cryptoObj = root?.crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function' && typeof Uint32Array !== 'undefined') {
      const values = new Uint32Array(1);
      cryptoObj.getRandomValues(values);
      return values[0] / 0x100000000;
    }
    return Math.random();
  }

  function randomInt(maxExclusive) {
    const max = Number(maxExclusive);
    if (!Number.isFinite(max) || max <= 0) return 0;
    return Math.floor(randomNumber() * max);
  }

  function getHistoryKey(playerId) {
    return `much_spinosaurio_questions_${playerId || 'guest'}`;
  }

  function pickSpinosaurioQuestion(storage, playerId) {
    const resolvedStorage = createStorage(storage);
    const historyKey = getHistoryKey(playerId);
    const rawHistory = resolvedStorage.getItem(historyKey);
    let usedIds = [];
    try {
      const parsedHistory = rawHistory ? JSON.parse(rawHistory) : [];
      usedIds = Array.isArray(parsedHistory) ? parsedHistory : [];
    } catch (error) {
      usedIds = [];
    }
    const available = QUESTIONS.filter((question) => !usedIds.includes(question.id));

    if (!available.length) {
      const lastUsedId = usedIds[usedIds.length - 1];
      const nextCycleQuestions = QUESTIONS.filter((question) => question.id !== lastUsedId);
      const cyclePool = nextCycleQuestions.length ? nextCycleQuestions : QUESTIONS;
      const selected = cyclePool[randomInt(cyclePool.length)];
      resolvedStorage.setItem(historyKey, JSON.stringify([selected.id]));
      return selected;
    }

    const selected = available[randomInt(available.length)];
    const nextHistory = usedIds.concat(selected.id);
    resolvedStorage.setItem(historyKey, JSON.stringify(nextHistory));
    return selected;
  }

  function clearSpinosaurioQuestionHistory(storage, playerId) {
    const resolvedStorage = createStorage(storage);
    resolvedStorage.removeItem(getHistoryKey(playerId));
  }

  const api = { pickSpinosaurioQuestion, clearSpinosaurioQuestionHistory, QUESTIONS };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.MuchSpinosaurioQuestionPool = api;
})(typeof window !== 'undefined' ? window : globalThis);
