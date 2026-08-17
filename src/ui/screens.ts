/** Zone select, between-runs shop, consumable pre-run picker, run-end overlays. */
import {
  buyConsumable, buyUpgrade, starsForZone, upgradeCost, type CampaignState,
} from '../engine/campaign.ts';
import {
  CLEAN_RUN_BONUS, CONSUMABLES, EFFICIENCY_MULTIPLIER, gildCashMultiplier, NUM_ZONES,
  STAR_RUN_LIMIT, UPGRADES, ZONES, zoneById, zoneJackpot,
  type ConsumableKind, type UpgradeKind,
} from '../engine/zones.ts';
import { generateBoard } from '../engine/board.ts';
import type { Board } from '../engine/run.ts';
import {
  isCleanRun, runPayout, type EndReason, type RunState,
} from '../engine/run.ts';
import { dailyShareText } from '../engine/daily.ts';
import { randomSeed } from '../engine/rng.ts';
import type { RunSetup } from './game.ts';
import { sounds } from './sounds.ts';

const fmt = (n: number): string => `$${n.toLocaleString()}`;

export interface ScreenCtx {
  root: HTMLElement;
  campaign: CampaignState;
  persist: () => void;
  startRun: (zoneId: number, setup: RunSetup, boardOverride?: Board) => void;
  showZones: () => void;
  /** Daily Board: start today's attempt, or show today's result if already played. */
  daily: () => void;
  /** Today's date string + stored daily score (undefined = not yet played). */
  dailyInfo: () => { today: string; score: number | undefined; best: number };
}

const UPGRADE_ICONS: Record<UpgradeKind, string> = {
  gild: '✨', spinWells: '🌀', prizeRow: '🎁',
};
const CONSUMABLE_ICONS: Record<ConsumableKind, string> = {
  insurance: '🛡', peekLens: '🔭', spinAnchor: '⚓',
};

/** Zone select: 4 zones, accent shift, threshold progress, locks, campaign bank. */
export function renderZoneSelect(ctx: ScreenCtx): void {
  document.documentElement.style.setProperty('--accent', '#ff2d95');
  ctx.root.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'screen';
  screen.innerHTML = `<h2>SELECT ZONE</h2><div class="sub">Campaign bank: <b style="color:var(--gold)">${fmt(ctx.campaign.bank)}</b></div>`;
  const list = document.createElement('div');
  list.className = 'zone-list';
  for (const z of ZONES) {
    const locked = z.zone > ctx.campaign.zoneUnlocked;
    const banked = ctx.campaign.zoneBanked[z.zone] ?? 0;
    const bestRun = ctx.campaign.bestRunPayout[z.zone] ?? 0;
    const stars = starsForZone(ctx.campaign, z.zone);
    const card = document.createElement('button');
    card.className = 'zone-card';
    card.style.setProperty('--zaccent', z.accent);
    card.disabled = locked;
    card.innerHTML = `
      <span class="zname">${locked ? '🔒 ' : ''}Zone ${z.zone}: ${z.name}</span>
      <span class="zinfo">Spins ${z.startingSpins} · Jinxes ${z.jinxTiles} · Cash ${fmt(z.cashMin)}–${fmt(z.cashMax)}</span>
      <span class="zinfo">🎰 Jackpot ${fmt(zoneJackpot(z, ctx.campaign.upgrades))}${bestRun > 0 ? ` · Best run ${fmt(bestRun)}` : ''}</span>
      <span class="zprogress">${locked ? `Clear Zone ${z.zone - 1} to unlock` : `${fmt(banked)} / ${fmt(z.target)} banked`}</span>
      <span class="zstars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
    if (!locked) {
      card.addEventListener('click', () => {
        sounds.cash();
        showConsumablePick(ctx, z.zone);
      });
    }
    list.appendChild(card);
  }
  screen.appendChild(list);

  // Daily Board entry (§5.3): one seeded board per day, 5 spins, no shop.
  const { today, score: dailyScoreToday } = ctx.dailyInfo();
  const dailyBtn = document.createElement('button');
  dailyBtn.className = 'zone-card daily-card';
  dailyBtn.style.setProperty('--zaccent', '#a855f7');
  dailyBtn.innerHTML = `
    <span class="zname">📅 Daily Board — ${today}</span>
    <span class="zinfo">5 spins · same board for everyone · no protections</span>
    <span class="zprogress">${dailyScoreToday !== undefined ? `Today: ${fmt(dailyScoreToday)} banked` : "Not played yet — one attempt!"}</span>`;
  dailyBtn.addEventListener('click', () => {
    sounds.cash();
    ctx.daily();
  });
  screen.appendChild(dailyBtn);

  const menu = document.createElement('div');
  menu.className = 'menu-row';
  const shopBtn = document.createElement('button');
  shopBtn.className = 'menu-btn';
  shopBtn.innerHTML = '🛒 <span>Shop</span>';
  shopBtn.addEventListener('click', () => renderShop(ctx));
  menu.appendChild(shopBtn);
  screen.appendChild(menu);
  ctx.root.appendChild(screen);
}

/** Pre-run consumable picker. The board is dealt first so its composition is
 *  shown — lets the player choose protections against what's actually there. */
function showConsumablePick(ctx: ScreenCtx, zoneId: number): void {
  const c = ctx.campaign;
  const zone = zoneById(zoneId);
  const board = generateBoard({ zone, upgrades: c.upgrades, seed: randomSeed(), sims: 200 });
  const counts: Record<string, number> = {};
  for (const t of board.tiles) counts[t.kind] = (counts[t.kind] ?? 0) + 1;
  const cashParts: string[] = [`${counts.cash ?? 0} 💵 (${fmt(zone.cashMin)}–${fmt(Math.round((zone.cashMax * gildCashMultiplier(c.upgrades.gild)) / 25) * 25)})`];
  if (counts.bonus) cashParts.push(`${counts.bonus} 🎁`);
  const comp = `${cashParts.join(' · ')} · ${counts.spin ?? 0} 🔄 · ${counts.jinx ?? 0} 👁`;

  const held = (Object.keys(CONSUMABLES) as ConsumableKind[]).filter((k) => c.consumables[k] > 0);
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<h2>LOADOUT</h2>
    <p class="sub" style="color:var(--dim);text-align:center">${zone.name}</p>
    <p class="sub board-comp">${comp}</p>`;
  const setup: RunSetup = { insurance: false, peekLens: false, spinAnchor: false };
  for (const k of held) {
    const def = CONSUMABLES[k];
    const row = document.createElement('button');
    row.className = 'pick-row';
    row.innerHTML = `<span style="font-size:1.4rem">${CONSUMABLE_ICONS[k]}</span>
      <span class="pbody"><span class="pname">${def.name}</span><span class="pdesc">${def.description}</span></span>
      <span class="pcount">×${c.consumables[k]}</span>`;
    row.addEventListener('click', () => {
      setup[k] = !setup[k];
      row.classList.toggle('selected', setup[k]);
      sounds.tick();
    });
    modal.appendChild(row);
  }
  const go = document.createElement('button');
  go.className = 'close-btn';
  go.textContent = '▶ START RUN';
  go.addEventListener('click', () => {
    overlay.remove();
    ctx.startRun(zoneId, setup, board);
  });
  modal.appendChild(go);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

/** Between-runs shop: persistent upgrades + consumables, rising costs. */
export function renderShop(ctx: ScreenCtx): void {
  ctx.root.innerHTML = '';
  const c = ctx.campaign;
  const screen = document.createElement('div');
  screen.className = 'screen';
  screen.innerHTML = `<h2>SHOP</h2><div class="sub">Bank: <b style="color:var(--gold)">${fmt(c.bank)}</b></div>`;

  const upHdr = document.createElement('div');
  upHdr.className = 'shop-section';
  upHdr.textContent = 'Board Upgrades (permanent)';
  screen.appendChild(upHdr);
  const upList = document.createElement('div');
  upList.className = 'shop-list';
  for (const k of Object.keys(UPGRADES) as UpgradeKind[]) {
    const def = UPGRADES[k];
    const level = c.upgrades[k];
    const maxed = level >= def.maxLevel;
    const cost = upgradeCost(k, level);
    const item = document.createElement('button');
    item.className = 'shop-item';
    item.disabled = maxed || c.bank < cost;
    item.innerHTML = `<span class="sicon">${UPGRADE_ICONS[k]}</span>
      <span class="sbody"><span class="sname">${def.name}</span>
      <span class="sdesc">${def.description}</span>
      <span class="sowned">Level ${level}/${def.maxLevel}</span></span>
      <span class="sprice">${maxed ? 'MAX' : fmt(cost)}</span>`;
    if (!maxed) {
      item.addEventListener('click', () => {
        if (buyUpgrade(c, k)) {
          sounds.prize();
          ctx.persist();
          renderShop(ctx);
        }
      });
    }
    upList.appendChild(item);
  }
  screen.appendChild(upList);

  const conHdr = document.createElement('div');
  conHdr.className = 'shop-section';
  conHdr.textContent = 'Protections (one run each)';
  screen.appendChild(conHdr);
  const conList = document.createElement('div');
  conList.className = 'shop-list';
  for (const k of Object.keys(CONSUMABLES) as ConsumableKind[]) {
    const def = CONSUMABLES[k];
    const item = document.createElement('button');
    item.className = 'shop-item';
    item.disabled = c.bank < def.cost;
    item.innerHTML = `<span class="sicon">${CONSUMABLE_ICONS[k]}</span>
      <span class="sbody"><span class="sname">${def.name}</span>
      <span class="sdesc">${def.description}</span>
      <span class="sowned">Held ×${c.consumables[k]}</span></span>
      <span class="sprice">${fmt(def.cost)}</span>`;
    item.addEventListener('click', () => {
      if (buyConsumable(c, k)) {
        sounds.prize();
        ctx.persist();
        renderShop(ctx);
      }
    });
    conList.appendChild(item);
  }
  screen.appendChild(conList);

  const menu = document.createElement('div');
  menu.className = 'menu-row';
  const back = document.createElement('button');
  back.className = 'menu-btn';
  back.innerHTML = '◀ <span>Zones</span>';
  back.addEventListener('click', () => ctx.showZones());
  menu.appendChild(back);
  screen.appendChild(menu);
  ctx.root.appendChild(screen);
}

const END_TITLES: Record<EndReason, { icon: string; title: string }> = {
  banked: { icon: '🏦', title: 'BANKED!' },
  spins: { icon: '⏱', title: 'OUT OF SPINS — AUTO-BANK' },
  jinxes: { icon: '👁', title: 'BUSTED!' },
  forfeit: { icon: '🏳', title: 'FORFEIT' },
};

/** Run-end overlay: payout breakdown (clean +10%, efficiency ×1.5), stars,
 *  plain-language star rules, near-miss on busts, and run-again / next-zone flow. */
export function showRunEnd(
  ctx: ScreenCtx,
  run: RunState,
  result: { payout: number; stars: number; zoneCleared: boolean; campaignWon: boolean },
): void {
  const zone = zoneById(run.board.zone);
  const { icon, title } = END_TITLES[run.endReason ?? 'forfeit'];
  const base = run.endReason === 'banked' || run.endReason === 'spins' ? run.cash : 0;
  const clean = base > 0 && isCleanRun(run);
  const afterClean = clean ? Math.round(base * (1 + CLEAN_RUN_BONUS)) : base;
  const excess = afterClean > zone.target ? afterClean - zone.target : 0;
  const payout = runPayout(run, zone.target);
  const busted = run.endReason === 'jinxes' || run.endReason === 'forfeit';

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  const rows: string[] = [];
  rows.push(`<div class="row"><span>Run total</span><span class="${base > 0 ? 'gain' : 'loss'}">${fmt(base)}</span></div>`);
  if (clean) rows.push(`<div class="row"><span>Clean run (0 jinxes) +10%</span><span class="gain">+${fmt(afterClean - base)}</span></div>`);
  if (excess > 0) rows.push(`<div class="row"><span>Over target ×${EFFICIENCY_MULTIPLIER} on ${fmt(excess)}</span><span class="gain">+${fmt(Math.round(excess * EFFICIENCY_MULTIPLIER) - excess)}</span></div>`);
  if (busted) {
    rows.push(`<div class="row"><span>${run.endReason === 'jinxes' ? '3rd Jinx — wipe' : 'Forfeit'}</span><span class="loss">$0</span></div>`);
    if (run.peakCash > 0) {
      rows.push(`<div class="row"><span>You peaked at</span><span class="loss">${fmt(run.peakCash)} — wiped</span></div>`);
    }
  }
  const runsUsed = ctx.campaign.zoneRuns[zone.zone] ?? 0;
  const starNotes: string[] = [];
  if (zone.target > 0 && !ctx.campaign.zonePerfect[zone.zone]) {
    starNotes.push(`★★★ = bank ${fmt(zone.target)}+ with 0 jinxes in one run`);
  }
  if (zone.target > 0 && (ctx.campaign.zoneBanked[zone.zone] ?? 0) < zone.target) {
    starNotes.push(`★★ = clear in ≤${STAR_RUN_LIMIT} runs (runs used: ${runsUsed})`);
  }
  modal.innerHTML = `
    <h2>${icon} ${title}</h2>
    <div class="stars">${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}</div>
    <div class="summary-math">
      ${rows.join('')}
      <div class="row total"><span>Banked</span><span>${fmt(payout)}</span></div>
      <div class="row"><span>Campaign bank</span><span class="gain">${fmt(ctx.campaign.bank)}</span></div>
      ${result.zoneCleared ? `<div class="row"><span style="color:var(--gold)">ZONE ${zone.zone} CLEARED!</span><span>🎉</span></div>` : ''}
      ${result.campaignWon ? `<div class="row"><span style="color:var(--gold)">CAMPAIGN COMPLETE!</span><span>👑</span></div>` : ''}
    </div>
    ${starNotes.length > 0 ? `<div class="star-notes">${starNotes.map((n) => `<div>${n}</div>`).join('')}</div>` : ''}`;

  // Folio-complete rule: no replay button when the campaign is won.
  if (!result.campaignWon) {
    if (result.zoneCleared && zone.zone < NUM_ZONES) {
      const nextZone = document.createElement('button');
      nextZone.className = 'close-btn';
      nextZone.textContent = `ENTER ZONE ${zone.zone + 1} ▶`;
      nextZone.addEventListener('click', () => {
        overlay.remove();
        sounds.fanfare();
        showConsumablePick(ctx, zone.zone + 1);
      });
      modal.appendChild(nextZone);
    } else {
      const again = document.createElement('button');
      again.className = 'close-btn';
      again.textContent = '▶ RUN IT BACK';
      again.addEventListener('click', () => {
        overlay.remove();
        if (result.payout > 0) sounds.fanfare();
        showConsumablePick(ctx, zone.zone);
      });
      modal.appendChild(again);
    }
  }
  const cont = document.createElement('button');
  cont.className = 'close-btn secondary';
  cont.textContent = 'ZONES';
  cont.addEventListener('click', () => {
    overlay.remove();
    if (result.campaignWon || result.payout > 0) sounds.fanfare();
    ctx.showZones();
  });
  modal.appendChild(cont);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

/** Daily Board result (§5.3): score, best, shareable text + copy-to-clipboard. */
export function showDailyResult(
  ctx: ScreenCtx,
  dateStr: string,
  score: number,
  best: number,
  justPlayed: boolean,
): void {
  const share = dailyShareText(dateStr, score, best);
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <h2>📅 DAILY BOARD</h2>
    <div class="sub" style="text-align:center;color:var(--dim)">${dateStr}${justPlayed ? '' : ' — already played today'}</div>
    <div class="summary-math">
      <div class="row total"><span>Banked</span><span class="${score > 0 ? 'gain' : 'loss'}">${fmt(score)}</span></div>
      <div class="row"><span>All-time daily best</span><span class="gain">${fmt(best)}</span></div>
      <div class="row"><span style="color:var(--dim)">Come back tomorrow for a new board!</span><span>🌙</span></div>
    </div>
    <pre class="share-text">${share}</pre>`;
  const copyBtn = document.createElement('button');
  copyBtn.className = 'close-btn';
  copyBtn.textContent = '📋 COPY SCORE';
  copyBtn.addEventListener('click', () => {
    void navigator.clipboard?.writeText(share).then(() => {
      copyBtn.textContent = '✅ COPIED!';
      sounds.prize();
    }).catch(() => {
      copyBtn.textContent = '⚠ Copy failed — select the text above';
    });
  });
  modal.appendChild(copyBtn);
  const cont = document.createElement('button');
  cont.className = 'close-btn';
  cont.textContent = 'CONTINUE ▶';
  cont.addEventListener('click', () => {
    overlay.remove();
    ctx.showZones();
  });
  modal.appendChild(cont);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
