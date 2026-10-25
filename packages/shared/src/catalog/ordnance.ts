import { ROCKET_PRICE } from '../constants';

export const ORDNANCE_TYPES = ['rockets', 'mines', 'plasma'] as const;

export type Ordnance = (typeof ORDNANCE_TYPES)[number];

export const MINE_PRICE = 40;
export const PLASMA_PRICE = 35;

export const ORDNANCE_PRICE: Readonly<Record<Ordnance, number>> = {
  rockets: ROCKET_PRICE,
  mines: MINE_PRICE,
  plasma: PLASMA_PRICE,
};

export const ORDNANCE_NAMES: Readonly<Record<Ordnance, string>> = {
  rockets: 'Rockets',
  mines: 'Mines',
  plasma: 'Plasma',
};
