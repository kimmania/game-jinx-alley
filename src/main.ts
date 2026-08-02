/**
 * Jinx Alley — Stage 1 debug entry: console simulation of the full engine.
 * Real UI lands in Stage 2; this proves the loop end-to-end in devtools.
 */
import { generateBoard } from './engine/board.ts';
import { applyRunResult, buyConsumable, buyUpgrade, newCampaign } from './engine/campaign.ts';
import {
  anchorRestop, bankRun, createRun, resolveTile, runPayout, type RunState,
} from './engine/run.ts';
import { mulberry32, randomSeed } from './engine/rng.ts';
import { ZONES, zoneById } from './engine/zones.ts';

function simulateRun(zoneId: number, seed: number, useItems: boolean): void {
  const zone = zoneById(zoneId);
  const rng = mulberry32(seed);
  const board = generateBoard({ zone, seed, sims: 200 });
  const state: RunState = createRun(board, zone, useItems
    ? { insurance: true, spinAnchor: true, peekIndices: [0, 1, 2] }
    : undefined);
  console.log(
    `\n=== ${zone.name} (target $${zone.target}) — board seed ${board.seed} ===`,
    board.tiles.map((t) => (t.kind === 'jinx' ? 'JINX' : t.kind === 'spin' ? `+${t.amount}` : `$${t.amount}`)),
  );
  let guard = 50;
  while (!state.over && guard-- > 0) {
    const idx = Math.floor(rng() * board.tiles.length);
    const ev = resolveTile(state, idx);
    console.log(`landed tile ${idx}:`, ev, `→ cash $${state.cash}, spins ${state.spinsLeft}, jinxes ${state.jinxes}`);
    if (!state.over && ev.type === 'jinx' && state.anchorAvailable && !state.anchorUsed) {
      console.log('spin anchor re-stop!', anchorRestop(state));
    }
    if (!state.over && state.cash >= zone.target) bankRun(state);
  }
  console.log(`run over (${state.endReason}) → payout $${runPayout(state, zone.target)}`);
}

// Campaign walkthrough: zone 1 runs, shop purchases, upgrade effects.
const campaign = newCampaign();
const zone1 = ZONES[0];
const rng = mulberry32(randomSeed());
for (let run = 0; run < 3; run++) {
  const board = generateBoard({ zone: zone1, upgrades: campaign.upgrades, seed: randomSeed(), sims: 200 });
  const state = createRun(board, zone1);
  let guard = 50;
  while (!state.over && guard-- > 0) {
    resolveTile(state, Math.floor(rng() * board.tiles.length));
    if (!state.over && state.cash >= zone1.target) bankRun(state);
  }
  const result = applyRunResult(campaign, state);
  console.log(`campaign run ${run + 1}: payout $${result.payout}, bank $${campaign.bank}, stars ${result.stars}`);
}
if (buyUpgrade(campaign, 'gild')) console.log('bought Gild Tiles lv1');
if (buyConsumable(campaign, 'insurance')) console.log('bought Jinx Insurance');
console.log('campaign:', campaign);

simulateRun(1, 1234, false);
simulateRun(4, 9999, true);

const app = document.getElementById('app');
if (app) {
  app.innerHTML = '<h1 style="font-family:sans-serif;color:#ff2d95;background:#0d0a14;padding:2rem">Jinx Alley — Stage 1 engine build. Open the console.</h1>';
}
