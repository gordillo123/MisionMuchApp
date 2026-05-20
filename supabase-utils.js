import './supabase-client.js';

async function initSupabase() {
  if (!window.supabase) {
    await import('./supabase-client.js');
  }
  return window.supabase;
}

async function obtenerSesionActual() {
  const supabase = await initSupabase();
  const { data, error } = await supabase.auth.getSession();
  console.log('[Supabase Auth] Sesion actual:', data?.session);
  if (error) console.error('[Supabase Auth] Error obteniendo sesion:', error);
  return data?.session || null;
}

async function obtenerUsuarioActual() {
  const supabase = await initSupabase();
  const { data, error } = await supabase.auth.getUser();
  console.log('[Supabase Auth] Usuario autenticado:', data?.user);
  console.log('[Supabase Auth] ID:', data?.user?.id);
  console.log('[Supabase Auth] Correo:', data?.user?.email);
  if (error) console.error('[Supabase Auth] Error obteniendo usuario:', error);
  return data?.user || null;
}

async function iniciarSesionConGoogle() {
  const supabase = await initSupabase();
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  });

  console.log('[Supabase Auth] signInWithOAuth:', { data, error, redirectTo });
  if (error) throw error;
  return data;
}

async function cerrarSesion() {
  const supabase = await initSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) console.error('[Supabase Auth] Error cerrando sesion:', error);
  localStorage.removeItem('much_google_user');
  return !error;
}

function normalizarUsuarioSupabase(user) {
  const metadata = user?.user_metadata || {};
  return {
    id: user.id,
    name: metadata.full_name || metadata.name || user.email || 'Explorador',
    email: user.email,
    picture: metadata.avatar_url || metadata.picture || '',
    avatar_url: metadata.avatar_url || metadata.picture || '',
    supabase_id: user.id
  };
}

async function verificarUsuarioEnTabla() {
  const supabase = await initSupabase();
  const user = await obtenerUsuarioActual();
  if (!user) return null;

  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', user.id)
    .single();

  console.log('[Supabase DB] Resultado public.usuarios:', { data, error });

  if (!data && error) {
    const { data: upsertData, error: upsertError } = await supabase
      .from('usuarios')
      .upsert({
        id: user.id,
        nombre: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
        correo: user.email,
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || ''
      }, { onConflict: 'id' })
      .select()
      .single();

    console.log('[Supabase DB] Upsert de depuracion public.usuarios:', {
      data: upsertData,
      error: upsertError
    });

    if (upsertError) throw upsertError;
    return upsertData;
  }

  return data;
}

async function consultarEstaciones() {
  const supabase = await initSupabase();
  const { data, error } = await supabase
    .from('estaciones')
    .select('*')
    .order('orden', { ascending: true });
  if (error) console.error('[Supabase DB] Error consultando estaciones:', error);
  return data || [];
}

async function guardarProgresoUsuario(estacionId, extra = {}) {
  const supabase = await initSupabase();
  const user = await obtenerUsuarioActual();
  if (!user) throw new Error('No hay usuario autenticado.');

  const { data, error } = await supabase
    .from('progreso_usuario')
    .upsert({
      user_id: user.id,
      estacion_id: estacionId,
      completada: true,
      completada_en: new Date().toISOString(),
      ...extra
    }, { onConflict: 'user_id,estacion_id' })
    .select()
    .single();

  console.log('[Supabase DB] Progreso guardado:', { data, error });
  if (error) throw error;
  return data;
}

async function generarBoletoFinal() {
  const supabase = await initSupabase();
  const user = await obtenerUsuarioActual();
  if (!user) throw new Error('No hay usuario autenticado.');

  const folio = `MUCH-${Date.now()}-${user.id.slice(0, 8)}`.toUpperCase();
  const { data, error } = await supabase
    .from('boletos')
    .insert({ user_id: user.id, folio })
    .select()
    .single();

  console.log('[Supabase DB] Boleto generado:', { data, error });
  if (error) throw error;
  return data;
}

async function iniciarJuego(nombreJugador) {
  const supabase = await initSupabase();
  const { data, error } = await supabase.rpc('iniciar_partida', {
    p_nombre: nombreJugador
  });

  if (error) {
    console.error(error);
    return;
  }

  localStorage.setItem('partida_id', data);
  console.log('Partida iniciada:', data);
}

async function cargarPreguntas(codigoEstacion) {
  const supabase = await initSupabase();
  const { data, error } = await supabase.rpc('obtener_preguntas_estacion', {
    p_codigo: codigoEstacion
  });

  if (error) {
    console.error(error);
    return;
  }

  console.log('Preguntas de la estación:', data);
}

async function responderPregunta(preguntaId, opcionId) {
  const partidaId = localStorage.getItem('partida_id');
  const supabase = await initSupabase();

  const { data, error } = await supabase.rpc('responder_pregunta', {
    p_partida_id: partidaId,
    p_pregunta_id: preguntaId,
    p_opcion_id: opcionId
  });

  if (error) {
    console.error(error);
    return;
  }

  console.log('Resultado:', data[0]);
}

window.initSupabase = initSupabase;
window.obtenerSesionActual = obtenerSesionActual;
window.obtenerUsuarioActual = obtenerUsuarioActual;
window.iniciarSesionConGoogle = iniciarSesionConGoogle;
window.cerrarSesion = cerrarSesion;
window.normalizarUsuarioSupabase = normalizarUsuarioSupabase;
window.verificarUsuarioEnTabla = verificarUsuarioEnTabla;
window.consultarEstaciones = consultarEstaciones;
window.guardarProgresoUsuario = guardarProgresoUsuario;
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
  generarBoletoFinal,
  iniciarJuego,
  cargarPreguntas,
  responderPregunta
};
