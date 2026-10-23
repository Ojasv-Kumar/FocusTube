import { MESSAGE, makeRequest } from "../messages.js";
import { CONFIG } from "../config.js";
const statusNode = document.getElementById("status");
const interestInput = document.getElementById("interest");
let currentSettings = null;
function message(type, payload = {}) {
  return new Promise(resolve => {
    try { chrome.runtime.sendMessage(makeRequest(type, payload), response => { const error = chrome.runtime.lastError; resolve(error ? { ok: false, errorCode: "CONTEXT_INVALIDATED", userMessage: "Reload FocusTube and try again." } : response || { ok: false, errorCode: "NO_RESPONSE", userMessage: "FocusTube did not respond." }); }); }
    catch { resolve({ ok: false, errorCode: "CONTEXT_INVALIDATED", userMessage: "Reload FocusTube and try again." }); }
  });
}
function paintMode(mode) { document.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("selected", button.dataset.mode === mode)); }
function showStatus(text) { statusNode.textContent = text; }
async function load() {
  const response = await message(MESSAGE.GET_SETTINGS);
  if (!response.ok) { showStatus(response.userMessage); return; }
  currentSettings = response.settings;
  interestInput.value = currentSettings.interestText || "";
  paintMode(currentSettings.activeMode || "relax");
  showStatus(currentSettings.mockMode ? "Mock mode · offline demo" : `Provider · ${currentSettings.retrievalProvider}`);
}
document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", async () => {
  const mode = button.dataset.mode;
  const interestText = interestInput.value.trim() || currentSettings?.interestText || "";
  if (mode === "interest" && interestText.length < CONFIG.ModesPicker.interestMinChars) { showStatus(`Add at least ${CONFIG.ModesPicker.interestMinChars} characters for your interest.`); interestInput.focus(); return; }
  const response = await message(MESSAGE.SET_MODE, { mode, interestText });
  if (!response.ok) { showStatus(`${response.errorCode}: ${response.userMessage}`); return; }
  currentSettings = response.settings; paintMode(mode); showStatus(`${mode[0].toUpperCase()}${mode.slice(1)} mode saved. Open YouTube tabs update without reloading.`);
}));
document.getElementById("options").addEventListener("click", () => { try { chrome.runtime.openOptionsPage(); } catch { showStatus("Could not open options. Try chrome://extensions."); } });
document.getElementById("health").addEventListener("click", () => {
  showStatus("Checking the current YouTube page…");
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const error = chrome.runtime.lastError;
      const tab = tabs?.[0];
      if (error || !tab?.id || !String(tab.url || "").startsWith("https://www.youtube.com/")) { showStatus("Open a YouTube tab, then run the selector check again."); return; }
      chrome.tabs.sendMessage(tab.id, { type: "focustube-health-check" }, response => {
        const sendError = chrome.runtime.lastError;
        if (sendError || !response?.ok) { showStatus("Content script unavailable. Refresh YouTube and retry."); return; }
        const matched = Object.values(response.report).flat().filter(item => item.matched).length;
        const total = Object.values(response.report).flat().length;
        showStatus(`Selector check: ${matched}/${total} fallbacks matched on this ${response.pageType} page. See the FocusTube content-script console for details.`);
      });
    });
  } catch { showStatus("Could not inspect this tab. Refresh YouTube and retry."); }
});
void load();
interestInput.maxLength = CONFIG.ModesPicker.interestMaxChars;
