import { CONFIG } from "./config.js";

export const DEFAULT_SETTINGS = Object.freeze({
  activeMode: null, interestText: CONFIG.Settings.defaultInterestTopic,
  youtubeApiKey: "", retrievalProvider: CONFIG.Retrieval.defaultProvider,
  askForModeEveryTab: CONFIG.Settings.askForModeEveryTab,
  keepCommentsVisible: CONFIG.Settings.keepCommentsVisible,
  hideShortsInLearn: CONFIG.Settings.hideShortsInLearn,
  disableAutoplayInLearn: CONFIG.Settings.disableAutoplayInLearn,
  resultsPerSearch: CONFIG.Settings.resultsPerSearch, showReasons: CONFIG.Settings.showReasons,
  defaultInterestTopic: CONFIG.Settings.defaultInterestTopic,
  curiosityStrictness: CONFIG.Settings.curiosityStrictness, density: CONFIG.Settings.density,
  mockMode: CONFIG.Settings.mockMode, debugLogging: CONFIG.Settings.debugLogging
});
const obsoleteKeys = ["llmApiKey", "llmBaseUrl", "fastModel", "smartModel"];
export function validateSettings(input = {}) {
  const out = { ...DEFAULT_SETTINGS };
  for (const key of ["interestText", "defaultInterestTopic"]) if (typeof input[key] === "string") out[key] = input[key].trim().slice(0, 120);
  if (typeof input.youtubeApiKey === "string") out.youtubeApiKey = input.youtubeApiKey.trim();
  if (["auto", "api", "html"].includes(input.retrievalProvider)) out.retrievalProvider = input.retrievalProvider;
  // Older/local settings can retain "api" even when no YouTube key was ever
  // saved in this browser. In that state use the working HTML fallback rather
  // than leaving Interest and Curiosity feeds with no retrieval provider.
  if (out.retrievalProvider === "api" && !out.youtubeApiKey) out.retrievalProvider = "auto";
  for (const key of ["askForModeEveryTab", "keepCommentsVisible", "hideShortsInLearn", "disableAutoplayInLearn", "showReasons", "mockMode", "debugLogging"]) if (typeof input[key] === "boolean") out[key] = input[key];
  if ([5, 8, 10, 15].includes(Number(input.resultsPerSearch))) out.resultsPerSearch = Number(input.resultsPerSearch);
  if (["relaxed", "balanced", "strict"].includes(input.curiosityStrictness)) out.curiosityStrictness = input.curiosityStrictness;
  if (["compact", "comfortable"].includes(input.density)) out.density = input.density;
  if (["learn", "interest", "curiosity", "relax"].includes(input.activeMode)) out.activeMode = input.activeMode;
  out.interestText ||= out.defaultInterestTopic;
  return out;
}
export async function getSettings(storageArea = globalThis.chrome?.storage?.local) {
  if (!storageArea) return { ...DEFAULT_SETTINGS };
  const values = await storageArea.get(null);
  if (obsoleteKeys.some(key => key in (values || {}))) await storageArea.remove(obsoleteKeys);
  return validateSettings(values || {});
}
export async function saveSettings(partial, storageArea = globalThis.chrome?.storage?.local) {
  const current = await getSettings(storageArea);
  const changes = { ...partial };
  if (typeof changes.defaultInterestTopic === "string" && current.interestText === current.defaultInterestTopic && changes.interestText === undefined) changes.interestText = changes.defaultInterestTopic;
  const next = validateSettings({ ...current, ...changes });
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
