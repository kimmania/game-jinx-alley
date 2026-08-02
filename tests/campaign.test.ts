import { describe, expect, it } from 'vitest';
import {
  applyRunResult, buyConsumable, buyUpgrade, newCampaign, spendConsumable,
  starsForZone, upgradeCost,
} from '../src/engine/campaign.ts';
import { bankRun, createRun, resolveTile, type Board, type Tile } from '../src/engine/run.ts';
import { CONSUMABLES, UPGRADES, ZONES } from '../src/engine/zones.ts';

const zone1 = ZONES[0];
const board = (tiles: Tile[]): Board => ({ zone: 1, seed: 1, tiles });
const cash = (n: number): Tile => ({ kind: 'cash', amount: n });

function finishedRun(total: number, zone = zone1) {
  const s = createRun(board([cash(1)]), zone);
  s.cash = total;
  bankRun(s);
  return s;
}

describe('campaign meta', () => {
  it('banks run payouts and tracks zone thresholds', () => {
    const c = newCampaign();
    const r1 = applyRunResult(c, finishedRun(1000)); // clean: 1100
    expect(r1.payout).toBe(1100);
    expect(c.bank).toBe(1100);
    expect(c.zoneBanked[1]).toBe(1100);
    expect(r1.zoneCleared).toBe(false);
    const r2 = applyRunResult(c, finishedRun(1500)); // clean: 1650 → 2750 total
    expect(r2.zoneCleared).toBe(true);
    expect(c.zoneUnlocked).toBe(2);
  });

  it('campaign win requires clearing zone 4', () => {
    const c = newCampaign();
    c.zoneBanked[4] = 50000;
    const z4 = ZONES[3];
    const s = createRun({ zone: 4, seed: 1, tiles: [cash(1)] }, z4);
    bankRun(s);
    const r = applyRunResult(c, s);
    expect(r.campaignWon).toBe(true);
  });

  it('stars: ⭐ target, ⭐⭐ in ≤5 runs, ⭐⭐⭐ perfect run', () => {
    const c = newCampaign();
    expect(starsForZone(c, 1)).toBe(0);
    for (let i = 0; i < 7; i++) applyRunResult(c, finishedRun(500));
    expect(starsForZone(c, 1)).toBe(1); // 7 runs > 5
    const c2 = newCampaign();
    applyRunResult(c2, finishedRun(1250));
    applyRunResult(c2, finishedRun(1250)); // 2 runs, clean each
    expect(starsForZone(c2, 1)).toBe(2);
    const c3 = newCampaign();
    applyRunResult(c3, finishedRun(zone1.target)); // single perfect run
    expect(starsForZone(c3, 1)).toBe(3);
  });

  it('upgrades are bought with banked cash, grow in cost, and are permanent', () => {
    const c = newCampaign();
    expect(buyUpgrade(c, 'gild')).toBe(false); // no cash
    c.bank = 100000;
    const cost0 = upgradeCost('gild', 0);
    expect(cost0).toBe(UPGRADES.gild.baseCost);
    expect(buyUpgrade(c, 'gild')).toBe(true);
    expect(c.upgrades.gild).toBe(1);
    expect(c.bank).toBe(100000 - cost0);
    expect(upgradeCost('gild', 1)).toBe(UPGRADES.gild.baseCost * 2);
    expect(buyUpgrade(c, 'gild')).toBe(true);
    for (let i = 0; i < 10; i++) buyUpgrade(c, 'gild');
    expect(c.upgrades.gild).toBe(UPGRADES.gild.maxLevel); // capped
  });

  it('consumables are purchased from the bank and spent per run', () => {
    const c = newCampaign();
    expect(buyConsumable(c, 'insurance')).toBe(false);
    c.bank = CONSUMABLES.insurance.cost;
    expect(buyConsumable(c, 'insurance')).toBe(true);
    expect(c.bank).toBe(0);
    expect(c.consumables.insurance).toBe(1);
    expect(spendConsumable(c, 'insurance')).toBe(true);
    expect(spendConsumable(c, 'insurance')).toBe(false); // none left
  });

  it('4-jinx bust pays $0 but still counts as a run', () => {
    const c = newCampaign();
    const s = createRun(
      board([{ kind: 'spin', amount: 3 }, { kind: 'jinx' }, { kind: 'jinx' }, { kind: 'jinx' }, { kind: 'jinx' }]),
      zone1,
    );
    resolveTile(s, 0); // +3 spins
    resolveTile(s, 1);
    resolveTile(s, 2);
    resolveTile(s, 3);
    resolveTile(s, 4);
    expect(s.endReason).toBe('jinxes');
    const r = applyRunResult(c, s);
    expect(r.payout).toBe(0);
    expect(c.runsPlayed).toBe(1);
    expect(c.zoneRuns[1]).toBe(1);
  });
});
