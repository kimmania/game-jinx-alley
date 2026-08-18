/** Game screen: 18-tile DOM ring, sliding-light spin, SPIN/BANK, jinx wipe, consumables. */
import { generateBoard } from '../engine/board.ts';
import {
  anchorRestop, bankPreview, bankRun, createRun, forfeitRun, MAX_JINXES, resolveTile,
  type Board, type RunState, type Tile,
} from '../engine/run.ts';
import { mulberry32, randomSeed, shuffle } from '../engine/rng.ts';
import type { CampaignState } from '../engine/campaign.ts';
import {
  boardPool, PEEK_REVEAL_COUNT, STAR_RUN_LIMIT, topTile, type ZoneDef,
} from '../engine/zones.ts';
import type { Settings } from '../engine/storage.ts';
import { sounds } from './sounds.ts';

export interface RunSetup {
  insurance: boolean;
  peekLens: boolean;
  spinAnchor: boolean;
}

const fmt = (n: number): string => `$${n.toLocaleString()}`;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function tileLabel(t: Tile): { glyph: string; text: string } {
  switch (t.kind) {
    case 'cash': return { glyph: '💵', text: fmt(t.amount) };
    case 'spin': return { glyph: '🔄', text: t.cash ? `+${t.amount} · ${fmt(t.cash)}` : `+${t.amount}` };
    case 'bonus': return { glyph: '🎁', text: fmt(t.amount) };
    case 'jinx': return { glyph: '👁', text: 'JINX' };
  }
}

export class GameScreen {
  private run: RunState;
  /** Tile elements by board index. */
  private tileEls: HTMLElement[] = [];
  /** Display slot → board tile index. Reshuffled after every landing so a
   *  tile can't be farmed by stopping at the same spot. */
  private order: number[] = [];
  /** Board indices whose face is currently shown (peek reveals + landed tiles
   *  from the current generation). Non-peek tiles flip back down on reshuffle. */
  private visibleSet = new Set<number>();
  private pool: number;
  private top: number;
  private runNumber: number;
  /** Board index of the most recent landing — highlighted in the end reveal. */
  private lastLanded: number | null = null;
  private firstSpin = true;
  private spinning = false;
  private stopRequested = false;
  private forfeitArmed = false;
  private rng = mulberry32(randomSeed());

  private elCenterEvent!: HTMLElement;
  private elCenterTotal!: HTMLElement;
  private elCenterSub!: HTMLElement;
  private elSpinCount!: HTMLElement;
  private elSpinBtn!: HTMLButtonElement;
  private elBankBtn!: HTMLButtonElement;
  private elAnchorBtn!: HTMLButtonElement;
  private elInsBadge!: HTMLElement;
  private elForfeitBtn!: HTMLButtonElement;
  private elJinxSlots!: HTMLElement;
  private elPoolChip!: HTMLElement;
  private elRiskChip!: HTMLElement;
  private elRunChip!: HTMLElement;

  constructor(
    private root: HTMLElement,
    private zone: ZoneDef,
    campaign: CampaignState,
    private setup: RunSetup,
    private settings: Settings,
    private onRunEnd: (run: RunState) => void,
    /** Fixed board (Daily Board, or pre-dealt for the loadout preview) — skips generation. */
    boardOverride?: Board,
  ) {
    const peekIndices: number[] = [];
    if (setup.peekLens) {
      const rng = mulberry32(randomSeed());
      while (peekIndices.length < PEEK_REVEAL_COUNT) {
        const i = Math.floor(rng() * 18);
        if (!peekIndices.includes(i)) peekIndices.push(i);
      }
    }
    const board = boardOverride ?? generateBoard({
      zone, upgrades: campaign.upgrades, seed: randomSeed(), sims: 200,
    });
    this.run = createRun(board, zone, { ...setup, peekIndices });
    this.order = board.tiles.map((_, i) => i);
    this.pool = boardPool(board.tiles);
    this.top = topTile(board.tiles);
    this.runNumber = (campaign.zoneRuns[zone.zone] ?? 0) + 1;
    for (const i of this.run.revealed) this.visibleSet.add(i);
    this.render();
  }

  private slotPos(slot: number): { left: number; top: number } {
    const angle = (slot / this.order.length) * Math.PI * 2 - Math.PI / 2;
    return { left: 50 + 46 * Math.cos(angle), top: 50 + 46 * Math.sin(angle) };
  }

  private positionTile(boardIdx: number, slot: number): void {
    const { left, top } = this.slotPos(slot);
    this.tileEls[boardIdx].style.left = `${left}%`;
    this.tileEls[boardIdx].style.top = `${top}%`;
  }

  private render(): void {
    document.documentElement.style.setProperty('--accent', this.zone.accent);
    this.root.innerHTML = '';
    const screen = document.createElement('div');
    screen.className = 'screen';

    // board ring
    const wrap = document.createElement('div');
    wrap.className = 'board-wrap';
    const ring = document.createElement('div');
    ring.className = 'board-ring';
    this.tileEls = [];
    this.run.board.tiles.forEach((t, i) => {
      const el = document.createElement('div');
      // Kind class only while face-up — otherwise the border color would give
      // away jinx positions while face-down.
      const revealed = this.visibleSet.has(i);
      el.className = revealed ? `tile ${t.kind}` : 'tile';
      const { glyph, text } = tileLabel(t);
      el.innerHTML = revealed
        ? `<span class="glyph">${glyph}</span><span>${text}</span>`
        : '<span class="glyph">❔</span>';
      if (revealed) el.classList.add('revealed');
      ring.appendChild(el);
      this.tileEls[i] = el;
    });
    this.order.forEach((boardIdx, slot) => this.positionTile(boardIdx, slot));
    wrap.appendChild(ring);

    const center = document.createElement('div');
    center.className = 'board-center';
    center.innerHTML = `
      <div class="center-event"></div>
      <div class="center-total">$0</div>
      <div class="center-sub"></div>`;
    wrap.appendChild(center);
    screen.appendChild(wrap);
    this.elCenterEvent = center.querySelector('.center-event')!;
    this.elCenterTotal = center.querySelector('.center-total')!;
    this.elCenterSub = center.querySelector('.center-sub')!;

    // counters row
    const counters = document.createElement('div');
    counters.className = 'counters';
    this.elSpinCount = document.createElement('div');
    this.elSpinCount.className = 'spin-count';
    this.elJinxSlots = document.createElement('div');
    this.elJinxSlots.className = 'jinx-slots';
    const badges = document.createElement('div');
    badges.className = 'consumable-badges';
    this.elInsBadge = document.createElement('span');
    this.elInsBadge.className = 'badge';
    this.elInsBadge.textContent = '🛡 Insurance';
    this.elInsBadge.style.display = this.setup.insurance ? '' : 'none';
    badges.appendChild(this.elInsBadge);
    this.elAnchorBtn = document.createElement('button');
    this.elAnchorBtn.className = 'anchor-btn';
    this.elAnchorBtn.textContent = '⚓ Re-stop';
    this.elAnchorBtn.style.display = this.setup.spinAnchor ? '' : 'none';
    this.elAnchorBtn.disabled = true;
    this.elAnchorBtn.addEventListener('click', () => this.useAnchor());
    badges.appendChild(this.elAnchorBtn);
    counters.append(this.elSpinCount, this.elJinxSlots, badges);
    screen.appendChild(counters);

    // info chips: board pool, jinx risk, run count / star rules
    const info = document.createElement('div');
    info.className = 'info-row';
    this.elPoolChip = document.createElement('span');
    this.elPoolChip.className = 'chip';
    this.elRiskChip = document.createElement('span');
    this.elRiskChip.className = 'chip risk';
    this.elRunChip = document.createElement('span');
    this.elRunChip.className = 'chip';
    this.elRunChip.textContent = this.zone.zone === 0
      ? 'Daily Board'
      : `Run ${this.runNumber} · ★★ ≤${STAR_RUN_LIMIT} runs`;
    info.append(this.elPoolChip, this.elRiskChip, this.elRunChip);
    screen.appendChild(info);

    // actions
    const actions = document.createElement('div');
    actions.className = 'action-row';
    this.elSpinBtn = document.createElement('button');
    this.elSpinBtn.className = 'spin-btn';
    this.elSpinBtn.textContent = '▶ SPIN';
    this.elSpinBtn.addEventListener('click', () => {
      if (this.spinning) this.stopRequested = true;
      else void this.spin();
    });
    this.elBankBtn = document.createElement('button');
    this.elBankBtn.className = 'bank-btn';
    this.elBankBtn.addEventListener('click', () => this.bank());
    actions.append(this.elSpinBtn, this.elBankBtn);
    screen.appendChild(actions);

    this.elForfeitBtn = document.createElement('button');
    this.elForfeitBtn.className = 'forfeit-btn';
    this.elForfeitBtn.textContent = '🏳 Forfeit run';
    this.elForfeitBtn.addEventListener('click', () => this.forfeit());
    screen.appendChild(this.elForfeitBtn);

    this.root.appendChild(screen);
    this.syncHud();
  }

  private revealTile(i: number): void {
    this.visibleSet.add(i);
    const t = this.run.board.tiles[i];
    const { glyph, text } = tileLabel(t);
    this.tileEls[i].innerHTML = `<span class="glyph">${glyph}</span><span>${text}</span>`;
    this.tileEls[i].classList.remove('revealed');
    this.tileEls[i].classList.add(t.kind); // apply kind styling only on reveal
  }

  /** Flip one tile back face-down (used when the ring reshuffles). */
  private hideTile(i: number): void {
    this.visibleSet.delete(i);
    this.tileEls[i].className = 'tile';
    this.tileEls[i].innerHTML = '<span class="glyph">❔</span>';
  }

  /** Flip every remaining face-down tile (end-of-run "what could have been"),
   *  and mark the last tile landed on so the player sees where the run ended. */
  private revealAll(): void {
    this.run.board.tiles.forEach((_, i) => {
      if (!this.visibleSet.has(i)) this.revealTile(i);
    });
    if (this.lastLanded !== null) this.tileEls[this.lastLanded].classList.add('last-landed');
  }

  /** Jinx risk among currently face-down tiles. */
  private riskText(): string {
    const tiles = this.run.board.tiles;
    const down = tiles.filter((_, i) => !this.visibleSet.has(i));
    const jinxDown = down.filter((t) => t.kind === 'jinx').length;
    return `👁 ${jinxDown} jinx${jinxDown === 1 ? '' : 'es'} hidden · ${down.length} face-down`;
  }

  private syncHud(): void {
    const s = this.run;
    this.elSpinCount.innerHTML = `Spins <b>${s.spinsLeft}</b>`;
    this.elJinxSlots.innerHTML = '';
    for (let i = 0; i < MAX_JINXES; i++) {
      const slot = document.createElement('div');
      slot.className = `jinx-slot${i < s.jinxes ? ' filled' : ''}`;
      this.elJinxSlots.appendChild(slot);
    }
    this.elCenterTotal.textContent = fmt(s.cash);
    let sub = `${this.zone.name}`;
    if (this.zone.target > 0) {
      sub += ` · target ${fmt(this.zone.target)}`;
      if (s.jinxes === 0 && s.cash > 0) sub += ' · clean +10%';
      if (s.cash > this.zone.target) sub += ' · excess ×1.5';
    }
    this.elCenterSub.textContent = sub;
    this.elPoolChip.textContent = `💰 Pool ${fmt(this.pool)} · Top ${fmt(this.top)}`;
    this.elRiskChip.textContent = this.riskText();
    // BANK shows what banking now actually pays, not the raw total.
    const preview = bankPreview(s.cash, s.jinxes, this.zone.target);
    this.elBankBtn.innerHTML = `<span>🏦 BANK</span><span class="bank-amt">${fmt(preview)}</span>`;
    this.elBankBtn.classList.toggle('hot', this.zone.target > 0 && s.cash >= this.zone.target * 0.5);
    this.elBankBtn.disabled = this.spinning || s.over || s.cash <= 0;
    this.elSpinBtn.disabled = (!this.spinning && (s.over || s.spinsLeft <= 0));
    this.elInsBadge.classList.toggle('used', s.insuranceUsed);
    this.elAnchorBtn.disabled =
      this.spinning || s.over || !s.anchorAvailable || s.anchorUsed || !s.snapshot;
  }

  private flash(kind: 'red' | 'gold'): void {
    if (this.settings.reducedMotion) return;
    const f = document.createElement('div');
    f.className = `flash ${kind}`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 600);
  }

  /** Reshuffle tile positions (CSS-transitioned) and flip back any landed
   *  tiles that aren't peek-revealed, so no value can be timed repeatedly. */
  private reshuffle(): void {
    for (const i of [...this.visibleSet]) {
      if (!this.run.revealed.includes(i)) this.hideTile(i);
    }
    this.order = shuffle(this.rng, [...this.order]);
    this.order.forEach((boardIdx, slot) => this.positionTile(boardIdx, slot));
  }

  /** Press-your-luck spin: light slides continuously; press SPIN again to stop it
   *  where it is (with a short final hop). The board seed drives the rhythm;
   *  the player's timing picks the tile. */
  private async spin(): Promise<void> {
    if (this.spinning || this.run.over || this.run.spinsLeft <= 0) return;
    this.spinning = true;
    this.stopRequested = false;
    // Fresh read every spin: reshuffle + re-hide landed tiles (not the first spin).
    if (!this.firstSpin) {
      this.reshuffle();
      // Let the glide settle before the light starts moving.
      await sleep(this.settings.reducedMotion ? 0 : 420);
    }
    this.firstSpin = false;
    this.syncHud();
    this.elCenterEvent.textContent = 'Press SPIN to stop the light!';
    this.elCenterEvent.className = 'center-event';
    this.elSpinBtn.textContent = '⏹ STOP';

    const n = this.order.length;
    // Seeded rhythm: random start + random step interval (fast enough to feel skill-based)
    let slot = Math.floor(this.rng() * n);
    const interval = this.settings.reducedMotion ? 40 : 90 + Math.floor(this.rng() * 50);
    this.order.forEach((b, d) => this.tileEls[b].classList.toggle('lit', d === slot));
    sounds.tick();

    // Slide until the player requests a stop
    while (!this.stopRequested) {
      await sleep(interval);
      if (this.stopRequested) break;
      slot = (slot + 1) % n;
      this.order.forEach((b, d) => this.tileEls[b].classList.toggle('lit', d === slot));
      if (!this.settings.reducedMotion) sounds.tick();
    }

    // Final hop: 1 tile forward with a heavier tick so the stop feels physical
    await sleep(this.settings.reducedMotion ? 40 : 220);
    slot = (slot + 1) % n;
    this.order.forEach((b, d) => this.tileEls[b].classList.toggle('lit', d === slot));
    sounds.tick();
    await sleep(this.settings.reducedMotion ? 60 : 320);

    this.tileEls.forEach((el) => el.classList.remove('lit'));
    this.elSpinBtn.textContent = '▶ SPIN';
    const landedBoardIdx = this.order[slot];
    await this.resolveLanding(landedBoardIdx);
    this.spinning = false;
    this.syncHud();
    if (this.run.over) this.finish();
  }

  private async resolveLanding(idx: number): Promise<void> {
    this.revealTile(idx);
    this.lastLanded = idx;
    const preCash = this.run.cash;
    const ev = resolveTile(this.run, idx);
    const tileEl = this.tileEls[idx];
    switch (ev.type) {
      case 'cash':
        sounds.cash();
        this.setEvent(`+${fmt(ev.amount)} → ${fmt(this.run.cash)}`, 'gain');
        break;
      case 'bonus':
        sounds.prize();
        this.setEvent(`🎁 BONUS +${fmt(ev.amount)} → ${fmt(this.run.cash)}`, 'gain');
        break;
      case 'spin':
        sounds.spinBonus();
        if (ev.cash) {
          sounds.cash();
          this.setEvent(`🔄 +${ev.amount} SPIN${ev.amount > 1 ? 'S' : ''} + ${fmt(ev.cash)} → ${fmt(this.run.cash)}`, 'gain');
        } else {
          this.setEvent(`🔄 +${ev.amount} SPIN${ev.amount > 1 ? 'S' : ''}`, 'gain');
        }
        break;
      case 'insurance':
        sounds.prize();
        this.setEvent('🛡 INSURANCE ABSORBED THE JINX!', 'gain');
        break;
      case 'jinx': {
        sounds.jinx();
        this.flash('red');
        tileEl.classList.add('landed-jinx');
        this.setEvent('👁 JINX! Total wiped…', 'loss');
        await this.countDown(preCash);
        setTimeout(() => tileEl.classList.remove('landed-jinx'), 900);
        break;
      }
      default:
        break;
    }
  }

  /** Jinx wipe: visibly count the run total down to $0. */
  private async countDown(from: number): Promise<void> {
    if (from <= 0) return;
    this.elCenterTotal.classList.add('wiping');
    const dur = this.settings.reducedMotion ? 60 : 900;
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const v = Math.round(from * (1 - i / steps));
      this.elCenterTotal.textContent = fmt(v);
      if (!this.settings.reducedMotion) sounds.tally(steps - i);
      await sleep(dur / steps);
    }
    this.elCenterTotal.classList.remove('wiping');
    this.elCenterTotal.textContent = '$0';
  }

  private setEvent(text: string, cls: 'gain' | 'loss'): void {
    this.elCenterEvent.textContent = text;
    this.elCenterEvent.className = `center-event ${cls}`;
  }

  private useAnchor(): void {
    if (!anchorRestop(this.run)) return;
    sounds.vault();
    this.setEvent('⚓ ANCHOR — re-stop! Spin again.', 'gain');
    this.syncHud();
  }

  private bank(): void {
    if (this.run.over || this.run.cash <= 0) return;
    sounds.vault();
    this.flash('gold');
    bankRun(this.run);
    this.syncHud();
    this.finish();
  }

  private forfeit(): void {
    if (!this.forfeitArmed) {
      this.forfeitArmed = true;
      this.elForfeitBtn.classList.add('arming');
      this.elForfeitBtn.textContent = '⚠ Tap again to forfeit ($0 banked)';
      return;
    }
    forfeitRun(this.run);
    this.syncHud();
    this.finish();
  }

  private finish(): void {
    // Show the whole board first — the "what could have been" reveal —
    // then hand off to the run-end overlay.
    this.revealAll();
    setTimeout(() => this.onRunEnd(this.run), this.settings.reducedMotion ? 100 : 1400);
  }
}
