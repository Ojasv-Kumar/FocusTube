import { SELECTORS } from "../selectors.js";
import { createHost, addStyle, element, button, componentCss, safeRemove } from "./ui-kit.js";

const SWITCHER_CSS = `:host{position:fixed;right:18px;bottom:18px;z-index:2147483000}.control{display:flex;align-items:center;gap:9px;padding:8px 9px 8px 12px;background:#f8fbf8;border:1px solid #d8e3dc;border-radius:999px;box-shadow:0 5px 22px #0d261b26}.label{color:#263f33;font-size:12px;font-weight:700;white-space:nowrap}.switch{border:0;background:#174c3a;color:#fff;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:750}.switch:hover{background:#226249}.switch:focus-visible{outline:3px solid #7ab99b;outline-offset:2px}@media(max-width:520px){:host{right:10px;bottom:10px}.label{display:none}}`;
const LABEL = { learn: "Learn", relax: "Relax" };
export function createModeSwitcher(onOpen) {
  const pair = createHost(SELECTORS.switcherHost, SELECTORS.switcherHost);
  if (!pair) return null;
  const { host, shadow } = pair;
  addStyle(shadow, componentCss() + SWITCHER_CSS);
  const control = element("div", { className: "control" });
  const label = element("span", { className: "label", text: "FocusTube · Relax" });
  const switchButton = button("Switch mode", "switch", onOpen);
  switchButton.setAttribute("aria-label", "Switch FocusTube mode");
  control.append(label, switchButton); shadow.append(control);
  (document.documentElement || document.body).append(host);
  return { host, update(mode) { label.textContent = `FocusTube · ${LABEL[mode] || LABEL.relax}`; }, dispose() { safeRemove(host); } };
}
