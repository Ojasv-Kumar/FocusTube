import { CONFIG } from "../config.js";
import { SELECTORS, queryFirst } from "../selectors.js";
import { createHost, addStyle, element, button, componentCss, formatViews, formatDuration, safeRemove } from "./ui-kit.js";

const HOME_CSS = `.wrap{max-width:1120px;margin:28px auto 60px;padding:24px;background:#0f0f0f;border:1px solid #303030;border-radius:22px;box-shadow:none}.hero{max-width:670px;padding:20px 8px 27px}.title{margin:7px 0 11px;font-size:clamp(25px,4vw,38px);letter-spacing:-.035em;line-height:1.18;color:#f1f1f1}.intro{margin:0 0 19px;color:#aaa}.search{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.input{flex:1;min-width:220px;padding:13px 14px;border:1px solid #303030;border-radius:12px;background:#181818;color:#f1f1f1}.timer-trigger{display:grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid #303030;border-radius:12px;background:#181818;color:#c8f29c}.timer-trigger svg{width:20px;height:20px}.timer-panel{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:10px;padding:12px;border:1px solid #303030;border-radius:12px;background:#181818}.timer-input{width:140px;padding:9px 10px;border:1px solid #383838;border-radius:9px;background:#0f0f0f;color:#f1f1f1;font-variant-numeric:tabular-nums}.timer-notice{display:block;min-height:0;margin-top:8px;color:#c8f29c;font-size:13px;font-weight:650}.timer-notice:empty{display:none}.timer-notice[data-error="true"]{color:#ff6868}.section{margin-top:28px}.progressLabel{margin:0 0 12px;color:#aaa;font-size:13px;font-weight:650}.refiningNote{margin:14px 0 0;padding:10px 13px;border:1px solid #303030;border-radius:11px;background:#181818;color:#aaa;font-size:13px}.sectionTitle{margin:0 0 13px;font-size:19px;color:#f1f1f1}.card{overflow:hidden;border:1px solid #303030;border-radius:16px;background:#181818}.thumbLink{display:block;aspect-ratio:16/9;background:#272727;position:relative}.thumb{width:100%;height:100%;object-fit:cover}.thumbnailPlaceholder{width:100%;height:100%;display:grid;place-items:center;background:radial-gradient(ellipse at 20% 20%,#303030,#181818 65%);color:#aaa;font-size:12px;font-weight:750;letter-spacing:.08em}.duration{position:absolute;right:8px;bottom:8px;padding:2px 6px;background:#0f0f0fdd;border-radius:5px;color:#fff;font-size:12px}.body{padding:13px 14px}.videoTitle{color:#f1f1f1;text-decoration:none;font-weight:750}.meta{margin:7px 0 0;color:#aaa;font-size:12px}.reason{margin:9px 0 0;color:#aaa;font-size:13px}.skeletonGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.skeleton{height:260px}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px}.empty{padding:18px;background:#181818;border-radius:12px;color:#aaa}`;
function formatTimer(seconds) { const total = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(total / 3600)).padStart(2, "0")}:${String(Math.floor(total % 3600 / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }
function parseTimer(value) {
  const match = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(String(value).trim());
  if (!match) return null;
  const [, h, m, s] = match.map(Number);
  const seconds = h * 3600 + m * 60 + s;
  return seconds > 0 && seconds <= 86_400 ? seconds : null;
}
function makeHomeCard(video, offline = false) {
  const card = element("article", { className: "card" });
  const href = `https://www.youtube.com/watch?v=${encodeURIComponent(String(video.id))}`;
  const thumbLink = element("a", { className: "thumbLink", href, attributes: { "aria-label": `Watch ${video.title}` } });
  if (!offline && video.thumbnailUrl) {
    const image = element("img", { className: "thumb", attributes: { src: video.thumbnailUrl, alt: "", loading: "lazy" } });
    image.addEventListener("error", () => image.remove()); thumbLink.append(image);
  } else thumbLink.append(element("div", { className: "thumbnailPlaceholder", text: "FOCUSTUBE PREVIEW" }));
  if (video.durationSeconds != null) thumbLink.append(element("span", { className: "duration", text: formatDuration(video.durationSeconds) }));
  const body = element("div", { className: "body" });
  body.append(element("a", { className: "videoTitle", text: video.title, href }));
  body.append(element("p", { className: "meta", text: [video.channelName, formatViews(video.viewCount)].filter(Boolean).join(" · ") }));
  if (video.reason) body.append(element("p", { className: "reason", text: video.reason }));
  card.append(thumbLink, body); return card;
}
export function createHomeUI({ mode, learnModeLockUntil = 0, onSearch = () => {}, onSetLearnTimer = async () => ({ ok: false }), onRefresh = () => {}, onLoadMore = () => {}, onUseOriginal = () => {} }) {
  const pair = createHost(SELECTORS.homeHost, SELECTORS.homeHost);
  if (!pair) return null;
  const { host, shadow } = pair;
  addStyle(shadow, componentCss() + HOME_CSS);
  const wrap = element("section", { className: "wrap", attributes: { "aria-label": "FocusTube home" } });
  const hero = element("div", { className: "hero" });
  let timerInterval = 0, activeLockUntil = Number(learnModeLockUntil) || 0;
  hero.append(element("p", { className: "eyebrow", text: mode === "learn" ? "LEARN MODE" : "CURATED FOR CURIOSITY" }));
  hero.append(element("h2", { className: "title", text: mode === "learn" ? "What do you want to learn?" : "A little more signal in your browsing." }));
  hero.append(element("p", { className: "intro", text: mode === "learn" ? "Search a topic to get a thoughtful path through useful videos." : "Explore useful ideas from broad topics and educational channels." }));
  if (mode === "learn") {
    const form = element("form", { className: "search" });
    const input = element("input", { className: "input", type: "search", attributes: { placeholder: "e.g. how backpropagation works", "aria-label": "What do you want to learn?", maxlength: CONFIG.Pipeline.queryMaxChars } });
    const submit = element("button", { className: "button primary", text: "Find a learning path", type: "submit" });
    const timerButton = button("", "timer-trigger", () => { timerPanel.hidden = !timerPanel.hidden; if (!timerPanel.hidden) timerInput.focus(); });
    timerButton.setAttribute("aria-label", "Set Learn mode timer"); timerButton.title = "Set Learn mode timer";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg"); icon.setAttribute("viewBox", "0 0 24 24"); icon.setAttribute("fill", "none"); icon.setAttribute("stroke", "currentColor"); icon.setAttribute("stroke-width", "1.8"); icon.setAttribute("stroke-linecap", "round"); icon.setAttribute("stroke-linejoin", "round"); icon.setAttribute("aria-hidden", "true");
    const face = document.createElementNS("http://www.w3.org/2000/svg", "circle"); face.setAttribute("cx", "12"); face.setAttribute("cy", "13"); face.setAttribute("r", "8");
    const hands = document.createElementNS("http://www.w3.org/2000/svg", "path"); hands.setAttribute("d", "M12 9v4l2.5 1.5M9 2h6m-3 0v3"); icon.append(face, hands); timerButton.append(icon);
    form.append(input, timerButton, submit); form.addEventListener("submit", event => { event.preventDefault(); onSearch(input.value.trim()); }); hero.append(form);
    const timerPanel = element("form", { className: "timer-panel", attributes: { hidden: "" } });
    const timerInput = element("input", { className: "timer-input", type: "text", attributes: { placeholder: "00:25:00", "aria-label": "Learn timer duration in hours, minutes, seconds", maxlength: "8", inputmode: "numeric", pattern: "[0-9]{1,2}:[0-5][0-9]:[0-5][0-9]" } });
    const setTimer = element("button", { className: "button primary", text: "Start timer", type: "submit" });
    timerPanel.append(timerInput, setTimer);
    const timerNotice = element("div", { className: "timer-notice", attributes: { "aria-live": "polite" } });
    const updateTimerNotice = endAt => {
      activeLockUntil = Number(endAt) || 0;
      if (timerInterval) clearInterval(timerInterval);
      const tick = () => {
        const left = Math.ceil((activeLockUntil - Date.now()) / 1000);
        if (left <= 0) { timerNotice.textContent = "Learn mode timer complete."; timerNotice.dataset.error = "false"; clearInterval(timerInterval); timerInterval = 0; return; }
        timerNotice.textContent = `Learn mode locked · ${formatTimer(left)} remaining`;
        timerNotice.dataset.error = "false";
      };
      if (activeLockUntil > Date.now()) { tick(); timerInterval = setInterval(tick, 1000); }
      else { timerNotice.textContent = ""; timerNotice.dataset.error = "false"; }
    };
    timerPanel.addEventListener("submit", async event => {
      event.preventDefault();
      const durationSeconds = parseTimer(timerInput.value);
      if (!durationSeconds) { timerNotice.dataset.error = "true"; timerNotice.textContent = "Enter a duration from 00:00:01 to 24:00:00 as HH:MM:SS."; return; }
      setTimer.disabled = true;
      const response = await onSetLearnTimer(durationSeconds);
      setTimer.disabled = false;
      if (!response?.ok) { timerNotice.dataset.error = "true"; timerNotice.textContent = response?.userMessage || "Could not set the Learn timer."; return; }
      timerInput.value = ""; timerPanel.hidden = true;
      updateTimerNotice(response.learnModeLockUntil || response.settings?.learnModeLockUntil);
    });
    hero.append(timerPanel, timerNotice);
    updateTimerNotice(activeLockUntil);
  } else {
    const toolbar = element("div", { className: "toolbar" });
    const refresh = button("Refresh feed", "button primary", onRefresh); toolbar.append(refresh); hero.append(toolbar);
  }
  const status = element("div", { className: "status", attributes: { "aria-live": "polite" } });
  let displayedVideos = [];
  let loadingMore = false;
  const loadMoreButton = button("Load more videos", "button", onLoadMore);
  loadMoreButton.hidden = true;
  const updateLoadMore = () => {
    const remaining = Math.max(0, CONFIG.Pipeline.maxVideosShown - displayedVideos.length);
    const nextCount = Math.min(CONFIG.Pipeline.feedBatchSize, remaining);
    loadMoreButton.hidden = mode === "learn" || displayedVideos.length === 0 || remaining === 0;
    loadMoreButton.disabled = loadingMore;
    loadMoreButton.textContent = loadingMore ? "Preparing next batch…" : `Find up to ${nextCount} more videos`;
  };
  wrap.append(hero, status); shadow.append(wrap);
  const parent = queryFirst(["ytd-browse[page-subtype='home'] #primary", "ytd-browse #primary", "ytd-app #content"], document) || document.body || document.documentElement;
  parent.append(host);
  const renderSkeleton = (message = "Starting FocusTube…") => {
    displayedVideos = []; loadingMore = false; status.className = ""; status.replaceChildren(); updateLoadMore();
    const progress = element("p", { className: "progressLabel", text: message });
    const grid = element("div", { className: "skeletonGrid" });
    for (let i = 0; i < CONFIG.UI.skeletonCardCount; i++) grid.append(element("div", { className: "skeleton" }));
    status.append(progress, grid);
  };
  const setProgress = message => {
    if (!status.isConnected || !message) return;
    let label = status.querySelector(".progressLabel");
    if (!label) { label = element("p", { className: "progressLabel" }); status.prepend(label); }
    label.textContent = String(message).slice(0, 180);
  };
  const renderError = (message, { append = false } = {}) => {
    loadingMore = false; updateLoadMore();
    if (append && displayedVideos.length) {
      const error = element("div", { className: "status error", text: message });
      error.append(document.createTextNode(" "), button("Try loading more", "button primary", onLoadMore));
      status.append(error);
      return;
    }
    displayedVideos = [];
    status.className = "status error"; status.replaceChildren(); status.append(document.createTextNode(message));
    const retry = button("Try again", "button primary", onRefresh); const original = button("Switch to Relax and show YouTube", "button", onUseOriginal);
    status.append(document.createTextNode(" "), retry, document.createTextNode(" "), original);
  };
  const renderResults = (result, { append = false, provisional = false } = {}) => {
    const seen = new Set(append ? displayedVideos.map(video => String(video.id)) : []);
    displayedVideos = append ? [...displayedVideos] : [];
    for (const video of (result.videos || [])) {
      if (displayedVideos.length >= CONFIG.Pipeline.maxVideosShown) break;
      if (video?.id && !seen.has(String(video.id))) { displayedVideos.push(video); seen.add(String(video.id)); }
    }
    loadingMore = false;
    status.className = ""; status.replaceChildren();
    if (result.metadata?.fallbackLabel) status.append(element("div", { className: "status", text: result.metadata.fallbackLabel }));
    if (provisional) status.append(element("p", { className: "refiningNote progressLabel", attributes: { role: "status", "aria-live": "polite" }, text: "Quick metadata matches · refining order with Ollama…" }));
    const section = element("section", { className: "section" });
    const heading = element("div", { className: "toolbar" }); heading.append(element("h3", { className: "sectionTitle", text: "Videos to explore" }));
    section.append(heading);
    if (!displayedVideos.length) section.append(element("div", { className: "empty", text: "No videos were found yet. Try refreshing the feed." }));
    else { const grid = element("div", { className: "grid" }); for (const video of displayedVideos) grid.append(makeHomeCard(video, result.metadata?.providers?.includes("mock"))); section.append(grid); }
    status.append(section);
    updateLoadMore();
    if (!loadMoreButton.hidden) status.append(loadMoreButton);
  };
  const setLoadingMore = value => { loadingMore = Boolean(value); updateLoadMore(); };
  return { host, renderSkeleton, setProgress, renderError, renderResults, setLoadingMore, updateLearnTimer: endAt => { if (mode === "learn") updateTimerNotice(endAt); }, getVideoIds: () => displayedVideos.map(video => String(video.id)), isLoadingMore: () => loadingMore, dispose: () => { if (timerInterval) clearInterval(timerInterval); safeRemove(host); } };
}
