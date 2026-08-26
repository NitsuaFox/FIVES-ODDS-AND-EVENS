// UI layer: DOM rendering, screen transitions, animations, input wiring.

import { Game, Phase } from './game.js';
import { submitScore } from './wavedash.js';
import {
  BOARD_SIZES,
  DIFFICULTIES,
  PLAYERS,
  PLAYER_LABELS,
  METER_MAX,
  HISTORY_LIMIT,
} from './config.js';
import { createLogger } from './debug.js';

const log = createLogger('ui');

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.game = null;
    this.cellEls = [];
    this.selection = { size: 8, difficulty: 'normal' };

    this.el = {
      screens: {
        menu: $('screen-menu'),
        setup: $('screen-setup'),
        game: $('screen-game'),
      },
      overlays: {
        howto: $('overlay-howto'),
        pause: $('overlay-pause'),
        gameover: $('overlay-gameover'),
      },
      board: $('board'),
      turn: $('turn-indicator'),
      phase: $('phase-indicator'),
      status: $('statusbar'),
      panelYou: $('panel-you'),
      panelCpu: $('panel-cpu'),
      scoreYou: $('score-you'),
      scoreCpu: $('score-cpu'),
      multYou: $('mult-you'),
      multCpu: $('mult-cpu'),
      metersYou: $('meters-you'),
      metersCpu: $('meters-cpu'),
      historyYou: $('history-you'),
      historyCpu: $('history-cpu'),
      resultTitle: $('result-title'),
      resultYou: $('result-you'),
      resultCpu: $('result-cpu'),
    };

    this._buildSetupOptions();
    this._bindOverlayButtons();
    log.log('UI ready');
    // Log menu title/subtitle centers after first layout so alignment
    // issues can be copy-pasted from the console.
    requestAnimationFrame(() => this.logMenuAlignment());
  }

  /* ---------------- screens & overlays ---------------- */

  showScreen(name) {
    log.log('showScreen', name);
    Object.entries(this.el.screens).forEach(([key, node]) => {
      node.classList.toggle('is-active', key === name);
    });
    if (name === 'menu') {
      requestAnimationFrame(() => this.logMenuAlignment());
    }
  }

  /**
   * Debug helper: report how the main-menu title and subtitle sit relative
   * to the 16:9 stage. Copy the `[FOE:ui] menu alignment` line from the
   * console if the tagline looks off-center.
   */
  logMenuAlignment() {
    const stage = $('stage');
    const title = document.querySelector('.brand__title');
    const subtitle = document.querySelector('.brand__tag');
    if (!stage || !title || !subtitle) {
      log.warn('menu alignment: missing elements', {
        stage: !!stage,
        title: !!title,
        subtitle: !!subtitle,
      });
      return;
    }
    const box = (el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      return {
        x: +r.left.toFixed(1),
        w: +r.width.toFixed(1),
        cx: +cx.toFixed(1),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
      };
    };
    const s = box(stage);
    const t = box(title);
    const g = box(subtitle);
    const round = (n) => +n.toFixed(1);
    log.log('menu alignment', {
      stageCx: s.cx,
      title: { cx: t.cx, dx: round(t.cx - s.cx), w: t.w, text: t.text },
      subtitle: { cx: g.cx, dx: round(g.cx - s.cx), w: g.w, text: g.text },
      titleVsSubtitle: round(t.cx - g.cx),
    });
  }

  showOverlay(name) {
    if (this.el.overlays[name]) this.el.overlays[name].classList.add('is-open');
  }

  hideOverlay(name) {
    if (this.el.overlays[name]) this.el.overlays[name].classList.remove('is-open');
  }

  hideAllOverlays() {
    Object.keys(this.el.overlays).forEach((k) => this.hideOverlay(k));
  }

  /* ---------------- setup screen ---------------- */

  _buildSetupOptions() {
    const sizeRow = $('size-options');
    const diffRow = $('difficulty-options');

    const makeOption = (item, group) => {
      const btn = document.createElement('button');
      btn.className = 'option';
      btn.dataset.group = group;
      btn.dataset.value = item.id;
      btn.innerHTML = `<span class="option__label">${item.label}</span><span class="option__sub">${item.sub}</span>`;
      btn.addEventListener('click', () => {
        this.selection[group === 'size' ? 'size' : 'difficulty'] =
          group === 'size' ? Number(item.id) : item.id;
        [...btn.parentElement.children].forEach((c) => c.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        log.log('selection', { ...this.selection });
      });
      return btn;
    };

    BOARD_SIZES.forEach((s) => {
      const opt = makeOption(s, 'size');
      if (Number(s.id) === this.selection.size) opt.classList.add('is-selected');
      sizeRow.appendChild(opt);
    });
    DIFFICULTIES.forEach((d) => {
      const opt = makeOption(d, 'difficulty');
      if (d.id === this.selection.difficulty) opt.classList.add('is-selected');
      diffRow.appendChild(opt);
    });
  }

  _bindOverlayButtons() {
    $('howto-close').addEventListener('click', () => this.hideOverlay('howto'));
  }

  /* ---------------- game lifecycle ---------------- */

  startGame({ size, difficulty }) {
    if (this.game) this.game.destroy();
    log.group('startGame');
    log.log('params', { size, difficulty });

    this._buildBoard(size);
    this._resetPanels();
    this.hideAllOverlays();
    this.showScreen('game');

    this.game = new Game({ size, difficulty, delegate: this._delegate() });
    this.game.start();
    log.groupEnd();
  }

  restart() {
    this.startGame({ ...this.selection });
  }

  quitToMenu() {
    if (this.game) this.game.destroy();
    this.game = null;
    this.hideAllOverlays();
    this.showScreen('menu');
  }

  _delegate() {
    return {
      onStart: () => {},
      onTurn: (e) => this._setTurn(e),
      onStatus: (text) => {
        this.el.status.textContent = text;
      },
      onAvailable: (indices) => this._setAvailable(indices),
      onMove: (e) => this._onMove(e),
      onPeek: (peeks) => this._peek(peeks),
      onUnpeek: (peeks) => this._unpeek(peeks),
      onGameOver: (e) => this._onGameOver(e),
    };
  }

  /* ---------------- board rendering ---------------- */

  _buildBoard(size) {
    const board = this.el.board;
    board.innerHTML = '';
    board.style.setProperty('--n', size);
    board.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    board.style.gridTemplateRows = `repeat(${size}, 1fr)`;
    this.cellEls = [];

    const count = size * size;
    for (let i = 0; i < count; i++) {
      const cell = document.createElement('button');
      cell.className = 'cell';
      cell.dataset.index = i;
      cell.setAttribute('aria-label', `cell ${i + 1}`);
      cell.addEventListener('click', () => this._onCellClick(i));
      board.appendChild(cell);
      this.cellEls.push(cell);
    }
    log.log('board built', { size, count });
  }

  _onCellClick(index) {
    if (!this.game) return;
    const ok = this.game.humanMove(index);
    if (!ok) {
      // Nudge feedback for an invalid click.
      const cell = this.cellEls[index];
      if (cell && !cell.classList.contains('is-owned')) {
        cell.classList.remove('shake');
        void cell.offsetWidth; // restart animation
        cell.classList.add('shake');
      }
    }
  }

  _setAvailable(indices) {
    this.cellEls.forEach((c) => c.classList.remove('is-available'));
    for (const i of indices) this.cellEls[i]?.classList.add('is-available');
  }

  _onMove({ player, index, value, info, score, combo }) {
    const cell = this.cellEls[index];
    if (cell) {
      cell.classList.remove('is-available', 'is-peek');
      cell.classList.add('is-owned', player === PLAYERS.YOU ? 'is-you' : 'is-cpu', 'pop');
      cell.textContent = value;
      if (info.isFive) cell.classList.add('is-five');
    }
    this._setScore(player, score);
    this._setMult(player, info.multiplier);
    this._setMeters(player, combo);
    this._addHistory(player, value, info);
  }

  _peek(peeks) {
    for (const { index, value } of peeks) {
      const cell = this.cellEls[index];
      if (cell && !cell.classList.contains('is-owned')) {
        cell.textContent = value;
        cell.classList.add('is-peek');
      }
    }
  }

  _unpeek(peeks) {
    for (const p of peeks) {
      const index = typeof p === 'number' ? p : p.index;
      const cell = this.cellEls[index];
      if (cell && !cell.classList.contains('is-owned')) {
        cell.textContent = '';
        cell.classList.remove('is-peek');
      }
    }
  }

  /* ---------------- panels ---------------- */

  _resetPanels() {
    this._setScore(PLAYERS.YOU, 0);
    this._setScore(PLAYERS.CPU, 0);
    this._setMult(PLAYERS.YOU, 1);
    this._setMult(PLAYERS.CPU, 1);
    this._setMeters(PLAYERS.YOU, { odd: 0, even: 0, five: 0 });
    this._setMeters(PLAYERS.CPU, { odd: 0, even: 0, five: 0 });
    this.el.historyYou.innerHTML = '';
    this.el.historyCpu.innerHTML = '';
    this.el.phase.textContent = 'Start';
  }

  _setScore(player, value) {
    const node = player === PLAYERS.YOU ? this.el.scoreYou : this.el.scoreCpu;
    node.textContent = value;
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
  }

  _setMult(player, mult) {
    const node = player === PLAYERS.YOU ? this.el.multYou : this.el.multCpu;
    node.textContent = mult.toFixed(1);
  }

  _setMeters(player, combo) {
    const root = player === PLAYERS.YOU ? this.el.metersYou : this.el.metersCpu;
    const fills = root.querySelectorAll('.meter__fill');
    fills.forEach((fill) => {
      const kind = fill.dataset.kind;
      const max = kind === 'five' ? METER_MAX.five : METER_MAX.parity;
      const val = combo[kind] || 0;
      const pct = Math.min(val, max) / max;
      fill.style.transform = `scaleX(${pct})`;
      fill.classList.toggle('is-maxed', val >= max && val > 0);
    });
  }

  _addHistory(player, value, info) {
    const root = player === PLAYERS.YOU ? this.el.historyYou : this.el.historyCpu;
    const chip = document.createElement('span');
    const type = info.isFive ? 'five' : info.isEven ? 'even' : 'odd';
    chip.className = `chip chip--${type}`;
    chip.textContent = value;
    root.insertBefore(chip, root.firstChild);
    while (root.children.length > HISTORY_LIMIT) root.removeChild(root.lastChild);
  }

  /* ---------------- turn / phase ---------------- */

  _setTurn({ player, phase }) {
    const you = player === PLAYERS.YOU;
    this.el.panelYou.classList.toggle('is-active', you);
    this.el.panelCpu.classList.toggle('is-active', !you);
    this.el.turn.textContent = you ? 'Your turn' : "CPU's turn";
    this.el.turn.classList.toggle('turn--you', you);
    this.el.turn.classList.toggle('turn--cpu', !you);
    this.el.phase.textContent = phase === Phase.START ? 'Start' : 'Playing';
  }

  /* ---------------- game over ---------------- */

  _onGameOver({ score, winner }) {
    this.el.resultYou.textContent = score.YOU;
    this.el.resultCpu.textContent = score.CPU;
    let title = "It's a tie!";
    if (winner === PLAYERS.YOU) title = 'You win! 🎉';
    else if (winner === PLAYERS.CPU) title = 'CPU wins';
    this.el.resultTitle.textContent = title;
    this.el.resultTitle.classList.toggle('result--win', winner === PLAYERS.YOU);
    this.el.resultTitle.classList.toggle('result--lose', winner === PLAYERS.CPU);
    log.log('show game over', { score, winner });
    this.showOverlay('gameover');

    // Submit the player's score to the Wavedash leaderboard (no-op standalone).
    submitScore(score.YOU);
  }

  /* ---------------- pause ---------------- */

  pause() {
    if (!this.game || this.game.phase === Phase.OVER) return;
    this.showOverlay('pause');
  }

  resume() {
    this.hideOverlay('pause');
  }
}

export { PLAYER_LABELS };
