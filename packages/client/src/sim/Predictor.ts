import {
  STARTER_BUILD,
  IDLE_INPUT,
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
  private lastInput: ShipInput = IDLE_INPUT;
  private predictedAt: number | null = null;

  get current(): ShipMotion | null {
    return this.motion;
  }

  get turnRate(): number {
    return this.stats.turnRate;
  }

  sample(now = performance.now()): ShipMotion | null {
    if (!this.motion || this.frozen || this.predictedAt === null) return this.motion;
    const dt = Math.max(0, Math.min(TICK_DT, (now - this.predictedAt) / 1_000));
    return stepMotion(this.motion, this.lastInput, this.stats, dt);
  }

  predict(input: ShipInput, now = performance.now()): number {
    this.lastInput = input;
    this.predictedAt = now;
    const seq = this.nextSeq;
    this.nextSeq += 1;
    this.pending.push({ seq, input });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    if (this.motion && !this.frozen) this.motion = stepMotion(this.motion, input, this.stats, TICK_DT);
    return seq;
  }

  reconcile(self: SelfState, lastSeq: number): void {
    this.stats = statsFor(self.build, self.captain);
    this.frozen = self.docked;
    this.pending = this.frozen ? [] : this.pending.filter((entry) => entry.seq > lastSeq);
    const authoritative: ShipMotion = { x: self.x, y: self.y, vx: self.vx, vy: self.vy, angle: self.angle };
    this.motion = this.pending.reduce(
      (motion, entry) => stepMotion(motion, entry.input, this.stats, TICK_DT),
      authoritative,
    );
  }
}
