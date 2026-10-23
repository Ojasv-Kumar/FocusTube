import { CONFIG } from "../config.js";
import { SELECTORS, queryFirst } from "../selectors.js";
import { createHost, addStyle, element, button, componentCss, formatViews, formatDuration, safeRemove } from "./ui-kit.js";
import { setCuratedSearch } from "./mode-manager.js";

const RESULTS_CSS = `.wrap{max-width:1120px;margin:28px auto 60px;padding:22px 24px;background:#f8faf8;border:1px solid #e1e8e2;border-radius:22px;box-shadow:0 10px 35px #193a2810}.header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:22px}.title{margin:4px 0 4px;font-size:26px;line-height:1.2;letter-spacing:-.025em;color:#183a2c}.query{margin:0;color:#69766f}.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.role{margin:28px 0 12px;font-size:18px;color:#244335}.card{overflow:hidden;border:1px solid #e0e7e1;border-radius:16px;background:#fff;transition:transform .16s,box-shadow .16s}.card:hover{transform:translateY(-2px);box-shadow:0 12px 28px #17352714}.thumbLink{display:block;position:relative;aspect-ratio:16/9;background:#edf2ed}.thumb{width:100%;height:100%;object-fit:cover;display:block}.thumbnailPlaceholder{width:100%;height:100%;display:grid;place-items:center;background:radial-gradient(ellipse at 20% 20%,#c6dfd0,#edf2ed 65%);color:#476754;font-size:12px;font-weight:750;letter-spacing:.08em}.duration{position:absolute;right:8px;bottom:8px;padding:2px 6px;border-radius:5px;background:#14241edb;color:#fff;font-size:12px}.body{padding:13px 14px 15px}.videoTitle{color:#1c3128;text-decoration:none;font-size:15px;font-weight:750;line-height:1.35}.videoTitle:hover{text-decoration:underline}.meta{margin:8px 0 0;color:#6b7771;font-size:12px}.reason{margin:11px 0 0;color:#33483f;font-size:13px}.confidence{margin:7px 0 0;color:#728078;font-size:11px}.badge{display:inline-block;margin-top:10px;padding:4px 8px;background:#edf4ef;border-radius:999px;color:#3c6a53;font-size:11px;font-weight:750}.original{padding:14px 16px;margin-bottom:12px;border-radius:13px;background:#fff;border:1px solid #e2e8e3;color:#64726b}.error{padding:20px}.error p{margin:0 0 14px}.skeletonGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.skeleton{height:270px}@media(max-width:560px){.wrap{margin:12px 8px;padding:16px}.header{display:block}.actions{justify-content:flex-start;margin-top:14px}}`;

function makeCard(video, roleLabel, offline = false) {
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
  if (video.reason) body.append(element("p", { className: "reason", text: video.reason }));
  if (Number.isFinite(Number(video.quality))) body.append(element("p", { className: "confidence", text: `Confidence ${Math.round(Number(video.quality) * 100)}%` }));
  card.append(thumbLink, body);
  return card;
}
export function createResultsUI({ mode, query, parent = null, onRetry = () => {}, onOriginalChange = () => {} }) {
  const pair = createHost(SELECTORS.resultsHost, SELECTORS.resultsHost);
  if (!pair) return null;
  const { host, shadow } = pair;
  addStyle(shadow, componentCss() + RESULTS_CSS);
  const wrap = element("section", { className: "wrap", attributes: { "aria-label": "FocusTube curated videos" } });
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
  const renderSkeleton = () => {
    original = false; savedResults = []; setCuratedSearch(true); retryButton.hidden = false; originalButton.textContent = "Show original YouTube results"; status.hidden = false;
    const grid = element("div", { className: "skeletonGrid" });
    for (let i = 0; i < CONFIG.UI.skeletonCardCount; i += 1) grid.append(element("div", { className: "skeleton" }));
    status.className = ""; status.replaceChildren(grid);
  };
  const renderError = message => {
    status.className = "status error"; status.replaceChildren();
    status.append(element("p", { text: message }));
    const retry = button("Try again", "button primary", onRetry);
    status.append(retry, document.createTextNode(" You can also show original YouTube results above."));
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
      for (const video of videos) grid.append(makeCard(video, mode === "learn" ? label : "", result.metadata?.providers?.includes("mock")));
      status.append(grid);
    }
    preserveOriginalNotice();
  };
  const dispose = () => { setCuratedSearch(false); safeRemove(host); };
  return { host, shadow, renderSkeleton, renderError, renderResults, dispose, toggleOriginal };
}
