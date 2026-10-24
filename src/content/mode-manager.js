import { CONFIG } from "../config.js";
import { makeHideCss } from "../selectors.js";

let installed = false;
function ensureStyle() {
  if (installed || !document.documentElement) return;
  try {
    const style = document.createElement("style");
    style.dataset.focustubeStyles = "true";
    style.textContent = makeHideCss(CONFIG.Modes);
    document.documentElement.append(style);
    installed = true;
  } catch { /* The mode can still fall back to the native page. */ }
}
export function applyMode(mode, settings = {}) {
  const root = document.documentElement;
  if (!root) return;
  const safeMode = Object.hasOwn(CONFIG.Modes, mode) ? mode : "relax";
  applyTheme(settings.theme || root.dataset.focustubeTheme || "dark");
  if (safeMode === "relax") {
    root.removeAttribute("data-focustube-mode");
    root.removeAttribute("data-focustube-page");
    root.removeAttribute("data-focustube-hide-comments");
    root.removeAttribute("data-focustube-hide-subscriptions");
    root.removeAttribute("data-focustube-search");
    root.removeAttribute("data-focustube-hide-shorts");
    try { document.querySelector("style[data-focustube-styles]")?.remove(); } catch { /* No active hiding rules remain. */ }
    installed = false;
    return;
  }
  ensureStyle();
  root.dataset.focustubeMode = safeMode;
  if (safeMode === "learn" && settings.hideShortsInLearn !== false) root.dataset.focustubeHideShorts = "true";
  else root.removeAttribute("data-focustube-hide-shorts");
  if (safeMode === "learn" && settings.hideCommentsInLearn) root.dataset.focustubeHideComments = "true";
  else root.removeAttribute("data-focustube-hide-comments");
  if (safeMode === "learn" && settings.hideSubscriptionsInLearn !== false) root.dataset.focustubeHideSubscriptions = "true";
  else root.removeAttribute("data-focustube-hide-subscriptions");
}
export function applyTheme(theme = "dark") {
  const value = theme === "light" ? "light" : "dark";
  const root = document.documentElement;
  if (!root) return;
  root.dataset.focustubeTheme = value;
  root.dataset.theme = value;
  for (const host of document.querySelectorAll("focustube-picker-host,focustube-switcher-host,focustube-home-host,focustube-results-host,focustube-search-host")) host.dataset.theme = value;
}
export function setPageType(pageType, mode = "relax") {
  if (!document.documentElement) return;
  if (mode === "relax") document.documentElement.removeAttribute("data-focustube-page");
  else document.documentElement.dataset.focustubePage = pageType;
}
export function setCuratedSearch(enabled) {
  if (!document.documentElement) return;
  if (enabled) document.documentElement.dataset.focustubeSearch = "true";
  else delete document.documentElement.dataset.focustubeSearch;
}
export function enterPickerState() {
  if (document.documentElement) document.documentElement.dataset.focustubeMode = "picker";
}
