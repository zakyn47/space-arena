import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { UsernameTakenError, type PlayerRepository, type SessionInfo } from '../db/PlayerRepository';
import { hashPassword, verifyPassword } from './passwords';

const SESSION_TTL_MS = 7 * 24 * 3_600_000;

const CredentialsSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_]{3,16}$/),
  password: z.string().min(8).max(128),
});

export type AuthResult =
  | { readonly ok: true; readonly token: string }
  | { readonly ok: false; readonly status: 400 | 401 | 409; readonly error: string };

const INVALID_FORMAT: AuthResult = { ok: false, status: 400, error: 'invalid username or password format' };
const INVALID_CREDENTIALS: AuthResult = { ok: false, status: 401, error: 'invalid credentials' };
const USERNAME_TAKEN: AuthResult = { ok: false, status: 409, error: 'username taken' };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  constructor(
    private readonly repo: PlayerRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async register(input: unknown): Promise<AuthResult> {
    const parsed = CredentialsSchema.safeParse(input);
    if (!parsed.success) return INVALID_FORMAT;
    const passwordHash = await hashPassword(parsed.data.password);
    try {
      const accountId = this.repo.createAccount(parsed.data.username, passwordHash, this.now());
      return { ok: true, token: this.issueToken(accountId) };
    } catch (error) {
      if (error instanceof UsernameTakenError) return USERNAME_TAKEN;
      throw error;
    }
  }

  async login(input: unknown): Promise<AuthResult> {
    const parsed = CredentialsSchema.safeParse(input);
    if (!parsed.success) return INVALID_CREDENTIALS;
    const account = this.repo.findAccountByUsername(parsed.data.username);
    if (!account) return INVALID_CREDENTIALS;
    const valid = await verifyPassword(account.passwordHash, parsed.data.password);
    return valid ? { ok: true, token: this.issueToken(account.id) } : INVALID_CREDENTIALS;
  }

  resolveToken(token: string): SessionInfo | undefined {
    return this.repo.findSession(hashToken(token), this.now());
  }

  private issueToken(accountId: number): string {
    const token = randomBytes(32).toString('hex');
    this.repo.createSession(hashToken(token), accountId, this.now() + SESSION_TTL_MS);
    return token;
  }
}
