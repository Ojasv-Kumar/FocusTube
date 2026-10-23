import { CONFIG } from "../../config.js";
import { NetworkError, QuotaError, ConfigError } from "../../errors.js";
import { pacificDateKey, canSpendQuota, addQuotaUsage } from "../quota.js";

export function parseIsoDuration(value) {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(String(value || ""));
  if (!match) return null;
  if (!match[1] && !match[2] && !match[3] && !match[4]) return null;
  const total = Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0);
  return Number.isFinite(total) ? Math.floor(total) : null;
}
function quotaError(response) {
  const reason = response?.error?.errors?.[0]?.reason;
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded" || reason === "rateLimitExceeded") return new QuotaError();
  if (reason === "keyInvalid" || reason === "accessNotConfigured" || response?.error?.code === 401) return new ConfigError("The YouTube API key is invalid or the Data API is not enabled.");
  return null;
}
async function readJson(response) { try { return await response.json(); } catch { throw new NetworkError("The YouTube API returned unreadable data."); } }
let quotaRequestQueue = Promise.resolve();
export class ApiProvider {
  constructor({ apiKey, storage = chrome.storage.local, fetchImpl = fetch }) { this.apiKey = apiKey; this.storage = storage; this.fetch = fetchImpl; }
  async request(url, cost, kind) {
    const operation = quotaRequestQueue.then(() => this.performRequest(url, cost, kind));
    quotaRequestQueue = operation.catch(() => {});
    return operation;
  }
  async performRequest(url, cost, kind) {
    if (!this.apiKey) throw new ConfigError("Add a YouTube Data API key in FocusTube options, or choose HTML retrieval.");
    const quotaKey = "focustube.apiQuota";
    const stored = (await this.storage.get(quotaKey))[quotaKey];
    const today = pacificDateKey();
    const usage = stored?.dateKey === today ? stored : { dateKey: today, searchCalls: 0, searchUnits: 0, otherUnits: 0 };
    const delta = kind === "search" ? { searchCalls: 1, searchUnits: cost, otherUnits: 0 } : { searchCalls: 0, searchUnits: 0, otherUnits: cost };
    const limits = { searchCalls: CONFIG.Retrieval.apiDailySearchCalls, searchUnits: CONFIG.Retrieval.apiDailySearchUnits, otherUnits: CONFIG.Retrieval.apiDailyQuotaLimit };
    if (!canSpendQuota(usage, delta, limits)) throw new QuotaError("FocusTube's estimated YouTube API daily budget is exhausted.");
    let response;
    try { response = await this.fetch(url); } catch (cause) { throw new NetworkError("Could not reach the YouTube Data API.", { cause }); }
    // Count the attempted request even if its response body is malformed.
    await this.storage.set({ [quotaKey]: addQuotaUsage(usage, delta, today) });
    const payload = await readJson(response);
    if (!response.ok) throw quotaError(payload) || new NetworkError(`YouTube Data API returned HTTP ${response.status}.`);
    return payload;
  }
  async search(query, options = {}) {
    const params = new URLSearchParams({ part: "snippet", type: "video", q: query, maxResults: String(options.maxResults || CONFIG.Pipeline.resultsPerQuery), key: this.apiKey });
    const search = await this.request(`https://www.googleapis.com/youtube/v3/search?${params}`, CONFIG.Retrieval.searchListCost, "search");
    const ids = (search.items || []).map(item => item?.id?.videoId).filter(Boolean);
    if (!ids.length) return [];
    const videoParams = new URLSearchParams({ part: "snippet,contentDetails,statistics,liveStreamingDetails", id: ids.join(","), key: this.apiKey });
    const details = await this.request(`https://www.googleapis.com/youtube/v3/videos?${videoParams}`, CONFIG.Retrieval.videosListCost, "other");
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
        // The Data API has no aspect-ratio or Shorts field; duration is a conservative proxy.
        isShort: durationSeconds !== null && durationSeconds <= CONFIG.Pipeline.shortsMaxDurationSeconds
      };
    }).filter(video => video.id && video.title);
  }
}
