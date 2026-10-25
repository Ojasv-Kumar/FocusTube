import { globalFetch } from "../network.js";

const YOUTUBE_ORIGIN = "https://www.youtube.com";

/** Create a search-page fetch that uses YouTube's own page origin when possible. */
export function createYouTubeTabFetch({ scripting, tabId, fallbackFetch = globalFetch } = {}) {
  if (!Number.isInteger(tabId) || typeof scripting?.executeScript !== "function") return fallbackFetch;
  return async url => {
    const target = new URL(url);
    if (target.origin !== YOUTUBE_ORIGIN) throw new TypeError("FocusTube only fetches YouTube search pages.");
    try {
      const [injected] = await scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: async requestUrl => {
          try {
            const targetUrl = new URL(requestUrl);
            if (targetUrl.origin !== location.origin || location.origin !== "https://www.youtube.com") return { ok: false, status: 0, html: "" };
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 8000);
            try {
              const response = await fetch(targetUrl.href, { method: "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal });
              return { ok: response.ok, status: response.status, html: await response.text() };
            } finally { clearTimeout(timer); }
          } catch { return { ok: false, status: 0, html: "" }; }
        },
        args: [target.href]
      });
      if (!injected?.result) throw new Error("YouTube page fetch returned no response.");
      if (injected.result.status === 0 || (!injected.result.ok && injected.result.status === undefined)) {
        throw new Error("YouTube page fetch failed or timed out before an HTTP response.");
      }
      return { ok: injected.result.ok, status: injected.result.status, text: async () => injected.result.html || "" };
    } catch {
      // Retain the ordinary extension fetch for browsers that reject MAIN-world injection.
      return fallbackFetch(target.href, { method: "GET", credentials: "omit", cache: "no-store" });
    }
  };
}
