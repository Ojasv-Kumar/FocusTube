import { CONFIG } from "../config.js";
import { DEFAULT_SETTINGS } from "../storage.js";
import { MESSAGE, sendMessage } from "../messages.js";
import { logger, setDebug } from "../logger.js";
import { makeCorrelationId } from "../utils.js";
import { SELECTORS, queryFirst, selectorHealth, pageTypeFromUrl } from "../selectors.js";
import { applyMode, setPageType, setCuratedSearch, enterPickerState } from "./mode-manager.js";
import { openModePicker } from "./mode-picker.js";
import { createModeSwitcher } from "./mode-switcher.js";
import { createResultsUI } from "./results-ui.js";
import { createHomeUI } from "./home-ui.js";
import { startAutoplayGuard } from "./autoplay.js";

let settings = { ...DEFAULT_SETTINGS };
let activeMode = "relax";
let interestText = "";
let picker = null;
let switcher = null;
let resultsUI = null;
let homeUI = null;
let autoplayCleanup = null;
let requestToken = 0;
let navTimer = null;
let observer = null;
let disposed = false;
let lastUrl = location.href;
let currentPageType = "other";
const MODE_NAMES = { learn: "Learn", interest: "Interest", curiosity: "Curiosity", relax: "Relax" };

function hideCurrentPanels() {
  resultsUI?.dispose(); resultsUI = null;
  homeUI?.dispose(); homeUI = null;
  autoplayCleanup?.(); autoplayCleanup = null;
  setCuratedSearch(false);
}
function safeSessionGet(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
function safeSessionSet(key, value) { try { sessionStorage.setItem(key, value); } catch { /* Picker state is an optimization. */ } }
function updateSwitcher() { switcher?.update(activeMode); }
function persistMode(mode, interest = interestText) {
  activeMode = mode;
  interestText = interest;
  settings = { ...settings, activeMode: mode, interestText: interest };
  updateSwitcher();
  applyPageBehavior("mode-change");
  void sendMessage(MESSAGE.SET_MODE, { mode, interestText: interest }, makeCorrelationId());
}
function openPicker() {
  if (picker?.host?.isConnected) return;
  requestToken += 1;
  hideCurrentPanels();
  enterPickerState();
  picker = openModePicker({
    currentMode: activeMode,
    interestText,
    onSelect: (mode, interest) => {
      picker = null;
      safeSessionSet("focustube.pickerSeen", "1");
      persistMode(mode, interest);
    },
    onClose: () => { picker = null; }
  });
  if (!picker) applyPageBehavior("picker-unavailable");
}
async function readSettings() {
  const response = await sendMessage(MESSAGE.GET_SETTINGS);
  if (response?.ok && response.settings) return { ...DEFAULT_SETTINGS, ...response.settings };
  logger.warn("content", "settings unavailable; using a safe Relax fallback", response?.errorCode || "unknown");
  return { ...DEFAULT_SETTINGS, activeMode: "relax" };
}
function installHealthCheck() {
  try {
    window.FocusTube = Object.freeze({ selectorHealth: () => selectorHealth(document) });
  } catch { /* The popup path remains available. */ }
  try {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "focustube-health-check") return false;
      try { sendResponse({ ok: true, pageType: pageTypeFromUrl(location.href), report: selectorHealth(document) }); }
      catch { sendResponse({ ok: false, errorCode: "HEALTH_CHECK_FAILED", userMessage: "The selector check could not inspect this page." }); }
      return false;
    });
  } catch { /* Extension may have been reloaded while this tab stayed open. */ }
}
function showPageFailure(error, correlationId) {
  logger.error("content", `page action failed (${correlationId})`, error?.name || "unknown");
  const current = document.getElementById(SELECTORS.resultsHost) || document.getElementById(SELECTORS.homeHost);
  if (!current) return;
  const shadow = current.shadowRoot;
  if (shadow) {
    const status = shadow.querySelector("[aria-live='polite']");
    if (status) status.textContent = "FocusTube could not update this view. Refresh the page or show original YouTube results.";
  }
}
function waitForElement(selectors) {
  const immediate = queryFirst(selectors);
  if (immediate) return Promise.resolve(immediate);
  return new Promise(resolve => {
    const started = Date.now();
    const retry = () => {
      const match = queryFirst(selectors);
      if (match || Date.now() - started >= CONFIG.Behaviour.maxWaitMs) { resolve(match); return; }
      setTimeout(retry, CONFIG.Behaviour.selectorRetryMs);
    };
    retry();
  });
}
function makePipelineRequest(mode, query, action, token, correlationId) {
  const payload = { mode, query, interest: interestText, action };
  return sendMessage(MESSAGE.RUN_PIPELINE, payload, correlationId).then(result => {
    if (disposed || token !== requestToken || mode !== activeMode) return null;
    return result;
  });
}
async function loadSearch(query, token, onUpdate) {
  const correlationId = makeCorrelationId();
  onUpdate?.("loading");
  const result = await makePipelineRequest(activeMode, query, "search", token, correlationId);
  if (!result || token !== requestToken) return;
  if (result.ok) onUpdate?.("results", result);
  else onUpdate?.("error", result.userMessage || "FocusTube could not find a useful result. Show original YouTube results or retry.");
}
async function loadHome(action, token, onUpdate) {
  const correlationId = makeCorrelationId();
  onUpdate?.("loading");
  const result = await makePipelineRequest(activeMode, "", action, token, correlationId);
  if (!result || token !== requestToken) return;
  if (result.ok) onUpdate?.("results", result);
  else onUpdate?.("error", result.userMessage || "FocusTube could not refresh this feed. You can retry.");
}
function cleanForNavigation() {
  requestToken += 1;
  hideCurrentPanels();
}
async function applyPageBehavior(reason = "navigation") {
  if (disposed || !document.documentElement) return;
  const token = ++requestToken;
  currentPageType = pageTypeFromUrl(location.href);
  setPageType(currentPageType, activeMode);
  updateSwitcher();
  if (picker?.host?.isConnected) { enterPickerState(); return; }
  applyMode(activeMode, settings);
  hideCurrentPanels();
  applyMode(activeMode, settings);
  if (activeMode === "relax") return;
  if (currentPageType === "shorts" && CONFIG.Modes[activeMode].redirectShortsToWatch) {
    const videoId = location.pathname.split("/").filter(Boolean)[1];
    if (videoId) { try { location.replace(`/watch?v=${encodeURIComponent(videoId)}`); } catch { /* Keep the short visible if redirect fails. */ } }
    return;
  }
  if (currentPageType === "watch" && CONFIG.Modes[activeMode].disableAutoplay) autoplayCleanup = startAutoplayGuard();
  try {
    if (currentPageType === "home") {
      const anchor = await waitForElement(["ytd-browse[page-subtype='home'] #primary", "ytd-browse #primary", "ytd-app #content"]);
      if (token !== requestToken || !anchor) return;
      homeUI = createHomeUI({
        mode: activeMode,
        interest: interestText,
        onSearch: value => {
          if (!value) return;
          try { location.href = `/results?search_query=${encodeURIComponent(value.slice(0, CONFIG.Pipeline.queryMaxChars))}`; }
          catch { logger.warn("content", "could not submit the learning prompt"); }
        },
        onUseOriginal: () => persistMode("relax", interestText),
        onRefresh: () => {
          const nextToken = ++requestToken;
          loadHome("home", nextToken, (state, result) => {
            if (!homeUI) return;
            if (state === "loading") homeUI.renderSkeleton();
            else if (state === "results") homeUI.renderResults(result);
            else homeUI.renderError(result);
          }).catch(error => showPageFailure(error, makeCorrelationId()));
        }
      });
      if (!homeUI) return;
      if (activeMode === "learn") return;
      const homeToken = token;
      await loadHome("home", homeToken, (state, result) => {
        if (!homeUI) return;
        if (state === "loading") homeUI.renderSkeleton();
        else if (state === "results") homeUI.renderResults(result);
        else homeUI.renderError(result);
      });
      return;
    }
    if (currentPageType === "search") {
      const anchor = await waitForElement(["ytd-search", "ytd-app #content"]);
      if (token !== requestToken || !anchor) return;
      const query = new URL(location.href).searchParams.get("search_query") || "";
      if (!query.trim()) return;
      const retry = () => {
        const nextToken = ++requestToken;
        loadSearch(query, nextToken, (state, result) => {
          if (!resultsUI) return;
          if (state === "loading") resultsUI.renderSkeleton();
          else if (state === "results") resultsUI.renderResults(result);
          else resultsUI.renderError(result);
        }).catch(error => showPageFailure(error, makeCorrelationId()));
      };
      resultsUI = createResultsUI({ mode: activeMode, query, parent: anchor, onRetry: retry });
      if (!resultsUI) return;
      resultsUI.renderSkeleton();
      await loadSearch(query, token, (state, result) => {
        if (!resultsUI) return;
        if (state === "results") resultsUI.renderResults(result);
        else if (state === "error") resultsUI.renderError(result);
      });
    }
  } catch (error) { showPageFailure(error, makeCorrelationId()); }
  logger.debug("content", `applied ${activeMode} mode for ${currentPageType} (${reason})`);
}
function scheduleNavigation(reason) {
  if (navTimer) clearTimeout(navTimer);
  if (reason === "yt-navigate-start") cleanForNavigation();
  navTimer = setTimeout(() => {
    navTimer = null;
    if (location.href !== lastUrl) { lastUrl = location.href; cleanForNavigation(); }
    void applyPageBehavior(reason);
  }, CONFIG.Behaviour.navigationDebounceMs);
}
function watchNavigation() {
  try {
    window.addEventListener("yt-navigate-start", () => scheduleNavigation("yt-navigate-start"));
    window.addEventListener("yt-navigate-finish", () => scheduleNavigation("yt-navigate-finish"));
    window.addEventListener("popstate", () => scheduleNavigation("popstate"));
    observer = new MutationObserver(() => {
      if (location.href !== lastUrl) scheduleNavigation("mutation-observer-url-change");
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (error) { logger.warn("content", "navigation observer could not be attached", error?.name || "unknown"); }
}
async function boot() {
  const startId = makeCorrelationId();
  try {
    settings = await readSettings();
    setDebug(settings.debugLogging);
    interestText = settings.interestText || "";
    activeMode = settings.activeMode || "relax";
    switcher = createModeSwitcher(openPicker);
    updateSwitcher();
    installHealthCheck();
    watchNavigation();
    const hasSeenPicker = safeSessionGet("focustube.pickerSeen") === "1";
    if (CONFIG.Behaviour.askForModeOnEveryNewTab && !hasSeenPicker) openPicker();
    else if (!settings.activeMode) openPicker();
    else await applyPageBehavior("boot");
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.activeMode) activeMode = changes.activeMode.newValue || "relax";
        if (changes.interestText) interestText = changes.interestText.newValue || "";
        if (changes.showComments) settings.showComments = changes.showComments.newValue;
        if (changes.debugLogging) { settings.debugLogging = changes.debugLogging.newValue; setDebug(settings.debugLogging); }
        if (changes.activeMode || changes.interestText || changes.showComments) {
          updateSwitcher();
          if (picker?.host?.isConnected) { picker.close(); picker = null; }
          void applyPageBehavior("storage-change");
        }
      });
    } catch { /* extension may reload between boot and listener setup */ }
    logger.info("content", `ready ${startId}; mode=${activeMode}`);
  } catch (error) {
    logger.error("content", `boot failed ${startId}`, error?.name || "unknown");
    try { document.documentElement?.removeAttribute("data-focustube-mode"); } catch { /* Do not interfere with YouTube. */ }
  }
}

window.addEventListener("error", event => logger.error("content", "page integration error", event.message || "unknown"));
window.addEventListener("unhandledrejection", event => { logger.error("content", "handled rejected promise", event.reason?.name || "unknown"); event.preventDefault(); });
window.addEventListener("pagehide", () => { disposed = true; requestToken += 1; observer?.disconnect(); if (navTimer) clearTimeout(navTimer); hideCurrentPanels(); });
void boot();
