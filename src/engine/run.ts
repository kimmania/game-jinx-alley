import {
  CLEAN_RUN_BONUS, EFFICIENCY_MULTIPLIER, MAX_JINXES, type ZoneDef,
} from './zones.ts';

export type Tile =
  | { kind: 'cash'; amount: number }
  | { kind: 'spin'; amount: number }
  | { kind: 'bonus'; amount: number } // prize-row flat bonus, no Jinx risk
  | { kind: 'jinx' };

export interface Board {
  zone: number;
  seed: number;
  tiles: Tile[];
}

export type EndReason = 'banked' | 'spins' | 'jinxes' | 'forfeit';

export interface RunState {
  board: Board;
  spinsLeft: number;
  jinxes: number;
  /** Unbanked run total. Wipes to $0 on a Jinx. */
  cash: number;
  /** Highest the run total climbed this run (near-miss feedback on busts). */
  peakCash: number;
  /** Tile indices revealed by peek lens (until landed on once, §9.2). */
  revealed: number[];
  insuranceAvailable: boolean;
  insuranceUsed: boolean;
  anchorAvailable: boolean;
  anchorUsed: boolean;
  over: boolean;
  endReason: EndReason | null;
  lastEvent: RunEvent | null;
  /** Snapshot of the state before the last tile resolved (spin anchor). */
  snapshot: { spinsLeft: number; jinxes: number; cash: number; peakCash: number; revealed: number[] } | null;
}

export type RunEvent =
  | { type: 'cash'; amount: number }
  | { type: 'spin'; amount: number }
  | { type: 'bonus'; amount: number }
  | { type: 'jinx' }
  | { type: 'insurance' } // Jinx absorbed by Jinx Insurance
  | { type: 'anchor' } // spin anchor re-stop
  | { type: 'end'; reason: EndReason };

/** Consumables the player holds going into this run (one of each max applies). */
export interface RunContext {
  insurance: boolean;
  peekLens: boolean;
  spinAnchor: boolean;
  /** Tile indices pre-revealed by the peek lens (chosen by caller or UI). */
  peekIndices: number[];
}

export function createRun(board: Board, zone: ZoneDef, ctx?: Partial<RunContext>): RunState {
  return {
    board,
    spinsLeft: zone.startingSpins,
    jinxes: 0,
    cash: 0,
    peakCash: 0,
    revealed: [...(ctx?.peekIndices ?? [])],
    insuranceAvailable: ctx?.insurance ?? false,
    insuranceUsed: false,
    anchorAvailable: ctx?.spinAnchor ?? false,
    anchorUsed: false,
    over: false,
    endReason: null,
    lastEvent: null,
    snapshot: null,
  };
}

function endRun(state: RunState, reason: EndReason): void {
  state.over = true;
  state.endReason = reason;
  state.snapshot = null;
  state.lastEvent = { type: 'end', reason };
}

/**
 * Resolve the tile the light landed on (by board index).
 * Jinx: run total wipes to $0 and jinx count +1 (§3.1) — unless Jinx
 * Insurance is held, in which case the hit is fully absorbed (one use).
 */
export function resolveTile(state: RunState, tileIndex: number): RunEvent {
  if (state.over) throw new Error('run is over');
  const tile = state.board.tiles[tileIndex];
  if (!tile) throw new Error(`no tile at index ${tileIndex}`);

  // Snapshot for a potential spin-anchor re-stop.
  state.snapshot = {
    spinsLeft: state.spinsLeft,
    jinxes: state.jinxes,
    cash: state.cash,
    peakCash: state.peakCash,
    revealed: [...state.revealed],
  };

  // Peek reveal expires once the tile is landed on (§9 Q2).
  state.revealed = state.revealed.filter((i) => i !== tileIndex);

  state.spinsLeft -= 1;
  let ev: RunEvent;
  switch (tile.kind) {
    case 'cash':
      state.cash += tile.amount;
      ev = { type: 'cash', amount: tile.amount };
      break;
    case 'bonus':
      state.cash += tile.amount;
      ev = { type: 'bonus', amount: tile.amount };
      break;
    case 'spin':
      state.spinsLeft += tile.amount;
      ev = { type: 'spin', amount: tile.amount };
      break;
    case 'jinx':
      if (state.insuranceAvailable && !state.insuranceUsed) {
        state.insuranceUsed = true;
        ev = { type: 'insurance' };
      } else {
        state.cash = 0;
        state.jinxes += 1;
        ev = { type: 'jinx' };
      }
      break;
  }
  state.lastEvent = ev;
  if (state.cash > state.peakCash) state.peakCash = state.cash;
  if (state.jinxes >= MAX_JINXES) endRun(state, 'jinxes');
  else if (state.spinsLeft <= 0) endRun(state, 'spins'); // auto-bank
  return ev;
}

/**
 * Spin anchor: undo the last landing and re-stop (once per run, §3.3).
 * Returns false when unavailable.
 */
export function anchorRestop(state: RunState): boolean {
  if (state.over || !state.anchorAvailable || state.anchorUsed || !state.snapshot) return false;
  const snap = state.snapshot;
  state.spinsLeft = snap.spinsLeft;
  state.jinxes = snap.jinxes;
  state.cash = snap.cash;
  state.peakCash = snap.peakCash;
  state.revealed = snap.revealed;
  state.snapshot = null;
  state.anchorUsed = true;
  state.lastEvent = { type: 'anchor' };
  return true;
}

/** BANK (§3.1): run total moves to the campaign bank, run ends immediately. */
export function bankRun(state: RunState): void {
  if (!state.over) endRun(state, 'banked');
}

/** Forfeit (§6): banks $0, counts as a run. */
export function forfeitRun(state: RunState): void {
  if (state.over) return;
  state.cash = 0;
  endRun(state, 'forfeit');
}

export function isCleanRun(state: RunState): boolean {
  return state.jinxes === 0;
}

/**
 * Cash paid into the campaign bank when the run ends (§5.1):
 * - banked or spins-exhausted (auto-bank): the run total
 * - 4th Jinx / forfeit: $0 (total already wiped)
 * - clean run (0 Jinxes): +10%
 * - efficiency: single-run bank above the zone target multiplies the excess ×1.5
 */
export function runPayout(state: RunState, zoneTarget: number): number {
  if (!state.over) return 0;
  let payout = state.endReason === 'banked' || state.endReason === 'spins' ? state.cash : 0;
  if (payout > 0 && isCleanRun(state)) payout = Math.round(payout * (1 + CLEAN_RUN_BONUS));
  if (payout > zoneTarget) {
    payout = zoneTarget + Math.round((payout - zoneTarget) * EFFICIENCY_MULTIPLIER);
  }
  return payout;
}

/**
 * What banking right now would actually pay: clean +10%, excess above the
 * zone target ×1.5. Campaign zones only (target > 0); daily boards pay raw.
 */
export function bankPreview(cash: number, jinxes: number, target: number): number {
  if (target <= 0) return cash;
  let p = cash;
  if (p > 0 && jinxes === 0) p = Math.round(p * (1 + CLEAN_RUN_BONUS));
  if (p > target) p = target + Math.round((p - target) * EFFICIENCY_MULTIPLIER);
  return p;
}

/** Perfect run (§3.4): bank ≥ zone target in a single run with 0 Jinxes. */
export function isPerfectRun(state: RunState, zoneTarget: number): boolean {
  return (
    state.over &&
    (state.endReason === 'banked' || state.endReason === 'spins') &&
    state.cash >= zoneTarget &&
    state.jinxes === 0
  );
}

export { MAX_JINXES };
