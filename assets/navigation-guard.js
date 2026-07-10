/**
 * Misión MUCH - Guard de Navegación Interna
 * Protege contra el acceso directo por URL a las páginas y vistas internas.
 * Si se detecta un acceso directo (copiar/pegar URL en nueva pestaña/navegador),
 * redirige automáticamente a la pantalla principal (index.html).
 */
(function () {
  'use strict';

  // Obtener la ruta limpia actual
  const path = window.location.pathname.toLowerCase();

  // El panel administrativo/taquilla tiene su propia barrera de autenticación
  const isAdminPanelPage = path.endsWith('/administrador.html');
  if (isAdminPanelPage) {
    return;
  }

  // Determinar si la página actual está dentro de una subcarpeta de estación
  const isInSubfolder = path.includes('/juego_spinosaurio/') ||
                        path.includes('/entrada-much/') ||
                        path.includes('/sala-biodiversidad-y-conocimiento/') ||
                        path.includes('/sala_energia/') ||
                        path.includes('/sala_desarrollo_sustentable/') ||
                        path.includes('/sbeel_dinosaurios/');

  // Identificar si la página actual es la principal (index.html)
  const isMainPage = !isInSubfolder && !isAdminPanelPage;

  if (isMainPage) {
    try {
      sessionStorage.setItem('much_internal_navigation', 'true');
    } catch (e) {}
    return;
  }

  // 1. Verificación síncrona local de bloqueo global
  const isBlockedLocal = localStorage.getItem('much_estado_recorrido') === 'bloqueado_temporalmente';
  if (isBlockedLocal && isInSubfolder) {
    console.warn('[Guard] Usuario bloqueado localmente. Redirigiendo al mapa.');
    window.location.replace('../index.html');
    return;
  }

  // 2. Verificación asíncrona en la Base de Datos
  let userId = null;
  try {
    const userJson = localStorage.getItem('much_google_user');
    if (userJson) {
      const user = JSON.parse(userJson);
      userId = user.id_usuario || user.id;
    }
  } catch (e) {}

  if (userId) {
    const API_BASE_URL = window.location.hostname ? `http://${window.location.hostname}:3000` : 'http://127.0.0.1:3000';
    fetch(`${API_BASE_URL}/api/juego/estado-bloqueo`, {
      headers: { 'x-user-id': String(userId) }
    })
      .then(res => {
        if (!res.ok) throw new Error('Error al consultar estado de bloqueo.');
        return res.json();
      })
      .then(estado => {
        if (estado.bloqueado) {
          localStorage.setItem('much_estado_recorrido', 'bloqueado_temporalmente');
          localStorage.setItem('much_fecha_proximo_juego', estado.fecha_puede_volver || '');
          localStorage.setItem('much_playtime_block_msg', estado.mensaje || '');
          localStorage.setItem('much_motivo_bloqueo', estado.motivo_bloqueo || 'intentos');
          if (estado.detalle_bloqueo || estado.estacion) {
            localStorage.setItem('much_detalle_bloqueo', estado.detalle_bloqueo || estado.estacion);
          }
          if (isInSubfolder) {
            console.warn('[Guard] Usuario bloqueado en BD. Redirigiendo al mapa.');
            window.location.replace('../index.html');
          }
        } else {
          // Si no está bloqueado en la BD pero localmente decía que sí (por ejemplo, pasaron los 7 días)
          if (isBlockedLocal) {
            localStorage.removeItem('much_estado_recorrido');
            localStorage.removeItem('much_fecha_proximo_juego');
            localStorage.removeItem('much_playtime_block_msg');
            localStorage.removeItem('much_motivo_bloqueo');
            localStorage.removeItem('much_detalle_bloqueo');
            if (estado.nuevo_ciclo_iniciado) {
              localStorage.setItem('much_completed_stations', '{}');
              localStorage.setItem('much_current_station', '1');
            }
          }
        }
      })
      .catch(err => console.error('[Guard] Error de sincronización de bloqueo:', err));
  }

  // Verificar si la navegación proviene del flujo interno de la app en la misma pestaña
  const isInternalNav = sessionStorage.getItem('much_internal_navigation') === 'true';

  if (!isInternalNav) {
    console.warn('[Guard] Acceso directo detectado. Redirigiendo a la pantalla principal.');
    
    // Determinar la ruta de retorno a index.html según la profundidad del directorio
    let redirectPath = isInSubfolder ? '../index.html' : 'index.html';

    // Redirigir de forma segura reemplazando el historial para que no se pueda volver atrás a la ruta protegida
    window.location.replace(redirectPath);
  }
})();
