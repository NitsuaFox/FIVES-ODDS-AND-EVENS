// Board model: pure data + geometry. No DOM here.

import { createLogger } from './debug.js';

const log = createLogger('board');

export class Board {
  constructor(size) {
    this.size = size;
    this.count = size * size;
    this.cells = [];
    this._neighbors = [];
    this.generate();
  }

  generate() {
    // Numbers 1..count, shuffled (Fisher–Yates).
    const values = Array.from({ length: this.count }, (_, i) => i + 1);
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    this.cells = values.map((value) => ({ value, revealed: false, owner: null }));
    this._neighbors = this.cells.map((_, i) => this._computeNeighbors(i));
    log.log('generated board', { size: this.size, count: this.count });
  }

  _computeNeighbors(index) {
    const s = this.size;
    const r = Math.floor(index / s);
    const c = index % s;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < s && nc >= 0 && nc < s) out.push(nr * s + nc);
      }
    }
    return out;
  }

  neighbors(index) {
    return this._neighbors[index];
  }

  value(index) {
    return this.cells[index].value;
  }

  owner(index) {
    return this.cells[index].owner;
  }

  isRevealed(index) {
    return this.cells[index].revealed;
  }

  reveal(index, owner) {
    const cell = this.cells[index];
    cell.revealed = true;
    cell.owner = owner;
    return cell;
  }

  unrevealed() {
    const out = [];
    for (let i = 0; i < this.count; i++) if (!this.cells[i].revealed) out.push(i);
    return out;
  }

  isFull() {
    return this.cells.every((c) => c.revealed);
  }

  // Unrevealed cells adjacent to any of the given owned cells.
  adjacentMoves(ownedCells) {
    const set = new Set();
    for (const oc of ownedCells) {
      for (const n of this._neighbors[oc]) {
        if (!this.cells[n].revealed) set.add(n);
      }
    }
    return [...set];
  }
}
