(() => {
  // src/config.js
  var CONFIG = Object.freeze({
    Pipeline: {
      resultsPerSearch: 30,
      maxVideosShown: 12,
      maxDescriptionChars: 420,
      queryMaxChars: 240,
      titleMaxChars: 260,
      channelNameMaxChars: 120,
      minimumLocalRelevance: 0.34,
      nearDuplicateSimilarity: 0.88,
      excludeLiveStreams: true
    },
    Cache: { ttlMs: { pipeline: 10 * 6e4, retrieval: 20 * 6e4 }, maxEntries: 120 },
    Modes: {
      learn: { hideHomeFeed: true, hideShorts: true, hideTrending: true, hideSidebarRecommendations: true, hideEndscreen: true, disableAutoplay: true },
      relax: { hideHomeFeed: false, hideShorts: false, hideTrending: false, hideSidebarRecommendations: false, hideEndscreen: false, disableAutoplay: false }
    },
    Behaviour: { showFloatingSwitcher: false, maxWaitMs: 8e3, selectorRetryMs: 250, navigationDebounceMs: 100, autoplayCheckMs: 1e3, autoplayMaxChecks: 12 },
    Settings: { hideCommentsInLearn: false, hideSubscriptionsInLearn: true, theme: "dark" },
    UI: {
      skeletonCardCount: 4,
      modeDescriptions: { learn: "A quieter YouTube with focused, locally filtered search.", relax: "Use YouTube as usual." }
    }
  });

  // src/storage.js
  var DEFAULT_SETTINGS = Object.freeze({
    activeMode: null,
    hideCommentsInLearn: CONFIG.Settings.hideCommentsInLearn,
    hideSubscriptionsInLearn: CONFIG.Settings.hideSubscriptionsInLearn,
    theme: CONFIG.Settings.theme
  });

  // src/messages.js
  var MESSAGE = Object.freeze({
    GET_SETTINGS: "GET_SETTINGS",
    SAVE_SETTINGS: "SAVE_SETTINGS",
    SET_MODE: "SET_MODE",
    RUN_PIPELINE: "RUN_PIPELINE",
    CLEAR_CACHE: "CLEAR_CACHE",
    PREWARM: "PREWARM",
    SELECTOR_HEALTH: "SELECTOR_HEALTH"
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
    modePickerHost: "focustube-picker-host",
    resultsHost: "focustube-results-host",
    homeHost: "focustube-home-host",
    switcherHost: "focustube-switcher-host"
  });
  function queryFirst(selectors, root = document) {
    for (const selector of Array.isArray(selectors) ? selectors : [selectors]) {
      try {
        const match = root.querySelector(selector);
        if (match) return match;
      } catch {
      }
    }
    return null;
  }
  function selectorHealth(root = document) {
    return Object.fromEntries(Object.entries(SELECTORS).filter(([, value]) => Array.isArray(value) || typeof value === "string").map(([name, value]) => [name, (Array.isArray(value) ? value : [value]).map((selector) => {
      try {
        return { selector, matched: root.querySelector(selector) !== null };
      } catch {
        return { selector, matched: false, invalid: true };
      }
    })]));
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
  function makeHideCss(modes = {}) {
    const learn = modes.learn;
    const rules = [];
    const scopedHide = (selectorNames, condition = "") => {
      const selectors = selectorNames.flatMap((name) => SELECTORS[name] || []);
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
    applyTheme(settings2.theme || root.dataset.focustubeTheme || CONFIG.Settings.theme);
    if (safeMode === "relax") {
      root.removeAttribute("data-focustube-mode");
      root.removeAttribute("data-focustube-page");
      root.removeAttribute("data-focustube-hide-comments");
      root.removeAttribute("data-focustube-hide-subscriptions");
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
    if (safeMode === "learn" && settings2.hideCommentsInLearn) root.dataset.focustubeHideComments = "true";
    else root.removeAttribute("data-focustube-hide-comments");
    if (safeMode === "learn" && settings2.hideSubscriptionsInLearn) root.dataset.focustubeHideSubscriptions = "true";
    else root.removeAttribute("data-focustube-hide-subscriptions");
  }
  function applyTheme(theme = "dark") {
    const root = document.documentElement;
    if (!root) return;
    root.dataset.focustubeTheme = theme === "light" ? "light" : "dark";
    for (const host of document.querySelectorAll("focustube-picker-host,focustube-switcher-host,focustube-home-host,focustube-results-host")) host.dataset.theme = root.dataset.focustubeTheme;
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
      host.dataset.theme = document.documentElement?.dataset?.focustubeTheme || "dark";
      const shadow = host.attachShadow({ mode: "open" });
      return { host, shadow };
    } catch {
      return null;
    }
  }
  function addStyle(shadow, css) {
    const style = document.createElement("style");
    style.textContent = `${css}
:host([data-theme="dark"]){--ft-text:#f0f2f5;--ft-surface:#15181d;--ft-border:#ffffff18;--ft-muted:#a1a8b3;--ft-raised:#1b1f26;--ft-accent:#a9e66e;--ft-shadow:0 18px 55px #0008}:host([data-theme="light"]){--ft-text:#1d2925;--ft-surface:#fbfcfa;--ft-border:#183a2818;--ft-muted:#64716c;--ft-raised:#f0f4f1;--ft-accent:#5c8f3c;--ft-shadow:0 10px 35px #193a2810}:host{font-family:var(--ft-font,system-ui,sans-serif);color:var(--ft-text,#f0f2f5);line-height:1.5} .wrap,.dialog,.card,.control,.mode,.panel,.status,.original,.channel{color:var(--ft-text,#f0f2f5);background-color:var(--ft-surface,#15181d);border-color:var(--ft-border,#ffffff18);box-shadow:var(--ft-shadow,0 18px 55px #0008)} .title,.role,.sectionTitle,.videoTitle,.mode strong{color:var(--ft-text,#f0f2f5)} .intro,.query,.meta,.reason,.confidence,.footer,.mode span,.channel span{color:var(--ft-muted,#a1a8b3)} .button,.mode,.switch,.input{color:var(--ft-text,#f0f2f5);background:var(--ft-raised,#1b1f26);border-color:var(--ft-border,#ffffff18)} .button.primary{color:#10140d;background:var(--ft-accent,#a9e66e);border-color:var(--ft-accent,#a9e66e)} .skeleton{background:linear-gradient(100deg,#191d23 25%,#242a31 38%,#191d23 60%);background-size:200% 100%}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}`;
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
  var NAMES = { learn: "Learn", relax: "Relax" };
  var ICONS = { learn: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Zm0 0V21m4-13h8m-8 4h8", relax: "M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6Zm9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" };
  var CSS = `:host{position:fixed;inset:0;z-index:2147483647}.backdrop{position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:rgba(8,10,12,.9)}.dialog{width:min(680px,100%);padding:clamp(22px,5vw,44px);background:#111817;color:#f4f7f5;border:1px solid #34413b;border-radius:24px;box-shadow:0 28px 90px #000b}.brand{margin:0 0 12px;font-size:12px;color:#a9e66e;font-weight:800;letter-spacing:.14em}.title{margin:0;font-size:clamp(26px,4vw,38px);letter-spacing:-.035em}.intro{margin:12px 0 26px;color:#a6b1ad}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mode{min-height:130px;text-align:left;padding:18px;border-radius:17px;background:#191e21;color:#f4f7f5;border:1px solid #343a3e;cursor:pointer}.mode:hover{border-color:#a9e66e}.mode.selected{border-color:#a9e66e;box-shadow:inset 3px 0 #a9e66e}.mode svg{width:22px;height:22px;margin-bottom:12px;color:#a9e66e}.mode strong,.mode span{display:block}.mode strong{font-size:18px}.mode span{margin-top:7px;color:#a6b1ad;font-size:14px}.footer{margin:18px 0 0;color:#89938f;font-size:12px}@media(max-width:520px){.cards{grid-template-columns:1fr}.mode{min-height:auto}}`;
  function icon(mode) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ICONS[mode]);
    svg.append(path);
    return svg;
  }
  function openModePicker({ currentMode = "learn", required = false, onSelect, onClose } = {}) {
    const pair = createHost("focustube-picker-host", "focustube-picker-host");
    if (!pair) return null;
    const { host, shadow } = pair;
    addStyle(shadow, componentCss() + CSS);
    const backdrop = element("div", { className: "backdrop" });
    const dialog = element("section", { className: "dialog", attributes: { role: "dialog", "aria-modal": "true", "aria-labelledby": "focustube-picker-title" } });
    dialog.append(element("p", { className: "brand", text: "FOCUSTUBE" }), element("h1", { className: "title", text: "What are you here for today?", attributes: { id: "focustube-picker-title" } }), element("p", { className: "intro", text: "Choose how you want YouTube to work for this session." }));
    const cards = element("div", { className: "cards" });
    for (const mode of ["learn", "relax"]) {
      const card = button("", "mode");
      if (mode === currentMode) card.classList.add("selected");
      const desc = CONFIG.UI.modeDescriptions[mode];
      card.append(icon(mode), element("strong", { text: NAMES[mode] }), element("span", { text: desc }));
      card.setAttribute("aria-label", `${NAMES[mode]}: ${desc}`);
      card.addEventListener("click", () => finish(mode));
      cards.append(card);
    }
    dialog.append(cards, element("p", { className: "footer", text: "Switch modes any time from the FocusTube popup." }));
    const finish = (mode) => {
      safeRemove(host);
      try {
        sessionStorage.setItem("focustube.pickerSeen", "1");
      } catch {
      }
      onSelect?.(mode);
    };
    shadow.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !required) onClose?.();
    });
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop && !required) onClose?.();
    });
    backdrop.append(dialog);
    shadow.append(backdrop);
    (document.documentElement || document.body).append(host);
    queueMicrotask(() => cards.querySelector("button")?.focus());
    return { host, close: () => safeRemove(host) };
  }

  // src/content/mode-switcher.js
  var SWITCHER_CSS = `:host{position:fixed;right:18px;bottom:18px;z-index:2147483000}.control{display:flex;align-items:center;gap:9px;padding:8px 9px 8px 12px;background:#f8fbf8;border:1px solid #d8e3dc;border-radius:999px;box-shadow:0 5px 22px #0d261b26}.label{color:#263f33;font-size:12px;font-weight:700;white-space:nowrap}.switch{border:0;background:#174c3a;color:#fff;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:750}.switch:hover{background:#226249}.switch:focus-visible{outline:3px solid #7ab99b;outline-offset:2px}@media(max-width:520px){:host{right:10px;bottom:10px}.label{display:none}}`;
  var LABEL = { learn: "Learn", relax: "Relax" };
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
  var RESULTS_CSS = `:host{display:block;width:100%;min-width:0;max-width:1120px;box-sizing:border-box;overflow:hidden;position:relative}.wrap{width:100%;min-width:0;max-width:1120px;box-sizing:border-box;overflow:hidden;margin:28px auto 60px;padding:22px 24px;background:#f8faf8;border:1px solid #e1e8e2;border-radius:22px;box-shadow:0 10px 35px #193a2810}.wrap.compact{padding:14px 16px}.wrap.compact .body{padding:9px 11px}.wrap.compact .groupHeading{margin:18px 0 8px}.header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:22px}.title{margin:4px 0 4px;font-size:26px;line-height:1.2;letter-spacing:-.025em;color:#183a2c}.query{margin:0;color:#69766f}.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.groupHeading{margin:28px 0 12px;font-size:22px;color:#183a2c}.groupHeading:first-child{margin-top:6px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.card{overflow:hidden;border:1px solid #e0e7e1;border-radius:16px;background:#fff;transition:transform .16s,box-shadow .16s}.card:hover{transform:translateY(-2px);box-shadow:0 12px 28px #17352714}.thumbLink{display:block;position:relative;aspect-ratio:16/9;background:#edf2ed}.thumb{width:100%;height:100%;object-fit:cover;display:block}.thumbnailPlaceholder{width:100%;height:100%;display:grid;place-items:center;background:radial-gradient(ellipse at 20% 20%,#c6dfd0,#edf2ed 65%);color:#476754;font-size:12px;font-weight:750;letter-spacing:.08em}.duration{position:absolute;right:8px;bottom:8px;padding:2px 6px;border-radius:5px;background:#14241edb;color:#fff;font-size:12px}.body{padding:13px 14px 15px}.videoTitle{color:#1c3128;text-decoration:none;font-size:15px;font-weight:750;line-height:1.35}.videoTitle:hover{text-decoration:underline}.meta{margin:8px 0 0;color:#6b7771;font-size:12px}.original{padding:14px 16px;margin-bottom:12px;border-radius:13px;background:#fff;border:1px solid #e2e8e3;color:#64726b}.error{padding:20px}.error p{margin:0 0 14px}.skeletonGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.skeleton{height:270px}@media(max-width:560px){.wrap{margin:12px 8px;padding:16px}.header{display:block}.actions{justify-content:flex-start;margin-top:14px}}`;
  function makeCard(video) {
    const card = element("article", { className: "card" });
    const href = `https://www.youtube.com/watch?v=${encodeURIComponent(String(video.id))}`;
    const thumbLink = element("a", { className: "thumbLink", href, attributes: { "aria-label": `Watch ${video.title}` } });
    if (video.thumbnailUrl) {
      const image = element("img", { className: "thumb", attributes: { src: video.thumbnailUrl, alt: "", loading: "lazy" } });
      image.addEventListener("error", () => image.remove());
      thumbLink.append(image);
    } else thumbLink.append(element("div", { className: "thumbnailPlaceholder", text: "FOCUSTUBE PREVIEW" }));
    if (video.durationSeconds != null) thumbLink.append(element("span", { className: "duration", text: formatDuration(video.durationSeconds) }));
    const body = element("div", { className: "body" });
    body.append(element("a", { className: "videoTitle", text: video.title, href }));
    const meta = [video.channelName, formatDuration(video.durationSeconds), formatViews(video.viewCount)].filter(Boolean).join(" \xB7 ");
    body.append(element("p", { className: "meta", text: meta }));
    card.append(thumbLink, body);
    return card;
  }
  function createResultsUI({ query, parent = null, onRetry = () => {
  }, onOriginalChange = () => {
  } }) {
    const pair = createHost(SELECTORS.resultsHost, SELECTORS.resultsHost);
    if (!pair) return null;
    const { host, shadow } = pair;
    addStyle(shadow, componentCss() + RESULTS_CSS);
    const wrap = element("section", { className: "wrap", attributes: { "aria-label": "FocusTube relevant videos" } });
    const header = element("div", { className: "header" });
    const headingBlock = element("div");
    headingBlock.append(element("p", { className: "eyebrow", text: "LEARN MODE \xB7 LOCAL FILTERING" }));
    headingBlock.append(element("h2", { className: "title", text: "Relevant videos" }));
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
      if (!result.videos?.length) {
        renderError("No relevant videos matched this search. Try a broader search or show original results.");
        return;
      }
      for (const [group, label] of [["relevant", "Relevant matches"], ["related", "Related searches"]]) {
        const videos = result.videos.filter((video) => (video.group || "relevant") === group);
        if (!videos.length) continue;
        status.append(element("h3", { className: "groupHeading", text: label }));
        const grid = element("div", { className: "grid" });
        for (const video of videos) grid.append(makeCard(video));
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
  var CSS2 = `.wrap{max-width:900px;margin:36px auto;padding:clamp(22px,5vw,48px);border:1px solid #ffffff20;border-radius:24px;background:#15181d;color:#f0f2f5}.eyebrow{color:#a9e66e;font-size:11px;font-weight:800;letter-spacing:.14em}.title{margin:8px 0;font-size:clamp(28px,5vw,42px);letter-spacing:-.04em}.intro{color:#a1a8b3}.form{display:flex;gap:10px;margin-top:22px}.input{flex:1;min-width:0;padding:14px;border:1px solid #ffffff28;border-radius:12px;background:#0d0f12;color:#fff}.status{margin-top:22px}.error{color:#ffd1c9}@media(max-width:560px){.wrap{margin:16px;padding:20px}.form{flex-direction:column}}`;
  function createHomeUI({ onSearch = () => {
  }, onUseOriginal = () => {
  } } = {}) {
    const pair = createHost(SELECTORS.homeHost, SELECTORS.homeHost);
    if (!pair) return null;
    const { host, shadow } = pair;
    addStyle(shadow, componentCss() + CSS2);
    const wrap = element("section", { className: "wrap", attributes: { "aria-label": "FocusTube Learn home" } });
    wrap.append(element("p", { className: "eyebrow", text: "LEARN MODE" }), element("h2", { className: "title", text: "What do you want to learn?" }), element("p", { className: "intro", text: "Search a topic to see relevant videos, filtered locally and organized into a clear path." }));
    const form = element("form", { className: "form" });
    const input = element("input", { className: "input", type: "search", attributes: { placeholder: "e.g. how backpropagation works", "aria-label": "What do you want to learn?", maxlength: CONFIG.Pipeline.queryMaxChars } });
    const submit = button("Find videos", "button primary");
    submit.type = "submit";
    form.append(input, submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      onSearch(input.value.trim());
    });
    wrap.append(form);
    shadow.append(wrap);
    (queryFirst(["ytd-browse[page-subtype='home'] #primary", "ytd-browse #primary", "ytd-app #content"], document) || document.body || document.documentElement).append(host);
    return { host, renderError(message) {
      const error = element("p", { className: "status error", text: message });
      const relax = button("Switch to Relax and show YouTube", "button", onUseOriginal);
      wrap.append(error, relax);
    }, dispose: () => safeRemove(host) };
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
  var picker = null;
  var switcher = null;
  var resultsUI = null;
  var homeUI = null;
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
    autoplayCleanup?.();
    autoplayCleanup = null;
    setCuratedSearch(false);
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
  function persistMode(mode) {
    activeMode = ["learn", "relax"].includes(mode) ? mode : "relax";
    settings = { ...settings, activeMode };
    syncSwitcher();
    if (activeMode === "learn") watchNavigation();
    else navigationCleanup?.();
    applyPageBehavior("mode-change");
    void sendMessage(MESSAGE.SET_MODE, { mode: activeMode }, makeCorrelationId());
  }
  function openPicker() {
    if (picker?.host?.isConnected) return;
    requestToken += 1;
    hideCurrentPanels();
    enterPickerState();
    picker = openModePicker({
      currentMode: activeMode,
      required: Boolean(document.documentElement?.hasAttribute("data-focustube-gate")),
      onSelect: (mode) => {
        picker = null;
        safeSessionSet("focustube.pickerSeen", "1");
        window.__FOCUSTUBE_GATE__?.release();
        persistMode(mode);
      },
      onClose: () => {
        picker = null;
        void applyPageBehavior("picker-closed");
      }
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
    try {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type !== "focustube-health-check") return false;
        try {
          sendResponse({ ok: true, pageType: pageTypeFromUrl(location.href), report: selectorHealth(document) });
        } catch {
          sendResponse({ ok: false, errorCode: "HEALTH_CHECK_FAILED" });
        }
        return false;
      });
    } catch {
    }
  }
  function waitForElement(selectors) {
    const immediate = queryFirst(selectors);
    if (immediate) return Promise.resolve(immediate);
    return new Promise((resolve) => {
      const started = Date.now();
      const retry = () => {
        const match = queryFirst(selectors);
        if (match || Date.now() - started >= CONFIG.Behaviour.maxWaitMs) resolve(match);
        else setTimeout(retry, CONFIG.Behaviour.selectorRetryMs);
      };
      retry();
    });
  }
  function makePipelineRequest(query, token) {
    return sendMessage(MESSAGE.RUN_PIPELINE, { mode: "learn", query, action: "search" }, makeCorrelationId()).then((result) => disposed || token !== requestToken || activeMode !== "learn" ? null : result);
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
    if (currentPageType === "shorts") {
      const videoId = location.pathname.split("/").filter(Boolean)[1];
      if (videoId) {
        try {
          location.replace(`/watch?v=${encodeURIComponent(videoId)}`);
        } catch {
        }
      }
      return;
    }
    if (currentPageType === "watch") autoplayCleanup = startAutoplayGuard();
    try {
      if (currentPageType === "home") {
        const anchor2 = await waitForElement(["ytd-browse[page-subtype='home'] #primary", "ytd-browse #primary", "ytd-app #content"]);
        if (token !== requestToken || !anchor2) return;
        homeUI = createHomeUI({
          mode: "learn",
          onSearch: (value) => {
            const query2 = normalizeQuery(value, CONFIG.Pipeline.queryMaxChars);
            if (query2) location.href = `/results?search_query=${encodeURIComponent(query2)}`;
          },
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
        const result2 = await makePipelineRequest(query, nextToken);
        if (!result2 || !resultsUI) return;
        if (result2.ok) resultsUI.renderResults(result2);
        else resultsUI.renderError(result2.userMessage || "No relevant videos were found.");
      };
      resultsUI = createResultsUI({ query, parent: anchor, onRetry: () => void retry() });
      if (!resultsUI) return;
      resultsUI.renderSkeleton();
      const result = await makePipelineRequest(query, token);
      if (result && resultsUI) {
        if (result.ok) resultsUI.renderResults(result);
        else resultsUI.renderError(result.userMessage || "No relevant videos were found.");
      }
    } catch (error) {
      logger.error("content", `page update failed (${reason})`, error?.name || "unknown");
      resultsUI?.renderError("FocusTube could not update these results. You can retry or show original YouTube results.");
      homeUI?.renderError("FocusTube could not update this page. Switch to Relax and retry.");
    }
  }
  function scheduleNavigation(reason) {
    if (navTimer) clearTimeout(navTimer);
    if (reason === "yt-navigate-start") {
      requestToken += 1;
      hideCurrentPanels();
    }
    navTimer = setTimeout(() => {
      navTimer = null;
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        requestToken += 1;
        hideCurrentPanels();
      }
      void applyPageBehavior(reason);
    }, CONFIG.Behaviour.navigationDebounceMs);
  }
  function watchNavigation() {
    if (navigationCleanup) return;
    const onStart = () => scheduleNavigation("yt-navigate-start"), onFinish = () => scheduleNavigation("yt-navigate-finish"), onPopstate = () => scheduleNavigation("popstate");
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
  }
  async function boot() {
    try {
      settings = await readSettings();
      activeMode = settings.activeMode || "relax";
      applyTheme(settings.theme);
      syncSwitcher();
      installHealthCheck();
      if (!settings.activeMode) openPicker();
      else {
        window.__FOCUSTUBE_GATE__?.release();
        if (activeMode === "learn") watchNavigation();
        await applyPageBehavior("boot");
      }
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.activeMode) activeMode = ["learn", "relax"].includes(changes.activeMode.newValue) ? changes.activeMode.newValue : "relax";
        for (const key of ["hideCommentsInLearn", "hideSubscriptionsInLearn", "theme"]) if (changes[key]) settings[key] = changes[key].newValue;
        if (changes.theme) applyTheme(settings.theme);
        if (changes.activeMode || changes.hideCommentsInLearn || changes.hideSubscriptionsInLearn || changes.theme) {
          syncSwitcher();
          if (activeMode === "learn" && !observer2) watchNavigation();
          if (activeMode === "relax") navigationCleanup?.();
          picker?.close();
          picker = null;
          void applyPageBehavior("storage-change");
        }
      });
    } catch (error) {
      logger.error("content", "boot failed", error?.name || "unknown");
      window.__FOCUSTUBE_GATE__?.fail();
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
