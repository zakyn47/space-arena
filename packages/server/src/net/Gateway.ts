import {
  MAX_INPUTS_PER_SECOND,
  SAFE_ZONES,
  RADAR_EVERY_SNAPSHOTS,
  VIEW_RADIUS,
  WORLD_SIZE,
  parseClientMessage,
  type HitEvent,
  type InputMessage,
  type ServerMessage,
  type ShopAction,
} from '@arena/shared';
import type { RawData, WebSocket, WebSocketServer } from 'ws';
import type { AuthService } from '../auth/AuthService';
import type { PlayerRepository, SessionInfo } from '../db/PlayerRepository';
import type { LoopOutput } from '../GameLoop';
import { dockForCaptainSetup } from '../world/Docking';
import { toShipRecord } from '../world/entities';
import type { DeathEvent, World } from '../world/World';
import { buildRadar } from './radar';
import { buildSnapshot } from './snapshot';

const HELLO_TIMEOUT_MS = 5_000;
const RATE_WINDOW_MS = 1_000;
const POLICY_VIOLATION = 1008;

interface Session {
  readonly socket: WebSocket;
  readonly accountId: number;
  readonly shipId: number;
  windowStart: number;
  inputsInWindow: number;
}

export interface GatewayDeps {
  readonly world: World;
  readonly auth: AuthService;
  readonly repo: PlayerRepository;
  readonly now: () => number;
}

function rawToString(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

export class Gateway implements LoopOutput {
  private readonly sessions = new Map<number, Session>();
  private broadcasts = 0;

  constructor(private readonly deps: GatewayDeps) {}

  attach(wss: WebSocketServer): void {
    wss.on('connection', (socket) => this.awaitHello(socket));
  }

  broadcastSnapshots(hits: readonly HitEvent[]): void {
    const { world } = this.deps;
    const radarShips = this.broadcasts % RADAR_EVERY_SNAPSHOTS === 0 ? [...world.playerShips(), ...world.npcShips()] : null;
    this.broadcasts += 1;
    for (const session of this.sessions.values()) {
      const ship = world.shipById(session.shipId);
      if (!ship) continue;
      const nearby = world.entitiesNear(ship.x, ship.y, VIEW_RADIUS);
      const radar = radarShips ? buildRadar(ship, radarShips, world.boosterList()) : undefined;
      send(session.socket, buildSnapshot(ship, nearby, world.tickCount, world.time, radar, hits));
    }
  }

  notifyDeaths(events: readonly DeathEvent[]): void {
    for (const { ship, killerName } of events) {
      const session = this.sessions.get(ship.accountId);
      if (session) send(session.socket, { type: 'died', killer: killerName });
    }
  }

  private awaitHello(socket: WebSocket): void {
    socket.on('error', () => socket.terminate());
    const timer = setTimeout(() => socket.close(POLICY_VIOLATION, 'hello timeout'), HELLO_TIMEOUT_MS);
    socket.once('message', (data) => {
      clearTimeout(timer);
      const message = parseClientMessage(rawToString(data));
      const info = message?.type === 'hello' ? this.deps.auth.resolveToken(message.token) : undefined;
      if (!info) {
        send(socket, { type: 'kicked', reason: 'unauthorized' });
        socket.close(POLICY_VIOLATION, 'unauthorized');
        return;
      }
      this.startSession(socket, info);
    });
  }

  private startSession(socket: WebSocket, info: SessionInfo): void {
    const { world, repo } = this.deps;
    const ship =
      world.shipByAccount(info.accountId) ?? world.addShip(info.accountId, info.username, repo.loadShip(info.accountId));
    dockForCaptainSetup(ship);
    world.reconnect(ship.id);
    const session: Session = {
      socket,
      accountId: info.accountId,
      shipId: ship.id,
      windowStart: this.deps.now(),
      inputsInWindow: 0,
    };
    const previous = this.sessions.get(info.accountId);
    this.sessions.set(info.accountId, session);
    if (previous) {
      send(previous.socket, { type: 'kicked', reason: 'logged in elsewhere' });
      previous.socket.close();
    }
    send(socket, { type: 'welcome', shipId: ship.id, worldSize: WORLD_SIZE, safeZones: SAFE_ZONES });
    socket.on('message', (data) => this.onMessage(session, data));
    socket.on('close', () => this.onClose(session));
  }

  private onMessage(session: Session, data: RawData): void {
    const message = parseClientMessage(rawToString(data));
    if (!message || message.type === 'hello') {
      session.socket.close(POLICY_VIOLATION, 'invalid message');
      return;
    }
    if (message.type === 'input') {
      this.onInput(session, message);
      return;
    }
    if (message.type === 'dock') {
      this.onDock(session);
      return;
    }
    this.onShop(session, message);
  }

  private onDock(session: Session): void {
    if (this.deps.world.dock(session.shipId).ok) this.saveShip(session);
  }

  private onShop(session: Session, action: ShopAction): void {
    const outcome = this.deps.world.shop(session.shipId, action);
    if (outcome.ok) this.saveShip(session);
    send(
      session.socket,
      outcome.ok ? { type: 'shopResult', ok: true } : { type: 'shopResult', ok: false, reason: outcome.reason },
    );
  }

  private saveShip(session: Session): void {
    const ship = this.deps.world.shipById(session.shipId);
    if (ship) this.deps.repo.saveShips([toShipRecord(ship)], this.deps.now());
  }

  private onInput(session: Session, message: InputMessage): void {
    const now = this.deps.now();
    if (now - session.windowStart >= RATE_WINDOW_MS) {
      session.windowStart = now;
      session.inputsInWindow = 0;
    }
    session.inputsInWindow += 1;
    if (session.inputsInWindow > MAX_INPUTS_PER_SECOND) return;
    const { seq, thrust, reverse, left, right, fire, shield, rocket, mine } = message;
    this.deps.world.setInput(session.shipId, seq, { thrust, reverse, left, right, fire, shield, rocket, mine });
  }

  private onClose(session: Session): void {
    if (this.sessions.get(session.accountId) !== session) return;
    this.sessions.delete(session.accountId);
    const removed = this.deps.world.disconnect(session.shipId);
    if (removed) this.deps.repo.saveShips([toShipRecord(removed)], this.deps.now());
  }
}
