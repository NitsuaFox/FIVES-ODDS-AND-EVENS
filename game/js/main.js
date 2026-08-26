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
  on('menu-play', 'click', () => {
    log.log('menu-play click');
    ui.showScreen('setup');
  });
  on('menu-howto', 'click', () => {
    log.log('menu-howto click');
    ui.showOverlay('howto');
  });
  on('menu-online', 'click', () => log.log('online mode is locked'));

  logMenuButtonStyles();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready
      .then(() => {
        log.log('webfonts ready', {
          families: [...document.fonts].map((f) => `${f.family} ${f.weight}`).slice(0, 12),
        });
        logMenuButtonStyles();
      })
      .catch((err) => log.warn('webfonts failed', err));
  }

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

  log.log('ready');
}

function logMenuButtonStyles() {
  const ids = ['menu-play', 'menu-online', 'menu-howto'];
  const snapshot = ids.map((id) => {
    const el = document.getElementById(id);
    if (!el) return { id, missing: true };
    const cs = getComputedStyle(el);
    const label = el.querySelector('.btn__label');
    const labelCs = label ? getComputedStyle(label) : null;
    return {
      id,
      fontFamily: cs.fontFamily,
      textAlign: cs.textAlign,
      justifyContent: cs.justifyContent,
      alignItems: cs.alignItems,
      labelFont: labelCs ? `${labelCs.fontWeight} ${labelCs.fontSize} ${labelCs.fontFamily}` : null,
      labelAlign: labelCs ? labelCs.textAlign : null,
    };
  });
  log.log('menu button styles', snapshot);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
