export const PLAYERS = {
  YOU: 'YOU',
  CPU: 'CPU',
} as const;

export type Player = (typeof PLAYERS)[keyof typeof PLAYERS];
export type Winner = Player | 'TIE';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type PlayerRecord<T> = Record<Player, T>;

export interface ComboState {
  odd: number;
  even: number;
  five: number;
  multiplier: number;
}

export interface ScoreInfo extends ComboState {
  value: number;
  isEven: boolean;
  isFive: boolean;
  points: number;
  parityStreak: number;
  parityBonus: number;
  fiveBonus: number;
}

export interface MoveResult {
  player: Player;
  index: number;
  value: number;
  info: ScoreInfo;
  points: number;
  score: number;
  combo: ComboState;
  claims: number;
  quota: number;
  isStart: boolean;
}

export interface Peek {
  index: number;
  value: number;
}

export interface RoundScorePayload {
  round: number;
  rounds: number;
  score: PlayerRecord<number>;
  matchScore: PlayerRecord<number>;
  winner: Winner;
  final: boolean;
}

export interface MatchScorePayload {
  score: PlayerRecord<number>;
  winner: Winner;
  rounds: number;
}
