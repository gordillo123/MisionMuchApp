// supabase-utils.js
// Utilidades de comunicación del frontend con el Backend Express + MySQL
// Reemplaza por completo el uso directo de Supabase por llamadas fetch al backend.

const API_BASE_URL = 'http://localhost:3000';

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
            <input type="text" id="sim-google-name" value="Explorador MUCH" style="width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #2d3748; background: #0c1024; color: white; outline: none; box-sizing: border-box;">
          </div>
          
          <div style="text-align: left; margin-bottom: 20px;">
            <label style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #718096; margin-bottom: 5px;">Correo de Google</label>
            <input type="email" id="sim-google-email" value="explorador@gmail.com" style="width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #2d3748; background: #0c1024; color: white; outline: none; box-sizing: border-box;">
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
        alert('No se pudo establecer conexión con el backend Express. Asegúrate de que esté corriendo en http://localhost:3000');
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
  localStorage.removeItem('much_google_user');
  localStorage.removeItem('much_selected_avatar');
  localStorage.removeItem('much_current_view');
  localStorage.removeItem('partida_id');
  
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

// Guardar progreso del usuario en una estación
async function guardarProgresoUsuario(estacionId, extra = {}) {
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

// Guardar intento en una estación
async function guardarIntentoEstacion(estacionId, intento = {}) {
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

// Guardar partida minijuego
async function guardarPartidaMinijuego(partida = {}) {
  // En MySQL el minijuego corresponde a la estación id 1.
  return await guardarIntentoEstacion(1, {
    puntaje: partida.puntaje || 0,
    aciertos: partida.puntaje || 0, // simulación
    errores: 0,
    aprobado: partida.aprobado
  });
}

// Generar boleto final
async function generarBoletoFinal() {
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
window.guardarIntentoEstacion = guardarIntentoEstacion;
window.guardarPartidaMinijuego = guardarPartidaMinijuego;
window.generarBoletoFinal = generarBoletoFinal;
window.iniciarJuego = iniciarJuego;
window.cargarPreguntas = cargarPreguntas;
window.responderPregunta = responderPregunta;

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
  guardarIntentoEstacion,
  guardarPartidaMinijuego,
  generarBoletoFinal,
  iniciarJuego,
  cargarPreguntas,
  responderPregunta
};
