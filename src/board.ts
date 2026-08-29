import { createLogger } from './debug.ts';
import type { Player } from './types.ts';

const log = createLogger('board');

export interface BoardCell {
  value: number;
  revealed: boolean;
  owner: Player | null;
  neutral: boolean;
}

export class Board {
  readonly count: number;
  readonly neutralIndices: Set<number>;
  cells: BoardCell[] = [];
  private neighborsByIndex: number[][] = [];

  constructor(
    readonly size: number,
    { neutralIndices = [] }: { neutralIndices?: number[] } = {},
  ) {
    this.count = size * size;
    this.neutralIndices = new Set(neutralIndices);
    this.generate();
  }

  generate(): void {
    const values = Array.from({ length: this.count }, (_, index) => index + 1);
    for (let index = values.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const current = values[index];
      const target = values[swapIndex];
      if (current === undefined || target === undefined) continue;
      values[index] = target;
      values[swapIndex] = current;
    }

    this.cells = values.map((value, index) => ({
      value,
      revealed: false,
      owner: null,
      neutral: this.neutralIndices.has(index),
    }));
    this.neighborsByIndex = this.cells.map((_, index) => this.computeNeighbors(index));
    log.log('generated board', { size: this.size, count: this.count });
  }

  private computeNeighbors(index: number): number[] {
    const row = Math.floor(index / this.size);
    const column = index % this.size;
    const output: number[] = [];
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        if (rowOffset === 0 && columnOffset === 0) continue;
        const nextRow = row + rowOffset;
        const nextColumn = column + columnOffset;
        if (nextRow >= 0 && nextRow < this.size && nextColumn >= 0 && nextColumn < this.size) {
          output.push(nextRow * this.size + nextColumn);
        }
      }
    }
    return output;
  }

  neighbors(index: number): number[] {
    return this.neighborsByIndex[index] ?? [];
  }

  value(index: number): number {
    const cell = this.cells[index];
    if (!cell) throw new RangeError(`Cell ${index} does not exist`);
    return cell.value;
  }

  owner(index: number): Player | null {
    return this.cells[index]?.owner ?? null;
  }

  isRevealed(index: number): boolean {
    return Boolean(this.cells[index]?.revealed);
  }

  isNeutral(index: number): boolean {
    return Boolean(this.cells[index]?.neutral);
  }

  reveal(index: number, owner: Player): BoardCell | null {
    const cell = this.cells[index];
    if (!cell || cell.neutral || cell.revealed) return null;
    cell.revealed = true;
    cell.owner = owner;
    return cell;
  }

  unrevealed(): number[] {
    return this.cells.flatMap((cell, index) => (!cell.revealed && !cell.neutral ? [index] : []));
  }

  isFull(): boolean {
    return this.cells.every((cell) => cell.revealed || cell.neutral);
  }

  claimableCount(): number {
    return this.cells.reduce((total, cell) => total + (cell.neutral ? 0 : 1), 0);
  }

  adjacentMoves(ownedCells: number[]): number[] {
    const moves = new Set<number>();
    for (const ownedIndex of ownedCells) {
      for (const neighbor of this.neighbors(ownedIndex)) {
        const cell = this.cells[neighbor];
        if (cell && !cell.revealed && !cell.neutral) moves.add(neighbor);
      }
    }
    return [...moves];
  }
}
