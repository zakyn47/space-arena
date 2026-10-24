import { describe, expect, it } from 'vitest';
import { highscoreRows } from '../src/ui/highscores';

describe('highscoreRows', () => {
  it('formats rank, pilot and kills', () => {
    expect(highscoreRows([{ rank: 1, username: 'alice', kills: 4 }])).toEqual([['#1', 'alice', '4']]);
  });

  it('is empty without entries', () => {
    expect(highscoreRows([])).toEqual([]);
  });
});
