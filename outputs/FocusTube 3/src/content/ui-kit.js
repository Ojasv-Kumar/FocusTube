export function createHost(hostName, hostId) {
  try {
    const host = document.createElement(hostName);
    host.id = hostId;
    host.dataset.theme = document.documentElement?.dataset.focustubeTheme === "light" || document.documentElement?.dataset.theme === "light" ? "light" : "dark";
    const shadow = host.attachShadow({ mode: "open" });
    return { host, shadow };
  } catch { return null; }
}
export function addStyle(shadow, css) {
  const theme = `
    :host{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5;box-sizing:border-box}
    *,*::before,*::after{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}
    :host([data-theme="dark"]){color:#f1f1f1;color-scheme:dark}
    :host([data-theme="dark"]) .wrap,:host([data-theme="dark"]) .dialog{background:#0f0f0f!important;color:#f1f1f1!important;border-color:#303030!important;box-shadow:none!important}
    :host([data-theme="dark"]) .card,:host([data-theme="dark"]) .channel,:host([data-theme="dark"]) .mode,:host([data-theme="dark"]) .control,:host([data-theme="dark"]) .panel,:host([data-theme="dark"]) .status,:host([data-theme="dark"]) .original,:host([data-theme="dark"]) .empty{background:#181818!important;color:#f1f1f1!important;border-color:#303030!important;box-shadow:none!important}
    :host([data-theme="dark"]) .title,:host([data-theme="dark"]) .role,:host([data-theme="dark"]) .sectionTitle,:host([data-theme="dark"]) .videoTitle,:host([data-theme="dark"]) .mode strong,:host([data-theme="dark"]) .channel strong,:host([data-theme="dark"]) .label,:host([data-theme="dark"]) .brand,:host([data-theme="dark"]) .eyebrow,:host([data-theme="dark"]) .progressLabel{color:#f1f1f1!important}
    :host([data-theme="dark"]) .intro,:host([data-theme="dark"]) .query,:host([data-theme="dark"]) .meta,:host([data-theme="dark"]) .reason,:host([data-theme="dark"]) .confidence,:host([data-theme="dark"]) .footer,:host([data-theme="dark"]) .mode span,:host([data-theme="dark"]) .channel span,:host([data-theme="dark"]) .muted{color:#aaa!important}
    :host([data-theme="dark"]) .button,:host([data-theme="dark"]) .mode,:host([data-theme="dark"]) .switch,:host([data-theme="dark"]) .input{color:#f1f1f1!important;background:#272727!important;border-color:#303030!important}
    :host([data-theme="dark"]) .button:hover,:host([data-theme="dark"]) .mode:hover,:host([data-theme="dark"]) .switch:hover{background:#303030!important;border-color:#555!important}
    :host([data-theme="dark"]) .mode svg{color:#f1f1f1!important}
    :host([data-theme="dark"]) .mode.selected{border-color:#555!important;box-shadow:inset 3px 0 #f1f1f1!important}
    :host([data-theme="dark"]) .button.primary,:host([data-theme="dark"]) .submit,:host([data-theme="dark"]) .switch.primary{background:#f1f1f1!important;color:#0f0f0f!important;border-color:#f1f1f1!important}
    :host([data-theme="dark"]) .button.primary:hover,:host([data-theme="dark"]) .submit:hover,:host([data-theme="dark"]) .switch.primary:hover{background:#ddd!important;color:#0f0f0f!important}
    :host([data-theme="dark"]) .button:focus-visible,:host([data-theme="dark"]) input:focus-visible,:host([data-theme="dark"]) a:focus-visible{outline:2px solid #f1f1f1;outline-offset:2px}
    :host([data-theme="dark"]) .thumbLink,:host([data-theme="dark"]) .thumbnailPlaceholder{background:#272727;color:#aaa}
    :host([data-theme="dark"]) .duration{background:#0f0f0fdd;color:#fff}
    :host([data-theme="dark"]) .badge{background:#272727!important;color:#f1f1f1!important;border:1px solid #303030}
    :host([data-theme="dark"]) .error,:host([data-theme="dark"]) .hint{color:#ff8d82!important}
    :host([data-theme="dark"]) .skeleton{background:linear-gradient(100deg,#181818 25%,#272727 38%,#181818 60%)!important;background-size:200% 100%}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  const style = document.createElement("style");
  style.textContent = `${css}\n${theme}`;
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
