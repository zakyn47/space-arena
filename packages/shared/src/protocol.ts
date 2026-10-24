import { z } from 'zod';
import { MkSchema, type Build, type InstalledGear } from './build';
import { GEAR_IDS, type GearId, type Mk } from './catalog/gear';
import { HULL_IDS, SLOT_TYPES, type HullId } from './catalog/hulls';
import type { PirateTier } from './catalog/pirates';
import { MAX_ROCKETS_PER_PURCHASE, SALVAGE_CAPACITY } from './constants';
import type { SafeZone } from './world';

const SlotRefSchema = z.object({ type: z.enum(SLOT_TYPES), index: z.number().int().nonnegative().max(8) }).strict();

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
    rocket: z.boolean(),
    mine: z.boolean(),
  })
  .strict();

const DockSchema = z.object({ type: z.literal('dock') }).strict();

const BuyHullSchema = z.object({ type: z.literal('buyHull'), hullId: z.enum(HULL_IDS) }).strict();

const BuyGearSchema = z
  .object({ type: z.literal('buyGear'), gearId: z.enum(GEAR_IDS), mk: MkSchema, slot: SlotRefSchema })
  .strict();

const SellGearSchema = z.object({ type: z.literal('sellGear'), slot: SlotRefSchema }).strict();

const BuyRocketsSchema = z
  .object({ type: z.literal('buyRockets'), count: z.number().int().min(1).max(MAX_ROCKETS_PER_PURCHASE) })
  .strict();

const SalvageIndexSchema = z.number().int().min(0).max(SALVAGE_CAPACITY - 1);

const InstallSalvageSchema = z
  .object({ type: z.literal('installSalvage'), index: SalvageIndexSchema, slot: SlotRefSchema })
  .strict();

const SellSalvageSchema = z.object({ type: z.literal('sellSalvage'), index: SalvageIndexSchema }).strict();

const ClientMessageSchema = z.discriminatedUnion('type', [
  HelloSchema,
  InputSchema,
  DockSchema,
  BuyHullSchema,
  BuyGearSchema,
  SellGearSchema,
  BuyRocketsSchema,
  InstallSalvageSchema,
  SellSalvageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type InputMessage = z.infer<typeof InputSchema>;
export type ShopAction = Extract<ClientMessage, { type: 'buyHull' | 'buyGear' | 'sellGear' | 'buyRockets' | 'installSalvage' | 'sellSalvage' }>;

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
  readonly hullId: HullId;
  readonly npc: PirateTier | null;
  readonly miningTargetId: number | null;
}

export interface BulletState {
  readonly kind: 'bullet';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly weaponId: GearId;
  readonly mk: Mk;
}

export interface RocketState {
  readonly kind: 'rocket';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
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
  readonly hasGear: boolean;
}

export type EntityState = ShipState | BulletState | RocketState | AsteroidState | OreState | CrateState;

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
  readonly build: Build;
  readonly rockets: number;
  readonly maxRockets: number;
  readonly docked: boolean;
  readonly canDock: boolean;
  readonly dockCooldown: number;
  readonly salvage: readonly InstalledGear[];
  readonly miningTargetId: number | null;
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

export type ShopFailure = 'not_docked' | 'insufficient_credits' | 'slot_mismatch' | 'rocket_cap' | 'unknown_item';

export type ShopResultMessage =
  | { readonly type: 'shopResult'; readonly ok: true }
  | { readonly type: 'shopResult'; readonly ok: false; readonly reason: ShopFailure };

export interface KickedMessage {
  readonly type: 'kicked';
  readonly reason: string;
}

export type ServerMessage = WelcomeMessage | SnapshotMessage | DiedMessage | ShopResultMessage | KickedMessage;
