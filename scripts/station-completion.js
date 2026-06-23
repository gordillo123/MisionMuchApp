(function () {
  var STORAGE_KEY = 'much_station_completion_notice';
  var STATION_NAMES = {
    '1': 'Entrada MUCH',
    '2': 'Espinosaurio',
    '3': 'Biodiversidad y Conocimiento',
    '4': 'Sala de Energía',
    '5': 'Desarrollo Sustentable',
    '6': 'Sbeel Dinosaurios'
  };
  var STATION_MESSAGES = {
    '1': {
      badge: 'Aventura iniciada',
      title: 'Tu misión científica ya comenzó',
      body: 'Excelente trabajo, explorador. Ya entraste al recorrido del MUCH y estás listo para descubrir estaciones, dinosaurios y nuevas aventuras.'
    },
    '2': {
      badge: 'Estación completada',
      title: '¡Excelente trabajo, explorador!',
      body: 'Has completado <strong>Espinosaurio</strong> y sigues avanzando en tu misión científica. Sigue aprendiendo y descubriendo nuevas aventuras.'
    },
    '3': {
      badge: 'Estación completada',
      title: '¡Excelente trabajo, explorador!',
      body: 'Has completado <strong>Biodiversidad y Conocimiento</strong> y tu aventura científica sigue creciendo. Cada respuesta te acerca a un nuevo descubrimiento.'
    },
    '4': {
      badge: 'Estación completada',
      title: '¡Excelente trabajo, explorador!',
      body: 'Has completado <strong>Sala de Energía</strong> y sigues iluminando tu misión científica. Continúa explorando para descubrir más sorpresas del museo.'
    },
    '5': {
      badge: 'Estación completada',
      title: '¡Excelente trabajo, explorador!',
      body: 'Has completado <strong>Desarrollo Sustentable</strong> y estás cada vez más cerca de terminar tu aventura científica. Sigue aprendiendo con entusiasmo.'
    },
    '6': {
      badge: 'Misión completada',
      title: '¡Excelente trabajo, explorador!',
      body: 'Has completado <strong>Sbeel Dinosaurios</strong> y cerraste tu misión científica con gran talento. Sigue celebrando todo lo que descubriste en el museo.'
    }
  };

  function getStationName(stationId, fallback) {
    var key = stationId == null ? '' : String(stationId);
    return STATION_NAMES[key] || fallback || 'esta estación';
  }

  function getCompletedStations() {
    try {
      return JSON.parse(localStorage.getItem('much_completed_stations') || '{}');
    } catch (error) {
      return {};
    }
  }

  function markCompletedLocally(options) {
    if (!options || options.passed === false || !options.stationId) return;

    try {
      var stationId = String(options.stationId);
      var completed = getCompletedStations();
      completed[stationId] = true;
      localStorage.setItem('much_completed_stations', JSON.stringify(completed));

      var nextStationId = options.nextStationId ? String(options.nextStationId) : '';
      var stationNumber = Number(stationId);
      if (!nextStationId && Number.isFinite(stationNumber)) {
        nextStationId = String(Math.min(6, stationNumber + 1));
      }

      if (nextStationId) {
        localStorage.setItem('much_current_station', nextStationId);
      }
    } catch (error) {
      console.warn('No se pudo marcar la estación como completada localmente:', error);
    }
  }

  function buildPayload(options) {
    options = options || {};

    var stationId = String(options.stationId || '');
    var stationName = getStationName(options.stationId, options.stationName);
    var stationCopy = STATION_MESSAGES[stationId] || null;
    var nextStationName = options.nextStationId
      ? getStationName(options.nextStationId, options.nextStationName)
      : (options.nextStationName || '');
    var isFinalStation = Boolean(options.isFinalStation || !nextStationName);
    var payload;

    if (isFinalStation) {
      payload = {
        badge: (stationCopy && stationCopy.badge) || 'Misión completada',
        title: (stationCopy && stationCopy.title) || '¡Excelente trabajo, explorador!',
        body: (stationCopy && stationCopy.body) || ('Has completado <strong>' + stationName + '</strong> y cerraste tu misión científica con éxito. Tu recompensa final ya está lista para reclamarse.'),
        detailLabel: 'Tu siguiente paso',
        detailValue: 'Regresa al mapa',
        ctaLabel: 'Volver al mapa',
        dismissLabel: 'Cerrar mensaje'
      };
    } else {
      payload = {
        badge: (stationCopy && stationCopy.badge) || 'Estación completada',
        title: (stationCopy && stationCopy.title) || '¡Excelente trabajo, explorador!',
        body: (stationCopy && stationCopy.body) || ('Has completado <strong>' + stationName + '</strong> y sigues avanzando en tu misión científica. Sigue aprendiendo y descubriendo nuevas aventuras.'),
        detailLabel: 'Siguiente aventura',
        detailValue: nextStationName || 'Continúa explorando',
        ctaLabel: 'Volver al mapa y continuar',
        dismissLabel: 'Cerrar mensaje'
      };
    }

    // estado de aprobación/paso: por defecto true, si options.passed === false entonces marcar como no completado
    payload.passed = !(options && options.passed === false);

    ['badge', 'title', 'body', 'detailLabel', 'detailValue', 'ctaLabel', 'dismissLabel'].forEach(function (key) {
      if (typeof options[key] === 'string' && options[key].trim() !== '') {
        payload[key] = options[key];
      }
    });

    return payload;
  }

  function buildCardHtml(payload, dismissible) {
    var sealClass = 'station-completion-card__seal';
    var sealContent = '&#10003;';
    if (payload && payload.passed === false) {
      sealClass += ' station-completion-card__seal--fail';
      sealContent = '&#10005;';
    }

    return [
      '<div class="station-completion-card' + (dismissible ? ' station-completion-card--dismissible' : '') + '">',
      dismissible
        ? '<button type="button" class="station-completion-card__close" aria-label="' + payload.dismissLabel + '">&times;</button>'
        : '',
      '<div class="station-completion-card__head">',
      '<div class="' + sealClass + '" aria-hidden="true">' + sealContent + '</div>',
      '<div class="station-completion-card__intro">',
      '<div class="station-completion-card__kicker">' + payload.badge + '</div>',
      '<h3 class="station-completion-card__title">' + payload.title + '</h3>',
      '</div>',
      '</div>',
      '<p class="station-completion-card__body">' + payload.body + '</p>',
      '<div class="station-completion-card__actions">',
      '<button type="button" class="station-completion-cta">' + payload.ctaLabel + '</button>',
      '</div>',
      '</div>'
    ].join('');
  }

  function bindCloseAction(scope, payload, onClose) {
    if (!scope || typeof onClose !== 'function') return;
    var closeButton = scope.querySelector('.station-completion-card__close');
    if (!closeButton) return;
    closeButton.addEventListener('click', function () {
      onClose(payload);
    });
  }

  function renderInline(target, options) {
    markCompletedLocally(options);
    var payload = buildPayload(options);
    if (!target) return payload;
    target.classList.add('station-completion-host');
    target.innerHTML = buildCardHtml(payload, true);
    bindCloseAction(target, payload, function () {
      clearInline(target);
      if (options && typeof options.onDismiss === 'function') {
        options.onDismiss(payload, target);
      } else {
        if (options && typeof options.onReturnToMap === 'function') {
          options.onReturnToMap(payload, target);
        } else if (typeof window.showView === 'function') {
          window.showView('viewPrep');
        } else {
          try {
            var mapParams = new URLSearchParams(window.location.search);
            mapParams.set('view', 'prep');
            window.location.href = '../index.html?' + mapParams.toString();
          } catch (e) {}
        }
      }
    });
    // Bind CTA in inline mode
    try {
      var ctaElInline = target.querySelector('.station-completion-cta');
      if (ctaElInline) {
        ctaElInline.addEventListener('click', function () {
          if (options && typeof options.onReturnToMap === 'function') {
            options.onReturnToMap(payload, target);
          } else if (typeof window.showView === 'function') {
            window.showView('viewPrep');
          } else {
            window.dispatchEvent(new CustomEvent('much:returnToMap', { detail: payload }));
            try {
              var mapParams = new URLSearchParams(window.location.search);
              mapParams.set('view', 'prep');
              window.location.href = '../index.html?' + mapParams.toString();
            } catch (e) {}
          }
          clearInline(target);
        });
      }
    } catch (e) {
      console.warn('Error binding inline CTA:', e);
    }
    return payload;
  }

  function clearInline(target, text) {
    if (!target) return;
    target.classList.remove('station-completion-host');
    target.innerHTML = '';
    if (typeof text === 'string') {
      target.textContent = text;
    }
  }

  function queueMapNotice(options) {
    clearPendingNotice();
    return buildPayload(options);
  }

  function clearPendingNotice() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('No se pudo limpiar el aviso pendiente:', error);
    }
  }


  function dismissMapNotice(node) {
    if (!node) return;
    node.classList.remove('show');
    window.setTimeout(function () {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
      if (document.body && !document.querySelector('.station-map-toast')) {
        document.body.classList.remove('station-map-toast-open');
      }
    }, 220);
  }

  function showPendingMapNotice() {
    clearPendingNotice();
    return null;
  }

  function showFloatingNotice(options) {
    if (!document.body) return null;
    markCompletedLocally(options);
    var payload = buildPayload(options);

    var activeNotice = document.querySelector('.station-map-toast');
    if (activeNotice) {
      dismissMapNotice(activeNotice);
    }

    var toast = document.createElement('aside');
    toast.className = 'station-map-toast';
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = buildCardHtml(payload, true);
    bindCloseAction(toast, payload, function () {
      dismissMapNotice(toast);
      if (options && typeof options.onDismiss === 'function') {
        options.onDismiss(payload, toast);
      } else {
        if (options && typeof options.onReturnToMap === 'function') {
          options.onReturnToMap(payload, toast);
        } else if (typeof window.showView === 'function') {
          window.showView('viewPrep');
        } else {
          try {
            var mapParams = new URLSearchParams(window.location.search);
            mapParams.set('view', 'prep');
            window.location.href = '../index.html?' + mapParams.toString();
          } catch (e) {}
        }
      }
    });

    // Bind CTA inside floating notice
    try {
      var ctaEl = toast.querySelector('.station-completion-cta');
      if (ctaEl) {
        ctaEl.addEventListener('click', function () {
          if (options && typeof options.onReturnToMap === 'function') {
            options.onReturnToMap(payload, toast);
          } else if (typeof window.showView === 'function') {
            window.showView('viewPrep');
          } else {
            window.dispatchEvent(new CustomEvent('much:returnToMap', { detail: payload }));
            try {
              var mapParams = new URLSearchParams(window.location.search);
              mapParams.set('view', 'prep');
              window.location.href = '../index.html?' + mapParams.toString();
            } catch (e) {}
          }
          dismissMapNotice(toast);
          if (options && typeof options.onDismiss === 'function') {
            options.onDismiss(payload, toast);
          }
        });
      }
    } catch (e) {
      console.warn('Error binding CTA for station completion:', e);
    }

    document.body.appendChild(toast);
    document.body.classList.add('station-map-toast-open');
    window.requestAnimationFrame(function () {
      toast.classList.add('show');
    });

    return payload;
  }

  window.MuchStationCompletion = {
    clearInline: clearInline,
    clearPendingNotice: clearPendingNotice,
    getStationName: getStationName,
    markCompletedLocally: markCompletedLocally,
    queueMapNotice: queueMapNotice,
    renderInline: renderInline,
    showFloatingNotice: showFloatingNotice,
    showPendingMapNotice: showPendingMapNotice
  };
})();
