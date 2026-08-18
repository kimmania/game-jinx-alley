import { describe, expect, it } from 'vitest';
import { generateBoard } from './board.ts';
import { dailySeed } from './rng.ts';
import { bankPreview, createRun, resolveTile } from './run.ts';
import { boardPool, topTile, zoneById, zoneJackpot, ZONES } from './zones.ts';
import { applyRunResult, newCampaign } from './campaign.ts';

const seededBoard = (zoneId: number) =>
  generateBoard({ zone: zoneById(zoneId), seed: dailySeed(`z${zoneId}-2026-08-17`), sims: 200 });

describe('board pool & top tile', () => {
  it('pool sums cash + bonus tiles once each, plus spin-tile cash bonuses', () => {
    const board = seededBoard(1);
    const cashSum = board.tiles
      .filter((t) => t.kind === 'cash')
      .reduce((s, t) => s + (t.kind === 'cash' ? t.amount : 0), 0);
    const spinCashSum = board.tiles
      .filter((t) => t.kind === 'spin')
      .reduce((s, t) => s + (t.kind === 'spin' ? (t.cash ?? 0) : 0), 0);
    expect(boardPool(board.tiles)).toBe(cashSum + spinCashSum);
    const top = Math.max(...board.tiles.map((t) => (t.kind === 'cash' ? t.amount : 0)));
    expect(topTile(board.tiles)).toBe(top);
    expect(boardPool(board.tiles)).toBeGreaterThan(0);
  });
});

describe('spin tiles with cash bonuses', () => {
  it('about half of spin tiles carry cash; cash lands in half the zone band', () => {
    const zone = zoneById(1);
    let withCash = 0;
    let total = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const board = generateBoard({ zone, seed, sims: 50 });
      for (const t of board.tiles) {
        if (t.kind !== 'spin') continue;
        total += 1;
        if (t.cash !== undefined) {
          withCash += 1;
          expect(t.cash).toBeGreaterThanOrEqual(zone.cashMin / 2 - 25);
          expect(t.cash).toBeLessThanOrEqual(zone.cashMax / 2 + 25);
          expect(t.cash % 25).toBe(0);
        }
      }
    }
    expect(total).toBeGreaterThan(0);
    // 60 boards × 2 spin tiles: expect a healthy share to carry cash
    expect(withCash / total).toBeGreaterThan(0.25);
    expect(withCash / total).toBeLessThan(0.75);
  });

  it('landing on a cash-carrying spin tile refunds spins AND pays the cash', () => {
    const zone = zoneById(1);
    // Scan seeds for a board whose spin tile carries cash (most seeds qualify).
    let board: ReturnType<typeof generateBoard> | null = null;
    let idx = -1;
    for (let seed = 1; seed <= 200 && board === null; seed++) {
      const b = generateBoard({ zone, seed, sims: 50 });
      const i = b.tiles.findIndex((t) => t.kind === 'spin' && t.cash !== undefined);
      if (i >= 0) { board = b; idx = i; }
    }
    if (board === null) throw new Error('no cash-carrying spin board found in 200 seeds');
    const run = createRun(board, zone);
    run.spinsLeft = 1;
    const tile = board.tiles[idx];
    if (tile.kind !== 'spin') throw new Error('unreachable');
    const ev = resolveTile(run, idx);
    expect(ev.type).toBe('spin');
    expect(run.spinsLeft).toBe(tile.amount); // 1 spent, +amount gained
    expect(run.cash).toBe(tile.cash);
    expect(run.peakCash).toBe(tile.cash);
  });
});

describe('zone jackpot', () => {
  it('exceeds the zone target for every zone', () => {
    for (const z of ZONES) {
      expect(zoneJackpot(z, { gild: 0, spinWells: 0, prizeRow: 0 })).toBeGreaterThan(z.target);
    }
  });
  it('grows with gild level', () => {
    const z = zoneById(2);
    const base = zoneJackpot(z, { gild: 0, spinWells: 0, prizeRow: 0 });
    const gilded = zoneJackpot(z, { gild: 4, spinWells: 0, prizeRow: 0 });
    expect(gilded).toBeGreaterThan(base);
  });
});

describe('bankPreview', () => {
  it('raw total on daily boards (target 0)', () => {
    expect(bankPreview(500, 0, 0)).toBe(500);
    expect(bankPreview(500, 2, 0)).toBe(500);
  });
  it('adds clean +10% and excess ×1.5 on campaign zones', () => {
    // 1000 clean, target 2500 → 1100, below target
    expect(bankPreview(1000, 0, 2500)).toBe(1100);
    // dirty run: no clean bonus
    expect(bankPreview(1000, 1, 2500)).toBe(1000);
    // 3000 clean → 3300; excess 800 ×1.5 = 1200 → 2500 + 1200 = 3700
    expect(bankPreview(3000, 0, 2500)).toBe(3700);
  });
});

describe('peakCash', () => {
  it('tracks the highest run total even after a jinx wipe', () => {
    const board = seededBoard(1);
    const run = createRun(board, zoneById(1));
    const cashIdx = board.tiles.findIndex((t) => t.kind === 'cash');
    run.spinsLeft = 10; // override for the test
    resolveTile(run, cashIdx);
    const afterCash = run.cash;
    expect(run.peakCash).toBe(afterCash);
    const jinxIdx = board.tiles.findIndex((t) => t.kind === 'jinx');
    resolveTile(run, jinxIdx);
    expect(run.cash).toBe(0);
    expect(run.peakCash).toBe(afterCash);
  });
});

describe('bestRunPayout', () => {
  it('tracks the best single-run payout per zone', () => {
    const c = newCampaign();
    const board = seededBoard(1);
    const run = createRun(board, zoneById(1));
    run.cash = 3000;
    run.over = true;
    run.endReason = 'banked';
    const r1 = applyRunResult(c, run);
    expect(c.bestRunPayout[1]).toBe(r1.payout);
    const run2 = createRun(board, zoneById(1));
    run2.cash = 500;
    run2.over = true;
    run2.endReason = 'banked';
    applyRunResult(c, run2);
    expect(c.bestRunPayout[1]).toBe(r1.payout); // unchanged — smaller run
  });
});
