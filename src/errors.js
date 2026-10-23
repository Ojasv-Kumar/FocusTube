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
    NETWORK_ERROR: "Could not connect to FocusTube's local backend. Start it, then retry or use native YouTube results.",
    QUOTA_ERROR: "The optional YouTube API provider is disabled. Use native YouTube results or the HTML retrieval fallback.",
    LLM_ERROR: "AI curation is unavailable. Retry after the local backend recovers or use native YouTube results.",
    PARSE_ERROR: "The AI response could not be understood. You can retry or show original results.",
    CONFIG_ERROR: error?.message || "Check FocusTube's local backend configuration.",
    TIMEOUT_ERROR: "The request took too long. You can retry or show original results.",
    CANCELLED: "This request was replaced by a newer action.",
    BAD_KEY: "The configured AI provider rejected a key. Check the local backend settings.",
    RATE_LIMITED: "The configured AI provider is rate limiting requests. Wait a moment and retry.",
    PROVIDER_DOWN: "The configured AI provider is temporarily unavailable. Try again shortly.",
    PERMISSION_DENIED: "FocusTube could not reach the local backend. Check its loopback address and host permission.",
    EMPTY_RESULTS: "No useful videos were found. Try a broader search or show original results."
  };
  return { errorCode: code, userMessage: messages[code] || "FocusTube hit a problem. You can retry or return to YouTube results." };
}
