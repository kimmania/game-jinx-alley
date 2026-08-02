import { describe, expect, it } from 'vitest';
import { generateBoard, NO_UPGRADES } from '../src/engine/board.ts';
import { bustProbability, validateBoard } from '../src/engine/validator.ts';
import { mulberry32 } from '../src/engine/rng.ts';
import { BOARD_SIZE, gildCashMultiplier, prizeRowBonus, ZONES } from '../src/engine/zones.ts';
import type { Tile } from '../src/engine/run.ts';

const counts = (tiles: Tile[]) => ({
  jinx: tiles.filter((t) => t.kind === 'jinx').length,
  spin: tiles.filter((t) => t.kind === 'spin').length,
  bonus: tiles.filter((t) => t.kind === 'bonus').length,
  cash: tiles.filter((t) => t.kind === 'cash').length,
});

describe('board generator', () => {
  it('deals exactly 18 tiles with zone jinx/spin counts', () => {
    for (const zone of ZONES) {
      const board = generateBoard({ zone, seed: 42, sims: 150 });
      expect(board.tiles).toHaveLength(BOARD_SIZE);
      const c = counts(board.tiles);
      expect(c.jinx).toBe(zone.jinxTiles);
      expect(c.spin).toBe(zone.spinTiles);
      expect(c.cash).toBe(BOARD_SIZE - c.jinx - c.spin - c.bonus);
    }
  });

  it('is deterministic for a pinned seed', () => {
    const a = generateBoard({ zone: ZONES[0], seed: 777, sims: 100 });
    const b = generateBoard({ zone: ZONES[0], seed: 777, sims: 100 });
    expect(a.tiles).toEqual(b.tiles);
  });

  it('cash values stay inside the zone band (no upgrades)', () => {
    const zone = ZONES[0];
    const board = generateBoard({ zone, seed: 5, sims: 100 });
    for (const t of board.tiles) {
      if (t.kind === 'cash') {
        expect(t.amount).toBeGreaterThanOrEqual(zone.cashMin);
        expect(t.amount).toBeLessThanOrEqual(zone.cashMax);
      }
    }
  });

  it('spin wells add extra +Spin tiles', () => {
    const zone = ZONES[0];
    const base = counts(generateBoard({ zone, seed: 9, sims: 100 }).tiles);
    const up = counts(generateBoard({ zone, seed: 9, sims: 100, upgrades: { ...NO_UPGRADES, spinWells: 2 } }).tiles);
    expect(up.spin).toBe(base.spin + 2);
  });

  it('prize row adds flat-bonus tiles worth $250 × level', () => {
    const zone = ZONES[0];
    const board = generateBoard({ zone, seed: 9, sims: 100, upgrades: { ...NO_UPGRADES, prizeRow: 2 } });
    const bonus = board.tiles.filter((t) => t.kind === 'bonus');
    expect(bonus).toHaveLength(2);
    for (const b of bonus) expect(b.amount).toBe(prizeRowBonus(2));
  });

  it('gild tiles raise the cash band by 25% per level', () => {
    expect(gildCashMultiplier(0)).toBe(1);
    expect(gildCashMultiplier(2)).toBe(1.5);
    const zone = ZONES[0];
    const base = generateBoard({ zone, seed: 11, sims: 100 });
    const gilded = generateBoard({ zone, seed: 11, sims: 100, upgrades: { ...NO_UPGRADES, gild: 2 } });
    const sum = (tiles: Tile[]) => tiles.reduce((s, t) => (t.kind === 'cash' ? s + t.amount : s), 0);
    expect(sum(gilded.tiles)).toBeGreaterThan(sum(base.tiles));
    for (const t of gilded.tiles) {
      if (t.kind === 'cash') expect(t.amount).toBeGreaterThanOrEqual(zone.cashMin * 1.5 - 25);
    }
  });
});

describe('Monte Carlo validator (§4.1)', () => {
  it('bust probability of a jinx-heavy board is high, jinx-free is 0', () => {
    const zone = ZONES[0];
    const deadly: Tile[] = Array.from({ length: BOARD_SIZE }, (_, i) =>
      i < 10 ? { kind: 'jinx' } : i < 14 ? { kind: 'spin', amount: 3 } : { kind: 'cash', amount: 100 });
    const rng = mulberry32(1);
    const safe: Tile[] = Array.from({ length: BOARD_SIZE }, () => ({ kind: 'cash', amount: 100 }) as Tile);
    const deadlyP = bustProbability({ zone: 1, seed: 1, tiles: deadly }, zone, rng, 200).bustProb;
    const safeP = bustProbability({ zone: 1, seed: 1, tiles: safe }, zone, mulberry32(1), 200).bustProb;
    expect(deadlyP).toBeGreaterThan(0.4); // busts are bounded by short runs + early banking
    expect(safeP).toBe(0);
  });

  it('rejects boards outside the zone bust band', () => {
    const zone = ZONES[0]; // bust band ≤ 25%
    const deadly: Tile[] = Array.from({ length: BOARD_SIZE }, (_, i) =>
      i < 9 ? { kind: 'jinx' } : i < 13 ? { kind: 'spin', amount: 3 } : { kind: 'cash', amount: 100 });
    const res = validateBoard({ zone: 1, seed: 1, tiles: deadly }, zone, mulberry32(2), 200);
    expect(res.ok).toBe(false);
    expect(res.failures.length).toBeGreaterThan(0);
  });

  it('generated zone-1 boards land inside the ≤25% bust band', () => {
    const zone = ZONES[0];
    const board = generateBoard({ zone, seed: 2024, sims: 300 });
    const { bustProb } = bustProbability(board, zone, mulberry32(99), 300);
    expect(bustProb).toBeLessThanOrEqual(zone.bustMax + 0.05); // MC tolerance
    expect(bustProb).toBeGreaterThanOrEqual(zone.bustMin);
  });
});

describe('rng', () => {
  it('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});
