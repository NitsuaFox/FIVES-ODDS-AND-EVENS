// CPU move selection.
//
// The board is a memory game: unrevealed numbers are hidden, but every reveal
// briefly "peeks" the neighbouring numbers. The CPU builds a memory map from
// those peeks and (on normal/hard) uses it to chase combos.

import { classify } from './combos.js';
import { createLogger } from './debug.js';

const log = createLogger('ai');

function centerMost(board, moves) {
  const s = board.size;
  const cc = (s - 1) / 2;
  let best = moves[0];
  let bestDist = Infinity;
  for (const m of moves) {
    const r = Math.floor(m / s);
    const c = m % s;
    const d = (r - cc) ** 2 + (c - cc) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

function randomPick(moves) {
  return moves[Math.floor(Math.random() * moves.length)];
}

export function chooseMove({ board, moves, memory, comboState, difficulty, phase }) {
  if (!moves || moves.length === 0) return null;

  // Opening move.
  if (phase === 'START') {
    const pick = difficulty === 'hard' ? centerMost(board, moves) : randomPick(moves);
    log.log('start pick', { pick, difficulty });
    return pick;
  }

  // Easy: pure random.
  if (difficulty === 'easy') {
    const pick = randomPick(moves);
    log.log('easy random pick', pick);
    return pick;
  }

  // Normal / Hard: score each candidate using remembered values.
  const wantEven = comboState.even >= comboState.odd; // extend dominant parity
  let best = null;
  let bestScore = -Infinity;

  for (const m of moves) {
    const remembered = memory.get(m);
    let s = Math.random() * 0.5; // tie-break noise

    if (remembered != null) {
      const { isEven, isFive } = classify(remembered);
      if (isFive) s += 3; // fives are worth the most
      if ((wantEven && isEven) || (!wantEven && !isEven)) s += 1.5; // extends streak
      else s += 0.2; // breaks streak but still a known value
    } else {
      // Unknown cell: hard avoids gambling, normal is more exploratory.
      s += difficulty === 'hard' ? 0.1 : 0.45;
    }

    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }

  log.log('scored pick', { best, bestScore, knownCells: memory.size, wantEven, difficulty });
  return best;
}
