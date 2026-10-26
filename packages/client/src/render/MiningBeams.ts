import type { EntityState } from '@arena/shared';
import { Container, TilingSprite } from 'pixi.js';
import type { SpriteFactory } from './SpriteFactory';
import { beamGeometry, type BeamGeometry } from './miningFx';
import type { ParticleStyle, Particles } from './Particles';

const SCROLL_SPEED = 260;
const IGNITE_SECONDS = 0.12;
const IMPACT_LOOP_SECONDS = 0.32;
const SPARKS_PER_SECOND = 45;
const DEBRIS_PER_SECOND = 9;

const SPARK: ParticleStyle = { spriteId: 'mining_spark', speed: [70, 180], life: [0.2, 0.45], spin: 0, additive: true, grows: false };
const DEBRIS: ParticleStyle = { spriteId: 'mining_debris', speed: [20, 60], life: [0.6, 1.1], spin: 6, additive: false, grows: false };

interface Beam {
  readonly root: Container;
  readonly band: Container;
  readonly impact: Container;
  geometry: BeamGeometry;
  age: number;
  sparkDebt: number;
  debrisDebt: number;
}

export class MiningBeams {
  private readonly beams = new Map<number, Beam>();
  private time = 0;

  constructor(
    private readonly layer: Container,
    private readonly sprites: SpriteFactory,
    private readonly particles: Particles,
  ) {}

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

  private emit(beam: Beam, style: ParticleStyle, debt: number): number {
    const count = Math.floor(debt);
    if (count > 0) this.particles.emit({ style, x: beam.geometry.endX, y: beam.geometry.endY, direction: beam.geometry.rotation + Math.PI, count });
    return debt - count;
  }
}
