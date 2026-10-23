import { SELECTORS, queryFirst } from "../selectors.js";
import { CONFIG } from "../config.js";

let observer = null;
let timer = null;
let checks = 0;
let changingProgrammatically = false;
let userOverrode = false;
export function startAutoplayGuard() {
  stopAutoplayGuard(false);
  checks = 0;
  const onUserClick = event => {
    const button = event.target?.closest?.(SELECTORS.autoplayToggle.join(","));
    if (button && !changingProgrammatically) userOverrode = true;
  };
  document.addEventListener("click", onUserClick, true);
  const attempt = () => {
    if (userOverrode || checks >= CONFIG.Behaviour.autoplayMaxChecks) { clearInterval(timer); timer = null; return; }
    checks += 1;
    const toggle = queryFirst(SELECTORS.autoplayToggle);
    const isEnabled = toggle?.getAttribute("aria-checked") === "true" || toggle?.classList?.contains("ytp-autonav-toggle-button-on");
    if (toggle && isEnabled) {
      changingProgrammatically = true;
      try { toggle.click(); } catch { /* Autoplay is a best-effort preference. */ }
      queueMicrotask(() => { changingProgrammatically = false; });
      clearInterval(timer); timer = null;
    }
  };
  attempt();
  if (!userOverrode && checks < CONFIG.Behaviour.autoplayMaxChecks) timer = setInterval(attempt, CONFIG.Behaviour.autoplayCheckMs);
  observer = new MutationObserver(() => { if (!timer && !userOverrode && checks < CONFIG.Behaviour.autoplayMaxChecks) { checks = 0; attempt(); timer = setInterval(attempt, CONFIG.Behaviour.autoplayCheckMs); } });
  try { observer.observe(document.documentElement, { childList: true, subtree: true }); } catch { /* page may be closing */ }
  return () => { document.removeEventListener("click", onUserClick, true); stopAutoplayGuard(false); };
}
export function stopAutoplayGuard(resetUserOverride = false) {
  if (timer) clearInterval(timer);
  timer = null;
  observer?.disconnect(); observer = null;
  if (resetUserOverride) userOverrode = false;
}
