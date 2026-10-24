export const SELECTORS = Object.freeze({
  homeFeed: ["ytd-browse[page-subtype='home'] ytd-rich-grid-renderer", "ytd-browse[page-subtype='home'] #primary ytd-rich-grid-renderer"],
  searchResults: ["ytd-search", "ytd-section-list-renderer"],
  searchResultItems: ["ytd-search ytd-video-renderer", "ytd-search ytd-rich-item-renderer", "ytd-search ytd-reel-shelf-renderer", "ytd-search ytd-rich-shelf-renderer[is-shorts]", "ytd-search ytd-horizontal-card-list-renderer"],
  shortsShelves: ["ytd-reel-shelf-renderer", "ytd-rich-shelf-renderer[is-shorts]", "ytd-rich-shelf-renderer:has(a[href^='/shorts/'])", "ytd-reel-item-renderer", "ytd-item-section-renderer:has(a[href^='/shorts/'])", "grid-shelf-view-model:has(a[href^='/shorts/'])", ".ytGridShelfViewModelGridShelfRow:has(a[href^='/shorts/'])"],
  shortsTab: ["a[href^='/shorts']", "tp-yt-paper-tab a[href^='/shorts']", "ytd-guide-entry-renderer a[href^='/shorts']"],
  trending: ["a[href='/feed/trending']", "a[href='/explore']", "ytd-guide-entry-renderer a[href^='/feed/trending']"],
  watchSidebar: ["#related", "ytd-watch-next-secondary-results-renderer", "ytd-watch-next-results-renderer"],
  endscreen: [".ytp-endscreen-content", ".ytp-ce-element", "ytp-endscreen-content"],
  comments: ["ytd-comments", "#comments"],
  autoplayToggle: ["button.ytp-autonav-toggle-button", ".ytp-autonav-toggle-button"],
  subscriptions: ["a[href='/feed/subscriptions']", "ytd-guide-entry-renderer a[href='/feed/subscriptions']", "ytd-mini-guide-entry-renderer a[href='/feed/subscriptions']"],
  nativeSearchRegion: ["ytd-masthead #center", "ytd-masthead #search"],
  nativeSearchResults: ["ytd-search #primary > ytd-section-list-renderer", "ytd-search #primary > #contents"],
  searchFilterChips: ["ytd-search ytd-feed-filter-chip-bar-renderer", "ytd-search ytd-chip-cloud-renderer", "ytd-search #header #chips", "ytd-search #header ytd-search-header-renderer"],
  notificationBell: ["ytd-masthead ytd-notification-topbar-button-renderer", "ytd-masthead #buttons ytd-notification-topbar-button-renderer"],
  modePickerHost: "focustube-picker-host", resultsHost: "focustube-results-host", homeHost: "focustube-home-host", switcherHost: "focustube-switcher-host"
});

export function queryFirst(selectors, root = document) {
  for (const selector of Array.isArray(selectors) ? selectors : [selectors]) {
    try { const match = root.querySelector(selector); if (match) return match; } catch { /* YouTube selectors change often. */ }
  }
  return null;
}
export function queryAll(selectors, root = document) {
  const matches = new Set();
  for (const selector of Array.isArray(selectors) ? selectors : [selectors]) {
    try { root.querySelectorAll(selector).forEach(node => matches.add(node)); } catch { /* Ignore unsupported selectors. */ }
  }
  return [...matches];
}
export function selectorHealth(root = document) {
  return Object.fromEntries(Object.entries(SELECTORS).filter(([, value]) => Array.isArray(value) || typeof value === "string").map(([name, value]) => [name, (Array.isArray(value) ? value : [value]).map(selector => {
    try { return { selector, matched: root.querySelector(selector) !== null }; } catch { return { selector, matched: false, invalid: true }; }
  })]));
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
export function makeHideCss(modes = {}) {
  const learn = modes.learn;
  const rules = [];
  const scopedHide = (selectorNames, condition = "") => {
    const selectors = selectorNames.flatMap(name => SELECTORS[name] || []);
    if (selectors.length) rules.push(`html[data-focustube-mode="learn"]${condition} ${selectors.join(`,html[data-focustube-mode="learn"]${condition} `)}{display:none!important}`);
  };
  if (learn) {
    scopedHide(["homeFeed"], `[data-focustube-page="home"]`);
    scopedHide(["shortsShelves", "shortsTab"]);
    scopedHide(["trending"]);
    scopedHide(["endscreen"]);
    scopedHide(["watchSidebar"]);
    scopedHide(["nativeSearchRegion"]);
    scopedHide(["searchFilterChips"]);
    scopedHide(["notificationBell"]);
    scopedHide(["nativeSearchResults"], `[data-focustube-search="true"]`);
    scopedHide(["subscriptions"], `[data-focustube-hide-subscriptions="true"]`);
    scopedHide(["comments"], `[data-focustube-hide-comments="true"]`);
    scopedHide(["searchResultItems"], `[data-focustube-search="true"]`);
  }
  rules.push('html[data-focustube-mode="startup"] ytd-app,html[data-focustube-mode="picker"] ytd-app{visibility:hidden!important}');
  rules.push('html[data-focustube-gate="pending"] ytd-app{visibility:hidden!important;pointer-events:none!important}');
  rules.push('html[data-focustube-gate="pending"] body{overflow:hidden!important}');
  rules.push('html[data-focustube-mode="startup"] body,html[data-focustube-mode="picker"] body{overflow:hidden!important}');
  return rules.join("\n");
}
