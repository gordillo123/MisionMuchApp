// mysql-utils.js
// Utilidades de comunicacion del frontend con el Backend Express + MySQL.
// Toda la persistencia remota pasa por la API local.

const API_BASE_URL = window.location.hostname ? `http://${window.location.hostname}:3000` : 'http://127.0.0.1:3000';

// ==========================================
// CONFIGURACIÃƒâ€œN DE GEOLOCALIZACIÃƒâ€œN DEL MUSEO
// ==========================================
const DIRECCION_MUSEO = "Calz. Cerro Hueco 3000, Rivera Cerro Hueco, FSTSE, 29094 Tuxtla GutiÃƒÂ©rrez, Chiapas";
const LATITUD_MUSEO = 16.72248; // Coloca la latitud real aquÃƒÂ­ (ej: 16.72248)
const LONGITUD_MUSEO = -93.09100; // Coloca la longitud real aquÃƒÂ­ (ej: -93.09100)
const RADIO_PERMITIDO_METROS = 150;
const TIEMPO_VALIDACION_MINUTOS = 15; // 15 minutos de vigencia de verificaciÃƒÂ³n

function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Radio de la Tierra en metros
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distancia en metros
}

function obtenerSessionId() {
  let sessionId = localStorage.getItem('much_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
    localStorage.setItem('much_session_id', sessionId);
  }
  return sessionId;
}

async function guardarVerificacionUbicacion(datos) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/verificaciones-ubicacion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });
    if (!res.ok) throw new Error('Error en el servidor al guardar verificaciÃƒÂ³n');
    const data = await res.json();
    return data;
  } catch (e) {
    console.error('Error guardando verificaciÃƒÂ³n de ubicaciÃƒÂ³n en base de datos:', e.message);
    throw e;
  }
}

async function verificarUbicacionYRegistrar() {
  return new Promise((resolve) => {
    // VerificaciÃƒÂ³n de ubicaciÃƒÂ³n desactivada temporalmente para facilitar pruebas y juego remoto.
    // Esto evita requerir permisos GPS (que fallan en HTTP mÃƒÂ³vil) y confirmaciones.
    const verifLocal = {
      dentro_del_museo: true,
      timestamp: Date.now(),
      mensaje_resultado: 'UbicaciÃƒÂ³n vÃƒÂ¡lida (VerificaciÃƒÂ³n de geolocalizaciÃƒÂ³n desactivada temporalmente).'
    };
    sessionStorage.setItem('much_last_location_verification', JSON.stringify(verifLocal));
    
    resolve({ 
      ok: true, 
      dentro: true, 
      distancia: 0, 
      message: verifLocal.mensaje_resultado 
    });
  });
}

function comprobarUbicacionVigente() {
  try {
    // Simular verificaciÃƒÂ³n de ubicaciÃƒÂ³n exitosa temporalmente para pruebas y juego remoto
    const verifLocal = {
      dentro_del_museo: true,
      timestamp: Date.now(),
      mensaje_resultado: 'UbicaciÃƒÂ³n vÃƒÂ¡lida (VerificaciÃƒÂ³n de geolocalizaciÃƒÂ³n desactivada temporalmente).'
    };
    sessionStorage.setItem('much_last_location_verification', JSON.stringify(verifLocal));
    return { ok: true, message: 'UbicaciÃƒÂ³n vÃƒÂ¡lida (VerificaciÃƒÂ³n desactivada).' };
  } catch (e) {
    console.error('Error al comprobar vigencia de ubicaciÃƒÂ³n:', e);
    return { ok: true, message: 'UbicaciÃƒÂ³n vÃƒÂ¡lida (VerificaciÃƒÂ³n desactivada).' };
  }
}

function asegurarUbicacionVigente() {
  const estado = comprobarUbicacionVigente();
  if (!estado.ok) {
    throw new Error('AcciÃƒÂ³n bloqueada: ' + estado.message);
  }
}

let cachedPlaytimeEstado = null;
let cachedPlaytimeAt = 0;
const PLAYTIME_CACHE_MS = 15000;

function sincronizarCicloJuegoLocal(estado) {
  const cicloId = estado?.ciclo_juego_id;
  if (!cicloId) return false;

  const cicloGuardado = localStorage.getItem('much_playtime_cycle_id');
  if (cicloGuardado === cicloId) return false;

  localStorage.setItem('much_playtime_cycle_id', cicloId);
  if (window.MuchLocalStorage?.resetProgress) {
    window.MuchLocalStorage.resetProgress({ force: true, reason: 'new_cycle' });
  } else {
    localStorage.setItem('much_completed_stations', '{}');
    localStorage.setItem('much_current_station', '1');
    localStorage.removeItem('much_quiz_prize');
    localStorage.removeItem('much_mission_reward_claimed');
    localStorage.removeItem('much_mission_reward_ticket_choice');
  }
  sessionStorage.removeItem('much_current_attempt_id');
  sessionStorage.removeItem('much_quiz_final_data');
  window.dispatchEvent(new CustomEvent('much:newPlayCycle', { detail: estado }));
  return true;
}

async function consultarEstadoBloqueoJuego(force = false) {
  const user = obtenerUsuarioLocal();
  if (!user) {
    return { bloqueado: false, habilitado: true };
  }

  if (!force && cachedPlaytimeEstado && (Date.now() - cachedPlaytimeAt) < PLAYTIME_CACHE_MS) {
    return cachedPlaytimeEstado;
  }

  try {
    const userId = user.id_usuario || user.id;
    const res = await fetch(`${API_BASE_URL}/api/juego/estado-bloqueo`, {
      headers: { 'x-user-id': String(userId) }
    });

    if (!res.ok) {
      return { bloqueado: false, habilitado: true };
    }

    const estado = await res.json();
    sincronizarCicloJuegoLocal(estado);
    window.MuchLocalStorage?.syncPlaytimeState?.(estado);
    cachedPlaytimeEstado = estado;
    cachedPlaytimeAt = Date.now();
    return estado;
  } catch (error) {
    cachedPlaytimeAt = Date.now();
    console.error('Error consultando bloqueo de juego:', error);
    return cachedPlaytimeEstado || { bloqueado: false, habilitado: true };
  }
}

function invalidarCacheBloqueoJuego() {
  cachedPlaytimeEstado = null;
  cachedPlaytimeAt = 0;
}

function inferirIntentoFinalizado(intento = {}) {
  if (intento.finalizado !== undefined) return Boolean(intento.finalizado);
  return Boolean(intento.aprobado || intento.aprobada)
    || Number(intento.puntaje || intento.puntaje_total || 0) > 0
    || Number(intento.aciertos || 0) > 0
    || Number(intento.errores || 0) > 0;
}

function sincronizarBloqueoPorIntentos(data = {}) {
  if (!data.bloqueo?.bloqueado) return false;

  const b = data.bloqueo;
  if (b.tipo === 'estacion') {
    const idEst = b.id_estacion;
    if (window.MuchLocalStorage?.recordStationAttempt) {
      window.MuchLocalStorage.recordStationAttempt(idEst, {
        fallida: true,
        bloqueada: true,
        fecha_bloqueo: b.fecha_finalizacion,
        fecha_puede_volver: b.fecha_puede_volver
      });
    }

    if (window.MuchStationCompletion?.showFloatingNotice) {
      window.MuchStationCompletion.showFloatingNotice({
        badge: 'EstaciÃƒÂ³n bloqueada',
        title: 'LÃƒÂ­mite de intentos superado',
        body: `Has agotado tus 3 intentos en esta estaciÃƒÂ³n. EstarÃƒÂ¡ bloqueada hasta el <b>${b.fecha_puede_volver_texto}</b>.<br><br>Puedes seguir jugando en las demÃƒÂ¡s estaciones.`,
        ctaLabel: 'Regresar al mapa',
        onCta: () => {
          if (typeof showView === 'function') {
            showView('viewPrep');
          }
        }
      });
    } else {
      alert(`Has superado el lÃƒÂ­mite de intentos en esta estaciÃƒÂ³n. EstarÃƒÂ¡ bloqueada hasta el ${b.fecha_puede_volver_texto}.`);
      if (typeof showView === 'function') {
        showView('viewPrep');
      }
    }
    return true;
  }

  const estado = {
    ...b,
    bloqueado: true,
    habilitado: false,
    motivo_bloqueo: b.motivo_bloqueo || 'intentos'
  };
  invalidarCacheBloqueoJuego();
  cachedPlaytimeEstado = estado;
  cachedPlaytimeAt = Date.now();
  window.MuchLocalStorage?.syncPlaytimeState?.(estado);
  mostrarAvisoBloqueoJuego(estado);
  return true;
}

function mostrarAvisoBloqueoJuego(estado) {
  const fecha = estado?.fecha_puede_volver_texto || '';
  const esBloqueoPorIntentos = estado?.motivo_bloqueo === 'intentos';
  const mensaje = estado?.mensaje || (esBloqueoPorIntentos
    ? `Has agotado tus 3 intentos en esta estaciÃƒÂ³n. Tu acceso al juego ha sido bloqueado temporalmente. PodrÃƒÂ¡s volver a jugar despuÃƒÂ©s de una semana.`
    : fecha
    ? `Ã‚Â¡Ya completaste tu aventura!\nTu boleto fue generado correctamente.\nPodrÃƒÂ¡s volver a jugar el ${fecha}.`
    : 'Tu misiÃƒÂ³n ya fue completada. Debes esperar para comenzar una nueva aventura.');
  if (window.MuchStationCompletion?.showFloatingNotice) {
    window.MuchStationCompletion.showFloatingNotice({
      badge: esBloqueoPorIntentos ? 'Limite de intentos' : 'Ã¢ÂÂ³ MisiÃƒÂ³n completada',
      title: esBloqueoPorIntentos ? 'Juego bloqueado temporalmente' : 'Ã‚Â¡Aventura completada!',
      body: mensaje.replace(/\n/g, '<br>'),
      ctaLabel: 'Entendido'
    });
  } else {
    alert(mensaje);
  }
}

function mostrarAvisoFinalizacionJuego(finalizacion) {
  if (!finalizacion?.recorrido_completado || !finalizacion.fecha_puede_volver_texto) return;
  const fecha = finalizacion.fecha_puede_volver_texto;
  const mensaje = `Ã‚Â¡Ya completaste tu aventura!\nTu boleto fue generado correctamente.\nPodrÃƒÂ¡s volver a jugar el ${fecha}.`;
  localStorage.setItem('much_playtime_block_msg', finalizacion.mensaje || mensaje);
  window.MuchLocalStorage?.completeRoute?.(finalizacion);
  invalidarCacheBloqueoJuego();

  if (window.MuchStationCompletion?.showFloatingNotice) {
    window.MuchStationCompletion.showFloatingNotice({
      badge: 'Ã°Å¸Ââ€  Aventura completada',
      title: 'Ã‚Â¡Aventura completada!',
      body: mensaje.replace(/\n/g, '<br>'),
      ctaLabel: 'Ver mi recompensa'
    });
  } else {
    alert(mensaje);
  }
}

async function asegurarJuegoPermitido() {
  const estado = await consultarEstadoBloqueoJuego(true);
  const bloqueoLocal = window.MuchLocalStorage?.getRouteState?.() === 'bloqueado_temporalmente';
  if (estado.bloqueado || bloqueoLocal) {
    if (!estado.bloqueado && bloqueoLocal) {
      estado.bloqueado = true;
      estado.habilitado = false;
      estado.fecha_puede_volver = localStorage.getItem('much_fecha_proximo_juego') || '';
      estado.mensaje = localStorage.getItem('much_playtime_block_msg') || 'Tu recorrido sigue bloqueado temporalmente.';
      estado.motivo_bloqueo = localStorage.getItem('much_motivo_bloqueo') || estado.motivo_bloqueo;
    }
    mostrarAvisoBloqueoJuego(estado);
    const error = new Error(estado.mensaje || 'usuario_bloqueado');
    error.code = 'usuario_bloqueado';
    throw error;
  }
  return estado;
}

async function manejarRespuestaBloqueoJuego(res) {
  if (res.status !== 403) return false;
  try {
    const data = await res.json();
    if (data.error === 'usuario_bloqueado') {
      invalidarCacheBloqueoJuego();
      window.MuchLocalStorage?.syncPlaytimeState?.({ ...data, bloqueado: true, habilitado: false });
      mostrarAvisoBloqueoJuego(data);
      const error = new Error(data.mensaje || 'usuario_bloqueado');
      error.code = 'usuario_bloqueado';
      throw error;
    }
  } catch (error) {
    if (error.code === 'usuario_bloqueado') throw error;
  }
  return false;
}

async function consultarUltimaVerificacion() {
  const user = obtenerUsuarioLocal();
  const userId = user ? (user.id_usuario || user.id) : null;
  const sessionId = obtenerSessionId();

  if (!userId && !sessionId) return null;

  try {
    const params = new URLSearchParams();
    if (userId) params.append('user_id', userId);
    if (sessionId) params.append('session_id', sessionId);

    const res = await fetch(`${API_BASE_URL}/api/verificaciones-ubicacion/ultima?${params.toString()}`);
    if (!res.ok) throw new Error('Error al obtener la ÃƒÂºltima verificaciÃƒÂ³n');
    return await res.json();
  } catch (e) {
    console.error('Error al consultar ÃƒÂºltima verificaciÃƒÂ³n:', e);
    return null;
  }
}

async function intentarRestaurarVerificacionDesdeServidor() {
  // Deshabilitado por solicitud del usuario para forzar solicitud de GPS en cada sesiÃƒÂ³n nueva
  return { ok: false };
}


async function initMySQLApi() {
  return { apiBaseUrl: API_BASE_URL };
}

function obtenerUsuarioLocal() {
  try {
    const userJson = localStorage.getItem('much_google_user');
    return userJson ? JSON.parse(userJson) : null;
  } catch (error) {
    console.error('Error leyendo usuario de localStorage:', error);
    return null;
  }
}

function obtenerIdUsuarioLocal(user = obtenerUsuarioLocal()) {
  return user ? (user.id_usuario || user.id || null) : null;
}

async function manejarFalloSync(res, fallbackMessage) {
  await manejarRespuestaBloqueoJuego(res);
  let detail = '';
  try {
    const data = await res.clone().json();
    detail = data.error || data.mensaje || '';
  } catch (_) {}
  console.info('[Sync]', fallbackMessage, detail || `HTTP ${res.status}`);
  return null;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

function guardarUsuarioSesion(data) {
  const source = data?.user || data;
  if (!source?.id_usuario) return null;
  const sessionUser = normalizarUsuarioMySQL(source);
  localStorage.setItem('much_google_user', JSON.stringify(sessionUser));
  return sessionUser;
}

async function obtenerSesionActual() {
  try {
    const data = await fetchJson(`${API_BASE_URL}/api/auth/session`);
    const user = guardarUsuarioSesion(data);
    return user ? { user } : null;
  } catch (error) {
    localStorage.removeItem('much_google_user');
    return null;
  }
}

async function obtenerUsuarioActual() {
  const session = await obtenerSesionActual();
  return session?.user || null;
}

function cargarGoogleIdentityServices() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity-services]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Error de conexion con Google.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentityServices = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Error de conexion con Google.'));
    document.head.appendChild(script);
  });
}

async function obtenerGoogleClientId() {
  const data = await fetchJson(`${API_BASE_URL}/api/auth/config`);
  if (!data.googleClientId) throw new Error('Google Client ID no esta configurado en el backend.');
  return data.googleClientId;
}

async function autenticarCredentialGoogle(credential) {
  const data = await fetchJson(`${API_BASE_URL}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential })
  });
  const user = guardarUsuarioSesion(data);
  const sessionId = localStorage.getItem('much_session_id');
  sessionStorage.removeItem('much_last_location_verification');
  if (user?.id_usuario || sessionId) {
    try {
      await fetch(`${API_BASE_URL}/api/verificaciones-ubicacion/invalidar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id_usuario, session_id: sessionId })
      });
    } catch (error) {
      console.info('No se pudo invalidar ubicacion previa:', error.message);
    }
  }
  return user;
}

async function iniciarSesionConGoogle() {
  const loginNote = document.getElementById('loginNote');
  if (loginNote) loginNote.innerText = 'Abriendo Google...';
  window.location.href = `${API_BASE_URL}/api/auth/google/start`;
  return null;
}
async function cerrarSesion(options = {}) {
  const user = obtenerUsuarioLocal();
  const userId = user ? (user.id_usuario || user.id) : null;
  const sessionId = localStorage.getItem('much_session_id');
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch (error) {
    console.info('No se pudo cerrar sesion en backend:', error.message);
  }
  if (userId || sessionId) {
    try {
      await fetch(`${API_BASE_URL}/api/verificaciones-ubicacion/invalidar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, session_id: sessionId })
      });
    } catch (e) {
      console.error('Error al invalidar ubicacion en el servidor:', e);
    }
  }
  const lugarSeguro = localStorage.getItem('much_lugar_seguro');
  localStorage.clear();
  sessionStorage.clear();
  if (lugarSeguro) localStorage.setItem('much_lugar_seguro', lugarSeguro);
  if (options.preserveAdminNav) sessionStorage.setItem('much_internal_navigation', 'true');
  if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect();
  if (options.redirectTo) window.location.replace(options.redirectTo);
  else if (options.reload !== false) window.location.reload();
  return true;
}

function normalizarUsuarioMySQL(user) {
  if (!user) return null;
  return {
    id: user.id_usuario || user.id,
    id_usuario: user.id_usuario || user.id,
    name: user.nombre || user.name || user.correo || user.email,
    nombre: user.nombre || user.name || '',
    email: user.correo || user.email || '',
    correo: user.correo || user.email || '',
    google_id: user.google_id || '',
    picture: user.avatar_url || user.picture || '',
    avatar_url: user.avatar_url || user.picture || '',
    roles: Array.isArray(user.roles) && user.roles.length ? user.roles : ['usuario'],
    activo: user.activo !== false,
    acepto_privacidad: Boolean(user.acepto_privacidad),
    privacidad_aceptada_en: user.privacidad_aceptada_en || null
  };
}

async function verificarUsuarioEnTabla() {
  const user = await obtenerUsuarioActual();
  return user || null;
}

function usuarioTieneConsentimientoLocal(user = obtenerUsuarioLocal()) {
  return Boolean(user?.acepto_privacidad);
}

function actualizarUsuarioLocalConsentimiento(consentimiento) {
  const user = obtenerUsuarioLocal();
  if (!user) return null;
  const actualizado = {
    ...user,
    acepto_privacidad: Boolean(consentimiento.acepto_privacidad),
    privacidad_aceptada_en: consentimiento.privacidad_aceptada_en || user.privacidad_aceptada_en || null
  };
  localStorage.setItem('much_google_user', JSON.stringify(actualizado));
  return actualizado;
}

function aceptarConsentimientoPrivacidadLocalPendiente() {
  const aceptadoEn = new Date().toISOString();
  const actualizado = actualizarUsuarioLocalConsentimiento({
    acepto_privacidad: true,
    privacidad_aceptada_en: aceptadoEn
  });
  localStorage.setItem('much_privacy_consent_pending_sync', 'true');
  return actualizado;
}

async function consultarConsentimientoPrivacidad(user = obtenerUsuarioLocal()) {
  const userId = obtenerIdUsuarioLocal(user);
  if (!userId) return null;

  const res = await fetch(`${API_BASE_URL}/api/usuarios/${userId}/privacy-consent`);
  if (!res.ok) {
    const error = new Error('No se pudo consultar el consentimiento de privacidad.');
    error.status = res.status;
    throw error;
  }
  const data = await res.json();
  actualizarUsuarioLocalConsentimiento(data);
  return data;
}

function crearModalConsentimientoPrivacidad() {
  let modal = document.getElementById('much-privacy-consent-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'much-privacy-consent-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'muchPrivacyTitle');
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 1000000;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 18px;
    background: rgba(3, 8, 24, 0.88);
    backdrop-filter: blur(12px);
    font-family: 'Outfit', 'Inter', system-ui, sans-serif;
  `;
  modal.innerHTML = `
    <div style="
      width: min(94vw, 520px);
      max-height: min(92vh, 720px);
      overflow: auto;
      background: #101936;
      color: #f7fafc;
      border: 1px solid rgba(124, 179, 255, 0.35);
      border-radius: 16px;
      box-shadow: 0 24px 70px rgba(0,0,0,0.55);
      padding: 26px;
    ">
      <div style="display: grid; gap: 10px; margin-bottom: 20px;">
        <p style="margin: 0; color: #f6c453; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;">Acceso requerido</p>
        <h2 id="muchPrivacyTitle" style="margin: 0; font-size: clamp(24px, 5vw, 34px); line-height: 1.08;">Aviso de privacidad</h2>
        <p style="margin: 0; color: #c7d2fe; font-size: 15px; line-height: 1.5;">
          Para continuar con MisiÃƒÂ³n MUCH necesitamos tu aceptaciÃƒÂ³n del uso de datos de la cuenta para guardar progreso, premios y actividad de juego.
        </p>
      </div>

      <form id="muchPrivacyForm" style="display: grid; gap: 16px;">
        <label style="
          display: grid;
          grid-template-columns: 22px 1fr;
          gap: 11px;
          align-items: start;
          color: #e2e8f0;
          font-size: 14px;
          line-height: 1.45;
        ">
          <input id="muchPrivacyCheck" type="checkbox" style="width: 18px; height: 18px; margin-top: 2px;">
          <span>Acepto los terminos y condiciones de privacidad, y autorizo el tratamiento de mis datos para operar mi cuenta y progreso dentro de la aplicacion.</span>
        </label>

        <p id="muchPrivacyError" style="display: none; margin: 0; color: #fecaca; background: rgba(220, 38, 38, 0.16); border: 1px solid rgba(248, 113, 113, 0.35); border-radius: 10px; padding: 10px 12px; font-size: 13px;"></p>

        <button id="muchPrivacyAccept" type="submit" disabled style="
          width: 100%;
          min-height: 46px;
          border: 0;
          border-radius: 10px;
          background: linear-gradient(90deg, #f6c453, #f97316);
          color: #111827;
          font-weight: 900;
          font-size: 15px;
          cursor: pointer;
          opacity: 0.45;
        ">Aceptar y continuar</button>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function mostrarModalConsentimientoPrivacidad() {
  return new Promise((resolve, reject) => {
    const user = obtenerUsuarioLocal();
    const userId = obtenerIdUsuarioLocal(user);
    if (!userId) {
      reject(new Error('No hay usuario autenticado para guardar consentimiento.'));
      return;
    }

    const modal = crearModalConsentimientoPrivacidad();
    const form = modal.querySelector('#muchPrivacyForm');
    const privacyCheck = modal.querySelector('#muchPrivacyCheck');
    const acceptButton = modal.querySelector('#muchPrivacyAccept');
    const errorEl = modal.querySelector('#muchPrivacyError');

    const setError = (message) => {
      errorEl.textContent = message || '';
      errorEl.style.display = message ? 'block' : 'none';
    };

    const updateState = () => {
      const valid = privacyCheck.checked;
      acceptButton.disabled = !valid;
      acceptButton.style.opacity = valid ? '1' : '0.45';
      acceptButton.style.cursor = valid ? 'pointer' : 'not-allowed';
    };

    privacyCheck.addEventListener('change', updateState);

    form.onsubmit = async (event) => {
      event.preventDefault();
      updateState();
      if (acceptButton.disabled) return;

      acceptButton.disabled = true;
      acceptButton.textContent = 'Guardando...';
      setError('');

      try {
        const res = await fetch(`${API_BASE_URL}/api/usuarios/${userId}/privacy-consent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            acepto_privacidad: true
          })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'No se pudo guardar el consentimiento.');
        }

        actualizarUsuarioLocalConsentimiento(data);
        modal.style.display = 'none';
        resolve(data);
      } catch (error) {
        if (error instanceof TypeError && String(error.message || '').toLowerCase().includes('fetch')) {
          aceptarConsentimientoPrivacidadLocalPendiente();
          console.warn('[Privacidad] Backend no disponible; consentimiento guardado localmente para sincronizar despuÃƒÂ©s.');
          modal.style.display = 'none';
          resolve({ acepto_privacidad: true, privacidad_aceptada_en: new Date().toISOString(), pendiente_sync: true });
          return;
        }

        setError(error.message || 'No se pudo guardar el consentimiento.');
        acceptButton.disabled = false;
        acceptButton.textContent = 'Aceptar y continuar';
        updateState();
      }
    };

    modal.style.display = 'flex';
    privacyCheck.focus();
    updateState();
  });
}

async function asegurarConsentimientoPrivacidad() {
  const user = obtenerUsuarioLocal();
  if (!user) return false;
  if (usuarioTieneConsentimientoLocal(user)) return true;

  try {
    const consentimiento = await consultarConsentimientoPrivacidad(user);
    if (consentimiento?.completo) return true;
  } catch (error) {
    console.info('[Privacidad] Se solicitara consentimiento localmente.', error.message);
  }

  await mostrarModalConsentimientoPrivacidad();
  return true;
}

// Consultar estaciones activas
async function consultarEstaciones() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/estaciones`);
    if (!res.ok) throw new Error('Error al consultar estaciones.');
    return await res.json();
  } catch (error) {
    console.error('Error al consultar estaciones:', error.message);
    return [];
  }
}

// Comprobar si una estaciÃƒÂ³n especÃƒÂ­fica estÃƒÂ¡ activa
async function comprobarEstacionActiva(estacionId) {
  try {
    const estaciones = await consultarEstaciones();
    if (!estaciones || estaciones.length === 0) return true; // Fallback
    return estaciones.some(e => Number(e.id_estacion) === Number(estacionId));
  } catch (err) {
    console.error('Error en comprobarEstacionActiva:', err);
    return true; // Fallback
  }
}

// Guardar progreso del usuario en una estaciÃƒÂ³n
async function guardarProgresoUsuario(estacionId, extra = {}) {
  asegurarUbicacionVigente();
  await asegurarJuegoPermitido();
  const user = obtenerUsuarioLocal();
  const userId = obtenerIdUsuarioLocal(user);
  if (!userId) return null;

  const puntaje = Number(extra.puntaje || 0);
  const aciertos = Number(extra.aciertos || 0);
  const errores = Number(extra.errores || 0);
  const aprobada = extra.aprobada !== undefined ? Boolean(extra.aprobada) : true;

  try {
    const res = await fetch(`${API_BASE_URL}/api/progreso/completar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(userId)
      },
      body: JSON.stringify({
        id_usuario: userId,
        id_estacion: Number(estacionId),
        puntaje,
        aciertos,
        errores,
        aprobada
      })
    });

    if (!res.ok) {
      return await manejarFalloSync(res, 'No se pudo sincronizar progreso remoto.');
    }
    const data = await res.json();
    const progresoGuardado = data.progreso || {};
    window.MuchLocalStorage?.recordStationResult?.(estacionId, {
      puntaje: progresoGuardado.puntaje ?? puntaje,
      aciertos: progresoGuardado.aciertos ?? aciertos,
      errores: progresoGuardado.errores ?? errores,
      aprobada: progresoGuardado.aprobada ?? aprobada,
      fecha_completado: progresoGuardado.fecha_completado
    });
    if (data.boletoGenerado) {
      window.MuchLocalStorage?.storeTicketData?.(data.boletoGenerado);
    }
    if (data.finalizacion) {
      mostrarAvisoFinalizacionJuego(data.finalizacion);
    }
    return data.progreso;
  } catch (error) {
    if (error.code === 'usuario_bloqueado') throw error;
    console.info('[Sync] No se pudo sincronizar progreso remoto.', error.message);
    return null;
  }
}

// Inicializar progreso del usuario al entrar a una estaciÃƒÂ³n
async function inicializarProgresoUsuario(estacionId) {
  asegurarUbicacionVigente();
  await asegurarJuegoPermitido();
  const user = obtenerUsuarioLocal();
  const userId = obtenerIdUsuarioLocal(user);
  if (!userId) return null;

  // Limpiar el estado de completado en el almacenamiento local al iniciar la estaciÃƒÂ³n
  try {
    // No borrar estaciones ya completadas al entrar. Los intentos fallidos se guardan aparte.
  } catch (e) {
    console.warn('No se pudo limpiar estado local al inicializar:', e);
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/progreso/inicializar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(userId)
      },
      body: JSON.stringify({
        id_usuario: userId,
        id_estacion: Number(estacionId)
      })
    });

    if (!res.ok) {
      return await manejarFalloSync(res, 'No se pudo inicializar progreso remoto.');
    }
    return await res.json();
  } catch (error) {
    if (error.code === 'usuario_bloqueado') throw error;
    console.info('[Sync] No se pudo inicializar progreso remoto.', error.message);
    return null;
  }
}

// Reiniciar todo el progreso del usuario en la base de datos MySQL
async function reiniciarProgresoUsuario(options = {}) {
  const forceReset = Boolean(options.force || options.testMode);
  asegurarUbicacionVigente();
  if (!forceReset) {
    await asegurarJuegoPermitido();
  }
  const user = obtenerUsuarioLocal();
  if (!user) return null;
  const userId = user.id_usuario || user.id;

  try {
    const res = await fetch(`${API_BASE_URL}/api/progreso/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(userId),
        'x-reset-mode': forceReset ? 'test' : 'manual'
      },
      body: JSON.stringify({
        id_usuario: userId,
        force_reset: forceReset,
        modo_prueba: Boolean(options.testMode)
      })
    });

    if (!res.ok) {
      await manejarRespuestaBloqueoJuego(res);
      throw new Error('Error al reiniciar progreso.');
    }
    const data = await res.json();
    window.MuchLocalStorage?.resetProgress?.({ force: true, reason: forceReset ? 'test_reset' : 'manual_reset' });
    return data;
  } catch (error) {
    console.error('Error en reiniciarProgresoUsuario:', error.message);
    throw error;
  }
}

// Guardar intento en una estaciÃƒÂ³n
async function guardarIntentoEstacion(estacionId, intento = {}) {
  asegurarUbicacionVigente();
  await asegurarJuegoPermitido();
  const user = obtenerUsuarioLocal();
  const userId = obtenerIdUsuarioLocal(user);
  if (!userId) return null;
  const finalizado = inferirIntentoFinalizado(intento);

  try {
    const res = await fetch(`${API_BASE_URL}/api/intentos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(userId)
      },
      body: JSON.stringify({
        id_usuario: userId,
        id_estacion: Number(estacionId),
        puntaje: Number(intento.puntaje || 0),
        aciertos: Number(intento.aciertos || 0),
        errores: Number(intento.errores || 0),
        aprobado: Boolean(intento.aprobado),
        finalizado
      })
    });

    if (!res.ok) {
      return await manejarFalloSync(res, 'No se pudo registrar intento remoto.');
    }
    const data = await res.json();
    if (data.id_intento) {
      sessionStorage.setItem('much_current_attempt_station_id', String(estacionId));
    }
    window.MuchLocalStorage?.recordStationAttempt?.(estacionId, {
      ...intento,
      id_intento: data.id_intento,
      aprobado: Boolean(intento.aprobado),
      finalizado
    }, { countAttempt: true, countFailure: finalizado });
    sincronizarBloqueoPorIntentos(data);
    return data;
  } catch (error) {
    if (error.code === 'usuario_bloqueado') throw error;
    console.info('[Sync] No se pudo registrar intento remoto.', error.message);
    return null;
  }
}

// Actualizar intento de estaciÃƒÂ³n existente
async function actualizarIntentoEstacion(idIntento, intento = {}) {
  asegurarUbicacionVigente();
  await asegurarJuegoPermitido();
  const user = obtenerUsuarioLocal();
  const userId = obtenerIdUsuarioLocal(user);
  if (!userId) return null;
  const finalizado = intento.finalizado === undefined ? true : inferirIntentoFinalizado(intento);
  const estacionId = intento.id_estacion
    || intento.estacionId
    || sessionStorage.getItem('much_current_attempt_station_id')
    || localStorage.getItem('much_current_station');

  try {
    const res = await fetch(`${API_BASE_URL}/api/intentos/${idIntento}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(userId)
      },
      body: JSON.stringify({
        puntaje: Number(intento.puntaje || 0),
        aciertos: Number(intento.aciertos || 0),
        errores: Number(intento.errores || 0),
        aprobado: Boolean(intento.aprobado),
        finalizado
      })
    });

    if (!res.ok) {
      return await manejarFalloSync(res, 'No se pudo actualizar intento remoto.');
    }
    const data = await res.json();
    if (estacionId) {
      window.MuchLocalStorage?.recordStationAttempt?.(estacionId, {
        ...intento,
        id_intento: idIntento,
        aprobado: Boolean(intento.aprobado),
        finalizado: data.finalizado !== undefined ? Boolean(data.finalizado) : finalizado
      }, {
        countAttempt: false,
        countFailure: data.finalizado !== false
      });
    }
    sincronizarBloqueoPorIntentos(data);
    return data;
  } catch (error) {
    if (error.code === 'usuario_bloqueado') throw error;
    console.info('[Sync] No se pudo actualizar intento remoto.', error.message);
    return null;
  }
}

// Guardar partida minijuego en partidas_minijuego
async function guardarPartidaMinijuego(partida = {}) {
  asegurarUbicacionVigente();
  await asegurarJuegoPermitido();
  const user = obtenerUsuarioLocal();
  const userId = obtenerIdUsuarioLocal(user);
  if (!userId) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/partidas-minijuego`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(userId)
      },
      body: JSON.stringify({
        id_usuario: userId,
        id_estacion: 2, // Spinosaurio es la estaciÃƒÂ³n 2
        puntaje: Number(partida.puntaje || 0),
        aprobado: Boolean(partida.aprobado)
      })
    });

    if (!res.ok) {
      return await manejarFalloSync(res, 'No se pudo registrar partida remota.');
    }
    return await res.json();
  } catch (error) {
    if (error.code === 'usuario_bloqueado') throw error;
    console.info('[Sync] No se pudo registrar partida remota.', error.message);
    return null;
  }
}

// Guardar respuesta del usuario individualmente
async function guardarRespuestaUsuario(idIntento, estacionId, preguntaTexto, respuestaTexto, esCorrecta) {
  asegurarUbicacionVigente();
  await asegurarJuegoPermitido();
  const user = obtenerUsuarioLocal();
  const userId = obtenerIdUsuarioLocal(user);
  if (!userId) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/respuestas-usuario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(userId)
      },
      body: JSON.stringify({
        id_intento: Number(idIntento),
        id_usuario: userId,
        id_estacion: Number(estacionId),
        pregunta_texto: preguntaTexto,
        respuesta_texto: respuestaTexto,
        es_correcta: Boolean(esCorrecta)
      })
    });

    if (!res.ok) {
      return await manejarFalloSync(res, 'No se pudo guardar respuesta remota.');
    }
    return await res.json();
  } catch (error) {
    if (error.code === 'usuario_bloqueado') throw error;
    console.info('[Sync] No se pudo guardar respuesta remota.', error.message);
    return null;
  }
}

// Generar boleto final
async function generarBoletoFinal(reclamar = false) {
  asegurarUbicacionVigente();
  await asegurarJuegoPermitido();
  const user = obtenerUsuarioLocal();
  const userId = obtenerIdUsuarioLocal(user);
  if (!userId) throw new Error('No hay usuario autenticado.');

  try {
    const res = await fetch(`${API_BASE_URL}/api/boletos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(userId)
      },
      body: JSON.stringify({
        id_usuario: userId,
        reclamar: Boolean(reclamar)
      })
    });

    if (!res.ok) {
      await manejarRespuestaBloqueoJuego(res);
      throw new Error('Error al generar el boleto.');
    }
    const data = await res.json();
    window.MuchLocalStorage?.storeTicketData?.(data);
    if (reclamar) {
      window.MuchLocalStorage?.claimTicket?.(data, {
        fecha_puede_volver: data.reclamo?.fecha_puede_volver,
        fecha_finalizacion: data.reclamo?.premio?.fecha_finalizacion || data.reclamo?.premio?.fecha_ganado
      });
      invalidarCacheBloqueoJuego();
    }
    return data;
  } catch (error) {
    console.error('Error al generar boleto final:', error.message);
    throw error;
  }
}

// MÃƒÂ©todos legacy para retrocompatibilidad
async function iniciarJuego(nombreJugador) {
  console.log('Iniciar juego:', nombreJugador);
}
async function cargarPreguntas(codigoEstacion) {
  console.log('Cargar preguntas de estaciÃƒÂ³n:', codigoEstacion);
}
async function responderPregunta(preguntaId, opcionId) {
  console.log('Responder pregunta:', preguntaId, opcionId);
}

// InyecciÃƒÂ³n en el objeto global window
window.initMySQLApi = initMySQLApi;
window.obtenerSesionActual = obtenerSesionActual;
window.obtenerUsuarioActual = obtenerUsuarioActual;
window.iniciarSesionConGoogle = iniciarSesionConGoogle;
window.cerrarSesion = cerrarSesion;
window.normalizarUsuarioMySQL = normalizarUsuarioMySQL;
window.verificarUsuarioEnTabla = verificarUsuarioEnTabla;
window.asegurarConsentimientoPrivacidad = asegurarConsentimientoPrivacidad;
window.consultarConsentimientoPrivacidad = consultarConsentimientoPrivacidad;
window.consultarEstaciones = consultarEstaciones;
window.guardarProgresoUsuario = guardarProgresoUsuario;
window.inicializarProgresoUsuario = inicializarProgresoUsuario;
window.guardarIntentoEstacion = guardarIntentoEstacion;
window.actualizarIntentoEstacion = actualizarIntentoEstacion;
window.guardarPartidaMinijuego = guardarPartidaMinijuego;
window.guardarRespuestaUsuario = guardarRespuestaUsuario;
window.reiniciarProgresoUsuario = reiniciarProgresoUsuario;
window.generarBoletoFinal = generarBoletoFinal;
window.iniciarJuego = iniciarJuego;
window.cargarPreguntas = cargarPreguntas;
window.responderPregunta = responderPregunta;
window.verificarUbicacionYRegistrar = verificarUbicacionYRegistrar;
window.comprobarUbicacionVigente = comprobarUbicacionVigente;
window.consultarUltimaVerificacion = consultarUltimaVerificacion;
window.intentarRestaurarVerificacionDesdeServidor = intentarRestaurarVerificacionDesdeServidor;
window.comprobarEstacionActiva = comprobarEstacionActiva;
window.consultarEstadoBloqueoJuego = consultarEstadoBloqueoJuego;
window.asegurarJuegoPermitido = asegurarJuegoPermitido;
window.mostrarAvisoBloqueoJuego = mostrarAvisoBloqueoJuego;
window.mostrarAvisoFinalizacionJuego = mostrarAvisoFinalizacionJuego;
window.invalidarCacheBloqueoJuego = invalidarCacheBloqueoJuego;

function esPaginaDeEstacion() {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase();
  return path.includes('/juego_spinosaurio/')
    || path.includes('/entrada-much/')
    || path.includes('/sala-biodiversidad')
    || path.includes('/sala_energia/')
    || path.includes('/sala_desarrollo_sustentable/')
    || path.includes('/sbeel_dinosaurios/')
    || path.includes('/boleto_digital/');
}

if (typeof window !== 'undefined' && esPaginaDeEstacion()) {
  window.addEventListener('DOMContentLoaded', async () => {
    try {
      if (obtenerUsuarioLocal()) {
        await asegurarConsentimientoPrivacidad();
      }
      const estado = await consultarEstadoBloqueoJuego(true);
      if (estado.bloqueado) {
        mostrarAvisoBloqueoJuego(estado);
        const params = new URLSearchParams();
        params.set('reason', 'playtime_blocked');
        if (estado.mensaje) params.set('msg', estado.mensaje);
        const redirect = pathIncludesSubfolder() ? '../index.html' : 'index.html';
        window.setTimeout(() => {
          window.location.replace(`${redirect}?${params.toString()}`);
        }, 2500);
      }
    } catch (_) {}
  });
}

function pathIncludesSubfolder() {
  const path = window.location.pathname.toLowerCase();
  return path.includes('/juego_spinosaurio/')
    || path.includes('/entrada-much/')
    || path.includes('/sala-biodiversidad')
    || path.includes('/sala_energia/')
    || path.includes('/sala_desarrollo_sustentable/')
    || path.includes('/sbeel_dinosaurios/')
    || path.includes('/boleto_digital/');
}

export {
  initMySQLApi,
  obtenerSesionActual,
  obtenerUsuarioActual,
  iniciarSesionConGoogle,
  cerrarSesion,
  normalizarUsuarioMySQL,
  verificarUsuarioEnTabla,
  asegurarConsentimientoPrivacidad,
  consultarConsentimientoPrivacidad,
  consultarEstaciones,
  guardarProgresoUsuario,
  inicializarProgresoUsuario,
  guardarIntentoEstacion,
  actualizarIntentoEstacion,
  guardarPartidaMinijuego,
  guardarRespuestaUsuario,
  reiniciarProgresoUsuario,
  generarBoletoFinal,
  iniciarJuego,
  cargarPreguntas,
  responderPregunta,
  verificarUbicacionYRegistrar,
  comprobarUbicacionVigente,
  consultarUltimaVerificacion,
  intentarRestaurarVerificacionDesdeServidor,
  comprobarEstacionActiva
};




