import './supabase-client.js';

async function initSupabase() {
  if (!window.supabase) {
    await import('./supabase-client.js');
  }
  return window.supabase;
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
window.iniciarJuego = iniciarJuego;
window.cargarPreguntas = cargarPreguntas;
window.responderPregunta = responderPregunta;

export { initSupabase, iniciarJuego, cargarPreguntas, responderPregunta };
