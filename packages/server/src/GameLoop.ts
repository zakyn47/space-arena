import { SNAPSHOT_RATE, TICK_DT, TICK_RATE } from '@arena/shared';
import type { ShipRecord } from './db/PlayerRepository';
import { toShipRecord } from './world/entities';
import type { DeathEvent, World } from './world/World';

export interface LoopOutput {
  broadcastSnapshots(): void;
  notifyDeaths(events: readonly DeathEvent[]): void;
}

export interface ShipStore {
  saveShips(records: readonly ShipRecord[], now: number): void;
}

export class GameLoop {
  private snapshotCredit = 0;

  constructor(
    private readonly world: World,
    private readonly output: LoopOutput,
    private readonly store: ShipStore,
    private readonly now: () => number = Date.now,
  ) {}

  step(): void {
    const events = this.world.tick(TICK_DT);
    const changed = [...events.died.map((event) => event.ship), ...events.departed];
    if (changed.length > 0) this.store.saveShips(changed.map(toShipRecord), this.now());
    this.output.notifyDeaths(events.died);
    this.snapshotCredit += SNAPSHOT_RATE;
    if (this.snapshotCredit < TICK_RATE) return;
    this.snapshotCredit -= TICK_RATE;
    this.output.broadcastSnapshots();
  }

  start(): ReturnType<typeof setInterval> {
    return setInterval(() => this.step(), 1_000 / TICK_RATE);
  }
}
