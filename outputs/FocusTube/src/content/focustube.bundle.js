(() => {
  // src/config.js
  var CONFIG = Object.freeze({
    Backend: { baseUrl: "http://127.0.0.1:41731", healthTimeoutMs: 6e3, requestTimeoutMs: 3e4, maxRetries: 1, retryDelayMs: 350, enabled: true },
    LLM: {
      fastModel: "backend-managed",
      smartModel: "backend-managed",
      timeoutMs: 25e3,
      // 1,000..120,000 ms
      maxRetries: 2,
      // 0..5 retries after the first attempt
      backoffBaseMs: 500,
      // 100..10,000 ms
      maxOutputTokens: { expansion: 500, judge: 1800, repair: 1800, test: 32 },
      temperature: { expansion: 0.2, judge: 0.1, repair: 0, test: 0 },
      repairOutputMaxChars: 12e3,
      repairSchemaMaxChars: 3e3,
      retryAfterMaxMs: 3e4
    },
    Pipeline: {
      queriesPerSearch: 3,
      // 1..8; includes the original query
      resultsPerQuery: 8,
      // 1..25
      maxCandidatePoolSize: 36,
      // 5..100
      maxDescriptionChars: 420,
      // 80..2,000
      minimumVideoDurationSeconds: 181,
      // seconds; conservative proxy for Shorts up to 3 minutes (0 disables)
      shortsMaxDurationSeconds: 180,
      // eligible square/vertical uploads up to 180s can be Shorts
      minimumRelevance: 0.55,
      // 0..1
      maxVideosShown: 15,
      // 1..30
      excludeLiveStreams: true,
      nearDuplicateSimilarity: 0.88,
      // 0..1 title-token Jaccard threshold
      concurrency: 3,
      // 1..8 in-flight retrieval queries
      queryMaxChars: 240,
      titleMaxChars: 260,
      channelNameMaxChars: 120,
      reasonMaxChars: 140,
      interestFeedQueries: 15,
      // 1..15 expansion searches per interest refresh
      interestChannelSuggestions: 8,
      // 0..20 names from the expansion response
      channelSuggestionMaxChars: 100,
      interestFallbackQueries: 4,
      // 1..8 comma-separated fallback searches
      curiositySeedChannelsPerFeed: 6,
      // 1..40 channel searches per refresh
      curiosityMaximumSensationalScore: 0.75,
      // 0..1; higher scores are filtered
      curiosityTopicQueries: ["science explained", "engineering projects", "history documentary", "mathematics visual explanation"],
      demoQueries: ["backpropagation", "op amp basics", "recursion in python"]
    },
    Cache: {
      ttlMs: { pipeline: 20 * 6e4, expansion: 6 * 60 * 6e4, retrieval: 30 * 6e4 },
      maxEntries: 120
      // 10..2,000; oldest-first eviction
    },
    Modes: {
      learn: { hideHomeFeed: true, hideShorts: true, hideSubscriptions: true, hideNotifications: true, hideSidebarRecommendations: true, hideEndscreen: true, disableAutoplay: true, hideComments: false, hideTrending: true, redirectShortsToWatch: true, rankingProfile: "learning" },
      interest: { hideHomeFeed: true, hideShorts: true, hideSidebarRecommendations: false, hideEndscreen: true, disableAutoplay: true, hideComments: false, hideTrending: true, redirectShortsToWatch: true, rankingProfile: "interest" },
      curiosity: { hideHomeFeed: true, hideShorts: true, hideSidebarRecommendations: false, hideEndscreen: true, disableAutoplay: true, hideComments: false, hideTrending: true, redirectShortsToWatch: true, rankingProfile: "substance" },
      relax: { hideHomeFeed: false, hideShorts: false, hideSidebarRecommendations: false, hideEndscreen: false, disableAutoplay: false, hideComments: false, hideTrending: false, redirectShortsToWatch: false, rankingProfile: "none" }
    },
    Behaviour: { debugLogging: false, showFloatingSwitcher: false, gateWatchdogMs: 15e3, maxWaitMs: 8e3, selectorRetryMs: 250, navigationDebounceMs: 100, autoplayCheckMs: 1e3, autoplayMaxChecks: 12 },
    Settings: { hideShortsInLearn: true, disableAutoplayInLearn: true, resultsPerSearch: 8, showReasons: true, defaultInterestTopic: "", curiosityStrictness: "balanced", density: "comfortable", mockMode: false, debugLogging: false, askForModeEveryTab: true, keepCommentsVisible: true },
    UI: {
      maxResultsShown: 15,
      skeletonCardCount: 4,
      labels: { intro: "Start here", deep_dive: "Go deeper", hands_on: "Build it", reference: "Keep handy", other: "More useful picks" },
      modeDescriptions: {
        learn: "Learn something specific, with a guided path.",
        interest: "Explore one interest through videos and channels.",
        curiosity: "Browse broadly, with an eye for high substance.",
        relax: "Use YouTube as usual."
      }
    },
    Retrieval: {
      defaultProvider: "auto",
      // Prefer the YouTube Data API when configured; use HTML as a fallback.
      apiProviderEnabled: true,
      apiDailySearchCalls: 100,
      // current YouTube Search Queries bucket default
      apiDailySearchUnits: 100,
      apiDailyQuotaLimit: 1e4,
      // videos.list and other read quota units
      searchListCost: 1,
      // current official Search Queries bucket cost per call
      videosListCost: 1,
      apiResetTimeZone: "America/Los_Angeles"
    },
    ModesPicker: { interestMaxChars: 120, interestMinChars: 2 }
  });

  // src/storage.js
  var DEFAULT_SETTINGS = Object.freeze({
    activeMode: null,
    interestText: CONFIG.Settings.defaultInterestTopic,
    youtubeApiKey: "",
    retrievalProvider: CONFIG.Retrieval.defaultProvider,
    askForModeEveryTab: CONFIG.Settings.askForModeEveryTab,
    keepCommentsVisible: CONFIG.Settings.keepCommentsVisible,
    hideShortsInLearn: CONFIG.Settings.hideShortsInLearn,
    disableAutoplayInLearn: CONFIG.Settings.disableAutoplayInLearn,
    resultsPerSearch: CONFIG.Settings.resultsPerSearch,
    showReasons: CONFIG.Settings.showReasons,
    defaultInterestTopic: CONFIG.Settings.defaultInterestTopic,
    curiosityStrictness: CONFIG.Settings.curiosityStrictness,
    density: CONFIG.Settings.density,
    mockMode: CONFIG.Settings.mockMode,
    debugLogging: CONFIG.Settings.debugLogging
  });

  // src/messages.js
  var MESSAGE = Object.freeze({
    GET_SETTINGS: "GET_SETTINGS",
    SAVE_SETTINGS: "SAVE_SETTINGS",
    SET_MODE: "SET_MODE",
    RUN_PIPELINE: "RUN_PIPELINE",
    TEST_LLM: "TEST_LLM",
    TEST_YOUTUBE_API: "TEST_YOUTUBE_API",
    CLEAR_CACHE: "CLEAR_CACHE",
    PREWARM: "PREWARM",
    SELECTOR_HEALTH: "SELECTOR_HEALTH",
    BACKEND_HEALTH: "BACKEND_HEALTH"
  });
  function makeRequest(type, payload = {}, correlationId = "") {
    return { namespace: "focustube", type, payload, correlationId };
  }
  function sendMessage(type, payload = {}, correlationId = "") {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(makeRequest(type, payload, correlationId), (response) => {
          const runtimeError = chrome.runtime.lastError;
          resolve(runtimeError ? { ok: false, errorCode: "CONTEXT_INVALIDATED", userMessage: "FocusTube was reloaded. Refresh YouTube and try again." } : response || { ok: false, errorCode: "EMPTY_RESPONSE", userMessage: "FocusTube did not respond. Try again." });
        });
      } catch {
        resolve({ ok: false, errorCode: "CONTEXT_INVALIDATED", userMessage: "FocusTube was reloaded. Refresh YouTube and try again." });
      }
    });
  }

  // src/logger.js
  var debugEnabled = false;
  function setDebug(enabled) {
    debugEnabled = Boolean(enabled);
  }
  function write(level, moduleName, message, detail) {
    if (level === "debug" && !debugEnabled) return;
    const fn = console[level] || console.log;
    if (detail === void 0) fn(`[FocusTube][${moduleName}] ${message}`);
    else fn(`[FocusTube][${moduleName}] ${message}`, detail);
  }
  var logger = Object.freeze({
    debug: (moduleName, message, detail) => write("debug", moduleName, message, detail),
    info: (moduleName, message, detail) => write("info", moduleName, message, detail),
    warn: (moduleName, message, detail) => write("warn", moduleName, message, detail),
    error: (moduleName, message, detail) => write("error", moduleName, message, detail)
  });

  // src/utils.js
  function normalizeQuery(value, maxLength = CONFIG.Pipeline.queryMaxChars) {
    return Array.from(String(value ?? "").normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()).slice(0, maxLength).join("");
  }
  function makeCorrelationId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // src/selectors.js
  var SELECTORS = Object.freeze({
    homeFeed: ["ytd-rich-grid-renderer", "ytd-browse[page-subtype='home'] #primary ytd-rich-grid-renderer"],
    searchResults: ["ytd-search", "ytd-section-list-renderer"],
    searchContents: ["ytd-search #contents", "ytd-section-list-renderer #contents"],
    searchResultItems: ["ytd-search ytd-video-renderer", "ytd-search ytd-rich-item-renderer", "ytd-search ytd-reel-shelf-renderer", "ytd-search ytd-horizontal-card-list-renderer"],
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
    subscriptions: ["a[href='/feed/subscriptions']", "ytd-guide-entry-renderer a[href='/feed/subscriptions']", "ytd-mini-guide-entry-renderer a[href='/feed/subscriptions']"],
    notificationBell: ["ytd-notification-topbar-button-renderer", "#notification-button"],
    nativeSearchBox: ["ytd-masthead #center ytd-searchbox", "ytd-searchbox"],
    mastheadSearchRegion: ["ytd-masthead #center", "ytd-masthead #search"],
    modePickerHost: "focustube-picker-host",
    resultsHost: "focustube-results-host",
    homeHost: "focustube-home-host",
    switcherHost: "focustube-switcher-host",
    learnSearchHost: "focustube-search-host"
  });
  function queryFirst(selectors, root = document) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const selector of list) {
      try {
        const match = root.querySelector(selector);
        if (match) return match;
      } catch {
      }
    }
    return null;
  }
  function selectorHealth(root = document) {
    const report = {};
    for (const [name, selectors] of Object.entries(SELECTORS)) {
      if (!Array.isArray(selectors) && typeof selectors !== "string") continue;
      const list = Array.isArray(selectors) ? selectors : [selectors];
      report[name] = list.map((selector) => {
        try {
          return { selector, matched: root.querySelector(selector) !== null };
        } catch {
          return { selector, matched: false, invalid: true };
        }
      });
    }
    return report;
  }
  function pageTypeFromUrl(input) {
    try {
      const url = new URL(input);
      if (url.pathname === "/") return "home";
      if (url.pathname === "/results") return "search";
      if (url.pathname.startsWith("/watch")) return "watch";
      if (url.pathname.startsWith("/shorts/")) return "shorts";
      if (url.pathname.startsWith("/@") || url.pathname.startsWith("/channel/") || url.pathname.startsWith("/c/") || url.pathname.startsWith("/user/")) return "channel";
      return "other";
    } catch {
      return "other";
    }
  }
  function makeHideCss(modes) {
    const rules = [];
    const add = (mode, selectorNames, condition = "") => {
      const selectors = selectorNames.flatMap((name) => SELECTORS[name] || []).filter(Boolean);
      if (selectors.length) rules.push(`html[data-focustube-mode="${mode}"]${condition} ${selectors.join(`,html[data-focustube-mode="${mode}"]${condition} `)}{display:none!important}`);
    };
    for (const mode of ["learn", "interest", "curiosity"]) {
      const settings2 = modes[mode];
      if (settings2.hideShorts && mode !== "learn") add(mode, ["shortsShelves", "shortsTab"]);
      if (settings2.hideTrending) add(mode, ["trending"]);
      if (settings2.hideEndscreen) add(mode, ["endscreen"]);
      if (settings2.hideSidebarRecommendations) add(mode, ["watchSidebar"]);
      if (settings2.hideHomeFeed) add(mode, ["homeFeed"], `[data-focustube-page="home"]`);
    }
    if (modes.learn.hideSubscriptions) rules.push(`html[data-focustube-mode="learn"] ${SELECTORS.subscriptions.join(',html[data-focustube-mode="learn"] ')}{display:none!important}`);
    if (modes.learn.hideNotifications) rules.push(`html[data-focustube-mode="learn"] ${SELECTORS.notificationBell.join(',html[data-focustube-mode="learn"] ')}{display:none!important}`);
    rules.push(`html[data-focustube-mode="learn"][data-focustube-hide-shorts="true"] ${[...SELECTORS.shortsShelves, ...SELECTORS.shortsTab].join(',html[data-focustube-mode="learn"][data-focustube-hide-shorts="true"] ')}{display:none!important}`);
    const scoped = (rootSelector, selectors) => selectors.map((selector) => `${rootSelector} ${selector}`).join(",");
    rules.push(`html[data-focustube-mode="learn"] ${SELECTORS.nativeSearchBox.join(',html[data-focustube-mode="learn"] ')}{display:none!important}`);
    rules.push(`${scoped('html[data-focustube-hide-comments="true"]', SELECTORS.comments)}{display:none!important}`);
    rules.push(`${scoped('html[data-focustube-search="true"]', SELECTORS.searchResultItems)}{display:none!important}`);
    rules.push("html[data-focustube-mode='startup'] body,html[data-focustube-mode='picker'] body{overflow:hidden!important}");
    rules.push('html[data-focustube-gate="pending"] ytd-app{visibility:hidden!important;pointer-events:none!important}');
    rules.push('html[data-focustube-gate="pending"] body{overflow:hidden!important}');
    return rules.join("\n");
  }

  // src/content/mode-manager.js
  var installed = false;
  function ensureStyle() {
    if (installed || !document.documentElement) return;
    try {
      const style = document.createElement("style");
      style.dataset.focustubeStyles = "true";
      style.textContent = makeHideCss(CONFIG.Modes);
      document.documentElement.append(style);
      installed = true;
    } catch {
    }
  }
  function applyMode(mode, settings2 = {}) {
    const root = document.documentElement;
    if (!root) return;
    const safeMode = Object.hasOwn(CONFIG.Modes, mode) ? mode : "relax";
    if (safeMode === "relax") {
      root.removeAttribute("data-focustube-mode");
      root.removeAttribute("data-focustube-page");
      root.removeAttribute("data-focustube-hide-comments");
      root.removeAttribute("data-focustube-search");
      root.removeAttribute("data-focustube-hide-shorts");
      try {
        document.querySelector("style[data-focustube-styles]")?.remove();
      } catch {
      }
      installed = false;
      return;
    }
    ensureStyle();
    root.dataset.focustubeMode = safeMode;
    if (safeMode === "learn" && settings2.hideShortsInLearn !== false) root.dataset.focustubeHideShorts = "true";
    else root.removeAttribute("data-focustube-hide-shorts");
    if (safeMode === "learn" && (CONFIG.Modes.learn.hideComments || settings2.keepCommentsVisible === false)) root.dataset.focustubeHideComments = "true";
    else delete root.dataset.focustubeHideComments;
  }
  function setPageType(pageType, mode = "relax") {
    if (!document.documentElement) return;
    if (mode === "relax") document.documentElement.removeAttribute("data-focustube-page");
    else document.documentElement.dataset.focustubePage = pageType;
  }
  function setCuratedSearch(enabled) {
    if (!document.documentElement) return;
    if (enabled) document.documentElement.dataset.focustubeSearch = "true";
    else delete document.documentElement.dataset.focustubeSearch;
  }
  function enterPickerState() {
    if (document.documentElement) document.documentElement.dataset.focustubeMode = "picker";
  }

  // src/content/ui-kit.js
  function createHost(hostName, hostId) {
    try {
      const host = document.createElement(hostName);
      host.id = hostId;
      const shadow = host.attachShadow({ mode: "open" });
      return { host, shadow };
    } catch {
      return null;
    }
  }
  function addStyle(shadow, css) {
    const style = document.createElement("style");
    style.textContent = `${css}
:host{font-family:var(--ft-font,system-ui,sans-serif);color:var(--ft-text,#f0f2f5);line-height:1.5} .wrap,.dialog,.card,.control,.mode,.panel,.status,.original,.channel{color:var(--ft-text,#f0f2f5);background-color:var(--ft-surface,#15181d);border-color:var(--ft-border,#ffffff18);box-shadow:var(--ft-shadow,0 18px 55px #0008)} .title,.role,.sectionTitle,.videoTitle,.mode strong{color:var(--ft-text,#f0f2f5)} .intro,.query,.meta,.reason,.confidence,.footer,.mode span,.channel span{color:var(--ft-muted,#a1a8b3)} .button,.mode,.switch,.input,.interest{color:var(--ft-text,#f0f2f5);background:var(--ft-raised,#1b1f26);border-color:var(--ft-border,#ffffff18)} .button.primary{color:#10140d;background:var(--ft-accent,#a9e66e);border-color:var(--ft-accent,#a9e66e)} .skeleton{background:linear-gradient(100deg,#191d23 25%,#242a31 38%,#191d23 60%);background-size:200% 100%}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}`;
    shadow.append(style);
    return style;
  }
  function element(tagName, options = {}) {
    const node = document.createElement(tagName);
    if (options.className) node.className = options.className;
    if (options.text !== void 0) node.textContent = String(options.text);
    if (options.type) node.type = options.type;
    if (options.href) node.href = options.href;
    if (options.target) node.target = options.target;
    if (options.rel) node.rel = options.rel;
    if (options.attributes) for (const [name, value] of Object.entries(options.attributes)) node.setAttribute(name, String(value));
    return node;
  }
  function button(text, className = "button", action = null) {
    const node = element("button", { text, className, type: "button" });
    if (action) node.addEventListener("click", action);
    return node;
  }
  function safeRemove(host) {
    try {
      host?.remove();
    } catch {
    }
  }
  function formatViews(value) {
    if (value == null || !Number.isFinite(Number(value))) return "";
    try {
      return new Intl.NumberFormat(void 0, { notation: "compact", maximumFractionDigits: 1 }).format(Number(value)) + " views";
    } catch {
      return `${Number(value).toLocaleString()} views`;
    }
  }
  function formatDuration(seconds) {
    if (!Number.isFinite(Number(seconds))) return "";
    const total = Math.max(0, Math.floor(Number(seconds)));
    const hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), secs = total % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
  }
  function componentCss() {
    return `:host{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1d2925;line-height:1.45;box-sizing:border-box}*,*::before,*::after{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}.button{border:1px solid #d2dcd7;background:#fff;color:#26332e;border-radius:12px;padding:10px 14px;font-weight:650;transition:background .16s,border-color .16s}.button:hover{background:#eef5f1;border-color:#9db7aa}.button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #7ab99b;outline-offset:2px}.button.primary{background:#174c3a;color:#fff;border-color:#174c3a}.button.primary:hover{background:#226249}.muted{color:#64716c}.eyebrow{text-transform:uppercase;letter-spacing:.11em;font-size:11px;font-weight:750;color:#547267}.panel{background:#fbfcfa;border:1px solid #e0e8e2;border-radius:18px;box-shadow:0 10px 35px #1c382516}.status{padding:16px;border:1px solid #e4e9e5;background:#fff;border-radius:14px}.error{border-color:#e9c9c1;background:#fff8f6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:16px}.skeleton{height:248px;border-radius:16px;background:linear-gradient(100deg,#edf1ed 25%,#f8faf8 38%,#edf1ed 60%);background-size:200% 100%;animation:ft-shimmer 1.2s ease-in-out infinite}@keyframes ft-shimmer{to{background-position-x:-200%}}`;
  }

  // src/content/mode-picker.js
  var MODE_NAMES = { learn: "Learn", interest: "Interest", curiosity: "Curiosity", relax: "Relax" };
  var MODE_KEYS = ["learn", "interest", "curiosity", "relax"];
  var MODAL_CSS = `:host{position:fixed;inset:0;z-index:2147483647;display:block}.backdrop{position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:rgba(8,10,12,.96)}.dialog{width:min(760px,100%);max-height:calc(100vh - 48px);overflow:auto;padding:clamp(22px,5vw,46px);background:#f9fbf8;border:1px solid #dbe5dd;border-radius:24px;box-shadow:0 28px 90px #000b}.brand{margin:0 0 12px;font-size:12px;color:#547267;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.title{margin:0;color:#183a2c;font-size:clamp(26px,4vw,38px);letter-spacing:-.035em;line-height:1.15}.intro{margin:12px 0 26px;color:#60716a;font-size:16px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mode{min-height:126px;text-align:left;padding:18px;border-radius:17px;background:#fff;border:1px solid #dce6df}.mode:hover{background:#f0f7f2;border-color:#94b7a5}.mode.selected{border-color:#a9e66e;box-shadow:inset 3px 0 #a9e66e}.mode svg{display:block;width:22px;height:22px;margin-bottom:12px;color:#a9e66e}.mode strong{display:block;font-size:18px;color:#183a2c}.mode span{display:block;margin-top:7px;color:#66736d;font-size:14px;font-weight:450}.footer{margin:18px 0 0;color:#79867f;font-size:12px}.form{display:grid;gap:14px;margin-top:24px}.label{font-weight:700;color:#294439}.interest{width:100%;padding:13px 14px;border:1px solid #cbd8d0;border-radius:12px;background:#fff;color:#1c3028}.actions{display:flex;gap:10px;flex-wrap:wrap}.hint{min-height:18px;color:#9c4b3c;font-size:13px}@media(max-width:520px){.cards{grid-template-columns:1fr}.mode{min-height:auto}}`;
  var ICON_PATH = { learn: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Zm0 0V21m4-13h8m-8 4h8", interest: "M12 3l1.8 5.6L20 10l-6.2 1.4L12 17l-1.8-5.6L4 10l6.2-1.4L12 3Zm6 11 .9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14Z", curiosity: "M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm-2.2 6.1a1.3 1.3 0 1 1 1.3-1.3m-.2 9.5v-1.8c0-1.4 2.1-1.7 2.1-3.5a2.2 2.2 0 0 0-4.4 0", relax: "M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6Zm9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" };
  function iconFor(mode) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ICON_PATH[mode]);
    svg.append(path);
    return svg;
  }
  function openModePicker({ currentMode = "learn", interestText: interestText2 = "", required = false, onSelect, onClose } = {}) {
    const pair = createHost("focustube-picker-host", "focustube-picker-host");
    if (!pair) return null;
    const { host, shadow } = pair;
    addStyle(shadow, componentCss() + MODAL_CSS);
    const backdrop = element("div", { className: "backdrop" });
    const dialog = element("section", { className: "dialog", attributes: { role: "dialog", "aria-modal": "true", "aria-labelledby": "focustube-picker-title" } });
    const renderChoices = () => {
      dialog.replaceChildren();
      dialog.append(element("p", { className: "brand", text: "FOCUSTUBE" }));
      dialog.append(element("h1", { className: "title", text: "What are you here for today?", attributes: { id: "focustube-picker-title" } }));
      dialog.append(element("p", { className: "intro", text: "Choose how you want YouTube to work for this session." }));
      const cards = element("div", { className: "cards" });
      for (const mode of MODE_KEYS) {
        const card = button("", "mode");
        if (mode === currentMode) card.classList.add("selected");
        card.append(iconFor(mode));
        const heading = element("strong", { text: MODE_NAMES[mode] });
        const description = element("span", { text: CONFIG.UI.modeDescriptions[mode] });
        card.setAttribute("aria-label", `${MODE_NAMES[mode]}: ${CONFIG.UI.modeDescriptions[mode]}`);
        card.append(heading, description);
        card.addEventListener("click", () => mode === "interest" ? renderInterest() : finish(mode, interestText2));
        cards.append(card);
      }
      dialog.append(cards, element("p", { className: "footer", text: "Switch modes any time from the FocusTube popup." }));
      queueMicrotask(() => cards.querySelector("button")?.focus());
    };
    const renderInterest = () => {
      dialog.replaceChildren();
      dialog.append(element("p", { className: "brand", text: "FOCUSTUBE \xB7 INTEREST" }));
      dialog.append(element("h1", { className: "title", text: "What would you like to explore?", attributes: { id: "focustube-picker-title" } }));
      dialog.append(element("p", { className: "intro", text: "Your home feed and search will stay close to this interest." }));
      const form = element("form", { className: "form" });
      const label = element("label", { className: "label", text: "Your interest" });
      const input = element("input", { className: "interest", type: "text", attributes: { maxlength: CONFIG.ModesPicker.interestMaxChars, placeholder: "e.g. embedded systems and robotics", required: "true", autocomplete: "off" } });
      input.value = interestText2;
      label.htmlFor = "focustube-interest-input";
      input.id = label.htmlFor;
      const hint = element("div", { className: "hint", attributes: { "aria-live": "polite" } });
      const actions = element("div", { className: "actions" });
      const back = button("Back", "button", renderChoices);
      const submit = element("button", { className: "button primary", text: "Use this interest", type: "submit" });
      actions.append(back, submit);
      form.append(label, input, hint, actions);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = input.value.trim();
        if (value.length < CONFIG.ModesPicker.interestMinChars) {
          hint.textContent = `Add at least ${CONFIG.ModesPicker.interestMinChars} characters.`;
          input.focus();
          return;
        }
        finish("interest", value.slice(0, CONFIG.ModesPicker.interestMaxChars));
      });
      dialog.append(form);
      queueMicrotask(() => input.focus());
    };
    const finish = (mode, interest) => {
      safeRemove(host);
      try {
        sessionStorage.setItem("focustube.pickerSeen", "1");
      } catch {
      }
      onSelect?.(mode, interest);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!required) onClose?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...shadow.querySelectorAll("button,input")].filter((node) => !node.disabled);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && shadow.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && shadow.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    shadow.addEventListener("keydown", onKeyDown);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop && !required) onClose?.();
    });
    backdrop.append(dialog);
    shadow.append(backdrop);
    (document.documentElement || document.body).append(host);
    renderChoices();
    return { host, close: () => safeRemove(host) };
  }

  // src/content/mode-switcher.js
  var SWITCHER_CSS = `:host{position:fixed;right:18px;bottom:18px;z-index:2147483000}.control{display:flex;align-items:center;gap:9px;padding:8px 9px 8px 12px;background:#f8fbf8;border:1px solid #d8e3dc;border-radius:999px;box-shadow:0 5px 22px #0d261b26}.label{color:#263f33;font-size:12px;font-weight:700;white-space:nowrap}.switch{border:0;background:#174c3a;color:#fff;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:750}.switch:hover{background:#226249}.switch:focus-visible{outline:3px solid #7ab99b;outline-offset:2px}@media(max-width:520px){:host{right:10px;bottom:10px}.label{display:none}}`;
  var LABEL = { learn: "Learn", interest: "Interest", curiosity: "Curiosity", relax: "Relax" };
  function createModeSwitcher(onOpen) {
    const pair = createHost(SELECTORS.switcherHost, SELECTORS.switcherHost);
    if (!pair) return null;
    const { host, shadow } = pair;
    addStyle(shadow, componentCss() + SWITCHER_CSS);
    const control = element("div", { className: "control" });
    const label = element("span", { className: "label", text: "FocusTube \xB7 Relax" });
    const switchButton = button("Switch mode", "switch", onOpen);
    switchButton.setAttribute("aria-label", "Switch FocusTube mode");
    control.append(label, switchButton);
    shadow.append(control);
    (document.documentElement || document.body).append(host);
    return { host, update(mode) {
      label.textContent = `FocusTube \xB7 ${LABEL[mode] || LABEL.relax}`;
    }, dispose() {
      safeRemove(host);
    } };
  }

  // src/content/results-ui.js
  var RESULTS_CSS = `:host{display:block;width:100%;min-width:0;max-width:1120px;box-sizing:border-box;overflow:hidden;position:relative}.wrap{width:100%;min-width:0;max-width:1120px;box-sizing:border-box;overflow:hidden;margin:28px auto 60px;padding:22px 24px;background:#f8faf8;border:1px solid #e1e8e2;border-radius:22px;box-shadow:0 10px 35px #193a2810}.wrap.compact{padding:14px 16px}.wrap.compact .body{padding:9px 11px}.wrap.compact .role{margin:18px 0 8px}.header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:22px}.title{margin:4px 0 4px;font-size:26px;line-height:1.2;letter-spacing:-.025em;color:#183a2c}.query{margin:0;color:#69766f}.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.role{margin:28px 0 12px;font-size:18px;color:#244335}.card{overflow:hidden;border:1px solid #e0e7e1;border-radius:16px;background:#fff;transition:transform .16s,box-shadow .16s}.card:hover{transform:translateY(-2px);box-shadow:0 12px 28px #17352714}.thumbLink{display:block;position:relative;aspect-ratio:16/9;background:#edf2ed}.thumb{width:100%;height:100%;object-fit:cover;display:block}.thumbnailPlaceholder{width:100%;height:100%;display:grid;place-items:center;background:radial-gradient(ellipse at 20% 20%,#c6dfd0,#edf2ed 65%);color:#476754;font-size:12px;font-weight:750;letter-spacing:.08em}.duration{position:absolute;right:8px;bottom:8px;padding:2px 6px;border-radius:5px;background:#14241edb;color:#fff;font-size:12px}.body{padding:13px 14px 15px}.videoTitle{color:#1c3128;text-decoration:none;font-size:15px;font-weight:750;line-height:1.35}.videoTitle:hover{text-decoration:underline}.meta{margin:8px 0 0;color:#6b7771;font-size:12px}.reason{margin:11px 0 0;color:#33483f;font-size:13px}.confidence{margin:7px 0 0;color:#728078;font-size:11px}.badge{display:inline-block;margin-top:10px;padding:4px 8px;background:#edf4ef;border-radius:999px;color:#3c6a53;font-size:11px;font-weight:750}.original{padding:14px 16px;margin-bottom:12px;border-radius:13px;background:#fff;border:1px solid #e2e8e3;color:#64726b}.error{padding:20px}.error p{margin:0 0 14px}.skeletonGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.skeleton{height:270px}@media(max-width:560px){.wrap{margin:12px 8px;padding:16px}.header{display:block}.actions{justify-content:flex-start;margin-top:14px}}`;
  function makeCard(video, roleLabel, offline = false, showReason = true) {
    const card = element("article", { className: "card" });
    const href = `https://www.youtube.com/watch?v=${encodeURIComponent(String(video.id))}`;
    const thumbLink = element("a", { className: "thumbLink", href, attributes: { "aria-label": `Watch ${video.title}` } });
    if (!offline && video.thumbnailUrl) {
      const image = element("img", { className: "thumb", attributes: { src: video.thumbnailUrl, alt: "", loading: "lazy" } });
      image.addEventListener("error", () => image.remove());
      thumbLink.append(image);
    } else thumbLink.append(element("div", { className: "thumbnailPlaceholder", text: "FOCUSTUBE PREVIEW" }));
    if (video.durationSeconds != null) thumbLink.append(element("span", { className: "duration", text: formatDuration(video.durationSeconds) }));
    const body = element("div", { className: "body" });
    body.append(element("a", { className: "videoTitle", text: video.title, href }));
    const meta = [video.channelName, formatDuration(video.durationSeconds), formatViews(video.viewCount)].filter(Boolean).join(" \xB7 ");
    body.append(element("p", { className: "meta", text: meta }));
    if (roleLabel) body.append(element("span", { className: "badge", text: roleLabel }));
    if (showReason && video.reason) body.append(element("p", { className: "reason", text: video.reason }));
    if (Number.isFinite(Number(video.quality))) body.append(element("p", { className: "confidence", text: `Confidence ${Math.round(Number(video.quality) * 100)}%` }));
    card.append(thumbLink, body);
    return card;
  }
  function createResultsUI({ mode, query, parent = null, settings: settings2 = {}, onRetry = () => {
  }, onOriginalChange = () => {
  } }) {
    const pair = createHost(SELECTORS.resultsHost, SELECTORS.resultsHost);
    if (!pair) return null;
    const { host, shadow } = pair;
    addStyle(shadow, componentCss() + RESULTS_CSS);
    const wrap = element("section", { className: `wrap ${settings2.density === "compact" ? "compact" : ""}`, attributes: { "aria-label": "FocusTube curated videos" } });
    const header = element("div", { className: "header" });
    const headingBlock = element("div");
    headingBlock.append(element("p", { className: "eyebrow", text: mode === "learn" ? "A guided learning path" : "A focused set of videos" }));
    headingBlock.append(element("h2", { className: "title", text: "Your results" }));
    headingBlock.append(element("p", { className: "query", text: query }));
    const actions = element("div", { className: "actions" });
    const retryButton = button("Retry", "button");
    retryButton.addEventListener("click", onRetry);
    const originalButton = button("Show original YouTube results", "button");
    actions.append(retryButton, originalButton);
    header.append(headingBlock, actions);
    const status = element("div", { className: "status", attributes: { "aria-live": "polite" } });
    wrap.append(header, status);
    shadow.append(wrap);
    const targetParent = parent || queryFirst(["ytd-search", "ytd-app", "main"]) || document.body || document.documentElement;
    targetParent.append(host);
    let original = false;
    let savedResults = [];
    let savedStatusClass = "status";
    const originalNotice = () => {
      const notice = element("div", { className: "original", text: "Original YouTube results are visible." });
      const switchBack = button("Show FocusTube picks", "button primary", () => toggleOriginal());
      notice.append(document.createTextNode(" "), switchBack);
      return notice;
    };
    const preserveOriginalNotice = () => {
      if (!original) return;
      savedResults = [...status.childNodes];
      savedStatusClass = status.className || "status";
      status.className = "status";
      status.replaceChildren(originalNotice());
    };
    const toggleOriginal = () => {
      original = !original;
      setCuratedSearch(!original);
      retryButton.hidden = original;
      originalButton.textContent = original ? "Show FocusTube results" : "Show original YouTube results";
      if (original) {
        savedResults = [...status.childNodes];
        savedStatusClass = status.className || "status";
        status.className = "status";
        status.replaceChildren(originalNotice());
      } else {
        status.className = savedStatusClass;
        status.replaceChildren(...savedResults);
      }
      onOriginalChange(original);
    };
    originalButton.addEventListener("click", toggleOriginal);
    const renderSkeleton = () => {
      original = false;
      savedResults = [];
      setCuratedSearch(true);
      retryButton.hidden = false;
      originalButton.textContent = "Show original YouTube results";
      status.hidden = false;
      const grid = element("div", { className: "skeletonGrid" });
      for (let i = 0; i < CONFIG.UI.skeletonCardCount; i += 1) grid.append(element("div", { className: "skeleton" }));
      status.className = "";
      status.replaceChildren(grid);
    };
    const renderError = (message) => {
      setCuratedSearch(false);
      status.className = "status error";
      status.replaceChildren();
      status.append(element("p", { text: message }));
      const retry = button("Try again", "button primary", onRetry);
      const dismiss = button("Dismiss", "button", () => {
        status.replaceChildren();
        status.hidden = true;
      });
      status.append(retry, dismiss, document.createTextNode(" Native YouTube results are available below."));
      preserveOriginalNotice();
    };
    const renderResults = (result) => {
      status.className = "";
      status.replaceChildren();
      if (result.metadata?.fallbackLabel) status.append(element("div", { className: "status", text: result.metadata.fallbackLabel }));
      if (!result.videos?.length) {
        renderError("No videos met the quality threshold. Try a broader search or show original results.");
        return;
      }
      const roleGroups = /* @__PURE__ */ new Map();
      for (const video of result.videos) {
        const role = mode === "learn" ? video.role || "other" : "other";
        if (!roleGroups.has(role)) roleGroups.set(role, []);
        roleGroups.get(role).push(video);
      }
      for (const [role, videos] of roleGroups) {
        const label = CONFIG.UI.labels[role] || CONFIG.UI.labels.other;
        status.append(element("h3", { className: "role", text: label }));
        const grid = element("div", { className: "grid" });
        for (const video of videos) grid.append(makeCard(video, mode === "learn" ? label : "", result.metadata?.providers?.includes("mock"), settings2.showReasons !== false));
        status.append(grid);
      }
      preserveOriginalNotice();
    };
    const dispose = () => {
      setCuratedSearch(false);
      safeRemove(host);
    };
    return { host, shadow, renderSkeleton, renderError, renderResults, dispose, toggleOriginal };
  }

  // src/content/home-ui.js
  var HOME_CSS = `.wrap{max-width:1120px;margin:28px auto 60px;padding:24px;background:#f8faf8;border:1px solid #e1e8e2;border-radius:22px;box-shadow:0 10px 35px #193a2810}.hero{max-width:670px;padding:20px 8px 27px}.title{margin:7px 0 11px;font-size:clamp(25px,4vw,38px);letter-spacing:-.035em;line-height:1.18;color:#183a2c}.intro{margin:0 0 19px;color:#65746c}.search{display:flex;gap:9px;flex-wrap:wrap}.input{flex:1;min-width:220px;padding:13px 14px;border:1px solid #cad8cf;border-radius:12px;background:#fff;color:#1d3027}.section{margin-top:28px}.sectionTitle{margin:0 0 13px;font-size:19px;color:#244335}.channels{display:flex;gap:10px;flex-wrap:wrap}.channel{display:block;max-width:340px;padding:14px 16px;background:#fff;border:1px solid #e1e8e2;border-radius:14px;color:#1e3329;text-decoration:none}.channel:hover{border-color:#9db7aa;background:#f2f7f3}.channel strong{display:block}.channel span{display:block;margin-top:5px;color:#68766f;font-size:13px}.card{overflow:hidden;border:1px solid #e0e7e1;border-radius:16px;background:#fff}.thumbLink{display:block;aspect-ratio:16/9;background:#edf2ed;position:relative}.thumb{width:100%;height:100%;object-fit:cover}.thumbnailPlaceholder{width:100%;height:100%;display:grid;place-items:center;background:radial-gradient(ellipse at 20% 20%,#c6dfd0,#edf2ed 65%);color:#476754;font-size:12px;font-weight:750;letter-spacing:.08em}.duration{position:absolute;right:8px;bottom:8px;padding:2px 6px;background:#14241edb;border-radius:5px;color:#fff;font-size:12px}.body{padding:13px 14px}.videoTitle{color:#1c3128;text-decoration:none;font-weight:750}.meta{margin:7px 0 0;color:#6b7771;font-size:12px}.reason{margin:9px 0 0;color:#3b4f45;font-size:13px}.skeletonGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.skeleton{height:260px}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px}.empty{padding:18px;background:white;border-radius:12px;color:#66746c}`;
  function makeHomeCard(video, offline = false) {
    const card = element("article", { className: "card" });
    const href = `https://www.youtube.com/watch?v=${encodeURIComponent(String(video.id))}`;
    const thumbLink = element("a", { className: "thumbLink", href, attributes: { "aria-label": `Watch ${video.title}` } });
    if (!offline && video.thumbnailUrl) {
      const image = element("img", { className: "thumb", attributes: { src: video.thumbnailUrl, alt: "", loading: "lazy" } });
      image.addEventListener("error", () => image.remove());
      thumbLink.append(image);
    } else thumbLink.append(element("div", { className: "thumbnailPlaceholder", text: "FOCUSTUBE PREVIEW" }));
    if (video.durationSeconds != null) thumbLink.append(element("span", { className: "duration", text: formatDuration(video.durationSeconds) }));
    const body = element("div", { className: "body" });
    body.append(element("a", { className: "videoTitle", text: video.title, href }));
    body.append(element("p", { className: "meta", text: [video.channelName, formatViews(video.viewCount)].filter(Boolean).join(" \xB7 ") }));
    if (video.reason) body.append(element("p", { className: "reason", text: video.reason }));
    card.append(thumbLink, body);
    return card;
  }
  function createHomeUI({ mode, interest = "", onSearch = () => {
  }, onRefresh = () => {
  }, onUseOriginal = () => {
  } }) {
    const pair = createHost(SELECTORS.homeHost, SELECTORS.homeHost);
    if (!pair) return null;
    const { host, shadow } = pair;
    addStyle(shadow, componentCss() + HOME_CSS);
    const wrap = element("section", { className: "wrap", attributes: { "aria-label": "FocusTube home" } });
    const hero = element("div", { className: "hero" });
    hero.append(element("p", { className: "eyebrow", text: mode === "learn" ? "LEARN MODE" : mode === "interest" ? "YOUR INTEREST" : "CURATED FOR CURIOSITY" }));
    hero.append(element("h2", { className: "title", text: mode === "learn" ? "What do you want to learn?" : mode === "interest" ? interest : "A little more signal in your browsing." }));
    hero.append(element("p", { className: "intro", text: mode === "learn" ? "Search a topic to get a thoughtful path through useful videos." : mode === "interest" ? "Your feed follows the interest you chose. Change it any time with the FocusTube control." : "Explore useful ideas from broad topics and educational channels." }));
    if (mode === "learn") {
      const form = element("form", { className: "search" });
      const input = element("input", { className: "input", type: "search", attributes: { placeholder: "e.g. how backpropagation works", "aria-label": "What do you want to learn?", maxlength: CONFIG.Pipeline.queryMaxChars } });
      const submit = element("button", { className: "button primary", text: "Find a learning path", type: "submit" });
      form.append(input, submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        onSearch(input.value.trim());
      });
      hero.append(form);
    } else {
      const toolbar = element("div", { className: "toolbar" });
      const refresh = button("Refresh feed", "button primary", onRefresh);
      toolbar.append(refresh);
      hero.append(toolbar);
    }
    const status = element("div", { className: "status", attributes: { "aria-live": "polite" } });
    wrap.append(hero, status);
    shadow.append(wrap);
    const parent = queryFirst(["ytd-browse[page-subtype='home'] #primary", "ytd-browse #primary", "ytd-app #content"], document) || document.body || document.documentElement;
    parent.append(host);
    const renderSkeleton = () => {
      status.className = "";
      status.replaceChildren();
      const grid = element("div", { className: "skeletonGrid" });
      for (let i = 0; i < CONFIG.UI.skeletonCardCount; i++) grid.append(element("div", { className: "skeleton" }));
      status.append(grid);
    };
    const renderError = (message) => {
      status.className = "status error";
      status.textContent = message;
      const retry = button("Try again", "button primary", onRefresh);
      const original = button("Switch to Relax and show YouTube", "button", onUseOriginal);
      status.append(document.createTextNode(" "), retry, document.createTextNode(" "), original);
    };
    const renderResults = (result) => {
      status.className = "";
      status.replaceChildren();
      if (result.metadata?.fallbackLabel) status.append(element("div", { className: "status", text: result.metadata.fallbackLabel }));
      if (mode === "interest" && result.channels?.length) {
        const section2 = element("section", { className: "section" });
        section2.append(element("h3", { className: "sectionTitle", text: "Channels to explore" }));
        const row = element("div", { className: "channels" });
        for (const channel of result.channels) {
          const link = element("a", { className: "channel", href: `https://www.youtube.com/results?search_query=${encodeURIComponent(channel.name)}` });
          link.append(element("strong", { text: channel.name }), element("span", { text: channel.reason || "Suggested for your interest." }));
          row.append(link);
        }
        section2.append(row);
        status.append(section2);
      }
      const section = element("section", { className: "section" });
      const heading = element("div", { className: "toolbar" });
      heading.append(element("h3", { className: "sectionTitle", text: mode === "interest" ? "Videos for your interest" : "Videos to explore" }));
      section.append(heading);
      if (!result.videos?.length) section.append(element("div", { className: "empty", text: "No videos were found yet. Try refreshing or adjusting your interest." }));
      else {
        const grid = element("div", { className: "grid" });
        for (const video of result.videos) grid.append(makeHomeCard(video, result.metadata?.providers?.includes("mock")));
        section.append(grid);
      }
      status.append(section);
    };
    return { host, renderSkeleton, renderError, renderResults, dispose: () => safeRemove(host) };
  }

  // src/content/learn-search.js
  var CSS = `:host{display:block;width:100%;min-width:0}.bar{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:4px 5px 4px 14px;border:1px solid #ffffff24;border-radius:999px;background:#171a20}.input{flex:1;min-width:0;border:0;background:transparent;color:#f0f2f5;padding:8px 2px;outline:none}.input:focus-visible{outline:0}.submit{white-space:nowrap;border:0;border-radius:999px;background:#a9e66e;color:#10140d;padding:8px 15px;font-weight:700;cursor:pointer}.submit:focus-visible,.input:focus-visible{outline:2px solid #a9e66e;outline-offset:2px}`;
  function createLearnSearch({ query = "", onSubmit = () => {
  } } = {}) {
    const anchor = queryFirst(SELECTORS.mastheadSearchRegion);
    if (!anchor) return null;
    const pair = createHost(SELECTORS.learnSearchHost, SELECTORS.learnSearchHost);
    if (!pair) return null;
    const { host, shadow } = pair;
    addStyle(shadow, CSS);
    const form = element("form", { className: "bar", attributes: { role: "search" } });
    const input = element("input", { className: "input", type: "search", attributes: { placeholder: "What do you want to learn?", "aria-label": "Search a learning topic", maxlength: CONFIG.Pipeline.queryMaxChars } });
    input.value = Array.from(String(query)).slice(0, CONFIG.Pipeline.queryMaxChars).join("");
    const submit = button("Search", "submit");
    submit.type = "submit";
    form.append(input, submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = Array.from(input.value.trim()).slice(0, CONFIG.Pipeline.queryMaxChars).join("");
      if (value) onSubmit(value);
      else input.focus();
    });
    shadow.append(form);
    anchor.append(host);
    return { host, update(value) {
      input.value = Array.from(String(value || "")).slice(0, CONFIG.Pipeline.queryMaxChars).join("");
    }, dispose() {
      safeRemove(host);
    } };
  }

  // src/content/autoplay.js
  var observer = null;
  var timer = null;
  var checks = 0;
  var changingProgrammatically = false;
  var userOverrode = false;
  function startAutoplayGuard() {
    stopAutoplayGuard(false);
    checks = 0;
    const onUserClick = (event) => {
      const button2 = event.target?.closest?.(SELECTORS.autoplayToggle.join(","));
      if (button2 && !changingProgrammatically) userOverrode = true;
    };
    document.addEventListener("click", onUserClick, true);
    const attempt = () => {
      if (userOverrode || checks >= CONFIG.Behaviour.autoplayMaxChecks) {
        clearInterval(timer);
        timer = null;
        return;
      }
      checks += 1;
      const toggle = queryFirst(SELECTORS.autoplayToggle);
      const isEnabled = toggle?.getAttribute("aria-checked") === "true" || toggle?.classList?.contains("ytp-autonav-toggle-button-on");
      if (toggle && isEnabled) {
        changingProgrammatically = true;
        try {
          toggle.click();
        } catch {
        }
        queueMicrotask(() => {
          changingProgrammatically = false;
        });
        clearInterval(timer);
        timer = null;
      }
    };
    attempt();
    if (!userOverrode && checks < CONFIG.Behaviour.autoplayMaxChecks) timer = setInterval(attempt, CONFIG.Behaviour.autoplayCheckMs);
    observer = new MutationObserver(() => {
      if (!timer && !userOverrode && checks < CONFIG.Behaviour.autoplayMaxChecks) {
        checks = 0;
        attempt();
        timer = setInterval(attempt, CONFIG.Behaviour.autoplayCheckMs);
      }
    });
    try {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch {
    }
    return () => {
      document.removeEventListener("click", onUserClick, true);
      stopAutoplayGuard(false);
    };
  }
  function stopAutoplayGuard(resetUserOverride = false) {
    if (timer) clearInterval(timer);
    timer = null;
    observer?.disconnect();
    observer = null;
    if (resetUserOverride) userOverrode = false;
  }

  // src/content/main.js
  var settings = { ...DEFAULT_SETTINGS };
  var activeMode = "relax";
  var interestText = "";
  var picker = null;
  var switcher = null;
  var resultsUI = null;
  var homeUI = null;
  var learnSearchUI = null;
  var autoplayCleanup = null;
  var requestToken = 0;
  var navTimer = null;
  var observer2 = null;
  var navigationCleanup = null;
  var disposed = false;
  var lastUrl = location.href;
  var currentPageType = "other";
  function hideCurrentPanels() {
    resultsUI?.dispose();
    resultsUI = null;
    homeUI?.dispose();
    homeUI = null;
    learnSearchUI?.dispose();
    learnSearchUI = null;
    autoplayCleanup?.();
    autoplayCleanup = null;
    setCuratedSearch(false);
  }
  function safeSessionGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function safeSessionSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
    }
  }
  function updateSwitcher() {
    switcher?.update(activeMode);
  }
  function syncSwitcher() {
    if (!CONFIG.Behaviour.showFloatingSwitcher || activeMode === "relax") {
      switcher?.dispose();
      switcher = null;
      return;
    }
    if (!switcher) switcher = createModeSwitcher(openPicker);
    updateSwitcher();
  }
  function persistMode(mode, interest = interestText) {
    activeMode = mode;
    interestText = interest;
    settings = { ...settings, activeMode: mode, interestText: interest };
    syncSwitcher();
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
      interestText: interestText || settings.defaultInterestTopic || "",
      required: Boolean(document.documentElement?.hasAttribute("data-focustube-gate")),
      onSelect: (mode, interest) => {
        picker = null;
        safeSessionSet("focustube.pickerSeen", "1");
        window.__FOCUSTUBE_GATE__?.release();
        persistMode(mode, interest);
      },
      onClose: () => {
        picker = null;
        if (settings.activeMode) void applyPageBehavior("picker-closed");
      }
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
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type !== "focustube-health-check") return false;
        try {
          sendResponse({ ok: true, pageType: pageTypeFromUrl(location.href), report: selectorHealth(document) });
        } catch {
          sendResponse({ ok: false, errorCode: "HEALTH_CHECK_FAILED", userMessage: "The selector check could not inspect this page." });
        }
        return false;
      });
    } catch {
    }
  }
  function showPageFailure(error, correlationId) {
    logger.error("content", `page action failed (${correlationId})`, error?.name || "unknown");
    if (resultsUI) {
      resultsUI.renderError("FocusTube could not load curated results. Native YouTube results are restored.");
      return;
    }
    if (homeUI) {
      homeUI.renderError("FocusTube could not update this feed. Try again or switch to Relax.");
      return;
    }
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
    return new Promise((resolve) => {
      const started = Date.now();
      const retry = () => {
        const match = queryFirst(selectors);
        if (match || Date.now() - started >= CONFIG.Behaviour.maxWaitMs) {
          resolve(match);
          return;
        }
        setTimeout(retry, CONFIG.Behaviour.selectorRetryMs);
      };
      retry();
    });
  }
  function makePipelineRequest(mode, query, action, token, correlationId) {
    const payload = { mode, query, interest: interestText, action };
    return sendMessage(MESSAGE.RUN_PIPELINE, payload, correlationId).then((result) => {
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
    if (picker?.host?.isConnected) {
      enterPickerState();
      return;
    }
    applyMode(activeMode, settings);
    hideCurrentPanels();
    applyMode(activeMode, settings);
    if (activeMode === "relax") return;
    if (activeMode === "learn") {
      const masthead = await waitForElement(SELECTORS.mastheadSearchRegion);
      if (token !== requestToken) return;
      if (masthead) {
        const query = currentPageType === "search" ? new URL(location.href).searchParams.get("search_query") || "" : "";
        learnSearchUI = createLearnSearch({ query, onSubmit: (value) => {
          const safeQuery = normalizeQuery(value, CONFIG.Pipeline.queryMaxChars);
          if (!safeQuery) return;
          try {
            location.href = `/results?search_query=${encodeURIComponent(safeQuery)}`;
          } catch {
            logger.warn("content", "could not submit learning query");
          }
        } });
      }
    }
    if (currentPageType === "shorts" && CONFIG.Modes[activeMode].redirectShortsToWatch) {
      const videoId = location.pathname.split("/").filter(Boolean)[1];
      if (videoId) {
        try {
          location.replace(`/watch?v=${encodeURIComponent(videoId)}`);
        } catch {
        }
      }
      return;
    }
    if (activeMode === "learn" && location.pathname === "/feed/subscriptions") {
      try {
        location.replace("/");
      } catch {
      }
      return;
    }
    const disableAutoplay = activeMode === "learn" ? settings.disableAutoplayInLearn !== false : CONFIG.Modes[activeMode].disableAutoplay;
    if (currentPageType === "watch" && disableAutoplay) autoplayCleanup = startAutoplayGuard();
    try {
      if (currentPageType === "home") {
        const anchor = await waitForElement(["ytd-browse[page-subtype='home'] #primary", "ytd-browse #primary", "ytd-app #content"]);
        if (token !== requestToken || !anchor) return;
        homeUI = createHomeUI({
          mode: activeMode,
          interest: interestText,
          onSearch: (value) => {
            const safeQuery = normalizeQuery(value, CONFIG.Pipeline.queryMaxChars);
            if (!safeQuery) return;
            try {
              location.href = `/results?search_query=${encodeURIComponent(safeQuery)}`;
            } catch {
              logger.warn("content", "could not submit the learning prompt");
            }
          },
          onUseOriginal: () => persistMode("relax", interestText),
          onRefresh: () => {
            const nextToken = ++requestToken;
            loadHome("home", nextToken, (state, result) => {
              if (!homeUI) return;
              if (state === "loading") homeUI.renderSkeleton();
              else if (state === "results") homeUI.renderResults(result);
              else homeUI.renderError(result);
            }).catch((error) => showPageFailure(error, makeCorrelationId()));
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
          }).catch((error) => showPageFailure(error, makeCorrelationId()));
        };
        resultsUI = createResultsUI({ mode: activeMode, query, parent: anchor, settings, onRetry: retry });
        if (!resultsUI) return;
        resultsUI.renderSkeleton();
        await loadSearch(query, token, (state, result) => {
          if (!resultsUI) return;
          if (state === "results") resultsUI.renderResults(result);
          else if (state === "error") resultsUI.renderError(result);
        });
      }
    } catch (error) {
      showPageFailure(error, makeCorrelationId());
    }
    logger.debug("content", `applied ${activeMode} mode for ${currentPageType} (${reason})`);
  }
  function scheduleNavigation(reason) {
    if (navTimer) clearTimeout(navTimer);
    if (reason === "yt-navigate-start") cleanForNavigation();
    navTimer = setTimeout(() => {
      navTimer = null;
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        cleanForNavigation();
      }
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
      observer2 = new MutationObserver(() => {
        if (location.href !== lastUrl) scheduleNavigation("mutation-observer-url-change");
      });
      observer2.observe(document.documentElement, { childList: true, subtree: true });
      navigationCleanup = () => {
        observer2?.disconnect();
        observer2 = null;
        window.removeEventListener("yt-navigate-start", onStart);
        window.removeEventListener("yt-navigate-finish", onFinish);
        window.removeEventListener("popstate", onPopstate);
        if (navTimer) clearTimeout(navTimer);
        navTimer = null;
      };
    } catch (error) {
      logger.warn("content", "navigation observer could not be attached", error?.name || "unknown");
    }
  }
  async function boot() {
    const startId = makeCorrelationId();
    try {
      settings = await readSettings();
      setDebug(settings.debugLogging);
      interestText = settings.interestText || "";
      activeMode = settings.activeMode || "relax";
      syncSwitcher();
      installHealthCheck();
      const hasSeenPicker = safeSessionGet("focustube.pickerSeen") === "1";
      if (settings.askForModeEveryTab && !hasSeenPicker) openPicker();
      else if (!settings.activeMode) openPicker();
      else {
        window.__FOCUSTUBE_GATE__?.release();
        if (activeMode !== "relax") watchNavigation();
        await applyPageBehavior("boot");
      }
      try {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== "local") return;
          if (changes.activeMode) activeMode = changes.activeMode.newValue || "relax";
          if (changes.interestText) interestText = changes.interestText.newValue || "";
          for (const key of ["askForModeEveryTab", "keepCommentsVisible", "hideShortsInLearn", "disableAutoplayInLearn", "resultsPerSearch", "showReasons", "defaultInterestTopic", "curiosityStrictness", "density", "mockMode", "debugLogging"]) if (changes[key]) settings[key] = changes[key].newValue;
          if (changes.debugLogging) setDebug(settings.debugLogging);
          if (changes.activeMode || changes.interestText || changes.keepCommentsVisible || changes.hideShortsInLearn || changes.disableAutoplayInLearn || changes.resultsPerSearch || changes.showReasons || changes.density || changes.mockMode) {
            syncSwitcher();
            if (activeMode !== "relax" && !observer2) watchNavigation();
            if (activeMode === "relax") navigationCleanup?.();
            if (picker?.host?.isConnected) {
              picker.close();
              picker = null;
            }
            void applyPageBehavior("storage-change");
          }
        });
      } catch {
      }
      logger.info("content", `ready ${startId}; mode=${activeMode}`);
    } catch (error) {
      logger.error("content", `boot failed ${startId}`, error?.name || "unknown");
      try {
        window.__FOCUSTUBE_GATE__?.fail();
        document.documentElement?.removeAttribute("data-focustube-mode");
      } catch {
      }
    }
  }
  window.addEventListener("pagehide", () => {
    disposed = true;
    requestToken += 1;
    navigationCleanup?.();
    hideCurrentPanels();
  });
  void boot();
})();
