// Entry point: wires the menu, setup and game controls to the UI.

import { UI } from './ui.js';
import { toggleDebug, setDebug, isDebug, createLogger } from './debug.js';

const log = createLogger('main');

function boot() {
  log.log('boot', { debug: isDebug() });
  const ui = new UI();

  // Expose a tiny console API for troubleshooting.
  window.FOE = {
    ui,
    setDebug,
    toggleDebug,
    get game() {
      return ui.game;
    },
  };

  const on = (id, evt, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evt, fn);
    else log.warn('missing element', id);
  };

  /* ---- menu ---- */
  on('menu-play', 'click', () => ui.showScreen('setup'));
  on('menu-howto', 'click', () => ui.showOverlay('howto'));
  on('menu-online', 'click', () => log.log('online mode is locked'));

  /* ---- setup ---- */
  on('setup-back', 'click', () => ui.showScreen('menu'));
  on('setup-start', 'click', () => ui.startGame({ ...ui.selection }));

  /* ---- in-game top bar ---- */
  on('game-menu', 'click', () => ui.pause());

  /* ---- pause overlay ---- */
  on('pause-resume', 'click', () => ui.resume());
  on('pause-quit', 'click', () => ui.quitToMenu());

  /* ---- game over overlay ---- */
  on('result-again', 'click', () => ui.restart());
  on('result-menu', 'click', () => ui.quitToMenu());

  /* ---- keyboard shortcuts ---- */
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const gameActive = ui.el.screens.game.classList.contains('is-active');
      if (gameActive) {
        if (ui.el.overlays.pause.classList.contains('is-open')) ui.resume();
        else ui.pause();
      }
    } else if (e.key === 'd' || e.key === 'D') {
      toggleDebug();
    }
  });

  log.log('ready');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
