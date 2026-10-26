import { Container } from 'pixi.js';
import type { SpriteFactory } from './SpriteFactory';
import { sprayVelocity, stepParticle, type Particle } from './miningFx';

const MAX_PARTICLES = 400;

export interface ParticleStyle {
  readonly spriteId: string;
  readonly speed: readonly [number, number];
  readonly life: readonly [number, number];
  readonly spin: number;
  readonly additive: boolean;
  readonly grows: boolean;
}

export interface Burst {
  readonly style: ParticleStyle;
  readonly x: number;
  readonly y: number;
  readonly direction: number;
  readonly count: number;
}

interface LiveParticle {
  readonly view: Container;
  readonly state: Particle;
  readonly size: number;
  readonly grows: boolean;
}

interface PendingBurst {
  readonly burst: Burst;
  delay: number;
}

function between([min, max]: readonly [number, number]): number {
  return min + Math.random() * (max - min);
}

export class Particles {
  private readonly live: LiveParticle[] = [];
  private readonly pending: PendingBurst[] = [];
  private readonly layer = new Container();

  constructor(
    parent: Container,
    private readonly sprites: SpriteFactory,
  ) {
    parent.addChild(this.layer);
  }

  emit(burst: Burst, delaySeconds = 0): void {
    if (delaySeconds > 0) {
      this.pending.push({ burst, delay: delaySeconds });
      return;
    }
    for (let i = 0; i < burst.count && this.live.length < MAX_PARTICLES; i += 1) this.spawn(burst);
  }

  update(dtSeconds: number): void {
    for (let i = this.pending.length - 1; i >= 0; i -= 1) {
      const entry = this.pending[i];
      if (!entry) continue;
      entry.delay -= dtSeconds;
      if (entry.delay > 0) continue;
      this.pending.splice(i, 1);
      this.emit(entry.burst);
    }
    for (let i = this.live.length - 1; i >= 0; i -= 1) {
      const particle = this.live[i];
      if (!particle) continue;
      if (!stepParticle(particle.state, dtSeconds)) {
        particle.view.destroy();
        this.live.splice(i, 1);
        continue;
      }
      this.draw(particle);
    }
  }

  private spawn({ style, x, y, direction }: Burst): void {
    const view = this.sprites.create(style.spriteId);
    if (style.additive) view.blendMode = 'add';
    const { vx, vy } = sprayVelocity(direction, between(style.speed), Math.random);
    const life = between(style.life);
    const state: Particle = { x, y, vx, vy, angle: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 2 * style.spin, life, maxLife: life };
    const particle: LiveParticle = { view, state, size: 0.6 + Math.random() * 0.8, grows: style.grows };
    this.layer.addChild(view);
    this.live.push(particle);
    this.draw(particle);
  }

  private draw({ view, state, size, grows }: LiveParticle): void {
    const remaining = state.life / state.maxLife;
    view.position.set(state.x, state.y);
    view.rotation = state.angle;
    view.alpha = remaining;
    view.scale.set(size * (grows ? 0.6 + 0.9 * (1 - remaining) : 0.4 + 0.6 * remaining));
  }
}
