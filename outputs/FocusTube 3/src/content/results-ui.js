import { CONFIG } from "../config.js";
import { SELECTORS, queryFirst } from "../selectors.js";
import { createHost, addStyle, element, button, componentCss, formatViews, formatDuration, safeRemove } from "./ui-kit.js";
import { setCuratedSearch } from "./mode-manager.js";

const RESULTS_CSS = `:host{display:block;width:100%;min-width:0;max-width:1120px;box-sizing:border-box;overflow:hidden;position:relative}.wrap{width:100%;min-width:0;max-width:1120px;box-sizing:border-box;overflow:hidden;margin:28px auto 60px;padding:22px 24px;background:#0f0f0f;border:1px solid #303030;border-radius:22px;box-shadow:none}.wrap.compact{padding:14px 16px}.wrap.compact .body{padding:9px 11px}.wrap.compact .role{margin:18px 0 8px}.header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:22px}.title{margin:4px 0 4px;font-size:26px;line-height:1.2;letter-spacing:-.025em;color:#f1f1f1}.query{margin:0;color:#aaa}.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.role{margin:28px 0 12px;font-size:18px;color:#f1f1f1}.card{overflow:hidden;border:1px solid #303030;border-radius:16px;background:#181818;transition:transform .16s,border-color .16s}.card:hover{transform:translateY(-2px);border-color:#555}.thumbLink{display:block;position:relative;aspect-ratio:16/9;background:#272727}.thumb{width:100%;height:100%;object-fit:cover;display:block}.thumbnailPlaceholder{width:100%;height:100%;display:grid;place-items:center;background:radial-gradient(ellipse at 20% 20%,#303030,#181818 65%);color:#aaa;font-size:12px;font-weight:750;letter-spacing:.08em}.duration{position:absolute;right:8px;bottom:8px;padding:2px 6px;border-radius:5px;background:#0f0f0fdd;color:#fff;font-size:12px}.body{padding:13px 14px 15px}.videoTitle{color:#f1f1f1;text-decoration:none;font-size:15px;font-weight:750;line-height:1.35}.videoTitle:hover{text-decoration:underline}.meta{margin:8px 0 0;color:#aaa;font-size:12px}.reason{margin:11px 0 0;color:#aaa;font-size:13px}.confidence{margin:7px 0 0;color:#aaa;font-size:11px}.badge{display:inline-block;margin-top:10px;padding:4px 8px;background:#272727;border:1px solid #303030;border-radius:999px;color:#f1f1f1;font-size:11px;font-weight:750}.original{padding:14px 16px;margin-bottom:12px;border-radius:13px;background:#181818;border:1px solid #303030;color:#aaa}.error{padding:20px}.error p{margin:0 0 14px}.skeletonGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.skeletonCard{overflow:hidden;border:1px solid #292c31;border-radius:16px;background:#16181c}.skeletonThumb{aspect-ratio:16/9}.skeletonBody{display:grid;gap:10px;padding:14px}.skeletonLine{height:12px;border-radius:8px}.skeletonLine.short{width:62%;height:9px}.shimmer{background:linear-gradient(105deg,#202328 25%,#30343a 38%,#202328 62%);background-size:220% 100%;animation:ft-search-shimmer 1.25s ease-in-out infinite}@keyframes ft-search-shimmer{to{background-position-x:-220%}}.loadingHead{display:flex;align-items:center;gap:12px;margin:0 0 16px;padding:14px 16px;border:1px solid #292c31;border-radius:13px;background:#15171b}.loadingMark{width:10px;height:10px;flex:none;border-radius:50%;background:#a9e66e;box-shadow:0 0 18px #a9e66e66;animation:ft-search-pulse 1.1s ease-in-out infinite}.progressLabel{margin:0;color:#e0e3e7;font-size:14px;font-weight:650}.loadingHint{margin:3px 0 0;color:#9299a3;font-size:12px}.refiningNote{margin:0 0 14px;padding:10px 13px;border:1px solid #292c31;border-radius:11px;background:#15171b;color:#b6bdc7;font-size:13px}@keyframes ft-search-pulse{50%{opacity:.45;transform:scale(.82)}}@media(prefers-reduced-motion:reduce){.shimmer,.loadingMark{animation:none}}@media(max-width:560px){.wrap{margin:12px 8px;padding:16px}.header{display:block}.actions{justify-content:flex-start;margin-top:14px}}`;

function makeCard(video, offline = false) {
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
  const meta = [video.channelName, formatDuration(video.durationSeconds), formatViews(video.viewCount)].filter(Boolean).join(" · ");
  body.append(element("p", { className: "meta", text: meta }));
  card.append(thumbLink, body);
  return card;
}
export function createResultsUI({ mode, query, parent = null, settings = {}, onRetry = () => {}, onOriginalChange = () => {} }) {
  const pair = createHost(SELECTORS.resultsHost, SELECTORS.resultsHost);
  if (!pair) return null;
  const { host, shadow } = pair;
  addStyle(shadow, componentCss() + RESULTS_CSS);
  const wrap = element("section", { className: `wrap ${settings.density === "compact" ? "compact" : ""}`, attributes: { "aria-label": "FocusTube curated videos" } });
  const header = element("div", { className: "header" });
  const headingBlock = element("div");
  headingBlock.append(element("p", { className: "eyebrow", text: mode === "learn" ? "A guided learning path" : "A focused set of videos" }));
  headingBlock.append(element("h2", { className: "title", text: "Your results" }));
  headingBlock.append(element("p", { className: "query", text: query }));
  const actions = element("div", { className: "actions" });
  const retryButton = button("Retry", "button"); retryButton.addEventListener("click", onRetry);
  const originalButton = button("Show original YouTube results", "button");
  actions.append(retryButton, originalButton); header.append(headingBlock, actions);
  const status = element("div", { className: "status", attributes: { "aria-live": "polite" } });
  wrap.append(header, status); shadow.append(wrap);
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
    } else { status.className = savedStatusClass; status.replaceChildren(...savedResults); }
    onOriginalChange(original);
  };
  originalButton.addEventListener("click", toggleOriginal);
  const renderSkeleton = (message = "Preparing your learning path…") => {
    original = false; savedResults = []; setCuratedSearch(true); retryButton.hidden = false; originalButton.textContent = "Show original YouTube results"; status.hidden = false;
    status.setAttribute("aria-busy", "true");
    const loadingHead = element("div", { className: "loadingHead", attributes: { role: "status" } });
    loadingHead.append(element("span", { className: "loadingMark", attributes: { "aria-hidden": "true" } }));
    const copy = element("div");
    const label = element("p", { className: "progressLabel", text: message });
    copy.append(label, element("p", { className: "loadingHint", text: "Finding useful videos and organizing them for your topic…" }));
    loadingHead.append(copy);
    const grid = element("div", { className: "skeletonGrid" });
    for (let i = 0; i < CONFIG.UI.skeletonCardCount; i += 1) {
      const card = element("div", { className: "skeletonCard", attributes: { "aria-hidden": "true" } });
      card.append(element("div", { className: "skeletonThumb shimmer" }));
      const body = element("div", { className: "skeletonBody" });
      body.append(element("div", { className: "skeletonLine shimmer" }), element("div", { className: "skeletonLine short shimmer" }));
      card.append(body); grid.append(card);
    }
    status.className = ""; status.replaceChildren(loadingHead, grid);
  };
  const setProgress = message => {
    if (!status.isConnected || !message) return;
    let label = status.querySelector(".progressLabel");
    if (!label) { label = element("p", { className: "progressLabel" }); status.prepend(label); }
    label.textContent = String(message).slice(0, 180);
  };
  const renderError = message => {
    // Keep the curated panel in place. Reveal original YouTube only when the user
    // explicitly selects the button; transient LLM failures must not flip the page.
    setCuratedSearch(true);
    status.removeAttribute("aria-busy"); status.className = "status error"; status.replaceChildren();
    status.append(element("p", { text: message }));
    const retry = button("Try again", "button primary", onRetry);
    const dismiss = button("Dismiss", "button", () => { status.replaceChildren(); status.hidden = true; });
    status.append(retry, dismiss);
    preserveOriginalNotice();
  };
  const renderResults = (result, { provisional = false } = {}) => {
    status.removeAttribute("aria-busy"); status.className = ""; status.replaceChildren();
    if (result.metadata?.fallbackLabel) status.append(element("div", { className: "status", text: result.metadata.fallbackLabel }));
    if (provisional) status.append(element("div", { className: "refiningNote progressLabel", attributes: { role: "status", "aria-live": "polite" }, text: "Quick metadata matches · refining order with Ollama…" }));
    if (!result.videos?.length) { renderError("No videos met the quality threshold. Try a broader search or show original results."); return; }
    const queryKey = String(query || "").trim().toLocaleLowerCase();
    const groups = [
      ["Relevant videos", result.videos.filter(video => queryKey && String(video.sourceQuery || "").trim().toLocaleLowerCase() === queryKey)],
      ["Related searches", result.videos.filter(video => !queryKey || String(video.sourceQuery || "").trim().toLocaleLowerCase() !== queryKey)]
    ];
    for (const [label, videos] of groups) {
      if (!videos.length) continue;
      status.append(element("h3", { className: "role", text: label }));
      const grid = element("div", { className: "grid" });
      for (const video of videos) grid.append(makeCard(video, result.metadata?.providers?.includes("mock")));
      status.append(grid);
    }
    preserveOriginalNotice();
  };
  const dispose = () => { setCuratedSearch(false); safeRemove(host); };
  return { host, shadow, renderSkeleton, setProgress, renderError, renderResults, dispose, toggleOriginal };
}
