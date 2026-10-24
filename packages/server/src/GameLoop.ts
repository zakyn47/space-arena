import { SNAPSHOT_RATE, TICK_DT, TICK_RATE, type HitEvent } from '@arena/shared';
import type { ShipRecord } from './db/PlayerRepository';
import { toShipRecord } from './world/entities';
import type { DeathEvent, World } from './world/World';

export interface LoopOutput {
  broadcastSnapshots(hits: readonly HitEvent[]): void;
  notifyDeaths(events: readonly DeathEvent[]): void;
}

export interface ShipStore {
  saveShips(records: readonly ShipRecord[], now: number): void;
}

export class GameLoop {
  private snapshotCredit = 0;
  private pendingHits: HitEvent[] = [];

  constructor(
    private readonly world: World,
    private readonly output: LoopOutput,
    private readonly store: ShipStore,
    private readonly now: () => number = Date.now,
  ) {}

  step(): void {
    const events = this.world.tick(TICK_DT);
    const killers = events.died.flatMap((event) => (event.killer && event.killer.npc === null && event.killer !== event.ship ? [event.killer] : []));
    const changed = [...events.died.map((event) => event.ship), ...killers, ...events.departed];
    if (changed.length > 0) this.store.saveShips(changed.map(toShipRecord), this.now());
    this.output.notifyDeaths(events.died);
    this.pendingHits.push(...events.hits);
    this.snapshotCredit += SNAPSHOT_RATE;
    if (this.snapshotCredit < TICK_RATE) return;
    this.snapshotCredit -= TICK_RATE;
    this.output.broadcastSnapshots(this.pendingHits);
    this.pendingHits = [];
  }

  start(): ReturnType<typeof setInterval> {
    return setInterval(() => this.step(), 1_000 / TICK_RATE);
  }
}
