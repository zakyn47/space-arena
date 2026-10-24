import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { AuthService } from './auth/AuthService';
import { RateLimiter } from './auth/RateLimiter';
import { PlayerRepository } from './db/PlayerRepository';
import { GameLoop } from './GameLoop';
import { createHttpServer } from './http/HttpServer';
import { Gateway } from './net/Gateway';
import { toShipRecord } from './world/entities';
import { World } from './world/World';

const AUTH_BURST = 10;
const AUTH_REFILL_PER_MS = 1 / 6_000;
const MAX_WS_PAYLOAD = 4_096;

export interface AppConfig {
  readonly dbPath: string;
  readonly staticDir: string;
  readonly asteroidTarget?: number;
  readonly pirates?: boolean;
}

export interface App {
  readonly server: Server;
  readonly world: World;
  readonly loop: GameLoop;
  saveAll(): void;
  close(): Promise<void>;
}

export function createApp(config: AppConfig): App {
  const repo = PlayerRepository.open(config.dbPath);
  const auth = new AuthService(repo);
  const world = new World({ asteroidTarget: config.asteroidTarget, pirates: config.pirates ?? true });
  const server = createHttpServer({
    auth,
    limiter: new RateLimiter(AUTH_BURST, AUTH_REFILL_PER_MS),
    staticDir: config.staticDir,
    now: Date.now,
  });
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_WS_PAYLOAD });
  const gateway = new Gateway({ world, auth, repo, now: Date.now });
  gateway.attach(wss);
  const loop = new GameLoop(world, gateway, repo);
  return {
    server,
    world,
    loop,
    saveAll: () => repo.saveShips(world.playerShips().map(toShipRecord), Date.now()),
    close: async () => {
      const closed = [...wss.clients].map((client) => new Promise<void>((resolve) => client.once('close', () => resolve())));
      for (const client of wss.clients) client.terminate();
      await Promise.all(closed);
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      repo.close();
    },
  };
}
