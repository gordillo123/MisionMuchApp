(function (root) {
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

  function resolveStorage(storage) {
    if (storage) return storage;
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
    return createMemoryStorage();
  }

  function normalizeStationKey(stationKey) {
    return String(stationKey || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function shuffleArray(items) {
    return items
      .map((item) => ({ item, rank: Math.random() }))
      .sort((a, b) => a.rank - b.rank)
      .map(({ item }) => item);
  }

  function getQuestionId(question) {
    if (!question) return '';
    if (typeof question.id === 'string' && question.id.trim()) return question.id;
    const fallback = question.text || question.pregunta || question.enunciado || question.desc || '';
    return `${fallback}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function questionMatchesStation(question, stationKey) {
    const target = normalizeStationKey(stationKey);
    const rawSala = question?.sala ?? question?.sala_codigo ?? question?.estacion ?? question?.station ?? '';
    if (!rawSala) return true;
    const sala = normalizeStationKey(rawSala);
    if (!sala) return true;
    if (sala === target) return true;
    if (sala.includes(target) || target.includes(sala)) return true;
    const aliases = {
      entrada: ['taquilla', 'entrada', 'entrada-much', 'entada'],
      taquilla: ['taquilla', 'entrada', 'entrada-much'],
      biodiversidad: ['biodiversidad', 'biodiversidad-y-conocimiento'],
      energia: ['energia', 'sala-energia'],
      'desarrollo-sustentable': ['desarrollo sustentable', 'desarrollo-sustentable', 'sala desarrollo sustentable']
    };
    const aliasList = aliases[target] || [];
    return aliasList.some((alias) => sala === normalizeStationKey(alias) || sala.includes(normalizeStationKey(alias)) || normalizeStationKey(alias).includes(sala));
  }

  function resolvePlayerId(storage, fallbackPlayerId) {
    const explicit = fallbackPlayerId || '';
    if (explicit) return explicit;
    const existing = storage.getItem('much_player_id') || storage.getItem('much_player_uid') || '';
    if (existing) return existing;
    const generated = `player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    storage.setItem('much_player_id', generated);
    return generated;
  }

  function readJsonList(value) {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function createQuestionDeck({
    questions = [],
    stationKey = 'general',
    count = 10,
    storage,
    playerId,
    historyKey,
    deckKey
  }) {
    const resolvedStorage = resolveStorage(storage);
    const resolvedPlayerId = resolvePlayerId(resolvedStorage, playerId);
    const resolvedHistoryKey = historyKey || `much_used_questions_${normalizeStationKey(stationKey)}_${resolvedPlayerId}`;
    const resolvedDeckKey = deckKey || `much_question_deck_${normalizeStationKey(stationKey)}_${resolvedPlayerId}`;

    const existingDeck = resolvedStorage.getItem(resolvedDeckKey);
    if (existingDeck) {
      try {
        const parsedDeck = JSON.parse(existingDeck);
        if (Array.isArray(parsedDeck) && parsedDeck.length) {
          return parsedDeck;
        }
      } catch (error) {
        // Ignora y crea una nueva baraja si el formato cambió.
      }
    }

    const pool = Array.isArray(questions) ? questions.filter((question) => questionMatchesStation(question, stationKey)) : [];
    const sourcePool = pool.length ? pool : (Array.isArray(questions) ? questions : []);

    const usedQuestionIds = readJsonList(resolvedStorage.getItem(resolvedHistoryKey));
    const availableQuestions = sourcePool.filter((question) => !usedQuestionIds.includes(getQuestionId(question)));

    if (!availableQuestions.length) {
      resolvedStorage.removeItem(resolvedHistoryKey);
      resolvedStorage.removeItem(resolvedDeckKey);
      return createQuestionDeck({ questions, stationKey, count, storage: resolvedStorage, playerId: resolvedPlayerId, historyKey: resolvedHistoryKey, deckKey: resolvedDeckKey });
    }

    const selectedQuestions = shuffleArray(availableQuestions).slice(0, Math.min(Math.max(1, count), availableQuestions.length));
    const deck = selectedQuestions.map((question, index) => ({
      ...question,
      id: getQuestionId(question),
      _deckIndex: index
    }));

    const nextUsedIds = usedQuestionIds.concat(deck.map((question) => question.id));
    resolvedStorage.setItem(resolvedDeckKey, JSON.stringify(deck));
    resolvedStorage.setItem(resolvedHistoryKey, JSON.stringify(nextUsedIds));
    return deck;
  }

  function clearQuestionDeck(stationKey, storage, playerId, historyKey, deckKey) {
    const resolvedStorage = resolveStorage(storage);
    const resolvedPlayerId = resolvePlayerId(resolvedStorage, playerId);
    const resolvedHistoryKey = historyKey || `much_used_questions_${normalizeStationKey(stationKey)}_${resolvedPlayerId}`;
    const resolvedDeckKey = deckKey || `much_question_deck_${normalizeStationKey(stationKey)}_${resolvedPlayerId}`;
    resolvedStorage.removeItem(resolvedDeckKey);
    resolvedStorage.removeItem(resolvedHistoryKey);
  }

  const api = { createQuestionDeck, clearQuestionDeck, questionMatchesStation, shuffleArray, getQuestionId };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.MuchQuestionPool = api;
})(typeof window !== 'undefined' ? window : globalThis);
