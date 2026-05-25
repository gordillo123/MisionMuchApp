(function () {
  async function lock(mode) {
    try {
      if (!screen.orientation || !screen.orientation.lock) return false;
      await screen.orientation.lock(mode);
      return true;
    } catch (error) {
      return false;
    }
  }

  async function lockPortrait() {
    document.documentElement.dataset.orientationTarget = 'portrait';
    return lock('portrait');
  }

  async function lockLandscape() {
    document.documentElement.dataset.orientationTarget = 'landscape';
    return lock('landscape');
  }

  async function unlockOrientation() {
    try {
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch (error) {}
  }

  async function applyFromDocument() {
    const target = document.documentElement.dataset.orientation || document.body?.dataset.orientation || 'portrait';
    if (target === 'landscape') await lockLandscape();
    else await lockPortrait();
  }

  window.MuchOrientation = {
    lock,
    lockPortrait,
    lockLandscape,
    unlock: unlockOrientation,
    applyFromDocument
  };
  window.lockPortraitOrientation = lockPortrait;
  window.lockLandscapeOrientation = lockLandscape;

  document.addEventListener('DOMContentLoaded', applyFromDocument);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) applyFromDocument();
  });
})();
