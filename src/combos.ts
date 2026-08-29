import { SCORING } from './config.ts';
import { createLogger } from './debug.ts';
import type { ComboState, ScoreInfo } from './types.ts';

const log = createLogger('combos');

export function createComboState(): ComboState {
  return { odd: 0, even: 0, five: 0, multiplier: 1 };
}

export function classify(value: number): { isEven: boolean; isFive: boolean } {
  return { isEven: value % 2 === 0, isFive: value % 5 === 0 };
}

function scorePick(state: ComboState, value: number, mutate: boolean): { info: ScoreInfo; state: ComboState } {
  const next = mutate ? state : { ...state };
  const { isEven, isFive } = classify(value);

  if (isEven) {
    next.even += 1;
    next.odd = 0;
  } else {
    next.odd += 1;
    next.even = 0;
  }
  next.five = isFive ? next.five + 1 : 0;

  const parityStreak = Math.max(next.even, next.odd);
  const parityBonus = Math.min(parityStreak - 1, SCORING.PARITY_CAP) * SCORING.PARITY_STEP;
  const fiveBonus = Math.min(next.five, SCORING.FIVE_CAP) * SCORING.FIVE_STEP;
  next.multiplier = Number((1 + parityBonus + fiveBonus).toFixed(2));
  const points = Math.round(SCORING.BASE_POINTS * next.multiplier);

  return {
    state: next,
    info: {
      value,
      isEven,
      isFive,
      points,
      multiplier: next.multiplier,
      even: next.even,
      odd: next.odd,
      five: next.five,
      parityStreak,
      parityBonus,
      fiveBonus,
    },
  };
}

export function previewPick(state: ComboState, value: number): ScoreInfo {
  return scorePick(state, value, false).info;
}

export function applyPick(state: ComboState, value: number): ScoreInfo {
  const info = scorePick(state, value, true).info;
  log.log('apply pick', info);
  return info;
}
