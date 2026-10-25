import { CONFIG } from "../config.js";
import { SELECTORS, queryFirst } from "../selectors.js";
import { createHost, addStyle, element, button, componentCss, formatViews, formatDuration, safeRemove, createVideoSkeleton, enhanceVideoGridMotion, enhanceSurfaceMotion, createStatusNotice } from "./ui-kit.js";

const HOME_CSS = `
:host{display:block;width:100%;min-width:0;max-width:1400px;margin-inline:auto;color:#f2f2f2;--yt-silver:#e8e8e8;--yt-muted:#a4a4a4;--yt-line:rgba(255,255,255,.115)}
.wrap.home-wrap{position:relative;isolation:isolate;max-width:1320px;margin:25px auto 58px;padding:clamp(18px,2.2vw,32px);overflow:hidden;border:1px solid rgba(255,255,255,.075);border-radius:24px;background:linear-gradient(145deg,rgba(27,27,27,.82),rgba(10,10,10,.91));box-shadow:0 28px 72px rgba(0,0,0,.34),inset 0 1px rgba(255,255,255,.055);backdrop-filter:blur(18px) saturate(1.06)}
.wrap.home-wrap::before{content:"";position:absolute;z-index:0;inset:-1px;pointer-events:none;background:radial-gradient(circle var(--spotlight-size,520px) at var(--pointer-x,78%) var(--pointer-y,12%),rgba(255,255,255,var(--spotlight-opacity,.075)),transparent 70%),radial-gradient(ellipse at 94% 0%,rgba(255,255,255,.05),transparent 33%),radial-gradient(ellipse at 3% 100%,rgba(210,190,160,.025),transparent 30%);transform:translate3d(0,var(--scroll-drift,0px),0);animation:yt-ambient-breathe 14s ease-in-out infinite alternate;transition:opacity .25s}
.wrap.home-wrap::after{content:"";position:absolute;z-index:0;inset:0;pointer-events:none;opacity:.17;background-image:linear-gradient(115deg,transparent 0 29%,rgba(255,255,255,.07) 29.1%,transparent 29.25% 72%,rgba(255,255,255,.045) 72.1%,transparent 72.25%),radial-gradient(circle at 88% 14%,#ffffff 0 .8px,transparent 1.6px),radial-gradient(circle at 12% 73%,#ffffff 0 .8px,transparent 1.6px);background-size:100% 100%}
.wrap.home-wrap>*{position:relative;z-index:1}
.hero{max-width:860px;padding:10px 5px 22px;transform:translate3d(var(--hero-shift-x,0px),var(--hero-shift-y,0px),0);transition:transform .28s cubic-bezier(.2,.75,.25,1)}
.hero>.eyebrow{animation:yt-hero-enter .55s cubic-bezier(.2,.75,.25,1) both;animation-delay:20ms}.hero>.title{animation:yt-hero-enter .65s cubic-bezier(.2,.75,.25,1) both;animation-delay:80ms}.hero>.intro{animation:yt-hero-enter .65s cubic-bezier(.2,.75,.25,1) both;animation-delay:140ms}.hero>.search,.hero>.toolbar{animation:yt-hero-enter .65s cubic-bezier(.2,.75,.25,1) both;animation-delay:200ms}
.eyebrow{display:flex;align-items:center;gap:9px;margin:0 0 11px;color:#c5c5c5;font-size:10px;font-weight:800;letter-spacing:.17em;text-transform:uppercase}
.eyebrow::before{content:"";width:20px;height:1px;background:linear-gradient(90deg,#f0f0f0,#777);opacity:.78}
.title{margin:7px 0 12px;font-size:clamp(29px,3.8vw,44px);letter-spacing:-.047em;line-height:1.08;color:#f5f5f5;text-wrap:balance;font-weight:780}
.titleAccent{background:linear-gradient(100deg,#f4f4f4 0%,#c2c2c2 38%,#fff 54%,#aaa 73%,#eee 100%);background-size:220% auto;color:transparent;background-clip:text;-webkit-background-clip:text;animation:yt-silver-shift 8s ease-in-out infinite}
.intro{max-width:680px;margin:0 0 20px;color:#b1b1b1;font-size:14px;line-height:1.7}
.search{display:flex;gap:9px;flex-wrap:wrap}
.input{flex:1;min-width:220px;padding:13px 15px;border:1px solid rgba(255,255,255,.14);border-radius:13px;background:linear-gradient(145deg,rgba(31,31,31,.94),rgba(14,14,14,.96));color:#f1f1f1;box-shadow:inset 0 1px rgba(255,255,255,.04);transition:border-color .22s,box-shadow .22s,background .22s}
.input:hover{border-color:rgba(255,255,255,.32)}.input:focus{outline:0;border-color:#a8a8a8;box-shadow:0 0 0 3px rgba(255,255,255,.075),inset 0 1px rgba(255,255,255,.06)}
.section{margin-top:27px}.progressLabel{display:flex;align-items:center;gap:10px;margin:0 0 14px;color:#d0d0d0;font-size:13px;font-weight:650;letter-spacing:.01em}.progressLabel::before{content:"";width:6px;height:6px;border-radius:50%;background:#dedede;box-shadow:0 0 12px rgba(255,255,255,.2)}
.sectionTitle{margin:0;font-size:19px;font-weight:740;letter-spacing:-.025em;color:#f2f2f2}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:0 0 14px}
.channels{display:flex;gap:10px;flex-wrap:wrap}.channel{display:block;max-width:340px;padding:14px 16px;background:linear-gradient(145deg,rgba(32,32,32,.9),rgba(17,17,17,.94));border:1px solid rgba(255,255,255,.11);border-radius:15px;color:#f1f1f1;text-decoration:none;transition:transform .24s cubic-bezier(.2,.75,.25,1),border-color .22s,background .22s,box-shadow .24s;box-shadow:inset 0 1px rgba(255,255,255,.04)}.channel:hover{transform:translateY(-3px);border-color:rgba(255,255,255,.28);background:linear-gradient(145deg,rgba(40,40,40,.95),rgba(20,20,20,.98));box-shadow:0 14px 30px rgba(0,0,0,.3),inset 0 1px rgba(255,255,255,.08)}.channel:focus-visible{outline:2px solid #ddd;outline-offset:3px}.channel strong{display:block;font-size:14px;font-weight:730}.channel span{display:block;margin-top:5px;color:#aaa;font-size:13px;line-height:1.5}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:18px;align-items:stretch;perspective:1250px}
.card.video-card{position:relative;display:flex;flex-direction:column;min-width:0;overflow:hidden;border:1px solid rgba(255,255,255,.13);border-radius:18px;background:linear-gradient(150deg,rgba(35,35,35,.92),rgba(16,16,16,.96));transition:transform .34s cubic-bezier(.2,.75,.25,1),border-color .28s,box-shadow .34s;transform:perspective(1100px) rotateX(var(--tilt-x,0deg)) rotateY(var(--tilt-y,0deg)) translateY(var(--card-lift,0px));transform-style:preserve-3d;animation:yt-video-card-enter .62s cubic-bezier(.2,.75,.25,1) both;animation-delay:var(--card-delay,0ms);box-shadow:0 9px 24px rgba(0,0,0,.25),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(10px)}
.card.video-card::after{content:"";position:absolute;z-index:3;inset:0;border-radius:inherit;pointer-events:none;opacity:0;background:radial-gradient(300px circle at var(--glare-x,50%) var(--glare-y,50%),rgba(255,255,255,.13),transparent 72%);transition:opacity .24s;mix-blend-mode:screen}
.card.video-card.is-hovered,.card.video-card:focus-within{--card-lift:-4px;border-color:rgba(255,255,255,.36);box-shadow:0 22px 42px rgba(0,0,0,.42),0 0 0 1px rgba(255,255,255,.055),inset 0 1px rgba(255,255,255,.12)}.card.video-card.is-hovered::after,.card.video-card:focus-within::after{opacity:1}
.thumbLink{display:block;position:relative;isolation:isolate;overflow:hidden;aspect-ratio:16/9;background:#222;border-bottom:1px solid rgba(255,255,255,.08);flex:0 0 auto;transform:translateZ(8px)}.thumb{display:block;width:100%;height:100%;object-fit:cover;transform:translate3d(0,var(--scroll-parallax,0px),0) scale(1.035);transition:transform .6s cubic-bezier(.2,.75,.25,1),filter .35s}.video-card.is-hovered .thumb,.video-card:focus-within .thumb{transform:translate3d(0,var(--scroll-parallax,0px),0) scale(1.085);filter:brightness(1.06) saturate(1.025)}
.thumbLink::after{content:"";position:absolute;inset:35% 0 0;pointer-events:none;background:linear-gradient(180deg,transparent,rgba(0,0,0,.45))}.thumbnailPlaceholder{display:grid;width:100%;height:100%;place-items:center;background:radial-gradient(ellipse at 22% 16%,#393939,#191919 70%);color:#c3c3c3;font-size:10px;font-weight:800;letter-spacing:.16em}
.duration{position:absolute;z-index:2;right:10px;bottom:9px;padding:4px 7px;border:1px solid rgba(255,255,255,.2);border-radius:7px;background:rgba(5,5,5,.82);color:#fff;font-size:11px;font-variant-numeric:tabular-nums;backdrop-filter:blur(8px)}.watchOverlay{position:absolute;z-index:2;left:11px;bottom:9px;padding:5px 8px;border:1px solid rgba(255,255,255,.27);border-radius:7px;background:rgba(8,8,8,.72);color:#f4f4f4;font-size:10px;font-weight:800;letter-spacing:.08em;opacity:0;translate:0 4px;transition:opacity .22s,translate .22s;backdrop-filter:blur(8px)}.video-card.is-hovered .watchOverlay,.video-card:focus-within .watchOverlay{opacity:1;translate:0 0}
.body{display:flex;flex:1;flex-direction:column;align-items:flex-start;min-width:0;padding:16px 17px 18px;transform:translateZ(5px)}.videoTitle{display:-webkit-box;overflow:hidden;max-width:100%;color:#f1f1f1;text-decoration:none;font-size:15px;font-weight:740;line-height:1.46;letter-spacing:-.012em;-webkit-line-clamp:2;-webkit-box-orient:vertical;transition:color .2s}.videoTitle:hover{color:#fff;text-decoration:underline;text-decoration-color:#aaa;text-underline-offset:3px}.videoTitle:focus-visible{outline:2px solid #ddd;outline-offset:3px;border-radius:3px}.meta{margin:9px 0 0;color:#a4a4a4;font-size:12px;line-height:1.5}.reason{display:-webkit-box;overflow:hidden;margin:10px 0 0;color:#c0c0c0;font-size:12px;line-height:1.55;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.empty{padding:20px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:linear-gradient(145deg,rgba(28,28,28,.86),rgba(15,15,15,.92));color:#b8b8b8}
.statusNotice{display:block;margin:6px 0 18px;overflow:hidden;border:1px solid rgba(255,255,255,.13);border-radius:13px;background:linear-gradient(110deg,rgba(29,29,29,.87),rgba(17,17,17,.9));box-shadow:inset 0 1px rgba(255,255,255,.045);color:#e4e4e4}.statusNoticeSummary{display:flex;align-items:center;gap:12px;min-height:58px;padding:12px 15px;cursor:pointer;list-style:none}.statusNoticeSummary::-webkit-details-marker{display:none}.statusNoticeIcon{display:grid;flex:0 0 27px;width:27px;height:27px;place-items:center;border:1px solid rgba(255,255,255,.24);border-radius:50%;color:#eee;font-size:13px;font-weight:750}.statusNoticeCopy{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}.statusNoticeTitle{font-size:12px;font-weight:750;letter-spacing:.01em}.statusNoticeHint{color:#aaa;font-size:11px;line-height:1.45}.statusNoticeChevron{color:#aaa;transition:rotate .2s}.statusNotice[open] .statusNoticeChevron{rotate:180deg}.statusNoticeDetails{padding:0 16px 14px 54px;color:#aaa;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.statusNoticeDetails p{margin:0}.statusNotice-error{border-color:rgba(210,160,150,.24)}.statusNotice-error .statusNoticeIcon{border-color:rgba(224,162,152,.4);color:#e7b0a8}
.noticeActions{display:flex;flex-wrap:wrap;gap:9px;margin-top:12px}
.skeletonGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:18px}.video-skeleton{overflow:hidden;min-width:0;border:1px solid rgba(255,255,255,.11);border-radius:18px;background:linear-gradient(150deg,rgba(29,29,29,.92),rgba(14,14,14,.96));box-shadow:inset 0 1px rgba(255,255,255,.04)}.skeleton-thumb,.skeleton-line{background:linear-gradient(105deg,#1b1b1b 24%,#2b2b2b 40%,#202020 58%,#1b1b1b 76%);background-size:220% 100%;animation:yt-video-shimmer 1.7s ease-in-out infinite}.skeleton-thumb{aspect-ratio:16/9;border-bottom:1px solid rgba(255,255,255,.08)}.skeleton-copy{padding:16px}.skeleton-line{height:10px;border-radius:5px;margin-bottom:10px}.skeleton-line.title-line{height:13px;width:88%}.skeleton-line.title-line.short{width:62%;margin-bottom:15px}.skeleton-line.meta-line{height:8px;width:48%;opacity:.7}
.button.magneticButton{position:relative;overflow:hidden;isolation:isolate;transform:translate3d(var(--magnet-x,0px),var(--magnet-y,0px),0);transition:transform .2s cubic-bezier(.2,.75,.25,1),background .2s,border-color .2s,box-shadow .2s;box-shadow:0 7px 20px rgba(0,0,0,.22),inset 0 1px rgba(255,255,255,.14)}.button.magneticButton.is-magnetic{box-shadow:0 12px 28px rgba(0,0,0,.3),inset 0 1px rgba(255,255,255,.2)}.buttonRipple{position:absolute;z-index:0;width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.38);transform:translate(-50%,-50%) scale(0);pointer-events:none;animation:yt-button-ripple .52s cubic-bezier(.2,.75,.25,1) forwards}
@keyframes yt-ambient-breathe{from{opacity:.68}to{opacity:1}}@keyframes yt-video-shimmer{to{background-position-x:-220%}}@keyframes yt-video-card-enter{from{opacity:0;translate:0 13px;filter:blur(4px)}to{opacity:1;translate:0 0;filter:blur(0)}}@keyframes yt-hero-enter{from{opacity:0;translate:0 10px;filter:blur(4px)}to{opacity:1;translate:0 0;filter:blur(0)}}@keyframes yt-silver-shift{0%,100%{background-position:0% center}50%{background-position:100% center}}@keyframes yt-button-ripple{to{transform:translate(-50%,-50%) scale(18);opacity:0}}
.wrap[data-motion-paused="true"] *, .wrap[data-motion-paused="true"]::before,.wrap[data-motion-paused="true"]::after{animation-play-state:paused!important}
@media(max-width:850px){.wrap.home-wrap{margin:17px 10px 40px;padding:19px;border-radius:20px}.hero{padding:6px 2px 18px}.grid,.skeletonGrid{grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:14px}.card.video-card{border-radius:16px}.body{padding:14px}}
@media(max-width:480px){.wrap.home-wrap{margin:12px 6px 30px;padding:15px;border-radius:17px}.grid,.skeletonGrid{grid-template-columns:minmax(0,1fr);gap:13px}.title{font-size:29px}.toolbar{align-items:flex-start;flex-direction:column}.statusNoticeDetails{padding-left:16px}}
@media(prefers-reduced-motion:reduce){.hero,.hero>*,.card.video-card,.thumb,.watchOverlay,.channel,.input,.titleAccent,.skeleton-thumb,.skeleton-line,.button.magneticButton{animation:none!important;transition:none!important}.hero,.card.video-card,.button.magneticButton{transform:none!important;translate:none!important}.card.video-card{--tilt-x:0deg!important;--tilt-y:0deg!important}.wrap.home-wrap::before{opacity:.35;animation:none}}
`;

function makeHomeCard(video, offline = false) {
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
  const metadata = [video.channelName, formatViews(video.viewCount)].filter(Boolean).join(" · ");
  if (metadata) body.append(element("p", { className: "meta", text: metadata }));
  if (video.reason) body.append(element("p", { className: "reason", text: video.reason }));
  card.append(thumbLink, body);
  return card;
}

export function createHomeUI({ mode, interest = "", onSearch = () => {}, onRefresh = () => {}, onLoadMore = () => {}, onUseOriginal = () => {} }) {
  const pair = createHost(SELECTORS.homeHost, SELECTORS.homeHost);
  if (!pair) return null;
  const { host, shadow } = pair;
  addStyle(shadow, componentCss() + HOME_CSS);
  const wrap = element("section", { className: "wrap home-wrap", attributes: { "aria-label": "YourTube home" } });
  const hero = element("div", { className: "hero" });
  hero.append(element("p", { className: "eyebrow", text: mode === "learn" ? "LEARN MODE" : mode === "interest" ? "YOUR INTEREST" : "CURATED FOR CURIOSITY" }));
  const heading = element("h2", { className: "title" });
  if (mode === "curiosity") {
    heading.append(document.createTextNode("A little more "));
    heading.append(element("span", { className: "titleAccent", text: "signal" }));
    heading.append(document.createTextNode(" in your browsing."));
  } else heading.textContent = mode === "learn" ? "What do you want to learn?" : mode === "interest" ? interest : "Explore something new.";
  hero.append(heading);
  hero.append(element("p", { className: "intro", text: mode === "learn" ? "Search a topic to get a thoughtful path through useful videos." : mode === "interest" ? "Your feed follows the interest you chose. Change it any time with the YourTube control." : "Explore useful ideas from broad topics and educational channels." }));
  if (mode === "learn") {
    const form = element("form", { className: "search" });
    const input = element("input", { className: "input", type: "search", attributes: { placeholder: "e.g. how backpropagation works", "aria-label": "What do you want to learn?", maxlength: CONFIG.Pipeline.queryMaxChars } });
    const submit = element("button", { className: "button primary", text: "Find a learning path", type: "submit" });
    form.append(input, submit);
    form.addEventListener("submit", event => { event.preventDefault(); onSearch(input.value.trim()); });
    hero.append(form);
  } else {
    const toolbar = element("div", { className: "toolbar" });
    toolbar.append(button("Refresh feed", "button primary magneticButton", onRefresh));
    hero.append(toolbar);
  }

  const status = element("div", { className: "status", attributes: { "aria-live": "polite" } });
  let displayedVideos = [];
  let loadingMore = false;
  let motionCleanups = [];
  const clearVideoMotion = () => { for (const cleanup of motionCleanups) cleanup(); motionCleanups = []; };
  const loadMoreButton = button("Load more videos", "button", onLoadMore);
  loadMoreButton.hidden = true;
  const updateLoadMore = () => {
    const remaining = Math.max(0, CONFIG.Pipeline.maxVideosShown - displayedVideos.length);
    const nextCount = Math.min(CONFIG.Pipeline.feedBatchSize, remaining);
    loadMoreButton.hidden = mode === "learn" || displayedVideos.length === 0 || remaining === 0;
    loadMoreButton.disabled = loadingMore;
    loadMoreButton.textContent = loadingMore ? "Preparing next batch…" : `Find up to ${nextCount} more videos`;
  };
  wrap.append(hero, status);
  shadow.append(wrap);
  const parent = queryFirst(["ytd-browse[page-subtype='home'] #primary", "ytd-browse #primary", "ytd-app #content"], document) || document.body || document.documentElement;
  parent.append(host);
  const surfaceCleanup = enhanceSurfaceMotion(wrap);

  const renderSkeleton = (message = "Preparing your feed…") => {
    clearVideoMotion();
    displayedVideos = []; loadingMore = false; status.className = ""; status.replaceChildren(); updateLoadMore();
    const progress = element("p", { className: "progressLabel", text: message });
    const grid = element("div", { className: "skeletonGrid" });
    for (let i = 0; i < CONFIG.UI.skeletonCardCount; i++) grid.append(createVideoSkeleton());
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
      const error = element("div", { className: "status error" });
      error.append(createStatusNotice(message, { title: "Couldn't load the next batch", hint: "Open for details", kind: "error" }));
      error.append(button("Try loading more", "button primary", onLoadMore));
      status.append(error);
      return;
    }
    clearVideoMotion();
    displayedVideos = [];
    status.className = "status error"; status.replaceChildren();
    status.append(createStatusNotice(message, { title: "Curiosity feed couldn't load", hint: "Open for error details", kind: "error" }));
    const actions = element("div", { className: "noticeActions" });
    actions.append(button("Try again", "button primary magneticButton", onRefresh));
    actions.append(button("Switch to Relax and show YouTube", "button", onUseOriginal));
    status.append(actions);
  };
  const renderResults = (result, { append = false } = {}) => {
    clearVideoMotion();
    const seen = new Set(append ? displayedVideos.map(video => String(video.id)) : []);
    displayedVideos = append ? [...displayedVideos] : [];
    for (const video of (result.videos || [])) {
      if (displayedVideos.length >= CONFIG.Pipeline.maxVideosShown) break;
      if (video?.id && !seen.has(String(video.id))) { displayedVideos.push(video); seen.add(String(video.id)); }
    }
    loadingMore = false;
    status.className = ""; status.replaceChildren();
    if (result.metadata?.fallbackLabel) status.append(createStatusNotice(result.metadata.fallbackLabel));
    if (mode === "interest" && result.channels?.length) {
      const section = element("section", { className: "section" });
      section.append(element("h3", { className: "sectionTitle", text: "Channels to explore" }));
      const row = element("div", { className: "channels" });
      for (const channel of result.channels) {
        const link = element("a", { className: "channel", href: `https://www.youtube.com/results?search_query=${encodeURIComponent(channel.name)}` });
        link.append(element("strong", { text: channel.name }), element("span", { text: channel.reason || "Suggested for your interest." }));
        row.append(link);
      }
      section.append(row); status.append(section);
    }
    const section = element("section", { className: "section" });
    const heading = element("div", { className: "toolbar" });
    heading.append(element("h3", { className: "sectionTitle", text: mode === "interest" ? "Videos for your interest" : "Videos to explore" }));
    section.append(heading);
    let videoGrid = null;
    if (!displayedVideos.length) section.append(element("div", { className: "empty", text: "No videos were found yet. Try refreshing or adjusting your interest." }));
    else {
      videoGrid = element("div", { className: "grid" });
      displayedVideos.forEach(video => videoGrid.append(makeHomeCard(video, result.metadata?.providers?.includes("mock"))));
      section.append(videoGrid);
    }
    status.append(section);
    if (videoGrid) motionCleanups.push(enhanceVideoGridMotion(videoGrid));
    updateLoadMore();
    if (!loadMoreButton.hidden) status.append(loadMoreButton);
  };
  const setLoadingMore = value => { loadingMore = Boolean(value); updateLoadMore(); };
  return { host, renderSkeleton, setProgress, renderError, renderResults, setLoadingMore, getVideoIds: () => displayedVideos.map(video => String(video.id)), isLoadingMore: () => loadingMore, dispose: () => { clearVideoMotion(); surfaceCleanup(); safeRemove(host); } };
}
