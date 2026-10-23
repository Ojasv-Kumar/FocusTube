import { MESSAGE, isFocusTubeMessage } from "../messages.js";
import { getSettings, saveSettings, validateSettings } from "../storage.js";
import { logger, setDebug } from "../logger.js";
import { friendlyError } from "../errors.js";
import { makeCorrelationId } from "../utils.js";
import { Cache } from "./cache.js";
import { runPipeline } from "./pipeline.js";
import { LlmClient } from "./llm-client.js";
import { ApiProvider } from "./retrieval/api-provider.js";
import { CONFIG } from "../config.js";

const cache = new Cache(chrome.storage.local);
function publicSettings(settings) {
  const { llmApiKey, youtubeApiKey, ...safe } = settings;
  return { ...safe, hasLlmApiKey: Boolean(llmApiKey), hasYoutubeApiKey: Boolean(youtubeApiKey) };
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
        if (!extensionPage(sender)) return { ok: false, errorCode: "FORBIDDEN", userMessage: "Open FocusTube options to change provider settings." };
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
        if (!extensionPage(sender)) return { ok: false, errorCode: "FORBIDDEN", userMessage: "Use the FocusTube options page to test provider settings." };
        const client = new LlmClient(settings);
        const data = await client.completeJson({ system: "Return valid JSON only.", user: "Return {\"ok\":true}.", model: settings.fastModel, maxTokens: 32, temperature: 0, correlationId });
        return data?.ok === true ? { ok: true, message: "LLM connection succeeded." } : { ok: false, errorCode: "PARSE_ERROR", userMessage: "The LLM test response did not match the expected shape." };
      }
      case MESSAGE.TEST_YOUTUBE_API: {
        if (!extensionPage(sender)) return { ok: false, errorCode: "FORBIDDEN", userMessage: "Use the FocusTube options page to test your YouTube API key." };
        const provider = new ApiProvider({ apiKey: settings.youtubeApiKey });
        const videos = await provider.search("YouTube", { maxResults: 1 });
        return { ok: true, message: `YouTube API connection succeeded (${videos.length} result).` };
      }
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
