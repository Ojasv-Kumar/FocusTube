/* The classic entry gates media and page interaction until the user chooses a mode. */
const root = document.documentElement;
let gateTimer;
let mediaObserver;
let pauseHandler;
const gate = {
  hold() {
    if (gateTimer) clearTimeout(gateTimer);
    gateTimer = null;
  },
  release() {
    if (gateTimer) clearTimeout(gateTimer);
    root?.removeAttribute("data-focustube-gate");
    root?.removeAttribute("data-focustube-mode");
    document.querySelectorAll("ytd-app").forEach(app => { app.inert = false; });
    mediaObserver?.disconnect();
    if (pauseHandler) document.removeEventListener("play", pauseHandler, true);
    document.getElementById("focustube-gate-error")?.remove();
  },
  fail() {
    this.release();
    const notice = document.createElement("div");
    notice.id = "focustube-gate-error";
    notice.textContent = "FocusTube could not open. YouTube has been restored; refresh to try again.";
    Object.assign(notice.style, { position: "fixed", zIndex: "2147483647", top: "12px", left: "50%", transform: "translateX(-50%)", padding: "12px 18px", color: "white", background: "#252a33", border: "1px solid #48505c", borderRadius: "12px", font: "14px system-ui" });
    (document.body || document.documentElement)?.append(notice);
  }
};
window.__FOCUSTUBE_GATE__ = gate;
let tabAlreadyChosen = false;
try { tabAlreadyChosen = sessionStorage.getItem("focustube.pickerSeen") === "1"; } catch { /* A blocked session store falls back to the required picker. */ }
if (!tabAlreadyChosen) {
  try {
    if (root) { root.dataset.focustubeMode = "startup"; root.dataset.focustubeGate = "pending"; }
    const lock = () => document.querySelectorAll("ytd-app").forEach(app => { app.inert = true; });
    lock();
    const pause = event => {
      const media = event.target;
      if (media instanceof HTMLMediaElement) { event.preventDefault(); media.pause(); media.muted = true; }
    };
    pauseHandler = pause;
    document.addEventListener("play", pause, true);
    document.querySelectorAll("video,audio").forEach(media => { media.pause(); media.muted = true; });
    mediaObserver = new MutationObserver(records => {
      lock();
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof HTMLMediaElement) { node.pause(); node.muted = true; }
        node.querySelectorAll?.("video,audio").forEach(media => { media.pause(); media.muted = true; });
      }
    });
    mediaObserver.observe(root, { childList: true, subtree: true });
    // The extension's module entry is imported below after the page is gated.
    gateTimer = setTimeout(() => gate.fail(), 15_000);
  } catch (error) {
    try { console.warn("[FocusTube][loader] FocusTube could not initialize.", error?.name || "error"); } catch { /* page remains untouched */ }
    gate.fail();
  }
}
// Load the maintained source modules directly. This keeps the unpacked build
// from depending on a stale generated bundle after a source edit.
import(chrome.runtime.getURL("src/content/main.js")).catch(error => {
  try { console.warn("[FocusTube][loader] FocusTube could not initialize.", error?.name || "module error"); } catch { /* page remains untouched */ }
  gate.fail();
});
