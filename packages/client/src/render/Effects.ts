import { AnimatedSprite, type Container } from 'pixi.js';
import type { SpriteFactory } from './SpriteFactory';

const EXPLOSION_SECONDS = 0.6;

interface ActiveEffect {
  readonly view: Container;
  remaining: number;
}

export class Effects {
  private readonly active: ActiveEffect[] = [];

  constructor(
    private readonly layer: Container,
    private readonly sprites: SpriteFactory,
  ) {}

  explode(x: number, y: number): void {
    const view = this.explosionView();
    view.position.set(x, y);
    this.layer.addChild(view);
    this.active.push({ view, remaining: EXPLOSION_SECONDS });
  }

  update(dtSeconds: number): void {
    for (const effect of [...this.active]) {
      effect.remaining -= dtSeconds;
      const progress = 1 - effect.remaining / EXPLOSION_SECONDS;
      if (!(effect.view instanceof AnimatedSprite)) {
        effect.view.scale.set(0.5 + progress * 1.5);
        effect.view.alpha = 1 - progress;
      }
      if (effect.remaining > 0) continue;
      effect.view.destroy();
      this.active.splice(this.active.indexOf(effect), 1);
    }
  }

  private explosionView(): Container {
    const frames = this.sprites.frames('explosion');
    if (!frames) return this.sprites.create('explosion');
    const animation = new AnimatedSprite(frames);
    animation.anchor.set(0.5);
    animation.loop = false;
    animation.animationSpeed = frames.length / (EXPLOSION_SECONDS * 60);
    animation.play();
    return animation;
  }
}
