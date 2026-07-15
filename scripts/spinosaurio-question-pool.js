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

  function getHistoryKey(playerId) {
    return `much_spinosaurio_questions_${playerId || 'guest'}`;
  }

  function pickSpinosaurioQuestion(storage, playerId) {
    const resolvedStorage = createStorage(storage);
    const historyKey = getHistoryKey(playerId);
    const rawHistory = resolvedStorage.getItem(historyKey);
    const usedIds = rawHistory ? JSON.parse(rawHistory) : [];
    const available = QUESTIONS.filter((question) => !usedIds.includes(question.id));

    if (!available.length) {
      resolvedStorage.setItem(historyKey, JSON.stringify([]));
      return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    }

    const selected = available[Math.floor(Math.random() * available.length)];
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
