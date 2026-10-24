import { CONFIG } from "../config.js";
import { friendlyError } from "../errors.js";
import { normalizeQuery } from "../utils.js";
import { Cache, cacheKey } from "./cache.js";
import { retrieveQueries } from "./retrieval/index.js";

const inFlight = new Map();
const STOP = new Set("the a an and or for to of in on with from how what why is are do does learn beginner beginners tutorial guide basics basic explained explanation introduction intro complete full course".split(" "));
const tokenize = value => String(value || "").toLocaleLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(word => word.length > 1 && !STOP.has(word));

export function locallyRankVideos(videos, query, limit = CONFIG.Pipeline.maxVideosShown) {
  const queryTerms = [...new Set(tokenize(query))];
  if (!queryTerms.length) return [];
  const ranked = videos.map(video => {
    const title = String(video.title || "").toLocaleLowerCase();
    const description = String(video.description || "").toLocaleLowerCase();
    const channel = String(video.channelName || "").toLocaleLowerCase();
    const titleTerms = new Set(tokenize(title));
    const descriptionTerms = new Set(tokenize(description));
    const matched = queryTerms.filter(term => titleTerms.has(term) || descriptionTerms.has(term));
    const titleMatches = queryTerms.filter(term => titleTerms.has(term)).length;
    const score = Math.min(1, (matched.length / queryTerms.length) * 0.68 + (titleMatches / queryTerms.length) * 0.28 + (title.includes(query.toLocaleLowerCase()) ? 0.24 : 0) + (channel.includes(query.toLocaleLowerCase()) ? 0.08 : 0));
    return { ...video, relevance: score };
  }).filter(video => video.relevance >= CONFIG.Pipeline.minimumLocalRelevance)
    .sort((a, b) => b.relevance - a.relevance);
  const unique = [], titleSeen = new Set();
  for (const video of ranked) {
    const titleKey = tokenize(video.title).join(" ");
    if (!video.id || titleSeen.has(titleKey)) continue;
    titleSeen.add(titleKey); unique.push(video);
    if (unique.length >= limit) break;
  }
  return unique;
}

// Expand locally with generic search intents. This is deterministic query
// construction, not AI ranking; YouTube supplies the additional candidates.
export function relatedSearchQueries(query) {
  const clean = String(query || "").trim();
  if (!clean) return [];
  return [`${clean} explained`, `${clean} tutorial`];
}

export async function runPipeline(request, settings, { cache = new Cache(chrome.storage.local), correlationId = "", htmlFetchImpl = fetch } = {}) {
  const mode = request.mode || "learn";
  const query = normalizeQuery(request.query, CONFIG.Pipeline.queryMaxChars);
  if (mode !== "learn") return { ok: true, videos: [], metadata: { providers: [] } };
  if (!query) return { ok: false, errorCode: "EMPTY_QUERY", userMessage: "Enter a topic to see focused learning results." };
  const key = cacheKey({ mode, query: query.toLocaleLowerCase(), results: settings.resultsPerSearch, ranker: "local-v3-two-groups" });
  if (inFlight.has(key)) return inFlight.get(key);
  const operation = (async () => {
    const cached = await cache.get(key);
    if (cached) { cached.metadata.cacheHit = true; return cached; }
    try {
      const queries = [query, ...relatedSearchQueries(query)];
      const retrieval = await retrieveQueries(queries, settings, { htmlFetchImpl });
      if (!retrieval.videos.length) {
        if (retrieval.error) return { ok: false, ...friendlyError(retrieval.error) };
        return { ok: false, errorCode: "EMPTY_RESULTS", userMessage: "No matching videos were found. Try a broader topic or show original YouTube results." };
      }
      const groupLimit = Math.max(1, Math.floor(CONFIG.Pipeline.maxVideosShown / 2));
      const originalMatches = locallyRankVideos(retrieval.queryResults[0] || [], query, groupLimit)
        .map(video => ({ ...video, group: "relevant" }));
      const originalIds = new Set(originalMatches.map(video => video.id));
      const relatedMatches = locallyRankVideos(retrieval.queryResults.slice(1).flat(), query, groupLimit)
        .filter(video => !originalIds.has(video.id))
        .map(video => ({ ...video, group: "related" }));
      const videos = [...originalMatches, ...relatedMatches];
      if (!videos.length) return { ok: false, errorCode: "NO_RELEVANT_RESULTS", userMessage: "YouTube returned no videos that clearly match this topic. Try a broader search or show original YouTube results." };
      const result = { ok: true, videos, metadata: { providers: retrieval.providers, ranking: "local", searchGroups: ["relevant", "related"], correlationId, cacheHit: false } };
      await cache.set(key, result, CONFIG.Cache.ttlMs.pipeline);
      return result;
    } catch (error) { return { ok: false, ...friendlyError(error) }; }
  })();
  inFlight.set(key, operation);
  try { return await operation; } finally { inFlight.delete(key); }
}
