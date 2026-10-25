import { CONFIG } from "../config.js";
import { SELECTORS, queryFirst } from "../selectors.js";
import { addStyle, createHost, element, button, safeRemove } from "./ui-kit.js";

const CSS = `:host{display:block;width:100%;min-width:0}.bar{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:4px 5px 4px 14px;border:1px solid #ffffff24;border-radius:999px;background:#171a20}.input{flex:1;min-width:0;border:0;background:transparent;color:#f0f2f5;padding:8px 2px;outline:none}.input:focus-visible{outline:0}.submit{white-space:nowrap;border:0;border-radius:999px;background:#a9e66e;color:#10140d;padding:8px 15px;font-weight:700;cursor:pointer}.submit:focus-visible,.input:focus-visible{outline:2px solid #a9e66e;outline-offset:2px}`;
export function createLearnSearch({ query = "", anchor: suppliedAnchor = null, onSubmit = () => {} } = {}) {
  const anchor = suppliedAnchor || queryFirst(SELECTORS.mastheadSearchRegion);
  if (!anchor) return null;
  const pair = createHost(SELECTORS.learnSearchHost, SELECTORS.learnSearchHost);
  if (!pair) return null;
  const { host, shadow } = pair;
  addStyle(shadow, CSS);
  const form = element("form", { className: "bar", attributes: { role: "search" } });
  const input = element("input", { className: "input", type: "search", attributes: { placeholder: "What do you want to learn?", "aria-label": "Search a learning topic", maxlength: CONFIG.Pipeline.queryMaxChars } });
  input.value = Array.from(String(query)).slice(0, CONFIG.Pipeline.queryMaxChars).join("");
  const submit = button("Search", "submit"); submit.type = "submit";
  form.append(input, submit);
  form.addEventListener("submit", event => { event.preventDefault(); const value = Array.from(input.value.trim()).slice(0, CONFIG.Pipeline.queryMaxChars).join(""); if (value) onSubmit(value); else input.focus(); });
  shadow.append(form);
  anchor.prepend(host);
  return { host, update(value) { input.value = Array.from(String(value || "")).slice(0, CONFIG.Pipeline.queryMaxChars).join(""); }, dispose() { safeRemove(host); } };
}
