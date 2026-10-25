import { CONFIG } from "../config.js";
import { createHost, addStyle, element, button, componentCss, safeRemove } from "./ui-kit.js";
import { renderLearnAssistant } from "./learn-assistant.js";

const STARTUP_INTRO_CSS = `
.startup-intro{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;overflow:hidden;background:#000;animation:introFadeIn .3s ease-out both}
.startup-intro-loader{position:relative;display:grid;place-items:center;width:clamp(112px,12vw,158px);aspect-ratio:1;border:1px solid #8b6b3b32;border-radius:50%;background:#030303;box-shadow:0 0 35px #ad803515;isolation:isolate}
.startup-intro-loader:before,.startup-intro-loader:after{content:"";position:absolute;inset:-7px;border:1px solid transparent;border-top-color:#c49a5b9c;border-right-color:#b58b523e;border-radius:50%;animation:introSpin 2.2s linear infinite;pointer-events:none}
.startup-intro-loader:after{inset:5px;border-top-color:transparent;border-bottom-color:#8e6c3a70;border-left-color:#8e6c3a45;animation-duration:3.4s;animation-direction:reverse}
.startup-intro-video{display:block;width:82%;height:auto;aspect-ratio:974 / 548;object-fit:contain;border:0;border-radius:4px;background:#000;box-shadow:0 0 24px #c0933d0c}
@keyframes introSpin{to{transform:rotate(360deg)}}@keyframes introFadeIn{from{opacity:0}to{opacity:1}}
@media(max-width:560px){.startup-intro-loader{width:112px}}
@media(prefers-reduced-motion:reduce){.startup-intro,.startup-intro-loader:before,.startup-intro-loader:after{animation-duration:.01ms!important;animation-iteration-count:1!important}}
`;

function extensionAsset(path) {
  try { return globalThis.chrome?.runtime?.getURL?.(path) || path; }
  catch { return path; }
}
function renderStartupIntro(shadow, onComplete) {
  shadow.replaceChildren();
  addStyle(shadow, componentCss() + STARTUP_INTRO_CSS);
  const scene = element("main", { className: "startup-intro", attributes: { "aria-label": "FocusTube loading" } });
  const loader = element("div", { className: "startup-intro-loader", attributes: { "aria-hidden": "true" } });
  const video = element("video", { className: "startup-intro-video", attributes: { "aria-hidden": "true", playsinline: "", preload: "auto", disablepictureinpicture: "" } });
  video.src = extensionAsset("assets/focustube-site-intro.mp4");
  video.autoplay = true;
  video.muted = true; // Muted playback is permitted by Chrome's autoplay policy.
  video.playsInline = true;
  video.preload = "auto";
  loader.append(video);
  scene.append(loader);
  shadow.append(scene);

  let finished = false;
  let watchdog = 0;
  let fallback = 0;
  const cleanup = () => {
    window.clearTimeout(watchdog); window.clearTimeout(fallback);
    try { video.pause(); video.removeAttribute("src"); video.load(); } catch { /* Resource cleanup is best effort. */ }
  };
  const finish = () => {
    if (finished) return;
    finished = true; cleanup(); onComplete?.();
  };
  video.addEventListener("ended", finish, { once: true });
  video.addEventListener("error", () => { fallback = window.setTimeout(finish, 250); }, { once: true });
  const reducedMotion = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  if (reducedMotion) fallback = window.setTimeout(finish, 250);
  else {
    watchdog = window.setTimeout(finish, 7500);
    try { const promise = video.play(); promise?.catch?.(() => { fallback = window.setTimeout(finish, 1400); }); }
    catch { fallback = window.setTimeout(finish, 1400); }
  }
  return () => { if (!finished) finished = true; cleanup(); };
}

const MODE_NAMES = { learn: "Learn", curiosity: "Curiosity", relax: "Relax" };
const MODE_KEYS = ["learn", "curiosity", "relax"];
const MODAL_CSS = `
:host{position:fixed;inset:0;z-index:2147483647;display:block;color:#f2f2f2;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.backdrop{position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:rgba(5,6,7,.78);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);perspective:1200px;overflow:auto}
.dialog{width:min(760px,100%);max-height:calc(100vh - 48px);overflow:auto;padding:clamp(22px,5vw,42px);background:linear-gradient(145deg,rgba(28,29,31,.94),rgba(13,14,15,.96));border:1px solid rgba(255,255,255,.12);border-radius:24px;box-shadow:0 28px 90px #000b,inset 0 1px 0 rgba(255,255,255,.045);transform:translateY(0);animation:dialogArrive .55s cubic-bezier(.2,.8,.2,1) both;position:relative}
.dialog:before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;background:radial-gradient(ellipse at 12% 0%,rgba(255,255,255,.055),transparent 44%)}
.brand{position:relative;margin:0 0 13px;font-size:24px;font-weight:850;letter-spacing:-.065em;color:#f4f4f4}.brand .brand-red{color:#ed343b}
.title{position:relative;margin:0;color:#f4f4f4;font-size:clamp(26px,4vw,37px);letter-spacing:-.04em;line-height:1.15}.intro{position:relative;margin:12px 0 26px;color:#a5a6a8;font-size:16px}
.cards{position:relative;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;perspective:1000px}
.mode{--mx:0;--my:0;--lift:0px;position:relative;isolation:isolate;overflow:hidden;min-height:142px;text-align:left;padding:19px;border-radius:18px;background:linear-gradient(145deg,rgba(39,40,42,.88),rgba(24,25,27,.94));border:1px solid rgba(255,255,255,.105);color:#f3f3f3;box-shadow:0 8px 24px rgba(0,0,0,.16),inset 0 1px 0 rgba(255,255,255,.035);transform:perspective(850px) rotateX(var(--tilt-y,0deg)) rotateY(var(--tilt-x,0deg)) translate3d(0,var(--lift),0);transform-style:preserve-3d;transition:transform .18s ease-out,border-color .22s ease,background .22s ease,box-shadow .22s ease;will-change:transform;cursor:pointer}
.mode:before{content:"";position:absolute;inset:-1px;z-index:-1;opacity:0;background:radial-gradient(circle at var(--spot-x,50%) var(--spot-y,50%),rgba(255,255,255,.17),transparent 48%);transition:opacity .2s ease}
.mode:after{content:"";position:absolute;left:-40%;top:0;width:35%;height:100%;opacity:0;transform:skewX(-18deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.07),transparent);pointer-events:none}
.mode:hover,.mode:focus-visible{--lift:-5px;border-color:rgba(225,228,232,.62);background:linear-gradient(145deg,rgba(54,55,57,.96),rgba(27,28,30,.98));box-shadow:0 18px 36px rgba(0,0,0,.32),0 0 0 1px rgba(255,255,255,.04),inset 0 1px 0 rgba(255,255,255,.13);outline:none}
.mode:hover:before,.mode:focus-visible:before{opacity:1}.mode:hover:after{opacity:1;animation:cardSheen .8s ease-out both}.mode.selected{border-color:rgba(235,236,238,.64);box-shadow:inset 3px 0 rgba(255,255,255,.75),0 0 28px rgba(255,255,255,.045)}
.mode svg{display:block;width:23px;height:23px;margin-bottom:17px;color:#d6d6d7;transition:transform .22s ease,color .22s ease}.mode:hover svg{transform:translateZ(18px) scale(1.09);color:#fff}.mode strong{display:block;font-size:18px;color:#f4f4f4;letter-spacing:-.02em;transform:translateZ(12px)}.mode span{display:block;margin-top:7px;color:#b2b3b5;font-size:14px;font-weight:450;line-height:1.45;max-width:29ch;transform:translateZ(8px)}
.mode .mode-arrow{position:absolute;right:17px;bottom:17px;width:32px;height:32px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.1);border-radius:50%;background:rgba(255,255,255,.055);color:#dedede;opacity:.72;transform:translate3d(0,0,10px);transition:transform .22s ease,opacity .22s ease,background .22s ease}.mode:hover .mode-arrow{transform:translate3d(3px,-2px,18px);opacity:1;background:rgba(255,255,255,.13)}
.footer{position:relative;margin:20px 0 0;padding-top:17px;border-top:1px solid rgba(255,255,255,.09);color:#999b9d;font-size:12px}
.form{display:grid;gap:14px;margin-top:24px}.label{font-weight:700;color:#d8d8d9}.interest{width:100%;padding:13px 14px;border:1px solid #55575a;border-radius:12px;background:#171819;color:#f2f2f2}.actions{display:flex;gap:10px;flex-wrap:wrap}.hint{min-height:18px;color:#c1a5a5;font-size:13px}
@keyframes dialogArrive{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes cardSheen{0%{left:-40%}100%{left:120%}}
@media(max-width:520px){.cards{grid-template-columns:1fr}.mode{min-height:118px}.backdrop{padding:12px}.dialog{max-height:calc(100vh - 24px);padding:22px}}
@media(prefers-reduced-motion:reduce){.dialog,.mode,.mode:before,.mode:after,.mode svg,.mode .mode-arrow{animation:none!important;transition:none!important;transform:none!important}}
`;
const ICON_PATH = { learn:"M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Zm0 0V21m4-13h8m-8 4h8", curiosity:"M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm-2.2 6.1a1.3 1.3 0 1 1 1.3-1.3m-.2 9.5v-1.8c0-1.4 2.1-1.7 2.1-3.5a2.2 2.2 0 0 0-4.4 0", relax:"M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6Zm9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" };
function iconFor(mode) { const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.7");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");svg.setAttribute("aria-hidden","true");const path=document.createElementNS("http://www.w3.org/2000/svg","path");path.setAttribute("d",ICON_PATH[mode]);svg.append(path);return svg; }

export function openModePicker({ currentMode = "learn", interestText = "", required = false, showIntro = false, onSelect, onClose } = {}) {
  const pair = createHost("focustube-picker-host", "focustube-picker-host");
  if (!pair) return null;
  const { host, shadow } = pair;
  let activeCleanup = null;
  let closed = false;
  const cleanupActiveView = () => { try { activeCleanup?.(); } catch { /* The picker must still be removable. */ } activeCleanup = null; };
  const closeHost = (notify = false) => {
    if (closed) return;
    closed = true;
    cleanupActiveView();
    safeRemove(host);
    if (notify) onClose?.();
  };
  const finish = (mode, interest, learnQuery = "") => {
    if (closed) return;
    cleanupActiveView();
    closed = true;
    safeRemove(host);
    try { sessionStorage.setItem("focustube.pickerSeen", "1"); } catch { /* Storage is an optimization. */ }
    onSelect?.(mode, interest, learnQuery);
  };
  const renderChoices = () => {
    cleanupActiveView();
    shadow.replaceChildren();
    addStyle(shadow, componentCss() + MODAL_CSS);
    const backdrop = element("div", { className: "backdrop" });
    const dialog = element("section", { className: "dialog", attributes: { role: "dialog", "aria-modal": "true", "aria-labelledby": "focustube-picker-title" } });
    const brand = element("p", { className: "brand" });
    brand.append(element("span", { text: "Your" }), element("span", { className: "brand-red", text: "Tube" }));
    dialog.append(brand);
    dialog.append(element("h1", { className: "title", text: "What are you here for today?", attributes: { id: "focustube-picker-title" } }));
    dialog.append(element("p", { className: "intro", text: "Choose how you want YouTube to work for this session." }));
    const cards = element("div", { className: "cards" });
    for (const mode of MODE_KEYS) {
      const card = button("", "mode");
      if (mode === currentMode) card.classList.add("selected");
      card.append(iconFor(mode));
      card.append(element("strong", { text: MODE_NAMES[mode] }));
      card.append(element("span", { text: CONFIG.UI.modeDescriptions[mode] }));
      const arrow = element("span", { className: "mode-arrow", text: "↗", attributes: { "aria-hidden": "true" } });
      card.append(arrow);
      // Cursor-reactive tilt is intentionally subtle and resets when the pointer leaves.
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
        card.addEventListener("pointermove", event => {
          if (event.pointerType === "touch") return;
          const rect = card.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width;
          const y = (event.clientY - rect.top) / rect.height;
          card.style.setProperty("--tilt-x", `${((x - .5) * 7).toFixed(2)}deg`);
          card.style.setProperty("--tilt-y", `${((.5 - y) * 7).toFixed(2)}deg`);
          card.style.setProperty("--spot-x", `${(x * 100).toFixed(1)}%`);
          card.style.setProperty("--spot-y", `${(y * 100).toFixed(1)}%`);
        });
        card.addEventListener("pointerleave", () => {
          card.style.setProperty("--tilt-x", "0deg");
          card.style.setProperty("--tilt-y", "0deg");
          card.style.setProperty("--lift", "0px");
        });
      }
      card.setAttribute("aria-label", `${MODE_NAMES[mode]}: ${CONFIG.UI.modeDescriptions[mode]}`);
      card.addEventListener("click", () => {
        if (mode === "learn") {
          // Open the minimal JARVIS chat immediately; the supplied greeting starts
          // in the same click path to avoid losing browser audio user activation.
          let welcomeAudio = null;
          try {
            welcomeAudio = new Audio(extensionAsset("assets/jarvis-welcome.mp3"));
            welcomeAudio.preload = "auto";
            welcomeAudio.load();
          } catch { /* The assistant falls back to browser speech if audio is unavailable. */ }
          activeCleanup = renderLearnAssistant(shadow, {
            onSubmit: query => finish("learn", interestText, query),
            autoSpeak: true,
            welcomeAudio
          });
        } else finish(mode, interestText);
      });
      cards.append(card);
    }
    dialog.append(cards, element("p", { className: "footer", text: "Switch modes any time from the YourTube popup." }));
    backdrop.append(dialog);
    backdrop.addEventListener("click", event => { if (event.target === backdrop && !required) closeHost(true); });
    shadow.append(backdrop);
    queueMicrotask(() => cards.querySelector("button")?.focus());
  };
  const onKeyDown = event => {
    if (event.key === "Escape") { event.preventDefault(); if (!required) closeHost(true); return; }
    if (event.key !== "Tab") return;
    const focusable = [...shadow.querySelectorAll("button,input")].filter(node => !node.disabled);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  shadow.addEventListener("keydown", onKeyDown);
  (document.documentElement || document.body).append(host);
  if (showIntro) {
    activeCleanup = renderStartupIntro(shadow, () => { activeCleanup = null; if (!closed) renderChoices(); });
  } else renderChoices();
  return { host, close: () => closeHost(false) };
}
