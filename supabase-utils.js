// supabase-utils.js
// Utilidades de comunicación del frontend con el Backend Express + MySQL
// Reemplaza por completo el uso directo de Supabase por llamadas fetch al backend.

const API_BASE_URL = window.location.hostname ? `http://${window.location.hostname}:3000` : 'http://127.0.0.1:3000';

// ==========================================
// CONFIGURACIÓN DE GEOLOCALIZACIÓN DEL MUSEO
// ==========================================
const DIRECCION_MUSEO = "Calz. Cerro Hueco 3000, Rivera Cerro Hueco, FSTSE, 29094 Tuxtla Gutiérrez, Chiapas";
const LATITUD_MUSEO = 16.72248; // Coloca la latitud real aquí (ej: 16.72248)
const LONGITUD_MUSEO = -93.09100; // Coloca la longitud real aquí (ej: -93.09100)
const RADIO_PERMITIDO_METROS = 150;
const TIEMPO_VALIDACION_MINUTOS = 15; // 15 minutos de vigencia de verificación

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
    if (!res.ok) throw new Error('Error en el servidor al guardar verificación');
    const data = await res.json();
    return data;
  } catch (e) {
    console.error('Error guardando verificación de ubicación en base de datos:', e.message);
    throw e;
  }
}

async function verificarUbicacionYRegistrar() {
  return new Promise((resolve) => {
    // Verificación de ubicación desactivada temporalmente para facilitar pruebas y juego remoto.
    // Esto evita requerir permisos GPS (que fallan en HTTP móvil) y confirmaciones.
    const verifLocal = {
      dentro_del_museo: true,
      timestamp: Date.now(),
      mensaje_resultado: 'Ubicación válida (Verificación de geolocalización desactivada temporalmente).'
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
    // Simular verificación de ubicación exitosa temporalmente para pruebas y juego remoto
    const verifLocal = {
      dentro_del_museo: true,
      timestamp: Date.now(),
      mensaje_resultado: 'Ubicación válida (Verificación de geolocalización desactivada temporalmente).'
    };
    sessionStorage.setItem('much_last_location_verification', JSON.stringify(verifLocal));
    return { ok: true, message: 'Ubicación válida (Verificación desactivada).' };
  } catch (e) {
    console.error('Error al comprobar vigencia de ubicación:', e);
    return { ok: true, message: 'Ubicación válida (Verificación desactivada).' };
  }
}

function asegurarUbicacionVigente() {
  const estado = comprobarUbicacionVigente();
  if (!estado.ok) {
    throw new Error('Acción bloqueada: ' + estado.message);
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
  const estado = {
    ...data.bloqueo,
    bloqueado: true,
    habilitado: false,
    motivo_bloqueo: data.bloqueo.motivo_bloqueo || 'intentos'
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
  const mensaje = estado?.mensaje || (esBloqueoPorIntentos && fecha
    ? `Has superado el limite de intentos en esta estacion.\nPodras volver a jugar el ${fecha}.\nRegresa en esa fecha para continuar tu mision cientifica.`
    : fecha
    ? `¡Ya completaste tu aventura!\nTu boleto fue generado correctamente.\nPodrás volver a jugar el ${fecha}.`
    : 'Tu misión ya fue completada. Debes esperar para comenzar una nueva aventura.');
  if (window.MuchStationCompletion?.showFloatingNotice) {
    window.MuchStationCompletion.showFloatingNotice({
      badge: esBloqueoPorIntentos ? 'Limite de intentos' : '⏳ Misión completada',
      title: esBloqueoPorIntentos ? 'Juego bloqueado temporalmente' : '¡Aventura completada!',
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
  const mensaje = `¡Ya completaste tu aventura!\nTu boleto fue generado correctamente.\nPodrás volver a jugar el ${fecha}.`;
  localStorage.setItem('much_playtime_block_msg', finalizacion.mensaje || mensaje);
  window.MuchLocalStorage?.completeRoute?.(finalizacion);
  invalidarCacheBloqueoJuego();

  if (window.MuchStationCompletion?.showFloatingNotice) {
    window.MuchStationCompletion.showFloatingNotice({
      badge: '🏆 Aventura completada',
      title: '¡Aventura completada!',
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
    if (!res.ok) throw new Error('Error al obtener la última verificación');
    return await res.json();
  } catch (e) {
    console.error('Error al consultar última verificación:', e);
    return null;
  }
}

async function intentarRestaurarVerificacionDesdeServidor() {
  // Deshabilitado por solicitud del usuario para forzar solicitud de GPS en cada sesión nueva
  return { ok: false };
}


async function initSupabase() {
  // Función placeholder para compatibilidad
  return window.supabase;
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

async function obtenerSesionActual() {
  const user = obtenerUsuarioLocal();
  if (user) {
    return { user };
  }
  return null;
}

async function obtenerUsuarioActual() {
  return obtenerUsuarioLocal();
}

// Iniciar sesión con Google (utiliza el login simulado/real integrado)
async function iniciarSesionConGoogle() {
  // Para pruebas rápidas en local sin depender de credenciales GCP obligatorias en todos los equipos,
  // abriremos un modal de diálogo nativo interactivo elegante si el script de Google no se ha cargado,
  // permitiendo ingresar nombre y correo, simulando una ventana de Google de forma premium.
  // Si se prefiere usar las credenciales de Google GSI oficiales, se pueden pasar al backend.
  
  return new Promise((resolve, reject) => {
    // Buscar si ya existe un modal de login
    let loginModal = document.getElementById('much-google-sim-modal');
    if (!loginModal) {
      loginModal = document.createElement('div');
      loginModal.id = 'much-google-sim-modal';
      loginModal.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(10, 15, 30, 0.9);
        display: flex; align-items: center; justify-content: center;
        z-index: 999999; font-family: 'Outfit', 'Inter', sans-serif;
      `;
      loginModal.innerHTML = `
        <div style="
          background: linear-gradient(135deg, #18224b 0%, #0d122b 100%);
          border: 2px solid #3c54b4;
          border-radius: 20px;
          padding: 30px;
          width: 90%;
          max-width: 420px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.5), inset 0 0 20px rgba(60,84,180,0.2);
          text-align: center;
          color: white;
          position: relative;
        ">
          <div style="font-size: 40px; margin-bottom: 10px;">🛡️</div>
          <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; background: linear-gradient(90deg, #ffc000, #ff8000); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Google Login</h2>
          <p style="margin: 0 0 20px 0; font-size: 14px; color: #a0aec0;">Simulador de Acceso Seguro para desarrollo local</p>
          
          <div style="text-align: left; margin-bottom: 15px;">
            <label style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #718096; margin-bottom: 5px;">Nombre Completo</label>
            <input type="text" id="sim-google-name" placeholder="Tu nombre completo" style="width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #2d3748; background: #0c1024; color: white; outline: none; box-sizing: border-box;">
          </div>
          
          <div style="text-align: left; margin-bottom: 20px;">
            <label style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #718096; margin-bottom: 5px;">Correo de Google</label>
            <input type="email" id="sim-google-email" placeholder="ejemplo@gmail.com" style="width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #2d3748; background: #0c1024; color: white; outline: none; box-sizing: border-box;">
          </div>
          
          <button id="sim-google-btn-submit" style="
            width: 100%;
            padding: 12px;
            border-radius: 10px;
            border: none;
            background: linear-gradient(90deg, #3c54b4, #5c74d4);
            color: white;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(60,84,180,0.4);
          ">Iniciar Sesión con Google</button>
          
          <button id="sim-google-btn-cancel" style="
            margin-top: 12px;
            background: transparent;
            border: none;
            color: #718096;
            cursor: pointer;
            font-size: 13px;
          ">Cancelar</button>
        </div>
      `;
      document.body.appendChild(loginModal);
    }

    loginModal.style.display = 'flex';

    document.getElementById('sim-google-btn-submit').onclick = async () => {
      const nombre = document.getElementById('sim-google-name').value.trim();
      const correo = document.getElementById('sim-google-email').value.trim();

      if (!nombre || !correo) {
        alert('Por favor ingresa tu nombre y correo.');
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userData: {
              name: nombre,
              email: correo,
              google_id: `gsim_${correo.replace(/[^a-zA-Z0-9]/g, '')}`,
              picture: 'avatars/dino1.png'
            }
          })
        });

        if (!res.ok) {
          throw new Error('Error al conectar con el backend de autenticación.');
        }

        const data = await res.json();
        console.log('[Auth] Login exitoso:', data);

        // Invalidar ubicación previa del usuario e invitado para exigir verificación fresca
        const sessionId = localStorage.getItem('much_session_id');
        const userId = data.id_usuario;
        sessionStorage.removeItem('much_last_location_verification');

        if (userId || sessionId) {
          try {
            await fetch(`${API_BASE_URL}/api/verificaciones-ubicacion/invalidar`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: userId, session_id: sessionId })
            });
          } catch (e) {
            console.error('Error al invalidar ubicación al iniciar sesión:', e);
          }
        }

        // Guardar sesión en localStorage
        const sessionUser = {
          id: data.id_usuario,
          id_usuario: data.id_usuario,
          name: data.nombre,
          email: data.correo,
          picture: data.avatar_url,
          avatar_url: data.avatar_url,
          roles: data.roles || ['usuario']
        };
        localStorage.setItem('much_google_user', JSON.stringify(sessionUser));

        loginModal.style.display = 'none';

        if (window.MuchRoleAccess) {
          const access = window.MuchRoleAccess.getAccessInfo(sessionUser);
          if (access.isInternal) {
            const didRedirect = window.MuchRoleAccess.redirectToRoleHome({
              user: sessionUser,
              basePath: './'
            });
            if (didRedirect) {
              resolve(data);
              return;
            }
          }
        } else {
          const roles = Array.isArray(sessionUser.roles)
            ? sessionUser.roles.map(r => String(r).toLowerCase())
            : [];
          if (roles.includes('admin') || roles.includes('administrador')) {
            window.location.href = 'ADMINISTRADOR.html';
            resolve(data);
            return;
          }
          if (roles.includes('taquilla') || roles.includes('taquillero')) {
            window.location.href = 'ADMINISTRADOR.html?section=taquilla';
            resolve(data);
            return;
          }
        }
        
        // Disparar evento para actualizar vistas
        window.dispatchEvent(new Event('storage'));
        
        // Recargar página para aplicar sesión limpia en index.html
        window.location.reload();
        resolve(data);
      } catch (error) {
        alert(`No se pudo establecer conexión con el backend Express. Asegúrate de que esté corriendo en ${API_BASE_URL}`);
        console.error(error);
        reject(error);
      }
    };

    document.getElementById('sim-google-btn-cancel').onclick = () => {
      loginModal.style.display = 'none';
      reject(new Error('Login cancelado por el usuario.'));
    };
  });
}

async function cerrarSesion(options = {}) {
  console.log('🚪 Cerrando sesión y limpiando datos del usuario...');
  
  // Obtener IDs antes de borrar storage
  const user = obtenerUsuarioLocal();
  const userId = user ? (user.id_usuario || user.id) : null;
  const sessionId = localStorage.getItem('much_session_id');

  if (userId || sessionId) {
    try {
      await fetch(`${API_BASE_URL}/api/verificaciones-ubicacion/invalidar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, session_id: sessionId })
      });
    } catch (e) {
      console.error('Error al invalidar ubicación en el servidor:', e);
    }
  }

  const lugarSeguro = localStorage.getItem('much_lugar_seguro');

  // Limpiar completamente localStorage y sessionStorage para eliminar todo rastro del progreso anterior
  localStorage.clear();
  sessionStorage.clear();

  // Conservar la ubicación QR para conveniencia del usuario en el museo
  if (lugarSeguro) {
    localStorage.setItem('much_lugar_seguro', lugarSeguro);
  }
  
  // Recargar o redirigir de inmediato para reiniciar estado
  if (options.preserveAdminNav) {
    sessionStorage.setItem('much_internal_navigation', 'true');
  }

  if (options.redirectTo) {
    window.location.replace(options.redirectTo);
  } else if (options.reload !== false) {
    window.location.reload();
  }
  return true;
}

function normalizarUsuarioSupabase(user) {
  // Conservar por compatibilidad con index.html
  return user;
}

async function verificarUsuarioEnTabla() {
  const user = obtenerUsuarioLocal();
  const userId = obtenerIdUsuarioLocal(user);
  if (!user || !userId) return user;

  try {
    const res = await fetch(`${API_BASE_URL}/api/usuarios/${userId}/roles`);
    if (!res.ok) {
      console.info('[Auth] No se pudo verificar el usuario local en backend.');
      return user;
    }

    const data = await res.json();
    if (data.exists === false) {
      console.info('[Auth] Sesión local descartada porque el usuario no existe en backend.');
      localStorage.removeItem('much_google_user');
      sessionStorage.removeItem('much_current_attempt_id');
      return null;
    }

    const verifiedUser = {
      ...user,
      roles: Array.isArray(data.roles) && data.roles.length ? data.roles : (user.roles || ['usuario'])
    };
    localStorage.setItem('much_google_user', JSON.stringify(verifiedUser));
    return verifiedUser;
  } catch (error) {
    console.info('[Auth] No se pudo verificar el usuario local en backend.', error.message);
    return user;
  }
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

// Comprobar si una estación específica está activa
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

// Guardar progreso del usuario en una estación
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

// Inicializar progreso del usuario al entrar a una estación
async function inicializarProgresoUsuario(estacionId) {
  asegurarUbicacionVigente();
  await asegurarJuegoPermitido();
  const user = obtenerUsuarioLocal();
  const userId = obtenerIdUsuarioLocal(user);
  if (!userId) return null;

  // Limpiar el estado de completado en el almacenamiento local al iniciar la estación
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
async function reiniciarProgresoUsuario() {
  asegurarUbicacionVigente();
  await asegurarJuegoPermitido();
  const user = obtenerUsuarioLocal();
  if (!user) return null;
  const userId = user.id_usuario || user.id;

  try {
    const res = await fetch(`${API_BASE_URL}/api/progreso/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(userId)
      },
      body: JSON.stringify({
        id_usuario: userId
      })
    });

    if (!res.ok) {
      await manejarRespuestaBloqueoJuego(res);
      throw new Error('Error al reiniciar progreso.');
    }
    const data = await res.json();
    window.MuchLocalStorage?.resetProgress?.({ force: true, reason: 'manual_reset' });
    return data;
  } catch (error) {
    console.error('Error en reiniciarProgresoUsuario:', error.message);
    throw error;
  }
}

// Guardar intento en una estación
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

// Actualizar intento de estación existente
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
        id_estacion: 2, // Spinosaurio es la estación 2
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

// Métodos legacy para retrocompatibilidad
async function iniciarJuego(nombreJugador) {
  console.log('Iniciar juego:', nombreJugador);
}
async function cargarPreguntas(codigoEstacion) {
  console.log('Cargar preguntas de estación:', codigoEstacion);
}
async function responderPregunta(preguntaId, opcionId) {
  console.log('Responder pregunta:', preguntaId, opcionId);
}

// Inyección en el objeto global window
window.initSupabase = initSupabase;
window.obtenerSesionActual = obtenerSesionActual;
window.obtenerUsuarioActual = obtenerUsuarioActual;
window.iniciarSesionConGoogle = iniciarSesionConGoogle;
window.cerrarSesion = cerrarSesion;
window.normalizarUsuarioSupabase = normalizarUsuarioSupabase;
window.verificarUsuarioEnTabla = verificarUsuarioEnTabla;
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
  initSupabase,
  obtenerSesionActual,
  obtenerUsuarioActual,
  iniciarSesionConGoogle,
  cerrarSesion,
  normalizarUsuarioSupabase,
  verificarUsuarioEnTabla,
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

