import { describe, expect, it } from 'vitest';
import { ZONES, zoneById, MAX_JINXES } from '../src/engine/zones.ts';
import {
  anchorRestop, bankRun, createRun, forfeitRun, isCleanRun, isPerfectRun,
  resolveTile, runPayout, type Board, type Tile,
} from '../src/engine/run.ts';

const zone1 = ZONES[0];

function boardWith(tiles: Tile[]): Board {
  return { zone: 1, seed: 1, tiles };
}

const cash = (amount: number): Tile => ({ kind: 'cash', amount });
const spin = (amount: number): Tile => ({ kind: 'spin', amount });
const bonus = (amount: number): Tile => ({ kind: 'bonus', amount });
const jinx: Tile = { kind: 'jinx' };

describe('run state machine', () => {
  it('starts with zone spins, 0 jinxes, $0 run total', () => {
    const s = createRun(boardWith([]), zone1);
    expect(s.spinsLeft).toBe(zone1.startingSpins);
    expect(s.jinxes).toBe(0);
    expect(s.cash).toBe(0);
    expect(s.over).toBe(false);
  });

  it('cash and bonus tiles add to the run total; +Spin refunds and adds spins', () => {
    const s = createRun(boardWith([cash(200), spin(2), bonus(150)]), zone1);
    resolveTile(s, 0);
    expect(s.cash).toBe(200);
    expect(s.spinsLeft).toBe(2);
    resolveTile(s, 1);
    expect(s.spinsLeft).toBe(3); // 1 spent, +2 gained
    resolveTile(s, 2);
    expect(s.cash).toBe(350);
  });

  it('jinx wipes the run total to $0 and increments jinx count', () => {
    const s = createRun(boardWith([cash(500), jinx, cash(100)]), zone1);
    resolveTile(s, 0);
    expect(s.cash).toBe(500);
    const ev = resolveTile(s, 1);
    expect(ev.type).toBe('jinx');
    expect(s.cash).toBe(0);
    expect(s.jinxes).toBe(1);
    expect(s.over).toBe(false);
  });

  it('3rd jinx ends the run with $0 payout', () => {
    const s = createRun(boardWith([spin(3), jinx, jinx, jinx]), zone1);
    resolveTile(s, 0); // +3 spins so all 3 jinxes can land
    resolveTile(s, 1);
    resolveTile(s, 2);
    expect(s.over).toBe(false);
    resolveTile(s, 3);
    expect(s.jinxes).toBe(MAX_JINXES);
    expect(s.over).toBe(true);
    expect(s.endReason).toBe('jinxes');
    expect(runPayout(s, zone1.target)).toBe(0);
  });

  it('BANK ends the run immediately and pays the run total', () => {
    const s = createRun(boardWith([cash(300)]), zone1);
    resolveTile(s, 0);
    bankRun(s);
    expect(s.over).toBe(true);
    expect(s.endReason).toBe('banked');
    expect(runPayout(s, zone1.target)).toBe(330); // +10% clean-run bonus
    expect(() => resolveTile(s, 0)).toThrow();
  });

  it('spins exhausted auto-banks the run total', () => {
    const s = createRun(boardWith([cash(100), cash(100), cash(100)]), zone1);
    resolveTile(s, 0);
    resolveTile(s, 1);
    expect(s.over).toBe(false);
    resolveTile(s, 2);
    expect(s.over).toBe(true);
    expect(s.endReason).toBe('spins');
    expect(runPayout(s, zone1.target)).toBe(330);
  });

  it('forfeit banks $0 and counts as a run', () => {
    const s = createRun(boardWith([cash(400)]), zone1);
    resolveTile(s, 0);
    forfeitRun(s);
    expect(s.over).toBe(true);
    expect(s.endReason).toBe('forfeit');
    expect(runPayout(s, zone1.target)).toBe(0);
  });

  it('clean-run bonus only applies with 0 jinxes', () => {
    const s = createRun(boardWith([cash(200), jinx, cash(200)]), zone1);
    resolveTile(s, 0);
    resolveTile(s, 1);
    resolveTile(s, 2);
    expect(isCleanRun(s)).toBe(false);
    bankRun(s);
    expect(runPayout(s, zone1.target)).toBe(200);
  });

  it('efficiency bonus multiplies excess over the zone target ×1.5', () => {
    const s = createRun(boardWith([cash(1000)]), zone1);
    resolveTile(s, 0); // cash 1000, spins now 2
    s.cash = 4000; // simulate a big run
    bankRun(s);
    // clean: 4000*1.1 = 4400; excess over 2500 = 1900 → 2500 + 2850 = 5350
    expect(runPayout(s, zone1.target)).toBe(5350);
  });

  it('perfect run: bank ≥ zone target in one run with 0 jinxes', () => {
    const s = createRun(boardWith([cash(100)]), zone1);
    s.cash = zone1.target;
    bankRun(s);
    expect(isPerfectRun(s, zone1.target)).toBe(true);
    const s2 = createRun(boardWith([jinx, cash(100)]), zone1);
    resolveTile(s2, 0);
    s2.cash = zone1.target;
    bankRun(s2);
    expect(isPerfectRun(s2, zone1.target)).toBe(false);
  });
});

describe('protection consumables', () => {
  it('jinx insurance absorbs one hit: no wipe, no jinx count', () => {
    const s = createRun(boardWith([cash(500), jinx, jinx]), zone1, { insurance: true });
    resolveTile(s, 0);
    const ev = resolveTile(s, 1);
    expect(ev.type).toBe('insurance');
    expect(s.cash).toBe(500);
    expect(s.jinxes).toBe(0);
    expect(s.insuranceUsed).toBe(true);
    // second jinx lands for real
    const ev2 = resolveTile(s, 2);
    expect(ev2.type).toBe('jinx');
    expect(s.cash).toBe(0);
    expect(s.jinxes).toBe(1);
  });

  it('spin anchor reverts the last landing exactly once', () => {
    const s = createRun(boardWith([jinx, cash(300), cash(50)]), zone1, { spinAnchor: true });
    resolveTile(s, 0); // jinx: cash 0, jinxes 1
    expect(s.jinxes).toBe(1);
    expect(anchorRestop(s)).toBe(true);
    expect(s.jinxes).toBe(0);
    expect(s.cash).toBe(0);
    expect(s.spinsLeft).toBe(zone1.startingSpins); // spin refunded
    resolveTile(s, 1);
    expect(s.cash).toBe(300);
    expect(anchorRestop(s)).toBe(false); // once per run
  });

  it('anchor unavailable without purchase or after run end', () => {
    const s = createRun(boardWith([cash(1)]), zone1);
    resolveTile(s, 0);
    expect(anchorRestop(s)).toBe(false);
    const s2 = createRun(boardWith([cash(1), cash(1), cash(1)]), zone1, { spinAnchor: true });
    bankRun(s2);
    expect(anchorRestop(s2)).toBe(false);
  });

  it('peek lens reveals tiles until each is landed on once', () => {
    const s = createRun(boardWith([cash(1), jinx, cash(2)]), zone1, { peekIndices: [0, 1] });
    expect(s.revealed).toEqual([0, 1]);
    resolveTile(s, 0);
    expect(s.revealed).toEqual([1]);
    resolveTile(s, 1);
    expect(s.revealed).toEqual([]);
  });
});

describe('zones', () => {
  it('has 4 zones matching the §4.2 progression table', () => {
    expect(ZONES).toHaveLength(4);
    expect(zoneById(1)).toMatchObject({ cashMin: 50, cashMax: 500, jinxTiles: 2, spinTiles: 2, startingSpins: 3, target: 2500 });
    expect(zoneById(2)).toMatchObject({ cashMin: 100, cashMax: 1000, jinxTiles: 3, target: 7500 });
    expect(zoneById(3)).toMatchObject({ cashMin: 250, cashMax: 2500, jinxTiles: 4, target: 20000 });
    expect(zoneById(4)).toMatchObject({ cashMin: 500, cashMax: 5000, jinxTiles: 5, startingSpins: 4, target: 50000 });
  });
});
