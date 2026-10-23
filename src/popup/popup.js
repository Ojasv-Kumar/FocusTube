import { MESSAGE, makeRequest } from "../messages.js";
import { CONFIG } from "../config.js";
const statusNode = document.getElementById("status");
const interestInput = document.getElementById("interest");
const backendNode = document.getElementById("backend");
const connectBackendButton = document.getElementById("connect-backend");
const backendUrl = new URL(CONFIG.Backend.baseUrl);
const backendPermission = `${backendUrl.protocol}//${backendUrl.hostname}/*`;
let currentSettings = null;
function message(type, payload = {}) {
  return new Promise(resolve => {
    try { chrome.runtime.sendMessage(makeRequest(type, payload), response => { const error = chrome.runtime.lastError; resolve(error ? { ok: false, errorCode: "CONTEXT_INVALIDATED", userMessage: "Reload FocusTube and try again." } : response || { ok: false, errorCode: "NO_RESPONSE", userMessage: "FocusTube did not respond." }); }); }
    catch { resolve({ ok: false, errorCode: "CONTEXT_INVALIDATED", userMessage: "Reload FocusTube and try again." }); }
  });
}
function paintMode(mode) {
  document.querySelectorAll("[data-mode]").forEach(button => { const selected = button.dataset.mode === mode; button.classList.toggle("selected", selected); button.setAttribute("aria-pressed", String(selected)); });
  document.getElementById("current-mode").textContent = `Current mode · ${mode[0].toUpperCase()}${mode.slice(1)}`;
}
function showStatus(text) { statusNode.textContent = text; }
async function updateBackend() {
  backendNode.textContent = "Backend · Checking";
  const hasPermission = await new Promise(resolve => {
    try { chrome.permissions.contains({ origins: [backendPermission] }, resolve); }
    catch { resolve(false); }
  });
  if (!hasPermission) {
    backendNode.textContent = "Backend · Access needed";
    backendNode.dataset.connected = "false";
    backendNode.title = "FocusTube needs permission to contact its local backend.";
    connectBackendButton.hidden = false;
    return;
  }
  await checkBackendFromPopup();
}
async function checkBackendFromPopup() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.Backend.healthTimeoutMs);
  try {
    // Probe directly from this visible extension page. Besides being the
    // clearest connectivity check, this avoids reporting a service-worker
    // fetch failure as if the backend itself were down.
    const response = await fetch(`${CONFIG.Backend.baseUrl.replace(/\/+$/, "")}/health`, { cache: "no-store", signal: controller.signal });
    const health = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(`HTTP_${response.status}`), { code: `HTTP_${response.status}` });
    if (!health?.ok) throw Object.assign(new Error("INVALID_HEALTH_RESPONSE"), { code: "INVALID_HEALTH_RESPONSE" });
    if (Number(health.youtubeRetrievalProxy) < 1) {
      backendNode.textContent = "Backend · Restart required";
      backendNode.dataset.connected = "false";
      backendNode.title = "This backend is an older version and does not include YouTube retrieval. Stop the old server and restart node backend/server.mjs from the updated FocusTube folder.";
      connectBackendButton.hidden = true;
      return;
    }
    backendNode.dataset.connected = "true";
    if (!health.ollama?.reachable) {
      backendNode.textContent = "Backend · Connected (Ollama unavailable)";
      backendNode.title = "The backend answered, but Ollama is unreachable.";
    } else if (!health.ollama?.present) {
      backendNode.textContent = "Backend · Connected (model missing)";
      backendNode.title = `The backend answered, but ${health.ollama?.model || "the configured Ollama model"} is not installed.`;
    } else {
      backendNode.textContent = "Backend · Connected";
      backendNode.title = `Local backend is responding. Gemini keys configured: ${health.geminiKeys?.configured ?? "unknown"}.`;
    }
    connectBackendButton.hidden = true;
  } catch (error) {
    const code = error?.name === "AbortError" ? "HEALTH_TIMEOUT" : error?.code || "FETCH_FAILED";
    backendNode.textContent = `Backend · ${code}`;
    backendNode.dataset.connected = "false";
    backendNode.title = `Popup health request failed: ${error?.message || code}. Confirm the backend is running at ${CONFIG.Backend.baseUrl}, then click Connect to retry.`;
    connectBackendButton.hidden = false;
  } finally {
    clearTimeout(timer);
  }
}
async function connectBackend() {
  connectBackendButton.disabled = true;
  connectBackendButton.textContent = "Connecting…";
  backendNode.textContent = "Backend · Requesting access";
  try {
    const granted = await new Promise(resolve => {
      try { chrome.permissions.request({ origins: [backendPermission] }, resolve); }
      catch { resolve(false); }
    });
    if (!granted) {
      backendNode.textContent = "Backend · Access denied";
      backendNode.title = "Allow FocusTube to access http://127.0.0.1, then click Connect again.";
      return;
    }
    await checkBackendFromPopup();
  } catch (error) {
    backendNode.textContent = error?.name === "AbortError" ? "Backend · HEALTH_TIMEOUT" : `Backend · ${error?.code || "FETCH_FAILED"}`;
    backendNode.dataset.connected = "false";
    backendNode.title = `Could not reach ${CONFIG.Backend.baseUrl}: ${error?.message || error}`;
  } finally {
    connectBackendButton.disabled = false;
    connectBackendButton.textContent = "Connect";
  }
}
async function load() {
  const response = await message(MESSAGE.GET_SETTINGS);
  if (!response.ok) { showStatus(response.userMessage); void updateBackend(); return; }
  currentSettings = response.settings;
  interestInput.value = currentSettings.interestText || currentSettings.defaultInterestTopic || "";
  paintMode(currentSettings.activeMode || "relax");
  showStatus(currentSettings.mockMode ? "Mock mode · offline demo fixtures" : "Choose a mode for your YouTube tabs.");
  void updateBackend();
}
document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", async () => {
  const mode = button.dataset.mode;
  const interestText = interestInput.value.trim() || currentSettings?.interestText || currentSettings?.defaultInterestTopic || "";
  if (mode === "interest" && interestText.length < CONFIG.ModesPicker.interestMinChars) { showStatus(`Add at least ${CONFIG.ModesPicker.interestMinChars} characters for your interest.`); interestInput.focus(); return; }
  const response = await message(MESSAGE.SET_MODE, { mode, interestText });
  if (!response.ok) { showStatus(`${response.errorCode}: ${response.userMessage}`); return; }
  currentSettings = response.settings; paintMode(mode); showStatus(`${mode[0].toUpperCase()}${mode.slice(1)} mode saved. Open YouTube tabs update without reloading.`);
}));
document.getElementById("options").addEventListener("click", () => { try { chrome.runtime.openOptionsPage(); } catch { showStatus("Could not open Options. Try chrome://extensions."); } });
connectBackendButton.addEventListener("click", () => { void connectBackend(); });
interestInput.maxLength = CONFIG.ModesPicker.interestMaxChars;
void load();
