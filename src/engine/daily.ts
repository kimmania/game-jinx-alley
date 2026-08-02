/**
 * Daily Board mode (spec §5.3): one seeded board per calendar day, fixed
 * 5 spins, no shop / consumables / upgrades. Score = banked amount.
 * One attempt per day; result is shareable as text.
 */
import { generateBoard } from './board.ts';
import { dailySeed } from './rng.ts';
import type { Board, RunState } from './run.ts';
import type { ZoneDef } from './zones.ts';

/** Fixed parameter table for the Daily Board — same for every player, every day. */
export const DAILY_ZONE: ZoneDef = {
  zone: 0,
  name: 'Daily Board',
  accent: '#a855f7',
  cashMin: 100,
  cashMax: 1200,
  jinxTiles: 3,
  spinTiles: 1,
  spinGain: [1, 2],
  startingSpins: 5,
  target: 0, // no campaign target — score is the raw banked amount
  bustMin: 0,
  bustMax: 0.55,
};

/** Deterministic board for a date string (YYYY-MM-DD). Same seed → same tiles for everyone. */
export function dailyBoard(dateStr: string): Board {
  return generateBoard({ zone: DAILY_ZONE, seed: dailySeed(dateStr), sims: 200 });
}

/** Daily score: the banked amount. Bust / forfeit scores $0. No clean/efficiency bonuses. */
export function dailyScore(run: RunState): number {
  if (!run.over) return 0;
  return run.endReason === 'banked' || run.endReason === 'spins' ? run.cash : 0;
}

/** Shareable result text for clipboard / Discord comparison. */
export function dailyShareText(dateStr: string, score: number, best: number): string {
  return [
    `🎡 Jinx Alley — Daily Board ${dateStr}`,
    `💰 Banked: $${score.toLocaleString()}${best > score ? ` (best $${best.toLocaleString()})` : best < score ? ' (new best!)' : ''}`,
    'Play: https://kimmania.github.io/game-jinx-alley/',
  ].join('\n');
}
