// Background music helper shared across pages
(function(){
  const scriptUrl = document.currentScript?.src || '';
  const projectRootUrl = scriptUrl ? new URL('../', scriptUrl).href : '../';
  const resolveAudioUrl = (path) => {
    try {
      return new URL(path.replace(/^\.\.\//, ''), projectRootUrl).href;
    } catch (e) {
      return path;
    }
  };
  const SFX_VOLUME = 0.34;
  const SFX_COOLDOWN_MS = 90;
  const RESULT_COOLDOWN_MS = 650;
  const lastSfxAt = {};
  let audioCtx = null;
  const sfxPlayers = {};
  const SFX_SOURCES = {
    success: resolveAudioUrl('Sonidos/Estacion completada.mp3'),
    complete: resolveAudioUrl('Sonidos/Estacion completada.mp3'),
    error: resolveAudioUrl('Sonidos/respuesta incorrecta.mp3'),
    fail: resolveAudioUrl('Sonidos/respuesta incorrecta.mp3'),
    wrong: resolveAudioUrl('Sonidos/respuesta incorrecta.mp3')
  };

  function isBgMusicMuted(){ return window.bgMusicMuted === true; }
  function canUseBgMusic(){ return window.bgMusicScope !== 'off' && !isBgMusicMuted(); }
  function isSfxMuted(){ return window.bgMusicMuted === true || localStorage.getItem('much_landing_sound') === 'off'; }

  function ensureBgMusic(src = resolveAudioUrl('Sonidos/musica fondo.mp3')){
    try{
      if(!canUseBgMusic()){
        if(window.bgMusic) window.bgMusic.muted = true;
        return;
      }
      if(!window.bgMusic){
        window.bgMusic = new Audio(src);
        window.bgMusic.loop = true;
        window.bgMusic.volume = 0.18;
        window.bgMusic.preload = 'auto';
        window.bgMusic.addEventListener('ended', () => {
          try {
            window.bgMusic.currentTime = 0;
            if (canUseBgMusic()) window.bgMusic.play().catch(()=>{});
          } catch(e) {}
        });
      }
      window.bgMusic.muted = false;
    }catch(e){/* ignore */}
  }
  function playBgMusic(){ try { if(!canUseBgMusic()) return; ensureBgMusic(); window.bgMusic.muted = false; window.bgMusic.play().catch(()=>{}); } catch(e){} }
  function pauseBgMusic(){ try{ if(window.bgMusic && !window.bgMusic.paused) window.bgMusic.pause(); }catch(e){} }
  function getAudioContext(){
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if(!AudioCtx) return null;
    try{
      audioCtx = audioCtx || new AudioCtx();
      if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
      return audioCtx;
    }catch(e){
      return null;
    }
  }

  function playTone(freq = 620, dur = 0.055, type = 'sine', vol = 0.035){
    try{
      const ctx = getAudioContext();
      if(!ctx) return false;
      const start = ctx.currentTime + 0.005;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(vol, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
      return true;
    }catch(e){
      return false;
    }
  }

  function stopResultSfx(){
    ['success', 'complete', 'error', 'fail', 'wrong'].forEach((type) => {
      const audio = sfxPlayers[type];
      if(!audio) return;
      try{
        audio.pause();
        audio.currentTime = 0;
      }catch(e){}
    });
  }

  function getSfxPlayer(type){
    const src = SFX_SOURCES[type] || SFX_SOURCES.click;
    if(!src) return null;
    if(!sfxPlayers[type]){
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.volume = SFX_VOLUME;
      sfxPlayers[type] = audio;
    }
    return sfxPlayers[type];
  }

  function playMuchSfx(type = 'click', options = {}){
    try{
      if(isSfxMuted() && !options.force) return Promise.resolve(false);
      const now = Date.now();
      const key = String(type || 'click');
      const isResult = ['success', 'complete', 'error', 'fail', 'wrong'].includes(key);
      const cooldown = isResult ? RESULT_COOLDOWN_MS : SFX_COOLDOWN_MS;
      if(!options.allowOverlap && lastSfxAt[key] && now - lastSfxAt[key] < cooldown) {
        return Promise.resolve(false);
      }
      lastSfxAt[key] = now;
      if(key === 'click'){
        playTone(520, 0.045, 'triangle', 0.025);
        return Promise.resolve(true);
      }
      if(isResult) stopResultSfx();
      const audio = getSfxPlayer(key);
      if(!audio) return Promise.resolve(false);
      audio.volume = typeof options.volume === 'number' ? options.volume : SFX_VOLUME;
      audio.pause();
      audio.currentTime = 0;
      return audio.play().then(() => true).catch(() => false);
    }catch(e){
      return Promise.resolve(false);
    }
  }

  function unlockMuchAudio(){
    try{
      getAudioContext();
      if(canUseBgMusic()) playBgMusic();
      Object.keys(SFX_SOURCES).forEach((type) => {
        const audio = getSfxPlayer(type);
        if(audio) audio.load();
      });
    }catch(e){}
  }

  function bindMuchAudioUnlock(){
    const start = () => {
      unlockMuchAudio();
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('click', start);
      window.removeEventListener('keydown', start);
      window.removeEventListener('touchstart', start);
    };
    window.addEventListener('pointerdown', start, { once: true, passive: true });
    window.addEventListener('click', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    window.addEventListener('touchstart', start, { once: true, passive: true });
  }

  function bindGlobalButtonSounds(root = document){
    try{
      root.addEventListener('click', (event) => {
        const target = event.target?.closest?.('button, a, [role="button"], .map-marker');
        if(!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
        if(target.closest('.option-btn, .quiz-opt, .mm-card, .puzzle-piece, .piece, [data-no-click-sound]')) return;
        playMuchSfx('click', { volume: 0.18 });
      }, true);
    }catch(e){}
  }

  // Try to autoplay; if blocked, attach a one-time user gesture to start music
  function initBgAutoPlay(){
    if(!canUseBgMusic()) return;
    ensureBgMusic();
    // attempt immediate play
    window.bgMusic.play().catch(()=>{
      // attach a one-time listener to first user interaction
      const start = ()=>{
        if(!canUseBgMusic()) return;
        window.bgMusic.play().catch(()=>{});
        window.removeEventListener('click', start);
        window.removeEventListener('keydown', start);
        window.removeEventListener('touchstart', start);
      };
      window.addEventListener('click', start, { once: true });
      window.addEventListener('keydown', start, { once: true });
      window.addEventListener('touchstart', start, { once: true });
    });
  }

  // Expose
  window.ensureBgMusic = ensureBgMusic;
  window.playBgMusic = playBgMusic;
  window.pauseBgMusic = pauseBgMusic;
  window.initBgAutoPlay = initBgAutoPlay;
  window.playMuchSfx = playMuchSfx;
  window.stopMuchResultSfx = stopResultSfx;
  window.unlockMuchAudio = unlockMuchAudio;
  window.bindGlobalButtonSounds = bindGlobalButtonSounds;
  bindMuchAudioUnlock();
  window.setTimeout(initBgAutoPlay, 60);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && canUseBgMusic()) {
      playBgMusic();
    }
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bindGlobalButtonSounds(document), { once: true });
  } else {
    bindGlobalButtonSounds(document);
  }
})();
