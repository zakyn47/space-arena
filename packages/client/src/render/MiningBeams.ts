import type { EntityState } from '@arena/shared';
import { Container, TilingSprite } from 'pixi.js';
import type { SpriteFactory } from './SpriteFactory';
import { beamGeometry, sprayVelocity, stepParticle, type BeamGeometry, type Particle } from './miningFx';

const SCROLL_SPEED = 260;
const IGNITE_SECONDS = 0.12;
const IMPACT_LOOP_SECONDS = 0.32;
const SPARKS_PER_SECOND = 45;
const DEBRIS_PER_SECOND = 9;
const MAX_PARTICLES = 260;

interface ParticleKind {
  readonly spriteId: string;
  readonly speed: readonly [number, number];
  readonly life: readonly [number, number];
  readonly spin: number;
  readonly additive: boolean;
}

const SPARK: ParticleKind = { spriteId: 'mining_spark', speed: [70, 180], life: [0.2, 0.45], spin: 0, additive: true };
const DEBRIS: ParticleKind = { spriteId: 'mining_debris', speed: [20, 60], life: [0.6, 1.1], spin: 6, additive: false };

interface Beam {
  readonly root: Container;
  readonly band: Container;
  readonly impact: Container;
  geometry: BeamGeometry;
  age: number;
  sparkDebt: number;
  debrisDebt: number;
}

interface LiveParticle {
  readonly view: Container;
  readonly state: Particle;
  readonly fadeScale: number;
}

function between([min, max]: readonly [number, number]): number {
  return min + Math.random() * (max - min);
}

export class MiningBeams {
  private readonly beams = new Map<number, Beam>();
  private readonly particles: LiveParticle[] = [];
  private readonly particleLayer = new Container();
  private time = 0;

  constructor(
    private readonly layer: Container,
    private readonly sprites: SpriteFactory,
  ) {
    layer.addChild(this.particleLayer);
  }

  sync(entities: readonly EntityState[]): void {
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    const active = new Set<number>();
    for (const entity of entities) {
      if (entity.kind !== 'ship' || entity.miningTargetId === null) continue;
      const target = byId.get(entity.miningTargetId);
      if (!target) continue;
      active.add(entity.id);
      const beam = this.beams.get(entity.id) ?? this.createBeam(entity.id);
      beam.geometry = beamGeometry(entity, { x: target.x, y: target.y, radius: target.kind === 'asteroid' ? target.radius : 0 });
      beam.root.position.set(entity.x, entity.y);
      beam.root.rotation = beam.geometry.rotation;
    }
    for (const [id, beam] of this.beams) {
      if (active.has(id)) continue;
      beam.root.destroy({ children: true });
      this.beams.delete(id);
    }
  }

  update(dtSeconds: number): void {
    this.time += dtSeconds;
    for (const beam of this.beams.values()) this.animate(beam, dtSeconds);
    this.stepParticles(dtSeconds);
  }

  private createBeam(id: number): Beam {
    const root = new Container();
    const band = this.createBand();
    const impact = this.sprites.animate('mining_impact', IMPACT_LOOP_SECONDS, true);
    impact.blendMode = 'add';
    root.addChild(band, impact);
    this.layer.addChildAt(root, 0);
    const beam: Beam = { root, band, impact, geometry: { endX: 0, endY: 0, length: 0, rotation: 0 }, age: 0, sparkDebt: 0, debrisDebt: 0 };
    this.beams.set(id, beam);
    return beam;
  }

  private createBand(): Container {
    const texture = this.sprites.texture('mining_beam');
    const band = texture ? new TilingSprite({ texture, width: texture.width, height: texture.height }) : this.sprites.create('mining_beam');
    if (band instanceof TilingSprite) band.anchor.set(0.5, 1);
    band.blendMode = 'add';
    return band;
  }

  private animate(beam: Beam, dtSeconds: number): void {
    beam.age += dtSeconds;
    const ignite = Math.min(1, beam.age / IGNITE_SECONDS);
    const length = beam.geometry.length * ignite;
    const flicker = 0.85 + 0.15 * Math.sin(this.time * 37 + beam.age * 11);
    if (beam.band instanceof TilingSprite) {
      beam.band.height = length;
      beam.band.tilePosition.y -= SCROLL_SPEED * dtSeconds;
      beam.band.scale.x = 0.9 + 0.2 * Math.sin(this.time * 23);
    } else {
      beam.band.scale.set(1, length / this.sprites.size('mining_beam').height);
    }
    beam.band.alpha = flicker;
    beam.impact.position.set(0, -length);
    beam.impact.visible = ignite >= 1;
    beam.impact.scale.set(0.85 + 0.25 * flicker);
    if (ignite < 1) return;
    beam.sparkDebt = this.emit(beam, SPARK, beam.sparkDebt + SPARKS_PER_SECOND * dtSeconds);
    beam.debrisDebt = this.emit(beam, DEBRIS, beam.debrisDebt + DEBRIS_PER_SECOND * dtSeconds);
  }

  private emit(beam: Beam, kind: ParticleKind, debt: number): number {
    let remaining = debt;
    for (; remaining >= 1; remaining -= 1) {
      if (this.particles.length >= MAX_PARTICLES) return 0;
      this.spawn(beam.geometry, kind);
    }
    return remaining;
  }

  private spawn(geometry: BeamGeometry, kind: ParticleKind): void {
    const view = this.sprites.create(kind.spriteId);
    if (kind.additive) view.blendMode = 'add';
    const { vx, vy } = sprayVelocity(geometry.rotation, between(kind.speed), Math.random);
    const life = between(kind.life);
    const state: Particle = { x: geometry.endX, y: geometry.endY, vx, vy, angle: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 2 * kind.spin, life, maxLife: life };
    this.particleLayer.addChild(view);
    this.particles.push({ view, state, fadeScale: 0.6 + Math.random() * 0.8 });
  }

  // Beam geometry is in world space but the beam root sits on the ship, so particles spawn from the
  // world-space end point and live in their own layer, unaffected when the ship moves or the beam stops.
  private stepParticles(dtSeconds: number): void {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];
      if (!particle) continue;
      if (!stepParticle(particle.state, dtSeconds)) {
        particle.view.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      const remaining = particle.state.life / particle.state.maxLife;
      particle.view.position.set(particle.state.x, particle.state.y);
      particle.view.rotation = particle.state.angle;
      particle.view.alpha = remaining;
      particle.view.scale.set(particle.fadeScale * (0.4 + 0.6 * remaining));
    }
  }
}
