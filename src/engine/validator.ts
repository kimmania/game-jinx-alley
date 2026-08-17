import type { Board, RunState, Tile } from './run.ts';
import { bankRun, createRun, isPerfectRun, resolveTile, runPayout } from './run.ts';
import type { ZoneDef } from './zones.ts';

export interface BustSimResult {
  bustProb: number;
  sims: number;
  busts: number;
  meanPayout: number;
}

/**
 * Simulate one run with the validation policy from spec §4.1:
 * spin until the run total reaches the zone target (then BANK), or until
 * the busting Jinx hit or spins run out (walk away, not a bust).
 */
function simulateOnce(board: Board, zone: ZoneDef, rng: () => number): { bust: boolean; payout: number } {
  const state: RunState = createRun(board, zone);
  let guard = 200;
  while (!state.over && guard-- > 0) {
    const idx = Math.floor(rng() * board.tiles.length);
    const tile: Tile = board.tiles[idx];
    resolveTile(state, idx);
    void tile;
    if (!state.over && state.cash >= zone.target) bankRun(state);
  }
  return {
    bust: state.endReason === 'jinxes',
    payout: runPayout(state, zone.target),
  };
}

/** Monte Carlo bust probability: P(busting Jinx hit before banking ≥ zone target). */
export function bustProbability(board: Board, zone: ZoneDef, rng: () => number, sims = 500): BustSimResult {
  let busts = 0;
  let payoutTotal = 0;
  for (let i = 0; i < sims; i++) {
    const r = simulateOnce(board, zone, rng);
    if (r.bust) busts += 1;
    payoutTotal += r.payout;
  }
  return { bustProb: busts / sims, sims, busts, meanPayout: payoutTotal / sims };
}

export interface ValidationResult {
  ok: boolean;
  bustProb: number;
  bustMin: number;
  bustMax: number;
  sims: number;
  failures: string[];
}

/** Reject boards whose bust probability falls outside the zone's target band (§4.1 step 5). */
export function validateBoard(
  board: Board,
  zone: ZoneDef,
  rng: () => number,
  sims = 500,
): ValidationResult {
  const { bustProb } = bustProbability(board, zone, rng, sims);
  const failures: string[] = [];
  if (bustProb < zone.bustMin) failures.push(`bust probability ${bustProb.toFixed(3)} below zone band min ${zone.bustMin}`);
  if (bustProb > zone.bustMax) failures.push(`bust probability ${bustProb.toFixed(3)} above zone band max ${zone.bustMax}`);
  return { ok: failures.length === 0, bustProb, bustMin: zone.bustMin, bustMax: zone.bustMax, sims, failures };
}

export { isPerfectRun };
