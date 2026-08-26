// Entry point: wires the menu, setup and game controls to the UI.

import { UI } from './ui.js';
import { toggleDebug, setDebug, isDebug, createLogger } from './debug.js';
import { initWavedash, toggleOverlay, hasSDK } from './wavedash.js';

const log = createLogger('main');

// Optionally install the dev-only Wavedash mock (?mock=1) when no real SDK is
// injected. This lets us exercise the integration on a plain static server.
async function maybeInstallMock() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mock') === '1' && !hasSDK()) {
      log.log('loading dev Wavedash mock (?mock=1)');
      await import('./wavedash-mock.js');
    }
  } catch (e) {
    log.warn('mock install failed', e);
  }
}

async function boot() {
  log.log('boot', { debug: isDebug(), wavedashPresent: hasSDK() });
  await maybeInstallMock();
  const ui = new UI();

  // Reveal the game on the Wavedash platform (no-op when standalone).
  initWavedash({ debug: isDebug() });

  // Expose a tiny console API for troubleshooting.
  window.FOE = {
    ui,
    setDebug,
    toggleDebug,
    logMenuAlignment: () => ui.logMenuAlignment(),
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
    } else if (e.key === 'o' || e.key === 'O') {
      toggleOverlay(); // Wavedash friends/invites overlay (no-op standalone)
    }
  });

  window.addEventListener('resize', () => {
    if (ui.el.screens.menu.classList.contains('is-active')) {
      ui.logMenuAlignment();
    }
  });

  log.log('ready');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
