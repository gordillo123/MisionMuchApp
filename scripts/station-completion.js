(function () {
  var STORAGE_KEY = 'much_station_completion_notice';
  var STATION_NAMES = {
    '1': 'Entrada MUCH',
    '2': 'Espinosaurio',
    '3': 'Biodiversidad y Conocimiento',
    '4': 'Sala de Energia',
    '5': 'Desarrollo Sustentable',
    '6': 'Sbeel Dinosaurios'
  };

  function getStationName(stationId, fallback) {
    var key = stationId == null ? '' : String(stationId);
    return STATION_NAMES[key] || fallback || 'esta estacion';
  }

  function buildPayload(options) {
    options = options || {};

    var stationName = getStationName(options.stationId, options.stationName);
    var nextStationName = options.nextStationId
      ? getStationName(options.nextStationId, options.nextStationName)
      : (options.nextStationName || '');
    var isFinalStation = Boolean(options.isFinalStation || !nextStationName);
    var payload;

    if (isFinalStation) {
      payload = {
        badge: 'Mision completada',
        title: 'Tu aventura en el MUCH ya esta completa',
        body: 'Completaste <strong>' + stationName + '</strong>. Cerraste todo el recorrido con exito y tu recompensa ya esta lista para reclamarse en el mapa.',
        detailLabel: 'Premio desbloqueado',
        detailValue: 'Listo para reclamarse',
        ctaLabel: 'Volver al mapa y reclamar'
      };
    } else {
      payload = {
        badge: 'Estacion superada',
        title: 'Lo lograste, tu aventura continua',
        body: 'Completaste <strong>' + stationName + '</strong>. Tu avatar ya puede avanzar a <strong>' + nextStationName + '</strong>, asi que celebra este logro y sigue descubriendo el museo.',
        detailLabel: 'Siguiente sala',
        detailValue: nextStationName,
        ctaLabel: 'Volver al mapa y continuar'
      };
    }

    ['badge', 'title', 'body', 'detailLabel', 'detailValue', 'ctaLabel'].forEach(function (key) {
      if (typeof options[key] === 'string' && options[key].trim() !== '') {
        payload[key] = options[key];
      }
    });

    return payload;
  }

  function buildCardHtml(payload) {
    return [
      '<div class="station-completion-card">',
      '<div class="station-completion-card__head">',
      '<div class="station-completion-card__seal" aria-hidden="true">✓</div>',
      '<div class="station-completion-card__intro">',
      '<div class="station-completion-card__kicker">' + payload.badge + '</div>',
      '<h3 class="station-completion-card__title">' + payload.title + '</h3>',
      '</div>',
      '</div>',
      '<p class="station-completion-card__body">' + payload.body + '</p>',
      '<div class="station-completion-card__detail">',
      '<span class="station-completion-card__detail-label">' + payload.detailLabel + '</span>',
      '<strong class="station-completion-card__detail-value">' + payload.detailValue + '</strong>',
      '</div>',
      '</div>'
    ].join('');
  }

  function renderInline(target, options) {
    var payload = buildPayload(options);
    if (!target) return payload;
    target.classList.add('station-completion-host');
    target.innerHTML = buildCardHtml(payload);
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload(options)));
    } catch (error) {
      console.warn('No se pudo guardar el aviso de estacion completada:', error);
    }
  }

  function clearPendingNotice() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('No se pudo limpiar el aviso pendiente:', error);
    }
  }

  function readPendingNotice() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      localStorage.removeItem(STORAGE_KEY);
      return JSON.parse(raw);
    } catch (error) {
      console.warn('No se pudo leer el aviso de estacion completada:', error);
      return null;
    }
  }

  function dismissMapNotice(node) {
    if (!node) return;
    node.classList.remove('show');
    window.setTimeout(function () {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }, 220);
  }

  function showPendingMapNotice() {
    var payload = readPendingNotice();
    if (!payload || !document.body) return;

    var activeNotice = document.querySelector('.station-map-toast');
    if (activeNotice) {
      activeNotice.remove();
    }

    var toast = document.createElement('aside');
    toast.className = 'station-map-toast';
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = [
      '<button type="button" class="station-map-toast__close" aria-label="Cerrar aviso">x</button>',
      buildCardHtml(payload)
    ].join('');

    var closeButton = toast.querySelector('.station-map-toast__close');
    if (closeButton) {
      closeButton.addEventListener('click', function () {
        dismissMapNotice(toast);
      });
    }

    document.body.appendChild(toast);
    window.requestAnimationFrame(function () {
      toast.classList.add('show');
    });

    window.setTimeout(function () {
      dismissMapNotice(toast);
    }, 5200);
  }

  window.MuchStationCompletion = {
    clearInline: clearInline,
    clearPendingNotice: clearPendingNotice,
    getStationName: getStationName,
    queueMapNotice: queueMapNotice,
    renderInline: renderInline,
    showPendingMapNotice: showPendingMapNotice
  };
})();
