import { NPC_NAMES, VIEW_RADIUS, type EntityState, type HitEvent, type SafeZone } from '@arena/shared';
import { Application, Container, Graphics, Rectangle, Text, TilingSprite, type Texture } from 'pixi.js';
import { Effects } from './Effects';
import type { SpriteFactory } from './SpriteFactory';
import { spriteIdFor, vanishEffectFor } from './spriteIds';

const STARFIELD_PARALLAX = 0.3;
const EXPLOSION_VISIBLE_FRACTION = 0.8;
const LABEL_OFFSET_Y = -44;
const ANIMATIONS: Readonly<Record<string, number>> = { space_mine: 0.8, leviathan: 1.6, plasma_orb: 0.3, plasma_bolt: 0.2, booster_repair: 1.2, booster_speed: 1.2 };

type LayerName = 'zones' | 'ground' | 'beams' | 'ships' | 'bullets' | 'effects' | 'labels';

const LAYER_FOR: Readonly<Record<EntityState['kind'], LayerName>> = {
  ship: 'ships',
  bullet: 'bullets',
  rocket: 'bullets',
  orb: 'bullets',
  plasma: 'bullets',
  spaceMine: 'ground',
  asteroid: 'ground',
  ore: 'ground',
  crate: 'ground',
  booster: 'ground',
};

interface EntityView {
  readonly spriteId: string;
  readonly container: Container;
  readonly shield: Container | null;
  readonly label: Text | null;
  readonly health: Graphics | null;
  readonly labelOffset: number;
  x: number;
  y: number;
}

export interface RenderView {
  readonly camera: { readonly x: number; readonly y: number };
  readonly entities: readonly EntityState[];
}

function generatedStars(app: Application): Texture {
  const stars = new Graphics();
  for (let i = 0; i < 120; i += 1) {
    stars.circle(Math.random() * 512, Math.random() * 512, Math.random() * 1.5 + 0.3).fill({ color: 0xffffff, alpha: Math.random() });
  }
  return app.renderer.generateTexture({ target: stars, frame: new Rectangle(0, 0, 512, 512) });
}

export function cameraScale(width: number, height: number, touch: boolean): number {
  return Math.max(touch ? 0.4 : 0.75, Math.hypot(width, height) / (2 * VIEW_RADIUS));
}

export class Renderer {
  private readonly world = new Container();
  private readonly layers: Readonly<Record<LayerName, Container>> = {
    zones: new Container(),
    ground: new Container(),
    beams: new Container(),
    ships: new Container(),
    bullets: new Container(),
    effects: new Container(),
    labels: new Container(),
  };
  private readonly views = new Map<number, EntityView>();
  private readonly beams = new Map<number, Container>();
  private readonly effects: Effects;
  private camera = { x: 0, y: 0 };
  private readonly touch = matchMedia('(any-pointer: coarse)');

  private constructor(
    private readonly app: Application,
    private readonly sprites: SpriteFactory,
    private readonly starfield: TilingSprite,
  ) {
    this.effects = new Effects(this.layers.effects, sprites);
    for (const layer of Object.values(this.layers)) this.world.addChild(layer);
    app.stage.addChild(starfield, this.world);
    app.ticker.add((ticker) => this.effects.update(ticker.deltaMS / 1_000));
  }

  static async create(host: HTMLElement, sprites: SpriteFactory, zones: readonly SafeZone[], worldSize: number): Promise<Renderer> {
    const app = new Application();
    await app.init({ resizeTo: host, background: 0x05060d, antialias: true });
    host.prepend(app.canvas);
    const starfield = new TilingSprite({
      texture: sprites.texture('starfield_tile') ?? generatedStars(app),
      width: app.screen.width,
      height: app.screen.height,
    });
    const renderer = new Renderer(app, sprites, starfield);
    renderer.drawBounds(worldSize);
    renderer.drawZones(zones);
    return renderer;
  }

  onFrame(callback: () => void): void {
    this.app.ticker.add(callback);
  }

  render(view: RenderView): void {
    this.camera = { x: view.camera.x, y: view.camera.y };
    this.positionCamera();
    const seen = new Set<number>();
    for (const entity of view.entities) {
      seen.add(entity.id);
      this.syncEntity(entity);
    }
    this.syncBeams(view.entities);
    this.removeMissing(seen);
  }

  showHits(hits: readonly HitEvent[], delaySeconds: number): void {
    for (const hit of hits) {
      const view = this.views.get(hit.shipId);
      if (view) this.effects.hit({ ship: view.container, angle: hit.angle, shield: hit.shield, offset: view.spriteId === 'leviathan' ? 70 : 18, delaySeconds });
    }
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }

  private positionCamera(): void {
    const { width, height } = this.app.screen;
    const scale = cameraScale(width, height, this.touch.matches);
    this.world.scale.set(scale);
    this.world.pivot.set(this.camera.x, this.camera.y);
    this.world.position.set(width / 2, height / 2);
    this.starfield.width = width;
    this.starfield.height = height;
    this.starfield.tilePosition.set(-this.camera.x * STARFIELD_PARALLAX * scale, -this.camera.y * STARFIELD_PARALLAX * scale);
  }

  // Ships stop dead at the arena edge, so the wall and the void beyond it must be obvious before pilots reach it.
  private drawBounds(size: number): void {
    const margin = VIEW_RADIUS * 2;
    const outside = new Graphics()
      .rect(-margin, -margin, size + margin * 2, margin)
      .rect(-margin, size, size + margin * 2, margin)
      .rect(-margin, 0, margin, size)
      .rect(size, 0, margin, size)
      .fill({ color: 0x1a0606, alpha: 0.65 });
    this.layers.zones.addChild(outside);
    const texture = this.sprites.texture('arena_barrier');
    if (!texture) {
      const glow = new Graphics().rect(0, 0, size, size).stroke({ color: 0xff5a3c, alpha: 0.18, width: 40 }).rect(0, 0, size, size).stroke({ color: 0xff5a3c, alpha: 0.9, width: 6 });
      this.layers.zones.addChild(glow);
      return;
    }
    const edges = [
      { x: 0, y: size / 2, rotation: 0 },
      { x: size, y: size / 2, rotation: 0 },
      { x: size / 2, y: 0, rotation: Math.PI / 2 },
      { x: size / 2, y: size, rotation: Math.PI / 2 },
    ];
    for (const edge of edges) {
      const wall = new TilingSprite({ texture, width: texture.width, height: size + texture.width });
      wall.anchor.set(0.5);
      wall.position.set(edge.x, edge.y);
      wall.rotation = edge.rotation;
      this.layers.zones.addChild(wall);
    }
  }

  private drawZones(zones: readonly SafeZone[]): void {
    for (const zone of zones) {
      const ring = new Graphics().circle(zone.x, zone.y, zone.radius).fill({ color: 0x2f6f4f, alpha: 0.08 }).stroke({ color: 0x3cffb0, alpha: 0.4, width: 4 });
      const station = this.sprites.create('safe_zone_station');
      station.position.set(zone.x, zone.y);
      this.layers.zones.addChild(ring, station);
    }
  }

  private syncEntity(entity: EntityState): void {
    const spriteId = spriteIdFor(entity);
    const existing = this.views.get(entity.id);
    const view = existing && existing.spriteId === spriteId ? existing : this.replaceView(entity, spriteId);
    view.x = entity.x;
    view.y = entity.y;
    view.container.position.set(entity.x, entity.y);
    if ('angle' in entity) view.container.rotation = entity.angle;
    if (view.shield && entity.kind === 'ship') view.shield.visible = entity.shieldUp;
    view.label?.position.set(entity.x, entity.y + view.labelOffset);
    if (view.health && entity.kind === 'ship') this.drawHealth(view.health, entity.x, entity.y + view.labelOffset + 12, entity.health ?? 1);
  }

  private syncBeams(entities: readonly EntityState[]): void {
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    const active = new Set<number>();
    for (const entity of entities) {
      if (entity.kind !== 'ship' || entity.miningTargetId === null) continue;
      const target = byId.get(entity.miningTargetId);
      if (!target) continue;
      active.add(entity.id);
      const beam = this.beams.get(entity.id) ?? this.createBeam(entity.id);
      const length = Math.hypot(target.x - entity.x, target.y - entity.y);
      beam.position.set(entity.x, entity.y);
      beam.rotation = Math.atan2(target.x - entity.x, entity.y - target.y);
      beam.scale.set(1, length / this.sprites.size('mining_beam').height);
    }
    for (const [id, beam] of this.beams) {
      if (active.has(id)) continue;
      beam.destroy({ children: true });
      this.beams.delete(id);
    }
  }

  private createBeam(id: number): Container {
    const beam = this.sprites.create('mining_beam');
    this.layers.beams.addChild(beam);
    this.beams.set(id, beam);
    return beam;
  }

  private replaceView(entity: EntityState, spriteId: string): EntityView {
    this.destroyView(this.views.get(entity.id));
    const container = new Container();
    if (entity.kind === 'rocket') {
      const trail = this.sprites.create('rocket_trail');
      trail.position.set(0, 16);
      container.addChild(trail);
    }
    const loop = ANIMATIONS[spriteId];
    const body = loop === undefined ? this.sprites.create(spriteId) : this.sprites.animate(spriteId, loop, true);
    if (entity.kind === 'asteroid') body.scale.set((entity.radius * 2) / this.sprites.size(spriteId).width);
    container.addChild(body);
    const isLeviathan = entity.kind === 'ship' && entity.npc === 'leviathan';
    const shield = entity.kind === 'ship' && !isLeviathan ? this.sprites.create('shield_bubble') : null;
    if (shield) container.addChild(shield);
    if (entity.kind === 'crate' && entity.hasGear) {
      const badge = this.sprites.create('icon_salvage');
      badge.scale.set(0.4);
      badge.position.set(10, -10);
      container.addChild(badge);
    }
    const label = this.createLabel(entity);
    this.layers[LAYER_FOR[entity.kind]].addChild(container);
    const health = isLeviathan ? new Graphics() : null;
    if (health) this.layers.labels.addChild(health);
    const labelOffset = isLeviathan ? -(this.sprites.size(spriteId).height / 2 + 14) : LABEL_OFFSET_Y;
    const view: EntityView = { spriteId, container, shield, label, health, labelOffset, x: entity.x, y: entity.y };
    this.views.set(entity.id, view);
    return view;
  }

  private createLabel(entity: EntityState): Text | null {
    if (entity.kind !== 'ship' || !entity.npc) return null;
    const label = new Text({ text: NPC_NAMES[entity.npc], style: { fill: entity.npc === 'leviathan' ? 0xc04bff : 0xff5a4f, fontSize: 12, fontFamily: 'system-ui' } });
    label.anchor.set(0.5);
    this.layers.labels.addChild(label);
    return label;
  }

  private destroyView(view: EntityView | undefined): void {
    view?.container.destroy({ children: true });
    view?.label?.destroy();
    view?.health?.destroy();
  }

  private drawHealth(bar: Graphics, x: number, y: number, health: number): void {
    const width = 120;
    bar.clear().rect(x - width / 2, y, width, 6).fill({ color: 0x1d1030, alpha: 0.85 }).rect(x - width / 2, y, width * health, 6).fill(0xc04bff);
  }

  private removeMissing(seen: ReadonlySet<number>): void {
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      const effect = vanishEffectFor(view.spriteId);
      if (effect && this.isWellInsideView(view)) this.effects.explode(view.x, view.y, effect);
      this.destroyView(view);
      this.views.delete(id);
    }
  }

  private isWellInsideView(view: EntityView): boolean {
    return Math.hypot(view.x - this.camera.x, view.y - this.camera.y) < VIEW_RADIUS * EXPLOSION_VISIBLE_FRACTION;
  }
}
