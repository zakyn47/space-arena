import { ManifestSchema, type SpriteSpec } from '@arena/shared';
import { AnimatedSprite, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';

const DEFAULT_SIZE = { width: 32, height: 32 } as const;

const PLACEHOLDER_COLORS: Readonly<Record<string, number>> = {
  bullet: 0x9be7ff,
  asteroid: 0x7a6a5a,
  ore: 0x3cffb0,
  loot: 0xffc83c,
  shield: 0x5ec8ff,
  safe: 0x2f6f4f,
};

function placeholder(id: string, width: number): Graphics {
  if (id.startsWith('ship_')) {
    const half = width / 2;
    return new Graphics().poly([0, -half, half * 0.8, half, -half * 0.8, half]).fill(0x5ec8ff);
  }
  const color = PLACEHOLDER_COLORS[id.split('_')[0] ?? ''] ?? 0xffffff;
  const alpha = id === 'shield_bubble' ? 0.3 : 1;
  return new Graphics().circle(0, 0, width / 2).fill({ color, alpha });
}

async function loadManifest(): Promise<SpriteSpec[]> {
  try {
    const parsed = ManifestSchema.safeParse(await (await fetch('/manifest.json')).json());
    return parsed.success ? parsed.data.sprites : [];
  } catch {
    return [];
  }
}

async function loadTexture(spec: SpriteSpec): Promise<readonly [string, Texture] | null> {
  try {
    return [spec.id, await Assets.load<Texture>(`/${spec.file}`)] as const;
  } catch {
    return null;
  }
}

export class SpriteFactory {
  private constructor(
    private readonly specs: ReadonlyMap<string, SpriteSpec>,
    private readonly textures: ReadonlyMap<string, Texture>,
  ) {}

  static async load(onProgress: (done: number, total: number) => void = () => undefined): Promise<SpriteFactory> {
    const specs = await loadManifest();
    let done = 0;
    onProgress(done, specs.length);
    const loaded = await Promise.all(
      specs.map(async (spec) => {
        const entry = await loadTexture(spec);
        done += 1;
        onProgress(done, specs.length);
        return entry;
      }),
    );
    return new SpriteFactory(
      new Map(specs.map((spec) => [spec.id, spec])),
      new Map(loaded.filter((entry): entry is readonly [string, Texture] => entry !== null)),
    );
  }

  size(id: string): { readonly width: number; readonly height: number } {
    const spec = this.specs.get(id);
    return spec ? { width: spec.width / spec.frames, height: spec.height } : DEFAULT_SIZE;
  }

  texture(id: string): Texture | null {
    return this.textures.get(id) ?? null;
  }

  create(id: string): Container {
    const texture = this.textures.get(id);
    const spec = this.specs.get(id);
    if (!texture || !spec) return placeholder(id, this.size(id).width);
    const sprite = new Sprite(texture);
    sprite.anchor.set(spec.anchor[0], spec.anchor[1]);
    return sprite;
  }

  animate(id: string, seconds: number, loop: boolean): Container {
    const frames = this.frames(id);
    if (!frames) return this.create(id);
    const animation = new AnimatedSprite(frames);
    animation.anchor.set(0.5);
    animation.loop = loop;
    animation.animationSpeed = frames.length / (seconds * 60);
    animation.play();
    return animation;
  }

  frames(id: string): Texture[] | null {
    const texture = this.textures.get(id);
    const spec = this.specs.get(id);
    if (!texture || !spec || spec.frames < 2) return null;
    const width = spec.width / spec.frames;
    return Array.from(
      { length: spec.frames },
      (_, index) => new Texture({ source: texture.source, frame: new Rectangle(index * width, 0, width, spec.height) }),
    );
  }
}
