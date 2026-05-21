/**
 * MISIÓN MUCH - HTML Modules Library
 * This file contains all the HTML components as strings to bypass CORS issues 
 * when viewing the project directly via file:// protocol.
 */

window.APP_MODULES = {
  "modules/landing.html": `
<nav class="top-nav">
  <div class="nav-container">
    <a href="#" class="nav-brand">
      <span class="nav-brand-text">MISIÓN MUCH</span>
      <span class="nav-brand-logos" aria-label="Logos institucionales">
        <img src="entrada-much/logo-sata.png" alt="SATA" class="nav-brand-logo nav-brand-logo-sata">
        <img src="entrada-much/logo-much.png" alt="Museo Chiapas de Ciencia y Tecnología" class="nav-brand-logo nav-brand-logo-much">
        <img src="Sbeel_Dinosaurios/logo-sbeel-dinosaurios.svg" alt="SBEEL Dinosaurios" class="nav-brand-logo nav-brand-logo-sbeel">
        <img src="Juego_Spinosaurio/logo-agencia.png" alt="Agencia Digital Tecnológica del Estado" class="nav-brand-logo nav-brand-logo-agencia">
      </span>
    </a>
    <div class="nav-links">
      <a href="#" class="nav-btn active" id="btnInicio">
        <span class="nav-icon">🏠</span>
        <span class="nav-label">Inicio</span>
      </a>
      <a href="#" class="nav-btn" id="btnPuntajes">
        <span class="nav-icon">🏆</span>
        <span class="nav-label">Puntajes</span>
      </a>
      <a href="#" class="nav-btn" id="btnComoJugar">
        <span class="nav-icon">❔</span>
        <span class="nav-label">Ayuda</span>
      </a>
      <a href="entrada-much/dashboard.html" class="nav-btn" id="btnAdmin">
        <span class="nav-icon">🛡️</span>
        <span class="nav-label">Admin</span>
      </a>
      <a href="#" class="nav-btn" id="btnPerfil">
        <div class="nav-avatar">
          <img src="avatars/dino1.png" alt="Avatar" id="navAvatarImg">
        </div>
        <span class="nav-label">Perfil</span>
      </a>
    </div>
  </div>
</nav>

<main class="main-area">
  <div class="hero">
    
    <div class="hero-glass">

      <h1 class="hero-title">
        <span class="animal-deco animal-left">🦋</span> MISIÓN <span class="animal-deco animal-right">🦖</span><br/>
        <span class="animal-deco animal-left2">🐙</span> MUCH <span class="animal-deco animal-right2">🦜</span>
      </h1>
      <p class="hero-subtitle">Descubre dinosaurios, animales y tecnología<br/>¡Demuestra cuánto sabes!</p>
      <div class="hero-play-mobile">
        <button class="btn-play btn-play-mobile" onclick="startGameFlow()">
          ▶ JUGAR
        </button>
        <p class="mobile-play-note">¡Prepárate!</p>
      </div>
    </div>

    <div class="hero-badges">
      <div class="badge node-1 active" data-fact="El T-Rex tenía una mordida 3 veces más fuerte que la de un cocodrilo moderno, con una fuerza de hasta 57,000 Newtons.">
        🦕 Dinosaurios
      </div>
      <div class="badge node-2" data-fact="El pulpo tiene 3 corazones, 9 cerebros y su sangre es de color azul gracias al cobre.">
        🦋 Animales
      </div>
      <div class="badge node-3" data-fact="Un rayo cae en la Tierra unas 100 veces por segundo. ¡Eso son 8 millones de rayos al día!">
        ⚛️ Ciencia
      </div>
      <div class="badge node-4" data-fact="El primer mensaje de texto de la historia fue enviado el 3 de diciembre de 1992 y decía: 'Merry Christmas'.">
        💻 Tecnología
      </div>
      <div class="badge node-5" data-fact="Existen más de 7,000 idiomas en el mundo. El 40% está en peligro de desaparecer.">
        🧬 Diversidad
      </div>
    </div>
  </div>
</main>
  `,

  "modules/prep.html": `
<button class="back-button-prep" id="btnBackPrep" title="Volver">←</button>
<div class="intro-container">
  <div class="rules-col">
    <div class="card">
      <h2 class="section-title"> Reglas</h2>
      <ul class="rules-list" style="max-height: 400px; overflow-y: auto; padding-right: 10px;">
        <li><span class="rule-icon">📱</span>
          <div>Usa el celular en vertical para las preguntas. Solo el Espinosaurio se juega en horizontal.</div>
        </li>
        <li><span class="rule-icon">📷</span>
          <div>Escanea el código QR de cualquier estación del museo.</div>
        </li>
        <li><span class="rule-icon">👤</span>
          <div>Inicia sesión con tu cuenta de Google.</div>
        </li>
        <li><span class="rule-icon">📍</span>
          <div>Acepta el permiso de ubicación para ver dónde estás.</div>
        </li>
        <li><span class="rule-icon">🧑‍🚀</span>
          <div>Selecciona tu avatar.</div>
        </li>
        <li><span class="rule-icon">🗺️</span>
          <div>Revisa el mapa interactivo para ver tus estaciones.</div>
        </li>
        <li><span class="rule-icon">🔍</span>
          <div>Escanea el QR de la estación donde te encuentres.</div>
        </li>
        <li><span class="rule-icon">📖</span>
          <div>Lee o revisa el contenido educativo de la estación.</div>
        </li>
        <li><span class="rule-icon">🧠</span>
          <div>Responde las 10 preguntas de la trivia.</div>
        </li>
        <li><span class="rule-icon">🦖</span>
          <div>En el Espinosaurio, completa el reto de 15 saltos.</div>
        </li>
        <li><span class="rule-icon">💖</span>
          <div>Tienes máximo 3 intentos por estación.</div>
        </li>
        <li><span class="rule-icon">💀</span>
          <div>Si fallas los 3 intentos, el juego se reinicia.</div>
        </li>
        <li><span class="rule-icon">💾</span>
          <div>Si sales, usa “Seguir jugando” para continuar.</div>
        </li>
        <li><span class="rule-icon">🏁</span>
          <div>Completa todas las estaciones para terminar.</div>
        </li>
        <li><span class="rule-icon">🏆</span>
          <div>Al finalizar, revisa tu resultado final.</div>
        </li>
      </ul>
    </div>
    <div class="avatar-preview-box" id="avatarPreviewBox">
      <div id="prepAvatarImg"
        style="width: 70px; height: 70px; background: white; border-radius: 15px; overflow: hidden; padding: 5px;">
      </div>
      <div>
        <p style="font-size: .8rem; opacity: .8;">Tu Avatar:</p>
        <p id="prepAvatarName" style="font-weight: 900; font-size: 1.2rem;">---</p>
      </div>
    </div>
  </div>

  <div class="map-col">
    <div class="card" style="height: 100%; display: flex; flex-direction: column;">
      <div class="prep-logo-strip" aria-label="Logos institucionales">
        <img src="entrada-much/logo-sata.png" alt="SATA">
        <img src="entrada-much/logo-much.png" alt="Museo Chiapas de Ciencia y Tecnología">
        <img src="Sbeel_Dinosaurios/logo-sbeel-dinosaurios.svg" alt="SBEEL Dinosaurios" class="prep-logo-sbeel">
        <img src="Juego_Spinosaurio/logo-agencia.png" alt="Agencia Digital Tecnológica del Estado">
      </div>
      <h2 class="section-title">¿En qué estación estás?</h2>
      <div class="museum-map" id="museumMap">
        <img src="mapa 12.png" alt="Mapa del Museo" class="map-bg" />
        <svg class="map-overlay-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path id="mapPath" class="animated-path" d="M 80 18 L 56 42 L 21 24 L 10 44 L 30 43 L 42 66" />
        </svg>

        <div class="map-marker" style="left: 80%; top: 18%;" data-station="1">1</div>
        <div class="map-marker" style="left: 56%; top: 42%;" data-station="2">2</div>
        <div class="map-marker" style="left: 21%; top: 24%;" data-station="3">3</div>
        <div class="map-marker" style="left: 10%; top: 44%;" data-station="4">4</div>
        <div class="map-marker" style="left: 30%; top: 43%;" data-station="5">5</div>
        <div class="map-marker" style="left: 42%; top: 66%;" data-station="6">6</div>

        <div class="map-avatar" id="mapAvatar">
          <div id="mapAvatarImgCont" style="width: 100%; height: 100%;"></div>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem; margin-top: 1.5rem;">
        <button class="btn-play large" id="btnComenzar" style="width: max-content; min-width: 280px;">🚀 ¡COMENZAR!</button>
        <div id="rewardClaimBox" class="reward-claim-box is-hidden" aria-live="polite">
          <div class="reward-claim-copy">
            <span class="reward-claim-kicker">Misión completada</span>
            <strong>Entrada gratis al museo desbloqueada</strong>
          </div>
          <button id="btnClaimReward" class="btn-claim-reward" type="button">🎟️ Reclamar mi premio</button>
        </div>
        <button id="btnResetProgress" type="button" style="background: transparent; border: 2px dashed rgba(255,255,255,0.25); color: #A0A4B8; padding: 6px 16px; border-radius: 20px; font-family: inherit; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; gap: 5px;">
          <span>🔄</span> Reiniciar Estaciones
        </button>
      </div>
    </div>
  </div>
</div>
  `,

  "modules/profile.html": `
<div class="profile-card">
  <button class="modal-close" id="btnCerrarPerfil">×</button>
  <div class="profile-header">
    <div class="profile-avatar-wrap">
      <img src="avatars/dino1.png" class="profile-avatar-img" id="profAvatarImg">
    </div>
    <h2 class="profile-name" id="profName">Explorador</h2>
    <p style="color: #A0A4B8;" id="profEmail">invitado@misionmuch.com</p>
  </div>

  <div class="profile-stats">
    <div class="stat-box">
      <span class="stat-value" id="profScore">0</span>
      <span class="stat-label">Puntaje Total</span>
    </div>
    <div class="stat-box">
      <span class="stat-value" id="profRank">--</span>
      <span class="stat-label">Rango</span>
    </div>
  </div>

  <div class="profile-actions">
    <button class="btn-profile-action btn-profile-primary" id="btnCambiarAvatar">Cambiar Avatar</button>
    <button class="btn-profile-action" onclick="localStorage.clear(); location.reload();">Cerrar Sesión</button>
  </div>
</div>
  `,

  "modules/login.html": `
<div class="avatar-modal login-modal">
  <div class="modal-header">
    <div class="login-badge">🔐</div>
    <h2 class="modal-title">Entra con Google</h2>
    <p class="login-copy">Para guardar tu avance en la misión, inicia sesión con tu cuenta de Google.</p>
  </div>
  <div class="google-login-area">
    <div id="googleSignInButton"></div>
    <button class="btn-google" id="btnGoogleFallback" type="button">
      <svg class="google-g" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335"
          d="M24 9.5c3.5 0 6.5 1.2 8.9 3.5l6.6-6.6C35.5 2.7 30.3.5 24 .5 14.8.5 6.9 5.8 3.1 13.6l7.7 6C12.6 13.7 17.9 9.5 24 9.5z" />
        <path fill="#4285F4"
          d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.5 2.8-2.2 5.2-4.7 6.8l7.3 5.7c4.3-4 7.2-9.9 7.2-16.5z" />
        <path fill="#FBBC05"
          d="M10.8 28.4c-.5-1.4-.8-2.9-.8-4.4s.3-3 .8-4.4l-7.7-6C1.5 16.7.5 20.2.5 24s1 7.3 2.6 10.4l7.7-6z" />
        <path fill="#34A853"
          d="M24 47.5c6.3 0 11.6-2.1 15.4-5.7l-7.3-5.7c-2 1.3-4.6 2.1-8.1 2.1-6.1 0-11.4-4.1-13.2-9.8l-7.7 6C6.9 42.2 14.8 47.5 24 47.5z" />
      </svg>
      Continuar con Google
    </button>
    <p class="login-note" id="loginNote">Usa Google para comenzar tu aventura.</p>
  </div>
</div>
  `,

  "modules/avatar_selection.html": `
<div class="avatar-modal">
  <div class="modal-header">
    <h2 class="modal-title">Elige tu Avatar</h2>
    <p>Selecciona tu personaje favorito</p>
    <div class="user-chip" id="userChip">
      <span class="user-chip-avatar" id="userChipAvatar">G</span>
      <span id="userChipName">Cuenta Google</span>
    </div>
  </div>
  <div class="avatar-tabs">
    <button class="av-tab active" data-filter="all">Todos</button>
    <button class="av-tab" data-filter="human">Humanos</button>
    <button class="av-tab" data-filter="dino">Dinos</button>
    <button class="av-tab" data-filter="space">Espacio</button>
  </div>
  <div class="avatar-grid" id="avatarGrid">
    <!-- Generado dinámicamente -->
  </div>
  <div class="modal-footer">
    <p id="previewName" style="font-weight: 800; color: var(--msf-pink);">Ninguno</p>
    <button class="btn-confirm" id="btnConfirmar" disabled>Confirmar</button>
  </div>
</div>
  `,

  "modules/scores.html": `
<div class="avatar-modal scores-modal">
  <div class="modal-header">
    <h2 class="modal-title" style="color: var(--msf-pink);">🏆 Tabla de Honor</h2>
    <p>Los mejores exploradores del museo</p>
  </div>
  <div class="scores-content">
    <!-- Podio -->
    <div class="podium">
      <div class="podium-item podium-2">
        <img src="avatars/dino2.png" class="podium-avatar">
        <div class="podium-rank">2</div>
        <div class="podium-box">2º</div>
        <div class="podium-name">Alex Explorer</div>
        <div class="podium-score">1,250</div>
      </div>
      <div class="podium-item podium-1">
        <img src="avatars/dino1.png" class="podium-avatar">
        <div class="podium-rank">1</div>
        <div class="podium-box">1º</div>
        <div class="podium-name">Dani Pro</div>
        <div class="podium-score">1,500</div>
      </div>
      <div class="podium-item podium-3">
        <img src="avatars/dino3.png" class="podium-avatar">
        <div class="podium-rank">3</div>
        <div class="podium-box">3º</div>
        <div class="podium-name">Cris Fun</div>
        <div class="podium-score">980</div>
      </div>
    </div>

    <!-- Lista del 4 en adelante -->
    <div class="scores-list" id="scoresListContainer">
      <!-- Generado por JS -->
    </div>

    <!-- Tu Rango -->
    <div class="my-rank-card">
      <div class="my-rank-info">
        <div class="my-rank-num">15</div>
        <div>
          <p style="font-weight: 800; font-size: 1.1rem;">Tu Posición Actual</p>
          <p style="opacity: 0.9; font-size: 0.85rem;">Sigue jugando para subir</p>
        </div>
      </div>
      <div style="text-align: right;">
        <p style="font-weight: 900; font-size: 1.4rem;">850 pts</p>
      </div>
    </div>
  </div>
  <div class="modal-footer" style="justify-content: center;">
    <button class="btn-confirm" id="btnCerrarPuntajes" style="background: var(--msf-pink);">¡Genial!</button>
  </div>
</div>
  `,

  "modules/rules.html": `
<div class="avatar-modal rules-modal">
  <button class="btn-back-regreso" id="btnBackRules" title="Cerrar">✕</button>
  <div class="modal-header">
    <h2 class="modal-title" style="color: var(--msf-purple);">Cómo Jugar</h2>
    <p>Sigue estos pasos para completar tu misión con éxito</p>
  </div>
  <div class="rules-content">
    <div class="rule-item">
      <div class="rule-icon-pro">📱</div>
      <div class="rule-text">Usa el celular en vertical para las preguntas. Solo el Espinosaurio se juega en horizontal.</div>
    </div>
    <div class="rule-item">
      <div class="rule-icon-pro">📷</div>
      <div class="rule-text">Escanea el código QR de cualquier estación del museo.</div>
    </div>
    <div class="rule-item">
      <div class="rule-icon-pro">👤</div>
      <div class="rule-text">Inicia sesión con tu cuenta de Google.</div>
    </div>
    <div class="rule-item">
      <div class="rule-icon-pro">📍</div>
      <div class="rule-text">Acepta el permiso de ubicación para mostrar dónde estás dentro del recorrido.</div>
    </div>
    <div class="rule-item">
      <div class="rule-icon-pro">🧑‍🚀</div>
      <div class="rule-text">Selecciona tu avatar.</div>
    </div>
    <div class="rule-item">
      <div class="rule-icon-pro">🗺️</div>
      <div class="rule-text">Revisa el mapa interactivo para ver tu ubicación, estaciones pendientes y estaciones
        completadas.</div>
    </div>
    <div class="rule-item">
      <div class="rule-icon-pro">🔍</div>
      <div class="rule-text">Escanea el QR de la estación donde te encuentres.</div>
    </div>
    <div class="rule-item">
      <div class="rule-icon-pro">📖</div>
      <div class="rule-text">Lee o revisa el contenido educativo de la estación.</div>
    </div>
    <div class="rule-item">
      <div class="rule-icon-pro">🧠</div>
      <div class="rule-text">Responde las 10 preguntas de la trivia.</div>
    </div>
    <div class="rule-item">
      <div class="rule-icon-pro">🦖</div>
      <div class="rule-text">Si estás en la estación del Espinosaurio, completa el reto de 10 saltos.</div>
    </div>
    <div class="rule-item">
      <div class="rule-icon-pro">💖</div>
      <div class="rule-text">Tienes máximo 3 intentos por estación.</div>
    </div>
    <div class="rule-item">
      <div class="rule-icon-pro">💀</div>
      <div class="rule-text">Si fallas los 3 intentos, el juego se reinicia desde cero.</div>
    </div>
    <div class="rule-item">
      <div class="rule-icon-pro">💾</div>
      <div class="rule-text">Si sales del juego, presiona “Seguir jugando” para continuar desde tu progreso
        guardado.</div>
    </div>
    <div class="rule-item">
      <div class="rule-icon-pro">🏁</div>
      <div class="rule-text">Completa todas las estaciones para terminar la misión.</div>
    </div>
    <div class="rule-item">
      <div class="rule-icon-pro">🏆</div>
      <div class="rule-text">Al finalizar, revisa tu resultado final.</div>
    </div>
  </div>
  <div class="modal-footer" style="justify-content: center;">
    <button class="btn-confirm" id="btnCerrarReglas"
      style="background: linear-gradient(135deg, var(--msf-purple), var(--msf-blue));">¡Entendido!</button>
  </div>
</div>
  `
};
