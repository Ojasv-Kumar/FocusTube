export const MESSAGE = Object.freeze({
  GET_SETTINGS: "GET_SETTINGS", SAVE_SETTINGS: "SAVE_SETTINGS", SET_MODE: "SET_MODE", SET_LEARN_TIMER: "SET_LEARN_TIMER",
  RUN_PIPELINE: "RUN_PIPELINE", TEST_LLM: "TEST_LLM", TEST_YOUTUBE_API: "TEST_YOUTUBE_API",
  CLEAR_CACHE: "CLEAR_CACHE", PREWARM: "PREWARM", SELECTOR_HEALTH: "SELECTOR_HEALTH", OLLAMA_HEALTH: "OLLAMA_HEALTH"
});
export function makeRequest(type, payload = {}, correlationId = "") { return { namespace: "focustube", type, payload, correlationId }; }
export function isFocusTubeMessage(message) { return message?.namespace === "focustube" && Object.values(MESSAGE).includes(message.type); }
export function sendMessage(type, payload = {}, correlationId = "") {
  return new Promise((resolve) => {
    let settled = false;
    const deadline = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, errorCode: "REQUEST_TIMEOUT", userMessage: "FocusTube did not finish this request within 60 seconds. The page stopped waiting; check the feed status and retry." });
    }, 60_000);
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(value);
    };
    try {
      chrome.runtime.sendMessage(makeRequest(type, payload, correlationId), response => {
        const runtimeError = chrome.runtime.lastError;
        finish(runtimeError ? { ok: false, errorCode: "CONTEXT_INVALIDATED", userMessage: "FocusTube was reloaded. Refresh YouTube and try again." } : response || { ok: false, errorCode: "EMPTY_RESPONSE", userMessage: "FocusTube did not respond. Try again." });
      });
    } catch {
      finish({ ok: false, errorCode: "CONTEXT_INVALIDATED", userMessage: "FocusTube was reloaded. Refresh YouTube and try again." });
    }
  });
}
