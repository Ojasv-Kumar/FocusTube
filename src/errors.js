export class FocusTubeError extends Error {
  constructor(message, code, options = {}) { super(message, options); this.name = this.constructor.name; this.code = code; }
}
export class NetworkError extends FocusTubeError { constructor(message = "Network request failed.", options) { super(message, "NETWORK_ERROR", options); } }
export class QuotaError extends FocusTubeError { constructor(message = "The daily YouTube API quota is exhausted.", options) { super(message, "QUOTA_ERROR", options); } }
export class LlmError extends FocusTubeError { constructor(message = "The AI provider could not complete this request.", options) { super(message, "LLM_ERROR", options); } }
export class ParseError extends FocusTubeError { constructor(message = "The AI response was not valid JSON.", options) { super(message, "PARSE_ERROR", options); } }
export class ConfigError extends FocusTubeError { constructor(message = "Settings need attention.", options) { super(message, "CONFIG_ERROR", options); } }
export class TimeoutError extends FocusTubeError { constructor(message = "The request timed out.", options) { super(message, "TIMEOUT_ERROR", options); } }
export class CancelledError extends FocusTubeError { constructor(message = "This request is no longer current.", options) { super(message, "CANCELLED", options); } }

export function friendlyError(error) {
  const code = error?.code || "UNKNOWN_ERROR";
  const messages = {
    NETWORK_ERROR: error?.message ? `A network request failed before an HTTP response: ${error.message}` : "A network request failed. Check the service named in FocusTube's diagnostics, then retry or show original YouTube results.",
    MISSING_GEMINI_HOST_PERMISSION: error?.message || "Allow FocusTube to contact Google's Gemini API in the browser's extension permission prompt.",
    YOUTUBE_API_UNAVAILABLE: "YouTube Data API retrieval failed. FocusTube tried the HTML fallback too; check the API key or choose HTML retrieval, then retry.",
    YOUTUBE_HTML_FETCH_FAILED: "FocusTube could not fetch YouTube search. Check this browser's connection, VPN, or network filtering, then retry or show original results.",
    YOUTUBE_CONSENT_REQUIRED: "YouTube is asking this browser to confirm consent or verify traffic. Open YouTube normally, complete any prompt, then retry FocusTube.",
    YOUTUBE_HTML_PARSE_FAILED: "YouTube returned a search page FocusTube could not read. Use the YouTube API in Options or show original YouTube results.",
    QUOTA_ERROR: "The optional YouTube API provider is disabled. Use native YouTube results or the HTML retrieval fallback.",
    LLM_ERROR: "Gemini could not complete this request. Check the Gemini keys and model names in FocusTube Options, then retry.",
    PARSE_ERROR: "The AI response could not be understood. You can retry or show original results.",
    CONFIG_ERROR: error?.message || "Check FocusTube's API keys and model settings in Options.",
    TIMEOUT_ERROR: "The request took too long. You can retry or show original results.",
    CANCELLED: "This request was replaced by a newer action.",
    BAD_KEY: "Gemini rejected a configured key. Check the key in FocusTube Options.",
    RATE_LIMITED: "The configured AI provider is rate limiting requests. Wait a moment and retry.",
    PROVIDER_DOWN: "The configured AI provider is temporarily unavailable. Try again shortly.",
    PERMISSION_DENIED: "FocusTube cannot access the configured API. Check extension host permissions and the browser network policy.",
    EMPTY_RESULTS: "No useful videos were found. Try a broader search or show original results."
  };
  let userMessage = messages[code] || "FocusTube hit a problem. You can retry or return to YouTube results.";
  const failures = error?.providerFailures;
  if (Array.isArray(failures) && failures.length) {
    const detail = [...new Set(failures.map(item => `${item.provider}: ${item.code}`))].join("; ");
    userMessage += ` Retrieval attempts: ${detail}.`;
  }
  return { errorCode: code, userMessage };
}
