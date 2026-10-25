import { CONFIG } from "../config.js";
import { createHost, addStyle, element, button, componentCss, safeRemove } from "./ui-kit.js";

const MODE_NAMES = { learn: "Learn", curiosity: "Curiosity", relax: "Relax" };
const MODE_KEYS = ["learn", "curiosity", "relax"];
const MODAL_CSS = `:host{position:fixed;inset:0;z-index:2147483647;display:block}.backdrop{position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:rgba(8,10,12,.96)}.dialog{width:min(760px,100%);max-height:calc(100vh - 48px);overflow:auto;padding:clamp(22px,5vw,46px);background:#f9fbf8;border:1px solid #dbe5dd;border-radius:24px;box-shadow:0 28px 90px #000b}.brand{margin:0 0 12px;font-size:12px;color:#547267;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.title{margin:0;color:#183a2c;font-size:clamp(26px,4vw,38px);letter-spacing:-.035em;line-height:1.15}.intro{margin:12px 0 26px;color:#60716a;font-size:16px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mode{min-height:126px;text-align:left;padding:18px;border-radius:17px;background:#fff;border:1px solid #dce6df}.mode:hover{background:#f0f7f2;border-color:#94b7a5}.mode.selected{border-color:#a9e66e;box-shadow:inset 3px 0 #a9e66e}.mode svg{display:block;width:22px;height:22px;margin-bottom:12px;color:#a9e66e}.mode strong{display:block;font-size:18px;color:#183a2c}.mode span{display:block;margin-top:7px;color:#66736d;font-size:14px;font-weight:450}.footer{margin:18px 0 0;color:#79867f;font-size:12px}.hint{min-height:18px;color:#d42b2b;font-size:14px;font-weight:750;margin:12px 0 0;font-variant-numeric:tabular-nums}@media(max-width:520px){.cards{grid-template-columns:1fr}.mode{min-height:auto}}`;
const ICON_PATH = { learn:"M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Zm0 0V21m4-13h8m-8 4h8", curiosity:"M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm-2.2 6.1a1.3 1.3 0 1 1 1.3-1.3m-.2 9.5v-1.8c0-1.4 2.1-1.7 2.1-3.5a2.2 2.2 0 0 0-4.4 0", relax:"M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6Zm9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" };
function iconFor(mode) { const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.7");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");svg.setAttribute("aria-hidden","true");const path=document.createElementNS("http://www.w3.org/2000/svg","path");path.setAttribute("d",ICON_PATH[mode]);svg.append(path);return svg; }

export function openModePicker({ currentMode = "learn", required = false, onSelect, onClose } = {}) {
  const pair = createHost("focustube-picker-host", "focustube-picker-host");
  if (!pair) return null;
  const { host, shadow } = pair;
  addStyle(shadow, componentCss() + MODAL_CSS);
  const backdrop = element("div", { className: "backdrop" });
  const dialog = element("section", { className: "dialog", attributes: { role: "dialog", "aria-modal": "true", "aria-labelledby": "focustube-picker-title" } });
  let lockTimer = 0, lockExpiresAt = 0, lockHint = null;
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
    dialog.replaceChildren();
    dialog.append(element("p", { className: "brand", text: "FOCUSTUBE" }));
    dialog.append(element("h1", { className: "title", text: "What are you here for today?", attributes: { id: "focustube-picker-title" } }));
    dialog.append(element("p", { className: "intro", text: "Choose how you want YouTube to work for this session." }));
    const cards = element("div", { className: "cards" });
    for (const mode of MODE_KEYS) {
      const card = button("", "mode");
      if (mode === currentMode) card.classList.add("selected");
      card.append(iconFor(mode));
      const heading = element("strong", { text: MODE_NAMES[mode] });
      const description = element("span", { text: CONFIG.UI.modeDescriptions[mode] });
      card.setAttribute("aria-label", `${MODE_NAMES[mode]}: ${CONFIG.UI.modeDescriptions[mode]}`);
      card.append(heading, description);
      card.addEventListener("click", () => finish(mode));
      cards.append(card);
    }
    lockHint = element("p", { className: "hint", attributes: { hidden: "", "aria-live": "assertive" } });
    dialog.append(cards, lockHint, element("p", { className: "footer", text: "Switch modes any time from the FocusTube popup." }));
    queueMicrotask(() => cards.querySelector("button")?.focus());
  };
  const finish = async mode => {
    const result = await onSelect?.(mode);
    if (result?.ok === false) {
      if (result.errorCode === "LEARN_MODE_LOCKED") showLock(result.remainingMs);
      else { lockHint.hidden = false; lockHint.textContent = result.userMessage || "Could not change FocusTube mode. Try again."; }
      return;
    }
    if (lockTimer) clearInterval(lockTimer);
    safeRemove(host);
    try { sessionStorage.setItem("focustube.pickerSeen", "1"); } catch { /* Storage can be blocked. */ }
  };
  const onKeyDown = event => {
    if (event.key === "Escape") { event.preventDefault(); if (!required) onClose?.(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...shadow.querySelectorAll("button,input")].filter(node => !node.disabled);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  shadow.addEventListener("keydown", onKeyDown);
  backdrop.addEventListener("click", event => { if (event.target === backdrop && !required) onClose?.(); });
  backdrop.append(dialog); shadow.append(backdrop);
  (document.documentElement || document.body).append(host);
  renderChoices();
  return { host, close: () => { if (lockTimer) clearInterval(lockTimer); safeRemove(host); } };
}
