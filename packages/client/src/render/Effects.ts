import { AnimatedSprite, type Container } from 'pixi.js';
import type { SpriteFactory } from './SpriteFactory';

const EXPLOSION_SECONDS = 0.6;
const HIT_SECONDS = 0.3;
const HULL_HIT_OFFSET = 18;

interface ActiveEffect {
  readonly view: Container;
  readonly duration: number;
  remaining: number;
  delay: number;
  readonly attach: () => void;
}

export interface HitEffect {
  readonly ship: Container;
  readonly angle: number;
  readonly shield: boolean;
  readonly delaySeconds: number;
}

export class Effects {
  private readonly active: ActiveEffect[] = [];

  constructor(
    private readonly layer: Container,
    private readonly sprites: SpriteFactory,
  ) {}

  explode(x: number, y: number): void {
    const view = this.animation('explosion', EXPLOSION_SECONDS);
    view.position.set(x, y);
    this.layer.addChild(view);
    this.active.push({ view, duration: EXPLOSION_SECONDS, remaining: EXPLOSION_SECONDS, delay: 0, attach: () => undefined });
  }

  // Hits ride on the ship's container so they stay on the hull while it flies; the delay lines
  // them up with the interpolated bullets, which are drawn slightly in the past.
  hit({ ship, angle, shield, delaySeconds }: HitEffect): void {
    const view = this.animation(shield ? 'shield_impact' : 'hull_hit', HIT_SECONDS);
    const attach = (): void => {
      if (ship.destroyed) return;
      const local = angle - ship.rotation;
      const offset = shield ? 0 : HULL_HIT_OFFSET;
      view.rotation = local;
      view.position.set(Math.sin(local) * offset, -Math.cos(local) * offset);
      ship.addChild(view);
    };
    const effect: ActiveEffect = { view, duration: HIT_SECONDS, remaining: HIT_SECONDS, delay: delaySeconds, attach };
    this.active.push(effect);
    if (delaySeconds <= 0) this.start(effect);
  }

  update(dtSeconds: number): void {
    for (const effect of [...this.active]) {
      if (effect.delay > 0) {
        effect.delay -= dtSeconds;
        if (effect.delay <= 0) this.start(effect);
        continue;
      }
      effect.remaining -= dtSeconds;
      this.fadePlaceholder(effect);
      if (effect.remaining > 0 && !effect.view.destroyed) continue;
      if (!effect.view.destroyed) effect.view.destroy();
      this.active.splice(this.active.indexOf(effect), 1);
    }
  }

  private start(effect: ActiveEffect): void {
    effect.attach();
    if (effect.view instanceof AnimatedSprite) effect.view.gotoAndPlay(0);
  }

  private fadePlaceholder(effect: ActiveEffect): void {
    if (effect.view instanceof AnimatedSprite || effect.view.destroyed) return;
    const progress = 1 - effect.remaining / effect.duration;
    effect.view.scale.set(0.5 + progress * 1.5);
    effect.view.alpha = 1 - progress;
  }

  private animation(id: string, seconds: number): Container {
    const frames = this.sprites.frames(id);
    if (!frames) return this.sprites.create(id);
    const animation = new AnimatedSprite(frames);
    animation.anchor.set(0.5);
    animation.loop = false;
    animation.animationSpeed = frames.length / (seconds * 60);
    animation.play();
    return animation;
  }
}
