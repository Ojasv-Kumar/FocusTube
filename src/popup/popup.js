import { MESSAGE, makeRequest } from "../messages.js";
const statusNode = document.getElementById("status");
const ollamaNode = document.getElementById("ollama-status");
let currentSettings = null;
let statusTimer = 0;
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
function paintTheme(theme) { document.documentElement.dataset.theme = theme === "light" ? "light" : "dark"; }
function showStatus(text, error = false) { if (statusTimer) clearInterval(statusTimer); statusTimer = 0; statusNode.textContent = text; statusNode.dataset.error = String(error); }
function showLearnLock(remainingMs) {
  const expiresAt = Date.now() + Math.max(0, Number(remainingMs) || 0);
  const update = () => {
    const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    const time = `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    statusNode.textContent = seconds ? `${time} left to close Learn mode.` : "Learn mode timer complete. You can switch modes now.";
    statusNode.dataset.error = String(seconds > 0);
    if (!seconds && statusTimer) { clearInterval(statusTimer); statusTimer = 0; }
  };
  update(); statusTimer = setInterval(update, 1000);
}
function updateOllamaStatus(settings) {
  const count = settings?.hasOllamaToken ? 1 : 0;
  ollamaNode.textContent = count ? `Ollama · token saved` : "Ollama · Configure bridge in Options";
  ollamaNode.dataset.connected = String(count > 0);
  ollamaNode.title = count ? "The private bridge token is stored in this browser profile." : "Configure the HTTPS bridge URL, token, and model in FocusTube Options.";
}
async function load() {
  const response = await message(MESSAGE.GET_SETTINGS);
  if (!response.ok) { showStatus(response.userMessage, true); return; }
  currentSettings = response.settings;
  paintTheme(currentSettings.theme);
  paintMode(currentSettings.activeMode || "relax");
  updateOllamaStatus(currentSettings);
  showStatus(currentSettings.mockMode ? "Mock mode · offline demo fixtures" : "Choose a mode for your YouTube tabs.");
}
document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", async () => {
  const mode = button.dataset.mode;
  const response = await message(MESSAGE.SET_MODE, { mode });
  if (!response.ok) { if (response.errorCode === "LEARN_MODE_LOCKED") showLearnLock(response.remainingMs); else showStatus(`${response.errorCode}: ${response.userMessage}`, true); return; }
  currentSettings = response.settings; paintTheme(currentSettings.theme); paintMode(mode); showStatus(`${mode[0].toUpperCase()}${mode.slice(1)} mode saved. YouTube tabs are reloading with the selected mode.`);
}));
document.getElementById("options").addEventListener("click", () => { try { chrome.runtime.openOptionsPage(); } catch { showStatus("Could not open Options. Try the extension details page."); } });
void load();
