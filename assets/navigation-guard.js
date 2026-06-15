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

  // Identificar si la página actual es la principal (index.html)
  const isMainPage = path.endsWith('/') || 
                     path.endsWith('/index.html') ||
                     // En entornos locales o file:// sin extensión .html
                     (!path.includes('.html') && 
                      !path.includes('/juego_') && 
                      !path.includes('/sala-') && 
                      !path.includes('/sala_') && 
                      !path.includes('/entrada-') && 
                      !path.includes('/sbeel_'));

  // Obtener los parámetros de búsqueda de la URL actual
  const urlParams = new URLSearchParams(window.location.search);
  const hasViewParam = urlParams.has('view'); // '?view=prep' o similar
  const isInternalViewOfMain = isMainPage && hasViewParam;

  // Si estamos en la página principal y NO estamos accediendo a una vista interna directamente
  if (isMainPage && !hasViewParam) {
    // Marcamos que el usuario inició su flujo desde la pantalla principal en esta pestaña
    sessionStorage.setItem('much_internal_navigation', 'true');
    return;
  }

  // Verificar si la navegación proviene del flujo interno de la app en la misma pestaña
  const isInternalNav = sessionStorage.getItem('much_internal_navigation') === 'true';

  if (!isInternalNav) {
    console.warn('[Guard] Acceso directo detectado. Redirigiendo a la pantalla principal.');
    
    // Determinar la ruta de retorno a index.html según la profundidad del directorio
    let redirectPath = 'index.html';
    
    // Si la página actual está dentro de una subcarpeta de estación
    const isInSubfolder = path.includes('/juego_spinosaurio/') ||
                          path.includes('/entrada-much/') ||
                          path.includes('/sala-biodiversidad-y-conocimiento/') ||
                          path.includes('/sala_energia/') ||
                          path.includes('/sala_desarrollo_sustentable/') ||
                          path.includes('/sbeel_dinosaurios/');
    
    if (isInSubfolder) {
      redirectPath = '../index.html';
    }

    // Redirigir de forma segura reemplazando el historial para que no se pueda volver atrás a la ruta protegida
    window.location.replace(redirectPath);
  }
})();
