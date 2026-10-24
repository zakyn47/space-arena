import type { ClientMessage, ServerMessage, ShipInput } from '@arena/shared';
import {
  BOUNTY_BASE,
  NEW_CAPTAIN,
  captainPoints,
  captainLevel,
  BOUNTY_SHARE,
  IDLE_INPUT,
  SAFE_ZONES,
  STARTER_BUILD,
  buildValue,
} from '@arena/shared';
import Database from 'better-sqlite3';
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

  clear(): void {
    this.messages.length = 0;
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

async function register(username: string, trained = true): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/api/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'password1' }),
  });
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('token' in body) || typeof body.token !== 'string') {
    throw new Error('register failed');
  }
  if (trained) {
    const repo = PlayerRepository.open(dbPath);
    const account = repo.findAccountByUsername(username);
    if (!account) throw new Error('account missing');
    const captain = { ...NEW_CAPTAIN, skills: { ...NEW_CAPTAIN.skills, piloting: 3 } };
    repo.saveShips([{ ...repo.loadShip(account.id), captain }], Date.now());
    repo.close();
  }
  return body.token;
}

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'arena-'));
  dbPath = join(dir, 'arena.db');
  app = createApp({ dbPath, staticDir: dir, asteroidTarget: 0, pirates: false });
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

  it('kills with rockets, docks with E, shops and enforces the dock cooldown', async () => {
    const alice = await TestClient.connect(port, await register('alice'));
    const bob = await TestClient.connect(port, await register('bob'));
    const aliceShip = app.world.shipById((await pump(alice, 'welcome')).shipId);
    const bobShip = app.world.shipById((await pump(bob, 'welcome')).shipId);
    if (!aliceShip || !bobShip) throw new Error('ships missing');
    Object.assign(aliceShip, { x: OPEN_SPACE.x, y: OPEN_SPACE.y });
    Object.assign(bobShip, { x: OPEN_SPACE.x, y: OPEN_SPACE.y - 400 });

    alice.input(1, { ...IDLE_INPUT, rocket: true });
    expect((await pump(bob, 'died')).killer).toBe('alice');
    bob.clear();
    const respawned = await pump(bob, 'snapshot');
    expect(respawned.self.build).toEqual(STARTER_BUILD);
    expect(respawned.self.rockets).toBe(0);
    expect(respawned.self.docked).toBe(false);
    const scores = await (await fetch(`http://127.0.0.1:${port}/api/highscores`)).json();
    expect(scores).toEqual({ highscores: [{ rank: 1, username: 'alice', kills: 1 }] });

    alice.input(2, IDLE_INPUT);
    const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };
    Object.assign(aliceShip, { x: zone.x + 50, y: zone.y, vx: 0, vy: 0 });
    alice.clear();
    alice.send({ type: 'dock' });
    const docked = await pump(alice, 'snapshot', (s) => s.self.docked);
    expect(docked.self.bankedCredits).toBe(BOUNTY_BASE + Math.floor(buildValue(STARTER_BUILD) * BOUNTY_SHARE));

    alice.send({ type: 'buyGear', gearId: 'rocket_rack', mk: 1, slot: { type: 'utility', index: 0 } });
    expect(await pump(alice, 'shopResult')).toEqual({ type: 'shopResult', ok: true });
    await pump(alice, 'snapshot', (s) => s.self.maxRockets === 15);

    alice.clear();
    alice.send({ type: 'dock' });
    const undocked = await pump(alice, 'snapshot', (s) => !s.self.docked);
    expect(undocked.self.dockCooldown).toBeGreaterThan(29);
    alice.clear();
    alice.send({ type: 'dock' });
    for (let step = 0; step < 10; step += 1) app.loop.step();
    await settle();
    expect((await pump(alice, 'snapshot')).self.docked).toBe(false);

    bob.send({ type: 'buyOrdnance', ordnance: 'mines', count: 1 });
    expect(await pump(bob, 'shopResult')).toEqual({ type: 'shopResult', ok: false, reason: 'not_docked' });
  });

  it('kicks the older connection on a second login', async () => {
    const token = await register('alice');
    const first = await TestClient.connect(port, token);
    await pump(first, 'welcome');
    const second = await TestClient.connect(port, token);
    await pump(second, 'welcome');
    expect((await pump(first, 'kicked')).reason).toBe('logged in elsewhere');
  });

  it('sends radar with every fifth snapshot', async () => {
    const alice = await TestClient.connect(port, await register('alice'));
    const bob = await TestClient.connect(port, await register('bob'));
    const aliceShip = app.world.shipById((await pump(alice, 'welcome')).shipId);
    const bobShip = app.world.shipById((await pump(bob, 'welcome')).shipId);
    if (!aliceShip || !bobShip) throw new Error('ships missing');
    Object.assign(bobShip, { x: aliceShip.x + 1_000, y: aliceShip.y });
    alice.clear();
    for (let step = 0; step < 30; step += 1) app.loop.step();
    await settle();
    const snapshots = alice.messages.filter((m): m is MessageOf<'snapshot'> => m.type === 'snapshot');
    const withRadar = snapshots.filter((s) => s.radar !== undefined);
    expect(snapshots).toHaveLength(20);
    expect(withRadar).toHaveLength(4);
    expect(withRadar[0]?.radar).toEqual([{ x: Math.round(bobShip.x), y: Math.round(bobShip.y), kind: 'player' }]);
  });

  it('mines with F and never saves pirates', async () => {
    const alice = await TestClient.connect(port, await register('alice'));
    const ship = app.world.shipById((await pump(alice, 'welcome')).shipId);
    if (!ship) throw new Error('ship missing');
    Object.assign(ship, { x: OPEN_SPACE.x, y: OPEN_SPACE.y });
    app.world.addAsteroid({ x: OPEN_SPACE.x, y: OPEN_SPACE.y - 150, radius: 40, hp: 80, oreYield: 3, variant: 1 });
    alice.input(1, { ...IDLE_INPUT, mine: true });
    const mined = await pump(alice, 'snapshot', (s) => s.self.ore >= 2);
    expect(mined.self.miningTargetId).not.toBeNull();
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

describe('with pirates', () => {
  it('never saves pirate ships', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'arena-pirates-'));
    const piratePath = join(dir, 'arena.db');
    const pirateApp = createApp({ dbPath: piratePath, staticDir: dir, asteroidTarget: 0, pirates: true });
    for (let step = 0; step < 3; step += 1) pirateApp.loop.step();
    expect(pirateApp.world.npcShips().length).toBeGreaterThan(0);
    pirateApp.saveAll();
    await pirateApp.close();
    const db = new Database(piratePath);
    const row = db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM ships WHERE account_id < 0').get();
    db.close();
    expect(row?.n).toBe(0);
  });
});


it('onboards, levels and trains a persistent captain through real sockets', async () => {
  const token = await register('novice', false);
  const client = await TestClient.connect(port, token);
  const initial = await pump(client, 'snapshot');
  expect(initial.self.docked).toBe(true);
  expect(captainPoints(initial.self.captain)).toBe(3);
  client.clear();
  client.send({ type: 'dock' });
  client.input(1, { ...IDLE_INPUT, thrust: true, fire: true });
  const locked = await pump(client, 'snapshot', (s) => s.lastSeq === 1);
  expect(locked.self.docked).toBe(true);
  expect(locked.self.y).toBe(initial.self.y);
  for (const skill of ['engineering', 'gunnery', 'piloting'] as const) {
    client.clear();
    client.send({ type: 'trainCaptain', skill });
    expect(await pump(client, 'shopResult')).toEqual({ type: 'shopResult', ok: true });
  }
  client.clear();
  const commissioned = await pump(client, 'snapshot', (s) => captainPoints(s.self.captain) === 0);
  expect(commissioned.self.maxHull).toBe(84);
  client.clear();
  client.send({ type: 'dock' });
  await pump(client, 'snapshot', (s) => !s.self.docked);
  client.send({ type: 'trainCaptain', skill: 'engineering' });
  expect(await pump(client, 'shopResult')).toEqual({ type: 'shopResult', ok: false, reason: 'not_docked' });
  const ship = app.world.shipById(initial.self.id);
  if (!ship) throw new Error('ship missing');
  ship.ore = 10;
  ship.dockCooldownUntil = -Infinity;
  client.clear();
  client.send({ type: 'dock' });
  const leveled = await pump(client, 'snapshot', (s) => s.self.captain.xp === 100);
  expect(captainLevel(leveled.self.captain)).toBe(2);
  expect(captainPoints(leveled.self.captain)).toBe(1);
  client.send({ type: 'trainCaptain', skill: 'engineering' });
  expect(await pump(client, 'shopResult')).toEqual({ type: 'shopResult', ok: true });
  const upgraded = await pump(client, 'snapshot', (s) => s.self.captain.skills.engineering === 2);
  const saved = PlayerRepository.open(dbPath);
  expect(saved.loadShip(ship.accountId).captain).toEqual(upgraded.self.captain);
  saved.close();
  client.clear();
  ship.hull = 0;
  await pump(client, 'died');
  expect(ship.captain).toEqual(upgraded.self.captain);
  expect(ship.stats.maxHull).toBe(88);
  app.saveAll();
  await app.close();
  app = createApp({ dbPath, staticDir: tmpdir(), asteroidTarget: 0, pirates: false });
  await new Promise<void>((resolve) => app.server.listen(0, resolve));
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  const reconnected = await TestClient.connect(address.port, token);
  const restored = await pump(reconnected, 'snapshot');
  expect(restored.self.captain).toEqual(upgraded.self.captain);
  expect(restored.self.maxHull).toBe(88);
});
