import { CONFIG } from "../config.js";
import { SELECTORS, queryFirst } from "../selectors.js";
import { createHost, addStyle, element, button, componentCss, safeRemove } from "./ui-kit.js";

const CSS = `.wrap{max-width:900px;margin:36px auto;padding:clamp(22px,5vw,48px);border:1px solid #ffffff20;border-radius:24px;background:#15181d;color:#f0f2f5}.eyebrow{color:#a9e66e;font-size:11px;font-weight:800;letter-spacing:.14em}.title{margin:8px 0;font-size:clamp(28px,5vw,42px);letter-spacing:-.04em}.intro{color:#a1a8b3}.form{display:flex;gap:10px;margin-top:22px}.input{flex:1;min-width:0;padding:14px;border:1px solid #ffffff28;border-radius:12px;background:#0d0f12;color:#fff}.status{margin-top:22px}.error{color:#ffd1c9}@media(max-width:560px){.wrap{margin:16px;padding:20px}.form{flex-direction:column}}`;
export function createHomeUI({ onSearch = () => {}, onUseOriginal = () => {} } = {}) {
  const pair = createHost(SELECTORS.homeHost, SELECTORS.homeHost); if (!pair) return null;
  const { host, shadow } = pair; addStyle(shadow, componentCss() + CSS);
  const wrap = element("section", { className: "wrap", attributes: { "aria-label": "FocusTube Learn home" } });
  wrap.append(element("p", { className: "eyebrow", text: "LEARN MODE" }), element("h2", { className: "title", text: "What do you want to learn?" }), element("p", { className: "intro", text: "Search a topic to see relevant videos, filtered locally and organized into a clear path." }));
  const form = element("form", { className: "form" });
  const input = element("input", { className: "input", type: "search", attributes: { placeholder: "e.g. how backpropagation works", "aria-label": "What do you want to learn?", maxlength: CONFIG.Pipeline.queryMaxChars } });
  const submit = button("Find videos", "button primary"); submit.type = "submit";
  form.append(input, submit); form.addEventListener("submit", event => { event.preventDefault(); onSearch(input.value.trim()); });
  wrap.append(form); shadow.append(wrap);
  (queryFirst(["ytd-browse[page-subtype='home'] #primary", "ytd-browse #primary", "ytd-app #content"], document) || document.body || document.documentElement).append(host);
  return { host, renderError(message) { const error = element("p", { className: "status error", text: message }); const relax = button("Switch to Relax and show YouTube", "button", onUseOriginal); wrap.append(error, relax); }, dispose: () => safeRemove(host) };
}
