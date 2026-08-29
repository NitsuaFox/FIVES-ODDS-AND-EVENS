import { previewPick } from './combos.ts';
import { createLogger } from './debug.ts';
import type { Board } from './board.ts';
import type { ComboState, Difficulty } from './types.ts';

const log = createLogger('ai');

function centerMost(board: Board, moves: number[]): number {
  const center = (board.size - 1) / 2;
  let best = moves[0] ?? 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const move of moves) {
    const row = Math.floor(move / board.size);
    const column = move % board.size;
    const distance = (row - center) ** 2 + (column - center) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = move;
    }
  }
  return best;
}

function randomPick(moves: number[]): number | null {
  return moves[Math.floor(Math.random() * moves.length)] ?? null;
}

export interface ChooseMoveOptions {
  board: Board;
  moves: number[];
  memory: Map<number, number>;
  comboState: ComboState;
  difficulty: Difficulty;
  phase: string;
}

export function chooseMove(options: ChooseMoveOptions): number | null {
  const { board, moves, memory, comboState, difficulty, phase } = options;
  if (moves.length === 0) return null;

  if (phase === 'START') {
    const pick = difficulty === 'hard' ? centerMost(board, moves) : randomPick(moves);
    log.log('start pick', { pick, difficulty });
    return pick;
  }

  if (difficulty === 'easy') return randomPick(moves);

  let best: number | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const move of moves) {
    const remembered = memory.get(move);
    const frontier = board
      .neighbors(move)
      .filter((index) => !board.isRevealed(index) && !board.isNeutral(index)).length;
    let score = Math.random() * 0.15 + frontier * (difficulty === 'hard' ? 0.08 : 0.04);
    if (remembered !== undefined) {
      score += previewPick(comboState, remembered).points * (difficulty === 'hard' ? 1 : 0.72);
    } else {
      score += difficulty === 'hard' ? 9.5 : 11.5;
    }
    if (score > bestScore) {
      best = move;
      bestScore = score;
    }
  }
  log.log('scored pick', { best, bestScore, knownCells: memory.size, difficulty });
  return best;
}
