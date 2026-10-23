import { CONFIG } from "../config.js";
import { SELECTORS, queryFirst } from "../selectors.js";
import { createHost, addStyle, element, button, componentCss, formatViews, formatDuration, safeRemove } from "./ui-kit.js";

const HOME_CSS = `.wrap{max-width:1120px;margin:28px auto 60px;padding:24px;background:#f8faf8;border:1px solid #e1e8e2;border-radius:22px;box-shadow:0 10px 35px #193a2810}.hero{max-width:670px;padding:20px 8px 27px}.title{margin:7px 0 11px;font-size:clamp(25px,4vw,38px);letter-spacing:-.035em;line-height:1.18;color:#183a2c}.intro{margin:0 0 19px;color:#65746c}.search{display:flex;gap:9px;flex-wrap:wrap}.input{flex:1;min-width:220px;padding:13px 14px;border:1px solid #cad8cf;border-radius:12px;background:#fff;color:#1d3027}.section{margin-top:28px}.sectionTitle{margin:0 0 13px;font-size:19px;color:#244335}.channels{display:flex;gap:10px;flex-wrap:wrap}.channel{display:block;max-width:340px;padding:14px 16px;background:#fff;border:1px solid #e1e8e2;border-radius:14px;color:#1e3329;text-decoration:none}.channel:hover{border-color:#9db7aa;background:#f2f7f3}.channel strong{display:block}.channel span{display:block;margin-top:5px;color:#68766f;font-size:13px}.card{overflow:hidden;border:1px solid #e0e7e1;border-radius:16px;background:#fff}.thumbLink{display:block;aspect-ratio:16/9;background:#edf2ed;position:relative}.thumb{width:100%;height:100%;object-fit:cover}.thumbnailPlaceholder{width:100%;height:100%;display:grid;place-items:center;background:radial-gradient(ellipse at 20% 20%,#c6dfd0,#edf2ed 65%);color:#476754;font-size:12px;font-weight:750;letter-spacing:.08em}.duration{position:absolute;right:8px;bottom:8px;padding:2px 6px;background:#14241edb;border-radius:5px;color:#fff;font-size:12px}.body{padding:13px 14px}.videoTitle{color:#1c3128;text-decoration:none;font-weight:750}.meta{margin:7px 0 0;color:#6b7771;font-size:12px}.reason{margin:9px 0 0;color:#3b4f45;font-size:13px}.skeletonGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.skeleton{height:260px}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px}.empty{padding:18px;background:white;border-radius:12px;color:#66746c}`;
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
export function createHomeUI({ mode, interest = "", onSearch = () => {}, onRefresh = () => {}, onUseOriginal = () => {} }) {
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
  wrap.append(hero, status); shadow.append(wrap);
  const parent = queryFirst(["ytd-browse[page-subtype='home'] #primary", "ytd-browse #primary", "ytd-app #content"], document) || document.body || document.documentElement;
  parent.append(host);
  const renderSkeleton = () => { status.className = ""; status.replaceChildren(); const grid = element("div", { className: "skeletonGrid" }); for (let i=0;i<CONFIG.UI.skeletonCardCount;i++) grid.append(element("div", { className: "skeleton" })); status.append(grid); };
  const renderError = message => { status.className = "status error"; status.textContent = message; const retry = button("Try again", "button primary", onRefresh); const original = button("Switch to Relax and show YouTube", "button", onUseOriginal); status.append(document.createTextNode(" "), retry, document.createTextNode(" "), original); };
  const renderResults = result => {
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
    if (!result.videos?.length) section.append(element("div", { className: "empty", text: "No videos were found yet. Try refreshing or adjusting your interest." }));
    else { const grid = element("div", { className: "grid" }); for (const video of result.videos) grid.append(makeHomeCard(video, result.metadata?.providers?.includes("mock"))); section.append(grid); }
    status.append(section);
  };
  return { host, renderSkeleton, renderError, renderResults, dispose: () => safeRemove(host) };
}
