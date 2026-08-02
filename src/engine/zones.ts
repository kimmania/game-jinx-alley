/**
 * Zone parameter tables (spec §4.2) + upgrade / consumable definitions (§3.2, §3.3).
 * All campaign meta lives in the engine so the UI stage is a thin shell.
 */

export const BOARD_SIZE = 18;
export const MAX_JINXES = 4;
export const NUM_ZONES = 4;
/** Clean-run bonus (§5.1): banking with 0 Jinxes adds +10%. */
export const CLEAN_RUN_BONUS = 0.1;
/** Efficiency bonus (§5.1): single-run bank above zone target multiplies the excess ×1.5. */
export const EFFICIENCY_MULTIPLIER = 1.5;
/** Peek lens reveals this many tiles pre-run (§3.3). */
export const PEEK_REVEAL_COUNT = 3;
/** ⭐⭐ condition (§5.2): reach zone target in ≤ this many runs. */
export const STAR_RUN_LIMIT = 5;

export interface ZoneDef {
  zone: number;
  name: string;
  /** Neon accent colour (§2.2). */
  accent: string;
  /** Cash tile value band before gild upgrades. */
  cashMin: number;
  cashMax: number;
  jinxTiles: number;
  spinTiles: number;
  /** Possible +Spin amounts on spin tiles. */
  spinGain: number[];
  startingSpins: number;
  /** Banked-cash threshold to clear the zone. */
  target: number;
  /** Monte Carlo bust-probability acceptance band (§4.1). */
  bustMin: number;
  bustMax: number;
}

export const ZONES: ZoneDef[] = [
  {
    zone: 1, name: 'Neon Strip', accent: '#ff2d95',
    cashMin: 50, cashMax: 500, jinxTiles: 2, spinTiles: 2, spinGain: [1, 2],
    startingSpins: 3, target: 2500, bustMin: 0, bustMax: 0.25,
  },
  {
    zone: 2, name: 'Pier Lights', accent: '#22d3ee',
    cashMin: 100, cashMax: 1000, jinxTiles: 3, spinTiles: 2, spinGain: [1, 2],
    startingSpins: 3, target: 7500, bustMin: 0.1, bustMax: 0.4,
  },
  {
    zone: 3, name: 'High Roller Row', accent: '#ffd23f',
    cashMin: 250, cashMax: 2500, jinxTiles: 4, spinTiles: 1, spinGain: [1, 2, 3],
    startingSpins: 3, target: 20000, bustMin: 0.25, bustMax: 0.5,
  },
  {
    zone: 4, name: "Jinx's Lair", accent: '#ef233c',
    cashMin: 500, cashMax: 5000, jinxTiles: 5, spinTiles: 1, spinGain: [1, 2, 3],
    startingSpins: 4, target: 50000, bustMin: 0.45, bustMax: 0.6,
  },
];

export function zoneById(zone: number): ZoneDef {
  const z = ZONES.find((zd) => zd.zone === zone);
  if (!z) throw new Error(`unknown zone ${zone}`);
  return z;
}

// ---------- board upgrades (§3.2) ----------

export type UpgradeKind = 'gild' | 'spinWells' | 'prizeRow';

export interface UpgradeDef {
  kind: UpgradeKind;
  name: string;
  description: string;
  baseCost: number;
  /** Cost multiplier per level already owned. */
  costGrowth: number;
  maxLevel: number;
}

export const UPGRADES: Record<UpgradeKind, UpgradeDef> = {
  gild: {
    kind: 'gild', name: 'Gild Tiles',
    description: 'Raise the cash band by 25% per level.',
    baseCost: 2000, costGrowth: 2, maxLevel: 4,
  },
  spinWells: {
    kind: 'spinWells', name: 'Spin Wells',
    description: 'Add one extra +Spin tile per level.',
    baseCost: 1500, costGrowth: 2, maxLevel: 3,
  },
  prizeRow: {
    kind: 'prizeRow', name: 'Prize Row',
    description: 'Add one flat-bonus prize tile per level ($250 × level each).',
    baseCost: 1500, costGrowth: 2, maxLevel: 3,
  },
};

/** Cash-band multiplier from gild level (+25% per level). */
export function gildCashMultiplier(level: number): number {
  return 1 + 0.25 * level;
}

/** Flat bonus per prize-row tile ($250 × level). */
export function prizeRowBonus(level: number): number {
  return 250 * level;
}

// ---------- protection consumables (§3.3) ----------

export type ConsumableKind = 'insurance' | 'peekLens' | 'spinAnchor';

export interface ConsumableDef {
  kind: ConsumableKind;
  name: string;
  description: string;
  cost: number;
}

export const CONSUMABLES: Record<ConsumableKind, ConsumableDef> = {
  insurance: {
    kind: 'insurance', name: 'Jinx Insurance',
    description: 'Survive one Jinx hit without losing the run total. One use per run.',
    cost: 1500,
  },
  peekLens: {
    kind: 'peekLens', name: 'Peek Lens',
    description: `Reveal ${PEEK_REVEAL_COUNT} tiles before the run. Each stays revealed until landed on once.`,
    cost: 750,
  },
  spinAnchor: {
    kind: 'spinAnchor', name: 'Spin Anchor',
    description: 'Re-stop the light once per run after a bad landing.',
    cost: 1000,
  },
};
