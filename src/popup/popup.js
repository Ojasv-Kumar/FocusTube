import { MESSAGE, makeRequest } from "../messages.js";
import { CONFIG } from "../config.js";
const statusNode = document.getElementById("status");
const interestInput = document.getElementById("interest");
const geminiNode = document.getElementById("gemini-status");
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
function updateGeminiStatus(settings) {
  const count = Number(settings?.geminiKeyCount || 0);
  geminiNode.textContent = count ? `Gemini · ${count} key${count === 1 ? "" : "s"} saved` : "Gemini · Add a key in Options";
  geminiNode.dataset.connected = String(count > 0);
  geminiNode.title = count ? "Gemini API keys are stored in this browser profile." : "Add one or more Gemini API keys in FocusTube Options.";
}
async function load() {
  const response = await message(MESSAGE.GET_SETTINGS);
  if (!response.ok) { showStatus(response.userMessage); return; }
  currentSettings = response.settings;
  interestInput.value = currentSettings.interestText || currentSettings.defaultInterestTopic || "";
  paintMode(currentSettings.activeMode || "relax");
  updateGeminiStatus(currentSettings);
  showStatus(currentSettings.mockMode ? "Mock mode · offline demo fixtures" : "Choose a mode for your YouTube tabs.");
}
document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", async () => {
  const mode = button.dataset.mode;
  const interestText = interestInput.value.trim() || currentSettings?.interestText || currentSettings?.defaultInterestTopic || "";
  if (mode === "interest" && interestText.length < CONFIG.ModesPicker.interestMinChars) { showStatus(`Add at least ${CONFIG.ModesPicker.interestMinChars} characters for your interest.`); interestInput.focus(); return; }
  const response = await message(MESSAGE.SET_MODE, { mode, interestText });
  if (!response.ok) { showStatus(`${response.errorCode}: ${response.userMessage}`); return; }
  currentSettings = response.settings; paintMode(mode); showStatus(`${mode[0].toUpperCase()}${mode.slice(1)} mode saved. Open YouTube tabs update without reloading.`);
}));
document.getElementById("options").addEventListener("click", () => { try { chrome.runtime.openOptionsPage(); } catch { showStatus("Could not open Options. Try the extension details page."); } });
interestInput.maxLength = CONFIG.ModesPicker.interestMaxChars;
void load();
