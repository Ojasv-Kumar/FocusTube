import { CONFIG } from "../config.js";
import { DEFAULT_SETTINGS } from "../storage.js";
import { MESSAGE, sendMessage } from "../messages.js";
import { logger } from "../logger.js";
import { makeCorrelationId, normalizeQuery } from "../utils.js";
import { SELECTORS, queryFirst, selectorHealth, pageTypeFromUrl } from "../selectors.js";
import { applyMode, applyTheme, setPageType, setCuratedSearch, enterPickerState } from "./mode-manager.js";
import { openModePicker } from "./mode-picker.js";
import { createModeSwitcher } from "./mode-switcher.js";
import { createResultsUI } from "./results-ui.js";
import { createHomeUI } from "./home-ui.js";
import { startAutoplayGuard } from "./autoplay.js";

let settings = { ...DEFAULT_SETTINGS };
let activeMode = "relax", picker = null, switcher = null, resultsUI = null, homeUI = null;
let autoplayCleanup = null, requestToken = 0, navTimer = null, observer = null, navigationCleanup = null;
let disposed = false, lastUrl = location.href, currentPageType = "other";

function hideCurrentPanels() {
  resultsUI?.dispose(); resultsUI = null; homeUI?.dispose(); homeUI = null;
  autoplayCleanup?.(); autoplayCleanup = null; setCuratedSearch(false);
}
function safeSessionGet(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
function safeSessionSet(key, value) { try { sessionStorage.setItem(key, value); } catch { /* Optional first-run prompt state. */ } }
function updateSwitcher() { switcher?.update(activeMode); }
function syncSwitcher() {
  if (!CONFIG.Behaviour.showFloatingSwitcher || activeMode === "relax") { switcher?.dispose(); switcher = null; return; }
  if (!switcher) switcher = createModeSwitcher(openPicker);
  updateSwitcher();
}
function persistMode(mode) {
  activeMode = ["learn", "relax"].includes(mode) ? mode : "relax";
  settings = { ...settings, activeMode };
  syncSwitcher();
  if (activeMode === "learn") watchNavigation(); else navigationCleanup?.();
  applyPageBehavior("mode-change");
  void sendMessage(MESSAGE.SET_MODE, { mode: activeMode }, makeCorrelationId());
}
function openPicker() {
  if (picker?.host?.isConnected) return;
  requestToken += 1; hideCurrentPanels(); enterPickerState();
  picker = openModePicker({
    currentMode: activeMode,
    required: Boolean(document.documentElement?.hasAttribute("data-focustube-gate")),
    onSelect: mode => { picker = null; safeSessionSet("focustube.pickerSeen", "1"); window.__FOCUSTUBE_GATE__?.release(); persistMode(mode); },
    onClose: () => { picker = null; void applyPageBehavior("picker-closed"); }
  });
  if (!picker) void applyPageBehavior("picker-unavailable");
}
async function readSettings() {
  const response = await sendMessage(MESSAGE.GET_SETTINGS);
  if (response?.ok && response.settings) return { ...DEFAULT_SETTINGS, ...response.settings };
  logger.warn("content", "settings unavailable; using Relax fallback", response?.errorCode || "unknown");
  return { ...DEFAULT_SETTINGS, activeMode: "relax" };
}
function installHealthCheck() {
  try { chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "focustube-health-check") return false;
    try { sendResponse({ ok: true, pageType: pageTypeFromUrl(location.href), report: selectorHealth(document) }); }
    catch { sendResponse({ ok: false, errorCode: "HEALTH_CHECK_FAILED" }); }
    return false;
  }); } catch { /* Extension may have been reloaded. */ }
}
function waitForElement(selectors) {
  const immediate = queryFirst(selectors);
  if (immediate) return Promise.resolve(immediate);
  return new Promise(resolve => {
    const started = Date.now();
    const retry = () => { const match = queryFirst(selectors); if (match || Date.now() - started >= CONFIG.Behaviour.maxWaitMs) resolve(match); else setTimeout(retry, CONFIG.Behaviour.selectorRetryMs); };
    retry();
  });
}
function makePipelineRequest(query, token) {
  return sendMessage(MESSAGE.RUN_PIPELINE, { mode: "learn", query, action: "search" }, makeCorrelationId()).then(result => disposed || token !== requestToken || activeMode !== "learn" ? null : result);
}
async function applyPageBehavior(reason = "navigation") {
  if (disposed || !document.documentElement) return;
  const token = ++requestToken;
  currentPageType = pageTypeFromUrl(location.href);
  setPageType(currentPageType, activeMode); updateSwitcher();
  if (picker?.host?.isConnected) { enterPickerState(); return; }
  applyMode(activeMode, settings); hideCurrentPanels(); applyMode(activeMode, settings);
  if (activeMode === "relax") return;
  if (currentPageType === "shorts") {
    const videoId = location.pathname.split("/").filter(Boolean)[1];
    if (videoId) { try { location.replace(`/watch?v=${encodeURIComponent(videoId)}`); } catch { /* Existing page remains available. */ } }
    return;
  }
  if (currentPageType === "watch") autoplayCleanup = startAutoplayGuard();
  try {
    if (currentPageType === "home") {
      const anchor = await waitForElement(["ytd-browse[page-subtype='home'] #primary", "ytd-browse #primary", "ytd-app #content"]);
      if (token !== requestToken || !anchor) return;
      homeUI = createHomeUI({
        mode: "learn",
        onSearch: value => { const query = normalizeQuery(value, CONFIG.Pipeline.queryMaxChars); if (query) location.href = `/results?search_query=${encodeURIComponent(query)}`; },
        onUseOriginal: () => persistMode("relax")
      });
      return;
    }
    if (currentPageType !== "search") return;
    const anchor = await waitForElement(["ytd-search #primary", "ytd-search", "ytd-app #content"]);
    if (token !== requestToken || !anchor) return;
    const query = new URL(location.href).searchParams.get("search_query") || "";
    if (!query.trim()) return;
    const retry = async () => {
      const nextToken = ++requestToken;
      resultsUI?.renderSkeleton();
      const result = await makePipelineRequest(query, nextToken);
      if (!result || !resultsUI) return;
      if (result.ok) resultsUI.renderResults(result); else resultsUI.renderError(result.userMessage || "No relevant videos were found.");
    };
    resultsUI = createResultsUI({ query, parent: anchor, onRetry: () => void retry(), onOriginalChange: original => { if (original) requestToken += 1; } });
    if (!resultsUI) return;
    resultsUI.renderSkeleton();
    const result = await makePipelineRequest(query, token);
    if (result && resultsUI) { if (result.ok) resultsUI.renderResults(result); else resultsUI.renderError(result.userMessage || "No relevant videos were found."); }
  } catch (error) {
    logger.error("content", `page update failed (${reason})`, error?.name || "unknown");
    resultsUI?.renderError("FocusTube could not update these results. You can retry or show original YouTube results.");
    homeUI?.renderError("FocusTube could not update this page. Switch to Relax and retry.");
  }
}
function scheduleNavigation(reason) {
  if (navTimer) clearTimeout(navTimer);
  if (reason === "yt-navigate-start") { requestToken += 1; hideCurrentPanels(); }
  navTimer = setTimeout(() => { navTimer = null; if (location.href !== lastUrl) { lastUrl = location.href; requestToken += 1; hideCurrentPanels(); } void applyPageBehavior(reason); }, CONFIG.Behaviour.navigationDebounceMs);
}
function watchNavigation() {
  if (navigationCleanup) return;
  const onStart = () => scheduleNavigation("yt-navigate-start"), onFinish = () => scheduleNavigation("yt-navigate-finish"), onPopstate = () => scheduleNavigation("popstate");
  window.addEventListener("yt-navigate-start", onStart); window.addEventListener("yt-navigate-finish", onFinish); window.addEventListener("popstate", onPopstate);
  observer = new MutationObserver(() => { if (location.href !== lastUrl) scheduleNavigation("mutation-observer-url-change"); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  navigationCleanup = () => { observer?.disconnect(); observer = null; window.removeEventListener("yt-navigate-start", onStart); window.removeEventListener("yt-navigate-finish", onFinish); window.removeEventListener("popstate", onPopstate); if (navTimer) clearTimeout(navTimer); navTimer = null; };
}
async function boot() {
  try {
    settings = await readSettings(); activeMode = settings.activeMode || "relax"; applyTheme(settings.theme); syncSwitcher(); installHealthCheck();
    if (!settings.activeMode) openPicker();
    else { window.__FOCUSTUBE_GATE__?.release(); if (activeMode === "learn") watchNavigation(); await applyPageBehavior("boot"); }
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.activeMode) activeMode = ["learn", "relax"].includes(changes.activeMode.newValue) ? changes.activeMode.newValue : "relax";
      for (const key of ["hideCommentsInLearn", "hideSubscriptionsInLearn", "theme"]) if (changes[key]) settings[key] = changes[key].newValue;
      if (changes.theme) applyTheme(settings.theme);
      if (changes.activeMode || changes.hideCommentsInLearn || changes.hideSubscriptionsInLearn || changes.theme) {
        syncSwitcher(); if (activeMode === "learn" && !observer) watchNavigation(); if (activeMode === "relax") navigationCleanup?.();
        picker?.close(); picker = null; void applyPageBehavior("storage-change");
      }
    });
  } catch (error) { logger.error("content", "boot failed", error?.name || "unknown"); window.__FOCUSTUBE_GATE__?.fail(); }
}
window.addEventListener("pagehide", () => { disposed = true; requestToken += 1; navigationCleanup?.(); hideCurrentPanels(); });
void boot();
