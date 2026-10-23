import { DEFAULT_SETTINGS } from "../storage.js";
import { MESSAGE, makeRequest } from "../messages.js";
import { CONFIG } from "../config.js";

const byId = id => document.getElementById(id);
const statusNode = byId("status");
function showStatus(message, kind = "") { statusNode.textContent = message; statusNode.className = `status ${kind}`.trim(); }
function collectSettings() {
  return {
    llmBaseUrl: byId("llm-base-url").value.trim(), fastModel: byId("fast-model").value.trim(), smartModel: byId("smart-model").value.trim(),
    llmApiKey: byId("llm-api-key").value.trim(), youtubeApiKey: byId("youtube-api-key").value.trim(),
    retrievalProvider: byId("retrieval-provider").value, interestText: byId("interest-text").value.trim(),
    showComments: byId("show-comments").checked, mockMode: byId("mock-mode").checked, debugLogging: byId("debug-logging").checked
  };
}
function validate(form) {
  if (!form.llmBaseUrl) return "Enter an LLM base URL.";
  try {
    const url = new URL(form.llmBaseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return "Use a clean HTTPS base URL without credentials, query text, or a fragment.";
  } catch { return "Enter a valid LLM base URL."; }
  if (!form.fastModel || !form.smartModel) return "Enter both model names.";
  if (form.interestText.length > CONFIG.ModesPicker.interestMaxChars) return `Interest text must be ${CONFIG.ModesPicker.interestMaxChars} characters or shorter.`;
  return "";
}
function requestMessage(type, payload = {}) {
  return new Promise(resolve => {
    try { chrome.runtime.sendMessage(makeRequest(type, payload), response => { const err = chrome.runtime.lastError; resolve(err ? { ok: false, errorCode: "CONTEXT_INVALIDATED", userMessage: "FocusTube reloaded. Reopen this page and retry." } : response || { ok: false, errorCode: "NO_RESPONSE", userMessage: "FocusTube did not respond." }); }); }
    catch { resolve({ ok: false, errorCode: "CONTEXT_INVALIDATED", userMessage: "FocusTube reloaded. Reopen this page and retry." }); }
  });
}
function grantHostIfNeeded(baseUrl) {
  const url = new URL(baseUrl);
  const originPattern = `https://${url.hostname}/*`;
  // Calling request immediately preserves the options-page click's user gesture.
  try {
    return chrome.permissions.request({ origins: [originPattern] }).then(granted => ({ granted, requested: true }));
  } catch { return { granted: false, requested: true }; }
}
async function saveSettings({ requestPermission = true, quiet = false } = {}) {
  const values = collectSettings();
  const validationError = validate(values);
  if (validationError) { showStatus(validationError, "error"); return { ok: false }; }
  // Request host access directly from the Save/Test button gesture for a custom HTTPS endpoint.
  const permission = requestPermission ? await grantHostIfNeeded(values.llmBaseUrl) : { granted: true, requested: false };
  const response = await requestMessage(MESSAGE.SAVE_SETTINGS, values);
  if (!response.ok) { showStatus(`${response.errorCode}: ${response.userMessage}`, "error"); return response; }
  if (!quiet) {
    const message = permission.requested && !permission.granted
      ? "Settings saved. Host access was declined; FocusTube can’t contact this provider until access is granted."
      : "Settings saved.";
    showStatus(message, permission.requested && !permission.granted ? "error" : "success");
  }
  return { ok: true, permission };
}
async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get(null);
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    byId("llm-base-url").value = settings.llmBaseUrl;
    byId("fast-model").value = settings.fastModel;
    byId("smart-model").value = settings.smartModel;
    byId("llm-api-key").value = settings.llmApiKey;
    byId("youtube-api-key").value = settings.youtubeApiKey;
    byId("retrieval-provider").value = settings.retrievalProvider;
    byId("interest-text").value = settings.interestText;
    byId("show-comments").checked = settings.showComments;
    byId("mock-mode").checked = settings.mockMode;
    byId("debug-logging").checked = settings.debugLogging;
    showStatus("Settings loaded.", "success");
  } catch { showStatus("Could not read extension settings. Reload this options page.", "error"); }
}
byId("settings-form").addEventListener("submit", async event => { event.preventDefault(); await saveSettings(); });
byId("test-llm").addEventListener("click", async () => {
  const saved = await saveSettings({ quiet: true }); if (!saved.ok) return;
  const response = await requestMessage(MESSAGE.TEST_LLM);
  showStatus(response.ok ? response.message : `${response.errorCode}: ${response.userMessage}`, response.ok ? "success" : "error");
});
byId("test-youtube").addEventListener("click", async () => {
  const saved = await saveSettings({ quiet: true }); if (!saved.ok) return;
  const response = await requestMessage(MESSAGE.TEST_YOUTUBE_API);
  showStatus(response.ok ? response.message : `${response.errorCode}: ${response.userMessage}`, response.ok ? "success" : "error");
});
byId("clear-cache").addEventListener("click", async () => {
  const response = await requestMessage(MESSAGE.CLEAR_CACHE);
  showStatus(response.ok ? `Cache cleared (${response.cleared} entries).` : `${response.errorCode}: ${response.userMessage}`, response.ok ? "success" : "error");
});
byId("prewarm").addEventListener("click", async () => {
  const saved = await saveSettings({ quiet: true }); if (!saved.ok) return;
  const response = await requestMessage(MESSAGE.PREWARM, { queries: CONFIG.Pipeline.demoQueries });
  if (response.ok) {
    const successful = response.results.filter(item => item?.ok).length;
    showStatus(`Demo prewarm finished: ${successful} of ${response.results.length} queries cached. Mock mode is fastest for offline demos.`, "success");
  } else showStatus(`${response.errorCode}: ${response.userMessage}`, "error");
});
byId("reset").addEventListener("click", async () => {
  const response = await requestMessage(MESSAGE.SAVE_SETTINGS, { ...DEFAULT_SETTINGS });
  if (!response.ok) { showStatus(`${response.errorCode}: ${response.userMessage}`, "error"); return; }
  await loadSettings(); showStatus("Settings reset to defaults. API keys were cleared.", "success");
});
void loadSettings();
byId("interest-text").maxLength = CONFIG.ModesPicker.interestMaxChars;
