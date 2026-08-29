import { PLAYERS } from '../src/config.ts';
import { Game, Phase } from '../src/game.ts';
import type { Difficulty, Player, PlayerRecord } from '../src/types.ts';

function mulberry32(seed: number): () => number {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

Math.random = mulberry32(0xf0e2026);

function playMatch(options: { size: number; difficulty: Difficulty; firstStarter: Player }): PlayerRecord<number> {
  const game = new Game({ ...options, rounds: 3 });
  game.start();
  let guard = 0;
  while (game.phase !== Phase.OVER && guard < 10_000) {
    guard += 1;
    if (game.phase === Phase.START && game.isHumanTurn()) {
      const move = game.validMovesFor(PLAYERS.YOU).find((index) => index !== game.pendingStart[PLAYERS.CPU]);
      if (move !== undefined) game.humanMove(move);
    } else if (game.phase === Phase.PLAYING && game.isHumanTurn()) {
      const moves = game.validMovesFor(PLAYERS.YOU);
      const move = moves[Math.floor(Math.random() * moves.length)];
      if (move !== undefined) game.humanMove(move);
    } else if (game.phase === Phase.ROUND_OVER) {
      game.nextRound();
    }
    game.advanceTime(30_000);
  }
  return game.matchScore;
}

for (const size of [5, 8, 10]) {
  const results = { you: 0, cpu: 0, ties: 0, startsYou: 0, startsCpu: 0, openerWins: 0, nonOpenerWins: 0 };
  const matches = 5000;
  for (let index = 0; index < matches; index += 1) {
    const firstStarter = index % 2 ? PLAYERS.YOU : PLAYERS.CPU;
    const score = playMatch({ size, difficulty: 'easy', firstStarter });
    if (firstStarter === PLAYERS.YOU) results.startsYou += 1;
    else results.startsCpu += 1;
    const winner =
      score[PLAYERS.YOU] > score[PLAYERS.CPU]
        ? PLAYERS.YOU
        : score[PLAYERS.CPU] > score[PLAYERS.YOU]
          ? PLAYERS.CPU
          : 'TIE';
    if (winner === PLAYERS.YOU) results.you += 1;
    else if (winner === PLAYERS.CPU) results.cpu += 1;
    else results.ties += 1;
    if (winner === firstStarter) results.openerWins += 1;
    else if (winner !== 'TIE') results.nonOpenerWins += 1;
  }
  console.log(
    JSON.stringify({
      size,
      matches,
      firstStarterSplit: [results.startsYou, results.startsCpu],
      youWinPct: Number(((results.you / matches) * 100).toFixed(1)),
      cpuWinPct: Number(((results.cpu / matches) * 100).toFixed(1)),
      tiePct: Number(((results.ties / matches) * 100).toFixed(1)),
      openerWinPct: Number(((results.openerWins / matches) * 100).toFixed(1)),
      nonOpenerWinPct: Number(((results.nonOpenerWins / matches) * 100).toFixed(1)),
    }),
  );
}
