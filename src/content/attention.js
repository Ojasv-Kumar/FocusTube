(() => {
  if (window.__FOCUSTUBE_ATTENTION__) return;
  window.__FOCUSTUBE_ATTENTION__ = true;
  const namespace = "focustube.camera";
  let activeMode = "relax", cameraEnabled = false, video = null, heartbeat = 0, observer = null, gesturePaused = false, lastState = "", warningHost = null, audioContext = null, speedVideo = null, savedPlaybackRate = null;
  const activeAlerts = new Set();

  function onWatchPage() { return location.pathname === "/watch" && Boolean(new URL(location.href).searchParams.get("v")); }
  function currentVideo() { return document.querySelector("video.html5-main-video") || document.querySelector("ytd-player video") || document.querySelector("video"); }
  function clearGestureSpeed() {
    if (speedVideo && savedPlaybackRate !== null) speedVideo.playbackRate = savedPlaybackRate;
    speedVideo = null; savedPlaybackRate = null;
  }
  function setGestureSpeed(active) {
    if (active) {
      if (!onWatchPage() || !video || video.paused || savedPlaybackRate !== null) return;
      speedVideo = video; savedPlaybackRate = video.playbackRate; video.playbackRate = 2;
    } else clearGestureSpeed();
  }
  function tellWorker() {
    const candidate = currentVideo();
    if (candidate !== video) {
      clearGestureSpeed();
      if (video) { video.removeEventListener("play", handlePlaybackStarted); video.removeEventListener("pause", tellWorker); video.removeEventListener("ended", tellWorker); }
      video = candidate;
      if (video) { video.addEventListener("play", handlePlaybackStarted); video.addEventListener("pause", tellWorker); video.addEventListener("ended", tellWorker); }
    }
    if (video && !video.paused && !video.ended) gesturePaused = false;
    const visible = document.visibilityState === "visible" && document.hasFocus();
    const isPlaying = Boolean(onWatchPage() && video && !video.paused && !video.ended && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
    if (!isPlaying && !(gesturePaused && onWatchPage() && visible)) gesturePaused = false;
    const payload = { isWatch: onWatchPage(), isPlaying, gesturePaused, visible, mode: activeMode, cameraEnabled, url: location.href };
    const key = JSON.stringify(payload);
    if (key === lastState) return;
    lastState = key;
    try { chrome.runtime.sendMessage({ namespace, type: "PLAYBACK_STATE", payload }); } catch { /* Extension may be reloading. */ }
  }

  function clearWarning() { warningHost?.remove(); warningHost = null; }
  function handlePlaybackStarted() {
    if (warningHost) { activeAlerts.clear(); clearWarning(); }
    gesturePaused = false; lastState = ""; tellWorker();
  }
  function chime() {
    try {
      audioContext ||= new AudioContext();
      const play = () => {
        const start = audioContext.currentTime + 0.03;
        for (const [index, frequency] of [660, 880].entries()) {
          const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
          oscillator.type = "sine"; oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0.0001, start + index * 0.18); gain.gain.exponentialRampToValueAtTime(0.12, start + index * 0.18 + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.18 + 0.17);
          oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(start + index * 0.18); oscillator.stop(start + index * 0.18 + 0.18);
        }
      };
      if (audioContext.state === "suspended") void audioContext.resume().then(play).catch(() => {});
      else play();
    } catch { /* Browser autoplay policy may mute the optional chime. */ }
  }
  function showWarning(kind) {
    if (!onWatchPage() || !video || document.visibilityState !== "visible") return;
    if (warningHost) return;
    const text = kind === "camera-error" ? "Camera monitoring stopped. Check camera permission and setup in Settings." : kind === "face-missing" ? "Your face moved out of view. Come back to the screen when you are ready." : "You have been looking away. Come back to the screen when you are ready.";
    warningHost = document.createElement("div");
    warningHost.setAttribute("role", "alertdialog");
    warningHost.setAttribute("aria-live", "assertive");
    warningHost.style.cssText = "all:initial;position:fixed;z-index:2147483647;inset:0;display:grid;place-items:center;padding:24px;pointer-events:none;";
    const shadow = warningHost.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      *{box-sizing:border-box}
      .scrim{position:absolute;inset:0;background:radial-gradient(ellipse at center,#10171266 0%,#070909a6 72%);}
      .dialog{position:relative;width:min(680px,calc(100vw - 36px));padding:clamp(26px,5vw,46px);border:1px solid #b9e78d66;border-radius:26px;background:linear-gradient(145deg,#1b241f 0%,#111613 56%,#101315 100%);color:#f4f7f2;box-shadow:0 34px 100px #000c,0 0 0 1px #ffffff0a inset;text-align:center;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;pointer-events:none;animation:arrive .22s ease-out both;}
      .brand{display:flex;justify-content:center;align-items:center;gap:10px;color:#c8f29c;font-size:12px;font-weight:850;letter-spacing:.18em}
      .mark{display:grid;place-items:center;width:28px;height:28px;border:1px solid #b9e78d66;border-radius:9px;background:#a9e66e18;color:#c8f29c;font-size:14px;letter-spacing:-.04em}
      .state{margin-left:5px;padding:6px 10px;border:1px solid #ffffff18;border-radius:999px;background:#ffffff08;color:#b8c0ba;font-size:10px;letter-spacing:.11em}
      .symbol{display:grid;place-items:center;width:66px;height:66px;margin:28px auto 20px;border:1px solid #b9e78d44;border-radius:22px;background:linear-gradient(145deg,#a9e66e22,#a9e66e08);color:#c8f29c}
      h2{margin:0 auto 14px;max-width:15ch;font-size:clamp(30px,5.3vw,43px);line-height:1.06;letter-spacing:-.045em;font-weight:780}
      p{margin:0 auto;color:#c0c8c2;font-size:clamp(16px,2.4vw,19px);line-height:1.55;max-width:48ch;font-weight:450}
      .rule{height:1px;margin:28px 0 20px;background:linear-gradient(90deg,transparent,#ffffff20,transparent)}
      .actions{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap}
      button{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:14px 21px;border:0;border-radius:13px;background:linear-gradient(180deg,#c2f38d,#a9e66e);color:#15200e;font-size:16px;font-weight:780;box-shadow:0 8px 24px #a9e66e25;cursor:pointer;pointer-events:auto;transition:transform .15s ease,filter .15s ease}
      button.secondary{background:#1b241f;border:1px solid #b9e78d66;color:#d9efc7;box-shadow:none}
      button:hover{transform:translateY(-1px);filter:brightness(1.04)}button:focus-visible{outline:3px solid #f4f7f2;outline-offset:3px}
      .hint{color:#919c94;font-size:12px;font-weight:500}
      @keyframes arrive{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
      @media(prefers-reduced-motion:reduce){.dialog{animation:none}button{transition:none}}
      @media(max-width:480px){.dialog{padding:28px 22px;border-radius:21px}.brand{font-size:10px}.state{font-size:9px}.symbol{margin:22px auto 17px;width:58px;height:58px}.hint{flex-basis:100%}}
    `;
    const scrim = document.createElement("div"), card = document.createElement("section"), brand = document.createElement("div"), mark = document.createElement("span"), label = document.createElement("span"), state = document.createElement("span"), symbol = document.createElement("div"), heading = document.createElement("h2"), message = document.createElement("p"), rule = document.createElement("div"), actions = document.createElement("div"), resume = document.createElement("button"), setup = document.createElement("button"), hint = document.createElement("span");
    scrim.className = "scrim"; scrim.setAttribute("aria-hidden", "true");
    card.className = "dialog"; card.setAttribute("aria-modal", "false");
    brand.className = "brand"; mark.className = "mark"; mark.textContent = "F"; label.textContent = "FOCUSTUBE"; state.className = "state"; state.textContent = "PLAYBACK PAUSED"; brand.append(mark, label, state);
    const makeSvg = (width, height, viewBox, fill = "none") => { const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("width", String(width)); svg.setAttribute("height", String(height)); svg.setAttribute("viewBox", viewBox); svg.setAttribute("fill", fill); svg.setAttribute("aria-hidden", "true"); return svg; };
    symbol.className = "symbol"; symbol.setAttribute("aria-hidden", "true");
    const clockIcon = makeSvg(30, 30, "0 0 24 24"); clockIcon.setAttribute("stroke", "currentColor"); clockIcon.setAttribute("stroke-width", "1.8"); clockIcon.setAttribute("stroke-linecap", "round"); clockIcon.setAttribute("stroke-linejoin", "round");
    const clockFace = document.createElementNS("http://www.w3.org/2000/svg", "circle"); clockFace.setAttribute("cx", "12"); clockFace.setAttribute("cy", "12"); clockFace.setAttribute("r", "9.2");
    const clockHands = document.createElementNS("http://www.w3.org/2000/svg", "path"); clockHands.setAttribute("d", "M12 7v5l3 2"); clockIcon.append(clockFace, clockHands); symbol.append(clockIcon);
    heading.textContent = kind === "camera-error" ? "Camera check needed" : "Take a moment to refocus";
    message.textContent = text;
    rule.className = "rule"; actions.className = "actions";
    resume.type = "button"; resume.setAttribute("aria-label", "Resume the paused video and close the FocusTube alert"); resume.append(document.createTextNode("Resume video "));
    const playIcon = makeSvg(18, 18, "0 0 24 24", "currentColor"); const playPath = document.createElementNS("http://www.w3.org/2000/svg", "path"); playPath.setAttribute("d", "M8 5.8c0-.8.9-1.3 1.6-.9l9 6.2a1.1 1.1 0 0 1 0 1.8l-9 6.2c-.7.5-1.6-.1-1.6-.9z"); playIcon.append(playPath); resume.append(playIcon);
    resume.addEventListener("click", () => { if (video?.paused) void video.play().catch(() => {}); else handlePlaybackStarted(); });
    if (kind === "camera-error") {
      setup.type = "button"; setup.className = "secondary"; setup.textContent = "Open camera setup";
      setup.addEventListener("click", () => { try { chrome.runtime.sendMessage({ namespace, type: "OPEN_CAMERA_SETUP" }); } catch { /* The setup page can still be opened from FocusTube settings. */ } });
      actions.append(setup);
    }
    hint.className = "hint"; hint.textContent = "The alert stays until you resume playback."; actions.append(resume, hint);
    card.append(brand, symbol, heading, message, rule, actions); shadow.append(style, scrim, card); (document.body || document.documentElement).append(warningHost);
    if (!video.paused) video.pause();
    chime();
    gesturePaused = false; lastState = ""; tellWorker();
  }
  function toggleFromGesture() {
    if (!onWatchPage() || !video || document.visibilityState !== "visible") return;
    if (video.paused) {
      gesturePaused = false;
      const result = video.play(); if (result?.catch) result.catch(() => {});
    } else { gesturePaused = true; video.pause(); }
    lastState = ""; tellWorker();
  }
  function seekFromGesture(delta) {
    if (!onWatchPage() || !video || video.paused || !Number.isFinite(delta)) return;
    const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + delta));
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.namespace !== namespace) return false;
    if (message.type === "ATTENTION_ALERT") {
      const kind = message.payload?.kind;
      if (kind && !activeAlerts.has(kind)) {
        activeAlerts.add(kind);
        if (warningHost) chime(); else showWarning(kind);
      }
    }
    if (message.type === "ATTENTION_CLEAR" && !warningHost) {
      if (message.payload?.kind) activeAlerts.delete(message.payload.kind); else activeAlerts.clear();
      if (!activeAlerts.size) clearWarning();
    }
    if (message.type === "ATTENTION_GESTURE") toggleFromGesture();
    if (message.type === "ATTENTION_SEEK") seekFromGesture(message.payload?.delta);
    if (message.type === "ATTENTION_PLAYBACK_SPEED") setGestureSpeed(message.payload?.active === true);
    if (message.type === "CAMERA_ERROR") {
      activeAlerts.clear(); showWarning("camera-error");
    }
    return false;
  });

  chrome.storage.local.get(["activeMode", "cameraEnabled"], values => { activeMode = values.activeMode || "relax"; cameraEnabled = values.cameraEnabled === true; tellWorker(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.activeMode) activeMode = changes.activeMode.newValue || "relax";
    if (changes.cameraEnabled) cameraEnabled = changes.cameraEnabled.newValue === true;
    lastState = ""; if (!cameraEnabled) gesturePaused = false;
    tellWorker();
  });
  for (const event of ["yt-navigate-start", "yt-navigate-finish", "popstate", "focus", "blur"]) window.addEventListener(event, () => { lastState = ""; if (!onWatchPage()) { gesturePaused = false; clearWarning(); clearGestureSpeed(); } tellWorker(); });
  document.addEventListener("visibilitychange", () => { lastState = ""; tellWorker(); });
  observer = new MutationObserver(() => { if (!video?.isConnected || !currentVideo()) tellWorker(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  heartbeat = setInterval(() => { lastState = ""; tellWorker(); }, 1500);
  window.addEventListener("pagehide", () => { clearInterval(heartbeat); observer?.disconnect(); warningHost?.remove(); clearGestureSpeed(); try { chrome.runtime.sendMessage({ namespace, type: "PLAYBACK_STATE", payload: { isWatch: false, isPlaying: false, gesturePaused: false, visible: false, mode: activeMode, cameraEnabled: false, url: location.href } }); } catch {} }, { once: true });
  tellWorker();
})();
