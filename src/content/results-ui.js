import { CONFIG } from "../config.js";
import { SELECTORS, queryFirst } from "../selectors.js";
import { createHost, addStyle, element, button, componentCss, formatViews, formatDuration, safeRemove } from "./ui-kit.js";
import { setCuratedSearch } from "./mode-manager.js";

const RESULTS_CSS = `:host{display:block;width:100%;min-width:0;max-width:1120px;box-sizing:border-box;overflow:hidden;position:relative}.wrap{width:100%;min-width:0;max-width:1120px;box-sizing:border-box;overflow:hidden;margin:28px auto 60px;padding:22px 24px;background:#0f0f0f;border:1px solid #303030;border-radius:22px;box-shadow:none}.wrap.compact{padding:14px 16px}.wrap.compact .body{padding:9px 11px}.wrap.compact .role{margin:18px 0 8px}.header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:22px}.title{margin:4px 0 4px;font-size:26px;line-height:1.2;letter-spacing:-.025em;color:#f1f1f1}.query{margin:0;color:#aaa}.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.role{margin:28px 0 12px;font-size:18px;color:#f1f1f1}.card{overflow:hidden;border:1px solid #303030;border-radius:16px;background:#181818;transition:transform .16s,border-color .16s}.card:hover{transform:translateY(-2px);border-color:#555}.thumbLink{display:block;position:relative;aspect-ratio:16/9;background:#272727}.thumb{width:100%;height:100%;object-fit:cover;display:block}.thumbnailPlaceholder{width:100%;height:100%;display:grid;place-items:center;background:radial-gradient(ellipse at 20% 20%,#303030,#181818 65%);color:#aaa;font-size:12px;font-weight:750;letter-spacing:.08em}.duration{position:absolute;right:8px;bottom:8px;padding:2px 6px;border-radius:5px;background:#0f0f0fdd;color:#fff;font-size:12px}.body{padding:13px 14px 15px}.videoTitle{color:#f1f1f1;text-decoration:none;font-size:15px;font-weight:750;line-height:1.35}.videoTitle:hover{text-decoration:underline}.meta{margin:8px 0 0;color:#aaa;font-size:12px}.reason{margin:11px 0 0;color:#aaa;font-size:13px}.confidence{margin:7px 0 0;color:#aaa;font-size:11px}.badge{display:inline-block;margin-top:10px;padding:4px 8px;background:#272727;border:1px solid #303030;border-radius:999px;color:#f1f1f1;font-size:11px;font-weight:750}.original{padding:14px 16px;margin-bottom:12px;border-radius:13px;background:#181818;border:1px solid #303030;color:#aaa}.error{padding:20px}.error p{margin:0 0 14px}.skeletonGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.skeleton{height:270px}.progressLabel{margin:0 0 12px;color:#aaa;font-size:13px;font-weight:650}@media(max-width:560px){.wrap{margin:12px 8px;padding:16px}.header{display:block}.actions{justify-content:flex-start;margin-top:14px}}`;

function makeCard(video, roleLabel, offline = false, showReason = true) {
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
  if (roleLabel) body.append(element("span", { className: "badge", text: roleLabel }));
  if (showReason && video.reason) body.append(element("p", { className: "reason", text: video.reason }));
  if (Number.isFinite(Number(video.quality))) body.append(element("p", { className: "confidence", text: `Confidence ${Math.round(Number(video.quality) * 100)}%` }));
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
    const label = element("p", { className: "progressLabel", text: message });
    const grid = element("div", { className: "skeletonGrid" });
    for (let i = 0; i < CONFIG.UI.skeletonCardCount; i += 1) grid.append(element("div", { className: "skeleton" }));
    status.className = ""; status.replaceChildren(label, grid);
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
    status.className = "status error"; status.replaceChildren();
    status.append(element("p", { text: message }));
    const retry = button("Try again", "button primary", onRetry);
    const dismiss = button("Dismiss", "button", () => { status.replaceChildren(); status.hidden = true; });
    status.append(retry, dismiss);
    preserveOriginalNotice();
  };
  const renderResults = result => {
    status.className = ""; status.replaceChildren();
    if (result.metadata?.fallbackLabel) status.append(element("div", { className: "status", text: result.metadata.fallbackLabel }));
    if (!result.videos?.length) { renderError("No videos met the quality threshold. Try a broader search or show original results."); return; }
    const roleGroups = new Map();
    for (const video of result.videos) {
      const role = mode === "learn" ? (video.role || "other") : "other";
      if (!roleGroups.has(role)) roleGroups.set(role, []);
      roleGroups.get(role).push(video);
    }
    for (const [role, videos] of roleGroups) {
      const label = CONFIG.UI.labels[role] || CONFIG.UI.labels.other;
      status.append(element("h3", { className: "role", text: label }));
      const grid = element("div", { className: "grid" });
      for (const video of videos) grid.append(makeCard(video, mode === "learn" ? label : "", result.metadata?.providers?.includes("mock"), settings.showReasons !== false));
      status.append(grid);
    }
    preserveOriginalNotice();
  };
  const dispose = () => { setCuratedSearch(false); safeRemove(host); };
  return { host, shadow, renderSkeleton, setProgress, renderError, renderResults, dispose, toggleOriginal };
}
