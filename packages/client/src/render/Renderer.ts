import { PIRATE_NAMES, VIEW_RADIUS, type EntityState, type SafeZone } from '@arena/shared';
import { Application, Container, Graphics, Rectangle, Text, TilingSprite, type Texture } from 'pixi.js';
import { Effects } from './Effects';
import type { SpriteFactory } from './SpriteFactory';
import { spriteIdFor } from './spriteIds';

const STARFIELD_PARALLAX = 0.3;
const EXPLOSION_VISIBLE_FRACTION = 0.8;
const LABEL_OFFSET_Y = -44;

type LayerName = 'zones' | 'ground' | 'beams' | 'ships' | 'bullets' | 'effects' | 'labels';

const LAYER_FOR: Readonly<Record<EntityState['kind'], LayerName>> = {
  ship: 'ships',
  bullet: 'bullets',
  rocket: 'bullets',
  asteroid: 'ground',
  ore: 'ground',
  crate: 'ground',
};

interface EntityView {
  readonly spriteId: string;
  readonly container: Container;
  readonly shield: Container | null;
  readonly label: Text | null;
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

  static async create(host: HTMLElement, sprites: SpriteFactory, zones: readonly SafeZone[]): Promise<Renderer> {
    const app = new Application();
    await app.init({ resizeTo: host, background: 0x05060d, antialias: true });
    host.prepend(app.canvas);
    const starfield = new TilingSprite({
      texture: sprites.texture('starfield_tile') ?? generatedStars(app),
      width: app.screen.width,
      height: app.screen.height,
    });
    const renderer = new Renderer(app, sprites, starfield);
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

  destroy(): void {
    this.app.destroy(true, { children: true });
  }

  private positionCamera(): void {
    const { width, height } = this.app.screen;
    this.world.pivot.set(this.camera.x, this.camera.y);
    this.world.position.set(width / 2, height / 2);
    this.starfield.width = width;
    this.starfield.height = height;
    this.starfield.tilePosition.set(-this.camera.x * STARFIELD_PARALLAX, -this.camera.y * STARFIELD_PARALLAX);
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
    view.label?.position.set(entity.x, entity.y + LABEL_OFFSET_Y);
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
    const body = this.sprites.create(spriteId);
    if (entity.kind === 'asteroid') body.scale.set((entity.radius * 2) / this.sprites.size(spriteId).width);
    container.addChild(body);
    const shield = entity.kind === 'ship' ? this.sprites.create('shield_bubble') : null;
    if (shield) container.addChild(shield);
    if (entity.kind === 'crate' && entity.hasGear) {
      const badge = this.sprites.create('icon_salvage');
      badge.scale.set(0.4);
      badge.position.set(10, -10);
      container.addChild(badge);
    }
    const label = this.createLabel(entity);
    this.layers[LAYER_FOR[entity.kind]].addChild(container);
    const view: EntityView = { spriteId, container, shield, label, x: entity.x, y: entity.y };
    this.views.set(entity.id, view);
    return view;
  }

  private createLabel(entity: EntityState): Text | null {
    if (entity.kind !== 'ship' || !entity.npc) return null;
    const label = new Text({ text: PIRATE_NAMES[entity.npc], style: { fill: 0xff5a4f, fontSize: 12, fontFamily: 'system-ui' } });
    label.anchor.set(0.5);
    this.layers.labels.addChild(label);
    return label;
  }

  private destroyView(view: EntityView | undefined): void {
    view?.container.destroy({ children: true });
    view?.label?.destroy();
  }

  private removeMissing(seen: ReadonlySet<number>): void {
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      if (view.spriteId.startsWith('ship_') && this.isWellInsideView(view)) this.effects.explode(view.x, view.y);
      this.destroyView(view);
      this.views.delete(id);
    }
  }

  private isWellInsideView(view: EntityView): boolean {
    return Math.hypot(view.x - this.camera.x, view.y - this.camera.y) < VIEW_RADIUS * EXPLOSION_VISIBLE_FRACTION;
  }
}
