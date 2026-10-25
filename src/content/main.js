import { CONFIG } from "../config.js";
import { DEFAULT_SETTINGS } from "../storage.js";
import { MESSAGE, sendMessage } from "../messages.js";
import { logger, setDebug } from "../logger.js";
import { makeCorrelationId, normalizeQuery } from "../utils.js";
import { SELECTORS, queryFirst, selectorHealth, pageTypeFromUrl } from "../selectors.js";
import { applyMode, applyTheme, setPageType, setCuratedSearch, enterPickerState } from "./mode-manager.js";
import { openModePicker } from "./mode-picker.js";
import { createModeSwitcher } from "./mode-switcher.js";
import { createResultsUI } from "./results-ui.js";
import { createHomeUI } from "./home-ui.js";
import { createLearnSearch } from "./learn-search.js";
import { openLearnAssistantOverlay } from "./learn-assistant.js";
import { startAutoplayGuard } from "./autoplay.js";

let settings = { ...DEFAULT_SETTINGS };
let activeMode = "relax";
let picker = null;
let switcher = null;
let modeLockNotice = null;
let modeLockNoticeTimer = 0;
let resultsUI = null;
let homeUI = null;
let learnAssistantUI = null;
let learnSearchUI = null;
let autoplayCleanup = null;
let requestToken = 0;
let activePipelineCorrelationId = "";
let homePage = 0;
let navTimer = null;
let shortsCleanupTimer = null;
let lastPrefetchSignature = "";
let observer = null;
const shadowRootObservers = new Map();
let navigationCleanup = null;
let disposed = false;
let lastUrl = location.href;
let currentPageType = "other";

function hideCurrentPanels() {
  resultsUI?.dispose(); resultsUI = null;
  homeUI?.dispose(); homeUI = null;
  learnAssistantUI?.dispose(); learnAssistantUI = null;
  learnSearchUI?.dispose(); learnSearchUI = null;
  autoplayCleanup?.(); autoplayCleanup = null;
  setCuratedSearch(false);
}
function safeSessionGet(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
function safeSessionSet(key, value) { try { sessionStorage.setItem(key, value); } catch { /* Picker state is an optimization. */ } }
function updateSwitcher() { switcher?.update(activeMode); }
function showModeLockNotice(remainingMs) {
  const expiresAt = Date.now() + Math.max(0, Number(remainingMs) || 0);
  if (modeLockNoticeTimer) clearInterval(modeLockNoticeTimer);
  modeLockNotice?.remove();
  const notice = document.createElement("div");
  modeLockNotice = notice;
  notice.setAttribute("role", "alert");
  Object.assign(notice.style, { position: "fixed", top: "18px", left: "50%", transform: "translateX(-50%)", zIndex: "2147483647", padding: "12px 18px", border: "1px solid #ff5b5b", borderRadius: "12px", background: "#2a1111", color: "#ff6b6b", font: "700 14px/1.4 system-ui,sans-serif", boxShadow: "0 8px 32px #0009", fontVariantNumeric: "tabular-nums" });
  const tick = () => {
    const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    const time = `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    notice.textContent = seconds ? `${time} left to close Learn mode` : "Learn mode timer complete. You can switch modes now.";
    if (!seconds) { clearInterval(modeLockNoticeTimer); modeLockNoticeTimer = 0; setTimeout(() => { if (modeLockNotice === notice) { notice.remove(); modeLockNotice = null; } }, 2500); }
  };
  tick(); modeLockNoticeTimer = setInterval(tick, 1000); (document.body || document.documentElement).append(notice);
}
function syncSwitcher() {
  if (!CONFIG.Behaviour.showFloatingSwitcher || activeMode === "relax") { switcher?.dispose(); switcher = null; return; }
  if (!switcher) switcher = createModeSwitcher(openPicker);
  updateSwitcher();
}
async function persistMode(mode, { deferApply = false } = {}) {
  const response = await sendMessage(MESSAGE.SET_MODE, { mode }, makeCorrelationId());
  if (!response?.ok) {
    if (response?.errorCode === "LEARN_MODE_LOCKED" && !picker?.host?.isConnected) showModeLockNotice(response.remainingMs);
    return response;
  }
  activeMode = mode;
  if (mode !== "relax") watchNavigation();
  else { navigationCleanup?.(); navigationCleanup = null; }
  settings = { ...settings, activeMode: mode };
  syncSwitcher();
  if (!deferApply) void applyPageBehavior("mode-change");
  return response;
}
function openPicker() {
  if (picker?.host?.isConnected) return;
  requestToken += 1;
  hideCurrentPanels();
  enterPickerState();
  picker = openModePicker({
    currentMode: activeMode,
    required: Boolean(document.documentElement?.hasAttribute("data-focustube-gate")),
    showIntro: Boolean(document.documentElement?.hasAttribute("data-focustube-gate")),
    onSelect: async mode => {
      const response = await persistMode(mode, { deferApply: true });
      if (!response?.ok) return response;
      picker?.close();
      picker = null;
      safeSessionSet("focustube.pickerSeen", "1");
      window.__FOCUSTUBE_GATE__?.release();
      void applyPageBehavior("mode-change");
      return response;
    },
    onClose: () => { picker = null; if (settings.activeMode) void applyPageBehavior("picker-closed"); }
  });
  if (!picker) applyPageBehavior("picker-unavailable");
}
async function readSettings() {
  const response = await sendMessage(MESSAGE.GET_SETTINGS);
  if (response?.ok && response.settings) return { ...DEFAULT_SETTINGS, ...response.settings };
  logger.warn("content", "settings unavailable; using a safe Relax fallback", response?.errorCode || "unknown");
  return { ...DEFAULT_SETTINGS, activeMode: "relax" };
}
function queryAllOpenShadowRoots(selector) {
  const found = new Set();
  const visited = new Set();
  const visit = root => {
    if (!root || visited.has(root)) return;
    visited.add(root);
    try { root.querySelectorAll(selector).forEach(node => found.add(node)); } catch { /* YouTube may change its internal DOM. */ }
    let hosts = [];
    try { hosts = root.querySelectorAll("*"); } catch { /* Some roots may be inaccessible. */ }
    for (const host of hosts) if (host.shadowRoot) visit(host.shadowRoot);
  };
  visit(document);
  return [...found];
}
function scheduleModeDomCleanup() {
  if (activeMode === "relax" || shortsCleanupTimer) return;
  shortsCleanupTimer = setTimeout(() => { shortsCleanupTimer = null; runModeDomCleanup(); }, 700);
}
function observeOpenShadowRoots(root) {
  const inspect = candidate => {
    if (!candidate) return;
    const attach = shadowRoot => {
      if (!shadowRoot || shadowRootObservers.has(shadowRoot)) return;
      const shadowObserver = new MutationObserver(records => {
        for (const record of records) for (const added of record.addedNodes || []) inspect(added);
        scheduleModeDomCleanup();
      });
      shadowRootObservers.set(shadowRoot, shadowObserver);
      try { shadowObserver.observe(shadowRoot, { childList: true, subtree: true }); inspect(shadowRoot); }
      catch { shadowRootObservers.delete(shadowRoot); shadowObserver.disconnect(); }
    };
    try { if (candidate.shadowRoot) attach(candidate.shadowRoot); } catch { /* Closed roots are not observable. */ }
    try { candidate.querySelectorAll?.("*").forEach(element => { try { if (element.shadowRoot) attach(element.shadowRoot); } catch { /* ignore */ } }); } catch { /* Some nodes are not queryable. */ }
  };
  inspect(root);
}
function setInlineHidden(node, kind, hidden) {
  const marker = `data-focustube-${kind}-hidden`;
  const oldDisplay = `data-focustube-${kind}-old-display`;
  const oldPriority = `data-focustube-${kind}-old-priority`;
  if (hidden) {
    if (!node.hasAttribute(marker)) {
      node.setAttribute(marker, "true");
      node.setAttribute(oldDisplay, node.style.getPropertyValue("display"));
      node.setAttribute(oldPriority, node.style.getPropertyPriority("display"));
    }
    node.style.setProperty("display", "none", "important");
  } else if (node.hasAttribute(marker)) {
    const previous = node.getAttribute(oldDisplay) || "";
    const priority = node.getAttribute(oldPriority) || "";
    if (previous) node.style.setProperty("display", previous, priority);
    else node.style.removeProperty("display");
    node.removeAttribute(marker); node.removeAttribute(oldDisplay); node.removeAttribute(oldPriority);
  }
}
function setNativeSearchHidden(hidden) {
  // Each query is also searched independently in every open shadow root, because
  // selectors such as `ytd-masthead ytd-searchbox` cannot cross a shadow boundary.
  const selectors = [
    ...SELECTORS.mastheadSearchRegion, ...SELECTORS.mastheadMenuButton,
    "ytd-masthead ytd-searchbox", "ytd-masthead #search-form", "ytd-masthead #voice-search-button",
    "ytd-masthead #search-icon-legacy", "ytd-searchbox", "#search-form", "#voice-search-button",
    "#search-icon-legacy", "tp-yt-paper-icon-button#search-icon-legacy"
  ];
  for (const node of queryAllOpenShadowRoots(selectors.join(","))) setInlineHidden(node, "native-search", hidden);
  for (const masthead of queryAllOpenShadowRoots("ytd-masthead")) {
    try {
      for (const node of masthead.shadowRoot?.querySelectorAll("#center,#search,#start #button,#menu-button") || []) {
        setInlineHidden(node, "native-search", hidden);
      }
    } catch { /* YouTube may change or close its masthead shadow root. */ }
  }
}
function setLearnLogoFocusRingSuppressed(suppress) {
  for (const masthead of queryAllOpenShadowRoots("ytd-masthead")) {
    const root = masthead.shadowRoot;
    if (!root) continue;
    let style = root.querySelector("style[data-focustube-logo-focus]");
    if (suppress && !style) {
      style = document.createElement("style");
      style.dataset.focustubeLogoFocus = "true";
      style.textContent = "#logo:focus,#logo:focus-visible,#logo-container:focus,#logo-container:focus-visible,ytd-topbar-logo-renderer:focus-visible{outline:none!important;box-shadow:none!important}";
      root.append(style);
    } else if (!suppress) style?.remove();
    if (suppress) {
      const focused = root.activeElement;
      if (focused?.matches?.("#logo,#logo-container,ytd-topbar-logo-renderer")) focused.blur();
    }
  }
}
function setNativeSearchResultsHidden(hidden) {
  const shouldHide = hidden && activeMode === "learn" && currentPageType === "search" && document.documentElement?.dataset.focustubeSearch === "true";
  const selectors = [
    "ytd-video-renderer", "ytd-rich-item-renderer", "ytd-reel-shelf-renderer", "ytd-reel-item-renderer",
    "ytd-rich-shelf-renderer[is-shorts]", "ytd-horizontal-card-list-renderer", "ytd-item-section-renderer",
    "ytd-section-list-renderer", "ytd-shelf-renderer:has(a[href^='/shorts/'])"
  ];
  // On search pages only, remove native result rows from their own shadow roots;
  // FocusTube's custom host lives in light DOM and is not selected here.
  for (const node of queryAllOpenShadowRoots(selectors.join(","))) setInlineHidden(node, "native-results", shouldHide);
}
function setShortsVisibility(hidden) {
  if (!hidden) for (const node of queryAllOpenShadowRoots("[data-focustube-shorts-hidden='true']")) setInlineHidden(node, "shorts", false);
  const selectors = [...SELECTORS.shortsShelves, ...SELECTORS.shortsTab, "a[href='/shorts']", "a[href^='/shorts/']", "yt-chip-cloud-chip-renderer"];
  for (const node of queryAllOpenShadowRoots(selectors.join(","))) {
    const chip = node.localName === "yt-chip-cloud-chip-renderer";
    const label = chip ? String(node.innerText || node.textContent || "").trim().toLocaleLowerCase() : "";
    setInlineHidden(node, "shorts", hidden && (!chip || label === "shorts"));
    if (hidden && node.matches?.("a[href^='/shorts/']")) {
      let current = node, depth = 0;
      while (current && depth++ < 10) {
        if (current.matches?.("ytd-reel-item-renderer,ytd-reel-shelf-renderer,ytd-rich-shelf-renderer,ytd-rich-section-renderer,ytd-item-section-renderer,ytd-shelf-renderer,ytd-rich-item-renderer")) {
          setInlineHidden(current, "shorts", true); break;
        }
        const root = current.getRootNode?.();
        current = current.parentElement || root?.host || null;
      }
    }
  }
  // YouTube occasionally leaves a standalone heading/icon row even after its
  // Shorts shelf disappears. Hide the containing section by its exact label.
  for (const heading of queryAllOpenShadowRoots("h2,#title,yt-formatted-string,[role='heading']")) {
    if (String(heading.textContent || "").trim().toLocaleLowerCase() !== "shorts") continue;
    let current = heading, depth = 0;
    while (current && depth++ < 10) {
      if (current.matches?.("ytd-reel-shelf-renderer,ytd-rich-shelf-renderer,ytd-rich-section-renderer,ytd-item-section-renderer,ytd-shelf-renderer")) {
        setInlineHidden(current, "shorts", hidden); break;
      }
      const root = current.getRootNode?.();
      current = current.parentElement || root?.host || null;
    }
  }
}
function reattachLearnPanels() {
  if (activeMode !== "learn" || currentPageType !== "search") return;
  if (learnSearchUI?.host && !learnSearchUI.host.isConnected) {
    const searchAnchor = queryAllOpenShadowRoots("ytd-search #primary")[0] || queryFirst(["ytd-search", "ytd-app #content"], document);
    if (searchAnchor) searchAnchor.prepend(learnSearchUI.host);
  }
  if (resultsUI?.host && !resultsUI.host.isConnected && document.documentElement?.dataset.focustubeSearch === "true") {
    const mounts = queryAllOpenShadowRoots("ytd-search #primary");
    const mount = mounts[0] || queryAllOpenShadowRoots("#primary").find(node => node.isConnected) || queryFirst(["ytd-search", "main"], document);
    if (mount) mount.append(resultsUI.host);
  }
}
function runModeDomCleanup() {
  reattachLearnPanels();
  const nativeSearchMode = activeMode === "curiosity" && currentPageType === "search";
  if (nativeSearchMode) applyMode("relax", settings);
  setNativeSearchHidden(activeMode === "learn");
  setLearnLogoFocusRingSuppressed(activeMode === "learn" && currentPageType === "search");
  setNativeSearchResultsHidden(activeMode === "learn");
  const hideShorts = !nativeSearchMode && Boolean(CONFIG.Modes[activeMode]?.hideShorts && (activeMode !== "learn" || settings.hideShortsInLearn !== false));
  setShortsVisibility(hideShorts);
}

function installHealthCheck() {
  try {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "focustube-health-check") {
        try { sendResponse({ ok: true, pageType: pageTypeFromUrl(location.href), report: selectorHealth(document) }); }
        catch { sendResponse({ ok: false, errorCode: "HEALTH_CHECK_FAILED", userMessage: "The selector check could not inspect this page." }); }
        return false;
      }
      if (message?.type === "PIPELINE_PROGRESS" && message?.namespace === "focustube-progress" && message.correlationId === activePipelineCorrelationId) {
        const update = message.payload || {};
        if (update.stage === "provisional-results" && Array.isArray(update.videos)) {
          const provisional = { videos: update.videos, channels: [], metadata: update.metadata || { provisional: true } };
          homeUI?.renderResults?.(provisional, { provisional: true });
          resultsUI?.renderResults?.(provisional, { provisional: true });
          return false;
        }
        const progress = message.payload?.message || "Working on your feed…";
        homeUI?.setProgress?.(progress);
        resultsUI?.setProgress?.(progress);
        return false;
      }
      return false;
    });
  } catch { /* Extension may have been reloaded while this tab stayed open. */ }
}
function showPageFailure(error, correlationId) {
  logger.error("content", `page action failed (${correlationId})`, error?.name || "unknown");
  if (resultsUI) { resultsUI.renderError("FocusTube could not load curated results. Retry, or choose original YouTube results explicitly."); return; }
  if (homeUI) { homeUI.renderError("FocusTube could not update this feed. Try again or switch to Relax."); return; }
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
function makePipelineRequest(mode, query, action, token, correlationId, extra = {}) {
  activePipelineCorrelationId = correlationId;
  const payload = { mode, query, action, ...extra };
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
async function loadHome(action, token, onUpdate, page = 0, excludeIds = []) {
  const correlationId = makeCorrelationId();
  onUpdate?.("loading");
  const result = await makePipelineRequest(activeMode, "", action, token, correlationId, { page, excludeIds });
  if (!result || token !== requestToken) return;
  if (result.ok) onUpdate?.("results", result);
  else onUpdate?.("error", result.userMessage || "FocusTube could not refresh this feed. You can retry.");
}
function scheduleHomePrefetch(page, excludeIds) {
  const mode = activeMode;
  if (!homeUI || currentPageType !== "home" || mode !== "curiosity") return;
  if (excludeIds.length >= CONFIG.Pipeline.maxVideosShown || page * CONFIG.Pipeline.feedBatchSize >= CONFIG.Pipeline.maxVideosShown) return;
  const ids = [...new Set(excludeIds.map(id => String(id)))];
  const signature = JSON.stringify({ mode, page, ids: [...ids].sort() });
  if (signature === lastPrefetchSignature) return;
  lastPrefetchSignature = signature;
  setTimeout(() => {
    if (!homeUI || currentPageType !== "home" || activeMode !== mode) return;
    const correlationId = makeCorrelationId();
    const payload = { mode, query: "", action: "home", page, excludeIds: ids };
    // Intentionally do not attach this speculative request to the visible progress
    // indicator. The result is cached by the service worker and reused on click.
    void sendMessage(MESSAGE.RUN_PIPELINE, payload, correlationId)
      .then(result => logger.debug("content", `prefetched ${mode} page ${page}: ${result?.ok ? `${result.videos?.length || 0} videos` : result?.errorCode || "unavailable"}`))
      .catch(error => logger.debug("content", `prefetch ${mode} page ${page} did not finish (${error?.name || "error"})`));
  }, CONFIG.Pipeline.prefetchDelayMs);
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
  runModeDomCleanup();
  if (activeMode === "relax") return;
  // Curiosity curates its home feed, but search remains native YouTube just like Relax.
  if (activeMode === "curiosity" && currentPageType === "search") return;
  if (activeMode === "learn") {
    const searchAnchor = await waitForElement(["ytd-search #primary", "ytd-search", "ytd-app #content"]);
    if (token !== requestToken) return;
    if (searchAnchor && currentPageType === "search") {
      runModeDomCleanup();
      const query = new URL(location.href).searchParams.get("search_query") || "";
      learnSearchUI = createLearnSearch({ query, anchor: searchAnchor, onSubmit: value => { const safeQuery = normalizeQuery(value, CONFIG.Pipeline.queryMaxChars); if (!safeQuery) return; try { location.href = `/results?search_query=${encodeURIComponent(safeQuery)}`; } catch { logger.warn("content", "could not submit learning query"); } } });
    }
  }
  if (currentPageType === "shorts" && CONFIG.Modes[activeMode].redirectShortsToWatch) {
    const videoId = location.pathname.split("/").filter(Boolean)[1];
    if (videoId) { try { location.replace(`/watch?v=${encodeURIComponent(videoId)}`); } catch { /* Keep the short visible if redirect fails. */ } }
    return;
  }
  if (activeMode === "learn" && location.pathname === "/feed/subscriptions") { try { location.replace("/"); } catch { /* Keep current page if navigation is blocked. */ } return; }
  const disableAutoplay = activeMode === "learn" ? settings.disableAutoplayInLearn !== false : CONFIG.Modes[activeMode].disableAutoplay;
  if (currentPageType === "watch" && disableAutoplay) autoplayCleanup = startAutoplayGuard();
  try {
    if (currentPageType === "home") {
      const anchor = await waitForElement(["ytd-browse[page-subtype='home'] #primary", "ytd-browse #primary", "ytd-app #content"]);
      if (token !== requestToken || !anchor) return;
      const submitLearnQuery = value => {
        const safeQuery = normalizeQuery(value, CONFIG.Pipeline.queryMaxChars);
        if (!safeQuery) return;
        try { location.href = `/results?search_query=${encodeURIComponent(safeQuery)}`; }
        catch { logger.warn("content", "could not submit the learning prompt"); }
      };
      const setLearnTimer = async durationSeconds => {
        const response = await sendMessage(MESSAGE.SET_LEARN_TIMER, { durationSeconds }, makeCorrelationId());
        if (response?.ok) settings.learnModeLockUntil = response.learnModeLockUntil || response.settings?.learnModeLockUntil || 0;
        return response;
      };
      if (activeMode === "learn") {
        learnAssistantUI = openLearnAssistantOverlay({ onSubmit: submitLearnQuery, onSetLearnTimer: setLearnTimer });
        if (!learnAssistantUI) {
          homeUI = createHomeUI({ mode: "learn", onSetLearnTimer: setLearnTimer, onSearch: submitLearnQuery });
        }
        return;
      }
      homeUI = createHomeUI({
        mode: activeMode,
        onSetLearnTimer: setLearnTimer,
        onSearch: submitLearnQuery,
        onUseOriginal: () => persistMode("relax"),
        onRefresh: () => {
          // Curiosity query plans rotate by page. Advancing here also gives the
          // refresh a distinct cache key instead of returning the same page-0 feed.
          homePage += 1;
          const refreshPage = homePage;
          const nextToken = ++requestToken;
          loadHome("home", nextToken, (state, result) => {
            if (!homeUI) return;
            if (state === "loading") homeUI.renderSkeleton();
            else if (state === "results") { homeUI.renderResults(result); scheduleHomePrefetch(refreshPage + 1, homeUI.getVideoIds()); }
            else homeUI.renderError(result);
          }, refreshPage, []).catch(error => showPageFailure(error, makeCorrelationId()));
        },
        onLoadMore: () => {
          if (!homeUI || homeUI.isLoadingMore()) return;
          const page = homePage + 1;
          const excludeIds = homeUI.getVideoIds();
          const nextToken = ++requestToken;
          homeUI.setLoadingMore(true);
          loadHome("home", nextToken, (state, result) => {
            if (!homeUI) return;
            if (state === "results") { homePage = page; homeUI.renderResults(result, { append: true }); scheduleHomePrefetch(page + 1, homeUI.getVideoIds()); }
            else if (state === "error") { homePage = page; homeUI.renderError(result, { append: true }); }
          }, page, excludeIds).catch(error => { homeUI?.setLoadingMore(false); showPageFailure(error, makeCorrelationId()); });
        }
      });
      if (!homeUI) return;
      if (activeMode === "learn") return;
      homePage = 0;
      const homeToken = token;
      await loadHome("home", homeToken, (state, result) => {
        if (!homeUI) return;
        if (state === "loading") homeUI.renderSkeleton();
        else if (state === "results") { homeUI.renderResults(result); scheduleHomePrefetch(1, homeUI.getVideoIds()); }
        else homeUI.renderError(result);
      }, 0, []);
      return;
    }
    if (currentPageType === "search") {
      const anchor = await waitForElement(["ytd-search #primary", "ytd-search", "ytd-app #content"]);
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
      resultsUI = createResultsUI({ mode: activeMode, query, parent: anchor, settings, onRetry: retry, onOriginalChange: () => runModeDomCleanup() });
      if (!resultsUI) return;
      resultsUI.renderSkeleton();
      runModeDomCleanup();
      await loadSearch(query, token, (state, result) => {
        if (!resultsUI) return;
        if (state === "results") resultsUI.renderResults(result);
        else if (state === "error") resultsUI.renderError(result);
        runModeDomCleanup();
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
  if (navigationCleanup) return;
  try {
    const onStart = () => scheduleNavigation("yt-navigate-start");
    const onFinish = () => scheduleNavigation("yt-navigate-finish");
    const onPopstate = () => scheduleNavigation("popstate");
    window.addEventListener("yt-navigate-start", onStart);
    window.addEventListener("yt-navigate-finish", onFinish);
    window.addEventListener("popstate", onPopstate);
    observer = new MutationObserver(records => {
      for (const record of records) for (const added of record.addedNodes || []) observeOpenShadowRoots(added);
      if (location.href !== lastUrl) scheduleNavigation("mutation-observer-url-change");
      else scheduleModeDomCleanup();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-focustube-mode", "data-focustube-search", "data-focustube-hide-shorts"] });
    observeOpenShadowRoots(document);
    navigationCleanup = () => {
      observer?.disconnect(); observer = null;
      for (const shadowObserver of shadowRootObservers.values()) shadowObserver.disconnect();
      shadowRootObservers.clear();
      window.removeEventListener("yt-navigate-start", onStart);
      window.removeEventListener("yt-navigate-finish", onFinish);
      window.removeEventListener("popstate", onPopstate);
      if (navTimer) clearTimeout(navTimer); navTimer = null;
      if (shortsCleanupTimer) clearTimeout(shortsCleanupTimer); shortsCleanupTimer = null;
      navigationCleanup = null;
    };
  } catch (error) { logger.warn("content", "navigation observer could not be attached", error?.name || "unknown"); }
}
async function boot() {
  const startId = makeCorrelationId();
  try {
    settings = await readSettings();
    applyTheme(settings.theme);
    setDebug(settings.debugLogging);
    activeMode = settings.activeMode || "relax";
    syncSwitcher();
    installHealthCheck();
    const hasSeenPicker = safeSessionGet("focustube.pickerSeen") === "1";
    if (settings.askForModeEveryTab && !hasSeenPicker) openPicker();
    else if (!settings.activeMode) openPicker();
    else { window.__FOCUSTUBE_GATE__?.release(); if (activeMode !== "relax") watchNavigation(); await applyPageBehavior("boot"); }
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.activeMode) activeMode = changes.activeMode.newValue || "relax";
        for (const key of ["askForModeEveryTab", "keepCommentsVisible", "hideShortsInLearn", "disableAutoplayInLearn", "resultsPerSearch", "showReasons", "curiosityStrictness", "density", "mockMode", "debugLogging", "hideCommentsInLearn", "hideSubscriptionsInLearn", "theme", "cameraEnabled", "cameraCalibration", "learnModeLockUntil"]) if (changes[key]) settings[key] = changes[key].newValue;
        if (changes.learnModeLockUntil) homeUI?.updateLearnTimer(changes.learnModeLockUntil.newValue);
        if (changes.theme) applyTheme(settings.theme);
        if (changes.debugLogging) setDebug(settings.debugLogging);
        if (changes.activeMode || changes.keepCommentsVisible || changes.hideShortsInLearn || changes.disableAutoplayInLearn || changes.resultsPerSearch || changes.showReasons || changes.density || changes.mockMode || changes.hideCommentsInLearn || changes.hideSubscriptionsInLearn || changes.theme) {
          syncSwitcher();
          if (activeMode !== "relax" && !observer) watchNavigation();
          if (activeMode === "relax") navigationCleanup?.();
          if (picker?.host?.isConnected) { picker.close(); picker = null; }
          void applyPageBehavior("storage-change");
        }
      });
    } catch { /* extension may reload between boot and listener setup */ }
    logger.info("content", `ready ${startId}; mode=${activeMode}`);
  } catch (error) {
    logger.error("content", `boot failed ${startId}`, error?.name || "unknown");
    try { window.__FOCUSTUBE_GATE__?.fail(); document.documentElement?.removeAttribute("data-focustube-mode"); } catch { /* Do not interfere with YouTube. */ }
  }
}

window.addEventListener("pagehide", () => { disposed = true; requestToken += 1; navigationCleanup?.(); hideCurrentPanels(); });
void boot();
