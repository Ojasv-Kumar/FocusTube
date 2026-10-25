import { CONFIG } from "./config.js";

export const DEFAULT_SETTINGS = Object.freeze({
  activeMode: null, interestText: CONFIG.Settings.defaultInterestTopic,
  youtubeApiKey: "", retrievalProvider: CONFIG.Retrieval.defaultProvider,
  ollamaEndpoint: CONFIG.LLM.defaultEndpoint, ollamaToken: "", ollamaModel: CONFIG.LLM.defaultModel,
  askForModeEveryTab: CONFIG.Settings.askForModeEveryTab,
  keepCommentsVisible: CONFIG.Settings.keepCommentsVisible,
  hideShortsInLearn: CONFIG.Settings.hideShortsInLearn,
  disableAutoplayInLearn: CONFIG.Settings.disableAutoplayInLearn,
  resultsPerSearch: CONFIG.Settings.resultsPerSearch, showReasons: CONFIG.Settings.showReasons,
  defaultInterestTopic: CONFIG.Settings.defaultInterestTopic,
  curiosityStrictness: CONFIG.Settings.curiosityStrictness, density: CONFIG.Settings.density,
  mockMode: CONFIG.Settings.mockMode, debugLogging: CONFIG.Settings.debugLogging,
  hideCommentsInLearn: false, hideSubscriptionsInLearn: true, theme: "dark",
  cameraEnabled: false, cameraCalibration: null
});
const obsoleteKeys = [
  "llmApiKey", "llmBaseUrl", "fastModel", "smartModel",
  "geminiApiKeys", "geminiFastModel", "geminiSmartModel", "geminiFallbackModels",
  "groqApiKey", "groqFastModel", "groqSmartModel", "groqFallbackModels",
  "openrouterApiKey", "openrouterFastModel", "openrouterSmartModel", "openrouterFallbackModels"
];
function privateIpv4(value) {
  const match = /^(?:https?:\/\/)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(value || "").trim());
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some(octet => octet < 0 || octet > 255)) return false;
  const [a, b] = octets;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
export function validateSettings(input = {}) {
  const out = { ...DEFAULT_SETTINGS };
  for (const key of ["interestText", "defaultInterestTopic"]) if (typeof input[key] === "string") out[key] = input[key].trim().slice(0, 120);
  if (typeof input.youtubeApiKey === "string") out.youtubeApiKey = input.youtubeApiKey.trim();
  if (typeof input.ollamaEndpoint === "string" && input.ollamaEndpoint.trim()) {
    const value = input.ollamaEndpoint.trim().replace(/\/+$/, "");
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && privateIpv4(url.hostname) && url.port === "11435" && !url.username && !url.password && !url.search && !url.hash && (url.pathname === "/" || url.pathname === "")) out.ollamaEndpoint = url.origin;
    } catch { /* invalid endpoint falls back to the safe placeholder */ }
  }
  if (typeof input.ollamaToken === "string") out.ollamaToken = input.ollamaToken.trim().slice(0, 256);
  if (typeof input.ollamaModel === "string" && /^[A-Za-z0-9_.:-]{1,120}$/.test(input.ollamaModel.trim())) out.ollamaModel = input.ollamaModel.trim();
  if (["auto", "api", "html"].includes(input.retrievalProvider)) out.retrievalProvider = input.retrievalProvider;
  if (out.retrievalProvider === "api" && !out.youtubeApiKey) out.retrievalProvider = "auto";
  for (const key of ["askForModeEveryTab", "keepCommentsVisible", "hideShortsInLearn", "disableAutoplayInLearn", "showReasons", "mockMode", "debugLogging"]) if (typeof input[key] === "boolean") out[key] = input[key];
  if ([15, 30, 50].includes(Number(input.resultsPerSearch))) out.resultsPerSearch = Number(input.resultsPerSearch);
  if (["relaxed", "balanced", "strict"].includes(input.curiosityStrictness)) out.curiosityStrictness = input.curiosityStrictness;
  if (["compact", "comfortable"].includes(input.density)) out.density = input.density;
  if (typeof input.hideCommentsInLearn === "boolean") out.hideCommentsInLearn = input.hideCommentsInLearn;
  if (typeof input.hideSubscriptionsInLearn === "boolean") out.hideSubscriptionsInLearn = input.hideSubscriptionsInLearn;
  if (["dark", "light"].includes(input.theme)) out.theme = input.theme;
  if (typeof input.cameraEnabled === "boolean") out.cameraEnabled = input.cameraEnabled;
  const calibration = input.cameraCalibration;
  if (calibration && calibration.version === 1 && Number.isFinite(calibration.yaw) && Number.isFinite(calibration.pitch)) {
    out.cameraCalibration = { version: 1, yaw: calibration.yaw, pitch: calibration.pitch };
  }
  if (!out.cameraCalibration) out.cameraEnabled = false;
  if (["learn", "curiosity", "relax"].includes(input.activeMode)) out.activeMode = input.activeMode;
  out.interestText ||= out.defaultInterestTopic;
  return out;
}
export async function getSettings(storageArea = globalThis.chrome?.storage?.local) {
  if (!storageArea) return { ...DEFAULT_SETTINGS };
  const values = await storageArea.get(null);
  if (obsoleteKeys.some(key => key in (values || {}))) await storageArea.remove(obsoleteKeys.filter(key => key in values));
  const migrated = { ...(values || {}) };
  const settings = validateSettings(migrated);
  await storageArea.set(settings);
  return settings;
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
