import type { Board, Tile } from './run.ts';
import type { ZoneDef } from './zones.ts';
import {
  BOARD_SIZE, gildCashMultiplier, prizeRowBonus, type UpgradeKind,
} from './zones.ts';
import { mulberry32, pick, shuffle } from './rng.ts';
import { validateBoard } from './validator.ts';

export type UpgradeLevels = Record<UpgradeKind, number>;

export const NO_UPGRADES: UpgradeLevels = { gild: 0, spinWells: 0, prizeRow: 0 };

export interface BoardGenOptions {
  zone: ZoneDef;
  /** Purchased persistent board upgrades (§3.2) — incorporated into the deal. */
  upgrades?: UpgradeLevels;
  seed: number;
  maxAttempts?: number;
  /** Monte Carlo sims per validation pass (default 500, §4.1). */
  sims?: number;
}

/** Cash tile value for a zone + gild level (values snapped to $25). */
export function cashValue(zone: ZoneDef, gildLevel: number, rng: () => number): number {
  const mult = gildCashMultiplier(gildLevel);
  const min = zone.cashMin * mult;
  const max = zone.cashMax * mult;
  return Math.round((min + rng() * (max - min)) / 25) * 25;
}

function dealTiles(zone: ZoneDef, upgrades: UpgradeLevels, rng: () => number): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i < zone.jinxTiles; i++) tiles.push({ kind: 'jinx' });
  const spinTileCount = zone.spinTiles + upgrades.spinWells;
  for (let i = 0; i < spinTileCount; i++) tiles.push({ kind: 'spin', amount: pick(rng, zone.spinGain) });
  for (let i = 0; i < upgrades.prizeRow; i++) {
    tiles.push({ kind: 'bonus', amount: prizeRowBonus(upgrades.prizeRow) });
  }
  while (tiles.length < BOARD_SIZE) tiles.push({ kind: 'cash', amount: cashValue(zone, upgrades.gild, rng) });
  return shuffle(rng, tiles.slice(0, BOARD_SIZE));
}

/**
 * Generate a validated board (§4.1): deal 18 tiles from the zone table
 * (plus purchased upgrades), Monte Carlo check the bust-probability band,
 * redeal until one passes. Accepted board is pinned to `seed`.
 */
export function generateBoard(opts: BoardGenOptions): Board {
  const { zone, seed } = opts;
  const upgrades = opts.upgrades ?? NO_UPGRADES;
  const maxAttempts = opts.maxAttempts ?? 60;
  const sims = opts.sims ?? 500;
  const rng = mulberry32(seed);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const board: Board = { zone: zone.zone, seed, tiles: dealTiles(zone, upgrades, rng) };
    if (validateBoard(board, zone, rng, sims).ok) return board;
  }
  // Deterministic fallback after maxAttempts: last dealt board.
  return { zone: zone.zone, seed, tiles: dealTiles(zone, upgrades, rng) };
}
