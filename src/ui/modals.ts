/** Settings modal (persisted) + first-launch tutorial overlay. */
import type { Settings } from '../engine/storage.ts';
import { sounds } from './sounds.ts';

export interface ModalCtx {
  settings: Settings;
  persist: () => void;
}

function applySettings(s: Settings): void {
  document.body.classList.toggle('reduced-motion', s.reducedMotion);
  document.body.classList.toggle('color-blind', s.colorBlind);
  sounds.soundOn = s.sound;
  sounds.musicOn = s.music;
  if (s.music) sounds.startMusic();
  else sounds.stopMusic();
}

export { applySettings };

const SETTING_ROWS: { key: keyof Settings; icon: string; label: string }[] = [
  { key: 'sound', icon: '🔊', label: 'Sound effects' },
  { key: 'music', icon: '🎵', label: 'Music' },
  { key: 'reducedMotion', icon: '🐢', label: 'Reduced motion' },
  { key: 'colorBlind', icon: '👁', label: 'Color-blind cues' },
];

export function showSettings(ctx: ModalCtx): void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = '<h2>⚙ SETTINGS</h2>';
  for (const row of SETTING_ROWS) {
    const line = document.createElement('div');
    line.className = 'setting-row';
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.innerHTML = `<span>${row.icon}</span><span>${row.label}</span>`;
    const toggle = document.createElement('button');
    toggle.className = `toggle${ctx.settings[row.key] ? ' on' : ''}`;
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-label', row.label);
    toggle.setAttribute('aria-checked', String(ctx.settings[row.key]));
    toggle.addEventListener('click', () => {
      ctx.settings[row.key] = !ctx.settings[row.key];
      toggle.classList.toggle('on', ctx.settings[row.key]);
      toggle.setAttribute('aria-checked', String(ctx.settings[row.key]));
      applySettings(ctx.settings);
      ctx.persist();
      sounds.tick();
    });
    line.append(lbl, toggle);
    modal.appendChild(line);
  }
  const close = document.createElement('button');
  close.className = 'close-btn';
  close.textContent = 'DONE';
  close.addEventListener('click', () => overlay.remove());
  modal.appendChild(close);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

const TUTORIAL = [
  'Welcome to <b>Jinx Alley</b>! Step the light around the boardwalk wheel. <b>SPIN</b> to land on cash tiles and build your run total. Before each spin the tiles <b>shift and flip back down</b> — every landing is a fresh read.',
  'Beware the <b>JINX</b> tiles — landing on one wipes your run total to <b>$0</b>. Four Jinxes and the run is busted!',
  'Hit <b>BANK</b> anytime to lock your total into the campaign bank — safe forever. Run out of spins and you auto-bank.',
  'Bank with <b>0 Jinxes</b> for a <b>+10% clean-run bonus</b>. Bank above the zone target and the excess pays <b>×1.5</b>.',
  'Spend banked cash in the <b>Shop</b>: permanent board upgrades and one-run protections like <b>Jinx Insurance</b>, <b>Peek Lens</b>, and <b>Spin Anchor</b>. Clear all 4 zones!',
];

export function showTutorial(onDone: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  let page = 0;
  const text = document.createElement('div');
  text.className = 'tutorial-text';
  const next = document.createElement('button');
  next.className = 'close-btn';
  const renderPage = (): void => {
    text.innerHTML = TUTORIAL[page];
    next.textContent = page < TUTORIAL.length - 1 ? `NEXT (${page + 1}/${TUTORIAL.length})` : "LET'S PLAY! 🎡";
  };
  modal.innerHTML = '<h2>🎡 HOW TO PLAY</h2>';
  modal.appendChild(text);
  next.addEventListener('click', () => {
    sounds.cash();
    if (page < TUTORIAL.length - 1) {
      page += 1;
      renderPage();
    } else {
      overlay.remove();
      onDone();
    }
  });
  modal.appendChild(next);
  renderPage();
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
