import { CONFIG } from "../config.js";
import { createHost, addStyle, element, button, componentCss, safeRemove } from "./ui-kit.js";

function extensionAsset(path) {
  try { return globalThis.chrome?.runtime?.getURL?.(path) || path; }
  catch { return path; }
}

const HOST_CSS = `:host{position:fixed!important;inset:0!important;z-index:2147483200!important;display:block!important;color:#eaf8ff}`;
const ASSISTANT_CSS = `
.assistant-scene{position:relative;display:grid;place-items:center;width:100%;height:100dvh;min-height:320px;overflow:hidden;background:#000;color:#eee8dc;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.assistant-layout{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(300px,.92fr);align-items:center;gap:clamp(20px,4.6vw,76px);width:min(1260px,100%);height:100%;margin:0 auto;padding:clamp(18px,4vw,58px)}
.assistant-core-column{position:relative;display:grid;place-items:center;min-width:0;min-height:0;height:100%}
.assistant-orbit-system{position:relative;display:grid;place-items:center;width:min(43vw,570px);min-width:220px;aspect-ratio:1}
.assistant-orbit-system:before,.assistant-orbit-system:after{content:"";position:absolute;inset:8%;border:1px solid #9d77422e;border-radius:50%;transform:rotateX(68deg) rotateZ(0);animation:jarvisRing 32s linear infinite;pointer-events:none}
.assistant-orbit-system:after{inset:15%;border-color:#c39a5b35;transform:rotateY(65deg) rotateX(18deg);animation:jarvisRingReverse 27s linear infinite}
.assistant-orb{position:relative;display:grid;place-items:center;width:100%;height:100%;background:transparent;overflow:visible}
.assistant-orb-media{position:absolute;inset:0;z-index:2;display:grid;place-items:center;pointer-events:none;mix-blend-mode:screen;animation:jarvisRotate 48s linear infinite;filter:drop-shadow(0 0 22px #b987391c)}
.assistant-orb-media video{display:block;width:100%;height:100%;object-fit:contain;mix-blend-mode:screen;pointer-events:none;background:transparent}
.assistant-chat-panel{display:flex;flex-direction:column;width:100%;height:min(68vh,590px);min-height:250px;max-height:calc(100dvh - 48px);overflow:hidden;background:#070706;border:1px solid #6f542f77;border-radius:14px;box-shadow:0 28px 90px #000,0 0 42px #a57a3410;transition:border-color .22s,box-shadow .22s}
.assistant-chat-history{flex:1;min-height:0;overflow:auto;background:#050505}
.assistant-chat-form{display:flex;align-items:center;gap:10px;padding:12px;background:linear-gradient(180deg,#0b0a08,#090807);border-top:1px solid #58432680}
.assistant-input{display:block;flex:1;width:100%;min-width:0;min-height:48px;margin:0;padding:13px 14px;border:1px solid #463823!important;border-radius:9px!important;outline:none!important;background:#0a0907!important;color:#f3e5ca!important;font-size:14px;line-height:1.5;box-shadow:none!important;transition:border-color .18s,background .18s}
.assistant-input::placeholder{color:transparent}
.assistant-input:focus{border-color:#b38b4c!important;background:#0d0b08!important;box-shadow:0 0 0 2px #b38b4c20!important}
.assistant-chat-form.is-invalid .assistant-input{border-color:#a86752!important;box-shadow:0 0 0 2px #a8675220!important}
.assistant-submit{flex:0 0 48px;display:grid;place-items:center;width:48px;height:48px;padding:0;border:1px solid #98734499;border-radius:9px;background:#21190e;color:#e4c48e;font-size:25px;line-height:1;transition:background .18s,border-color .18s,transform .18s}
.assistant-submit:hover{background:#352514;border-color:#d0a45c;transform:translateY(-1px)}
.assistant-submit:focus-visible{outline:2px solid #d0a45c;outline-offset:3px}
.assistant-submit:disabled{opacity:.45;cursor:wait;transform:none}
.assistant-scene.is-speaking .assistant-chat-panel{border-color:#9d7a4d9c;box-shadow:0 28px 90px #000,0 0 40px #b48a4a16}
@keyframes jarvisRotate{to{transform:rotate(360deg)}}
@keyframes jarvisRing{to{transform:rotateX(68deg) rotateZ(360deg)}}
@keyframes jarvisRingReverse{to{transform:rotateY(65deg) rotateX(18deg) rotateZ(-360deg)}}
@media(max-width:760px){.assistant-layout{grid-template-columns:1fr;grid-template-rows:minmax(150px,38vh) minmax(210px,1fr);gap:12px;padding:16px;width:min(620px,100%)}.assistant-core-column{min-height:0;height:100%}.assistant-orbit-system{width:min(45vh,300px);min-width:150px;max-width:100%;height:100%;max-height:100%;aspect-ratio:1}.assistant-chat-panel{height:auto;min-height:210px;max-height:100%;flex:1}.assistant-chat-history{min-height:80px}}
@media(max-width:420px){.assistant-layout{grid-template-rows:minmax(130px,32vh) minmax(210px,1fr);padding:12px;gap:8px}.assistant-orbit-system{width:min(36vh,230px);min-width:130px}.assistant-chat-form{padding:9px;gap:8px}.assistant-input{min-height:44px;padding:10px}.assistant-submit{flex-basis:44px;width:44px;height:44px}}
@media(prefers-reduced-motion:reduce){.assistant-orb-media,.assistant-orbit-system:before,.assistant-orbit-system:after{animation:none!important}}
`;


export function renderLearnAssistant(shadow, { onSubmit = () => {}, autoSpeak = true, welcomeAudio = null } = {}) {
  shadow.replaceChildren();
  addStyle(shadow, componentCss() + HOST_CSS + ASSISTANT_CSS);

  const scene = element("main", { className: "assistant-scene", attributes: { "aria-label": "JARVIS learning chat" } });
  const layout = element("div", { className: "assistant-layout" });

  // Left side: the supplied JARVIS animation, slowly rotating against pure black.
  const coreColumn = element("section", { className: "assistant-core-column", attributes: { "aria-label": "JARVIS animation" } });
  const orbit = element("div", { className: "assistant-orbit-system", attributes: { "aria-hidden": "true" } });
  const orb = element("div", { className: "assistant-orb" });
  const media = element("div", { className: "assistant-orb-media" });
  const coreVideo = element("video", { attributes: { "aria-hidden": "true", autoplay: "", muted: "", loop: "", playsinline: "", preload: "auto", disablepictureinpicture: "" } });
  coreVideo.src = extensionAsset("assets/jarvis-core-loop.mp4");
  coreVideo.autoplay = true;
  coreVideo.muted = true;
  coreVideo.loop = true;
  coreVideo.playsInline = true;
  coreVideo.preload = "auto";
  media.append(coreVideo);
  orb.append(media);
  orbit.append(orb);
  coreColumn.append(orbit);
  layout.append(coreColumn);

  // Right side: deliberately empty chat history and a single response control.
  const chatPanel = element("section", { className: "assistant-chat-panel", attributes: { "aria-label": "Learning prompt chat" } });
  const history = element("div", { className: "assistant-chat-history", attributes: { "aria-live": "polite", "aria-relevant": "additions text" } });
  const form = element("form", { className: "assistant-chat-form" });
  const input = element("input", { className: "assistant-input", type: "text", attributes: {
    id: "focustube-learning-prompt",
    maxlength: CONFIG.Pipeline.queryMaxChars,
    autocomplete: "off",
    autocapitalize: "sentences",
    spellcheck: "false",
    "aria-label": "Enter what you want to learn",
    "aria-required": "true"
  } });
  const submit = button("↑", "assistant-submit");
  submit.type = "submit";
  submit.setAttribute("aria-label", "Send learning prompt");
  form.append(input, submit);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const query = String(input.value || "").trim();
    if (!query || query.length > CONFIG.Pipeline.queryMaxChars) {
      form.classList.add("is-invalid");
      input.focus();
      return;
    }
    form.classList.remove("is-invalid");
    submit.disabled = true;
    try { onSubmit(query); }
    catch {
      submit.disabled = false;
      form.classList.add("is-invalid");
      input.focus();
    }
  });
  input.addEventListener("input", () => form.classList.remove("is-invalid"));
  chatPanel.append(history, form);
  layout.append(chatPanel);
  scene.append(layout);
  shadow.append(scene);

  let disposed = false;
  let utterance = null;
  let fallbackActive = false;
  let audio = welcomeAudio;
  try {
    if (!audio) audio = new Audio(extensionAsset("assets/jarvis-welcome.mp3"));
    audio.preload = "auto";
    audio.volume = 0.96;
  } catch { audio = null; }

  const setVoiceActive = active => {
    if (!disposed) scene.classList.toggle("is-speaking", Boolean(active));
  };
  const speakFallback = () => {
    if (disposed || fallbackActive || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") return;
    fallbackActive = true;
    try {
      utterance = new SpeechSynthesisUtterance("What would you like to learn today?");
      const voices = window.speechSynthesis.getVoices?.() || [];
      const preferred = voices.find(voice => /^en/i.test(voice.lang) && /\b(Alex|Daniel|Fred|Tom|Rishi|Aaron|James|David|Mark|Guy|Christopher)\b/i.test(voice.name))
        || voices.find(voice => /^en-US/i.test(voice.lang) && /Google US English/i.test(voice.name))
        || voices.find(voice => /^en-US/i.test(voice.lang))
        || voices.find(voice => /^en/i.test(voice.lang));
      if (preferred) utterance.voice = preferred;
      utterance.lang = preferred?.lang || "en-US";
      utterance.rate = 0.91;
      utterance.pitch = 0.82;
      utterance.volume = 0.92;
      utterance.onstart = () => setVoiceActive(true);
      utterance.onend = () => { fallbackActive = false; setVoiceActive(false); };
      utterance.onerror = () => { fallbackActive = false; setVoiceActive(false); };
      window.speechSynthesis.speak(utterance);
    } catch { fallbackActive = false; setVoiceActive(false); }
  };
  const speakGreeting = () => {
    if (disposed) return;
    try { window.speechSynthesis?.cancel(); } catch { /* Optional browser voice. */ }
    fallbackActive = false;
    if (!audio) { speakFallback(); return; }
    try {
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => { if (!disposed) speakFallback(); });
    } catch { speakFallback(); }
  };

  if (audio) {
    audio.addEventListener("play", () => setVoiceActive(true));
    audio.addEventListener("ended", () => setVoiceActive(false));
    audio.addEventListener("error", () => { if (!disposed) speakFallback(); }, { once: true });
  }
  try { const corePlay = coreVideo.play?.(); corePlay?.catch?.(() => {}); } catch { /* The visual can be unavailable while chat still works. */ }

  // Start audio synchronously from the Learn button's click path, preserving browser user activation.
  if (autoSpeak) speakGreeting();
  if (autoSpeak && input.isConnected) { try { input.focus({ preventScroll: true }); } catch { input.focus(); } }

  return () => {
    disposed = true;
    try { audio?.pause(); if (audio) audio.currentTime = 0; } catch { /* Best-effort cleanup. */ }
    try { window.speechSynthesis?.cancel(); } catch { /* Optional browser voice. */ }
    try { coreVideo.pause(); coreVideo.removeAttribute("src"); coreVideo.load(); } catch { /* Best-effort video cleanup. */ }
    try { if (audio) { audio.removeAttribute?.("src"); audio.load?.(); } } catch { /* Best-effort audio cleanup. */ }
  };
}

export function openLearnAssistantOverlay({ onSubmit, autoSpeak = true, welcomeAudio = null } = {}) {
  const pair = createHost("focustube-learn-assistant-host", "focustube-learn-assistant-host");
  if (!pair) return null;
  const { host, shadow } = pair;
  (document.documentElement || document.body).append(host);
  let disposeView = null;
  try { disposeView = renderLearnAssistant(shadow, { onSubmit, autoSpeak, welcomeAudio }); }
  catch { safeRemove(host); return null; }
  return { host, dispose() { try { disposeView?.(); } finally { safeRemove(host); } } };
}
