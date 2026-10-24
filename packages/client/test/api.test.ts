import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticate, fetchHighscores } from '../src/api';

function stubFetch(status: number, body: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

afterEach(() => vi.unstubAllGlobals());

describe('authenticate', () => {
  it('returns the token on success', async () => {
    stubFetch(200, { token: 'abc' });
    expect(await authenticate('login', 'alice', 'password1')).toEqual({ ok: true, token: 'abc' });
  });

  it('returns the server error message', async () => {
    stubFetch(409, { error: 'username taken' });
    expect(await authenticate('register', 'alice', 'password1')).toEqual({ ok: false, error: 'username taken' });
  });

  it('falls back to the status code', async () => {
    stubFetch(500, 'oops');
    expect(await authenticate('login', 'alice', 'password1')).toEqual({ ok: false, error: 'request failed (500)' });
  });

  it('posts to the mode route', async () => {
    stubFetch(200, { token: 'abc' });
    await authenticate('register', 'alice', 'password1');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/register');
  });
});

describe('fetchHighscores', () => {
  it('returns the ranked list', async () => {
    stubFetch(200, { highscores: [{ rank: 1, username: 'alice', kills: 4 }] });
    expect(await fetchHighscores()).toEqual([{ rank: 1, username: 'alice', kills: 4 }]);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/highscores');
  });

  it('returns null for a failed or malformed response', async () => {
    stubFetch(500, { error: 'boom' });
    expect(await fetchHighscores()).toBeNull();
    stubFetch(200, { highscores: [{ rank: 'one' }] });
    expect(await fetchHighscores()).toBeNull();
  });
});
