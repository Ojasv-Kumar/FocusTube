/* YouTube's markup is private and changes often. VERIFY IN LIVE BROWSER. */
export const SELECTORS = Object.freeze({
  homeFeed: ["ytd-rich-grid-renderer", "ytd-browse[page-subtype='home'] #primary ytd-rich-grid-renderer"],
  searchResults: ["ytd-search", "ytd-section-list-renderer"],
  searchContents: ["ytd-search #contents", "ytd-section-list-renderer #contents"],
  videoRenderer: ["ytd-video-renderer", "ytd-rich-item-renderer"],
  shortsShelves: ["ytd-reel-shelf-renderer", "ytd-rich-shelf-renderer[is-shorts]", "ytd-reel-item-renderer"],
  shortsTab: ["a[href^='/shorts']", "tp-yt-paper-tab a[href^='/shorts']"],
  trending: ["a[href='/feed/trending']", "a[href='/explore']", "ytd-guide-entry-renderer a[href^='/feed/trending']"],
  watchSidebar: ["#related", "ytd-watch-next-secondary-results-renderer", "ytd-watch-next-results-renderer"],
  endscreen: [".ytp-endscreen-content", ".ytp-ce-element", "ytp-endscreen-content"],
  comments: ["ytd-comments", "#comments"],
  autoplayToggle: ["button.ytp-autonav-toggle-button", ".ytp-autonav-toggle-button"],
  nativeHome: ["ytd-browse[page-subtype='home'] #primary", "ytd-browse[page-subtype='home'] #contents"],
  nativeSearch: ["ytd-search #primary", "ytd-search #contents"],
  player: ["#movie_player", "ytd-player"],
  modePickerHost: "focustube-picker-host",
  resultsHost: "focustube-results-host",
  homeHost: "focustube-home-host",
  switcherHost: "focustube-switcher-host"
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
    if (settings.hideShorts) add(mode, ["shortsShelves", "shortsTab"]);
    if (settings.hideTrending) add(mode, ["trending"]);
    if (settings.hideEndscreen) add(mode, ["endscreen"]);
    if (settings.hideSidebarRecommendations) add(mode, ["watchSidebar"]);
    if (settings.hideHomeFeed) add(mode, ["homeFeed"], `[data-focustube-page="home"]`);
  }
  const scoped = (rootSelector, selectors) => selectors.map(selector => `${rootSelector} ${selector}`).join(",");
  rules.push(`${scoped('html[data-focustube-hide-comments="true"]', SELECTORS.comments)}{display:none!important}`);
  rules.push(`${scoped('html[data-focustube-search="true"]', SELECTORS.searchContents)}{display:none!important}`);
  rules.push("html[data-focustube-mode='startup'] body,html[data-focustube-mode='picker'] body{overflow:hidden!important}");
  return rules.join("\n");
}
