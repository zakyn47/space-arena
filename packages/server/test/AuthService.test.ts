import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth/AuthService';
import { PlayerRepository } from '../src/db/PlayerRepository';

let repo: PlayerRepository;
let now = 0;
let auth: AuthService;

beforeEach(() => {
  repo = PlayerRepository.open(':memory:');
  now = 1_000;
  auth = new AuthService(repo, () => now);
});

afterEach(() => repo.close());

describe('AuthService', () => {
  it('registers and resolves the issued token', async () => {
    const result = await auth.register({ username: 'alice', password: 'password1' });
    if (!result.ok) throw new Error(result.error);
    expect(auth.resolveToken(result.token)?.username).toBe('alice');
  });

  it('accepts any non-empty password', async () => {
    expect((await auth.register({ username: 'alice', password: '1' })).ok).toBe(true);
    expect((await auth.login({ username: 'alice', password: '1' })).ok).toBe(true);
  });

  it('rejects bad formats with 400', async () => {
    expect(await auth.register({ username: 'a', password: 'password1' })).toMatchObject({ ok: false, status: 400 });
    expect(await auth.register({ username: 'alice', password: '' })).toMatchObject({ ok: false, status: 400 });
    expect(await auth.register({ username: 'bad name!', password: 'password1' })).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects duplicates with 409', async () => {
    await auth.register({ username: 'alice', password: 'password1' });
    expect(await auth.register({ username: 'alice', password: 'password2' })).toMatchObject({ ok: false, status: 409 });
  });

  it('logs in with the right password only', async () => {
    await auth.register({ username: 'alice', password: 'password1' });
    expect((await auth.login({ username: 'alice', password: 'password1' })).ok).toBe(true);
    expect(await auth.login({ username: 'alice', password: 'wrongpass' })).toMatchObject({ ok: false, status: 401 });
    expect(await auth.login({ username: 'bob', password: 'password1' })).toMatchObject({ ok: false, status: 401 });
  });

  it('expires tokens after 7 days', async () => {
    const result = await auth.register({ username: 'alice', password: 'password1' });
    if (!result.ok) throw new Error(result.error);
    now += 7 * 24 * 3_600_000;
    expect(auth.resolveToken(result.token)).toBeUndefined();
  });
});
