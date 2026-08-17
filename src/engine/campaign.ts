import type { RunState } from './run.ts';
import { isPerfectRun, runPayout } from './run.ts';
import type { ConsumableKind, UpgradeKind } from './zones.ts';
import {
  CONSUMABLES, NUM_ZONES, STAR_RUN_LIMIT, UPGRADES, zoneById,
} from './zones.ts';
import type { UpgradeLevels } from './board.ts';

/** Campaign meta state (§5.3): bank, zone progress, upgrades, consumables. */
export interface CampaignState {
  /** Safe forever — the score (§5.1). */
  bank: number;
  /** Highest zone unlocked (1–4). */
  zoneUnlocked: number;
  /** Banked cash credited toward each zone's threshold. */
  zoneBanked: Record<number, number>;
  /** Best single-run payout ever banked in each zone. */
  bestRunPayout: Record<number, number>;
  /** Runs played per zone (for ⭐⭐). */
  zoneRuns: Record<number, number>;
  /** Perfect run achieved per zone (for ⭐⭐⭐). */
  zonePerfect: Record<number, boolean>;
  upgrades: UpgradeLevels;
  consumables: Record<ConsumableKind, number>;
  runsPlayed: number;
  perfectRuns: number;
}

export function newCampaign(): CampaignState {
  return {
    bank: 0,
    zoneUnlocked: 1,
    zoneBanked: { 1: 0, 2: 0, 3: 0, 4: 0 },
    bestRunPayout: { 1: 0, 2: 0, 3: 0, 4: 0 },
    zoneRuns: { 1: 0, 2: 0, 3: 0, 4: 0 },
    zonePerfect: { 1: false, 2: false, 3: false, 4: false },
    upgrades: { gild: 0, spinWells: 0, prizeRow: 0 },
    consumables: { insurance: 0, peekLens: 0, spinAnchor: 0 },
    runsPlayed: 0,
    perfectRuns: 0,
  };
}

// ---------- shops ----------

export function upgradeCost(kind: UpgradeKind, currentLevel: number): number {
  const def = UPGRADES[kind];
  return Math.round(def.baseCost * Math.pow(def.costGrowth, currentLevel));
}

/** Buy a persistent board upgrade with banked cash (§3.2). Permanent (§9 Q3). */
export function buyUpgrade(c: CampaignState, kind: UpgradeKind): boolean {
  const level = c.upgrades[kind];
  if (level >= UPGRADES[kind].maxLevel) return false;
  const cost = upgradeCost(kind, level);
  if (c.bank < cost) return false;
  c.bank -= cost;
  c.upgrades[kind] = level + 1;
  return true;
}

/** Buy a protection consumable with banked cash (§3.3). */
export function buyConsumable(c: CampaignState, kind: ConsumableKind): boolean {
  const cost = CONSUMABLES[kind].cost;
  if (c.bank < cost) return false;
  c.bank -= cost;
  c.consumables[kind] += 1;
  return true;
}

/** Consume one held consumable (when starting a run). Returns false if none held. */
export function spendConsumable(c: CampaignState, kind: ConsumableKind): boolean {
  if (c.consumables[kind] <= 0) return false;
  c.consumables[kind] -= 1;
  return true;
}

// ---------- run results ----------

export interface RunResult {
  payout: number;
  perfect: boolean;
  zoneCleared: boolean;
  campaignWon: boolean;
  stars: number;
}

/** Apply a finished run to the campaign: bank the payout, track zone progress. */
export function applyRunResult(c: CampaignState, state: RunState): RunResult {
  if (!state.over) throw new Error('run is not over');
  const zone = zoneById(state.board.zone);
  const payout = runPayout(state, zone.target);
  const perfect = isPerfectRun(state, zone.target);

  c.bank += payout;
  c.zoneBanked[zone.zone] = (c.zoneBanked[zone.zone] ?? 0) + payout;
  if (payout > (c.bestRunPayout[zone.zone] ?? 0)) c.bestRunPayout[zone.zone] = payout;
  c.zoneRuns[zone.zone] = (c.zoneRuns[zone.zone] ?? 0) + 1;
  c.runsPlayed += 1;
  if (perfect) {
    c.perfectRuns += 1;
    c.zonePerfect[zone.zone] = true;
  }

  const zoneCleared = c.zoneBanked[zone.zone] >= zone.target;
  if (zoneCleared && zone.zone < NUM_ZONES && c.zoneUnlocked < zone.zone + 1) {
    c.zoneUnlocked = zone.zone + 1;
  }
  const campaignWon = c.zoneBanked[NUM_ZONES] >= zoneById(NUM_ZONES).target;
  return { payout, perfect, zoneCleared, campaignWon, stars: starsForZone(c, zone.zone) };
}

/** Stars per zone (§5.2). */
export function starsForZone(c: CampaignState, zoneId: number): number {
  const zone = zoneById(zoneId);
  if ((c.zoneBanked[zoneId] ?? 0) < zone.target) return 0;
  if (c.zonePerfect[zoneId]) return 3;
  if ((c.zoneRuns[zoneId] ?? 0) <= STAR_RUN_LIMIT) return 2;
  return 1;
}
