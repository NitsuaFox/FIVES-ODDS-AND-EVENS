// DEV-ONLY mock of the Wavedash SDK.
//
// The real SDK is injected by the Wavedash platform / `wavedash dev` sandbox and
// is NEVER bundled with the game. This mock only exists so the integration can
// be exercised locally on a plain static server. It is loaded by main.js ONLY
// when the URL contains `?mock=1` AND no real `window.Wavedash` is present.

import { createLogger } from './debug.js';

const log = createLogger('wavedash-mock');

function installMock() {
  if (window.Wavedash) {
    log.warn('real SDK already present — mock not installed');
    return;
  }

  const store = { scores: [] };

  window.Wavedash = {
    initialized: false,
    gameLoaded: false,
    eventsReady: false,

    updateLoadProgressZeroToOne(p) {
      log.log('updateLoadProgressZeroToOne', p);
    },
    loadComplete() {
      this.gameLoaded = true;
      log.log('loadComplete');
    },
    init(config = {}) {
      const first = !this.initialized;
      this.initialized = true;
      this.gameLoaded = true;
      this.eventsReady = true;
      log.log('init', { config, first });
      return first;
    },
    getUser() {
      return { id: 'mock-user', username: 'MockPlayer' };
    },
    async getLeaderboard(slug) {
      log.log('getLeaderboard', slug);
      return { success: true, data: { id: `lb_${slug}`, name: slug } };
    },
    async uploadLeaderboardScore(id, score, force) {
      store.scores.push(score);
      log.log('uploadLeaderboardScore', { id, score, force });
      return { success: true, data: { rank: store.scores.length } };
    },
    toggleOverlay() {
      log.log('toggleOverlay');
    },
  };

  log.log('mock SDK installed on window.Wavedash');
}

installMock();
