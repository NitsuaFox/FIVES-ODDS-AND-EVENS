import assert from 'node:assert/strict';
import test from 'node:test';

import { Board } from '../src/board.ts';
import { applyPick, createComboState, previewPick } from '../src/combos.ts';
import { CPU_MEMORY_LIMIT, PLAYERS } from '../src/config.ts';
import { Game, Phase } from '../src/game.ts';

function chooseNonCollisionStart(game: Game): number {
  const move = game.validMovesFor(PLAYERS.YOU).find((index) => index !== game.pendingStart[PLAYERS.CPU]);
  assert.notEqual(move, undefined);
  return move as number;
}

function finishRound(game: Game): void {
  let guard = 0;
  while (![Phase.ROUND_OVER, Phase.OVER].includes(game.phase as typeof Phase.ROUND_OVER | typeof Phase.OVER) && guard < 1000) {
    guard += 1;
    if (game.phase === Phase.START && game.isHumanTurn()) {
      game.humanMove(chooseNonCollisionStart(game));
    } else if (game.phase === Phase.PLAYING && game.isHumanTurn()) {
      const move = game.validMovesFor(PLAYERS.YOU)[0];
      assert.notEqual(move, undefined, 'human should always receive a valid claim or re-entry');
      game.humanMove(move as number);
    }
    game.advanceTime(20_000);
  }
  assert.ok(guard < 1000, 'round should finish');
}

test('5x5 uses one neutral centre and gives each side exactly 12 claims', () => {
  const game = new Game({ size: 5, difficulty: 'easy', rounds: 1, firstStarter: PLAYERS.YOU });
  game.start();
  assert.equal(game.claimQuota, 12);
  assert.deepEqual([...game.board.neutralIndices], [12]);
  finishRound(game);
  assert.equal(game.owned[PLAYERS.YOU].length, 12);
  assert.equal(game.owned[PLAYERS.CPU].length, 12);
  assert.equal(game.board.owner(12), null);
});

test('8x8 complete round gives both sides exactly 32 claims', () => {
  const game = new Game({ size: 8, difficulty: 'normal', rounds: 1, firstStarter: PLAYERS.CPU });
  game.start();
  finishRound(game);
  assert.equal(game.owned[PLAYERS.YOU].length, 32);
  assert.equal(game.owned[PLAYERS.CPU].length, 32);
});

test('hidden starts reveal together and only the human private peek is serialized', () => {
  const game = new Game({ size: 5, difficulty: 'hard', rounds: 1, firstStarter: PLAYERS.YOU });
  game.start();
  game.humanMove(chooseNonCollisionStart(game));
  const snapshot = game.snapshot(PLAYERS.YOU);
  assert.equal(snapshot.claims[PLAYERS.YOU], 1);
  assert.equal(snapshot.claims[PLAYERS.CPU], 1);
  assert.ok(snapshot.cells.some((cell) => cell.peek && cell.value !== null));
  for (const cell of snapshot.cells) if (!cell.revealed && !cell.peek) assert.equal(cell.value, null);
  const cpuOnlyMemories = [...game.memory[PLAYERS.CPU].keys()].filter(
    (index) => !game.memory[PLAYERS.YOU].has(index) && !game.board.isRevealed(index),
  );
  assert.ok(cpuOnlyMemories.length > 0);
  for (const index of cpuOnlyMemories) assert.equal(snapshot.cells[index]?.value, null);
});

test('pause freezes pending reveal and CPU timers', () => {
  const game = new Game({ size: 5, difficulty: 'easy', rounds: 1, firstStarter: PLAYERS.CPU });
  game.start();
  game.humanMove(chooseNonCollisionStart(game));
  const before = game.snapshot();
  assert.equal(game.pause(), true);
  game.advanceTime(60_000);
  const during = game.snapshot();
  assert.equal(during.phase, before.phase);
  assert.deepEqual(during.claims, before.claims);
  assert.equal(game.resume(), true);
  game.advanceTime(20_000);
  assert.equal(game.phase, Phase.PLAYING);
  assert.ok(game.owned[PLAYERS.CPU].length >= 2);
});

test('boxed-in players receive unrestricted re-entry instead of losing a turn', () => {
  const game = new Game({ size: 5, difficulty: 'easy', rounds: 1, firstStarter: PLAYERS.YOU });
  game.start();
  game.phase = Phase.PLAYING;
  game.current = PLAYERS.YOU;
  game.board = new Board(5, { neutralIndices: [12] });
  game.claimQuota = 12;
  game.owned = { [PLAYERS.YOU]: [0], [PLAYERS.CPU]: [] };
  game.board.reveal(0, PLAYERS.YOU);
  for (const index of game.board.neighbors(0)) {
    game.board.reveal(index, PLAYERS.CPU);
    game.owned[PLAYERS.CPU].push(index);
  }
  assert.equal(game.board.adjacentMoves(game.owned[PLAYERS.YOU]).length, 0);
  assert.equal(game.isReentry(PLAYERS.YOU), true);
  assert.deepEqual(game.validMovesFor(PLAYERS.YOU), game.board.unrevealed());
});

test('three-round matches alternate the opener and preserve match totals', () => {
  const game = new Game({ size: 5, difficulty: 'easy', rounds: 3, firstStarter: PLAYERS.YOU });
  const starters: string[] = [];
  game.delegate.onRoundStart = ({ starter }) => starters.push(starter);
  game.start();
  for (let round = 1; round <= 3; round += 1) {
    finishRound(game);
    if (round < 3) assert.equal(game.nextRound(), true);
  }
  assert.deepEqual(starters, [PLAYERS.YOU, PLAYERS.CPU, PLAYERS.YOU]);
  assert.equal(game.phase, Phase.OVER);
  assert.ok(game.matchScore[PLAYERS.YOU] > 0);
  assert.ok(game.matchScore[PLAYERS.CPU] > 0);
});

test('rebalanced scoring makes fives valuable without overpowering parity', () => {
  const state = createComboState();
  assert.equal(previewPick(state, 5).points, 13);
  assert.equal(applyPick(state, 5).points, 13);
  assert.equal(applyPick(state, 15).points, 17);
  assert.equal(applyPick(state, 7).points, 12);
});

test('normal CPU memory is bounded while hard CPU memory is perfect', () => {
  const normal = new Game({ size: 8, difficulty: 'normal', rounds: 1 });
  normal.start();
  for (let index = 0; index < 30; index += 1) normal._remember(PLAYERS.CPU, index, index + 1);
  assert.equal(normal.memory[PLAYERS.CPU].size, CPU_MEMORY_LIMIT.normal);

  const hard = new Game({ size: 8, difficulty: 'hard', rounds: 1 });
  hard.start();
  for (let index = 0; index < 30; index += 1) hard._remember(PLAYERS.CPU, index, index + 1);
  assert.equal(hard.memory[PLAYERS.CPU].size, 30);
});

test('claimed squares do not consume the normal CPU private-peek allowance', () => {
  const game = new Game({ size: 8, difficulty: 'normal', rounds: 1, firstStarter: PLAYERS.YOU });
  game.start();
  game.humanMove(chooseNonCollisionStart(game));
  game.advanceTime(20_000);
  for (const index of game.owned[PLAYERS.CPU]) assert.equal(game.memory[PLAYERS.CPU].has(index), false);
});
