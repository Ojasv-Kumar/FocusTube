import { CONFIG } from "../config.js";
import { createHost, addStyle, element, button, safeRemove } from "./ui-kit.js";

const MODE_NAMES = { learn: "Learn", curiosity: "Curiosity", relax: "Relax" };
const MODE_KEYS = ["learn", "curiosity", "relax"];
const MODAL_CSS = `
:host{position:fixed;inset:0;z-index:2147483647;display:block;color:#f4f4f4;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}*,*::before,*::after{box-sizing:border-box}button{font:inherit}
.backdrop{position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.96);backdrop-filter:blur(12px)}
.dialog{position:relative;width:min(800px,100%);max-height:calc(100vh - 48px);overflow:auto;padding:clamp(22px,5vw,48px);border:1px solid rgba(255,255,255,.12);border-radius:26px;background:radial-gradient(ellipse at 100% 0%,rgba(255,255,255,.08),transparent 44%),linear-gradient(145deg,rgba(32,32,32,.94),rgba(10,10,10,.98));box-shadow:0 35px 100px #000,0 0 45px #fff1;isolation:isolate}
.dialog::before{content:"";position:absolute;z-index:-1;inset:0;pointer-events:none;border-radius:inherit;background:radial-gradient(380px circle at var(--pointer-x,75%) var(--pointer-y,5%),rgba(255,255,255,.075),transparent 70%)}
.brand{display:flex;align-items:center;gap:0;width:max-content;margin:0 0 16px;font-size:15px;font-weight:900;letter-spacing:.025em}.brand-your{color:#fff}.brand-tube{margin-left:2px;padding:2px 6px;border-radius:5px;background:#f22;color:white}
.title{margin:0;color:#f7f7f7;font-size:clamp(28px,4.5vw,42px);letter-spacing:-.045em;line-height:1.08}.intro{margin:12px 0 27px;color:#aaa;font-size:15px;line-height:1.55}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;perspective:1000px}
.mode{position:relative;display:flex;min-height:178px;flex-direction:column;align-items:flex-start;overflow:hidden;text-align:left;padding:20px;border-radius:18px;border:1px solid rgba(255,255,255,.14);background:linear-gradient(145deg,rgba(39,39,39,.92),rgba(15,15,15,.96));color:#f2f2f2;transform:perspective(850px) rotateX(var(--tilt-x,0deg)) rotateY(var(--tilt-y,0deg)) translateY(var(--lift,0px));transition:transform .26s cubic-bezier(.2,.75,.25,1),border-color .25s,box-shadow .25s,background .25s;box-shadow:0 12px 28px #0008,inset 0 1px #fff1;cursor:pointer}
.mode::before{content:"";position:absolute;inset:-1px;pointer-events:none;opacity:0;background:radial-gradient(240px circle at var(--shine-x,50%) var(--shine-y,0%),rgba(255,255,255,.2),transparent 72%);transition:opacity .25s}.mode:hover,.mode:focus-visible{--lift:-5px;border-color:#bbb;background:linear-gradient(145deg,rgba(48,48,48,.98),rgba(17,17,17,.99));box-shadow:0 22px 44px #000b,0 0 18px #fff1,inset 0 1px #fff2}.mode:hover::before,.mode:focus-visible::before{opacity:1}.mode:focus-visible{outline:2px solid #f2f2f2;outline-offset:3px}.mode.selected{border-color:#b8ed82;box-shadow:inset 3px 0 #b8ed82,0 12px 28px #0008}
.mode svg{position:relative;display:block;width:25px;height:25px;margin:0 0 auto;color:#eee;transition:transform .25s,color .25s}.mode:hover svg{transform:translateY(-3px) scale(1.08);color:#fff}.mode strong{position:relative;display:block;margin-top:24px;font-size:19px;color:#f7f7f7}.mode span{position:relative;display:block;margin-top:7px;color:#aaa;font-size:13px;line-height:1.5;font-weight:450}.footer{margin:19px 0 0;color:#777;font-size:12px}.hint{min-height:18px;color:#ff726a;font-size:14px;font-weight:750;margin:12px 0 0;font-variant-numeric:tabular-nums}
.intro-screen{display:grid;min-height:min(66vh,560px);place-items:center;text-align:center}.intro-video{display:block;width:min(230px,55vw);aspect-ratio:16/9;object-fit:contain;border-radius:12px;background:#000;box-shadow:0 0 40px #fff1}.intro-caption{margin:19px 0 0;color:#ddd;font-size:12px;letter-spacing:.16em;text-transform:uppercase}.intro-skip{margin-top:15px;padding:8px 13px;border:1px solid #666;border-radius:10px;background:#181818;color:#eee;cursor:pointer}
@media(max-width:650px){.cards{grid-template-columns:1fr}.mode{min-height:115px}.mode strong{margin-top:14px}.mode svg{margin-bottom:0}}
@media(max-width:440px){.backdrop{padding:12px}.dialog{padding:22px 17px;border-radius:20px}.cards{gap:9px}.mode{padding:15px}}
@media(prefers-reduced-motion:reduce){.mode,.mode svg,.mode::before{transition:none!important;transform:none!important}.mode{--tilt-x:0deg!important;--tilt-y:0deg!important;--lift:0px!important}}
`;
const ICON_PATH = {
  learn: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Zm0 0V21m4-13h8m-8 4h8",
  curiosity: "M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm-2.2 6.1a1.3 1.3 0 1 1 1.3-1.3m-.2 9.5v-1.8c0-1.4 2.1-1.7 2.1-3.5a2.2 2.2 0 0 0-4.4 0",
  relax: "M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6Zm9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
};

function iconFor(mode) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7"); svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", ICON_PATH[mode]); svg.append(path);
  return svg;
}

function extensionAsset(path) {
  try { return globalThis.chrome?.runtime?.getURL?.(path) || path; } catch { return path; }
}

export function openModePicker({ currentMode = "learn", required = false, showIntro = false, onSelect, onClose } = {}) {
  const pair = createHost("focustube-picker-host", "focustube-picker-host");
  if (!pair) return null;
  const { host, shadow } = pair;
  addStyle(shadow, MODAL_CSS);
  const backdrop = element("div", { className: "backdrop" });
  const dialog = element("section", { className: "dialog", attributes: { role: "dialog", "aria-modal": "true", "aria-label": "YourTube mode picker" } });
  let lockTimer = 0, lockExpiresAt = 0, lockHint = null, introVideo = null, introTimer = 0, introFinished = false;
  const dismiss = () => { if (lockTimer) clearInterval(lockTimer); if (introTimer) clearTimeout(introTimer); introVideo?.pause(); safeRemove(host); };
  const formatRemaining = milliseconds => {
    const total = Math.max(0, Math.ceil(milliseconds / 1000));
    return `${String(Math.floor(total / 3600)).padStart(2, "0")}:${String(Math.floor(total % 3600 / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  const showLock = remainingMs => {
    lockExpiresAt = Date.now() + Math.max(0, Number(remainingMs) || 0);
    if (lockTimer) clearInterval(lockTimer);
    const update = () => {
      const left = lockExpiresAt - Date.now();
      if (left <= 0) { lockHint.textContent = "Learn mode timer complete. You can switch modes now."; clearInterval(lockTimer); lockTimer = 0; return; }
      lockHint.textContent = `${formatRemaining(left)} left to close Learn mode`;
    };
    lockHint.hidden = false; update(); lockTimer = setInterval(update, 1000);
  };
  const renderChoices = () => {
    if (introTimer) { clearTimeout(introTimer); introTimer = 0; }
    introVideo?.pause(); introVideo = null;
    dialog.replaceChildren();
    const brand = element("p", { className: "brand", attributes: { "aria-label": "YourTube" } });
    brand.append(element("span", { className: "brand-your", text: "Your" }), element("span", { className: "brand-tube", text: "Tube" }));
    dialog.append(brand);
    dialog.append(element("h1", { className: "title", text: "What are you here for today?", attributes: { id: "focustube-picker-title" } }));
    dialog.append(element("p", { className: "intro", text: "Choose how you want YouTube to work for this session." }));
    const cards = element("div", { className: "cards" });
    for (const mode of MODE_KEYS) {
      const card = button("", "mode");
      if (mode === currentMode) card.classList.add("selected");
      card.setAttribute("aria-pressed", String(mode === currentMode));
      card.append(iconFor(mode));
      card.append(element("strong", { text: MODE_NAMES[mode] }), element("span", { text: CONFIG.UI.modeDescriptions[mode] }));
      card.setAttribute("aria-label", `${MODE_NAMES[mode]}: ${CONFIG.UI.modeDescriptions[mode]}`);
      card.addEventListener("pointermove", event => {
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--tilt-x", `${((event.clientY - rect.top) / rect.height - .5) * -5}deg`);
        card.style.setProperty("--tilt-y", `${((event.clientX - rect.left) / rect.width - .5) * 6}deg`);
        card.style.setProperty("--shine-x", `${event.clientX - rect.left}px`);
        card.style.setProperty("--shine-y", `${event.clientY - rect.top}px`);
      });
      card.addEventListener("pointerleave", () => { card.style.removeProperty("--tilt-x"); card.style.removeProperty("--tilt-y"); card.style.removeProperty("--shine-x"); card.style.removeProperty("--shine-y"); });
      card.addEventListener("click", () => finish(mode));
      cards.append(card);
    }
    lockHint = element("p", { className: "hint", attributes: { hidden: "", "aria-live": "assertive" } });
    dialog.append(cards, lockHint, element("p", { className: "footer", text: "Switch modes any time from the YourTube control." }));
    queueMicrotask(() => cards.querySelector("button")?.focus());
  };
  const finishIntro = () => { if (introFinished) return; introFinished = true; renderChoices(); };
  const renderIntro = () => {
    dialog.replaceChildren();
    const screen = element("div", { className: "intro-screen", attributes: { "aria-label": "YourTube loading" } });
    introVideo = element("video", { className: "intro-video", attributes: { autoplay: "", muted: "", playsinline: "", preload: "auto", "aria-label": "YourTube intro" } });
    introVideo.src = extensionAsset("assets/focustube-site-intro.mp4");
    introVideo.autoplay = true; introVideo.muted = true; introVideo.playsInline = true;
    introVideo.addEventListener("ended", finishIntro, { once: true });
    introVideo.addEventListener("error", finishIntro, { once: true });
    screen.append(introVideo, element("p", { className: "intro-caption", text: "YourTube" }));
    const skip = button("Continue", "intro-skip", finishIntro); screen.append(skip);
    dialog.append(screen);
    try { const play = introVideo.play(); play?.catch?.(() => { introTimer = setTimeout(finishIntro, 1200); }); } catch { introTimer = setTimeout(finishIntro, 1200); }
  };
  const finish = async mode => {
    const result = await onSelect?.(mode);
    if (result?.ok === false) {
      if (result.errorCode === "LEARN_MODE_LOCKED") showLock(result.remainingMs);
      else { lockHint.hidden = false; lockHint.textContent = result.userMessage || "Could not change YourTube mode. Try again."; }
      return;
    }
    if (lockTimer) clearInterval(lockTimer);
    safeRemove(host);
    try { sessionStorage.setItem("focustube.pickerSeen", "1"); } catch { /* Storage can be blocked. */ }
  };
  const onKeyDown = event => {
    if (event.key === "Escape") { event.preventDefault(); if (!required) { dismiss(); onClose?.(); } return; }
    if (event.key !== "Tab") return;
    const focusable = [...shadow.querySelectorAll("button,input")].filter(node => !node.disabled && !node.hidden);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  shadow.addEventListener("keydown", onKeyDown);
  dialog.addEventListener("pointermove", event => {
    const rect = dialog.getBoundingClientRect();
    dialog.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
    dialog.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
  });
  backdrop.addEventListener("click", event => { if (event.target === backdrop && !required) { dismiss(); onClose?.(); } });
  backdrop.append(dialog); shadow.append(backdrop);
  (document.documentElement || document.body).append(host);
  if (showIntro && !matchMedia("(prefers-reduced-motion: reduce)").matches) renderIntro(); else renderChoices();
  return { host, close: dismiss };
}
