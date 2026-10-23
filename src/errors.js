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
    NETWORK_ERROR: "Could not connect. Check your connection, then try again.",
    QUOTA_ERROR: "The YouTube API quota is exhausted. Switch retrieval to HTML or show original results.",
    LLM_ERROR: "AI ranking is unavailable. You can retry or show original YouTube results.",
    PARSE_ERROR: "The AI response could not be understood. You can retry or show original results.",
    CONFIG_ERROR: error?.message || "Check the provider settings in FocusTube options.",
    TIMEOUT_ERROR: "The request took too long. You can retry or show original results.",
    CANCELLED: "This request was replaced by a newer action.",
    BAD_KEY: "The provider rejected the API key. Check it in FocusTube options.",
    RATE_LIMITED: "The provider is rate limiting requests. Wait a moment and retry.",
    PROVIDER_DOWN: "The AI provider is temporarily unavailable. Try again shortly.",
    PERMISSION_DENIED: "FocusTube does not have access to this provider host. Grant access in options.",
    EMPTY_RESULTS: "No useful videos were found. Try a broader search or show original results."
  };
  return { errorCode: code, userMessage: messages[code] || "FocusTube hit a problem. You can retry or return to YouTube results." };
}
