// Combo & scoring logic. Pure functions operating on a small combo-state object.

import { SCORING } from './config.js';
import { createLogger } from './debug.js';

const log = createLogger('combo');

export function createComboState() {
  return { even: 0, odd: 0, five: 0, multiplier: 1 };
}

// Classify a value for UI badges / AI hints.
export function classify(value) {
  return {
    isEven: value % 2 === 0,
    isFive: value % 5 === 0,
  };
}

// Apply a newly revealed value to a player's combo state (mutates it) and
// return an info object describing the outcome (points, multiplier, streaks).
export function applyPick(state, value) {
  const { isEven, isFive } = classify(value);

  // Parity streak: same parity extends, opposite parity resets.
  if (isEven) {
    state.even += 1;
    state.odd = 0;
  } else {
    state.odd += 1;
    state.even = 0;
  }

  // Fives streak: independent; any non-multiple-of-5 resets it.
  if (isFive) {
    state.five += 1;
  } else {
    state.five = 0;
  }

  const parityStreak = Math.max(state.even, state.odd);
  const parityBonus = Math.min(parityStreak - 1, SCORING.PARITY_CAP) * SCORING.PARITY_STEP;
  const fiveBonus = Math.min(state.five, SCORING.FIVE_CAP) * SCORING.FIVE_STEP;

  state.multiplier = Number((1 + parityBonus + fiveBonus).toFixed(2));
  const points = Math.round(SCORING.BASE_POINTS * state.multiplier);

  const info = {
    value,
    isEven,
    isFive,
    points,
    multiplier: state.multiplier,
    even: state.even,
    odd: state.odd,
    five: state.five,
    parityStreak,
  };
  log.log('applyPick', info);
  return info;
}

// Build short badge descriptors for a pick, for the history strip.
export function badgesForInfo(info) {
  const badges = [];
  if (info.isFive) badges.push({ type: 'five', text: `×5 ${info.five}` });
  if (info.isEven) badges.push({ type: 'even', text: `E ${info.even}` });
  else badges.push({ type: 'odd', text: `O ${info.odd}` });
  return badges;
}
