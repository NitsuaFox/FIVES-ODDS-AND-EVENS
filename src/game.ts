import { chooseMove } from './ai.ts';
import { Board } from './board.ts';
import { applyPick, createComboState } from './combos.ts';
import { CPU_MEMORY_LIMIT, MATCH_ROUNDS, PLAYERS, TIMING } from './config.ts';
import { createLogger } from './debug.ts';
import type {
  ComboState,
  Difficulty,
  MatchScorePayload,
  MoveResult,
  Peek,
  Player,
  PlayerRecord,
  RoundScorePayload,
  Winner,
} from './types.ts';

const log = createLogger('game');

export const Phase = {
  START: 'START',
  PLAYING: 'PLAYING',
  ROUND_OVER: 'ROUND_OVER',
  OVER: 'OVER',
} as const;

export type GamePhase = (typeof Phase)[keyof typeof Phase];

interface RoundStartPayload {
  size: number;
  round: number;
  rounds: number;
  starter: Player;
  quota: number;
  neutralIndices: number[];
  matchScore: PlayerRecord<number>;
}

interface TurnPayload {
  player: Player;
  phase: GamePhase;
  round: number;
  rounds: number;
  reentry?: boolean;
  claims?: number;
  quota?: number;
}

interface StartsPayload {
  starts: PlayerRecord<number>;
  moves: PlayerRecord<MoveResult>;
  starter: Player;
}

export interface GameDelegate {
  onRoundStart?: (payload: RoundStartPayload) => void;
  onTurn?: (payload: TurnPayload) => void;
  onStatus?: (status: string) => void;
  onAvailable?: (moves: number[], options: { reentry: boolean }) => void;
  onStartClash?: (payload: { index: number; attempt: number }) => void;
  onStartsRevealed?: (payload: StartsPayload) => void;
  onPeek?: (peeks: Peek[], options: { player: Player; private: true }) => void;
  onUnpeek?: (peeks: Peek[], options: { player: Player; private: true }) => void;
  onMove?: (move: MoveResult) => void;
  onRoundOver?: (payload: RoundScorePayload) => void;
  onGameOver?: (payload: MatchScorePayload) => void;
  onPaused?: (paused: boolean) => void;
}

export interface GameOptions {
  size: number;
  difficulty: Difficulty;
  delegate?: GameDelegate;
  rounds?: number;
  firstStarter?: Player;
}

interface ScheduledTask {
  fn: () => void;
  remaining: number;
  startedAt: number | null;
  id: ReturnType<typeof setTimeout> | null;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const other = (player: Player): Player => (player === PLAYERS.YOU ? PLAYERS.CPU : PLAYERS.YOU);
const byPlayer = <T>(factory: () => T): PlayerRecord<T> => ({
  [PLAYERS.YOU]: factory(),
  [PLAYERS.CPU]: factory(),
});

export class Game {
  readonly size: number;
  readonly difficulty: Difficulty;
  readonly rounds: number;
  readonly firstStarter: Player;
  delegate: GameDelegate;

  board!: Board;
  current: Player = PLAYERS.YOU;
  phase: GamePhase = Phase.START;
  round = 0;
  roundStarter: Player;
  claimQuota = 0;
  owned = byPlayer<number[]>(() => []);
  score = byPlayer(() => 0);
  matchScore = byPlayer(() => 0);
  combo = byPlayer<ComboState>(createComboState);
  memory = byPlayer<Map<number, number>>(() => new Map());
  visiblePeeks = byPlayer<Set<number>>(() => new Set());
  pendingStart = byPlayer<number | null>(() => null);
  startAttempt = 0;
  lastMove: MoveResult | null = null;
  busy = false;
  paused = false;
  destroyed = false;

  private tasks = new Set<ScheduledTask>();
  private advancing = false;

  constructor(options: GameOptions) {
    this.size = options.size;
    this.difficulty = options.difficulty;
    this.delegate = options.delegate ?? {};
    this.rounds = options.rounds ?? MATCH_ROUNDS;
    this.firstStarter = options.firstStarter ?? (Math.random() < 0.5 ? PLAYERS.YOU : PLAYERS.CPU);
    this.roundStarter = this.firstStarter;
  }

  private emit(name: keyof GameDelegate, ...args: unknown[]): void {
    const callback = this.delegate[name] as ((...values: unknown[]) => void) | undefined;
    callback?.(...args);
  }

  private scheduleTask(task: ScheduledTask): void {
    if (this.paused || this.destroyed || this.advancing || task.id !== null) return;
    task.startedAt = now();
    task.id = setTimeout(() => {
      task.id = null;
      this.tasks.delete(task);
      if (!this.destroyed) task.fn();
    }, Math.max(0, task.remaining));
  }

  private timeout(fn: () => void, milliseconds: number): ScheduledTask {
    const task: ScheduledTask = {
      fn,
      remaining: Math.max(0, milliseconds),
      startedAt: null,
      id: null,
    };
    this.tasks.add(task);
    this.scheduleTask(task);
    return task;
  }

  private freezeTasks(): void {
    const frozenAt = now();
    for (const task of this.tasks) {
      if (task.id === null || task.startedAt === null) continue;
      clearTimeout(task.id);
      task.id = null;
      task.remaining = Math.max(0, task.remaining - (frozenAt - task.startedAt));
      task.startedAt = null;
    }
  }

  clearTimers(): void {
    for (const task of this.tasks) if (task.id !== null) clearTimeout(task.id);
    this.tasks.clear();
  }

  pause(): boolean {
    if (this.paused || this.phase === Phase.OVER || this.destroyed) return false;
    this.freezeTasks();
    this.paused = true;
    this.emit('onPaused', true);
    return true;
  }

  resume(): boolean {
    if (!this.paused || this.destroyed) return false;
    this.paused = false;
    for (const task of this.tasks) this.scheduleTask(task);
    this.emit('onPaused', false);
    this.emit('onStatus', this.statusText());
    this.updateAvailable();
    return true;
  }

  advanceTime(milliseconds: number): void {
    if (this.paused || this.destroyed || milliseconds <= 0) return;
    this.freezeTasks();
    this.advancing = true;
    let budget = milliseconds;
    let guard = 0;

    while (this.tasks.size > 0 && budget >= 0 && guard < 1000) {
      guard += 1;
      const soonest = Math.min(...[...this.tasks].map((task) => task.remaining));
      const step = Math.min(soonest, budget);
      for (const task of this.tasks) task.remaining = Math.max(0, task.remaining - step);
      budget -= step;
      if (soonest > step) break;
      const due = [...this.tasks].filter((task) => task.remaining <= 0.001);
      if (due.length === 0) break;
      for (const task of due) {
        this.tasks.delete(task);
        if (!this.destroyed) task.fn();
      }
    }

    this.advancing = false;
    if (!this.paused) for (const task of this.tasks) this.scheduleTask(task);
  }

  destroy(): void {
    this.destroyed = true;
    this.phase = Phase.OVER;
    this.clearTimers();
  }

  start(): void {
    log.group('start match');
    log.log('config', {
      size: this.size,
      difficulty: this.difficulty,
      rounds: this.rounds,
      firstStarter: this.firstStarter,
    });
    this.startRound();
    log.groupEnd();
  }

  private neutralIndices(): number[] {
    return this.size * this.size % 2 === 1 ? [Math.floor((this.size * this.size) / 2)] : [];
  }

  private startRound(): void {
    this.clearTimers();
    this.round += 1;
    this.roundStarter = this.round % 2 === 1 ? this.firstStarter : other(this.firstStarter);
    this.board = new Board(this.size, { neutralIndices: this.neutralIndices() });
    this.claimQuota = this.board.claimableCount() / 2;
    this.current = PLAYERS.YOU;
    this.phase = Phase.START;
    this.owned = byPlayer<number[]>(() => []);
    this.score = byPlayer(() => 0);
    this.combo = byPlayer<ComboState>(createComboState);
    this.memory = byPlayer<Map<number, number>>(() => new Map());
    this.visiblePeeks = byPlayer<Set<number>>(() => new Set());
    this.pendingStart = byPlayer<number | null>(() => null);
    this.startAttempt = 0;
    this.lastMove = null;
    this.busy = false;
    this.paused = false;
    this.commitCpuStart();

    const payload: RoundStartPayload = {
      size: this.size,
      round: this.round,
      rounds: this.rounds,
      starter: this.roundStarter,
      quota: this.claimQuota,
      neutralIndices: [...this.board.neutralIndices],
      matchScore: { ...this.matchScore },
    };
    log.log('round start', payload);
    this.emit('onRoundStart', payload);
    this.emit('onTurn', {
      player: PLAYERS.YOU,
      phase: this.phase,
      round: this.round,
      rounds: this.rounds,
    } satisfies TurnPayload);
    this.emit('onStatus', this.statusText());
    this.updateAvailable();
  }

  nextRound(): boolean {
    if (this.phase !== Phase.ROUND_OVER || this.round >= this.rounds) return false;
    this.startRound();
    return true;
  }

  private commitCpuStart(): void {
    const difficulty = this.startAttempt > 0 ? 'normal' : this.difficulty;
    this.pendingStart[PLAYERS.CPU] = chooseMove({
      board: this.board,
      moves: this.board.unrevealed(),
      memory: new Map(),
      comboState: createComboState(),
      difficulty,
      phase: Phase.START,
    });
  }

  isHumanTurn(): boolean {
    return (
      !this.paused &&
      !this.busy &&
      !this.destroyed &&
      (this.phase === Phase.START || (this.phase === Phase.PLAYING && this.current === PLAYERS.YOU))
    );
  }

  isReentry(player: Player): boolean {
    if (this.phase !== Phase.PLAYING || this.owned[player].length >= this.claimQuota) return false;
    return this.board.adjacentMoves(this.owned[player]).length === 0 && this.board.unrevealed().length > 0;
  }

  validMovesFor(player: Player): number[] {
    if (!this.board || this.phase === Phase.OVER || this.phase === Phase.ROUND_OVER) return [];
    if (this.phase === Phase.START) return player === PLAYERS.YOU ? this.board.unrevealed() : [];
    if (this.owned[player].length >= this.claimQuota) return [];
    const adjacent = this.board.adjacentMoves(this.owned[player]);
    return adjacent.length > 0 ? adjacent : this.board.unrevealed();
  }

  private updateAvailable(): void {
    if (this.isHumanTurn()) {
      this.emit('onAvailable', this.validMovesFor(PLAYERS.YOU), { reentry: this.isReentry(PLAYERS.YOU) });
    } else {
      this.emit('onAvailable', [], { reentry: false });
    }
  }

  humanMove(index: number): boolean {
    if (!this.isHumanTurn() || !this.validMovesFor(PLAYERS.YOU).includes(index)) return false;
    if (this.phase === Phase.START) return this.commitHumanStart(index);
    this.applyMove(PLAYERS.YOU, index);
    return true;
  }

  private commitHumanStart(index: number): boolean {
    this.pendingStart[PLAYERS.YOU] = index;
    if (index === this.pendingStart[PLAYERS.CPU]) {
      this.pendingStart[PLAYERS.YOU] = null;
      this.startAttempt += 1;
      this.commitCpuStart();
      this.emit('onStartClash', { index, attempt: this.startAttempt });
      this.emit('onStatus', 'Signal clash — both sides recommitted. Choose again.');
      this.updateAvailable();
      return true;
    }

    const cpuStart = this.pendingStart[PLAYERS.CPU];
    if (cpuStart === null) return false;
    this.busy = true;
    this.emit('onAvailable', [], { reentry: false });
    const starts: PlayerRecord<number> = {
      [PLAYERS.YOU]: index,
      [PLAYERS.CPU]: cpuStart,
    };
    const humanMove = this.claim(PLAYERS.YOU, starts[PLAYERS.YOU], true);
    const cpuMove = this.claim(PLAYERS.CPU, starts[PLAYERS.CPU], true);
    const humanPeeks = this.privatePeeks(PLAYERS.YOU, starts[PLAYERS.YOU]);
    this.privatePeeks(PLAYERS.CPU, starts[PLAYERS.CPU]);
    this.showPrivatePeeks(PLAYERS.YOU, humanPeeks);
    this.emit('onStartsRevealed', {
      starts,
      moves: { [PLAYERS.YOU]: humanMove, [PLAYERS.CPU]: cpuMove },
      starter: this.roundStarter,
    } satisfies StartsPayload);
    this.emit(
      'onStatus',
      this.roundStarter === PLAYERS.YOU
        ? `You open round ${this.round}. Lock in the glowing numbers.`
        : `CPU opens round ${this.round}. Lock in the glowing numbers.`,
    );

    this.timeout(() => {
      this.hidePrivatePeeks(PLAYERS.YOU, humanPeeks);
      this.phase = Phase.PLAYING;
      this.current = this.roundStarter;
      this.beginTurn();
    }, TIMING.REVEAL_MS);
    return true;
  }

  _remember(player: Player, index: number, value: number): void {
    const memory = this.memory[player];
    if (memory.has(index)) memory.delete(index);
    memory.set(index, value);
    if (player !== PLAYERS.CPU) return;
    const limit = CPU_MEMORY_LIMIT[this.difficulty];
    while (memory.size > limit) {
      const oldest = memory.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      memory.delete(oldest);
    }
  }

  private privatePeeks(player: Player, index: number): Peek[] {
    const peeks = this.board
      .neighbors(index)
      .filter((neighbor) => !this.board.isRevealed(neighbor) && !this.board.isNeutral(neighbor));
    for (const neighbor of peeks) this._remember(player, neighbor, this.board.value(neighbor));
    return peeks.map((neighbor) => ({ index: neighbor, value: this.board.value(neighbor) }));
  }

  private showPrivatePeeks(player: Player, peeks: Peek[]): void {
    this.visiblePeeks[player] = new Set(peeks.map((peek) => peek.index));
    if (player === PLAYERS.YOU) this.emit('onPeek', peeks, { player, private: true });
  }

  private hidePrivatePeeks(player: Player, peeks: Peek[]): void {
    this.visiblePeeks[player].clear();
    if (player === PLAYERS.YOU) this.emit('onUnpeek', peeks, { player, private: true });
  }

  private claim(player: Player, index: number, isStart = false): MoveResult {
    const cell = this.board.reveal(index, player);
    if (!cell) throw new Error(`Cannot claim cell ${index}`);
    this.owned[player].push(index);
    const info = applyPick(this.combo[player], cell.value);
    this.score[player] += info.points;
    const move: MoveResult = {
      player,
      index,
      value: cell.value,
      info,
      points: info.points,
      score: this.score[player],
      combo: { ...this.combo[player] },
      claims: this.owned[player].length,
      quota: this.claimQuota,
      isStart,
    };
    this.lastMove = move;
    this.emit('onMove', move);
    return move;
  }

  private applyMove(player: Player, index: number): void {
    this.busy = true;
    const move = this.claim(player, index);
    const peeks = this.privatePeeks(player, index);
    if (player === PLAYERS.YOU) this.showPrivatePeeks(player, peeks);
    this.emit('onAvailable', [], { reentry: false });
    this.emit('onStatus', this.scoreText(move));
    this.timeout(() => {
      if (player === PLAYERS.YOU) this.hidePrivatePeeks(player, peeks);
      this.finishTurn();
    }, player === PLAYERS.YOU ? TIMING.REVEAL_MS : TIMING.CPU_REVEAL_MS);
  }

  private scoreText(move: MoveResult): string {
    const parity = move.info.isEven ? 'even' : 'odd';
    const five = move.info.isFive ? ` · fives ${move.info.five}` : '';
    return `+${move.points} points · ${parity} chain ${move.info.parityStreak}${five} · ×${move.info.multiplier.toFixed(1)}`;
  }

  private finishTurn(): void {
    if (this.roundComplete()) return this.endRound();
    this.current = other(this.current);
    if (this.owned[this.current].length >= this.claimQuota) this.current = other(this.current);
    this.beginTurn();
  }

  private beginTurn(): void {
    if (this.roundComplete()) return this.endRound();
    this.busy = false;
    const reentry = this.isReentry(this.current);
    this.emit('onTurn', {
      player: this.current,
      phase: this.phase,
      round: this.round,
      rounds: this.rounds,
      reentry,
      claims: this.owned[this.current].length,
      quota: this.claimQuota,
    } satisfies TurnPayload);
    this.emit('onStatus', this.statusText());
    this.updateAvailable();
    if (this.current === PLAYERS.CPU) {
      this.busy = true;
      this.emit('onAvailable', [], { reentry: false });
      this.timeout(() => this.cpuMove(), TIMING.CPU_DELAY_MS);
    }
  }

  private cpuMove(): void {
    if (this.phase !== Phase.PLAYING || this.paused || this.destroyed) return;
    const pick = chooseMove({
      board: this.board,
      moves: this.validMovesFor(PLAYERS.CPU),
      memory: this.memory[PLAYERS.CPU],
      comboState: this.combo[PLAYERS.CPU],
      difficulty: this.difficulty,
      phase: this.phase,
    });
    if (pick === null) return this.endRound();
    this.applyMove(PLAYERS.CPU, pick);
  }

  private roundComplete(): boolean {
    return (
      this.board.isFull() ||
      (this.owned[PLAYERS.YOU].length >= this.claimQuota && this.owned[PLAYERS.CPU].length >= this.claimQuota)
    );
  }

  private endRound(): void {
    this.clearTimers();
    this.busy = true;
    const roundScore = { ...this.score };
    this.matchScore[PLAYERS.YOU] += roundScore[PLAYERS.YOU];
    this.matchScore[PLAYERS.CPU] += roundScore[PLAYERS.CPU];
    const final = this.round >= this.rounds;
    this.phase = final ? Phase.OVER : Phase.ROUND_OVER;
    const payload: RoundScorePayload = {
      round: this.round,
      rounds: this.rounds,
      score: roundScore,
      matchScore: { ...this.matchScore },
      winner: this.winner(roundScore),
      final,
    };
    this.emit('onStatus', final ? 'Match complete' : `Round ${this.round} complete`);
    this.emit('onRoundOver', payload);
    if (final) {
      this.emit('onGameOver', {
        score: { ...this.matchScore },
        winner: this.winner(this.matchScore),
        rounds: this.rounds,
      } satisfies MatchScorePayload);
    }
  }

  private winner(score: PlayerRecord<number>): Winner {
    if (score[PLAYERS.YOU] > score[PLAYERS.CPU]) return PLAYERS.YOU;
    if (score[PLAYERS.CPU] > score[PLAYERS.YOU]) return PLAYERS.CPU;
    return 'TIE';
  }

  private statusText(): string {
    if (this.paused) return 'Paused';
    if (this.phase === Phase.OVER) return 'Match complete';
    if (this.phase === Phase.ROUND_OVER) return `Round ${this.round} complete`;
    if (this.phase === Phase.START) return 'Choose your hidden starting tile';
    if (this.isReentry(this.current)) {
      return this.current === PLAYERS.YOU
        ? 'No frontier — re-enter on any unclaimed tile'
        : 'CPU is re-entering from a new signal';
    }
    return this.current === PLAYERS.YOU
      ? `Your move · claim ${this.owned[PLAYERS.YOU].length + 1} of ${this.claimQuota}`
      : `CPU calculating · claim ${this.owned[PLAYERS.CPU].length + 1} of ${this.claimQuota}`;
  }

  snapshot(viewer: Player = PLAYERS.YOU) {
    const visible = this.visiblePeeks[viewer] ?? new Set<number>();
    return {
      coordinateSystem: 'row-major cells; index 0 is top-left; x increases right; y increases down',
      phase: this.phase,
      round: this.round,
      rounds: this.rounds,
      starter: this.roundStarter,
      current: this.current,
      busy: this.busy,
      paused: this.paused,
      difficulty: this.difficulty,
      quota: this.claimQuota,
      claims: {
        [PLAYERS.YOU]: this.owned[PLAYERS.YOU].length,
        [PLAYERS.CPU]: this.owned[PLAYERS.CPU].length,
      },
      score: { ...this.score },
      matchScore: { ...this.matchScore },
      combo: {
        [PLAYERS.YOU]: { ...this.combo[PLAYERS.YOU] },
        [PLAYERS.CPU]: { ...this.combo[PLAYERS.CPU] },
      },
      reentry: this.phase === Phase.PLAYING ? this.isReentry(this.current) : false,
      available: this.current === viewer && !this.busy && !this.paused ? this.validMovesFor(viewer) : [],
      cells: this.board
        ? this.board.cells.map((cell, index) => ({
            index,
            owner: cell.owner,
            neutral: cell.neutral,
            revealed: cell.revealed,
            value: cell.revealed || visible.has(index) ? cell.value : null,
            peek: visible.has(index),
          }))
        : [],
      lastMove: this.lastMove
        ? {
            player: this.lastMove.player,
            index: this.lastMove.index,
            value: this.lastMove.value,
            points: this.lastMove.points,
            multiplier: this.lastMove.info.multiplier,
          }
        : null,
    };
  }
}
