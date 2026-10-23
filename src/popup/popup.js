import { MESSAGE, makeRequest } from "../messages.js";
import { CONFIG } from "../config.js";
const statusNode = document.getElementById("status");
const interestInput = document.getElementById("interest");
const backendNode = document.getElementById("backend");
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
  const response = await message(MESSAGE.BACKEND_HEALTH);
  const health = response.health;
  const connected = response.ok && health?.ok;
  backendNode.textContent = `Backend · ${connected ? "Connected" : "Not connected"}`;
  backendNode.dataset.connected = String(Boolean(connected));
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
interestInput.maxLength = CONFIG.ModesPicker.interestMaxChars;
void load();
