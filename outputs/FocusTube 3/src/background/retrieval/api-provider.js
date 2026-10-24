import { CONFIG } from "../../config.js";
import { fetchWithTimeout, globalFetch, promiseWithTimeout } from "../network.js";
import { NetworkError, QuotaError, ConfigError } from "../../errors.js";
import { pacificDateKey, canSpendQuota, addQuotaUsage } from "../quota.js";

export function parseIsoDuration(value) {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(String(value || ""));
  if (!match || !match[1] && !match[2] && !match[3] && !match[4]) return null;
  const total = Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0);
  return Number.isFinite(total) ? Math.floor(total) : null;
}
function quotaError(response) {
  const reason = response?.error?.errors?.[0]?.reason;
  if (["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"].includes(reason)) return new QuotaError();
  if (["keyInvalid", "accessNotConfigured"].includes(reason) || [401, 403].includes(response?.error?.code)) return new ConfigError("The YouTube API key is invalid or YouTube Data API v3 is not enabled for it.");
  return null;
}
let quotaRequestQueue = Promise.resolve();
export class ApiProvider {
  constructor({ apiKey, storage = chrome.storage.local, fetchImpl = globalFetch, timeoutMs = CONFIG.Retrieval.requestTimeoutMs } = {}) {
    this.apiKey = apiKey;
    this.storage = storage;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }
  async reserveQuota(kind, cost) {
    if (!this.apiKey) throw new ConfigError("Add a YouTube Data API key in FocusTube Options, or use HTML retrieval.");
    const quotaKey = "focustube.apiQuota", today = pacificDateKey();
    const stored = (await this.storage.get(quotaKey))[quotaKey];
    const usage = stored?.dateKey === today ? stored : { dateKey: today, searchCalls: 0, searchUnits: 0, otherUnits: 0 };
    const delta = kind === "search" ? { searchCalls: 1, searchUnits: cost, otherUnits: 0 } : { searchCalls: 0, searchUnits: 0, otherUnits: cost };
    const limits = { searchCalls: CONFIG.Retrieval.apiDailySearchCalls, searchUnits: CONFIG.Retrieval.apiDailySearchUnits, otherUnits: CONFIG.Retrieval.apiDailyQuotaLimit };
    if (!canSpendQuota(usage, delta, limits)) throw new QuotaError("FocusTube's estimated YouTube API daily budget is exhausted.");
    // Reserve before the network call to prevent concurrent topic searches from losing quota increments.
    await this.storage.set({ [quotaKey]: addQuotaUsage(usage, delta, today) });
    return { quotaKey, today, usage, delta };
  }
  async request(kind, params, cost) {
    // Serialize quota reservations only; do not serialize the network itself.
    const reservation = quotaRequestQueue.then(() => this.reserveQuota(kind, cost));
    quotaRequestQueue = reservation.then(() => undefined, () => undefined);
    const reserved = await reservation;
    return this.performRequest(kind, params, reserved);
  }
  async performRequest(kind, params, _reserved) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${kind}`);
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    // YouTube Data API v3 accepts API keys as the standard key query parameter. Never log this URL.
    url.searchParams.set("key", this.apiKey);
    let response;
    try {
      response = await fetchWithTimeout(this.fetch, url.toString(), { method: "GET", cache: "no-store" }, this.timeoutMs, "YouTube Data API request");
    } catch (cause) {
      if (cause?.code === "TIMEOUT_ERROR") {
        cause.code = "YOUTUBE_API_TIMEOUT";
        throw cause;
      }
      const error = new NetworkError("The extension could not reach YouTube Data API v3.", { cause });
      error.code = "YOUTUBE_API_UNAVAILABLE";
      throw error;
    }
    let payload;
    try { payload = await promiseWithTimeout(response.json(), this.timeoutMs, "YouTube Data API response"); }
    catch (cause) {
      if (cause?.code === "TIMEOUT_ERROR") { cause.code = "YOUTUBE_API_TIMEOUT"; throw cause; }
      payload = null;
    }
    if (!response.ok) throw quotaError(payload) || new NetworkError(`YouTube Data API returned HTTP ${response.status}.`);
    if (!payload || typeof payload !== "object") throw new NetworkError("YouTube Data API returned unreadable data.");
    return payload;
  }
  async testConnection() {
    const payload = await this.request("search", { part: "snippet", type: "video", q: "FocusTube connectivity test", maxResults: 1 }, CONFIG.Retrieval.searchListCost);
    return { ok: true, provider: "youtube-data-api", resultCount: Array.isArray(payload.items) ? payload.items.length : 0 };
  }
  async search(query, options = {}) {
    const search = await this.request("search", {
      part: "snippet", type: "video", q: query,
      maxResults: Math.max(1, Math.min(25, Number(options.maxResults) || CONFIG.Pipeline.resultsPerQuery))
    }, CONFIG.Retrieval.searchListCost);
    const ids = (search.items || []).map(item => item?.id?.videoId).filter(Boolean);
    if (!ids.length) return [];
    const details = await this.request("videos", {
      part: "snippet,contentDetails,statistics,liveStreamingDetails", id: ids.join(",")
    }, CONFIG.Retrieval.videosListCost);
    return (details.items || []).map(item => {
      const durationSeconds = parseIsoDuration(item?.contentDetails?.duration);
      return {
        id: String(item?.id || ""), title: String(item?.snippet?.title || ""),
        channelName: String(item?.snippet?.channelTitle || ""), channelId: item?.snippet?.channelId || null,
        durationSeconds, viewCount: Number.isFinite(Number(item?.statistics?.viewCount)) ? Number(item.statistics.viewCount) : null,
        publishedText: item?.snippet?.publishedAt || "", publishedAt: item?.snippet?.publishedAt || null,
        description: String(item?.snippet?.description || "").slice(0, CONFIG.Pipeline.maxDescriptionChars),
        thumbnailUrl: item?.snippet?.thumbnails?.medium?.url || item?.snippet?.thumbnails?.default?.url || "",
        isLive: Boolean(item?.liveStreamingDetails?.actualStartTime && !item?.liveStreamingDetails?.actualEndTime),
        isShort: durationSeconds !== null && durationSeconds <= CONFIG.Pipeline.shortsMaxDurationSeconds
      };
    }).filter(video => video.id && video.title);
  }
}
