import { CONFIG } from "../config.js";
import { logger } from "../logger.js";
import { friendlyError } from "../errors.js";
import { normalizeQuery } from "../utils.js";
import { Cache, cacheKey } from "./cache.js";
import { LlmClient } from "./llm-client.js";
import { QUERY_EXPANSION, LEARN_JUDGE, INTEREST_EXPANSION, INTEREST_JUDGE, CURIOSITY_JUDGE } from "./prompts.js";
import { validateLearnJudge, validateInterestJudge, validateCuriosityJudge, validateQueries } from "./validators.js";
import { retrieveQueries, mergeVideos, interleaveQueryResults } from "./retrieval/index.js";

const inFlight = new Map();
const ROLE_ORDER = { intro: 0, deep_dive: 1, hands_on: 2, reference: 3, other: 4 };
const SEED_URL = chrome.runtime.getURL("data/curiosity-seed-channels.json");
async function loadJson(url) { const response = await fetch(url); if (!response.ok) throw new Error(`Fixture read failed: ${response.status}`); return response.json(); }
function cacheStorage() { return new Cache(chrome.storage.local); }
function candidateShape(video) {
  return { id: video.id, title: String(video.title || "").slice(0, CONFIG.Pipeline.titleMaxChars), channelName: String(video.channelName || "").slice(0, CONFIG.Pipeline.channelNameMaxChars), durationSeconds: video.durationSeconds, views: video.viewCount, uploadAge: video.publishedText, description: String(video.description || "").slice(0, CONFIG.Pipeline.maxDescriptionChars) };
}
function sortLearn(videos) {
  return videos.sort((a, b) => (ROLE_ORDER[a.role] ?? 4) - (ROLE_ORDER[b.role] ?? 4) || ((b.relevance || 0) + (b.quality || 0)) - ((a.relevance || 0) + (a.quality || 0)));
}
function diversifyChannels(videos, limit, maxPerChannel = 2) {
  const selected = [], counts = new Map(), deferred = [];
  for (const video of videos) {
    const channel = String(video.channelName || "").trim().toLocaleLowerCase() || `unknown:${video.id}`;
    if ((counts.get(channel) || 0) >= maxPerChannel) { deferred.push(video); continue; }
    selected.push(video);
    counts.set(channel, (counts.get(channel) || 0) + 1);
    if (selected.length >= limit) return selected;
  }
  for (const video of deferred) {
    selected.push(video);
    if (selected.length >= limit) break;
  }
  return selected;
}
function safeAiFailure(error) {
  return String(error?.message || "Gemini could not complete the ranking request.")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted API key]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 220);
}
async function loadMock(mode, query, action) {
  if (action === "home") {
    const data = await loadJson(chrome.runtime.getURL("data/mock-responses/home.json"));
    return data[mode] || { videos: [] };
  }
  if (mode !== "learn") return { videos: [] };
  const all = await loadJson(chrome.runtime.getURL("data/mock-responses/learn.json"));
  const key = Object.keys(all).find(item => normalizeQuery(query).toLocaleLowerCase().includes(item));
  return key ? all[key] : { videos: [] };
}
function baseMetadata(startedAt) { return { providers: [], cacheHit: false, tokenEstimate: 0, timingsMs: {}, degraded: false, reason: null, fallbackLabel: null, channels: [] }; }
function pipelineCacheKey(mode, query, interest, action, settings) {
  return cacheKey({ mode, query: normalizeQuery(query).toLocaleLowerCase(), interest: normalizeQuery(interest).toLocaleLowerCase(), action,
    curiosityFeedVersion: "balanced-topic-mix-v3",
    retrievalProvider: settings.retrievalProvider || CONFIG.Retrieval.defaultProvider, hasYoutubeApiKey: Boolean(settings.youtubeApiKey),
    prompts: [QUERY_EXPANSION.version, LEARN_JUDGE.version, INTEREST_EXPANSION.version, INTEREST_JUDGE.version, CURIOSITY_JUDGE.version],
    mockMode: settings.mockMode, resultsPerSearch: settings.resultsPerSearch, curiosityStrictness: settings.curiosityStrictness, pipelineConfig: CONFIG.Pipeline });
}
async function cachedExpansion(cache, keyParts, prompt, llm, correlationId) {
  const key = cacheKey({ kind: "expansion", ...keyParts });
  const cached = await cache.get(key);
  if (cached) return { value: cached, hit: true };
  const value = await llm.completeJson({ ...prompt, task: "expand", correlationId });
  await cache.set(key, value, CONFIG.Cache.ttlMs.expansion);
  return { value, hit: false };
}
async function retrieveWithCache(queries, settings, cache, htmlFetchImpl) {
  const groups = new Array(queries.length);
  const providers = new Set();
  const missing = [];
  const keys = queries.map(query => cacheKey({ kind: "retrieval", query: normalizeQuery(query).toLocaleLowerCase(), provider: settings.retrievalProvider || CONFIG.Retrieval.defaultProvider, hasApiKey: Boolean(settings.youtubeApiKey), resultCount: CONFIG.Pipeline.resultsPerQuery, minimumDuration: CONFIG.Pipeline.minimumVideoDurationSeconds, shortsMaxDuration: CONFIG.Pipeline.shortsMaxDurationSeconds, excludeLive: CONFIG.Pipeline.excludeLiveStreams }));
  for (let index = 0; index < queries.length; index += 1) {
    const cached = await cache.get(keys[index]);
    if (cached) { groups[index] = cached.videos; cached.providers?.forEach(provider => providers.add(provider)); }
    else missing.push(index);
  }
  let lastError = null;
  if (missing.length) {
    const fresh = await retrieveQueries(missing.map(index => queries[index]), settings, { htmlFetchImpl });
    fresh.providers.forEach(provider => providers.add(provider));
    lastError = fresh.error;
    for (let offset = 0; offset < missing.length; offset += 1) {
      const index = missing[offset];
      groups[index] = fresh.queryResults?.[offset] || [];
      if (groups[index].length) await cache.set(keys[index], { videos: groups[index], providers: fresh.providers }, CONFIG.Cache.ttlMs.retrieval);
    }
  }
  return { videos: mergeVideos(groups.map(group => group || [])), queryResults: groups, providers: [...providers], error: groups.flat().length ? null : lastError, cacheHit: queries.some((_, index) => !missing.includes(index)) };
}

export async function runPipeline(request, settings, { cache = cacheStorage(), correlationId = "", isCurrent = () => true, htmlFetchImpl } = {}) {
  const startedAt = Date.now();
  const mode = request.mode || "learn";
  const action = request.action || "search";
  const query = normalizeQuery(request.query, CONFIG.Pipeline.queryMaxChars);
  const interest = normalizeQuery(request.interest || settings.interestText, CONFIG.ModesPicker.interestMaxChars);
  const metadata = baseMetadata(startedAt);
  if (!["learn", "interest", "curiosity"].includes(mode)) return { ok: true, videos: [], metadata };
  if (mode === "learn" && !query) return { ok: false, errorCode: "EMPTY_QUERY", userMessage: "Enter a topic to see a focused learning path." };
  if (mode === "interest" && !interest) return { ok: false, errorCode: "EMPTY_INTEREST", userMessage: "Choose an interest first, then retry this view." };
  const key = pipelineCacheKey(mode, query, interest, action, settings);
  const inMemory = inFlight.get(key);
  if (inMemory) return inMemory;
  const operation = (async () => {
    const cached = await cache.get(key);
    if (cached) { cached.metadata.cacheHit = true; cached.metadata.timingsMs.total = Date.now() - startedAt; return cached; }
    try {
      if (settings.mockMode) {
        const fixture = await loadMock(mode, action === "home" ? "" : query, action);
      const videos = (fixture.videos || []).slice(0, settings.resultsPerSearch || CONFIG.Pipeline.maxVideosShown);
        const result = videos.length ? { ok: true, videos, channels: fixture.channels || [], metadata: { ...metadata, providers: ["mock"], tokenEstimate: 0, timingsMs: { total: Date.now() - startedAt }, channels: fixture.channels || [] } } : { ok: false, errorCode: "EMPTY_RESULTS", userMessage: "This mock fixture does not cover that query. Try backpropagation, op amp basics, or recursion in python." };
        if (result.ok) await cache.set(key, result, CONFIG.Cache.ttlMs.pipeline);
        return result;
      }
      if (mode === "interest" && action === "home" && interest.length < CONFIG.ModesPicker.interestMinChars) return { ok: false, errorCode: "EMPTY_INTEREST", userMessage: "Add a little more detail to your interest." };

      const llm = new LlmClient(settings);
      let queries = [query], rawCandidates = [], channels = [], retrieval = { videos: [], providers: [], error: null }, aiError = null, rankError = null;
      const retrievalStart = Date.now();
      if (mode === "learn") {
        try {
          const expansion = await cachedExpansion(cache, { version: QUERY_EXPANSION.version, query: query.toLocaleLowerCase(), queryCount: CONFIG.Pipeline.queriesPerSearch }, { system: QUERY_EXPANSION.system, user: QUERY_EXPANSION.user({ query, count: CONFIG.Pipeline.queriesPerSearch }), maxTokens: CONFIG.LLM.maxOutputTokens.expansion, temperature: CONFIG.LLM.temperature.expansion }, llm, correlationId);
          metadata.cacheHit ||= expansion.hit;
          queries = validateQueries(expansion.value, query, CONFIG.Pipeline.queriesPerSearch);
        } catch (error) { aiError = error; logger.warn("pipeline", `query expansion failed (${correlationId})`, error.code || error.name); }
        retrieval = await retrieveWithCache(queries, settings, cache, htmlFetchImpl); metadata.cacheHit ||= retrieval.cacheHit;
        rawCandidates = retrieval.videos;
      } else if (mode === "interest") {
        if (action === "home") {
          try {
            const expansion = await cachedExpansion(cache, { version: INTEREST_EXPANSION.version, interest: interest.toLocaleLowerCase() }, { system: INTEREST_EXPANSION.system, user: INTEREST_EXPANSION.user({ interest }), maxTokens: CONFIG.LLM.maxOutputTokens.expansion, temperature: CONFIG.LLM.temperature.expansion }, llm, correlationId);
            metadata.cacheHit ||= expansion.hit;
            queries = (Array.isArray(expansion.value?.queries) ? expansion.value.queries : []).map(item => normalizeQuery(item, CONFIG.Pipeline.queryMaxChars)).filter(Boolean).slice(0, CONFIG.Pipeline.interestFeedQueries);
            channels = (Array.isArray(expansion.value?.channels) ? expansion.value.channels : []).map(item => String(item).trim().slice(0, CONFIG.Pipeline.channelSuggestionMaxChars)).filter(Boolean).slice(0, CONFIG.Pipeline.interestChannelSuggestions);
          } catch (error) { aiError = error; queries = interest.split(/[,;]+/).map(part => part.trim()).filter(Boolean).slice(0, CONFIG.Pipeline.interestFallbackQueries); }
        } else queries = [query];
        if (!queries.length) queries = [interest];
        retrieval = await retrieveWithCache(queries, settings, cache, htmlFetchImpl); metadata.cacheHit ||= retrieval.cacheHit; rawCandidates = action === "home" ? interleaveQueryResults(retrieval.queryResults) : retrieval.videos;
      } else {
        try { channels = (await loadJson(SEED_URL)).slice(0, CONFIG.Pipeline.curiositySeedChannelsPerFeed).map(item => item.name); } catch { channels = []; }
        if (action === "home") queries = [...channels, ...CONFIG.Pipeline.curiosityTopicQueries].slice(0, CONFIG.Pipeline.curiositySeedChannelsPerFeed + CONFIG.Pipeline.curiosityTopicQueries.length);
        else queries = [query];
        retrieval = await retrieveWithCache(queries, settings, cache, htmlFetchImpl); metadata.cacheHit ||= retrieval.cacheHit; rawCandidates = action === "home" ? interleaveQueryResults(retrieval.queryResults) : retrieval.videos;
      }
      metadata.providers = retrieval.providers;
      metadata.timingsMs.retrieval = Date.now() - retrievalStart;
      if (!rawCandidates.length) {
        if (retrieval.error) { const error = friendlyError(retrieval.error); return { ok: false, ...error }; }
        return { ok: false, errorCode: "EMPTY_RESULTS", userMessage: "No videos were found. Try another search or show original YouTube results." };
      }
      if (!isCurrent()) return { ok: false, errorCode: "CANCELLED", userMessage: "A newer request replaced this one." };
      const candidateVideos = rawCandidates.slice(0, CONFIG.Pipeline.maxCandidatePoolSize);
      const pool = candidateVideos.map(candidateShape);
      let judged = [];
      const judgingStart = Date.now();
      try {
        if (mode === "learn") {
          const data = await llm.completeJson({ task: "judge", system: LEARN_JUDGE.system, user: LEARN_JUDGE.user({ query, candidates: pool }), maxTokens: CONFIG.LLM.maxOutputTokens.judge, temperature: CONFIG.LLM.temperature.judge, correlationId });
          judged = validateLearnJudge(data, candidateVideos).videos;
          judged = judged.filter(video => video.relevance >= CONFIG.Pipeline.minimumRelevance);
          judged = sortLearn(judged);
        } else if (mode === "interest") {
          const data = await llm.completeJson({ task: "judge", system: INTEREST_JUDGE.system, user: INTEREST_JUDGE.user({ interest: action === "home" ? interest : `${interest}; search: ${query}`, candidates: pool }), maxTokens: CONFIG.LLM.maxOutputTokens.judge, temperature: CONFIG.LLM.temperature.judge, correlationId });
          judged = validateInterestJudge(data, candidateVideos).videos.filter(video => video.relevance >= CONFIG.Pipeline.minimumRelevance).sort((a,b)=>(b.relevance+b.quality)-(a.relevance+a.quality));
        } else {
          const data = await llm.completeJson({ task: "score", system: CURIOSITY_JUDGE.system, user: CURIOSITY_JUDGE.user({ candidates: pool }), maxTokens: CONFIG.LLM.maxOutputTokens.judge, temperature: CONFIG.LLM.temperature.judge, correlationId });
          const strictnessLimit = { relaxed: 0.9, balanced: CONFIG.Pipeline.curiosityMaximumSensationalScore, strict: 0.55 }[settings.curiosityStrictness] ?? CONFIG.Pipeline.curiosityMaximumSensationalScore;
          judged = validateCuriosityJudge(data, candidateVideos).videos.filter(video => video.sensational < strictnessLimit && video.substance >= CONFIG.Pipeline.minimumRelevance).sort((a,b)=>b.substance-a.substance);
          if (action === "home") judged.sort((a,b) => b.substance-a.substance);
        }
      } catch (error) { aiError = error; rankError = error; logger.warn("pipeline", `AI judging failed (${correlationId})`, error.code || error.name); }
      metadata.timingsMs.judging = Date.now() - judgingStart;
      metadata.tokenEstimate = llm.tokenEstimate;
      metadata.llmProviders = [...llm.providers];
      metadata.usedFallback = llm.usedFallback;
      if (!isCurrent()) return { ok: false, errorCode: "CANCELLED", userMessage: "A newer request replaced this one." };
      if ((aiError || rankError) && mode === "learn") return { ok: false, errorCode: aiError?.code || rankError?.code || "AI_UNAVAILABLE", userMessage: "FocusTube curation is unavailable right now. Native YouTube results are restored. Check Gemini settings, then retry." };
      if (rankError && (mode === "interest" || mode === "curiosity")) {
        // Keep these browsing modes useful when retrieval worked but the
        // ranking provider did not. Never imply that these candidates were
        // AI curated; make the fallback explicit in the feed.
        judged = candidateVideos.map(video => ({ ...video, reason: "Retrieved from YouTube search; not AI-ranked." }));
        metadata.degraded = true;
        metadata.reason = rankError?.code || "AI_UNAVAILABLE";
        const aiTask = mode === "curiosity" ? "Gemini substance scoring" : "Gemini relevance ranking";
        metadata.fallbackLabel = `${aiTask} unavailable (${metadata.reason}). ${safeAiFailure(rankError)} These are unranked YouTube search matches.`;
      }
      const resultLimit = Math.min(CONFIG.Pipeline.maxVideosShown, settings.resultsPerSearch || CONFIG.Pipeline.maxVideosShown);
      const videos = mode === "curiosity" && action === "home"
        ? diversifyChannels(judged, resultLimit)
        : judged.slice(0, resultLimit);
      if (!videos.length) return { ok: false, errorCode: "EMPTY_RESULTS", userMessage: "No videos met the quality threshold. Try a broader query or show original results." };
      if (!metadata.degraded) {
        metadata.degraded = Boolean(aiError);
        metadata.reason = aiError ? aiError.code || "AI_UNAVAILABLE" : null;
        metadata.fallbackLabel = llm.usedFallback ? "A configured AI backup was used for this path." : null;
      } else if (!metadata.fallbackLabel && aiError) {
        metadata.fallbackLabel = "Query expansion fell back to a simpler search. Results were still reviewed.";
      }
      metadata.channels = channels.map(name => ({ name, reason: "Suggested as a useful channel for this interest." }));
      metadata.timingsMs.total = Date.now() - startedAt;
      const result = { ok: true, videos, channels: metadata.channels, metadata };
      await cache.set(key, result, CONFIG.Cache.ttlMs.pipeline);
      logger.info("pipeline", `completed ${mode}/${action} ${correlationId}: ${videos.length} videos; degraded=${metadata.degraded}`);
      return result;
    } catch (error) {
      logger.error("pipeline", `failed ${mode}/${action} ${correlationId}`, error?.code || error?.name || "UNKNOWN");
      const mapped = friendlyError(error);
      return { ok: false, ...mapped };
    }
  })();
  inFlight.set(key, operation);
  try { return await operation; } finally { inFlight.delete(key); }
}
