import { AmbientScene } from './ambient.ts';
import { AudioEngine } from './audio.ts';
import {
  BOARD_SIZES,
  DIFFICULTIES,
  GAME_VERSION,
  HISTORY_LIMIT,
  METER_MAX,
  PLAYERS,
  STUDIO_NAME,
  STUDIO_URL,
} from './config.ts';
import { Game, Phase, type GamePhase } from './game.ts';
import { submitScore } from './wavedash.ts';
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

type ScreenName = 'menu' | 'setup' | 'game';
type OverlayName = 'howto' | 'pause' | 'roundover' | 'gameover';
type BoardSize = 5 | 8 | 10;

interface GameSelection {
  size: BoardSize;
  difficulty: Difficulty;
}

function required<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required element #${id}`);
  return node as T;
}

export class UI {
  game: Game | null = null;
  readonly audio: AudioEngine;
  readonly ambient: AmbientScene;
  selection: GameSelection = { size: 8, difficulty: 'normal' };
  cellElements: HTMLButtonElement[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  readonly el = {
    stage: required<HTMLElement>('stage'),
    screens: {
      menu: required<HTMLElement>('screen-menu'),
      setup: required<HTMLElement>('screen-setup'),
      game: required<HTMLElement>('screen-game'),
    },
    overlays: {
      howto: required<HTMLElement>('overlay-howto'),
      pause: required<HTMLElement>('overlay-pause'),
      roundover: required<HTMLElement>('overlay-roundover'),
      gameover: required<HTMLElement>('overlay-gameover'),
    },
    board: required<HTMLElement>('board'),
    turn: required<HTMLElement>('turn-indicator'),
    phase: required<HTMLElement>('phase-indicator'),
    status: required<HTMLElement>('statusbar'),
    roundPips: required<HTMLElement>('round-pips'),
    panelYou: required<HTMLElement>('panel-you'),
    panelCpu: required<HTMLElement>('panel-cpu'),
    scoreYou: required<HTMLElement>('score-you'),
    scoreCpu: required<HTMLElement>('score-cpu'),
    matchYou: required<HTMLElement>('match-you'),
    matchCpu: required<HTMLElement>('match-cpu'),
    claimsYou: required<HTMLElement>('claims-you'),
    claimsCpu: required<HTMLElement>('claims-cpu'),
    multYou: required<HTMLElement>('mult-you'),
    multCpu: required<HTMLElement>('mult-cpu'),
    metersYou: required<HTMLElement>('meters-you'),
    metersCpu: required<HTMLElement>('meters-cpu'),
    historyYou: required<HTMLElement>('history-you'),
    historyCpu: required<HTMLElement>('history-cpu'),
    roundTitle: required<HTMLElement>('round-title'),
    roundSummary: required<HTMLElement>('round-summary'),
    roundYou: required<HTMLElement>('round-you'),
    roundCpu: required<HTMLElement>('round-cpu'),
    roundTotal: required<HTMLElement>('round-total'),
    resultTitle: required<HTMLElement>('result-title'),
    resultYou: required<HTMLElement>('result-you'),
    resultCpu: required<HTMLElement>('result-cpu'),
    resultEmblem: required<HTMLElement>('result-emblem'),
    soundButton: required<HTMLButtonElement>('system-sound'),
    toast: required<HTMLElement>('toast'),
  };

  constructor(audio = new AudioEngine(), ambient = new AmbientScene(required<HTMLCanvasElement>('ambient-canvas'))) {
    this.audio = audio;
    this.ambient = ambient;
    this.buildSetupOptions();
    this.renderIdentity();
    this.updateSoundButton();
  }

  private renderIdentity(): void {
    required<HTMLElement>('menu-version').textContent = GAME_VERSION;
    const studio = required<HTMLAnchorElement>('menu-studio');
    studio.textContent = STUDIO_NAME;
    studio.href = STUDIO_URL;
  }

  private buildSetupOptions(): void {
    const sizeRoot = required<HTMLElement>('size-options');
    const difficultyRoot = required<HTMLElement>('difficulty-options');
    const build = (
      root: HTMLElement,
      options: readonly { id: string | number; label: string; sub: string; meta: string }[],
      group: keyof GameSelection,
    ): void => {
      root.replaceChildren();
      for (const option of options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'option';
        button.dataset.value = String(option.id);
        button.innerHTML =
          `<span class="option__eyebrow">${option.sub}</span>` +
          `<span class="option__label">${option.label}</span>` +
          `<span class="option__meta">${option.meta}</span>`;
        const current = String(this.selection[group]);
        button.classList.toggle('is-selected', current === String(option.id));
        button.setAttribute('aria-pressed', String(current === String(option.id)));
        button.addEventListener('click', () => {
          void this.audio.unlock();
          this.audio.ui();
          if (group === 'size') this.selection.size = Number(option.id) as BoardSize;
          else this.selection.difficulty = String(option.id) as Difficulty;
          root.querySelectorAll<HTMLButtonElement>('.option').forEach((candidate) => {
            const selected = candidate === button;
            candidate.classList.toggle('is-selected', selected);
            candidate.setAttribute('aria-pressed', String(selected));
          });
        });
        root.append(button);
      }
    };
    build(sizeRoot, BOARD_SIZES, 'size');
    build(difficultyRoot, DIFFICULTIES, 'difficulty');
  }

  showScreen(name: ScreenName): void {
    Object.entries(this.el.screens).forEach(([key, node]) => node.classList.toggle('is-active', key === name));
    this.ambient.setMode(name === 'game' ? 'game' : 'menu');
  }

  showOverlay(name: OverlayName): void {
    this.el.overlays[name].classList.add('is-open');
  }

  hideOverlay(name: OverlayName): void {
    this.el.overlays[name].classList.remove('is-open');
  }

  hideAllOverlays(): void {
    (Object.keys(this.el.overlays) as OverlayName[]).forEach((name) => this.hideOverlay(name));
  }

  toast(message: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.el.toast.textContent = message;
    this.el.toast.classList.add('is-visible');
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('is-visible'), 1800);
  }

  startGame(selection: GameSelection = this.selection): void {
    void this.audio.unlock();
    this.audio.confirm();
    this.selection = { ...selection };
    this.game?.destroy();
    this.game = new Game({
      size: selection.size,
      difficulty: selection.difficulty,
      delegate: {
        onRoundStart: (payload) => this.onRoundStart(payload),
        onTurn: (payload) => this.setTurn(payload),
        onStatus: (status) => {
          this.el.status.textContent = status;
        },
        onAvailable: (moves, options) => this.setAvailable(moves, options.reentry),
        onStartClash: ({ index }) => this.onStartClash(index),
        onStartsRevealed: ({ starter }) => this.onStartsRevealed(starter),
        onPeek: (peeks) => this.onPeek(peeks),
        onUnpeek: (peeks) => this.onUnpeek(peeks),
        onMove: (move) => this.onMove(move),
        onRoundOver: (payload) => this.onRoundOver(payload),
        onGameOver: (payload) => this.onGameOver(payload),
        onPaused: (paused) => this.el.stage.classList.toggle('is-paused', paused),
      },
    });
    this.hideAllOverlays();
    this.showScreen('game');
    this.game.start();
  }

  restart(): void {
    this.hideOverlay('gameover');
    this.startGame({ ...this.selection });
  }

  nextRound(): void {
    this.audio.confirm();
    this.hideOverlay('roundover');
    this.game?.nextRound();
  }

  quitToMenu(): void {
    this.audio.confirm();
    this.game?.destroy();
    this.game = null;
    this.cellElements = [];
    this.el.board.replaceChildren();
    this.el.stage.classList.remove('is-paused');
    this.hideAllOverlays();
    this.showScreen('menu');
  }

  private onRoundStart(payload: {
    size: number;
    round: number;
    rounds: number;
    quota: number;
    neutralIndices: number[];
    matchScore: PlayerRecord<number>;
  }): void {
    this.hideAllOverlays();
    this.buildBoard(payload.size, payload.neutralIndices);
    this.resetPanels(payload.quota);
    this.setMatchScores(payload.matchScore);
    this.setRoundPips(payload.round, payload.rounds);
    if (payload.round > 1) this.audio.confirm();
    this.ambient.pulse('NEUTRAL');
  }

  private buildBoard(size: number, neutralIndices: number[]): void {
    const neutral = new Set(neutralIndices);
    this.el.board.replaceChildren();
    this.el.board.style.setProperty('--n', String(size));
    this.el.board.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;
    this.el.board.style.gridTemplateRows = `repeat(${size}, minmax(0, 1fr))`;
    this.cellElements = [];
    for (let index = 0; index < size * size; index += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.index = String(index);
      cell.setAttribute('role', 'gridcell');
      if (neutral.has(index)) {
        cell.disabled = true;
        cell.classList.add('is-neutral');
        cell.textContent = '◇';
        cell.setAttribute('aria-label', `Cell ${index + 1}, neutral`);
      } else {
        cell.setAttribute('aria-label', `Cell ${index + 1}`);
      }
      cell.addEventListener('click', () => {
        void this.audio.unlock();
        if (!this.game?.humanMove(index)) this.audio.invalid();
      });
      this.cellElements.push(cell);
      this.el.board.append(cell);
    }
  }

  private onMove(move: MoveResult): void {
    const cell = this.cellElements[move.index];
    if (!cell) return;
    cell.textContent = String(move.value);
    cell.classList.remove('is-available', 'is-reentry', 'is-peek');
    cell.classList.add('is-owned', move.player === PLAYERS.YOU ? 'is-you' : 'is-cpu', 'pop');
    cell.classList.toggle('is-five', move.info.isFive);
    cell.classList.toggle('is-start', move.isStart);
    cell.setAttribute('aria-label', `Cell ${move.index + 1}, ${move.player === PLAYERS.YOU ? 'You' : 'CPU'}, ${move.value}`);
    window.setTimeout(() => cell.classList.remove('pop'), 340);
    this.setScore(move.player, move.score);
    this.setMult(move.player, move.info.multiplier);
    this.setMeters(move.player, move.combo);
    this.setClaims(move.player, move.claims, move.quota);
    this.addHistory(move);
    this.audio.move(move);

    const rectangle = cell.getBoundingClientRect();
    const x = (rectangle.left + rectangle.width / 2) / window.innerWidth;
    const y = (rectangle.top + rectangle.height / 2) / window.innerHeight;
    this.ambient.pulse(move.info.isFive ? 'FIVE' : move.player, x, y);
  }

  private onPeek(peeks: Peek[]): void {
    for (const peek of peeks) {
      const cell = this.cellElements[peek.index];
      if (!cell || cell.classList.contains('is-owned') || cell.classList.contains('is-neutral')) continue;
      cell.textContent = String(peek.value);
      cell.classList.add('is-peek');
      cell.classList.toggle('is-five', peek.value % 5 === 0);
      cell.setAttribute('aria-label', `Cell ${peek.index + 1}, private peek ${peek.value}`);
    }
    this.audio.peek(peeks.length);
  }

  private onUnpeek(peeks: Peek[]): void {
    for (const peek of peeks) {
      const cell = this.cellElements[peek.index];
      if (!cell || cell.classList.contains('is-owned') || cell.classList.contains('is-neutral')) continue;
      cell.textContent = '';
      cell.classList.remove('is-peek', 'is-five');
      cell.setAttribute('aria-label', `Cell ${peek.index + 1}`);
    }
  }

  private setAvailable(moves: number[], reentry: boolean): void {
    this.cellElements.forEach((cell) => cell.classList.remove('is-available', 'is-reentry'));
    for (const index of moves) {
      const cell = this.cellElements[index];
      if (!cell) continue;
      cell.classList.add('is-available');
      cell.classList.toggle('is-reentry', reentry);
    }
  }

  private onStartClash(index: number): void {
    const cell = this.cellElements[index];
    cell?.classList.add('shake');
    window.setTimeout(() => cell?.classList.remove('shake'), 350);
    this.audio.clash();
    this.ambient.pulse('FIVE');
  }

  private onStartsRevealed(starter: Player): void {
    const label = this.el.turn.querySelector('b');
    if (label) label.textContent = starter === PLAYERS.YOU ? 'You open' : 'CPU opens';
  }

  private resetPanels(quota: number): void {
    for (const player of [PLAYERS.YOU, PLAYERS.CPU] as const) {
      this.setScore(player, 0, false);
      this.setMult(player, 1);
      this.setMeters(player, { odd: 0, even: 0, five: 0, multiplier: 1 });
      this.setClaims(player, 0, quota);
    }
    this.el.historyYou.replaceChildren();
    this.el.historyCpu.replaceChildren();
  }

  private setScore(player: Player, value: number, animate = true): void {
    const node = player === PLAYERS.YOU ? this.el.scoreYou : this.el.scoreCpu;
    node.textContent = String(value);
    if (!animate) return;
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
  }

  private setMatchScores(score: PlayerRecord<number>): void {
    this.el.matchYou.textContent = String(score[PLAYERS.YOU]);
    this.el.matchCpu.textContent = String(score[PLAYERS.CPU]);
  }

  private setClaims(player: Player, claims: number, quota: number): void {
    const node = player === PLAYERS.YOU ? this.el.claimsYou : this.el.claimsCpu;
    node.textContent = `${claims} / ${quota} claimed`;
  }

  private setMult(player: Player, multiplier: number): void {
    const node = player === PLAYERS.YOU ? this.el.multYou : this.el.multCpu;
    node.textContent = multiplier.toFixed(1);
  }

  private setMeters(player: Player, combo: ComboState): void {
    const root = player === PLAYERS.YOU ? this.el.metersYou : this.el.metersCpu;
    root.querySelectorAll<HTMLElement>('.meter__fill').forEach((fill) => {
      const kind = fill.dataset.kind as 'odd' | 'even' | 'five';
      const max = kind === 'five' ? METER_MAX.five : METER_MAX.parity;
      const value = combo[kind];
      fill.style.transform = `scaleX(${Math.min(value, max) / max})`;
      fill.classList.toggle('is-maxed', value >= max && value > 0);
    });
  }

  private addHistory(move: MoveResult): void {
    const root = move.player === PLAYERS.YOU ? this.el.historyYou : this.el.historyCpu;
    const chip = document.createElement('span');
    chip.className = `chip chip--${move.info.isFive ? 'five' : move.info.isEven ? 'even' : 'odd'}`;
    chip.textContent = String(move.value);
    chip.title = `+${move.points} at ×${move.info.multiplier.toFixed(1)}`;
    chip.setAttribute('aria-label', `${move.value}, plus ${move.points} points`);
    root.prepend(chip);
    while (root.children.length > HISTORY_LIMIT) root.lastElementChild?.remove();
  }

  private setTurn(payload: {
    player: Player;
    phase: GamePhase;
    round: number;
    rounds: number;
    reentry?: boolean;
  }): void {
    const human = payload.player === PLAYERS.YOU;
    this.el.panelYou.classList.toggle('is-active', human);
    this.el.panelCpu.classList.toggle('is-active', !human);
    this.el.turn.classList.toggle('turn--cpu', !human);
    const label = this.el.turn.querySelector('b');
    if (label) {
      label.textContent =
        payload.phase === Phase.START
          ? 'Choose hidden start'
          : payload.reentry
            ? human
              ? 'Your re-entry'
              : 'CPU re-entry'
            : human
              ? 'Your move'
              : 'CPU thinking';
    }
    this.el.phase.textContent = `Round ${payload.round} / ${payload.rounds}`;
    this.setRoundPips(payload.round, payload.rounds);
  }

  private setRoundPips(round: number, rounds: number): void {
    const pips = [...this.el.roundPips.children];
    pips.forEach((pip, index) => {
      pip.classList.toggle('is-complete', index + 1 < round);
      pip.classList.toggle('is-active', index + 1 === round && round <= rounds);
    });
  }

  private onRoundOver(payload: RoundScorePayload): void {
    this.setMatchScores(payload.matchScore);
    if (payload.final) return;
    this.el.roundYou.textContent = String(payload.score[PLAYERS.YOU]);
    this.el.roundCpu.textContent = String(payload.score[PLAYERS.CPU]);
    this.el.roundSummary.textContent = `Round ${payload.round} of ${payload.rounds}`;
    this.el.roundTotal.textContent = `Match total ${payload.matchScore[PLAYERS.YOU]}—${payload.matchScore[PLAYERS.CPU]}`;
    this.el.roundTitle.textContent =
      payload.winner === PLAYERS.YOU ? 'Signal secured' : payload.winner === PLAYERS.CPU ? 'CPU takes the grid' : 'Grid deadlocked';
    this.audio.round(payload.winner);
    if (payload.winner === PLAYERS.YOU) this.ambient.burst(PLAYERS.YOU, 6);
    this.showOverlay('roundover');
  }

  private onGameOver(payload: MatchScorePayload): void {
    this.setMatchScores(payload.score);
    this.el.resultYou.textContent = String(payload.score[PLAYERS.YOU]);
    this.el.resultCpu.textContent = String(payload.score[PLAYERS.CPU]);
    this.el.resultEmblem.classList.remove('is-loss', 'is-tie');
    if (payload.winner === PLAYERS.YOU) {
      this.el.resultTitle.textContent = 'You own the signal';
      this.el.resultEmblem.textContent = '◇';
      this.ambient.burst(PLAYERS.YOU, 14);
    } else if (payload.winner === PLAYERS.CPU) {
      this.el.resultTitle.textContent = 'CPU controls the grid';
      this.el.resultEmblem.textContent = '×';
      this.el.resultEmblem.classList.add('is-loss');
    } else {
      this.el.resultTitle.textContent = 'Signal deadlock';
      this.el.resultEmblem.textContent = '=';
      this.el.resultEmblem.classList.add('is-tie');
    }
    this.audio.match(payload.winner);
    this.showOverlay('gameover');
    void submitScore(payload.score[PLAYERS.YOU]);
  }

  pause(): void {
    if (!this.game || !([Phase.START, Phase.PLAYING] as GamePhase[]).includes(this.game.phase)) return;
    if (this.game.pause()) {
      this.audio.pause();
      this.ambient.setMode('paused');
      this.showOverlay('pause');
    }
  }

  resume(): void {
    if (this.game?.resume()) {
      this.audio.resume();
      this.ambient.setMode('game');
      this.hideOverlay('pause');
    }
  }

  async toggleSound(): Promise<void> {
    if (this.audio.isMuted) await this.audio.unlock();
    const muted = this.audio.toggleMuted();
    this.updateSoundButton();
    this.toast(muted ? 'Sound muted' : 'Sound on · procedural soundscape');
    if (!muted) this.audio.confirm();
  }

  updateSoundButton(): void {
    const muted = this.audio.isMuted;
    this.el.soundButton.classList.toggle('is-muted', muted);
    this.el.soundButton.setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
    this.el.soundButton.title = muted ? 'Enable sound' : 'Mute sound';
  }

  renderGameToText() {
    const screen = (Object.entries(this.el.screens).find(([, node]) => node.classList.contains('is-active'))?.[0] ??
      'menu') as ScreenName;
    const overlays = (Object.entries(this.el.overlays) as [OverlayName, HTMLElement][])
      .filter(([, node]) => node.classList.contains('is-open'))
      .map(([name]) => name);
    return {
      screen,
      overlays,
      status: this.el.status.textContent,
      selection: { ...this.selection },
      audio: this.audio.snapshot(),
      game: this.game?.snapshot(PLAYERS.YOU) ?? null,
    };
  }
}
