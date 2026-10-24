import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import type { AuthResult, AuthService } from '../auth/AuthService';
import type { RateLimiter } from '../auth/RateLimiter';

const MAX_BODY_BYTES = 4_096;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

type AuthAction = (auth: AuthService, body: unknown) => Promise<AuthResult>;

const AUTH_ROUTES: Readonly<Record<string, AuthAction>> = {
  '/api/register': (auth, body) => auth.register(body),
  '/api/login': (auth, body) => auth.login(body),
};

export interface HttpDeps {
  readonly auth: AuthService;
  readonly limiter: RateLimiter;
  readonly staticDir: string;
  readonly now: () => number;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return undefined;
    chunks.push(buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed;
  } catch {
    return undefined;
  }
}

async function handleAuth(deps: HttpDeps, req: IncomingMessage, res: ServerResponse, action: AuthAction): Promise<void> {
  if (!deps.limiter.tryConsume(req.socket.remoteAddress ?? 'unknown', deps.now())) {
    return sendJson(res, 429, { error: 'too many requests' });
  }
  const body = await readJson(req);
  if (body === undefined) return sendJson(res, 400, { error: 'invalid body' });
  const result = await action(deps.auth, body);
  if (result.ok) return sendJson(res, 200, { token: result.token });
  sendJson(res, result.status, { error: result.error });
}

async function serveStatic(root: string, pathname: string, res: ServerResponse): Promise<void> {
  try {
    const relative = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
    const filePath = resolve(root, `.${relative}`);
    if (!filePath.startsWith(root + sep)) return sendJson(res, 404, { error: 'not found' });
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'not found' });
  }
}

async function handle(deps: HttpDeps, root: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const action = AUTH_ROUTES[url.pathname];
  if (req.method === 'POST' && action) return handleAuth(deps, req, res, action);
  if (req.method === 'GET') return serveStatic(root, url.pathname, res);
  sendJson(res, 404, { error: 'not found' });
}

export function createHttpServer(deps: HttpDeps): Server {
  const root = resolve(deps.staticDir);
  return createServer((req, res) => {
    handle(deps, root, req, res).catch(() => sendJson(res, 500, { error: 'internal error' }));
  });
}
