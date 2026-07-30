(function () {
  const DEFAULT_BLOCK_DAYS = 7;
  const FAILED_ATTEMPT_LIMIT = 3;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const KEYS = {
    estacionesCompletadas: 'much_estaciones_completadas',
    palomitasCompletado: 'much_palomitas_completado',
    puntajeTotal: 'much_puntaje_total',
    intentosEstaciones: 'much_intentos_estaciones',
    intentosGenerales: 'much_intentos_generales',
    estadoRecorrido: 'much_estado_recorrido',
    premioSeleccionado: 'much_premio_seleccionado',
    boletoReclamado: 'much_boleto_reclamado',
    fechaFinalizacion: 'much_fecha_finalizacion',
    fechaProximoJuego: 'much_fecha_proximo_juego',
    motivoBloqueo: 'much_motivo_bloqueo',
    detalleBloqueo: 'much_detalle_bloqueo',
    datosBoleto: 'much_datos_boleto',
    estadoBotonReclamar: 'much_estado_boton_reclamar',
    avatarSeleccionado: 'much_avatar_seleccionado',
    configJuego: 'much_configuracion_juego',

    legacyCompletedStations: 'much_completed_stations',
    legacyCurrentStation: 'much_current_station',
    legacyPrize: 'much_quiz_prize',
    legacyRewardClaimed: 'much_mission_reward_claimed',
    legacyRewardChoice: 'much_mission_reward_ticket_choice',
    legacyUserTicket: 'much_user_ticket',
    legacySelectedAvatar: 'much_selected_avatar',
    legacyPlaytimeBlockMsg: 'much_playtime_block_msg'
  };

  const STATIONS = {
    '1': { id: '1', nombre: 'Taquilla', puntos: 10 },
    '2': { id: '2', nombre: 'Espinosaurio', puntos: 15 },
    '3': { id: '3', nombre: 'Biodiversidad', puntos: 10 },
    '4': { id: '4', nombre: 'Energía', puntos: 10 },
    '5': { id: '5', nombre: 'Desarrollo Sustentable', puntos: 10 },
    '6': { id: '6', nombre: 'SBEEL Dinosaurios', puntos: 10 }
  };

  const QUESTION_STATION_RULES = {
    '3': { minCorrect: 7, maxQuestions: 10 },
    '4': { minCorrect: 7, maxQuestions: 10 },
    '5': { minCorrect: 7, maxQuestions: 10 }
  };

  const DYNAMIC_STATION_RULES = {
    '1': { minScore: 10, minCorrect: 6, maxErrors: 0 },
    '2': { minScore: 15, minCorrect: 1, maxErrors: 0 },
    '6': { minScore: 1, minCorrect: 1, maxErrors: 0 }
  };

  const REQUIRED_REWARD_STATIONS = ['1', '2', '3', '4', '5', '6'];

  function storageAvailable() {
    try {
      const key = '__much_storage_test__';
      localStorage.setItem(key, '1');
      localStorage.removeItem(key);
      return true;
    } catch (_) {
      return false;
    }
  }

  const canUseStorage = storageAvailable();

  function getItem(key) {
    if (!canUseStorage) return null;
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function setItem(key, value) {
    if (!canUseStorage) return;
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn('[MuchLocalStorage] No se pudo guardar:', key, error);
    }
  }

  function removeItem(key) {
    if (!canUseStorage) return;
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }

  function parseJson(key, fallback) {
    const raw = getItem(key);
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    setItem(key, JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function toStationId(stationId) {
    return String(stationId || '').trim();
  }

  function getStation(stationId) {
    const id = toStationId(stationId);
    return STATIONS[id] || { id, nombre: `Estación ${id}`, puntos: 0 };
  }

  function getRequiredScore(stationId) {
    const station = getStation(stationId);
    return Math.max(1, toNumber(station.puntos, 10));
  }

  function getQuestionTotal(result = {}, correct = 0) {
    if (result.num_preguntas !== undefined) return Math.max(0, toNumber(result.num_preguntas, 0));
    if (result.totalPreguntas !== undefined) return Math.max(0, toNumber(result.totalPreguntas, 0));
    if (result.total !== undefined) return Math.max(0, toNumber(result.total, 0));
    if (result.errores !== undefined) return correct + Math.max(0, toNumber(result.errores, 0));
    return 10;
  }

  function getApprovalRequested(result = {}, options = {}) {
    if (result.aprobada !== undefined) return Boolean(result.aprobada);
    if (result.aprobado !== undefined) return Boolean(result.aprobado);
    return Boolean(options.assumeApproved);
  }

  function isQuestionStationApproved(stationId, result = {}, options = {}) {
    const id = toStationId(stationId);
    const rule = QUESTION_STATION_RULES[id];
    if (!rule) return null;

    const correct = toNumber(result.aciertos ?? result.num_correctas, 0);
    const total = getQuestionTotal(result, correct);
    return getApprovalRequested(result, options)
      && total > 0
      && total <= rule.maxQuestions
      && correct <= rule.maxQuestions
      && correct >= rule.minCorrect;
  }

  function hasStrictCompletionRule(stationId) {
    const id = toStationId(stationId);
    return Boolean(QUESTION_STATION_RULES[id] || DYNAMIC_STATION_RULES[id]);
  }

  function isDynamicStationApproved(stationId, result = {}, options = {}) {
    const id = toStationId(stationId);
    const rule = DYNAMIC_STATION_RULES[id];
    if (!rule) return null;

    const score = toNumber(result.puntaje ?? result.puntaje_total, 0);
    const correct = toNumber(result.aciertos ?? result.num_correctas, 0);
    const errors = toNumber(result.errores, 0);
    const errorsOk = rule.maxErrors === undefined || errors <= rule.maxErrors;
    return getApprovalRequested(result, options)
      && score >= rule.minScore
      && correct >= rule.minCorrect
      && errorsOk;
  }

  function isStationResultApproved(stationId, result = {}, options = {}) {
    const questionApproved = isQuestionStationApproved(stationId, result, options);
    if (questionApproved !== null) return questionApproved;

    const dynamicApproved = isDynamicStationApproved(stationId, result, options);
    if (dynamicApproved !== null) return dynamicApproved;

    return getApprovalRequested(result, options)
      && toNumber(result.puntaje ?? result.puntaje_total, 0) >= getRequiredScore(stationId);
  }

  function hasRequiredScore(stationId, score, extra = {}) {
    return isStationResultApproved(stationId, {
      ...extra,
      puntaje: score,
      aprobada: true
    }, { assumeApproved: true });
  }

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function parseDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function addDays(date, days) {
    const base = parseDate(date) || new Date();
    return new Date(base.getTime() + Math.max(1, Number(days) || DEFAULT_BLOCK_DAYS) * MS_PER_DAY);
  }

  function formatFechaMX(date) {
    const value = parseDate(date);
    if (!value) return '';
    return new Intl.DateTimeFormat('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(value);
  }

  function buildAttemptBlockMessage(stationName, date) {
    const dateText = formatFechaMX(date);
    return `Has agotado tus 3 intentos del recorrido. Tu acceso al juego ha sido bloqueado temporalmente.${dateText ? ` Podrás volver a jugar el ${dateText}.` : ''}`;
  }

  function getConfiguredBlockDays() {
    const config = parseJson(KEYS.configJuego, null);
    return Math.max(1, Number(config?.cantidad) || DEFAULT_BLOCK_DAYS);
  }

  function normalizeLegacyCompleted(value) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.keys(source).reduce((acc, stationId) => {
      if (source[stationId]) acc[toStationId(stationId)] = true;
      return acc;
    }, {});
  }

  function getCompletedRecords() {
    const records = parseJson(KEYS.estacionesCompletadas, {});
    const legacy = normalizeLegacyCompleted(parseJson(KEYS.legacyCompletedStations, {}));
    const merged = records && typeof records === 'object' ? { ...records } : {};

    Object.keys(legacy).forEach((stationId) => {
      if (!merged[stationId]) {
        if (hasStrictCompletionRule(stationId)) return;
        const station = getStation(stationId);
        merged[stationId] = {
          id: stationId,
          nombre: station.nombre,
          completada: true,
          puntaje: station.puntos,
          fecha_completado: null
        };
      }
    });

    return merged;
  }

  function getCompletedStationsMap() {
    const records = getCompletedRecords();
    return Object.keys(records).reduce((acc, stationId) => {
      const record = records[stationId];
      if (!record?.completada) return acc;
      if (hasStrictCompletionRule(stationId) && !isStationResultApproved(stationId, {
        ...record,
        aprobada: true
      }, { assumeApproved: true })) {
        return acc;
      }
      acc[stationId] = true;
      return acc;
    }, {});
  }

  function writeCompletedRecords(records) {
    const clean = {};
    const legacy = {};
    const checkmarks = {};

    Object.keys(records || {}).forEach((stationId) => {
      const record = records[stationId];
      if (!record?.completada) return;
      const station = getStation(stationId);
      if (hasStrictCompletionRule(stationId) && !isStationResultApproved(stationId, {
        ...record,
        aprobada: true
      }, { assumeApproved: true })) {
        return;
      }

      clean[stationId] = {
        id: stationId,
        nombre: record.nombre || station.nombre,
        completada: true,
        puntaje: Math.max(0, toNumber(record.puntaje, station.puntos)),
        aciertos: toNumber(record.aciertos, 0),
        errores: toNumber(record.errores, 0),
        fecha_completado: record.fecha_completado || nowIso()
      };
      legacy[stationId] = true;
      checkmarks[stationId] = true;
    });

    writeJson(KEYS.estacionesCompletadas, clean);
    writeJson(KEYS.legacyCompletedStations, legacy);
    writeJson(KEYS.palomitasCompletado, checkmarks);
    recalculateScore();
    updateRouteStateFromDates();
    dispatchProgressChanged();
  }

  function getAttempts() {
    const attempts = parseJson(KEYS.intentosEstaciones, {});
    return attempts && typeof attempts === 'object' ? attempts : {};
  }

  function writeAttempts(attempts) {
    writeJson(KEYS.intentosEstaciones, attempts || {});
  }

  function getGlobalAttempts() {
    const saved = parseJson(KEYS.intentosGenerales, null);
    const attempts = getAttempts();
    const fallbackFailures = Object.keys(attempts).reduce((sum, stationId) => {
      return sum + Math.max(0, toNumber(attempts[stationId]?.intentos_fallidos, 0));
    }, 0);
    const failedAttempts = Math.min(FAILED_ATTEMPT_LIMIT, Math.max(0, toNumber(saved?.intentos_fallidos, fallbackFailures)));
    const nextDate = saved?.fecha_puede_volver_jugar || getItem(KEYS.fechaProximoJuego) || '';
    const isBlocked = failedAttempts >= FAILED_ATTEMPT_LIMIT;
    return {
      intentos_fallidos: failedAttempts,
      limite_intentos: FAILED_ATTEMPT_LIMIT,
      intentos_restantes: Math.max(0, FAILED_ATTEMPT_LIMIT - failedAttempts),
      bloqueada: isBlocked,
      fallida: isBlocked,
      fecha_bloqueo: isBlocked ? (saved?.fecha_bloqueo || getItem(KEYS.fechaFinalizacion) || '') : '',
      fecha_puede_volver_jugar: isBlocked ? nextDate : ''
    };
  }

  function writeGlobalAttempts(info = {}) {
    const failedAttempts = Math.min(FAILED_ATTEMPT_LIMIT, Math.max(0, toNumber(info.intentos_fallidos, 0)));
    const blocked = failedAttempts >= FAILED_ATTEMPT_LIMIT;
    const current = getGlobalAttempts();
    const fechaBloqueo = blocked ? (info.fecha_bloqueo || current.fecha_bloqueo || nowIso()) : '';
    const fechaPuedeVolver = blocked
      ? (info.fecha_puede_volver_jugar || info.fecha_puede_volver || current.fecha_puede_volver_jugar || addDays(fechaBloqueo || nowIso(), getConfiguredBlockDays()).toISOString())
      : '';
    const record = {
      intentos_fallidos: failedAttempts,
      limite_intentos: FAILED_ATTEMPT_LIMIT,
      intentos_restantes: Math.max(0, FAILED_ATTEMPT_LIMIT - failedAttempts),
      bloqueada: blocked,
      fallida: blocked,
      fecha_bloqueo: fechaBloqueo,
      fecha_puede_volver_jugar: fechaPuedeVolver,
      updated_at: nowIso()
    };
    writeJson(KEYS.intentosGenerales, record);
    return record;
  }

  function hasFailedStation() {
    return getGlobalAttempts().intentos_fallidos >= FAILED_ATTEMPT_LIMIT;
  }

  function hasBlockedStation() {
    const global = getGlobalAttempts();
    const date = global.fecha_puede_volver_jugar ? new Date(global.fecha_puede_volver_jugar) : null;
    return global.bloqueada && (!date || date.getTime() > Date.now());
  }

  function getCurrentAttemptId(extra = {}) {
    return extra.id_intento
      || extra.idIntento
      || extra.attemptId
      || (typeof sessionStorage !== 'undefined' && (
        sessionStorage.getItem('much_current_attempt_id')
        || sessionStorage.getItem('ultimo_intento_id')
      ))
      || '';
  }

  function blockByFailedAttempts(stationId, attemptRecord = {}, options = {}) {
    const station = getStation(stationId);
    const stationName = 'el recorrido';
    const finishedAt = nowIso();
    const blockDays = options.dias_bloqueo || options.cantidad_bloqueo || getConfiguredBlockDays();
    const nextDate = options.fecha_puede_volver || addDays(finishedAt, blockDays).toISOString();
    const message = options.mensaje || buildAttemptBlockMessage(stationName, nextDate);
    writeGlobalAttempts({
      intentos_fallidos: FAILED_ATTEMPT_LIMIT,
      fecha_bloqueo: finishedAt,
      fecha_puede_volver_jugar: nextDate
    });
    const detail = {
      bloqueado: true,
      habilitado: false,
      motivo_bloqueo: 'intentos',
      id_estacion: stationId,
      estacion: station.nombre,
      intentos_fallidos: attemptRecord.intentos_fallidos || FAILED_ATTEMPT_LIMIT,
      limite_intentos: FAILED_ATTEMPT_LIMIT,
      fecha_finalizacion: finishedAt,
      fecha_puede_volver: nextDate,
      fecha_puede_volver_texto: formatFechaMX(nextDate),
      mensaje: message
    };

    setItem(KEYS.fechaFinalizacion, finishedAt);
    setItem(KEYS.fechaProximoJuego, nextDate);
    setItem(KEYS.motivoBloqueo, 'intentos');
    setItem(KEYS.detalleBloqueo, stationName);
    setItem(KEYS.legacyPlaytimeBlockMsg, message);
    setRouteState('bloqueado_temporalmente');
    setClaimButtonState('bloqueado');
    dispatchProgressChanged();

    try {
      window.dispatchEvent(new CustomEvent('much:playtimeBlocked', { detail }));
    } catch (_) {}

    return detail;
  }

  function recordStationAttempt(stationId, attempt = {}, options = {}) {
    const id = toStationId(stationId);
    if (!id) return null;

    const station = getStation(id);
    const attempts = getAttempts();
    const previous = attempts[id] || {};
    const completedMap = getCompletedStationsMap();
    const attemptId = getCurrentAttemptId({ ...attempt, ...options });
    const knownIds = Array.isArray(previous.ids_intentos) ? previous.ids_intentos.slice(-12) : [];
    const failedIds = Array.isArray(previous.ids_intentos_fallidos) ? previous.ids_intentos_fallidos.slice(-12) : [];
    const countAttempt = options.countAttempt === true;
    const shouldCount = countAttempt && (!attemptId || !knownIds.includes(String(attemptId)));
    const puntaje = Math.max(0, toNumber(attempt.puntaje ?? attempt.puntaje_total, previous.ultimo_puntaje || 0));
    const aprobadaSolicitada = attempt.aprobada !== undefined ? Boolean(attempt.aprobada)
      : (attempt.aprobado !== undefined ? Boolean(attempt.aprobado) : Boolean(previous.aprobada));
    const aprobada = isStationResultApproved(id, {
      ...attempt,
      puntaje,
      aprobada: aprobadaSolicitada
    });
    const previousApproved = isStationResultApproved(id, {
      ...previous,
      puntaje: previous.mejor_puntaje || previous.ultimo_puntaje || 0,
      aprobada: true
    }, { assumeApproved: true });
    const completedAlready = Boolean(
      completedMap[id]
      || (previous.completada && (!hasStrictCompletionRule(id) || previousApproved))
    );
    const completada = aprobada || completedAlready;
    const finalizada = attempt.finalizado !== undefined ? Boolean(attempt.finalizado)
      : (options.finalizado !== undefined ? Boolean(options.finalizado)
        : Boolean(aprobada || puntaje > 0 || toNumber(attempt.aciertos, 0) > 0 || toNumber(attempt.errores, 0) > 0));
    const countFailure = options.countFailure === true && finalizada && !aprobada && !completedAlready;
    const shouldCountFailure = countFailure && (!attemptId || !failedIds.includes(String(attemptId)));
    const globalBefore = getGlobalAttempts();
    const reportedFailures = toNumber(
      attempt.intentos_fallidos ?? attempt.limite_intentos,
      (attempt.bloqueada || attempt.fallida) ? FAILED_ATTEMPT_LIMIT : NaN
    );
    const nextGlobalFailures = completada
      ? globalBefore.intentos_fallidos
      : (Number.isFinite(reportedFailures)
        ? Math.max(globalBefore.intentos_fallidos, reportedFailures)
        : globalBefore.intentos_fallidos + (shouldCountFailure ? 1 : 0));
    const globalAfter = writeGlobalAttempts({ intentos_fallidos: nextGlobalFailures });
    const intentosFallidos = completada
      ? toNumber(previous.intentos_fallidos, 0)
      : Math.min(FAILED_ATTEMPT_LIMIT, Math.max(0, toNumber(previous.intentos_fallidos, 0) + (shouldCountFailure ? 1 : 0)));

    if (attemptId && !knownIds.includes(String(attemptId))) {
      knownIds.push(String(attemptId));
    }
    if (attemptId && shouldCountFailure && !failedIds.includes(String(attemptId))) {
      failedIds.push(String(attemptId));
    }

    const fallida = globalAfter.intentos_fallidos >= FAILED_ATTEMPT_LIMIT;
    const bloqueada = globalAfter.intentos_fallidos >= FAILED_ATTEMPT_LIMIT;
    const fechaBloqueo = bloqueada ? (globalAfter.fecha_bloqueo || attempt.fecha_bloqueo || nowIso()) : null;
    const fechaPuedeVolverJugar = bloqueada ? (globalAfter.fecha_puede_volver_jugar || attempt.fecha_puede_volver_jugar || attempt.fecha_puede_volver || addDays(fechaBloqueo || nowIso(), getConfiguredBlockDays()).toISOString()) : null;

    attempts[id] = {
      id_estacion: id,
      nombre: station.nombre,
      intentado: true,
      intentos: Math.max(1, toNumber(previous.intentos, 0) + (shouldCount ? 1 : 0)),
      ids_intentos: knownIds.slice(-12),
      intentos_fallidos: intentosFallidos,
      ids_intentos_fallidos: completada ? [] : failedIds.slice(-12),
      limite_intentos: FAILED_ATTEMPT_LIMIT,
      intentos_fallidos_globales: globalAfter.intentos_fallidos,
      intentos_restantes_globales: globalAfter.intentos_restantes,
      ultimo_id_intento: attemptId || previous.ultimo_id_intento || '',
      ultimo_puntaje: puntaje,
      mejor_puntaje: Math.max(toNumber(previous.mejor_puntaje, 0), puntaje),
      aciertos: toNumber(attempt.aciertos, previous.aciertos || 0),
      errores: toNumber(attempt.errores, previous.errores || 0),
      aprobada: Boolean(aprobada || (previous.aprobada && (!hasStrictCompletionRule(id) || previousApproved))),
      completada,
      fallida,
      bloqueada,
      fecha_bloqueo: fechaBloqueo,
      fecha_puede_volver_jugar: fechaPuedeVolverJugar,
      finalizado: Boolean(finalizada || previous.finalizado),
      debe_reintentar: !completada && !bloqueada,
      ultimo_intento_at: attempt.fecha || nowIso(),
      completado_at: completada ? (previous.completado_at || nowIso()) : previous.completado_at || null
    };

    writeAttempts(attempts);

    if (aprobada) {
      completeStation(id, {
        puntaje,
        aciertos: attempts[id].aciertos,
        errores: attempts[id].errores,
        fecha_completado: attempts[id].completado_at,
        nextStationId: options.nextStationId
      });
    } else {
      recalculateScore();
      dispatchProgressChanged();
    }

    if (bloqueada) {
      blockByFailedAttempts(id, attempts[id], { fecha_puede_volver: fechaPuedeVolverJugar });
    } else if (getItem(KEYS.estadoRecorrido) !== 'bloqueado_temporalmente' && !aprobada) {
      setRouteState('en_progreso');
    }

    return attempts[id];
  }

  function recordStationResult(stationId, result = {}, options = {}) {
    return recordStationAttempt(stationId, result, { ...options, countAttempt: false });
  }

  function completeStation(stationId, data = {}) {
    const id = toStationId(stationId);
    if (!id) return null;

    const station = getStation(id);
    const records = getCompletedRecords();
    const previous = records[id] || {};
    const puntaje = Math.max(
      toNumber(previous.puntaje, 0),
      toNumber(data.puntaje ?? data.puntaje_total, station.puntos)
    );

    if (!isStationResultApproved(id, {
      ...data,
      puntaje,
      aprobada: data.aprobada !== undefined ? data.aprobada : (data.aprobado !== undefined ? data.aprobado : true)
    }, { assumeApproved: true })) {
      recordStationAttempt(id, {
        ...data,
        aprobada: false,
        puntaje
      }, { countAttempt: false, countFailure: false });
      return null;
    }

    records[id] = {
      id,
      nombre: station.nombre,
      completada: true,
      puntaje,
      aciertos: toNumber(data.aciertos, previous.aciertos || 0),
      errores: toNumber(data.errores, previous.errores || 0),
      fecha_completado: data.fecha_completado || previous.fecha_completado || nowIso()
    };

    writeCompletedRecords(records);
    const attempts = getAttempts();
    if (attempts[id]) {
      attempts[id] = {
        ...attempts[id],
        aprobada: true,
        completada: true,
        debe_reintentar: false,
        intentos_fallidos: 0,
        ids_intentos_fallidos: [],
        completado_at: records[id].fecha_completado
      };
      writeAttempts(attempts);
    }

    const nextStationId = data.nextStationId || String(Math.min(6, Number(id) + 1));
    if (nextStationId) setCurrentStation(nextStationId);

    if (REQUIRED_REWARD_STATIONS.every((requiredId) => getCompletedStationsMap()[requiredId])) {
      if (getItem(KEYS.estadoRecorrido) !== 'bloqueado_temporalmente') {
        setRouteState('completado');
      }
      if (!getItem(KEYS.fechaFinalizacion)) {
        setItem(KEYS.fechaFinalizacion, nowIso());
      }
      setClaimButtonState(isTicketClaimed() ? 'bloqueado' : 'activo');
    } else if (getItem(KEYS.estadoRecorrido) !== 'bloqueado_temporalmente') {
      setRouteState('en_progreso');
    }

    return records[id];
  }

  function setCurrentStation(stationId) {
    const id = toStationId(stationId) || '1';
    setItem(KEYS.legacyCurrentStation, id);
    return id;
  }

  function getCurrentStation() {
    return getItem(KEYS.legacyCurrentStation) || '1';
  }

  function recalculateScore() {
    const records = getCompletedRecords();
    const attempts = getAttempts();
    const total = Object.keys(records).reduce((sum, stationId) => {
      const record = records[stationId];
      if (!record?.completada) return sum;
      if (hasStrictCompletionRule(stationId) && !isStationResultApproved(stationId, {
        ...record,
        aprobada: true
      }, { assumeApproved: true })) {
        return sum;
      }
      const station = getStation(stationId);
      const attemptScore = attempts[stationId]?.mejor_puntaje;
      const score = toNumber(attemptScore, toNumber(record.puntaje, station.puntos));
      return sum + Math.max(0, score);
    }, 0);

    setItem(KEYS.puntajeTotal, String(total));
    return total;
  }

  function getScore() {
    return toNumber(getItem(KEYS.puntajeTotal), recalculateScore());
  }

  function setRouteState(state) {
    if (!state) return;
    setItem(KEYS.estadoRecorrido, String(state));
  }

  function updateRouteStateFromDates() {
    if (getItem(KEYS.motivoBloqueo) === 'intentos' && !hasBlockedStation()) {
      removeItem(KEYS.fechaFinalizacion);
      removeItem(KEYS.fechaProximoJuego);
      removeItem(KEYS.motivoBloqueo);
      removeItem(KEYS.detalleBloqueo);
      removeItem(KEYS.legacyPlaytimeBlockMsg);
    }

    const nextDate = parseDate(getItem(KEYS.fechaProximoJuego));
    if (nextDate && nextDate.getTime() > Date.now()) {
      setRouteState('bloqueado_temporalmente');
      return 'bloqueado_temporalmente';
    }

    if (nextDate && nextDate.getTime() <= Date.now() && isTicketClaimed()) {
      setRouteState('disponible_para_volver_a_jugar');
      setClaimButtonState('bloqueado');
      return 'disponible_para_volver_a_jugar';
    }

    const completed = getCompletedStationsMap();
    const hasFailed = hasFailedStation();
    const hasBlocked = hasBlockedStation();
    if (REQUIRED_REWARD_STATIONS.every((stationId) => completed[stationId]) && !hasFailed && !hasBlocked) {
      setRouteState('completado');
      setClaimButtonState(isTicketClaimed() ? 'bloqueado' : 'activo');
      return 'completado';
    }

    setRouteState(Object.keys(completed).length ? 'en_progreso' : 'en_progreso');
    setClaimButtonState('bloqueado');
    return 'en_progreso';
  }

  function getRouteState() {
    updateRouteStateFromDates();
    return getItem(KEYS.estadoRecorrido) || 'en_progreso';
  }

  function setPrizeSelected(option = {}) {
    const key = String(option.key || option.destino || option.label || option.acceso || '').toLowerCase().includes('planetario')
      ? 'planetario'
      : 'much';
    const prize = {
      key,
      label: option.label || option.destino_boleto || (key === 'planetario' ? 'Planetario' : 'MUCH'),
      acceso: option.acceso || option.tipo_entrada || (key === 'planetario' ? 'Planetario' : 'MUCH'),
      lugar: option.lugar || (key === 'planetario' ? 'Planetario Tuxtla' : 'Museo Chiapas de Ciencia y Tecnología'),
      selectedAt: option.selectedAt || nowIso()
    };
    writeJson(KEYS.premioSeleccionado, prize);
    writeJson(KEYS.legacyRewardChoice, prize);
    return prize;
  }

  function getPrizeSelected() {
    return parseJson(KEYS.premioSeleccionado, null) || parseJson(KEYS.legacyRewardChoice, null);
  }

  function setClaimButtonState(state) {
    setItem(KEYS.estadoBotonReclamar, String(state || 'bloqueado'));
  }

  function getClaimButtonState() {
    updateRouteStateFromDates();
    return getItem(KEYS.estadoBotonReclamar) || 'bloqueado';
  }

  function setClaimFlowStarted(started) {
    if (started) {
      setItem(KEYS.legacyRewardClaimed, 'true');
      setClaimButtonState('procesando_reclamo');
    } else {
      removeItem(KEYS.legacyRewardClaimed);
      setClaimButtonState('activo');
    }
  }

  function hasClaimFlowStarted() {
    return getItem(KEYS.legacyRewardClaimed) === 'true';
  }

  function isTicketClaimed() {
    return getItem(KEYS.boletoReclamado) === 'true';
  }

  function sanitizeTicketData(ticket = {}) {
    const folio = ticket.folio || ticket.ticket || '';
    const qrToken = ticket.qr_token || ticket.token || '';
    const type = ticket.tipo_entrada || ticket.acceso || ticket.premio || ticket.tipo || '';
    const issued = ticket.valido_desde || ticket.fecha_emision || ticket.fecha_generacion || nowIso();
    const expires = ticket.valido_hasta || ticket.fecha_vencimiento || '';
    const status = ticket.estado || ticket.estatus || 'activo';

    return {
      folio,
      codigo_alfanumerico: ticket.codigo_alfanumerico || qrToken || folio,
      qr_token: qrToken,
      qr_data: ticket.qr_data || '',
      nombre_usuario: ticket.nombre_usuario || ticket.nombre || '',
      correo_usuario: ticket.correo_usuario || ticket.correo || '',
      telefono: ticket.telefono || ticket.telefono_usuario || '',
      tipo_boleto: type,
      tipo_entrada: type,
      fecha_emision: issued,
      fecha_vencimiento: expires,
      estado: status,
      destino_boleto: ticket.destino_boleto || ticket.destino || '',
      seccion_boleto: ticket.seccion_boleto || ticket.seccion || '',
      lugar_boleto: ticket.lugar_boleto || ticket.lugar || ticket.ubicacion || '',
      updated_at: nowIso()
    };
  }

  function storeTicketData(ticket = {}) {
    const sanitized = sanitizeTicketData(ticket);
    if (!sanitized.folio && !sanitized.qr_token) return null;

    writeJson(KEYS.datosBoleto, sanitized);
    writeJson(KEYS.legacyUserTicket, {
      folio: sanitized.folio,
      qr_token: sanitized.qr_token,
      qr_data: sanitized.qr_data,
      nombre_usuario: sanitized.nombre_usuario,
      correo_usuario: sanitized.correo_usuario,
      telefono: sanitized.telefono,
      tipo_entrada: sanitized.tipo_entrada,
      destino_boleto: sanitized.destino_boleto,
      seccion_boleto: sanitized.seccion_boleto,
      lugar_boleto: sanitized.lugar_boleto,
      valido_desde: sanitized.fecha_emision,
      valido_hasta: sanitized.fecha_vencimiento,
      estado: sanitized.estado
    });
    return sanitized;
  }

  function getTicketData() {
    return parseJson(KEYS.datosBoleto, null) || parseJson(KEYS.legacyUserTicket, null);
  }

  function claimTicket(ticket = {}, options = {}) {
    const data = storeTicketData(ticket) || getTicketData();
    const finishedAt = options.fecha_finalizacion || getItem(KEYS.fechaFinalizacion) || nowIso();
    const nextDate = options.fecha_proximo_juego
      || options.fecha_puede_volver
      || ticket.fecha_puede_volver
      || getItem(KEYS.fechaProximoJuego)
      || addDays(finishedAt, getConfiguredBlockDays()).toISOString();

    setItem(KEYS.boletoReclamado, 'true');
    setItem(KEYS.fechaFinalizacion, finishedAt);
    setItem(KEYS.fechaProximoJuego, nextDate);
    setItem(KEYS.motivoBloqueo, 'reclamo_boleto');
    removeItem(KEYS.detalleBloqueo);
    setItem(KEYS.legacyRewardClaimed, 'true');
    setClaimButtonState('bloqueado');
    updateRouteStateFromDates();
    dispatchProgressChanged();
    return data;
  }

  function completeRoute(finalization = {}) {
    const finishedAt = finalization.fecha_finalizacion || finalization.fecha_ganado || getItem(KEYS.fechaFinalizacion) || nowIso();
    const blockDays = finalization.dias_bloqueo || finalization.cantidad_bloqueo || finalization.config?.cantidad || getConfiguredBlockDays();
    const nextDate = finalization.fecha_puede_volver || finalization.fecha_puede_volver_jugar || addDays(finishedAt, blockDays).toISOString();

    setItem(KEYS.fechaFinalizacion, finishedAt);
    setItem(KEYS.fechaProximoJuego, nextDate);
    setItem(KEYS.motivoBloqueo, finalization.motivo_bloqueo || 'reclamo_boleto');
    if (finalization.detalle_bloqueo) setItem(KEYS.detalleBloqueo, finalization.detalle_bloqueo);
    if (finalization.config || finalization.dias_bloqueo || finalization.cantidad_bloqueo) {
      writeJson(KEYS.configJuego, {
        cantidad: blockDays,
        unidad: 'dias',
        updated_at: nowIso()
      });
    }

    if (finalization.mensaje) {
      setItem(KEYS.legacyPlaytimeBlockMsg, finalization.mensaje);
    }

    updateRouteStateFromDates();
    setClaimButtonState(isTicketClaimed() ? 'bloqueado' : 'activo');
    dispatchProgressChanged();
  }

  function syncPlaytimeState(state = {}) {
    if (state.config) {
      writeJson(KEYS.configJuego, {
        cantidad: state.config.cantidad || DEFAULT_BLOCK_DAYS,
        unidad: state.config.unidad || 'dias',
        bloqueo_activo: state.config.bloqueo_activo !== false,
        updated_at: state.config.updated_at || nowIso()
      });
    }

    if (state.bloqueado) {
      if (state.fecha_puede_volver) setItem(KEYS.fechaProximoJuego, state.fecha_puede_volver);
      if (state.mensaje) setItem(KEYS.legacyPlaytimeBlockMsg, state.mensaje);
      if (state.motivo_bloqueo) setItem(KEYS.motivoBloqueo, state.motivo_bloqueo);
      if (state.detalle_bloqueo || state.estacion) setItem(KEYS.detalleBloqueo, state.detalle_bloqueo || state.estacion);
      if ((state.motivo_bloqueo || state.motivo) === 'intentos') {
        writeGlobalAttempts({
          intentos_fallidos: state.intentos_fallidos || FAILED_ATTEMPT_LIMIT,
          fecha_bloqueo: state.fecha_finalizacion || state.fecha_bloqueo || nowIso(),
          fecha_puede_volver_jugar: state.fecha_puede_volver || state.fecha_puede_volver_jugar || ''
        });
      }
      setRouteState('bloqueado_temporalmente');
      setClaimButtonState('bloqueado');
      return;
    }

    if (state.nuevo_ciclo_iniciado) {
      resetProgress({ force: true, reason: 'new_cycle' });
      setRouteState('disponible_para_volver_a_jugar');
      return;
    }

    updateRouteStateFromDates();
  }

  function syncFromServerProgress(progressRows = []) {
    if (!Array.isArray(progressRows)) return;
    const records = {};
    const attempts = getAttempts();
    const globalBefore = getGlobalAttempts();
    let syncedFailures = globalBefore.intentos_fallidos;
    let syncedRetryDate = globalBefore.fecha_puede_volver_jugar;

    progressRows.forEach((row) => {
      const id = toStationId(row.id_estacion);
      if (!id) return;
      const station = getStation(id);
      const puntaje = Math.max(0, toNumber(row.puntaje, station.puntos));
      const aprobadaServidor = Boolean(row.aprobada || row.completada);
      const completada = hasStrictCompletionRule(id)
        ? isStationResultApproved(id, {
          ...row,
          puntaje,
          aprobada: aprobadaServidor
        }, { assumeApproved: true })
        : aprobadaServidor;
      const fallida = Boolean(row.fallida);
      const bloqueada = Boolean(row.bloqueada);
      const failedAttempts = completada
        ? 0
        : Math.min(FAILED_ATTEMPT_LIMIT, Math.max(0, toNumber(
          row.intentos_fallidos ?? row.limite_intentos,
          (fallida || bloqueada) ? FAILED_ATTEMPT_LIMIT : toNumber(attempts[id]?.intentos_fallidos, 0)
        )));
      const fechaBloqueo = row.fecha_bloqueo || null;
      const fechaPuedeVolverJugar = row.fecha_puede_volver_jugar || null;
      syncedFailures = Math.min(FAILED_ATTEMPT_LIMIT, Math.max(syncedFailures, failedAttempts));
      if (fechaPuedeVolverJugar) syncedRetryDate = fechaPuedeVolverJugar;

      attempts[id] = {
        ...(attempts[id] || {}),
        id_estacion: id,
        nombre: station.nombre,
        intentado: true,
        intentos: Math.max(1, toNumber(attempts[id]?.intentos, 0)),
        intentos_fallidos: failedAttempts,
        limite_intentos: FAILED_ATTEMPT_LIMIT,
        ultimo_puntaje: puntaje,
        mejor_puntaje: Math.max(toNumber(attempts[id]?.mejor_puntaje, 0), puntaje),
        aciertos: toNumber(row.aciertos, attempts[id]?.aciertos || 0),
        errores: toNumber(row.errores, attempts[id]?.errores || 0),
        aprobada: completada,
        completada,
        fallida,
        bloqueada,
        fecha_bloqueo: fechaBloqueo,
        fecha_puede_volver_jugar: fechaPuedeVolverJugar,
        debe_reintentar: !completada && !bloqueada,
        ultimo_intento_at: row.updated_at || row.fecha_inicio || nowIso(),
        completado_at: row.fecha_completado || attempts[id]?.completado_at || null
      };

      if (completada) {
        records[id] = {
          id,
          nombre: station.nombre,
          completada: true,
          puntaje,
          aciertos: toNumber(row.aciertos, 0),
          errores: toNumber(row.errores, 0),
          fecha_completado: row.fecha_completado || nowIso()
        };
      }
    });

    writeAttempts(attempts);
    writeGlobalAttempts({
      intentos_fallidos: syncedFailures,
      fecha_puede_volver_jugar: syncedRetryDate
    });
    writeCompletedRecords(records);

    const completedMap = getCompletedStationsMap();
    const nextStation = Object.keys(completedMap).reduce((next, stationId) => {
      return completedMap[stationId] && Number(stationId) >= next ? Number(stationId) + 1 : next;
    }, 1);
    setCurrentStation(String(Math.min(6, nextStation)));
  }

  function setAvatar(avatar) {
    if (!avatar || !avatar.id) return null;
    writeJson(KEYS.avatarSeleccionado, avatar);
    writeJson(KEYS.legacySelectedAvatar, avatar);
    return avatar;
  }

  function getAvatar() {
    return parseJson(KEYS.avatarSeleccionado, null) || parseJson(KEYS.legacySelectedAvatar, null);
  }

  function canResetProgress(options = {}) {
    if (options.force || options.adminOverride) return { ok: true };
    const nextDate = parseDate(getItem(KEYS.fechaProximoJuego));
    if (nextDate && nextDate.getTime() > Date.now()) {
      const dateText = new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'long',
        timeStyle: 'short'
      }).format(nextDate);
      return {
        ok: false,
        reason: 'reset_not_allowed',
        fecha_proximo_juego: nextDate.toISOString(),
        message: `Podrás reiniciar el recorrido el ${dateText}.`
      };
    }
    if (nextDate && nextDate.getTime() <= Date.now()) return { ok: true };
    if (getRouteState() === 'disponible_para_volver_a_jugar') return { ok: true };
    if (hasFailedStation() || hasBlockedStation()) return { ok: true };

    return {
      ok: false,
      reason: 'reset_not_allowed',
      fecha_proximo_juego: '',
      message: 'Solo puedes reiniciar cuando el recorrido este disponible nuevamente.'
    };
  }

  function resetProgress(options = {}) {
    const allowed = canResetProgress(options);
    if (!allowed.ok) return allowed;

    [
      KEYS.estacionesCompletadas,
      KEYS.palomitasCompletado,
      KEYS.intentosEstaciones,
      KEYS.intentosGenerales,
      KEYS.premioSeleccionado,
      KEYS.boletoReclamado,
      KEYS.fechaFinalizacion,
      KEYS.fechaProximoJuego,
      KEYS.motivoBloqueo,
      KEYS.detalleBloqueo,
      KEYS.datosBoleto,
      KEYS.legacyPrize,
      KEYS.legacyRewardClaimed,
      KEYS.legacyRewardChoice,
      KEYS.legacyUserTicket,
      KEYS.legacyPlaytimeBlockMsg
    ].forEach(removeItem);

    writeJson(KEYS.legacyCompletedStations, {});
    setItem(KEYS.puntajeTotal, '0');
    setCurrentStation('1');
    setClaimButtonState('bloqueado');
    setRouteState(options.reason === 'new_cycle' ? 'disponible_para_volver_a_jugar' : 'en_progreso');
    try {
      [
        'much_current_attempt_id',
        'much_current_attempt_station_id',
        'much_quiz_final_data',
        'much_quiz_start',
        'much_current_quiz_id',
        'much_cheat_count'
      ].forEach(key => sessionStorage.removeItem(key));
    } catch (_) {}
    dispatchProgressChanged();
    return { ok: true };
  }

  function dispatchProgressChanged() {
    try {
      window.dispatchEvent(new CustomEvent('much:localProgressChanged', {
        detail: {
          completed: getCompletedStationsMap(),
          score: toNumber(getItem(KEYS.puntajeTotal), 0),
          state: getItem(KEYS.estadoRecorrido) || 'en_progreso'
        }
      }));
    } catch (_) {}
  }

  function migrateLegacy() {
    const legacyCompleted = normalizeLegacyCompleted(parseJson(KEYS.legacyCompletedStations, {}));
    const currentRecords = parseJson(KEYS.estacionesCompletadas, {});
    if (Object.keys(legacyCompleted).length && !Object.keys(currentRecords || {}).length) {
      const records = {};
      Object.keys(legacyCompleted).forEach((stationId) => {
        const station = getStation(stationId);
        records[stationId] = {
          id: stationId,
          nombre: station.nombre,
          completada: true,
          puntaje: station.puntos,
          fecha_completado: null
        };
      });
      writeCompletedRecords(records);
    } else {
      writeCompletedRecords(getCompletedRecords());
    }

    const legacyAvatar = parseJson(KEYS.legacySelectedAvatar, null);
    if (legacyAvatar?.id && !getItem(KEYS.avatarSeleccionado)) setAvatar(legacyAvatar);

    const legacyChoice = parseJson(KEYS.legacyRewardChoice, null);
    if (legacyChoice && !getItem(KEYS.premioSeleccionado)) setPrizeSelected(legacyChoice);

    const legacyTicket = parseJson(KEYS.legacyUserTicket, null);
    if (legacyTicket?.folio && !getItem(KEYS.datosBoleto)) storeTicketData(legacyTicket);

    if (!getItem(KEYS.estadoRecorrido)) updateRouteStateFromDates();
  }

  const api = {
    KEYS,
    STATIONS,
    REQUIRED_REWARD_STATIONS,
    migrateLegacy,
    getCompletedStationsMap,
    getCompletedRecords,
    isStationCompleted: (stationId) => Boolean(getCompletedStationsMap()[toStationId(stationId)]),
    isStationFailed: (stationId) => {
      return getGlobalAttempts().intentos_fallidos >= FAILED_ATTEMPT_LIMIT;
    },
    getStationAttemptInfo: (stationId) => {
      const atts = getAttempts();
      const id = toStationId(stationId);
      const att = atts[id] || {};
      const global = getGlobalAttempts();
      const failedAttempts = global.intentos_fallidos;
      const isBlocked = global.bloqueada;
      return {
        id_estacion: id,
        intentos_fallidos: failedAttempts,
        intentos_fallidos_estacion: Math.min(FAILED_ATTEMPT_LIMIT, Math.max(0, toNumber(att.intentos_fallidos, 0))),
        limite_intentos: FAILED_ATTEMPT_LIMIT,
        intentos_restantes: global.intentos_restantes,
        debe_reintentar: !att.completada && failedAttempts < FAILED_ATTEMPT_LIMIT,
        fallida: isBlocked,
        bloqueada: isBlocked,
        fecha_puede_volver_jugar: isBlocked ? (global.fecha_puede_volver_jugar || att.fecha_puede_volver_jugar || '') : ''
      };
    },
    getGlobalAttemptInfo: getGlobalAttempts,
    isStationBlocked: (stationId) => {
      return hasBlockedStation();
    },
    getAttempts,
    completeStation,
    recordStationAttempt,
    recordStationResult,
    blockByFailedAttempts,
    syncFromServerProgress,
    setCurrentStation,
    getCurrentStation,
    recalculateScore,
    getScore,
    getRouteState,
    setRouteState,
    syncPlaytimeState,
    completeRoute,
    setPrizeSelected,
    getPrizeSelected,
    setClaimButtonState,
    getClaimButtonState,
    setClaimFlowStarted,
    hasClaimFlowStarted,
    isTicketClaimed,
    claimTicket,
    storeTicketData,
    getTicketData,
    setAvatar,
    getAvatar,
    canResetProgress,
    resetProgress
  };

  window.MuchLocalStorage = api;
  migrateLegacy();
})();
