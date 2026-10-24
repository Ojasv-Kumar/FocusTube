import { CONFIG } from "./config.js";

export const DEFAULT_SETTINGS = Object.freeze({
  activeMode: null,
  hideCommentsInLearn: CONFIG.Settings.hideCommentsInLearn,
  hideSubscriptionsInLearn: CONFIG.Settings.hideSubscriptionsInLearn,
  theme: CONFIG.Settings.theme
});

const obsoleteKeys = [
  "youtubeApiKey", "geminiApiKeys", "geminiFastModel", "geminiSmartModel", "geminiFallbackModels",
  "retrievalProvider", "llmApiKey", "llmBaseUrl", "fastModel", "smartModel", "focustube.apiQuota",
  "interestText", "defaultInterestTopic", "curiosityStrictness", "mockMode", "debugLogging", "showReasons",
  "hideShortsInLearn", "disableAutoplayInLearn", "keepCommentsVisible", "density", "askForModeEveryTab", "resultsPerSearch"
];

export function validateSettings(input = {}) {
  const out = { ...DEFAULT_SETTINGS };
  if (["learn", "relax"].includes(input.activeMode)) out.activeMode = input.activeMode;
  if (typeof input.hideCommentsInLearn === "boolean") out.hideCommentsInLearn = input.hideCommentsInLearn;
  if (typeof input.hideSubscriptionsInLearn === "boolean") out.hideSubscriptionsInLearn = input.hideSubscriptionsInLearn;
  if (["dark", "light"].includes(input.theme)) out.theme = input.theme;
  return out;
}

export async function getSettings(storageArea = globalThis.chrome?.storage?.local) {
  if (!storageArea) return { ...DEFAULT_SETTINGS };
  const values = await storageArea.get(null) || {};
  const stale = obsoleteKeys.filter(key => key in values);
  if (stale.length) await storageArea.remove(stale);
  return validateSettings(values);
}

export async function saveSettings(partial, storageArea = globalThis.chrome?.storage?.local) {
  const current = await getSettings(storageArea);
  const next = validateSettings({ ...current, ...partial });
  if (storageArea) await storageArea.set(next);
  return next;
}

export async function clearStoredKeys(prefix = "focustube.cache.", storageArea = globalThis.chrome?.storage?.local) {
  if (!storageArea) return 0;
  const all = await storageArea.get(null);
  const keys = Object.keys(all).filter(key => key.startsWith(prefix));
  if (keys.length) await storageArea.remove(keys);
  return keys.length;
}
