import { CONFIG } from "../config.js";
import { createHost, addStyle, element, button, componentCss, safeRemove } from "./ui-kit.js";

const NAMES = { learn: "Learn", relax: "Relax" };
const ICONS = { learn: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Zm0 0V21m4-13h8m-8 4h8", relax: "M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6Zm9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" };
const CSS = `:host{position:fixed;inset:0;z-index:2147483647}.backdrop{position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:rgba(8,10,12,.9)}.dialog{width:min(680px,100%);padding:clamp(22px,5vw,44px);background:#111817;color:#f4f7f5;border:1px solid #34413b;border-radius:24px;box-shadow:0 28px 90px #000b}.brand{margin:0 0 12px;font-size:12px;color:#a9e66e;font-weight:800;letter-spacing:.14em}.title{margin:0;font-size:clamp(26px,4vw,38px);letter-spacing:-.035em}.intro{margin:12px 0 26px;color:#a6b1ad}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mode{min-height:130px;text-align:left;padding:18px;border-radius:17px;background:#191e21;color:#f4f7f5;border:1px solid #343a3e;cursor:pointer}.mode:hover{border-color:#a9e66e}.mode.selected{border-color:#a9e66e;box-shadow:inset 3px 0 #a9e66e}.mode svg{width:22px;height:22px;margin-bottom:12px;color:#a9e66e}.mode strong,.mode span{display:block}.mode strong{font-size:18px}.mode span{margin-top:7px;color:#a6b1ad;font-size:14px}.footer{margin:18px 0 0;color:#89938f;font-size:12px}@media(max-width:520px){.cards{grid-template-columns:1fr}.mode{min-height:auto}}`;
function icon(mode) { const svg=document.createElementNS("http://www.w3.org/2000/svg","svg"); svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.7");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");const path=document.createElementNS("http://www.w3.org/2000/svg","path");path.setAttribute("d",ICONS[mode]);svg.append(path);return svg; }
export function openModePicker({ currentMode = "learn", required = false, onSelect, onClose } = {}) {
  const pair = createHost("focustube-picker-host", "focustube-picker-host"); if (!pair) return null;
  const { host, shadow } = pair; addStyle(shadow, componentCss() + CSS);
  const backdrop = element("div", { className: "backdrop" });
  const dialog = element("section", { className: "dialog", attributes: { role: "dialog", "aria-modal": "true", "aria-labelledby": "focustube-picker-title" } });
  dialog.append(element("p", { className: "brand", text: "FOCUSTUBE" }), element("h1", { className: "title", text: "What are you here for today?", attributes: { id: "focustube-picker-title" } }), element("p", { className: "intro", text: "Choose how you want YouTube to work for this session." }));
  const cards = element("div", { className: "cards" });
  for (const mode of ["learn", "relax"]) {
    const card = button("", "mode"); if (mode === currentMode) card.classList.add("selected");
    const desc = CONFIG.UI.modeDescriptions[mode]; card.append(icon(mode), element("strong", { text: NAMES[mode] }), element("span", { text: desc }));
    card.setAttribute("aria-label", `${NAMES[mode]}: ${desc}`); card.addEventListener("click", () => finish(mode)); cards.append(card);
  }
  dialog.append(cards, element("p", { className: "footer", text: "Switch modes any time from the FocusTube popup." }));
  const finish = mode => { safeRemove(host); try { sessionStorage.setItem("focustube.pickerSeen", "1"); } catch {} onSelect?.(mode); };
  shadow.addEventListener("keydown", event => { if (event.key === "Escape" && !required) onClose?.(); });
  backdrop.addEventListener("click", event => { if (event.target === backdrop && !required) onClose?.(); });
  backdrop.append(dialog); shadow.append(backdrop); (document.documentElement || document.body).append(host);
  queueMicrotask(() => cards.querySelector("button")?.focus());
  return { host, close: () => safeRemove(host) };
}
