import { ROCKET_PRICE } from '../constants';

export const ORDNANCE_TYPES = ['rockets', 'mines'] as const;

export type Ordnance = (typeof ORDNANCE_TYPES)[number];

export const MINE_PRICE = 40;

export const ORDNANCE_PRICE: Readonly<Record<Ordnance, number>> = {
  rockets: ROCKET_PRICE,
  mines: MINE_PRICE,
};

export const ORDNANCE_NAMES: Readonly<Record<Ordnance, string>> = {
  rockets: 'Rockets',
  mines: 'Mines',
};
