import type { Burst, ParticleStyle } from './Particles';

const SPARK: ParticleStyle = { spriteId: 'impact_spark', speed: [90, 220], life: [0.15, 0.35], spin: 0, additive: true, grows: false };
const CHIP: ParticleStyle = { spriteId: 'mining_debris', speed: [30, 90], life: [0.5, 0.9], spin: 8, additive: false, grows: false };
const DUST: ParticleStyle = { spriteId: 'rock_dust', speed: [10, 35], life: [0.6, 1], spin: 1, additive: false, grows: true };

export function rockImpactBursts(x: number, y: number, outward: number): Burst[] {
  return [
    { style: SPARK, x, y, direction: outward, count: 6 },
    { style: CHIP, x, y, direction: outward, count: 3 },
    { style: DUST, x, y, direction: outward, count: 2 },
  ];
}
