import { MESSAGE, isFocusTubeMessage } from "../messages.js";
import { getSettings, saveSettings } from "../storage.js";
import { logger, setDebug } from "../logger.js";
import { friendlyError } from "../errors.js";
import { makeCorrelationId } from "../utils.js";
import { Cache } from "./cache.js";
import { runPipeline } from "./pipeline.js";
import { LlmClient } from "./llm-client.js";
import { CONFIG } from "../config.js";
import { createYouTubeTabFetch } from "./retrieval/youtube-tab-fetch.js";
import { ApiProvider } from "./retrieval/api-provider.js";

const cache = new Cache(chrome.storage.local);
const CAMERA_NAMESPACE = "focustube.camera";
const playbackByTab = new Map();
const cameraFaultTabs = new Set();
const offscreenUrl = chrome.runtime.getURL("src/camera/offscreen.html");
let monitorSignature = "", monitorTabId = null, monitorQueue = Promise.resolve();
function publicSettings(settings) {
  const { youtubeApiKey, ollamaToken, ...safe } = settings;
  return { ...safe, hasYoutubeApiKey: Boolean(youtubeApiKey), hasOllamaToken: Boolean(ollamaToken) };
}
function extensionPage(sender) { return typeof sender?.url === "string" && sender.url.startsWith(chrome.runtime.getURL("")); }
function respondWith(promise, sendResponse) {
  Promise.resolve(promise).then(result => sendResponse(result)).catch(error => sendResponse({ ok: false, ...friendlyError(error) }));
  return true;
}

async function hasCameraOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [offscreenUrl] });
  return contexts.length > 0;
}
async function ensureCameraOffscreen() {
  if (!(await hasCameraOffscreen())) await chrome.offscreen.createDocument({ url: "src/camera/offscreen.html", reasons: ["USER_MEDIA"], justification: "Analyze camera frames locally for optional face and open-palm attention assistance during video playback." });
  // createDocument resolves at document load; its module script may not have
  // installed the runtime listener yet. A ping avoids dropping MONITOR_START.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await chrome.runtime.sendMessage({ namespace: CAMERA_NAMESPACE, type: "OFFSCREEN_PING" });
      if (response?.ready) return;
    } catch { /* Module listener is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("The camera worker did not become ready.");
}
async function sendOffscreen(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ namespace: CAMERA_NAMESPACE, type, payload });
  if (!response?.ok) throw new Error("Camera monitor did not respond.");
}
function notifyTab(tabId, type, payload = {}) {
  void chrome.tabs.sendMessage(tabId, { namespace: CAMERA_NAMESPACE, type, payload }).catch(() => {});
}
async function refreshCameraMonitor() {
  const settings = await getSettings();
  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tabId = activeTabs[0]?.id;
  const state = tabId == null ? null : playbackByTab.get(tabId);
  const isOn = Boolean(settings.cameraEnabled && settings.cameraCalibration && state?.visible && ["learn", "curiosity", "relax"].includes(state?.mode) && state?.isWatch && (state.isPlaying || state.gesturePaused));
  const desired = isOn ? { tabId, calibration: settings.cameraCalibration, gestureOnly: state.mode !== "learn" || (!state.isPlaying && state.gesturePaused) } : null;
  const signature = desired ? JSON.stringify(desired) : "";
  if (signature === monitorSignature) return;
  const previousTabId = monitorTabId;
  monitorSignature = signature; monitorTabId = desired?.tabId ?? null;
  if (!desired || cameraFaultTabs.has(desired.tabId)) {
    if (await hasCameraOffscreen()) {
      try { await sendOffscreen("MONITOR_STOP"); } catch { /* It may have closed during extension reload. */ }
      try { await chrome.offscreen.closeDocument(); } catch { /* Already closed. */ }
    }
    if (previousTabId != null && previousTabId !== desired?.tabId) notifyTab(previousTabId, "ATTENTION_CLEAR");
    return;
  }
  try {
    await ensureCameraOffscreen();
    await sendOffscreen("MONITOR_START", desired);
  } catch (error) {
    cameraFaultTabs.add(desired.tabId); monitorSignature = "";
    notifyTab(desired.tabId, "CAMERA_ERROR", { error: error?.message || "OFFSCREEN_FAILED" });
    try { if (await hasCameraOffscreen()) await chrome.offscreen.closeDocument(); } catch { /* Best-effort cleanup. */ }
  }
}
function queueCameraRefresh() { monitorQueue = monitorQueue.then(refreshCameraMonitor).catch(() => {}); }
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.namespace !== CAMERA_NAMESPACE) return false;
  if (message.type === "PLAYBACK_STATE") {
    const tabId = sender?.tab?.id;
    if (tabId == null || !sender.url?.startsWith("https://www.youtube.com/")) return false;
    playbackByTab.set(tabId, message.payload || {}); queueCameraRefresh(); sendResponse({ ok: true }); return false;
  }
  if (message.type === "OPEN_CAMERA_SETUP") {
    if (sender.tab?.id == null || !sender.url?.startsWith("https://www.youtube.com/")) return false;
    chrome.tabs.create({ url: chrome.runtime.getURL("src/camera/setup.html") }, tab => {
      if (chrome.runtime.lastError) sendResponse({ ok: false });
      else sendResponse({ ok: true, tabId: tab?.id });
    });
    return true;
  }
  if (message.type === "MONITOR_START" || message.type === "MONITOR_STOP") return false;
  if (!sender.url || sender.url !== offscreenUrl) return false;
  const payload = message.payload || {}, tabId = payload.tabId;
  if (message.type === "ATTENTION_ALERT" && tabId != null) {
    const state = playbackByTab.get(tabId);
    if (state?.visible && state?.isPlaying && state?.mode === "learn") notifyTab(tabId, "ATTENTION_ALERT", { kind: payload.kind });
    sendResponse({ ok: true }); return false;
  }
  if (message.type === "ATTENTION_CLEAR" && tabId != null) { notifyTab(tabId, "ATTENTION_CLEAR"); sendResponse({ ok: true }); return false; }
  if (message.type === "OPEN_PALM" && tabId != null) {
    const state = playbackByTab.get(tabId);
    if (state?.visible && state?.isWatch && ["learn", "curiosity", "relax"].includes(state?.mode) && (state.isPlaying || state.gesturePaused)) notifyTab(tabId, "ATTENTION_GESTURE");
    sendResponse({ ok: true }); return false;
  }
  if (message.type === "PLAYBACK_SEEK" && tabId != null) {
    const state = playbackByTab.get(tabId), delta = payload.delta;
    if (state?.visible && state?.isWatch && state?.isPlaying && ["learn", "curiosity", "relax"].includes(state?.mode) && (delta === 10 || delta === -10)) notifyTab(tabId, "ATTENTION_SEEK", { delta });
    sendResponse({ ok: true }); return false;
  }
  if (message.type === "PLAYBACK_SPEED" && tabId != null && typeof payload.active === "boolean") {
    const state = playbackByTab.get(tabId);
    if (state?.visible && state?.isWatch && ["learn", "curiosity", "relax"].includes(state?.mode) && (!payload.active || state.isPlaying)) notifyTab(tabId, "ATTENTION_PLAYBACK_SPEED", { active: payload.active });
    sendResponse({ ok: true }); return false;
  }
  if (message.type === "CAMERA_ERROR" && tabId != null) {
    cameraFaultTabs.add(tabId); monitorSignature = ""; notifyTab(tabId, "CAMERA_ERROR", { error: payload.error }); queueCameraRefresh(); sendResponse({ ok: true }); return false;
  }
  if (message.type === "OFFSCREEN_READY") { sendResponse({ ok: true }); return false; }
  return false;
});
chrome.tabs.onRemoved.addListener(tabId => { playbackByTab.delete(tabId); cameraFaultTabs.delete(tabId); queueCameraRefresh(); });
chrome.tabs.onActivated.addListener(() => { monitorSignature = ""; queueCameraRefresh(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.activeMode || changes.cameraEnabled || changes.cameraCalibration)) { cameraFaultTabs.clear(); monitorSignature = ""; queueCameraRefresh(); }
});
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
        if (!["learn", "curiosity", "relax"].includes(mode)) return { ok: false, errorCode: "INVALID_MODE", userMessage: "Choose Learn, Curiosity, or Relax." };
        const remainingMs = Math.max(0, Number(settings.learnModeLockUntil || 0) - Date.now());
        if (mode !== "learn" && settings.activeMode === "learn" && remainingMs > 0) return { ok: false, errorCode: "LEARN_MODE_LOCKED", remainingMs, userMessage: "Learn mode is locked until its timer ends." };
        const updated = await saveSettings({ activeMode: mode });
        return { ok: true, settings: publicSettings(updated) };
      }
      case MESSAGE.SET_LEARN_TIMER: {
        if (sender?.tab?.id == null || !sender.url?.startsWith("https://www.youtube.com/") && !sender.url?.startsWith("https://youtube.com/")) return { ok: false, errorCode: "FORBIDDEN", userMessage: "Set the Learn timer from YouTube in Learn mode." };
        const durationSeconds = Number(message.payload?.durationSeconds);
        if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 86_400) return { ok: false, errorCode: "INVALID_TIMER", userMessage: "Choose a timer between 00:00:01 and 24:00:00." };
        if (settings.activeMode !== "learn") return { ok: false, errorCode: "LEARN_MODE_REQUIRED", userMessage: "Switch to Learn mode before setting its timer." };
        const learnModeLockUntil = Date.now() + durationSeconds * 1000;
        const updated = await saveSettings({ learnModeLockUntil });
        return { ok: true, settings: publicSettings(updated), learnModeLockUntil };
      }
      case MESSAGE.RUN_PIPELINE:
        {
          const tabId = sender?.tab?.id;
          const payload = message.payload || {};
          const startedAt = Date.now();
          logger.info("worker", `received pipeline request ${correlationId}: mode=${payload.mode || "learn"} action=${payload.action || "search"} tab=${Number.isInteger(tabId) ? tabId : "none"}`);
          const htmlFetchImpl = createYouTubeTabFetch({ scripting: chrome.scripting, tabId, fallbackFetch: (...args) => globalThis.fetch(...args) });
          const onProgress = update => {
            if (!Number.isInteger(tabId)) return;
            try { chrome.tabs.sendMessage(tabId, { namespace: "focustube-progress", type: "PIPELINE_PROGRESS", correlationId, payload: update }, () => { void chrome.runtime.lastError; }); }
            catch { /* Progress is optional. */ }
          };
          try {
            const result = await runPipeline(payload, settings, { cache, correlationId, htmlFetchImpl, onProgress });
            logger.info("worker", `pipeline reply ${correlationId}: ok=${Boolean(result?.ok)} elapsedMs=${Date.now() - startedAt} error=${result?.errorCode || "none"}`);
            return result;
          } catch (error) {
            logger.error("worker", `pipeline failed ${correlationId} after ${Date.now() - startedAt}ms`, error?.code || error?.name || "UNKNOWN");
            throw error;
          }
        }
      case MESSAGE.TEST_LLM: {
        if (!extensionPage(sender)) return { ok: false, errorCode: "FORBIDDEN", userMessage: "Open FocusTube Options to test the remote Ollama bridge." };
        return { ok: true, health: await new LlmClient(settings).testConnection() };
      }
      case MESSAGE.TEST_YOUTUBE_API: {
        if (!extensionPage(sender)) return { ok: false, errorCode: "FORBIDDEN", userMessage: "Open FocusTube options to test the YouTube API." };
        if (!settings.youtubeApiKey) return { ok: false, errorCode: "MISSING_YOUTUBE_API_KEY", userMessage: "Add and save a YouTube Data API v3 key first." };
        const health = await new ApiProvider({ apiKey: settings.youtubeApiKey }).testConnection();
        logger.info("youtube-api", `connection test succeeded; results=${health.resultCount}`);
        return { ok: true, health };
      }
      case MESSAGE.OLLAMA_HEALTH:
        return { ok: true, health: await new LlmClient(settings).health() };
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

self.addEventListener("error", event => { logger.error("worker", "uncaught worker error", event.message || "unknown"); });
self.addEventListener("unhandledrejection", event => { logger.error("worker", "unhandled worker rejection", event.reason?.code || event.reason?.name || "unknown"); event.preventDefault(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.debugLogging) setDebug(Boolean(changes.debugLogging.newValue));
});
