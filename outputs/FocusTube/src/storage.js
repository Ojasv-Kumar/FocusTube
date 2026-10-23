import { CONFIG } from "./config.js";

export const DEFAULT_SETTINGS = Object.freeze({
  llmApiKey: "", youtubeApiKey: "", llmBaseUrl: CONFIG.LLM.baseUrl,
  fastModel: CONFIG.LLM.fastModel, smartModel: CONFIG.LLM.smartModel,
  retrievalProvider: CONFIG.Retrieval.defaultProvider, interestText: "",
  debugLogging: CONFIG.Behaviour.debugLogging, mockMode: false,
  activeMode: null, showComments: true, pickerSeen: false
});
const stringKeys = new Set(["llmApiKey", "youtubeApiKey", "llmBaseUrl", "fastModel", "smartModel", "interestText"]);
const boolKeys = new Set(["debugLogging", "mockMode", "showComments", "pickerSeen"]);
export function validateSettings(input = {}) {
  const out = { ...DEFAULT_SETTINGS };
  for (const key of stringKeys) if (typeof input[key] === "string") out[key] = input[key].trim();
  for (const key of boolKeys) if (typeof input[key] === "boolean") out[key] = input[key];
  if (["api", "html", "auto"].includes(input.retrievalProvider)) out.retrievalProvider = input.retrievalProvider;
  if (["learn", "interest", "curiosity", "relax"].includes(input.activeMode)) out.activeMode = input.activeMode;
  out.llmBaseUrl = out.llmBaseUrl.replace(/\/+$/, "");
  out.interestText = out.interestText.slice(0, CONFIG.ModesPicker.interestMaxChars);
  return out;
}
export async function getSettings(storageArea = globalThis.chrome?.storage?.local) {
  if (!storageArea) return { ...DEFAULT_SETTINGS };
  const values = await storageArea.get(null);
  return validateSettings(values || {});
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
