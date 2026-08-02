/** localStorage persistence: campaign state + settings (§5.3). */
import { newCampaign, type CampaignState } from './campaign.ts';

const SAVE_KEY = 'game-jinx-alley-save';

export interface Settings {
  sound: boolean;
  music: boolean;
  reducedMotion: boolean;
  colorBlind: boolean;
}

export interface SaveData {
  version: number;
  campaign: CampaignState;
  /** Daily Board: dateStr → best banked amount. */
  dailyScores: Record<string, number>;
  settings: Settings;
  hasSeenTutorial: boolean;
}

export const DEFAULT_SAVE: SaveData = {
  version: 1,
  campaign: newCampaign(),
  dailyScores: {},
  settings: { sound: true, music: true, reducedMotion: false, colorBlind: false },
  hasSeenTutorial: false,
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...structuredClone(DEFAULT_SAVE),
      ...parsed,
      campaign: { ...newCampaign(), ...(parsed.campaign ?? {}) },
      settings: { ...DEFAULT_SAVE.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

export function persistSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* storage full/blocked — play session continues without persistence */
  }
}

export function wipeSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
