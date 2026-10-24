import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ManifestSchema, type SpriteSpec } from '@arena/shared';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readPngSize(data: Buffer): { width: number; height: number } | null {
  if (data.length < 24 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

async function checkSprite(assetsDir: string, sprite: SpriteSpec): Promise<string | null> {
  let data: Buffer;
  try {
    data = await readFile(join(assetsDir, sprite.file));
  } catch {
    return `${sprite.id}: missing ${sprite.file}`;
  }
  const size = readPngSize(data);
  if (!size) return `${sprite.id}: not a PNG`;
  if (size.width === sprite.width && size.height === sprite.height) return null;
  return `${sprite.id}: expected ${sprite.width}x${sprite.height}, got ${size.width}x${size.height}`;
}

export async function checkAssets(assetsDir: string): Promise<string[]> {
  const raw: unknown = JSON.parse(await readFile(join(assetsDir, 'manifest.json'), 'utf8'));
  const manifest = ManifestSchema.parse(raw);
  const results = await Promise.all(manifest.sprites.map((sprite) => checkSprite(assetsDir, sprite)));
  return results.filter((problem): problem is string => problem !== null);
}
