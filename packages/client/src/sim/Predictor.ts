import {
  STARTER_BUILD,
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
  private stats: ShipStats = statsFor(STARTER_BUILD);
  private frozen = false;

  get current(): ShipMotion | null {
    return this.motion;
  }

  predict(input: ShipInput): number {
    const seq = this.nextSeq;
    this.nextSeq += 1;
    this.pending.push({ seq, input });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    if (this.motion && !this.frozen) this.motion = stepMotion(this.motion, input, this.stats, TICK_DT);
    return seq;
  }

  reconcile(self: SelfState, lastSeq: number): void {
    this.stats = statsFor(self.build);
    this.frozen = self.docked;
    this.pending = this.frozen ? [] : this.pending.filter((entry) => entry.seq > lastSeq);
    const authoritative: ShipMotion = { x: self.x, y: self.y, vx: self.vx, vy: self.vy, angle: self.angle };
    this.motion = this.pending.reduce(
      (motion, entry) => stepMotion(motion, entry.input, this.stats, TICK_DT),
      authoritative,
    );
  }
}
