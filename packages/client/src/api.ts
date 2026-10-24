import { z } from 'zod';

const ResponseSchema = z.object({ token: z.string().optional(), error: z.string().optional() });

export type AuthMode = 'login' | 'register';

export type AuthResponse =
  | { readonly ok: true; readonly token: string }
  | { readonly ok: false; readonly error: string };

export async function authenticate(mode: AuthMode, username: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`/api/${mode}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body: unknown = await response.json().catch(() => null);
  const parsed = ResponseSchema.safeParse(body);
  const data: z.infer<typeof ResponseSchema> = parsed.success ? parsed.data : {};
  if (response.ok && data.token) return { ok: true, token: data.token };
  return { ok: false, error: data.error ?? `request failed (${response.status})` };
}
