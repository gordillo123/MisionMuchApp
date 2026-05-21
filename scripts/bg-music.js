// Background music helper shared across pages
(function(){
  function ensureBgMusic(src = '../Sonidos/musica fondo.mp3'){
    try{
      if(!window.bgMusic){
        window.bgMusic = new Audio(src);
        window.bgMusic.loop = true;
        window.bgMusic.volume = 0.18;
        window.bgMusic.preload = 'auto';
      }
    }catch(e){/* ignore */}
  }
  function playBgMusic(){ try { ensureBgMusic(); window.bgMusic.play().catch(()=>{}); } catch(e){} }
  function pauseBgMusic(){ try{ if(window.bgMusic && !window.bgMusic.paused) window.bgMusic.pause(); }catch(e){} }

  // Try to autoplay; if blocked, attach a one-time user gesture to start music
  function initBgAutoPlay(){
    ensureBgMusic();
    // attempt immediate play
    window.bgMusic.play().catch(()=>{
      // attach a one-time listener to first user interaction
      const start = ()=>{
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
})();
