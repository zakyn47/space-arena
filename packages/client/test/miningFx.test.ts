import { describe, expect, it } from 'vitest';
import { beamGeometry, sprayVelocity, stepParticle, type Particle } from '../src/render/miningFx';

describe('beamGeometry', () => {
  it('ends the beam on the asteroid surface, not its centre', () => {
    const beam = beamGeometry({ x: 0, y: 0 }, { x: 0, y: -200, radius: 40 });
    expect(beam.endX).toBeCloseTo(0);
    expect(beam.endY).toBeGreaterThan(-200);
    expect(beam.endY).toBeLessThan(-160);
    expect(beam.length).toBeCloseTo(-beam.endY);
    expect(beam.rotation).toBeCloseTo(0);
  });

  it('points the beam along +x with a quarter turn', () => {
    const beam = beamGeometry({ x: 10, y: 10 }, { x: 110, y: 10, radius: 0 });
    expect(beam.rotation).toBeCloseTo(Math.PI / 2);
    expect(beam.length).toBeCloseTo(100);
  });

  it('never returns a negative length inside the rock', () => {
    expect(beamGeometry({ x: 0, y: 0 }, { x: 5, y: 0, radius: 40 }).length).toBe(0);
  });
});

describe('sprayVelocity', () => {
  it('sprays back toward the ship within the cone', () => {
    const towardAsteroid = 0;
    for (const roll of [0, 0.5, 0.999]) {
      const { vx, vy } = sprayVelocity(towardAsteroid, 100, () => roll);
      expect(vy).toBeGreaterThan(0);
      expect(Math.hypot(vx, vy)).toBeCloseTo(100);
    }
  });
});

describe('stepParticle', () => {
  const particle = (): Particle => ({ x: 0, y: 0, vx: 100, vy: 0, spin: 2, angle: 0, life: 0.5, maxLife: 0.5 });

  it('moves, slows, spins and ages', () => {
    const p = particle();
    stepParticle(p, 0.1);
    expect(p.x).toBeGreaterThan(5);
    expect(p.vx).toBeLessThan(100);
    expect(p.angle).toBeCloseTo(0.2);
    expect(p.life).toBeCloseTo(0.4);
  });

  it('reports death when life runs out', () => {
    expect(stepParticle(particle(), 0.6)).toBe(false);
  });
});
