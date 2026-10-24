export const MESSAGE = Object.freeze({
  GET_SETTINGS: "GET_SETTINGS", SAVE_SETTINGS: "SAVE_SETTINGS", SET_MODE: "SET_MODE",
  RUN_PIPELINE: "RUN_PIPELINE", TEST_LLM: "TEST_LLM", TEST_YOUTUBE_API: "TEST_YOUTUBE_API",
  CLEAR_CACHE: "CLEAR_CACHE", PREWARM: "PREWARM", SELECTOR_HEALTH: "SELECTOR_HEALTH", GEMINI_HEALTH: "GEMINI_HEALTH"
});
export function makeRequest(type, payload = {}, correlationId = "") { return { namespace: "focustube", type, payload, correlationId }; }
export function isFocusTubeMessage(message) { return message?.namespace === "focustube" && Object.values(MESSAGE).includes(message.type); }
export function sendMessage(type, payload = {}, correlationId = "") {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(makeRequest(type, payload, correlationId), response => {
        const runtimeError = chrome.runtime.lastError;
        resolve(runtimeError ? { ok: false, errorCode: "CONTEXT_INVALIDATED", userMessage: "FocusTube was reloaded. Refresh YouTube and try again." } : response || { ok: false, errorCode: "EMPTY_RESPONSE", userMessage: "FocusTube did not respond. Try again." });
      });
    } catch {
      resolve({ ok: false, errorCode: "CONTEXT_INVALIDATED", userMessage: "FocusTube was reloaded. Refresh YouTube and try again." });
    }
  });
}
