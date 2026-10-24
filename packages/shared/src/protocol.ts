import { z } from 'zod';
import { UPGRADE_LINES, type Loadout, type UpgradeLine } from './upgrades';
import type { SafeZone } from './world';

const HelloSchema = z.object({ type: z.literal('hello'), token: z.string().min(1).max(128) }).strict();

const InputSchema = z
  .object({
    type: z.literal('input'),
    seq: z.number().int().nonnegative(),
    thrust: z.boolean(),
    reverse: z.boolean(),
    left: z.boolean(),
    right: z.boolean(),
    fire: z.boolean(),
    shield: z.boolean(),
  })
  .strict();

const BuySchema = z.object({ type: z.literal('buy'), line: z.enum(UPGRADE_LINES) }).strict();

const ClientMessageSchema = z.discriminatedUnion('type', [HelloSchema, InputSchema, BuySchema]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type InputMessage = z.infer<typeof InputSchema>;

export function parseClientMessage(raw: string): ClientMessage | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = ClientMessageSchema.safeParse(json);
  return result.success ? result.data : null;
}

export interface ShipState {
  readonly kind: 'ship';
  readonly id: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly shieldUp: boolean;
  readonly hullTier: number;
}

export interface BulletState {
  readonly kind: 'bullet';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly tier: number;
}

export interface AsteroidState {
  readonly kind: 'asteroid';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly variant: number;
}

export interface OreState {
  readonly kind: 'ore';
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export interface CrateState {
  readonly kind: 'crate';
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export type EntityState = ShipState | BulletState | AsteroidState | OreState | CrateState;

export interface SelfState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly hull: number;
  readonly maxHull: number;
  readonly shieldEnergy: number;
  readonly maxShield: number;
  readonly shieldUp: boolean;
  readonly ore: number;
  readonly cargoCapacity: number;
  readonly carriedCredits: number;
  readonly bankedCredits: number;
  readonly loadout: Loadout;
  readonly docked: boolean;
}

export interface WelcomeMessage {
  readonly type: 'welcome';
  readonly shipId: number;
  readonly worldSize: number;
  readonly safeZones: readonly SafeZone[];
}

export interface SnapshotMessage {
  readonly type: 'snapshot';
  readonly tick: number;
  readonly lastSeq: number;
  readonly self: SelfState;
  readonly entities: readonly EntityState[];
}

export interface DiedMessage {
  readonly type: 'died';
  readonly killer: string | null;
}

export type BuyFailure = 'not_docked' | 'max_tier' | 'insufficient_credits';

export type BuyResultMessage =
  | { readonly type: 'buyResult'; readonly line: UpgradeLine; readonly ok: true }
  | { readonly type: 'buyResult'; readonly line: UpgradeLine; readonly ok: false; readonly reason: BuyFailure };

export interface KickedMessage {
  readonly type: 'kicked';
  readonly reason: string;
}

export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | DiedMessage
  | BuyResultMessage
  | KickedMessage;
