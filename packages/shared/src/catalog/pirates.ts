export const PIRATE_TIERS = ['raider', 'marauder', 'warlord'] as const;

export type PirateTier = (typeof PIRATE_TIERS)[number];

export const PIRATE_NAMES: Readonly<Record<PirateTier, string>> = {
  raider: 'Raider',
  marauder: 'Marauder',
  warlord: 'Warlord',
};
