// 16:9 stage scaler.
//
// The HUD is authored against a fixed 1920×1080 frame. This module uniformly
// scales that frame to fit the viewport (letterbox / pillarbox) so the layout
// never reflows and the right-hand CPU panel cannot be clipped.
//
// Debug: copy `[FOE:stage]` console lines, or run `FOE.fitStage()` /
// `FOE.logHudLayout()` after a resize.

import { createLogger } from './debug.js';

const log = createLogger('stage');

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;
export const DESIGN_RATIO = DESIGN_WIDTH / DESIGN_HEIGHT; // 16 / 9

function viewportSize() {
  const vv = window.visualViewport;
  return {
    w: vv && vv.width ? vv.width : window.innerWidth,
    h: vv && vv.height ? vv.height : window.innerHeight,
  };
}

function round(n, digits = 2) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function box(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    x: round(r.left, 1),
    y: round(r.top, 1),
    w: round(r.width, 1),
    h: round(r.height, 1),
    right: round(r.right, 1),
    bottom: round(r.bottom, 1),
  };
}

/**
 * Fit #stage into the viewport at a uniform 16:9 scale.
 * Sets `--stage-scale` so CSS can apply `scale(var(--stage-scale))`.
 */
export function fitStage(stage = document.getElementById('stage')) {
  if (!stage) {
    log.warn('fitStage: #stage missing');
    return null;
  }

  const { w: vw, h: vh } = viewportSize();
  const scale = Math.min(vw / DESIGN_WIDTH, vh / DESIGN_HEIGHT);
  const fittedW = DESIGN_WIDTH * scale;
  const fittedH = DESIGN_HEIGHT * scale;
  const letterboxX = vw - fittedW;
  const letterboxY = vh - fittedH;

  stage.style.setProperty('--stage-scale', String(scale));
  document.documentElement.style.setProperty('--stage-scale', String(scale));
  stage.dataset.scale = String(round(scale, 4));
  stage.dataset.design = `${DESIGN_WIDTH}x${DESIGN_HEIGHT}`;

  const info = {
    viewport: { w: round(vw, 1), h: round(vh, 1) },
    design: { w: DESIGN_WIDTH, h: DESIGN_HEIGHT, ratio: '16:9' },
    scale: round(scale, 4),
    fitted: { w: round(fittedW, 1), h: round(fittedH, 1) },
    letterbox: { x: round(letterboxX, 1), y: round(letterboxY, 1) },
    ratioOk: Math.abs(fittedW / fittedH - DESIGN_RATIO) < 0.001,
  };
  log.log('fit 16:9 stage', info);
  return info;
}

/**
 * Report whether You / board / CPU sit fully inside the scaled 16:9 frame.
 * Copy-paste the `[FOE:stage] hud layout` line if a panel looks cropped.
 */
export function logHudLayout() {
  const stage = document.getElementById('stage');
  const you = document.getElementById('panel-you');
  const cpu = document.getElementById('panel-cpu');
  const board = document.getElementById('board');
  const gameScreen = document.getElementById('screen-game');
  if (!stage) {
    log.warn('hud layout: #stage missing');
    return null;
  }

  const s = box(stage);
  const y = box(you);
  const c = box(cpu);
  const b = box(board);
  const eps = 1.5;
  const cpuRightInset = c && s ? round(s.right - c.right, 1) : null;
  const youLeftInset = y && s ? round(y.x - s.x, 1) : null;
  const cpuClipped = c && s ? c.right > s.right + eps || c.x < s.x - eps : null;
  const youClipped = y && s ? y.x < s.x - eps || y.right > s.right + eps : null;

  const info = {
    gameActive: !!(gameScreen && gameScreen.classList.contains('is-active')),
    scale: stage.dataset.scale || null,
    stage: s,
    you: y,
    cpu: c,
    board: b,
    insets: {
      youLeft: youLeftInset,
      cpuRight: cpuRightInset,
      youToBoard: y && b ? round(b.x - y.right, 1) : null,
      boardToCpu: c && b ? round(c.x - b.right, 1) : null,
    },
    clipped: { you: youClipped, cpu: cpuClipped },
  };
  log.log('hud layout', info);
  if (cpuClipped) log.warn('CPU panel clipped by 16:9 stage', { cpuRightInset, cpu: c, stage: s });
  if (youClipped) log.warn('You panel clipped by 16:9 stage', { youLeftInset, you: y, stage: s });
  return info;
}

export function initStage() {
  const stage = document.getElementById('stage');
  if (!stage) {
    log.warn('initStage: #stage missing');
    return;
  }

  const run = () => {
    fitStage(stage);
    const gameScreen = document.getElementById('screen-game');
    if (gameScreen && gameScreen.classList.contains('is-active')) {
      logHudLayout();
    }
  };

  run();
  window.addEventListener('resize', run);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', run);
  }
  log.log('stage scaler listening for resize');
}
