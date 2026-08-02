/** Jinx Alley — app entry: routing, persistence, top-level chrome. */
import { applyRunResult, spendConsumable } from './engine/campaign.ts';
import { loadSave, persistSave, type SaveData } from './engine/storage.ts';
import { zoneById } from './engine/zones.ts';
import type { RunState } from './engine/run.ts';
import './ui/style.css';
import { GameScreen, type RunSetup } from './ui/game.ts';
import { renderZoneSelect, showRunEnd, type ScreenCtx } from './ui/screens.ts';
import { applySettings, showSettings, showTutorial } from './ui/modals.ts';
import { sounds } from './ui/sounds.ts';

const app = document.getElementById('app')!;
const save: SaveData = loadSave();

const persist = (): void => persistSave(save);

// Top chrome: title bar with bank + settings button.
const topbar = document.createElement('div');
topbar.className = 'topbar';
topbar.innerHTML = `<span class="title">🎡 JINX ALLEY</span>`;
const bankEl = document.createElement('span');
bankEl.className = 'icon-btn';
bankEl.style.pointerEvents = 'none';
const settingsBtn = document.createElement('button');
settingsBtn.className = 'icon-btn';
settingsBtn.innerHTML = '⚙ <span>Settings</span>';
settingsBtn.addEventListener('click', () =>
  showSettings({ settings: save.settings, persist }),
);
topbar.append(bankEl, settingsBtn);
app.appendChild(topbar);

const screenRoot = document.createElement('div');
screenRoot.style.display = 'flex';
screenRoot.style.flexDirection = 'column';
screenRoot.style.flex = '1';
app.appendChild(screenRoot);

const syncBank = (): void => {
  bankEl.textContent = `🏦 $${save.campaign.bank.toLocaleString()}`;
};

const ctx: ScreenCtx = {
  root: screenRoot,
  campaign: save.campaign,
  persist: () => {
    persist();
    syncBank();
  },
  startRun: (zoneId, setup) => startRun(zoneId, setup),
  showZones: () => showZones(),
};

function showZones(): void {
  syncBank();
  renderZoneSelect(ctx);
}

function startRun(zoneId: number, setup: RunSetup): void {
  const zone = zoneById(zoneId);
  // Spend the chosen consumables up front.
  if (setup.insurance) spendConsumable(save.campaign, 'insurance');
  if (setup.peekLens) spendConsumable(save.campaign, 'peekLens');
  if (setup.spinAnchor) spendConsumable(save.campaign, 'spinAnchor');
  persist();
  syncBank();
  sounds.startMusic();
  new GameScreen(screenRoot, zone, save.campaign, setup, save.settings, (run: RunState) => {
    const result = applyRunResult(save.campaign, run);
    persist();
    syncBank();
    showRunEnd(ctx, run, result);
  });
}

// Boot.
applySettings(save.settings);
showZones();
if (!save.hasSeenTutorial) {
  showTutorial(() => {
    save.hasSeenTutorial = true;
    persist();
  });
}

// Audio contexts need a user gesture; start music on first tap.
document.addEventListener(
  'pointerdown',
  () => {
    if (save.settings.music) sounds.startMusic();
  },
  { once: true },
);
