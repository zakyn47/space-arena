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
};

describe('parseClientMessage', () => {
  it('accepts hello', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'hello', token: 'abc' }))).toEqual({
      type: 'hello',
      token: 'abc',
    });
  });

  it('accepts input', () => {
    expect(parseClientMessage(JSON.stringify(input))).toEqual(input);
  });

  it('accepts buy with a known line', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'buy', line: 'weapon' }))).toEqual({
      type: 'buy',
      line: 'weapon',
    });
  });

  it('rejects unknown upgrade lines', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'buy', line: 'laser' }))).toBeNull();
  });

  it('rejects extra fields', () => {
    expect(parseClientMessage(JSON.stringify({ ...input, x: 5 }))).toBeNull();
  });

  it('rejects negative or fractional seq', () => {
    expect(parseClientMessage(JSON.stringify({ ...input, seq: -1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...input, seq: 1.5 }))).toBeNull();
  });

  it('rejects invalid JSON', () => {
    expect(parseClientMessage('{nope')).toBeNull();
  });
});
