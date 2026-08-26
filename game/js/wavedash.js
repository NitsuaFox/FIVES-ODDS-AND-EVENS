// Wavedash SDK integration (https://docs.wavedash.com/sdk).
//
// The Wavedash platform (and the local `wavedash dev` sandbox) inject a global
// `window.Wavedash` before our code runs. This module is a thin, defensive
// wrapper around it so that:
//   * On Wavedash: we report load progress, call init() (which reveals the game
//     from behind the loading screen), greet the player, and submit scores to a
//     leaderboard.
//   * Standalone (e.g. served by our plain dev server): every call becomes a
//     no-op so the game keeps working with no SDK present.
//
// Everything is heavily debug-logged so integration issues can be copy-pasted
// back from the browser console.

import { createLogger } from './debug.js';

const log = createLogger('wavedash');

// Leaderboard slug configured for this game in the Wavedash dev portal.
export const LEADERBOARD_ID = 'high-scores';

export function hasSDK() {
  return typeof window !== 'undefined' && !!window.Wavedash;
}

function sdk() {
  return window.Wavedash;
}

// Call once, when the game is ready for the player to interact with it.
// Returns true if the real SDK was initialized.
export function initWavedash({ debug = false } = {}) {
  if (!hasSDK()) {
    log.warn('SDK not present — running standalone; init() skipped');
    return false;
  }
  const WD = sdk();
  try {
    // Our game has no heavy async assets, but we still drive the platform's
    // loading bar from 0 -> 1 so the shell transitions cleanly.
    if (typeof WD.updateLoadProgressZeroToOne === 'function') {
      WD.updateLoadProgressZeroToOne(0);
      WD.updateLoadProgressZeroToOne(1);
    }

    const first = WD.init({ debug });
    log.log('Wavedash.init() called', { firstCall: first, debug });

    try {
      const user = typeof WD.getUser === 'function' ? WD.getUser() : null;
      if (user) log.log('player', { username: user.username, id: user.id });
    } catch (e) {
      log.warn('getUser() failed', e);
    }

    return true;
  } catch (e) {
    log.error('init() failed', e);
    return false;
  }
}

// Submit a score to the leaderboard. No-op when running standalone.
export async function submitScore(score) {
  if (!hasSDK()) {
    log.log('submitScore skipped (standalone)', { score });
    return false;
  }
  const WD = sdk();
  try {
    log.log('fetching leaderboard', LEADERBOARD_ID);
    const board = await WD.getLeaderboard(LEADERBOARD_ID);
    if (!board || !board.success) {
      log.warn('getLeaderboard failed', board && board.message);
      return false;
    }
    const res = await WD.uploadLeaderboardScore(board.data.id, score, true);
    log.log('uploadLeaderboardScore result', {
      score,
      success: !!(res && res.success),
      message: res && res.message,
    });
    return !!(res && res.success);
  } catch (e) {
    log.error('submitScore error', e);
    return false;
  }
}

// Toggle the Wavedash overlay (friends/invites/settings). No-op standalone.
export function toggleOverlay() {
  if (!hasSDK()) {
    log.log('toggleOverlay skipped (standalone)');
    return;
  }
  try {
    if (typeof sdk().toggleOverlay === 'function') sdk().toggleOverlay();
  } catch (e) {
    log.error('toggleOverlay error', e);
  }
}
