import { CONFIG } from "../config.js";
import { createHost, addStyle, element, button, componentCss, safeRemove } from "./ui-kit.js";

const MODE_NAMES = { learn: "Learn", interest: "Interest", curiosity: "Curiosity", relax: "Relax" };
const MODE_KEYS = ["learn", "interest", "curiosity", "relax"];
const MODAL_CSS = `:host{position:fixed;inset:0;z-index:2147483647;display:block}.backdrop{position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:#10251fcc;backdrop-filter:blur(8px)}.dialog{width:min(760px,100%);max-height:calc(100vh - 48px);overflow:auto;padding:clamp(22px,5vw,46px);background:#f9fbf8;border:1px solid #dbe5dd;border-radius:24px;box-shadow:0 28px 90px #081b1670}.brand{margin:0 0 12px;font-size:12px;color:#547267;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.title{margin:0;color:#183a2c;font-size:clamp(26px,4vw,38px);letter-spacing:-.035em;line-height:1.15}.intro{margin:12px 0 26px;color:#60716a;font-size:16px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mode{min-height:126px;text-align:left;padding:18px;border-radius:17px;background:#fff;border:1px solid #dce6df}.mode:hover{background:#f0f7f2;border-color:#94b7a5}.mode strong{display:block;font-size:18px;color:#183a2c}.mode span{display:block;margin-top:7px;color:#66736d;font-size:14px;font-weight:450}.footer{margin:18px 0 0;color:#79867f;font-size:12px}.form{display:grid;gap:14px;margin-top:24px}.label{font-weight:700;color:#294439}.interest{width:100%;padding:13px 14px;border:1px solid #cbd8d0;border-radius:12px;background:#fff;color:#1c3028}.actions{display:flex;gap:10px;flex-wrap:wrap}.hint{min-height:18px;color:#9c4b3c;font-size:13px}@media(max-width:520px){.cards{grid-template-columns:1fr}.mode{min-height:auto}}`;

export function openModePicker({ currentMode = "learn", interestText = "", onSelect, onClose } = {}) {
  const pair = createHost("focustube-picker-host", "focustube-picker-host");
  if (!pair) return null;
  const { host, shadow } = pair;
  addStyle(shadow, componentCss() + MODAL_CSS);
  const backdrop = element("div", { className: "backdrop" });
  const dialog = element("section", { className: "dialog", attributes: { role: "dialog", "aria-modal": "true", "aria-labelledby": "focustube-picker-title" } });
  const renderChoices = () => {
    dialog.replaceChildren();
    dialog.append(element("p", { className: "brand", text: "FOCUSTUBE" }));
    dialog.append(element("h1", { className: "title", text: "What are you here for today?", attributes: { id: "focustube-picker-title" } }));
    dialog.append(element("p", { className: "intro", text: "Choose how you want YouTube to work for this session." }));
    const cards = element("div", { className: "cards" });
    for (const mode of MODE_KEYS) {
      const card = button("", "mode");
      const heading = element("strong", { text: MODE_NAMES[mode] });
      const description = element("span", { text: CONFIG.UI.modeDescriptions[mode] });
      card.setAttribute("aria-label", `${MODE_NAMES[mode]}: ${CONFIG.UI.modeDescriptions[mode]}`);
      card.append(heading, description);
      card.addEventListener("click", () => mode === "interest" ? renderInterest() : finish(mode, interestText));
      cards.append(card);
    }
    dialog.append(cards, element("p", { className: "footer", text: "Switch modes any time from the FocusTube control." }));
    queueMicrotask(() => cards.querySelector("button")?.focus());
  };
  const renderInterest = () => {
    dialog.replaceChildren();
    dialog.append(element("p", { className: "brand", text: "FOCUSTUBE · INTEREST" }));
    dialog.append(element("h1", { className: "title", text: "What would you like to explore?", attributes: { id: "focustube-picker-title" } }));
    dialog.append(element("p", { className: "intro", text: "Your home feed and search will stay close to this interest." }));
    const form = element("form", { className: "form" });
    const label = element("label", { className: "label", text: "Your interest" });
    const input = element("input", { className: "interest", type: "text", attributes: { maxlength: CONFIG.ModesPicker.interestMaxChars, placeholder: "e.g. embedded systems and robotics", required: "true", autocomplete: "off" } });
    input.value = interestText;
    label.htmlFor = "focustube-interest-input"; input.id = label.htmlFor;
    const hint = element("div", { className: "hint", attributes: { "aria-live": "polite" } });
    const actions = element("div", { className: "actions" });
    const back = button("Back", "button", renderChoices);
    const submit = element("button", { className: "button primary", text: "Use this interest", type: "submit" });
    actions.append(back, submit); form.append(label, input, hint, actions);
    form.addEventListener("submit", event => {
      event.preventDefault();
      const value = input.value.trim();
      if (value.length < CONFIG.ModesPicker.interestMinChars) { hint.textContent = `Add at least ${CONFIG.ModesPicker.interestMinChars} characters.`; input.focus(); return; }
      finish("interest", value.slice(0, CONFIG.ModesPicker.interestMaxChars));
    });
    dialog.append(form);
    queueMicrotask(() => input.focus());
  };
  const finish = (mode, interest) => {
    safeRemove(host);
    try { sessionStorage.setItem("focustube.pickerSeen", "1"); } catch { /* Storage can be blocked. */ }
    onSelect?.(mode, interest);
  };
  const onKeyDown = event => {
    if (event.key === "Escape") { event.preventDefault(); finish(currentMode || "relax", interestText); onClose?.(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...shadow.querySelectorAll("button,input")].filter(node => !node.disabled);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  shadow.addEventListener("keydown", onKeyDown);
  backdrop.addEventListener("click", event => { if (event.target === backdrop) finish(currentMode || "relax", interestText); });
  backdrop.append(dialog); shadow.append(backdrop);
  (document.documentElement || document.body).append(host);
  renderChoices();
  return { host, close: () => safeRemove(host) };
}
