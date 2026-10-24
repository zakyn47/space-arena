import {
  BASE_LOADOUT,
  TICK_DT,
  statsFor,
  stepMotion,
  type SelfState,
  type ShipInput,
  type ShipMotion,
  type ShipStats,
} from '@arena/shared';

const MAX_PENDING = 120;

interface PendingInput {
  readonly seq: number;
  readonly input: ShipInput;
}

export class Predictor {
  private pending: PendingInput[] = [];
  private nextSeq = 1;
  private motion: ShipMotion | null = null;
  private stats: ShipStats = statsFor(BASE_LOADOUT);

  get current(): ShipMotion | null {
    return this.motion;
  }

  predict(input: ShipInput): number {
    const seq = this.nextSeq;
    this.nextSeq += 1;
    this.pending.push({ seq, input });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    if (this.motion) this.motion = stepMotion(this.motion, input, this.stats, TICK_DT);
    return seq;
  }

  reconcile(self: SelfState, lastSeq: number): void {
    this.stats = statsFor(self.loadout);
    this.pending = this.pending.filter((entry) => entry.seq > lastSeq);
    const authoritative: ShipMotion = { x: self.x, y: self.y, vx: self.vx, vy: self.vy, angle: self.angle };
    this.motion = this.pending.reduce(
      (motion, entry) => stepMotion(motion, entry.input, this.stats, TICK_DT),
      authoritative,
    );
  }
}
