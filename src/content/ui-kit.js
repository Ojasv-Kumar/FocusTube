export function createHost(hostName, hostId) {
  try {
    const host = document.createElement(hostName);
    host.id = hostId;
    const shadow = host.attachShadow({ mode: "open" });
    return { host, shadow };
  } catch { return null; }
}
export function addStyle(shadow, css) {
  const style = document.createElement("style");
  style.textContent = css;
  shadow.append(style);
  return style;
}
export function element(tagName, options = {}) {
  const node = document.createElement(tagName);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.type) node.type = options.type;
  if (options.href) node.href = options.href;
  if (options.target) node.target = options.target;
  if (options.rel) node.rel = options.rel;
  if (options.attributes) for (const [name, value] of Object.entries(options.attributes)) node.setAttribute(name, String(value));
  return node;
}
export function button(text, className = "button", action = null) {
  const node = element("button", { text, className, type: "button" });
  if (action) node.addEventListener("click", action);
  return node;
}
export function safeRemove(host) { try { host?.remove(); } catch { /* Navigation cleanup is best effort. */ } }
export function setHostFixed(host, className = "") {
  host.className = className;
}
export function formatViews(value) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  try { return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(Number(value)) + " views"; }
  catch { return `${Number(value).toLocaleString()} views`; }
}
export function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds))) return "";
  const total = Math.max(0, Math.floor(Number(seconds)));
  const hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), secs = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2,"0")}:${String(secs).padStart(2,"0")}` : `${minutes}:${String(secs).padStart(2,"0")}`;
}
export function componentCss() {
  return `:host{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1d2925;line-height:1.45;box-sizing:border-box}*,*::before,*::after{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}.button{border:1px solid #d2dcd7;background:#fff;color:#26332e;border-radius:12px;padding:10px 14px;font-weight:650;transition:background .16s,border-color .16s}.button:hover{background:#eef5f1;border-color:#9db7aa}.button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #7ab99b;outline-offset:2px}.button.primary{background:#174c3a;color:#fff;border-color:#174c3a}.button.primary:hover{background:#226249}.muted{color:#64716c}.eyebrow{text-transform:uppercase;letter-spacing:.11em;font-size:11px;font-weight:750;color:#547267}.panel{background:#fbfcfa;border:1px solid #e0e8e2;border-radius:18px;box-shadow:0 10px 35px #1c382516}.status{padding:16px;border:1px solid #e4e9e5;background:#fff;border-radius:14px}.error{border-color:#e9c9c1;background:#fff8f6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:16px}.skeleton{height:248px;border-radius:16px;background:linear-gradient(100deg,#edf1ed 25%,#f8faf8 38%,#edf1ed 60%);background-size:200% 100%;animation:ft-shimmer 1.2s ease-in-out infinite}@keyframes ft-shimmer{to{background-position-x:-200%}}`;
}
