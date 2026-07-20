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

  function normalizeText(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function stableHash(value) {
    const text = String(value || '');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  function shuffleArray(items) {
    return items
      .map((item) => ({ item, rank: Math.random() }))
      .sort((a, b) => a.rank - b.rank)
      .map(({ item }) => item);
  }

  function getOptionLabel(option) {
    if (option && typeof option === 'object') {
      return option.text ?? option.texto ?? option.label ?? option.value ?? '';
    }
    return option;
  }

  function getQuestionId(question) {
    if (!question) return '';
    const explicitId = question.id ?? question.id_pregunta ?? question.codigo ?? question.key ?? question.slug ?? '';
    if (typeof explicitId === 'string' && explicitId.trim()) return explicitId.trim();
    if (typeof explicitId === 'number' && Number.isFinite(explicitId)) return String(explicitId);
    const fallback = question.text || question.pregunta || question.enunciado || question.question || question.desc || '';
    const rawOptions = question.options ?? question.opciones ?? question.respuestas;
    const options = Array.isArray(rawOptions) ? rawOptions.map(getOptionLabel) : [];
    const identity = normalizeText([fallback].concat(options).join('|')) || JSON.stringify(question || {});
    return `q-${stableHash(identity)}`;
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
      'desarrollo-sustentable': ['desarrollo sustentable', 'desarrollo-sustentable', 'sala desarrollo sustentable'],
      spinosaurio: ['spinosaurio', 'espinosaurio', 'spinosaurus'],
      espinosaurio: ['spinosaurio', 'espinosaurio', 'spinosaurus'],
      sbeel: ['sbeel', 'sbeel-dinosaurios']
    };
    const aliasList = aliases[target] || [];
    return aliasList.some((alias) => {
      const normalizedAlias = normalizeStationKey(alias);
      return sala === normalizedAlias || sala.includes(normalizedAlias) || normalizedAlias.includes(sala);
    });
  }

  function hasStationMetadata(question) {
    return Boolean(question?.sala ?? question?.sala_codigo ?? question?.estacion ?? question?.station);
  }

  function safeStorageGet(storage, key) {
    try {
      return storage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeStorageSet(storage, key, value) {
    try {
      storage.setItem(key, value);
    } catch (error) {}
  }

  function safePlayerPart(value) {
    return normalizeText(value).replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }

  function resolveStoredAccountId(storage) {
    const rawUser = safeStorageGet(storage, 'much_google_user');
    if (!rawUser) return '';

    try {
      const user = JSON.parse(rawUser);
      const candidate = user?.id_usuario ?? user?.id ?? user?.uid ?? user?.google_id ?? user?.email ?? user?.correo ?? '';
      return candidate ? safePlayerPart(candidate) : '';
    } catch (error) {
      return '';
    }
  }

  function getOrCreateDevicePlayerId(storage) {
    const existing = safeStorageGet(storage, 'much_player_id') || safeStorageGet(storage, 'much_player_uid') || '';
    if (existing) return safePlayerPart(existing);
    const generated = `player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    safeStorageSet(storage, 'much_player_id', generated);
    return generated;
  }

  function resolvePlayerId(storage, fallbackPlayerId) {
    const explicit = fallbackPlayerId || '';
    if (explicit) return safePlayerPart(explicit);
    const accountId = resolveStoredAccountId(storage);
    const deviceId = getOrCreateDevicePlayerId(storage);
    return accountId ? `${accountId}-${deviceId}` : deviceId;
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

  function normalizeDifficultyValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.min(5, value));
    }

    const text = normalizeText(value);
    if (!text) return 0;
    if (/(experto|avanzado|alto|alta|dificil|mayor|reto|hard|challenge)/.test(text)) return 4;
    if (/(medio|media|intermedio|moderado)/.test(text)) return 2;
    if (/(facil|basico|bajo|baja|easy)/.test(text)) return 0;
    return 1;
  }

  function getDifficultyScore(question) {
    if (!question) return 0;
    const text = normalizeText(question.text ?? question.pregunta ?? question.enunciado ?? question.question ?? '');
    const explicitDifficulty = question.difficulty ?? question.dificultad ?? question.nivel ?? question.level ?? question.reto ?? question.challenge ?? '';
    let score = normalizeDifficultyValue(explicitDifficulty);

    if (question.hard || question.dificil || question._hard || question._challenge) score += 2;
    if (question._energyRequired || question._biodiversityRequired || question._sustainableRequired) score += 1.25;

    const points = Number(question.points ?? question.puntos ?? 0);
    if (Number.isFinite(points) && points > 10) score += Math.min(2, (points - 10) / 10);

    const rawOptions = question.options ?? question.opciones ?? question.respuestas;
    const options = Array.isArray(rawOptions) ? rawOptions : [];
    if (options.length > 3) score += 0.4;
    if (text.length > 75) score += 0.6;
    if (text.length > 120) score += 0.6;
    if (/[0-9%]/.test(text)) score += 0.8;

    const challengeTerms = /(porcentaje|protocolo|acuerdo|agenda|ods|co2|carbono|metano|emisiones|invernadero|fotovoltaico|geoterm|hidroelect|biocapacidad|huella|biodiversidad|ecosistema|endem|atmosfera|estratosfera|troposfera|ozono|grijalva|lacandona|newton|arquimedes|becquerel|watt|nuclear|renovable|sustentable|clasificacion|medica)/;
    if (challengeTerms.test(text)) score += 1.2;

    return Math.max(0, score);
  }

  function weightedShuffleQuestions(items, preferDifficult = true) {
    if (!preferDifficult) return shuffleArray(items);
    return items
      .map((item) => {
        const weight = Math.min(10, 1 + getDifficultyScore(item));
        return { item, rank: -Math.log(Math.random() || Number.MIN_VALUE) / weight };
      })
      .sort((a, b) => a.rank - b.rank)
      .map(({ item }) => item);
  }

  function uniqueQuestions(questions) {
    const seen = new Set();
    return questions.filter((question) => {
      const id = getQuestionId(question);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function createQuestionDeck({
    questions = [],
    stationKey = 'general',
    count = 10,
    storage,
    playerId,
    historyKey,
    deckKey,
    forceNew = false,
    preferDifficult = true
  }) {
    const resolvedStorage = resolveStorage(storage);
    const resolvedPlayerId = resolvePlayerId(resolvedStorage, playerId);
    const resolvedHistoryKey = historyKey || `much_used_questions_${normalizeStationKey(stationKey)}_${resolvedPlayerId}`;
    const resolvedDeckKey = deckKey || `much_question_deck_${normalizeStationKey(stationKey)}_${resolvedPlayerId}`;

    const existingDeck = safeStorageGet(resolvedStorage, resolvedDeckKey);
    let parsedExistingDeck = [];
    if (existingDeck) {
      try {
        const parsedDeck = JSON.parse(existingDeck);
        if (Array.isArray(parsedDeck) && parsedDeck.length && parsedDeck.every((question) => questionMatchesStation(question, stationKey))) {
          parsedExistingDeck = parsedDeck;
          if (!forceNew) return parsedDeck;
        }
      } catch (error) {
        // Ignore and create a new deck if the saved format changed.
      }
    }

    const rawQuestions = Array.isArray(questions) ? questions : [];
    const matchedPool = rawQuestions.filter((question) => questionMatchesStation(question, stationKey));
    const sourcePool = uniqueQuestions(matchedPool.length || !rawQuestions.some(hasStationMetadata) ? matchedPool : []);
    if (!sourcePool.length) {
      safeStorageSet(resolvedStorage, resolvedDeckKey, JSON.stringify([]));
      return [];
    }

    let usedQuestionIds = readJsonList(safeStorageGet(resolvedStorage, resolvedHistoryKey))
      .map((id) => String(id || ''))
      .filter(Boolean);

    if (forceNew && parsedExistingDeck.length) {
      const savedDeckIds = parsedExistingDeck.map(getQuestionId).filter(Boolean);
      usedQuestionIds = usedQuestionIds.concat(savedDeckIds);
    }

    usedQuestionIds = Array.from(new Set(usedQuestionIds));
    let availableQuestions = sourcePool.filter((question) => !usedQuestionIds.includes(getQuestionId(question)));

    if (!availableQuestions.length) {
      resolvedStorage.removeItem(resolvedHistoryKey);
      resolvedStorage.removeItem(resolvedDeckKey);
      usedQuestionIds = [];
      availableQuestions = sourcePool.slice();
    }

    const selectedQuestions = weightedShuffleQuestions(availableQuestions, preferDifficult)
      .slice(0, Math.min(Math.max(1, count), availableQuestions.length));
    const deck = selectedQuestions.map((question, index) => ({
      ...question,
      id: getQuestionId(question),
      _deckIndex: index
    }));

    const nextUsedIds = Array.from(new Set(usedQuestionIds.concat(deck.map((question) => question.id)).filter(Boolean)));
    safeStorageSet(resolvedStorage, resolvedDeckKey, JSON.stringify(deck));
    safeStorageSet(resolvedStorage, resolvedHistoryKey, JSON.stringify(nextUsedIds));
    return deck;
  }

  function clearQuestionDeck(stationKey, storage, playerId, historyKey, deckKey, options = {}) {
    const resolvedStorage = resolveStorage(storage);
    const resolvedPlayerId = resolvePlayerId(resolvedStorage, playerId);
    const resolvedHistoryKey = historyKey || `much_used_questions_${normalizeStationKey(stationKey)}_${resolvedPlayerId}`;
    const resolvedDeckKey = deckKey || `much_question_deck_${normalizeStationKey(stationKey)}_${resolvedPlayerId}`;
    resolvedStorage.removeItem(resolvedDeckKey);
    if (!options || options.preserveHistory !== true) {
      resolvedStorage.removeItem(resolvedHistoryKey);
    }
  }

  const api = {
    createQuestionDeck,
    clearQuestionDeck,
    questionMatchesStation,
    shuffleArray,
    weightedShuffleQuestions,
    getQuestionId,
    getDifficultyScore
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.MuchQuestionPool = api;
})(typeof window !== 'undefined' ? window : globalThis);
