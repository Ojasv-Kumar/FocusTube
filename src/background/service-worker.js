import { MESSAGE, isFocusTubeMessage } from "../messages.js";
import { getSettings, saveSettings, validateSettings } from "../storage.js";
import { logger, setDebug } from "../logger.js";
import { friendlyError } from "../errors.js";
import { makeCorrelationId } from "../utils.js";
import { Cache } from "./cache.js";
import { runPipeline } from "./pipeline.js";
import { LlmClient } from "./llm-client.js";
import { CONFIG } from "../config.js";

const cache = new Cache(chrome.storage.local);
function publicSettings(settings) {
  return { ...settings };
}
function extensionPage(sender) { return typeof sender?.url === "string" && sender.url.startsWith(chrome.runtime.getURL("")); }
function respondWith(promise, sendResponse) {
  Promise.resolve(promise).then(result => sendResponse(result)).catch(error => sendResponse({ ok: false, ...friendlyError(error) }));
  return true;
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isFocusTubeMessage(message)) return false;
  const correlationId = message.correlationId || makeCorrelationId();
  respondWith((async () => {
    const settings = await getSettings();
    setDebug(settings.debugLogging);
    switch (message.type) {
      case MESSAGE.GET_SETTINGS:
        return { ok: true, settings: publicSettings(settings) };
      case MESSAGE.SAVE_SETTINGS: {
        if (!extensionPage(sender)) return { ok: false, errorCode: "FORBIDDEN", userMessage: "Open FocusTube options to change preferences." };
        const updated = await saveSettings(message.payload || {});
        setDebug(updated.debugLogging);
        return { ok: true, settings: publicSettings(updated) };
      }
      case MESSAGE.SET_MODE: {
        const mode = message.payload?.mode;
        if (!["learn", "interest", "curiosity", "relax"].includes(mode)) return { ok: false, errorCode: "INVALID_MODE", userMessage: "Choose one of the four FocusTube modes." };
        const interestText = String(message.payload?.interestText ?? settings.interestText).slice(0, CONFIG.ModesPicker.interestMaxChars).trim();
        const updated = await saveSettings({ activeMode: mode, interestText });
        return { ok: true, settings: publicSettings(updated) };
      }
      case MESSAGE.RUN_PIPELINE:
        return runPipeline(message.payload || {}, settings, { cache, correlationId });
      case MESSAGE.TEST_LLM: {
        const client = new LlmClient(settings);
        return { ok: true, health: await client.health() };
      }
      case MESSAGE.BACKEND_HEALTH: return { ok: true, health: await new LlmClient(settings).health() };
      case MESSAGE.CLEAR_CACHE:
        if (!extensionPage(sender)) return { ok: false, errorCode: "FORBIDDEN", userMessage: "Use FocusTube options to clear its cache." };
        return { ok: true, cleared: await cache.clear() };
      case MESSAGE.PREWARM: {
        const output = [];
        for (const query of message.payload?.queries || []) output.push(await runPipeline({ mode: "learn", query }, settings, { cache, correlationId }));
        return { ok: true, results: output };
      }
      case MESSAGE.SELECTOR_HEALTH:
        return { ok: false, errorCode: "LOCAL_ONLY", userMessage: "Run window.FocusTube.selectorHealth() in the YouTube console." };
      default: return { ok: false, errorCode: "UNKNOWN_MESSAGE", userMessage: "FocusTube received an unsupported request." };
    }
  })(), sendResponse);
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.debugLogging) setDebug(Boolean(changes.debugLogging.newValue));
});
self.addEventListener("error", event => { logger.error("worker", "uncaught worker error", event.message || "unknown"); });
self.addEventListener("unhandledrejection", event => { logger.error("worker", "unhandled worker rejection", event.reason?.code || event.reason?.name || "unknown"); event.preventDefault(); });
