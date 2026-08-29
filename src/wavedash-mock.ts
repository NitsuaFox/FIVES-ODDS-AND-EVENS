import type { WavedashSdk } from './wavedash.ts';

const scores: number[] = [];

const mock: WavedashSdk = {
  updateLoadProgressZeroToOne: () => undefined,
  init: () => true,
  getUser: () => ({ id: 'mock-user', username: 'MockPlayer' }),
  getLeaderboard: async (slug) => ({ success: true, data: { id: `lb_${slug}`, name: slug } }),
  uploadLeaderboardScore: async (_id, score) => {
    scores.push(score);
    return { success: true, data: { rank: scores.length } };
  },
  toggleOverlay: () => undefined,
};

if (!window.Wavedash) window.Wavedash = mock;
