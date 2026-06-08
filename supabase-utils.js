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
    return await res.json();
  } catch (e) {
    console.error('Error guardando verificación de ubicación en base de datos:', e.message);
    throw e;
  }
}

async function verificarUbicacionYRegistrar() {
  return new Promise((resolve) => {
    // Solicitar confirmación explícita a nivel de aplicación (siempre pedirá interacción)
    const confirmar = confirm("Para poder jugar, la aplicación verificará tu ubicación física actual para asegurar que te encuentras en el Museo Chiapas de Ciencia y Tecnología. ¿Deseas permitir la comprobación GPS?");
    
    if (!confirmar) {
      const errorMsg = 'Permiso de ubicación denegado por el usuario.';
      const user = obtenerUsuarioLocal();
      const payload = {
        user_id: user ? (user.id_usuario || user.id) : null,
        session_id: obtenerSessionId(),
        direccion_museo: DIRECCION_MUSEO,
        latitud_usuario: null,
        longitud_usuario: null,
        precision_gps: null,
        latitud_museo: LATITUD_MUSEO,
        longitud_museo: LONGITUD_MUSEO,
        radio_permitido_metros: RADIO_PERMITIDO_METROS,
        distancia_metros: null,
        dentro_del_museo: false,
        permiso_ubicacion: false,
        mensaje_resultado: errorMsg
      };

      guardarVerificacionUbicacion(payload).catch(() => {});
      
      const verifLocal = {
        dentro_del_museo: false,
        timestamp: Date.now(),
        mensaje_resultado: 'Para jugar necesitas permitir el acceso a tu ubicación.'
      };
      sessionStorage.setItem('much_last_location_verification', JSON.stringify(verifLocal));

      return resolve({ ok: false, error: 'permission_denied', message: verifLocal.mensaje_resultado });
    }

    if (!navigator.geolocation) {
      const errorMsg = 'El navegador no soporta geolocalización.';
      const user = obtenerUsuarioLocal();
      const payload = {
        user_id: user ? (user.id_usuario || user.id) : null,
        session_id: obtenerSessionId(),
        direccion_museo: DIRECCION_MUSEO,
        latitud_usuario: null,
        longitud_usuario: null,
        precision_gps: null,
        latitud_museo: LATITUD_MUSEO,
        longitud_museo: LONGITUD_MUSEO,
        radio_permitido_metros: RADIO_PERMITIDO_METROS,
        distancia_metros: null,
        dentro_del_museo: false,
        permiso_ubicacion: false,
        mensaje_resultado: errorMsg
      };

      guardarVerificacionUbicacion(payload).catch(() => {});
      
      const verifLocal = {
        dentro_del_museo: false,
        timestamp: Date.now(),
        mensaje_resultado: errorMsg
      };
      sessionStorage.setItem('much_last_location_verification', JSON.stringify(verifLocal));

      return resolve({ ok: false, error: 'no_compatible', message: errorMsg });
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const accuracy = position.coords.accuracy || null;
        
        const distancia = calcularDistanciaHaversine(lat, lon, LATITUD_MUSEO, LONGITUD_MUSEO);
        const dentro = distancia <= RADIO_PERMITIDO_METROS;
        const mensaje = dentro 
          ? 'Ubicación validada correctamente.' 
          : 'Usuario fuera del rango permitido del museo.';

        const user = obtenerUsuarioLocal();
        const payload = {
          user_id: user ? (user.id_usuario || user.id) : null,
          session_id: obtenerSessionId(),
          direccion_museo: DIRECCION_MUSEO,
          latitud_usuario: lat,
          longitud_usuario: lon,
          precision_gps: accuracy,
          latitud_museo: LATITUD_MUSEO,
          longitud_museo: LONGITUD_MUSEO,
          radio_permitido_metros: RADIO_PERMITIDO_METROS,
          distancia_metros: parseFloat(distancia.toFixed(2)),
          dentro_del_museo: dentro,
          permiso_ubicacion: true,
          mensaje_resultado: mensaje
        };

        try {
          await guardarVerificacionUbicacion(payload);
        } catch (dbErr) {
          console.error('Error al guardar verificación en BD:', dbErr);
        }

        const verifLocal = {
          dentro_del_museo: dentro,
          timestamp: Date.now(),
          mensaje_resultado: dentro 
            ? 'Ubicación validada. Estás en el Museo Chiapas de Ciencia y Tecnología y ya puedes jugar.'
            : 'No puedes jugar porque no te encuentras en la ubicación del Museo Chiapas de Ciencia y Tecnología.'
        };
        sessionStorage.setItem('much_last_location_verification', JSON.stringify(verifLocal));
        
        resolve({ ok: dentro, dentro: dentro, distancia: distancia, message: verifLocal.mensaje_resultado });
      },
      async (error) => {
        let codeMsg = 'Error desconocido al obtener ubicación.';
        let permission = true;
        let errorType = 'unknown';

        if (error.code === error.PERMISSION_DENIED) {
          codeMsg = 'Permiso de ubicación denegado.';
          permission = false;
          errorType = 'permission_denied';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          codeMsg = 'Ubicación no disponible.';
          errorType = 'position_unavailable';
        } else if (error.code === error.TIMEOUT) {
          codeMsg = 'Tiempo de espera agotado al obtener ubicación.';
          errorType = 'timeout';
        }

        const user = obtenerUsuarioLocal();
        const payload = {
          user_id: user ? (user.id_usuario || user.id) : null,
          session_id: obtenerSessionId(),
          direccion_museo: DIRECCION_MUSEO,
          latitud_usuario: null,
          longitud_usuario: null,
          precision_gps: null,
          latitud_museo: LATITUD_MUSEO,
          longitud_museo: LONGITUD_MUSEO,
          radio_permitido_metros: RADIO_PERMITIDO_METROS,
          distancia_metros: null,
          dentro_del_museo: false,
          permiso_ubicacion: permission,
          mensaje_resultado: codeMsg
        };

        try {
          await guardarVerificacionUbicacion(payload);
        } catch (dbErr) {
          console.error('Error al guardar verificación fallida en BD:', dbErr);
        }

        const verifLocal = {
          dentro_del_museo: false,
          timestamp: Date.now(),
          mensaje_resultado: permission 
            ? 'Error al obtener ubicación: ' + codeMsg
            : 'Para jugar necesitas permitir el acceso a tu ubicación.'
        };
        sessionStorage.setItem('much_last_location_verification', JSON.stringify(verifLocal));

        resolve({ 
          ok: false, 
          error: errorType, 
          message: verifLocal.mensaje_resultado 
        });
      },
      options
    );
  });
}

function comprobarUbicacionVigente() {
  try {
    const raw = sessionStorage.getItem('much_last_location_verification');
    if (!raw) return { ok: false, message: 'No has verificado tu ubicación aún.' };
    
    const verif = JSON.parse(raw);
    const ahora = Date.now();
    const transcurridoMs = ahora - verif.timestamp;
    const vigenciaMs = TIEMPO_VALIDACION_MINUTOS * 60 * 1000;

    if (transcurridoMs > vigenciaMs) {
      sessionStorage.removeItem('much_last_location_verification');
      return { ok: false, expired: true, message: 'La verificación de ubicación ha expirado. Por favor, verifícala de nuevo.' };
    }

    if (!verif.dentro_del_museo) {
      return { ok: false, message: verif.mensaje_resultado || 'No te encuentras en el Museo Chiapas de Ciencia y Tecnología.' };
    }

    return { ok: true, message: 'Ubicación válida.' };
  } catch (e) {
    console.error('Error al comprobar vigencia de ubicación:', e);
    return { ok: false, message: 'Error al validar la ubicación.' };
  }
}

function asegurarUbicacionVigente() {
  const estado = comprobarUbicacionVigente();
  if (!estado.ok) {
    throw new Error('Acción bloqueada: ' + estado.message);
  }
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
        localStorage.setItem('much_google_user', JSON.stringify({
          id: data.id_usuario,
          id_usuario: data.id_usuario,
          name: data.nombre,
          email: data.correo,
          picture: data.avatar_url,
          avatar_url: data.avatar_url,
          roles: data.roles || ['usuario']
        }));

        loginModal.style.display = 'none';
        
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

async function cerrarSesion() {
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
  
  // Recargar de inmediato para reiniciar estado
  window.location.reload();
  return true;
}

function normalizarUsuarioSupabase(user) {
  // Conservar por compatibilidad con index.html
  return user;
}

async function verificarUsuarioEnTabla() {
  const user = obtenerUsuarioLocal();
  return user;
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
  const user = obtenerUsuarioLocal();
  if (!user) throw new Error('No hay usuario autenticado en local.');

  const puntaje = Number(extra.puntaje || 0);
  const aciertos = Number(extra.aciertos || 0);
  const errores = Number(extra.errores || 0);
  const aprobada = extra.aprobada !== undefined ? Boolean(extra.aprobada) : true;

  try {
    const res = await fetch(`${API_BASE_URL}/api/progreso/completar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(user.id)
      },
      body: JSON.stringify({
        id_usuario: user.id,
        id_estacion: Number(estacionId),
        puntaje,
        aciertos,
        errores,
        aprobada
      })
    });

    if (!res.ok) throw new Error('Error en el backend al guardar progreso.');
    const data = await res.json();
    return data.progreso;
  } catch (error) {
    console.error('Error en guardarProgresoUsuario:', error.message);
    throw error;
  }
}

// Inicializar progreso del usuario al entrar a una estación
async function inicializarProgresoUsuario(estacionId) {
  asegurarUbicacionVigente();
  const user = obtenerUsuarioLocal();
  if (!user) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/progreso/inicializar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(user.id)
      },
      body: JSON.stringify({
        id_usuario: user.id,
        id_estacion: Number(estacionId)
      })
    });

    if (!res.ok) throw new Error('Error al inicializar progreso.');
    return await res.json();
  } catch (error) {
    console.error('Error en inicializarProgresoUsuario:', error.message);
    throw error;
  }
}

// Reiniciar todo el progreso del usuario en la base de datos MySQL
async function reiniciarProgresoUsuario() {
  asegurarUbicacionVigente();
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

    if (!res.ok) throw new Error('Error al reiniciar progreso.');
    return await res.json();
  } catch (error) {
    console.error('Error en reiniciarProgresoUsuario:', error.message);
    throw error;
  }
}

// Guardar intento en una estación
async function guardarIntentoEstacion(estacionId, intento = {}) {
  asegurarUbicacionVigente();
  const user = obtenerUsuarioLocal();
  if (!user) throw new Error('No hay usuario autenticado en local.');

  try {
    const res = await fetch(`${API_BASE_URL}/api/intentos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(user.id)
      },
      body: JSON.stringify({
        id_usuario: user.id,
        id_estacion: Number(estacionId),
        puntaje: Number(intento.puntaje || 0),
        aciertos: Number(intento.aciertos || 0),
        errores: Number(intento.errores || 0),
        aprobado: Boolean(intento.aprobado)
      })
    });

    if (!res.ok) throw new Error('Error al registrar intento.');
    return await res.json();
  } catch (error) {
    console.error('Error en guardarIntentoEstacion:', error.message);
    throw error;
  }
}

// Actualizar intento de estación existente
async function actualizarIntentoEstacion(idIntento, intento = {}) {
  asegurarUbicacionVigente();
  const user = obtenerUsuarioLocal();
  if (!user) throw new Error('No hay usuario autenticado en local.');

  try {
    const res = await fetch(`${API_BASE_URL}/api/intentos/${idIntento}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(user.id)
      },
      body: JSON.stringify({
        puntaje: Number(intento.puntaje || 0),
        aciertos: Number(intento.aciertos || 0),
        errores: Number(intento.errores || 0),
        aprobado: Boolean(intento.aprobado)
      })
    });

    if (!res.ok) throw new Error('Error al actualizar intento.');
    return await res.json();
  } catch (error) {
    console.error('Error en actualizarIntentoEstacion:', error.message);
    throw error;
  }
}

// Guardar partida minijuego en partidas_minijuego
async function guardarPartidaMinijuego(partida = {}) {
  asegurarUbicacionVigente();
  const user = obtenerUsuarioLocal();
  if (!user) throw new Error('No hay usuario autenticado en local.');

  try {
    const res = await fetch(`${API_BASE_URL}/api/partidas-minijuego`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(user.id)
      },
      body: JSON.stringify({
        id_usuario: user.id,
        id_estacion: 2, // Spinosaurio es la estación 2
        puntaje: Number(partida.puntaje || 0),
        aprobado: Boolean(partida.aprobado)
      })
    });

    if (!res.ok) throw new Error('Error al registrar partida de minijuego.');
    return await res.json();
  } catch (error) {
    console.error('Error en guardarPartidaMinijuego:', error.message);
    throw error;
  }
}

// Guardar respuesta del usuario individualmente
async function guardarRespuestaUsuario(idIntento, estacionId, preguntaTexto, respuestaTexto, esCorrecta) {
  asegurarUbicacionVigente();
  const user = obtenerUsuarioLocal();
  if (!user) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/respuestas-usuario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(user.id)
      },
      body: JSON.stringify({
        id_intento: Number(idIntento),
        id_usuario: user.id,
        id_estacion: Number(estacionId),
        pregunta_texto: preguntaTexto,
        respuesta_texto: respuestaTexto,
        es_correcta: Boolean(esCorrecta)
      })
    });

    if (!res.ok) throw new Error('Error al guardar respuesta del usuario.');
    return await res.json();
  } catch (error) {
    console.error('Error en guardarRespuestaUsuario:', error.message);
    throw error;
  }
}

// Generar boleto final
async function generarBoletoFinal() {
  asegurarUbicacionVigente();
  const user = obtenerUsuarioLocal();
  if (!user) throw new Error('No hay usuario autenticado.');

  try {
    const res = await fetch(`${API_BASE_URL}/api/boletos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(user.id)
      },
      body: JSON.stringify({
        id_usuario: user.id
      })
    });

    if (!res.ok) throw new Error('Error al generar el boleto.');
    return await res.json();
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

