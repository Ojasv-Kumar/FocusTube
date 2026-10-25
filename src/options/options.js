import { DEFAULT_SETTINGS, getSettings, saveSettings } from "../storage.js";
import { MESSAGE, makeRequest } from "../messages.js";

const $ = id => document.getElementById(id);
const status = $("status");
let toastTimer;
let toastNode;
const tell = (text, error = false, toast = false) => {
  status.textContent = text; status.dataset.error = String(error);
  clearTimeout(toastTimer);
  toastNode?.remove(); toastNode = null;
  if (toast) {
    toastNode = document.createElement("div");
    toastNode.className = "ft-toast";
    toastNode.setAttribute("role", "status");
    toastNode.textContent = text;
    document.body.append(toastNode);
    toastTimer = setTimeout(() => { toastNode?.remove(); toastNode = null; }, 2500);
  }
};
const send = (type, payload = {}) => new Promise(resolve => {
  let settled = false;
  const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
  const timer = setTimeout(() => finish({ ok: false, errorCode: "REQUEST_TIMEOUT", userMessage: "The extension did not complete this check in 65 seconds. Reload FocusTube and retry." }), 65_000);
  try { chrome.runtime.sendMessage(makeRequest(type, payload), value => finish(chrome.runtime.lastError ? { ok: false, errorCode: "CONTEXT_INVALIDATED", userMessage: "Reload FocusTube, then retry." } : value || { ok: false, errorCode: "EMPTY_RESPONSE", userMessage: "The extension did not respond. Reload FocusTube and retry." })); }
  catch { finish({ ok: false, errorCode: "CONTEXT_INVALIDATED", userMessage: "Reload FocusTube, then retry." }); }
});
function paint(s) {
  document.documentElement.dataset.theme = s.theme === "light" ? "light" : "dark";
  $("ask-every-tab").checked = s.askForModeEveryTab;
  $("results-count").value = String(s.resultsPerSearch);
  $("strictness").value = s.curiosityStrictness;
  $("mock").checked = s.mockMode;
  $("debug").checked = s.debugLogging;
  $("retrieval-provider").value = s.retrievalProvider || "auto";
  $("youtube-api-key").value = s.youtubeApiKey || "";
  $("ollama-endpoint").value = s.ollamaEndpoint || "";
  $("ollama-token").value = s.ollamaToken || "";
  $("ollama-model").value = s.ollamaModel || "qwen3:8b";
  $("hide-comments").checked = s.hideCommentsInLearn === true;
  $("hide-subscriptions").checked = s.hideSubscriptionsInLearn !== false;
  $("theme").value = s.theme || "dark";
  $("camera-enabled").checked = s.cameraEnabled === true;
}
function read() {
  return {
    askForModeEveryTab: $("ask-every-tab").checked,
    resultsPerSearch: Number($("results-count").value),
    curiosityStrictness: $("strictness").value,
    mockMode: $("mock").checked,
    debugLogging: $("debug").checked,
    retrievalProvider: $("retrieval-provider").value,
    youtubeApiKey: $("youtube-api-key").value.trim(),
    ollamaEndpoint: $("ollama-endpoint").value.trim(),
    ollamaToken: $("ollama-token").value.trim(),
    ollamaModel: $("ollama-model").value.trim(),
    hideCommentsInLearn: $("hide-comments").checked,
    hideSubscriptionsInLearn: $("hide-subscriptions").checked,
    theme: $("theme").value,
    cameraEnabled: $("camera-enabled").checked
  };
}
function validEndpointPattern(value) {
  try {
    const url = new URL(value);
    const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(url.hostname);
    if (!ip || url.protocol !== "https:" || url.port !== "11435" || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) return null;
    const octets = ip.slice(1).map(Number);
    if (octets.some(n => n > 255)) return null;
    const [a, b] = octets;
    if (!(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))) return null;
    return `${url.origin}/*`;
  } catch { return null; }
}
function requestOrigin(pattern) { return new Promise(resolve => { try { chrome.permissions.request({ origins: [pattern] }, resolve); } catch { resolve(false); } }); }

$("settings-form").addEventListener("submit", async event => {
  event.preventDefault();
  const values = read();
  if (values.cameraEnabled && !(await getSettings()).cameraCalibration) {
    tell("Open camera setup and complete the 3-second calibration before enabling camera monitoring.", true);
    return;
  }
  try { const settings = await saveSettings(values); paint(settings); tell("Preferences saved.", false, true); }
  catch { tell("Could not save preferences.", true); }
});
$("camera-setup").addEventListener("click", async () => {
  try { await chrome.tabs.create({ url: chrome.runtime.getURL("src/camera/setup.html") }); }
  catch { tell("Could not open camera setup. Try reloading the extension.", true); }
});
$("clear-cache").addEventListener("click", async () => { const result = await send(MESSAGE.CLEAR_CACHE); tell(result.ok ? `Cleared ${result.cleared || 0} cached items.` : "Could not clear the cache.", !result.ok); });
$("test-ollama").addEventListener("click", async () => {
  const values = read(), pattern = validEndpointPattern(values.ollamaEndpoint);
  if (!pattern) { tell("Enter a valid HTTPS private IPv4 bridge URL such as https://192.168.1.42:11435.", true); return; }
  if (values.ollamaToken.length < 32) { tell("Paste the bridge token from your friend's .bridge-token file first.", true); return; }
  tell("Requesting access to the configured bridge…");
  if (!(await requestOrigin(pattern))) { tell("Host permission was not granted. Allow access to the configured bridge host, then retry.", true); return; }
  tell("Saving settings and testing Ollama (the first run may take a minute)…");
  try { await saveSettings(values); } catch { tell("Could not save Ollama settings.", true); return; }
  const result = await send(MESSAGE.TEST_LLM);
  tell(result.ok ? `Ollama bridge, model, and JSON output are responding (${result.health?.model || values.ollamaModel}).` : `Ollama test failed (${result.errorCode || "request failed"}): ${result.userMessage || "Check Wi-Fi, certificate, model, token, and extension ID."}`, !result.ok);
});
$("test-youtube-api").addEventListener("click", async () => {
  tell("Saving settings and testing YouTube Data API…");
  try { await saveSettings(read()); } catch { tell("Could not save YouTube API settings.", true); return; }
  const result = await send(MESSAGE.TEST_YOUTUBE_API);
  tell(result.ok ? `YouTube Data API is responding (${result.health?.resultCount ?? 0} test results).` : `YouTube API test failed (${result.errorCode || "request failed"}): ${result.userMessage || "Check the key and API configuration."}`, !result.ok);
});
$("reset").addEventListener("click", async () => { await chrome.storage.local.clear(); const settings = await saveSettings(DEFAULT_SETTINGS); paint(settings); tell("Preferences reset."); });
$("health").addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true }), tab = tabs[0];
  if (!tab?.id || !tab.url?.startsWith("https://www.youtube.com/")) { tell("Open a YouTube tab to inspect its selectors.", true); return; }
  chrome.tabs.sendMessage(tab.id, { type: "focustube-health-check" }, result => tell(chrome.runtime.lastError ? "Refresh YouTube, then retry." : JSON.stringify(result?.report || {})));
});
try { paint(await getSettings()); tell("Preferences loaded."); }
catch { tell("Could not load preferences.", true); }
