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
    cachedPlaytimeEstado = estado;
    cachedPlaytimeAt = Date.now();
    return estado;
  } catch (error) {
    console.error('Error consultando bloqueo de juego:', error);
    return { bloqueado: false, habilitado: true };
  }
}

function invalidarCacheBloqueoJuego() {
  cachedPlaytimeEstado = null;
  cachedPlaytimeAt = 0;
}

function mostrarAvisoBloqueoJuego(estado) {
  const mensaje = estado?.mensaje || 'Ya reclamaste tu premio. Debes esperar para volver a participar.';
  if (window.MuchStationCompletion?.showFloatingNotice) {
    window.MuchStationCompletion.showFloatingNotice({
      badge: '⏳ Participación pausada',
      title: 'Aún no puedes jugar',
      body: mensaje,
      detailLabel: 'Tiempo restante',
      detailValue: estado?.tiempo_restante || 'Bloqueado'
    });
  } else {
    alert(mensaje);
  }
}

async function asegurarJuegoPermitido() {
  const estado = await consultarEstadoBloqueoJuego(true);
  if (estado.bloqueado) {
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
  await asegurarJuegoPermitido();
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

    if (!res.ok) {
      await manejarRespuestaBloqueoJuego(res);
      throw new Error('Error en el backend al guardar progreso.');
    }
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
  await asegurarJuegoPermitido();
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

    if (!res.ok) {
      await manejarRespuestaBloqueoJuego(res);
      throw new Error('Error al inicializar progreso.');
    }
    return await res.json();
  } catch (error) {
    console.error('Error en inicializarProgresoUsuario:', error.message);
    throw error;
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
    return await res.json();
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

    if (!res.ok) {
      await manejarRespuestaBloqueoJuego(res);
      throw new Error('Error al registrar intento.');
    }
    return await res.json();
  } catch (error) {
    console.error('Error en guardarIntentoEstacion:', error.message);
    throw error;
  }
}

// Actualizar intento de estación existente
async function actualizarIntentoEstacion(idIntento, intento = {}) {
  asegurarUbicacionVigente();
  await asegurarJuegoPermitido();
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

    if (!res.ok) {
      await manejarRespuestaBloqueoJuego(res);
      throw new Error('Error al actualizar intento.');
    }
    return await res.json();
  } catch (error) {
    console.error('Error en actualizarIntentoEstacion:', error.message);
    throw error;
  }
}

// Guardar partida minijuego en partidas_minijuego
async function guardarPartidaMinijuego(partida = {}) {
  asegurarUbicacionVigente();
  await asegurarJuegoPermitido();
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
  await asegurarJuegoPermitido();
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
async function generarBoletoFinal(reclamar = false) {
  asegurarUbicacionVigente();
  await asegurarJuegoPermitido();
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
        id_usuario: user.id,
        reclamar: Boolean(reclamar)
      })
    });

    if (!res.ok) {
      await manejarRespuestaBloqueoJuego(res);
      throw new Error('Error al generar el boleto.');
    }
    const data = await res.json();
    if (reclamar) {
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

