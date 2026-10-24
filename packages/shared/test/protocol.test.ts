import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/protocol';

const input = {
  type: 'input',
  seq: 7,
  thrust: true,
  reverse: false,
  left: false,
  right: true,
  fire: false,
  shield: false,
  rocket: true,
  mine: false,
};

const parse = (value: unknown) => parseClientMessage(JSON.stringify(value));

describe('parseClientMessage', () => {
  it('accepts hello, input and dock', () => {
    expect(parse({ type: 'hello', token: 'abc' })).toEqual({ type: 'hello', token: 'abc' });
    expect(parse(input)).toEqual(input);
    expect(parse({ type: 'dock' })).toEqual({ type: 'dock' });
  });

  it('accepts shop actions with catalog ids', () => {
    expect(parse({ type: 'buyHull', hullId: 'fighter' })).not.toBeNull();
    expect(parse({ type: 'buyGear', gearId: 'armor', mk: 2, slot: { type: 'utility', index: 0 } })).not.toBeNull();
    expect(parse({ type: 'sellGear', slot: { type: 'weapon', index: 1 } })).not.toBeNull();
    expect(parse({ type: 'buyRockets', count: 5 })).not.toBeNull();
  });

  it('accepts salvage actions and the mine flag', () => {
    expect(parse({ ...input, mine: true })).not.toBeNull();
    expect(parse({ type: 'installSalvage', index: 2, slot: { type: 'utility', index: 0 } })).not.toBeNull();
    expect(parse({ type: 'sellSalvage', index: 0 })).not.toBeNull();
    expect(parse({ type: 'sellSalvage', index: 3 })).toBeNull();
  });

  it('rejects unknown ids, bad mk, bad counts and removed messages', () => {
    expect(parse({ type: 'buyHull', hullId: 'battleship' })).toBeNull();
    expect(parse({ type: 'buyGear', gearId: 'armor', mk: 4, slot: { type: 'utility', index: 0 } })).toBeNull();
    expect(parse({ type: 'sellGear', slot: { type: 'cockpit', index: 0 } })).toBeNull();
    expect(parse({ type: 'buyRockets', count: 0 })).toBeNull();
    expect(parse({ type: 'buyRockets', count: 21 })).toBeNull();
    expect(parse({ type: 'buy', line: 'weapon' })).toBeNull();
  });

  it('rejects input without the rocket flag or with extra fields', () => {
    const withoutRocket = {
      type: 'input',
      seq: 7,
      thrust: true,
      reverse: false,
      left: false,
      right: true,
      fire: false,
      shield: false,
      mine: false,
    };
    expect(parse(withoutRocket)).toBeNull();
    expect(parse({ ...input, x: 5 })).toBeNull();
  });

  it('rejects invalid JSON', () => {
    expect(parseClientMessage('{nope')).toBeNull();
  });
});


it('accepts only catalog skills and rejects client-supplied captain XP or ranks', () => {
  expect(parse({ type: 'trainCaptain', skill: 'gunnery' })).toEqual({ type: 'trainCaptain', skill: 'gunnery' });
  expect(parse({ type: 'trainCaptain', skill: 'admin' })).toBeNull();
  expect(parse({ type: 'trainCaptain', skill: 'gunnery', rank: 10 })).toBeNull();
  expect(parse({ type: 'trainCaptain', skill: 'gunnery', xp: 10000 })).toBeNull();
});
