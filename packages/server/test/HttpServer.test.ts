import { mkdtemp, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth/AuthService';
import { RateLimiter } from '../src/auth/RateLimiter';
import { PlayerRepository } from '../src/db/PlayerRepository';
import { createHttpServer } from '../src/http/HttpServer';

let repo: PlayerRepository;
let server: Server;
let base: string;

async function start(capacity: number, trustProxy = false): Promise<void> {
  const staticDir = await mkdtemp(join(tmpdir(), 'static-'));
  await writeFile(join(staticDir, 'index.html'), '<h1>arena</h1>');
  repo = PlayerRepository.open(':memory:');
  server = createHttpServer({
    auth: new AuthService(repo),
    limiter: new RateLimiter(capacity, 0),
    staticDir,
    trustProxy,
    now: Date.now,
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  base = `http://127.0.0.1:${address.port}`;
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  repo.close();
});

describe('auth routes', () => {
  beforeEach(() => start(10));

  it('registers then logs in', async () => {
    const register = await post('/api/register', { username: 'alice', password: 'password1' });
    expect(register.status).toBe(200);
    expect(await register.json()).toEqual({ token: expect.any(String) });
    const login = await post('/api/login', { username: 'alice', password: 'password1' });
    expect(login.status).toBe(200);
  });

  it('returns 409 for duplicates and 401 for bad logins', async () => {
    await post('/api/register', { username: 'alice', password: 'password1' });
    expect((await post('/api/register', { username: 'alice', password: 'password1' })).status).toBe(409);
    expect((await post('/api/login', { username: 'alice', password: 'nopenope' })).status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    const response = await fetch(`${base}/api/login`, { method: 'POST', body: '{bad' });
    expect(response.status).toBe(400);
  });
});

describe('rate limiting', () => {
  beforeEach(() => start(1));

  it('returns 429 after the burst', async () => {
    await post('/api/login', { username: 'x', password: 'password1' });
    expect((await post('/api/login', { username: 'x', password: 'password1' })).status).toBe(429);
  });

  it('ignores X-Real-IP unless the proxy is trusted', async () => {
    await post('/api/login', { username: 'x', password: 'password1' }, { 'x-real-ip': '203.0.113.1' });
    expect((await post('/api/login', { username: 'x', password: 'password1' }, { 'x-real-ip': '203.0.113.2' })).status).toBe(429);
  });
});

describe('rate limiting behind a trusted proxy', () => {
  beforeEach(() => start(1, true));

  it('limits each X-Real-IP separately', async () => {
    const first = { 'x-real-ip': '203.0.113.1' };
    await post('/api/login', { username: 'x', password: 'password1' }, first);
    expect((await post('/api/login', { username: 'x', password: 'password1' }, first)).status).toBe(429);
    expect((await post('/api/login', { username: 'x', password: 'password1' }, { 'x-real-ip': '203.0.113.2' })).status).toBe(401);
  });
});

describe('static files', () => {
  beforeEach(() => start(10));

  it('serves index.html at /', async () => {
    const response = await fetch(`${base}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<h1>arena</h1>');
  });

  it('blocks path traversal', async () => {
    expect((await fetch(`${base}/..%2F..%2Fetc%2Fpasswd`)).status).toBe(404);
  });
});
