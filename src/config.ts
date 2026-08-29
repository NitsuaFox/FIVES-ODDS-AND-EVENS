import { PLAYERS, type Difficulty } from './types.ts';

export { PLAYERS };

export const GAME_VERSION = '0.3.0';
export const STUDIO_NAME = 'w2d.games';
export const STUDIO_URL = 'https://w2d.games';

export const PLAYER_LABELS = {
  [PLAYERS.YOU]: 'You',
  [PLAYERS.CPU]: 'CPU',
} as const;

export interface BoardOption {
  id: 5 | 8 | 10;
  label: string;
  sub: string;
  meta: string;
}

export const BOARD_SIZES: readonly BoardOption[] = [
  { id: 5, label: 'Quick', sub: '5 × 5', meta: '12 claims each' },
  { id: 8, label: 'Classic', sub: '8 × 8', meta: '32 claims each' },
  { id: 10, label: 'Grand', sub: '10 × 10', meta: '50 claims each' },
];

export interface DifficultyOption {
  id: Difficulty;
  label: string;
  sub: string;
  meta: string;
}

export const DIFFICULTIES: readonly DifficultyOption[] = [
  { id: 'easy', label: 'Chill', sub: 'Easy', meta: 'Random · no memory' },
  { id: 'normal', label: 'Sharp', sub: 'Normal', meta: 'Remembers 12 peeks' },
  { id: 'hard', label: 'Ruthless', sub: 'Hard', meta: 'Perfect combo memory' },
];

export const MATCH_ROUNDS = 3;

export const TIMING = {
  REVEAL_MS: 1600,
  CPU_REVEAL_MS: 850,
  CPU_DELAY_MS: 650,
} as const;

export const SCORING = {
  BASE_POINTS: 10,
  PARITY_STEP: 0.1,
  PARITY_CAP: 10,
  FIVE_STEP: 0.3,
  FIVE_CAP: 3,
} as const;

export const METER_MAX = {
  parity: SCORING.PARITY_CAP + 1,
  five: SCORING.FIVE_CAP,
} as const;

export const MAX_MULTIPLIER =
  1 + SCORING.PARITY_CAP * SCORING.PARITY_STEP + SCORING.FIVE_CAP * SCORING.FIVE_STEP;

export const CPU_MEMORY_LIMIT: Record<Difficulty, number> = {
  easy: 0,
  normal: 12,
  hard: Number.POSITIVE_INFINITY,
};

export const HISTORY_LIMIT = 10;
