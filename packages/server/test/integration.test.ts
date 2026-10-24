import type { ClientMessage, ServerMessage, ShipInput } from '@arena/shared';
import { BOUNTY_BASE, IDLE_INPUT, SAFE_ZONES } from '@arena/shared';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp, type App } from '../src/app';
import { PlayerRepository } from '../src/db/PlayerRepository';
import { OPEN_SPACE } from './support/fixtures';

type MessageOf<K extends ServerMessage['type']> = Extract<ServerMessage, { type: K }>;

class TestClient {
  readonly messages: ServerMessage[] = [];

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => this.messages.push(JSON.parse(data.toString()) as ServerMessage));
  }

  static async connect(port: number, token: string): Promise<TestClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const client = new TestClient(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    client.send({ type: 'hello', token });
    return client;
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  input(seq: number, input: ShipInput): void {
    this.send({ type: 'input', seq, ...input });
  }

  close(): void {
    this.socket.close();
  }
}

let app: App;
let port: number;
let dbPath: string;

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 2));
}

async function pump<K extends ServerMessage['type']>(
  client: TestClient,
  type: K,
  predicate: (message: MessageOf<K>) => boolean = () => true,
  maxSteps = 300,
): Promise<MessageOf<K>> {
  for (let step = 0; step < maxSteps; step += 1) {
    const found = client.messages.find(
      (message): message is MessageOf<K> => message.type === type && predicate(message as MessageOf<K>),
    );
    if (found) return found;
    app.loop.step();
    await settle();
  }
  throw new Error(`no ${type} message`);
}

async function register(username: string): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/api/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'password1' }),
  });
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('token' in body) || typeof body.token !== 'string') {
    throw new Error('register failed');
  }
  return body.token;
}

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'arena-'));
  dbPath = join(dir, 'arena.db');
  app = createApp({ dbPath, staticDir: dir, asteroidTarget: 0 });
  await new Promise<void>((resolve) => app.server.listen(0, resolve));
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  port = address.port;
});

afterEach(async () => {
  await app.close();
});

describe('server integration', () => {
  it('rejects invalid tokens', async () => {
    const client = await TestClient.connect(port, 'not-a-token');
    expect((await pump(client, 'kicked')).reason).toBe('unauthorized');
  });

  it('plays a full duel, dock and purchase loop', async () => {
    const alice = await TestClient.connect(port, await register('alice'));
    const bob = await TestClient.connect(port, await register('bob'));
    const aliceShip = app.world.shipById((await pump(alice, 'welcome')).shipId);
    const bobShip = app.world.shipById((await pump(bob, 'welcome')).shipId);
    if (!aliceShip || !bobShip) throw new Error('ships missing');
    Object.assign(aliceShip, { x: OPEN_SPACE.x, y: OPEN_SPACE.y });
    Object.assign(bobShip, { x: OPEN_SPACE.x, y: OPEN_SPACE.y - 200 });

    alice.input(1, { ...IDLE_INPUT, fire: true });
    expect((await pump(bob, 'died')).killer).toBe('alice');
    await pump(alice, 'snapshot', (s) => s.self.carriedCredits > BOUNTY_BASE);
  });

  it('kicks the older connection on a second login', async () => {
    const token = await register('alice');
    const first = await TestClient.connect(port, token);
    await pump(first, 'welcome');
    const second = await TestClient.connect(port, token);
    await pump(second, 'welcome');
    expect((await pump(first, 'kicked')).reason).toBe('logged in elsewhere');
  });

  it('saves a ship that disconnects in open space after the linger', async () => {
    const alice = await TestClient.connect(port, await register('alice'));
    const ship = app.world.shipById((await pump(alice, 'welcome')).shipId);
    if (!ship) throw new Error('ship missing');
    Object.assign(ship, { x: OPEN_SPACE.x, y: OPEN_SPACE.y });
    alice.close();
    await settle();
    for (let step = 0; step < 320; step += 1) app.loop.step();
    const repo = PlayerRepository.open(dbPath);
    const account = repo.findAccountByUsername('alice');
    const saved = account && repo.loadShip(account.id);
    repo.close();
    expect(saved?.x).toBeCloseTo(OPEN_SPACE.x);
    expect(saved?.y).toBeCloseTo(OPEN_SPACE.y);
  }, 20_000);

  it('persists connected ships before closing the database on shutdown', async () => {
    const alice = await TestClient.connect(port, await register('alice'));
    const ship = app.world.shipById((await pump(alice, 'welcome')).shipId);
    const zone = SAFE_ZONES[0];
    if (!ship || !zone) throw new Error('setup missing');
    Object.assign(ship, { x: zone.x, y: zone.y });
    await app.close();
    const repo = PlayerRepository.open(dbPath);
    const account = repo.findAccountByUsername('alice');
    const saved = account && repo.loadShip(account.id);
    repo.close();
    expect(saved?.x).toBeCloseTo(zone.x);
  });
});
