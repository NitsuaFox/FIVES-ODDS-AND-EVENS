// Game controller / state machine. Emits events to a delegate; no DOM here.

import { Board } from './board.js';
import { createComboState, applyPick } from './combos.js';
import { chooseMove } from './ai.js';
import { TIMING, PLAYERS } from './config.js';
import { createLogger } from './debug.js';

const log = createLogger('game');

export const Phase = { START: 'START', PLAYING: 'PLAYING', OVER: 'OVER' };

const other = (p) => (p === PLAYERS.YOU ? PLAYERS.CPU : PLAYERS.YOU);

export class Game {
  constructor({ size, difficulty, delegate }) {
    this.size = size;
    this.difficulty = difficulty;
    this.delegate = delegate || {};

    this.board = new Board(size);
    this.current = PLAYERS.YOU;
    this.phase = Phase.START;
    this.owned = { [PLAYERS.YOU]: [], [PLAYERS.CPU]: [] };
    this.score = { [PLAYERS.YOU]: 0, [PLAYERS.CPU]: 0 };
    this.combo = { [PLAYERS.YOU]: createComboState(), [PLAYERS.CPU]: createComboState() };
    this.memory = new Map(); // index -> value, shared "seen" knowledge for the CPU
    this.busy = false;
    this._timers = [];
  }

  _emit(name, ...args) {
    const fn = this.delegate[name];
    if (typeof fn === 'function') fn(...args);
  }

  _timeout(fn, ms) {
    const id = setTimeout(fn, ms);
    this._timers.push(id);
    return id;
  }

  clearTimers() {
    this._timers.forEach(clearTimeout);
    this._timers = [];
  }

  destroy() {
    this.phase = Phase.OVER;
    this.clearTimers();
    log.log('game destroyed');
  }

  start() {
    log.group('start');
    log.log('config', { size: this.size, difficulty: this.difficulty });
    this._emit('onStart', { size: this.size });
    this._emit('onTurn', { player: this.current, phase: this.phase });
    this._emit('onStatus', this._statusText());
    this._updateAvailable();
    log.groupEnd();
  }

  isHumanTurn() {
    return this.current === PLAYERS.YOU && !this.busy && this.phase !== Phase.OVER;
  }

  validMovesFor(player) {
    if (this.phase === Phase.START) return this.board.unrevealed();
    return this.board.adjacentMoves(this.owned[player]);
  }

  _updateAvailable() {
    if (this.current === PLAYERS.YOU && this.phase !== Phase.OVER && !this.busy) {
      this._emit('onAvailable', this.validMovesFor(PLAYERS.YOU));
    } else {
      this._emit('onAvailable', []);
    }
  }

  _isValid(player, index) {
    if (this.board.isRevealed(index)) return false;
    if (this.phase === Phase.START) return true;
    return this.board.adjacentMoves(this.owned[player]).includes(index);
  }

  humanMove(index) {
    if (!this.isHumanTurn()) {
      log.warn('ignored click (not your turn / busy)', index);
      return false;
    }
    if (!this._isValid(PLAYERS.YOU, index)) {
      log.warn('invalid move', index);
      return false;
    }
    this._applyMove(index);
    return true;
  }

  _applyMove(index) {
    this.busy = true;
    const player = this.current;
    const cell = this.board.reveal(index, player);
    this.owned[player].push(index);
    this.memory.set(index, cell.value);

    const info = applyPick(this.combo[player], cell.value);
    this.score[player] += info.points;

    log.log('move', {
      player,
      index,
      value: cell.value,
      points: info.points,
      total: this.score[player],
    });

    this._emit('onMove', {
      player,
      index,
      value: cell.value,
      info,
      score: this.score[player],
      combo: { ...this.combo[player] },
    });

    // Peek unrevealed neighbours; record them in shared memory for the CPU.
    const peeks = this.board.neighbors(index).filter((n) => !this.board.isRevealed(n));
    for (const n of peeks) this.memory.set(n, this.board.value(n));
    this._emit(
      'onPeek',
      peeks.map((n) => ({ index: n, value: this.board.value(n) }))
    );
    this._emit('onAvailable', []); // lock input during the peek window

    this._timeout(() => {
      this._emit('onUnpeek', peeks);
      this._afterMove();
    }, TIMING.REVEAL_MS);
  }

  _afterMove() {
    this.current = other(this.current);

    if (
      this.phase === Phase.START &&
      this.owned[PLAYERS.YOU].length >= 1 &&
      this.owned[PLAYERS.CPU].length >= 1
    ) {
      this.phase = Phase.PLAYING;
      log.log('phase -> PLAYING');
    }

    if (this._checkEnd()) return;

    // Skip current player if they have no valid moves (PLAYING only).
    if (this.phase === Phase.PLAYING && this.validMovesFor(this.current).length === 0) {
      const opp = other(this.current);
      if (this.validMovesFor(opp).length === 0) {
        this._end();
        return;
      }
      log.log('skipping player with no moves', this.current);
      this.current = opp;
    }

    this.busy = false;
    this._emit('onTurn', { player: this.current, phase: this.phase });
    this._emit('onStatus', this._statusText());
    this._updateAvailable();

    if (this.current === PLAYERS.CPU && this.phase !== Phase.OVER) {
      this.busy = true;
      this._emit('onAvailable', []);
      this._timeout(() => this._cpuMove(), TIMING.CPU_DELAY_MS);
    }
  }

  _cpuMove() {
    if (this.phase === Phase.OVER) return;
    const moves = this.validMovesFor(PLAYERS.CPU);
    const pick = chooseMove({
      board: this.board,
      moves,
      memory: this.memory,
      comboState: this.combo[PLAYERS.CPU],
      difficulty: this.difficulty,
      phase: this.phase,
    });
    if (pick == null) {
      log.warn('cpu has no move');
      this.busy = false;
      this._afterMove();
      return;
    }
    this._applyMove(pick);
  }

  _checkEnd() {
    if (this.board.isFull()) {
      this._end();
      return true;
    }
    if (
      this.phase === Phase.PLAYING &&
      this.validMovesFor(PLAYERS.YOU).length === 0 &&
      this.validMovesFor(PLAYERS.CPU).length === 0
    ) {
      this._end();
      return true;
    }
    return false;
  }

  _end() {
    this.phase = Phase.OVER;
    this.busy = true;
    this.clearTimers();
    const you = this.score[PLAYERS.YOU];
    const cpu = this.score[PLAYERS.CPU];
    const winner = you > cpu ? PLAYERS.YOU : cpu > you ? PLAYERS.CPU : 'TIE';
    log.log('game over', { score: { you, cpu }, winner });
    this._emit('onStatus', 'Game over');
    this._emit('onGameOver', { score: { YOU: you, CPU: cpu }, winner });
  }

  _statusText() {
    if (this.phase === Phase.OVER) return 'Game over';
    if (this.phase === Phase.START) {
      return this.current === PLAYERS.YOU
        ? 'Pick any cell to claim your starting square'
        : 'CPU is choosing its start…';
    }
    return this.current === PLAYERS.YOU
      ? 'Your turn — reveal a glowing neighbour'
      : 'CPU is thinking…';
  }
}
