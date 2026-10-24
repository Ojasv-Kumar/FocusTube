import { CONFIG } from "../config.js";
import { SELECTORS, queryFirst } from "../selectors.js";
import { createHost, addStyle, element, button, componentCss, formatViews, formatDuration, safeRemove } from "./ui-kit.js";

const HOME_CSS = `.wrap{max-width:1120px;margin:28px auto 60px;padding:24px;background:#0f0f0f;border:1px solid #303030;border-radius:22px;box-shadow:none}.hero{max-width:670px;padding:20px 8px 27px}.title{margin:7px 0 11px;font-size:clamp(25px,4vw,38px);letter-spacing:-.035em;line-height:1.18;color:#f1f1f1}.intro{margin:0 0 19px;color:#aaa}.search{display:flex;gap:9px;flex-wrap:wrap}.input{flex:1;min-width:220px;padding:13px 14px;border:1px solid #303030;border-radius:12px;background:#181818;color:#f1f1f1}.section{margin-top:28px}.progressLabel{margin:0 0 12px;color:#aaa;font-size:13px;font-weight:650}.sectionTitle{margin:0 0 13px;font-size:19px;color:#f1f1f1}.channels{display:flex;gap:10px;flex-wrap:wrap}.channel{display:block;max-width:340px;padding:14px 16px;background:#181818;border:1px solid #303030;border-radius:14px;color:#f1f1f1;text-decoration:none}.channel:hover{border-color:#555;background:#222}.channel strong{display:block}.channel span{display:block;margin-top:5px;color:#aaa;font-size:13px}.card{overflow:hidden;border:1px solid #303030;border-radius:16px;background:#181818}.thumbLink{display:block;aspect-ratio:16/9;background:#272727;position:relative}.thumb{width:100%;height:100%;object-fit:cover}.thumbnailPlaceholder{width:100%;height:100%;display:grid;place-items:center;background:radial-gradient(ellipse at 20% 20%,#303030,#181818 65%);color:#aaa;font-size:12px;font-weight:750;letter-spacing:.08em}.duration{position:absolute;right:8px;bottom:8px;padding:2px 6px;background:#0f0f0fdd;border-radius:5px;color:#fff;font-size:12px}.body{padding:13px 14px}.videoTitle{color:#f1f1f1;text-decoration:none;font-weight:750}.meta{margin:7px 0 0;color:#aaa;font-size:12px}.reason{margin:9px 0 0;color:#aaa;font-size:13px}.skeletonGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.skeleton{height:260px}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px}.empty{padding:18px;background:#181818;border-radius:12px;color:#aaa}`;
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
export function createHomeUI({ mode, interest = "", onSearch = () => {}, onRefresh = () => {}, onLoadMore = () => {}, onUseOriginal = () => {} }) {
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
    form.append(input, submit); form.addEventListener("submit", event => { event.preventDefault(); onSearch(input.value.trim()); }); hero.append(form);
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
  const renderResults = (result, { append = false } = {}) => {
    const seen = new Set(append ? displayedVideos.map(video => String(video.id)) : []);
    displayedVideos = append ? [...displayedVideos] : [];
    for (const video of (result.videos || [])) {
      if (displayedVideos.length >= CONFIG.Pipeline.maxVideosShown) break;
      if (video?.id && !seen.has(String(video.id))) { displayedVideos.push(video); seen.add(String(video.id)); }
    }
    loadingMore = false;
    status.className = ""; status.replaceChildren();
    if (result.metadata?.fallbackLabel) status.append(element("div", { className: "status", text: result.metadata.fallbackLabel }));
    if (mode === "interest" && result.channels?.length) {
      const section = element("section", { className: "section" }); section.append(element("h3", { className: "sectionTitle", text: "Channels to explore" }));
      const row = element("div", { className: "channels" });
      for (const channel of result.channels) {
        const link = element("a", { className: "channel", href: `https://www.youtube.com/results?search_query=${encodeURIComponent(channel.name)}` });
        link.append(element("strong", { text: channel.name }), element("span", { text: channel.reason || "Suggested for your interest." })); row.append(link);
      }
      section.append(row); status.append(section);
    }
    const section = element("section", { className: "section" });
    const heading = element("div", { className: "toolbar" }); heading.append(element("h3", { className: "sectionTitle", text: mode === "interest" ? "Videos for your interest" : "Videos to explore" }));
    section.append(heading);
    if (!displayedVideos.length) section.append(element("div", { className: "empty", text: "No videos were found yet. Try refreshing or adjusting your interest." }));
    else { const grid = element("div", { className: "grid" }); for (const video of displayedVideos) grid.append(makeHomeCard(video, result.metadata?.providers?.includes("mock"))); section.append(grid); }
    status.append(section);
    updateLoadMore();
    if (!loadMoreButton.hidden) status.append(loadMoreButton);
  };
  const setLoadingMore = value => { loadingMore = Boolean(value); updateLoadMore(); };
  return { host, renderSkeleton, setProgress, renderError, renderResults, setLoadingMore, getVideoIds: () => displayedVideos.map(video => String(video.id)), isLoadingMore: () => loadingMore, dispose: () => safeRemove(host) };
}
