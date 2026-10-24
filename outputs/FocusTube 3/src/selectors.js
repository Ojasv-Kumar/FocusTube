/* YouTube's markup is private and changes often. VERIFY IN LIVE BROWSER. */
export const SELECTORS = Object.freeze({
  homeFeed: ["ytd-rich-grid-renderer", "ytd-browse[page-subtype='home'] #primary ytd-rich-grid-renderer"],
  searchResults: ["ytd-search", "ytd-section-list-renderer"],
  searchContents: ["ytd-search #contents", "ytd-section-list-renderer #contents"],
  searchResultItems: ["ytd-search ytd-video-renderer", "ytd-search ytd-rich-item-renderer", "ytd-search ytd-reel-shelf-renderer", "ytd-search ytd-horizontal-card-list-renderer"],
  videoRenderer: ["ytd-video-renderer", "ytd-rich-item-renderer"],
  shortsShelves: [
    "ytd-reel-shelf-renderer", "ytd-rich-shelf-renderer[is-shorts]", "ytd-reel-item-renderer", "ytd-shorts",
    "ytm-shorts-lockup-view-model", "ytd-rich-section-renderer:has(ytd-reel-shelf-renderer)",
    "ytd-rich-section-renderer:has(ytd-reel-item-renderer)", "ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model)",
    "ytd-item-section-renderer:has(ytd-reel-shelf-renderer)", "ytd-item-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])",
    "ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])", "ytd-shelf-renderer:has(ytd-reel-shelf-renderer)",
    "ytd-shelf-renderer:has(ytd-rich-shelf-renderer[is-shorts])", "ytd-horizontal-card-list-renderer:has(a[href^='/shorts/'])",
    "ytd-shelf-renderer:has(a[href^='/shorts/'])", "ytd-rich-section-renderer:has(a[href^='/shorts/'])",
    "ytd-rich-item-renderer:has(a[href^='/shorts/'])", "ytd-video-renderer:has(a[href^='/shorts/'])",
    "ytd-compact-video-renderer:has(a[href^='/shorts/'])"
  ],
  shortsTab: ["a[href^='/shorts']", "tp-yt-paper-tab a[href^='/shorts']", "ytd-guide-entry-renderer:has(a[href='/shorts'])"],
  trending: ["a[href='/feed/trending']", "a[href='/explore']", "ytd-guide-entry-renderer a[href^='/feed/trending']"],
  watchSidebar: ["#related", "ytd-watch-next-secondary-results-renderer", "ytd-watch-next-results-renderer"],
  endscreen: [".ytp-endscreen-content", ".ytp-ce-element", "ytp-endscreen-content"],
  comments: ["ytd-comments", "#comments"],
  autoplayToggle: ["button.ytp-autonav-toggle-button", ".ytp-autonav-toggle-button"],
  nativeHome: ["ytd-browse[page-subtype='home'] #primary", "ytd-browse[page-subtype='home'] #contents"],
  nativeSearch: ["ytd-search #primary", "ytd-search #contents"],
  player: ["#movie_player", "ytd-player"],
  subscriptions: ["a[href='/feed/subscriptions']", "ytd-guide-entry-renderer a[href='/feed/subscriptions']", "ytd-mini-guide-entry-renderer a[href='/feed/subscriptions']"],
  notificationBell: ["ytd-notification-topbar-button-renderer", "#notification-button"],
  nativeSearchBox: ["ytd-masthead #center ytd-searchbox", "ytd-masthead ytd-searchbox", "ytd-masthead #search-form", "ytd-masthead #voice-search-button", "ytd-masthead #search-icon-legacy", "ytd-searchbox"],
  mastheadSearchRegion: ["ytd-masthead #center", "ytd-masthead #search"],
  modePickerHost: "focustube-picker-host",
  resultsHost: "focustube-results-host",
  homeHost: "focustube-home-host",
  switcherHost: "focustube-switcher-host",
  learnSearchHost: "focustube-search-host"
});

export function queryFirst(selectors, root = document) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const selector of list) {
    try { const match = root.querySelector(selector); if (match) return match; } catch { /* Selector changes should not break YouTube. */ }
  }
  return null;
}
export function queryAll(selectors, root = document) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  const matches = new Set();
  for (const selector of list) {
    try { root.querySelectorAll(selector).forEach(element => matches.add(element)); } catch { /* handled fallback */ }
  }
  return [...matches];
}
export function selectorHealth(root = document) {
  const report = {};
  for (const [name, selectors] of Object.entries(SELECTORS)) {
    if (!Array.isArray(selectors) && typeof selectors !== "string") continue;
    const list = Array.isArray(selectors) ? selectors : [selectors];
    report[name] = list.map(selector => {
      try { return { selector, matched: root.querySelector(selector) !== null }; }
      catch { return { selector, matched: false, invalid: true }; }
    });
  }
  return report;
}
export function pageTypeFromUrl(input) {
  try {
    const url = new URL(input);
    if (url.pathname === "/") return "home";
    if (url.pathname === "/results") return "search";
    if (url.pathname.startsWith("/watch")) return "watch";
    if (url.pathname.startsWith("/shorts/")) return "shorts";
    if (url.pathname.startsWith("/@") || url.pathname.startsWith("/channel/") || url.pathname.startsWith("/c/") || url.pathname.startsWith("/user/")) return "channel";
    return "other";
  } catch { return "other"; }
}
export function makeHideCss(modes) {
  const rules = [];
  const add = (mode, selectorNames, condition = "") => {
    const selectors = selectorNames.flatMap(name => SELECTORS[name] || []).filter(Boolean);
    if (selectors.length) rules.push(`html[data-focustube-mode="${mode}"]${condition} ${selectors.join(`,html[data-focustube-mode="${mode}"]${condition} `)}{display:none!important}`);
  };
  for (const mode of ["learn", "interest", "curiosity"]) {
    const settings = modes[mode];
    if (settings.hideShorts && mode !== "learn") add(mode, ["shortsShelves", "shortsTab"]);
    if (settings.hideTrending) add(mode, ["trending"]);
    if (settings.hideEndscreen) add(mode, ["endscreen"]);
    if (settings.hideSidebarRecommendations) add(mode, ["watchSidebar"]);
    if (settings.hideHomeFeed) add(mode, ["homeFeed"], `[data-focustube-page="home"]`);
  }
  if (modes.learn.hideSubscriptions) rules.push(`html[data-focustube-mode="learn"] ${SELECTORS.subscriptions.join(",html[data-focustube-mode=\"learn\"] ")}{display:none!important}`);
  if (modes.learn.hideNotifications) rules.push(`html[data-focustube-mode="learn"] ${SELECTORS.notificationBell.join(",html[data-focustube-mode=\"learn\"] ")}{display:none!important}`);
  rules.push(`html[data-focustube-mode="learn"][data-focustube-hide-shorts="true"] ${[...SELECTORS.shortsShelves, ...SELECTORS.shortsTab].join(",html[data-focustube-mode=\"learn\"][data-focustube-hide-shorts=\"true\"] ")}{display:none!important}`);
  const scoped = (rootSelector, selectors) => selectors.map(selector => `${rootSelector} ${selector}`).join(",");
  rules.push(`${scoped('html[data-focustube-mode="learn"][data-focustube-hide-subscriptions="true"]', SELECTORS.subscriptions)}{display:none!important}`);
  rules.push(`${scoped('html[data-focustube-mode="learn"][data-focustube-hide-comments="true"]', SELECTORS.comments)}{display:none!important}`);
  rules.push(`html[data-focustube-mode="learn"] ${SELECTORS.nativeSearchBox.join(",html[data-focustube-mode=\"learn\"] ")}{display:none!important}`);
  rules.push(`${scoped('html[data-focustube-hide-comments="true"]', SELECTORS.comments)}{display:none!important}`);
  rules.push(`${scoped('html[data-focustube-search="true"]', SELECTORS.searchResultItems)}{display:none!important}`);
  rules.push("html[data-focustube-mode='startup'] body,html[data-focustube-mode='picker'] body{overflow:hidden!important}");
  rules.push('html[data-focustube-gate="pending"] ytd-app{visibility:hidden!important;pointer-events:none!important}');
  rules.push('html[data-focustube-gate="pending"] body{overflow:hidden!important}');
  return rules.join("\n");
}
