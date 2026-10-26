import type { Container } from 'pixi.js';
import type { SpriteFactory } from './SpriteFactory';
import { engineMountsFor, stepThrottle } from './engineFx';

const FLAME_LOOP_SECONDS = 0.24;
const IDLE = { length: 0.34, width: 0.7, alpha: 0.5 } as const;
const FULL = { length: 1.15, width: 1.3, alpha: 1 } as const;

function mix(idle: number, full: number, throttle: number): number {
  return idle + (full - idle) * throttle;
}

export class EngineFlames {
  private throttle = 0;
  private thrusting = false;
  private time = Math.random() * 10;

  private constructor(private readonly flames: readonly Container[]) {}

  static attach(ship: Container, spriteId: string, sprites: SpriteFactory): EngineFlames | null {
    const mounts = engineMountsFor(spriteId);
    if (mounts.length === 0) return null;
    const flames = mounts.map((mount) => {
      const flame = sprites.animate('engine_flame', FLAME_LOOP_SECONDS, true);
      flame.pivot.set(0, -sprites.size('engine_flame').height / 2);
      flame.position.set(mount.x, mount.y);
      flame.blendMode = 'add';
      ship.addChildAt(flame, 0);
      return flame;
    });
    return new EngineFlames(flames);
  }

  setThrusting(thrusting: boolean): void {
    this.thrusting = thrusting;
  }

  update(dtSeconds: number): void {
    this.time += dtSeconds;
    this.throttle = stepThrottle(this.throttle, this.thrusting, dtSeconds);
    this.flames.forEach((flame, index) => {
      const flicker = 1 + 0.12 * Math.sin(this.time * 31 + index * 2.1) * (0.4 + this.throttle);
      flame.scale.set(mix(IDLE.width, FULL.width, this.throttle), mix(IDLE.length, FULL.length, this.throttle) * flicker);
      flame.alpha = mix(IDLE.alpha, FULL.alpha, this.throttle);
    });
  }
}
