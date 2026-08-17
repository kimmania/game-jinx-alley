/** Jinx Alley — app entry: routing, persistence, top-level chrome. */
import { applyRunResult, spendConsumable } from './engine/campaign.ts';
import { dailyBoard, dailyScore, DAILY_ZONE } from './engine/daily.ts';
import { loadSave, persistSave, todayStr, type SaveData } from './engine/storage.ts';
import { zoneById } from './engine/zones.ts';
import type { Board, RunState } from './engine/run.ts';
import './ui/style.css';
import { GameScreen, type RunSetup } from './ui/game.ts';
import { renderZoneSelect, showDailyResult, showRunEnd, type ScreenCtx } from './ui/screens.ts';
import { applySettings, showSettings, showTutorial } from './ui/modals.ts';
import { sounds } from './ui/sounds.ts';

const app = document.getElementById('app')!;
const save: SaveData = loadSave();

// Test hook (?test=1): deterministic smoke-test state — no tutorial, no music,
// reduced motion (fast spins). Not persisted.
const TEST_MODE = new URLSearchParams(location.search).has('test');
if (TEST_MODE) {
  save.hasSeenTutorial = true;
  save.settings.reducedMotion = true;
  save.settings.music = false;
}

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
  startRun: (zoneId, setup, boardOverride) => startRun(zoneId, setup, boardOverride),
  showZones: () => showZones(),
  daily: () => daily(),
  dailyInfo: () => {
    const today = todayStr();
    const best = Math.max(0, ...Object.values(save.dailyScores));
    return { today, score: save.dailyScores[today], best };
  },
};

/** Daily Board (§5.3): one seeded attempt per day, score = banked amount. */
function daily(): void {
  const today = todayStr();
  const best = Math.max(0, ...Object.values(save.dailyScores));
  if (save.dailyScores[today] !== undefined) {
    showDailyResult(ctx, today, save.dailyScores[today], best, false);
    return;
  }
  sounds.startMusic();
  new GameScreen(
    screenRoot,
    DAILY_ZONE,
    save.campaign,
    { insurance: false, peekLens: false, spinAnchor: false },
    save.settings,
    (run: RunState) => {
      const score = dailyScore(run);
      save.dailyScores[today] = score;
      persist();
      showDailyResult(ctx, today, score, Math.max(best, score), true);
    },
    dailyBoard(today),
  );
}

function showZones(): void {
  syncBank();
  renderZoneSelect(ctx);
}

function startRun(zoneId: number, setup: RunSetup, boardOverride?: Board): void {
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
  }, boardOverride);
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
