export interface Positioned {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

const ROW_STRIDE = 100_000;

export class SpatialGrid<T extends Positioned> {
  private readonly cells = new Map<number, T[]>();

  constructor(private readonly cellSize: number) {}

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const key = this.key(this.cell(item.x), this.cell(item.y));
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(item);
    else this.cells.set(key, [item]);
  }

  queryRadius(x: number, y: number, radius: number): T[] {
    const found: T[] = [];
    for (let cx = this.cell(x - radius); cx <= this.cell(x + radius); cx += 1) {
      for (let cy = this.cell(y - radius); cy <= this.cell(y + radius); cy += 1) {
        for (const item of this.cells.get(this.key(cx, cy)) ?? []) {
          if (Math.hypot(item.x - x, item.y - y) <= radius) found.push(item);
        }
      }
    }
    return found;
  }

  private cell(value: number): number {
    return Math.floor(value / this.cellSize);
  }

  private key(cx: number, cy: number): number {
    return cx * ROW_STRIDE + cy;
  }
}
