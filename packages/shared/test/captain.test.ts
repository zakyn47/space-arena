import { describe, expect, it } from 'vitest';
import {
  NEW_CAPTAIN, MAX_CAPTAIN_LEVEL, STARTER_BUILD, captainLevel, captainPoints,
  captainNeedsTraining, experienceForLevel, gainExperience, parseCaptain, statsFor, trainCaptain,
} from '../src/index';

describe('captains', () => {
  it('starts with three points and derives every earned point across multiple levels', () => {
    expect(captainLevel(NEW_CAPTAIN)).toBe(1);
    expect(captainPoints(NEW_CAPTAIN)).toBe(3);
    expect(captainNeedsTraining(NEW_CAPTAIN)).toBe(true);
    const captain = gainExperience(NEW_CAPTAIN, 600);
    expect(captainLevel(captain)).toBe(4);
    expect(captainPoints(captain)).toBe(6);
    expect(captainLevel(gainExperience(captain, 1_000_000))).toBe(MAX_CAPTAIN_LEVEL);
    expect(gainExperience(captain, 1_000_000).xp).toBe(experienceForLevel(MAX_CAPTAIN_LEVEL));
  });

  it('spends points exactly once and enforces point budgets and rank limits', () => {
    let captain = NEW_CAPTAIN;
    for (let i = 0; i < 3; i++) {
      const next = trainCaptain(captain, 'piloting');
      if (!next) throw new Error('training failed');
      captain = next;
    }
    expect(captainPoints(captain)).toBe(0);
    expect(captainNeedsTraining(captain)).toBe(false);
    expect(trainCaptain(captain, 'gunnery')).toBeNull();
    const maxed = { ...captain, xp: 19_000, skills: { ...captain.skills, piloting: 10 } };
    expect(trainCaptain(maxed, 'piloting')).toBeNull();
  });

  it('rejects corrupt, excessive, fractional and over-budget stored profiles', () => {
    expect(parseCaptain(NEW_CAPTAIN)).toEqual(NEW_CAPTAIN);
    for (const xp of [-1, 0.5, 19_001, '100']) expect(parseCaptain({ ...NEW_CAPTAIN, xp })).toBeNull();
    expect(parseCaptain({ ...NEW_CAPTAIN, skills: { ...NEW_CAPTAIN.skills, gunnery: 4 } })).toBeNull();
    expect(parseCaptain({ ...NEW_CAPTAIN, skills: { ...NEW_CAPTAIN.skills, gunnery: -1 } })).toBeNull();
    expect(parseCaptain({ ...NEW_CAPTAIN, skills: { ...NEW_CAPTAIN.skills, gunnery: 0.5 } })).toBeNull();
    expect(parseCaptain({ ...NEW_CAPTAIN, xp: 19_000, skills: { ...NEW_CAPTAIN.skills, gunnery: 11 } })).toBeNull();
    expect(parseCaptain({ xp: 0, skills: {} })).toBeNull();
  });

  it('applies shared skill bonuses after equipment without granting missing equipment', () => {
    const captain = { xp: 600, skills: { gunnery: 1, engineering: 1, piloting: 1, mining: 1 } };
    const stats = statsFor(STARTER_BUILD, captain);
    expect(stats.maxHull).toBe(84);
    expect(stats.maxShield).toBe(105);
    expect(stats.weapons[0]?.damage).toBeCloseTo(10.5);
    expect(stats.maxSpeed).toBeCloseTo(460 * 1.03);
    expect(stats.thrust).toBeCloseTo(240 * 1.03);
    expect(stats.miningRate).toBeCloseTo(1.1);
    expect(stats.cargoCapacity).toBe(15);
    const empty = { ...STARTER_BUILD, slots: { weapon: [null], shield: [null], engine: [null], utility: [null] } };
    const bare = statsFor(empty, captain);
    expect(bare.weapons).toEqual([]);
    expect(bare.maxShield).toBe(0);
    expect(bare.miningRate).toBe(0);
  });
});
