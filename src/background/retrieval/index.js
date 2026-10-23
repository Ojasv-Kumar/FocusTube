import { ConfigError } from "../../errors.js";
import { ApiProvider } from "./api-provider.js";
import { HtmlProvider } from "./html-provider.js";
import { CONFIG } from "../../config.js";

export function mergeVideos(groups, nearDuplicateThreshold = CONFIG.Pipeline.nearDuplicateSimilarity) {
  const unique = new Map();
  for (const video of groups.flat()) {
    if (!video?.id || !video.title) continue;
    const prior = unique.get(video.id);
    if (!prior) unique.set(video.id, video);
    else if ((video.description?.length || 0) > (prior.description?.length || 0)) unique.set(video.id, { ...prior, ...video });
  }
  const output = [];
  for (const video of unique.values()) {
    const tokens = new Set(video.title.toLocaleLowerCase().normalize("NFC").split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 2));
    const duplicate = output.some(other => {
      const otherTokens = new Set(other.title.toLocaleLowerCase().normalize("NFC").split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 2));
      const union = new Set([...tokens, ...otherTokens]);
      const intersection = [...tokens].filter(word => otherTokens.has(word)).length;
      return union.size > 0 && intersection / union.size >= nearDuplicateThreshold;
    });
    if (!duplicate) output.push(video);
  }
  return output;
}
export function selectProvider(settings, { apiKey = settings.youtubeApiKey } = {}) {
  const html = new HtmlProvider();
  const api = () => new ApiProvider({ apiKey });
  if (!CONFIG.Retrieval.apiProviderEnabled) return { provider: html, name: "html" };
  if (settings.retrievalProvider === "html") return { provider: html, name: "html" };
  if (settings.retrievalProvider === "api") {
    if (!apiKey) throw new ConfigError("Add a YouTube Data API key in options, or switch retrieval provider to HTML.");
    return { provider: api(), name: "api" };
  }
  return apiKey ? { provider: api(), name: "api" } : { provider: html, name: "html" };
}
export async function retrieveQueries(queries, settings, options = {}) {
  const groups = new Array(queries.length);
  const used = new Set();
  let cursor = 0, fatal = null;
  const names = CONFIG.Retrieval.apiProviderEnabled && settings.retrievalProvider !== "html" && settings.youtubeApiKey ? ["api", "html"] : ["html"];
  const concurrency = Math.max(1, Math.min(CONFIG.Pipeline.concurrency, queries.length || 1));
  const runWorker = async () => {
    while (cursor < queries.length) {
      const index = cursor++;
      let lastError = null;
      for (const name of names) {
        try {
          const { provider } = name === "api" && CONFIG.Retrieval.apiProviderEnabled ? { provider: new ApiProvider({ apiKey: settings.youtubeApiKey }) } : { provider: new HtmlProvider() };
          groups[index] = await provider.search(queries[index], { maxResults: CONFIG.Pipeline.resultsPerQuery });
          used.add(name); lastError = null; break;
        } catch (error) { lastError = error; if (name === "api") continue; }
      }
      if (lastError) fatal ||= lastError;
      if (!groups[index]) groups[index] = [];
    }
  };
  await Promise.all(Array.from({ length: concurrency }, runWorker));
  const eligible = video => !video.isShort && (!CONFIG.Pipeline.excludeLiveStreams || !video.isLive) && (!CONFIG.Pipeline.minimumVideoDurationSeconds || video.durationSeconds === null || video.durationSeconds >= CONFIG.Pipeline.minimumVideoDurationSeconds);
  const queryResults = groups.map(group => group.filter(eligible));
  return { videos: mergeVideos(queryResults), queryResults, providers: [...used], error: queryResults.flat().length ? null : fatal };
}
