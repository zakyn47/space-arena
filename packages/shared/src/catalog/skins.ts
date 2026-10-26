export const SKIN_IDS = ['standard', 'chrome', 'stealth'] as const;

export type SkinId = (typeof SKIN_IDS)[number];

export type PrestigeSkinId = Exclude<SkinId, 'standard'>;

export const SKIN_UNLOCK_KILLS: Readonly<Record<SkinId, number>> = {
  standard: 0,
  chrome: 100,
  stealth: 1_000,
};

export const SKIN_NAMES: Readonly<Record<SkinId, string>> = {
  standard: 'Standard',
  chrome: 'Chrome Prism',
  stealth: 'Stealth Elite',
};

export function skinUnlocked(skin: SkinId, pvpKills: number): boolean {
  return pvpKills >= SKIN_UNLOCK_KILLS[skin];
}
