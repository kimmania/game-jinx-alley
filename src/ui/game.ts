/** Game screen: 18-tile DOM ring, sliding-light spin, SPIN/BANK, jinx wipe, consumables. */
import { generateBoard } from '../engine/board.ts';
import {
  anchorRestop, bankRun, createRun, forfeitRun, resolveTile, runPayout,
  type Board, type RunState, type Tile,
} from '../engine/run.ts';
import { mulberry32, randomSeed } from '../engine/rng.ts';
import type { CampaignState } from '../engine/campaign.ts';
import { PEEK_REVEAL_COUNT, type ZoneDef } from '../engine/zones.ts';
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
    case 'spin': return { glyph: '🔄', text: `+${t.amount}` };
    case 'bonus': return { glyph: '🎁', text: fmt(t.amount) };
    case 'jinx': return { glyph: '👁', text: 'JINX' };
  }
}

export class GameScreen {
  private run: RunState;
  private tileEls: HTMLElement[] = [];
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

  constructor(
    private root: HTMLElement,
    private zone: ZoneDef,
    campaign: CampaignState,
    private setup: RunSetup,
    private settings: Settings,
    private onRunEnd: (run: RunState) => void,
    /** Fixed board (Daily Board mode) — skips random generation + upgrades. */
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
    this.render();
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
      el.className = `tile ${t.kind}`;
      const { glyph, text } = tileLabel(t);
      const revealed = this.run.revealed.includes(i);
      // Face-down unless revealed by peek lens (jinxes/spins still show glyph shape only when revealed)
      el.innerHTML = revealed
        ? `<span class="glyph">${glyph}</span><span>${text}</span>`
        : '<span class="glyph">❔</span>';
      if (revealed) el.classList.add('revealed');
      const angle = (i / this.run.board.tiles.length) * Math.PI * 2 - Math.PI / 2;
      el.style.left = `${50 + 46 * Math.cos(angle)}%`;
      el.style.top = `${50 + 46 * Math.sin(angle)}%`;
      ring.appendChild(el);
      this.tileEls.push(el);
    });
    wrap.appendChild(ring);

    const center = document.createElement('div');
    center.className = 'board-center';
    center.innerHTML = `
      <div class="center-event"></div>
      <div class="center-total">$0</div>
      <div class="center-sub">${this.zone.name} · target ${fmt(this.zone.target)}</div>`;
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
    const t = this.run.board.tiles[i];
    const { glyph, text } = tileLabel(t);
    this.tileEls[i].innerHTML = `<span class="glyph">${glyph}</span><span>${text}</span>`;
    this.tileEls[i].classList.remove('revealed');
  }

  private syncHud(): void {
    const s = this.run;
    this.elSpinCount.innerHTML = `Spins <b>${s.spinsLeft}</b>`;
    this.elJinxSlots.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const slot = document.createElement('div');
      slot.className = `jinx-slot${i < s.jinxes ? ' filled' : ''}`;
      this.elJinxSlots.appendChild(slot);
    }
    this.elCenterTotal.textContent = fmt(s.cash);
    const cleanBonus = s.jinxes === 0 && s.cash > 0 ? ` · clean +10% so far` : '';
    this.elCenterSub.textContent = `${this.zone.name} · target ${fmt(this.zone.target)}${cleanBonus}`;
    this.elBankBtn.innerHTML = `<span>🏦 BANK</span><span class="bank-amt">${fmt(s.cash)}</span>`;
    this.elBankBtn.classList.toggle('hot', s.cash >= this.zone.target * 0.5);
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

  /** Press-your-luck spin: light slides continuously; press SPIN again to stop it
   *  where it is (with a short final hop). The board seed drives the rhythm;
   *  the player's timing picks the tile. */
  private async spin(): Promise<void> {
    if (this.spinning || this.run.over || this.run.spinsLeft <= 0) return;
    this.spinning = true;
    this.stopRequested = false;
    this.elCenterEvent.textContent = 'Press SPIN to stop the light!';
    this.elCenterEvent.className = 'center-event';
    this.elSpinBtn.textContent = '⏹ STOP';
    this.syncHud();

    const n = this.run.board.tiles.length;
    // Seeded rhythm: random start + random step interval (fast enough to feel skill-based)
    let idx = Math.floor(this.rng() * n);
    const interval = this.settings.reducedMotion ? 40 : 90 + Math.floor(this.rng() * 50);
    this.tileEls.forEach((el, i) => el.classList.toggle('lit', i === idx));
    sounds.tick();

    // Slide until the player requests a stop
    while (!this.stopRequested) {
      await sleep(interval);
      if (this.stopRequested) break;
      idx = (idx + 1) % n;
      this.tileEls.forEach((el, i) => el.classList.toggle('lit', i === idx));
      if (!this.settings.reducedMotion) sounds.tick();
    }

    // Final hop: 1 tile forward with a heavier tick so the stop feels physical
    await sleep(this.settings.reducedMotion ? 40 : 220);
    idx = (idx + 1) % n;
    this.tileEls.forEach((el, i) => el.classList.toggle('lit', i === idx));
    sounds.tick();
    await sleep(this.settings.reducedMotion ? 60 : 320);

    this.tileEls.forEach((el) => el.classList.remove('lit'));
    this.elSpinBtn.textContent = '▶ SPIN';
    await this.resolveLanding(idx);
    this.spinning = false;
    this.syncHud();
    if (this.run.over) this.finish();
  }

  private async resolveLanding(idx: number): Promise<void> {
    this.revealTile(idx);
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
        this.setEvent(`🔄 +${ev.amount} SPIN${ev.amount > 1 ? 'S' : ''}`, 'gain');
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
    // small delay so the last event is readable
    setTimeout(() => this.onRunEnd(this.run), this.settings.reducedMotion ? 100 : 900);
  }
}

export { runPayout };
