import '@fontsource-variable/space-grotesk';
import './styles.css';

import { AmbientScene } from './ambient.ts';
import { AudioEngine } from './audio.ts';
import { GAME_VERSION, PLAYERS, STUDIO_NAME, STUDIO_URL } from './config.ts';
import { isDebug, setDebug, toggleDebug } from './debug.ts';
import { Phase } from './game.ts';
import { UI } from './ui.ts';
import { hasSDK, initWavedash, toggleOverlay } from './wavedash.ts';

async function maybeInstallMock(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mock') === '1' && !hasSDK()) await import('./wavedash-mock.ts');
}

function on(id: string, event: string, callback: EventListener): void {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing event target #${id}`);
  node.addEventListener(event, callback);
}

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.getElementById('stage')?.requestFullscreen();
}

function debugAutoStep(ui: UI): boolean {
  const game = ui.game;
  if (!game) return false;
  if (game.phase === Phase.ROUND_OVER) {
    game.nextRound();
    return true;
  }
  if (game.isHumanTurn()) {
    let moves = game.validMovesFor(PLAYERS.YOU);
    if (game.phase === Phase.START) moves = moves.filter((index) => index !== game.pendingStart[PLAYERS.CPU]);
    const move = moves[0];
    if (move !== undefined) game.humanMove(move);
  }
  game.advanceTime(30_000);
  return true;
}

async function boot(): Promise<void> {
  await maybeInstallMock();
  const audio = new AudioEngine();
  const ambient = new AmbientScene(document.getElementById('ambient-canvas') as HTMLCanvasElement);
  const ui = new UI(audio, ambient);
  initWavedash({ debug: isDebug() });

  window.addEventListener('pointerdown', () => void audio.unlock(), { once: true });
  document.querySelectorAll<HTMLButtonElement>('button:not(:disabled)').forEach((button) => {
    button.addEventListener('pointerenter', () => {
      if (audio.isReady) audio.ui();
    });
  });

  on('menu-play', 'click', () => {
    audio.confirm();
    ui.showScreen('setup');
  });
  on('menu-howto', 'click', () => {
    audio.confirm();
    ui.showOverlay('howto');
  });
  on('setup-back', 'click', () => {
    audio.ui();
    ui.showScreen('menu');
  });
  on('setup-start', 'click', () => ui.startGame({ ...ui.selection }));
  on('howto-close', 'click', () => {
    audio.ui();
    ui.hideOverlay('howto');
  });
  on('howto-confirm', 'click', () => {
    audio.confirm();
    ui.hideOverlay('howto');
    ui.showScreen('setup');
  });
  on('game-menu', 'click', () => ui.pause());
  on('pause-resume', 'click', () => ui.resume());
  on('pause-quit', 'click', () => ui.quitToMenu());
  on('round-next', 'click', () => ui.nextRound());
  on('round-menu', 'click', () => ui.quitToMenu());
  on('result-again', 'click', () => ui.restart());
  on('result-menu', 'click', () => ui.quitToMenu());
  on('system-sound', 'click', () => void ui.toggleSound());
  on('system-fullscreen', 'click', () => void toggleFullscreen());

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (ui.el.overlays.howto.classList.contains('is-open')) ui.hideOverlay('howto');
      else if (ui.el.overlays.pause.classList.contains('is-open')) ui.resume();
      else if (ui.el.screens.game.classList.contains('is-active')) ui.pause();
    } else if (event.key === 'f' || event.key === 'F') {
      void toggleFullscreen();
    } else if (event.key === 'd' || event.key === 'D') {
      toggleDebug();
    } else if (event.key === 'o' || event.key === 'O') {
      toggleOverlay();
    } else if ((event.key === 't' || event.key === 'T') && isDebug()) {
      debugAutoStep(ui);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && ui.el.screens.game.classList.contains('is-active')) ui.pause();
  });

  const api = {
    ui,
    version: GAME_VERSION,
    studio: STUDIO_NAME,
    studioUrl: STUDIO_URL,
    setDebug,
    toggleDebug,
    debugAutoStep: () => debugAutoStep(ui),
    get game() {
      return ui.game;
    },
  };

  Object.assign(window, {
    FOE: api,
    render_game_to_text: () => JSON.stringify(ui.renderGameToText()),
    advanceTime: (milliseconds: number) => ui.game?.advanceTime(milliseconds),
  });
}

void boot();

declare global {
  interface Window {
    FOE: {
      ui: UI;
      version: string;
      studio: string;
      studioUrl: string;
      setDebug: typeof setDebug;
      toggleDebug: typeof toggleDebug;
      debugAutoStep: () => boolean;
      readonly game: UI['game'];
    };
    render_game_to_text: () => string;
    advanceTime: (milliseconds: number) => void;
  }
}
