export class FocusTubeError extends Error {
  constructor(message, code, options = {}) { super(message, options); this.name = this.constructor.name; this.code = code; }
}
export class NetworkError extends FocusTubeError { constructor(message = "YouTube search could not be loaded.", options) { super(message, "NETWORK_ERROR", options); } }
export class CancelledError extends FocusTubeError { constructor(message = "This request was replaced by a newer action.", options) { super(message, "CANCELLED", options); } }

export function friendlyError(error) {
  const messages = {
    NETWORK_ERROR: "FocusTube could not read YouTube search in this tab. Retry or switch to Relax.",
    YOUTUBE_CONSENT_REQUIRED: "YouTube needs a consent or traffic check in this tab. Complete it in Relax, then retry Learn.",
    YOUTUBE_HTML_PARSE_FAILED: "YouTube search changed format and FocusTube could not read its video results. Switch to Relax to use native results.",
    EMPTY_RESULTS: "No clearly relevant videos were found. Try a broader search or switch to Relax.",
    EMPTY_QUERY: "Enter a topic to see focused search results.",
    CANCELLED: "A newer search replaced this one."
  };
  return { errorCode: error?.code || "UNKNOWN_ERROR", userMessage: messages[error?.code] || "FocusTube could not update this page. Refresh or switch to Relax." };
}
