import { describe, expect, it } from 'vitest';
import { dailyBoard, dailyScore, dailyShareText, DAILY_ZONE } from './daily.ts';
import { dailySeed } from './rng.ts';
import { bankRun, createRun, resolveTile } from './run.ts';

describe('daily board', () => {
  it('is deterministic for a date', () => {
    const a = dailyBoard('2026-08-02');
    const b = dailyBoard('2026-08-02');
    expect(a.seed).toBe(dailySeed('2026-08-02'));
    expect(a.tiles).toEqual(b.tiles);
    expect(a.tiles).toHaveLength(18);
  });

  it('differs between dates', () => {
    expect(dailyBoard('2026-08-02').tiles).not.toEqual(dailyBoard('2026-08-03').tiles);
  });

  it('starts runs with 5 fixed spins and no consumables', () => {
    const run = createRun(dailyBoard('2026-08-02'), DAILY_ZONE);
    expect(run.spinsLeft).toBe(5);
    expect(run.insuranceAvailable).toBe(false);
    expect(run.anchorAvailable).toBe(false);
  });

  it('scores the banked amount; bust scores 0', () => {
    const run = createRun(dailyBoard('2026-08-02'), DAILY_ZONE);
    run.cash = 1234;
    bankRun(run);
    expect(dailyScore(run)).toBe(1234);
    const bust = createRun(dailyBoard('2026-08-02'), DAILY_ZONE);
    for (let i = 0; i < 4; i++) resolveTile(bust, bust.board.tiles.findIndex((t) => t.kind === 'jinx'));
    expect(bust.endReason).toBe('jinxes');
    expect(dailyScore(bust)).toBe(0);
  });

  it('share text includes date, score and URL', () => {
    const t = dailyShareText('2026-08-02', 1500, 2000);
    expect(t).toContain('2026-08-02');
    expect(t).toContain('$1,500');
    expect(t).toContain('kimmania.github.io/game-jinx-alley');
  });
});
