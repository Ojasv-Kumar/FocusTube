import { CONFIG } from "../config.js";
import { SELECTORS, queryFirst } from "../selectors.js";
import { createHost, addStyle, element, button, componentCss, formatViews, formatDuration, safeRemove, createVideoSkeleton, enhanceVideoGridMotion, enhanceSurfaceMotion, createStatusNotice } from "./ui-kit.js";
import { setCuratedSearch } from "./mode-manager.js";

const RESULTS_CSS = `
:host{display:block;width:100%;min-width:0;max-width:1320px;box-sizing:border-box;overflow:visible;position:relative;margin-inline:auto;color:#f2f2f2}
.wrap.results-wrap{position:relative;isolation:isolate;width:100%;min-width:0;max-width:1240px;box-sizing:border-box;overflow:hidden;margin:26px auto 58px;padding:clamp(18px,2.1vw,28px);border-radius:22px}
.wrap.results-wrap::before{content:"";position:absolute;z-index:0;inset:-1px;pointer-events:none;background:radial-gradient(circle var(--spotlight-size,520px) at var(--pointer-x,78%) var(--pointer-y,12%),rgba(255,255,255,var(--spotlight-opacity,.075)),transparent 70%),radial-gradient(ellipse at 94% 0%,rgba(255,255,255,.05),transparent 33%),radial-gradient(ellipse at 3% 100%,rgba(210,190,160,.025),transparent 30%);transform:translate3d(0,var(--scroll-drift,0px),0);filter:blur(5px);animation:yt-results-ambient 14s ease-in-out infinite alternate}
.wrap.results-wrap>*{position:relative;z-index:1}
.wrap.compact{padding:15px 17px}.wrap.compact .body{padding:10px 12px}.wrap.compact .role{margin:20px 0 9px}
.header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:21px}
.header>div:first-child{min-width:0}
.eyebrow{display:flex;align-items:center;gap:9px;margin:0 0 9px;color:#bcbcbc;font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
.eyebrow::before{content:"";width:18px;height:1px;background:linear-gradient(90deg,#efefef,#777);opacity:.72}
.title{margin:4px 0 6px;font-size:clamp(23px,3vw,30px);line-height:1.2;letter-spacing:-.035em;color:#f3f3f3}
.query{margin:0;color:#aaa;font-size:13px;line-height:1.6;overflow-wrap:anywhere}
.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;flex-shrink:0}
.role{display:flex;align-items:center;gap:10px;margin:28px 0 13px;font-size:18px;font-weight:740;letter-spacing:-.02em;color:#f1f1f1}
.role::before{content:"";width:4px;height:18px;border-radius:4px;background:#b8b8b8;box-shadow:0 0 12px #fff2}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:18px;align-items:stretch;perspective:1200px}
.card.video-card{position:relative;display:flex;flex-direction:column;min-width:0;overflow:hidden;border:1px solid #373737;border-radius:18px;background:linear-gradient(155deg,#1d1d1d,#111111);transition:transform .28s cubic-bezier(.2,.75,.25,1),border-color .25s,box-shadow .28s;transform:perspective(1100px) rotateX(var(--tilt-x,0deg)) rotateY(var(--tilt-y,0deg)) translateY(var(--card-lift,0px));transform-style:preserve-3d;animation:yt-video-card-enter .55s cubic-bezier(.2,.75,.25,1) both;animation-delay:var(--card-delay,0ms)}
.card.video-card::after{content:"";position:absolute;z-index:3;inset:0;pointer-events:none;opacity:0;background:radial-gradient(250px circle at var(--glare-x,50%) var(--glare-y,50%),rgba(255,255,255,.105),transparent 72%);transition:opacity .2s}
.card.video-card.is-hovered,.card.video-card:focus-within{--card-lift:-4px;border-color:#777;box-shadow:0 20px 40px #0007,0 0 0 1px #ffffff0b,inset 0 1px #ffffff11}
.card.video-card.is-hovered::after{opacity:1}
.thumbLink{display:block;position:relative;isolation:isolate;overflow:hidden;aspect-ratio:16/9;background:#242424;border-bottom:1px solid #ffffff0b;flex:0 0 auto}
.thumb{display:block;width:100%;height:100%;object-fit:cover;transform:translate3d(0,var(--scroll-parallax,0px),0) scale(1.045);transition:transform .55s cubic-bezier(.2,.75,.25,1),filter .35s}
.video-card.is-hovered .thumb,.video-card:focus-within .thumb{will-change:transform;transform:translate3d(0,var(--scroll-parallax,0px),0) scale(1.09);filter:brightness(1.055) saturate(1.03)}
.thumbLink::after{content:"";position:absolute;inset:35% 0 0;pointer-events:none;background:linear-gradient(180deg,transparent,rgba(0,0,0,.42))}
.thumbnailPlaceholder{display:grid;width:100%;height:100%;place-items:center;background:radial-gradient(ellipse at 22% 16%,#393939,#191919 70%);color:#c3c3c3;font-size:10px;font-weight:800;letter-spacing:.16em}
.duration{position:absolute;z-index:2;right:10px;bottom:9px;padding:4px 7px;border:1px solid #ffffff19;border-radius:6px;background:#090909d9;color:#fff;font-size:11px;font-variant-numeric:tabular-nums;backdrop-filter:blur(8px)}
.watchOverlay{position:absolute;z-index:2;left:11px;bottom:9px;padding:5px 8px;border:1px solid #ffffff30;border-radius:7px;background:#080808b8;color:#f4f4f4;font-size:10px;font-weight:800;letter-spacing:.08em;opacity:0;transform:translateY(4px);transition:opacity .2s,transform .2s;backdrop-filter:blur(8px)}
.video-card.is-hovered .watchOverlay,.video-card:focus-within .watchOverlay{opacity:1;transform:translateY(0)}
.body{display:flex;flex:1;flex-direction:column;align-items:flex-start;min-width:0;padding:15px 16px 17px}
.videoTitle{display:-webkit-box;overflow:hidden;max-width:100%;color:#f1f1f1;text-decoration:none;font-size:15px;font-weight:740;line-height:1.45;letter-spacing:-.012em;-webkit-line-clamp:2;-webkit-box-orient:vertical;transition:color .2s}
.videoTitle:hover{color:#fff;text-decoration:underline;text-decoration-color:#a6a6a6;text-underline-offset:3px}
.videoTitle:focus-visible{outline:2px solid #bdbdbd;outline-offset:3px;border-radius:3px}
.meta{margin:9px 0 0;color:#9e9e9e;font-size:12px;line-height:1.45}
.reason{display:-webkit-box;overflow:hidden;margin:10px 0 0;color:#b7b7b7;font-size:12px;line-height:1.55;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.original{padding:14px 16px;margin-bottom:12px;border-radius:13px;background:#181818;border:1px solid #303030;color:#aaa}
.error{padding:20px}.error p{margin:0 0 14px}
.skeletonGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:18px}
.video-skeleton{overflow:hidden;min-width:0;border:1px solid #303030;border-radius:18px;background:linear-gradient(155deg,#191919,#111);box-shadow:inset 0 1px #ffffff05}
.skeleton-thumb,.skeleton-line{background:linear-gradient(105deg,#1b1b1b 24%,#2a2a2a 40%,#202020 58%,#1b1b1b 76%);background-size:220% 100%;animation:yt-video-shimmer 1.65s ease-in-out infinite}
.skeleton-thumb{aspect-ratio:16/9;border-bottom:1px solid #ffffff08}
.skeleton-copy{padding:16px}.skeleton-line{height:10px;border-radius:5px;margin-bottom:10px}.skeleton-line.title-line{height:13px;width:88%}.skeleton-line.title-line.short{width:62%;margin-bottom:15px}.skeleton-line.meta-line{height:8px;width:48%;opacity:.7}
.progressLabel{display:flex;align-items:center;gap:10px;margin:0 0 14px;color:#c5c5c5;font-size:13px;font-weight:650;letter-spacing:.01em}
.progressLabel::before{content:"";width:6px;height:6px;border-radius:50%;background:#c6c6c6;box-shadow:0 0 12px #ffffff2b}
@keyframes yt-video-shimmer{to{background-position-x:-220%}}
@keyframes yt-video-card-enter{from{opacity:0;translate:0 13px;filter:blur(4px)}to{opacity:1;translate:0 0;filter:blur(0)}}
@media(max-width:720px){.wrap.results-wrap{margin:15px 8px 38px;padding:16px;border-radius:18px}.header{display:block}.actions{justify-content:flex-start;margin-top:14px}.grid,.skeletonGrid{grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:13px}.card.video-card{border-radius:15px}.body{padding:13px}}
@media(max-width:460px){.grid,.skeletonGrid{grid-template-columns:minmax(0,1fr)}.title{font-size:24px}}
@media(prefers-reduced-motion:reduce){.card.video-card,.thumb,.watchOverlay{animation:none!important;transition:none!important}.card.video-card{transform:none!important}.skeleton-thumb,.skeleton-line{animation:none!important}}
/* Shared premium interaction layer: restrained glass, motion, and accessible status disclosure. */
.wrap.results-wrap{border:1px solid rgba(255,255,255,.075);box-shadow:0 28px 72px rgba(0,0,0,.34),inset 0 1px rgba(255,255,255,.055);backdrop-filter:blur(18px) saturate(1.06)}
.wrap.results-wrap::after{content:"";position:absolute;z-index:0;inset:0;pointer-events:none;opacity:.16;background-image:linear-gradient(115deg,transparent 0 29%,rgba(255,255,255,.07) 29.1%,transparent 29.25% 72%,rgba(255,255,255,.045) 72.1%,transparent 72.25%),radial-gradient(circle at 88% 14%,#fff 0 .8px,transparent 1.6px),radial-gradient(circle at 12% 73%,#fff 0 .8px,transparent 1.6px)}
.header{transform:translate3d(var(--hero-shift-x,0px),var(--hero-shift-y,0px),0);transition:transform .28s cubic-bezier(.2,.75,.25,1)}
.header .eyebrow{animation:yt-results-enter .55s cubic-bezier(.2,.75,.25,1) both}.header .title{animation:yt-results-enter .62s cubic-bezier(.2,.75,.25,1) both;animation-delay:70ms}.header .query{animation:yt-results-enter .62s cubic-bezier(.2,.75,.25,1) both;animation-delay:130ms}.header .actions{animation:yt-results-enter .62s cubic-bezier(.2,.75,.25,1) both;animation-delay:180ms}
.role{margin-top:30px;text-shadow:0 1px rgba(255,255,255,.02)}.role::before{height:16px;background:linear-gradient(#eee,#777);box-shadow:0 0 14px rgba(255,255,255,.13)}
.card.video-card{background:linear-gradient(150deg,rgba(35,35,35,.92),rgba(16,16,16,.96));border:1px solid rgba(255,255,255,.13);box-shadow:0 9px 24px rgba(0,0,0,.25),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(10px)}
.card.video-card::after{border-radius:inherit;mix-blend-mode:screen;background:radial-gradient(300px circle at var(--glare-x,50%) var(--glare-y,50%),rgba(255,255,255,.13),transparent 72%)}
.card.video-card.is-hovered,.card.video-card:focus-within{border-color:rgba(255,255,255,.36);box-shadow:0 22px 42px rgba(0,0,0,.42),0 0 0 1px rgba(255,255,255,.055),inset 0 1px rgba(255,255,255,.12)}
.thumbLink{transform:translateZ(8px)}.body{transform:translateZ(5px)}.videoTitle{letter-spacing:-.012em}.meta{line-height:1.5}.watchOverlay{translate:0 4px}.video-card.is-hovered .watchOverlay,.video-card:focus-within .watchOverlay{translate:0 0}
.statusNotice{display:block;margin:8px 0 18px;overflow:hidden;border:1px solid rgba(255,255,255,.13);border-radius:13px;background:linear-gradient(110deg,rgba(29,29,29,.87),rgba(17,17,17,.9));box-shadow:inset 0 1px rgba(255,255,255,.045);color:#e4e4e4}.statusNoticeSummary{display:flex;align-items:center;gap:12px;min-height:58px;padding:12px 15px;cursor:pointer;list-style:none}.statusNoticeSummary::-webkit-details-marker{display:none}.statusNoticeIcon{display:grid;flex:0 0 27px;width:27px;height:27px;place-items:center;border:1px solid rgba(255,255,255,.24);border-radius:50%;color:#eee;font-size:13px;font-weight:750}.statusNoticeCopy{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}.statusNoticeTitle{font-size:12px;font-weight:750}.statusNoticeHint{color:#aaa;font-size:11px;line-height:1.45}.statusNoticeChevron{color:#aaa;transition:rotate .2s}.statusNotice[open] .statusNoticeChevron{rotate:180deg}.statusNoticeDetails{padding:0 16px 14px 54px;color:#aaa;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.statusNoticeDetails p{margin:0}.statusNotice-error{border-color:rgba(210,160,150,.24)}.statusNotice-error .statusNoticeIcon{border-color:rgba(224,162,152,.4);color:#e7b0a8}
.noticeActions{display:flex;flex-wrap:wrap;gap:9px;margin-top:12px}.button.magneticButton{position:relative;overflow:hidden;isolation:isolate;transform:translate3d(var(--magnet-x,0px),var(--magnet-y,0px),0);transition:transform .2s cubic-bezier(.2,.75,.25,1),background .2s,border-color .2s,box-shadow .2s}.buttonRipple{position:absolute;z-index:0;width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.48);transform:translate(-50%,-50%) scale(0);pointer-events:none;animation:yt-button-ripple .52s cubic-bezier(.2,.75,.25,1) forwards}
@keyframes yt-results-ambient{from{opacity:.68}to{opacity:1}}@keyframes yt-results-enter{from{opacity:0;translate:0 10px;filter:blur(4px)}to{opacity:1;translate:0 0;filter:blur(0)}}
.wrap[data-motion-paused="true"] *, .wrap[data-motion-paused="true"]::before,.wrap[data-motion-paused="true"]::after{animation-play-state:paused!important}
@media(max-width:720px){.wrap.results-wrap::after{opacity:.1}.statusNoticeDetails{padding-left:16px}}
@media(prefers-reduced-motion:reduce){.header,.header>*,.card.video-card,.thumb,.watchOverlay,.button.magneticButton{animation:none!important;transition:none!important}.header,.card.video-card,.button.magneticButton{transform:none!important;translate:none!important}.wrap.results-wrap::before{opacity:.35;animation:none}}
`;

function makeCard(video, offline = false) {
  const card = element("article", { className: "card video-card" });
  const href = `https://www.youtube.com/watch?v=${encodeURIComponent(String(video.id))}`;
  const thumbLink = element("a", { className: "thumbLink", href, attributes: { "aria-label": `Watch ${video.title}` } });
  if (!offline && video.thumbnailUrl) {
    const image = element("img", { className: "thumb", attributes: { src: video.thumbnailUrl, alt: "", loading: "lazy" } });
    image.addEventListener("error", () => image.remove());
    thumbLink.append(image);
  } else thumbLink.append(element("div", { className: "thumbnailPlaceholder", text: "YOURTUBE PREVIEW" }));
  if (video.durationSeconds != null) thumbLink.append(element("span", { className: "duration", text: formatDuration(video.durationSeconds) }));
  thumbLink.append(element("span", { className: "watchOverlay", text: "WATCH VIDEO ↗", attributes: { "aria-hidden": "true" } }));
  const body = element("div", { className: "body" });
  body.append(element("a", { className: "videoTitle", text: video.title, href }));
  const meta = [video.channelName, formatDuration(video.durationSeconds), formatViews(video.viewCount)].filter(Boolean).join(" · ");
  if (meta) body.append(element("p", { className: "meta", text: meta }));
  if (video.reason) body.append(element("p", { className: "reason", text: video.reason }));
  card.append(thumbLink, body);
  return card;
}

export function createResultsUI({ mode, query, parent = null, settings = {}, onRetry = () => {}, onOriginalChange = () => {} }) {
  const pair = createHost(SELECTORS.resultsHost, SELECTORS.resultsHost);
  if (!pair) return null;
  const { host, shadow } = pair;
  addStyle(shadow, componentCss() + RESULTS_CSS);
  const wrap = element("section", { className: `wrap results-wrap ${settings.density === "compact" ? "compact" : ""}`, attributes: { "aria-label": "YourTube curated videos" } });
  const header = element("div", { className: "header" });
  const headingBlock = element("div");
  headingBlock.append(element("p", { className: "eyebrow", text: mode === "learn" ? "A guided learning path" : "A focused set of videos" }));
  headingBlock.append(element("h2", { className: "title", text: "Your results" }));
  headingBlock.append(element("p", { className: "query", text: query }));
  const actions = element("div", { className: "actions" });
  const retryButton = button("Retry", "button magneticButton"); retryButton.addEventListener("click", onRetry);
  const originalButton = button("Show original YouTube results", "button");
  actions.append(retryButton, originalButton); header.append(headingBlock, actions);
  const status = element("div", { className: "status", attributes: { "aria-live": "polite" } });
  wrap.append(header, status); shadow.append(wrap);
  const targetParent = parent || queryFirst(["ytd-search", "ytd-app", "main"]) || document.body || document.documentElement;
  targetParent.append(host);
  const surfaceCleanup = enhanceSurfaceMotion(wrap);
  let original = false;
  let savedResults = [];
  let savedStatusClass = "status";
  let motionCleanups = [];
  const clearVideoMotion = () => { for (const cleanup of motionCleanups) cleanup(); motionCleanups = []; };
  const originalNotice = () => {
    const notice = element("div", { className: "original", text: "Original YouTube results are visible." });
    const switchBack = button("Show YourTube picks", "button primary", () => toggleOriginal());
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
    originalButton.textContent = original ? "Show YourTube results" : "Show original YouTube results";
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
    clearVideoMotion();
    original = false; savedResults = []; setCuratedSearch(true); retryButton.hidden = false; originalButton.textContent = "Show original YouTube results"; status.hidden = false;
    const label = element("p", { className: "progressLabel", text: message });
    const grid = element("div", { className: "skeletonGrid" });
    for (let i = 0; i < CONFIG.UI.skeletonCardCount; i += 1) grid.append(createVideoSkeleton());
    status.className = ""; status.replaceChildren(label, grid);
  };
  const setProgress = message => {
    if (!status.isConnected || !message) return;
    let label = status.querySelector(".progressLabel");
    if (!label) { label = element("p", { className: "progressLabel" }); status.prepend(label); }
    label.textContent = String(message).slice(0, 180);
  };
  const renderError = message => {
    clearVideoMotion();
    // Keep the curated panel in place. Reveal original YouTube only when the user
    // explicitly selects the button; transient LLM failures must not flip the page.
    setCuratedSearch(true);
    status.className = "status error"; status.replaceChildren();
    status.append(createStatusNotice(message, { title: "Your results couldn't load", hint: "Open for error details", kind: "error" }));
    const actions = element("div", { className: "noticeActions" });
    const retry = button("Try again", "button primary magneticButton", onRetry);
    const dismiss = button("Dismiss", "button", () => { status.replaceChildren(); status.hidden = true; });
    actions.append(retry, dismiss); status.append(actions);
    preserveOriginalNotice();
  };
  const renderResults = result => {
    clearVideoMotion();
    status.className = ""; status.replaceChildren();
    if (result.metadata?.fallbackLabel) status.append(createStatusNotice(result.metadata.fallbackLabel));
    if (!result.videos?.length) { renderError("No videos met the quality threshold. Try a broader search or show original results."); return; }
    const queryKey = String(query || "").trim().toLocaleLowerCase();
    const groups = [
      ["Relevant videos", result.videos.filter(video => queryKey && String(video.sourceQuery || "").trim().toLocaleLowerCase() === queryKey)],
      ["Related searches", result.videos.filter(video => !queryKey || String(video.sourceQuery || "").trim().toLocaleLowerCase() !== queryKey)]
    ];
    const videoGrids = [];
    for (const [label, videos] of groups) {
      if (!videos.length) continue;
      status.append(element("h3", { className: "role", text: label }));
      const grid = element("div", { className: "grid" });
      videos.forEach(video => grid.append(makeCard(video, result.metadata?.providers?.includes("mock"))));
      status.append(grid);
      videoGrids.push(grid);
    }
    for (const grid of videoGrids) motionCleanups.push(enhanceVideoGridMotion(grid));
    preserveOriginalNotice();
  };
  const dispose = () => { clearVideoMotion(); surfaceCleanup(); setCuratedSearch(false); safeRemove(host); };
  return { host, shadow, renderSkeleton, setProgress, renderError, renderResults, dispose, toggleOriginal };
}
