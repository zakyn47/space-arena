import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAssets, readPngSize } from './assetCheck';

function fakePng(width: number, height: number): Buffer {
  const data = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data, 0);
  data.writeUInt32BE(13, 8);
  data.write('IHDR', 12, 'ascii');
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

async function assetsDir(files: Record<string, Buffer>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'assets-'));
  const manifest = {
    sprites: [
      { id: 'a', file: 'a.png', width: 16, height: 16, anchor: [0.5, 0.5], frames: 1 },
      { id: 'b', file: 'sub/b.png', width: 32, height: 8, anchor: [0, 0], frames: 4 },
    ],
  };
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
  await mkdir(join(dir, 'sub'));
  for (const [name, data] of Object.entries(files)) await writeFile(join(dir, name), data);
  return dir;
}

describe('readPngSize', () => {
  it('reads IHDR dimensions', () => {
    expect(readPngSize(fakePng(64, 32))).toEqual({ width: 64, height: 32 });
  });

  it('rejects non-PNG data', () => {
    expect(readPngSize(Buffer.from('hello world, not a png at all'))).toBeNull();
  });
});

describe('checkAssets', () => {
  it('passes when every file matches', async () => {
    const dir = await assetsDir({ 'a.png': fakePng(16, 16), 'sub/b.png': fakePng(32, 8) });
    expect(await checkAssets(dir)).toEqual([]);
  });

  it('reports missing files and wrong sizes', async () => {
    const dir = await assetsDir({ 'a.png': fakePng(20, 16) });
    expect(await checkAssets(dir)).toEqual([
      'a: expected 16x16, got 20x16',
      'b: missing sub/b.png',
    ]);
  });
});
