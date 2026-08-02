/** Zone select, between-runs shop, consumable pre-run picker, run-end overlays. */
import {
  buyConsumable, buyUpgrade, starsForZone, upgradeCost, type CampaignState,
} from '../engine/campaign.ts';
import {
  CLEAN_RUN_BONUS, CONSUMABLES, EFFICIENCY_MULTIPLIER, UPGRADES, ZONES, zoneById,
  type ConsumableKind, type UpgradeKind,
} from '../engine/zones.ts';
import {
  isCleanRun, runPayout, type EndReason, type RunState,
} from '../engine/run.ts';
import type { RunSetup } from './game.ts';
import { sounds } from './sounds.ts';

const fmt = (n: number): string => `$${n.toLocaleString()}`;

export interface ScreenCtx {
  root: HTMLElement;
  campaign: CampaignState;
  persist: () => void;
  startRun: (zoneId: number, setup: RunSetup) => void;
  showZones: () => void;
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
    const stars = starsForZone(ctx.campaign, z.zone);
    const card = document.createElement('button');
    card.className = 'zone-card';
    card.style.setProperty('--zaccent', z.accent);
    card.disabled = locked;
    card.innerHTML = `
      <span class="zname">${locked ? '🔒 ' : ''}Zone ${z.zone}: ${z.name}</span>
      <span class="zinfo">Spins ${z.startingSpins} · Jinxes ${z.jinxTiles} · Cash ${fmt(z.cashMin)}–${fmt(z.cashMax)}</span>
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

/** Pre-run consumable picker (only items the player holds). */
function showConsumablePick(ctx: ScreenCtx, zoneId: number): void {
  const c = ctx.campaign;
  const held = (Object.keys(CONSUMABLES) as ConsumableKind[]).filter((k) => c.consumables[k] > 0);
  if (held.length === 0) {
    ctx.startRun(zoneId, { insurance: false, peekLens: false, spinAnchor: false });
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<h2>LOADOUT</h2><p class="sub" style="color:var(--dim);text-align:center">Bring protections into ${zoneById(zoneId).name}?</p>`;
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
    ctx.startRun(zoneId, setup);
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

/** Run-end overlay: payout breakdown (clean +10%, efficiency ×1.5), stars, CONTINUE. */
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

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  const rows: string[] = [];
  rows.push(`<div class="row"><span>Run total</span><span class="${base > 0 ? 'gain' : 'loss'}">${fmt(base)}</span></div>`);
  if (clean) rows.push(`<div class="row"><span>Clean run (0 jinxes) +10%</span><span class="gain">+${fmt(afterClean - base)}</span></div>`);
  if (excess > 0) rows.push(`<div class="row"><span>Over target ×${EFFICIENCY_MULTIPLIER} on ${fmt(excess)}</span><span class="gain">+${fmt(Math.round(excess * EFFICIENCY_MULTIPLIER) - excess)}</span></div>`);
  if (run.endReason === 'jinxes' || run.endReason === 'forfeit') {
    rows.push(`<div class="row"><span>${run.endReason === 'jinxes' ? '4th Jinx — wipe' : 'Forfeit'}</span><span class="loss">$0</span></div>`);
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
    </div>`;
  const cont = document.createElement('button');
  cont.className = 'close-btn';
  cont.textContent = 'CONTINUE ▶';
  cont.addEventListener('click', () => {
    overlay.remove();
    if (result.campaignWon || result.payout > 0) sounds.fanfare();
    ctx.showZones();
  });
  modal.appendChild(cont);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
