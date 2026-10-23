import { CONFIG } from "../config.js";
import { logger } from "../logger.js";
import { friendlyError } from "../errors.js";
import { normalizeQuery } from "../utils.js";
import { Cache, cacheKey } from "./cache.js";
import { LlmClient } from "./llm-client.js";
import { QUERY_EXPANSION, LEARN_JUDGE, INTEREST_EXPANSION, INTEREST_JUDGE, CURIOSITY_JUDGE } from "./prompts.js";
import { validateLearnJudge, validateInterestJudge, validateCuriosityJudge, validateQueries } from "./validators.js";
import { retrieveQueries, mergeVideos } from "./retrieval/index.js";

const inFlight = new Map();
const ROLE_ORDER = { intro: 0, deep_dive: 1, hands_on: 2, reference: 3, other: 4 };
const SEED_URL = chrome.runtime.getURL("data/curiosity-seed-channels.json");
async function loadJson(url) { const response = await fetch(url); if (!response.ok) throw new Error(`Fixture read failed: ${response.status}`); return response.json(); }
function cacheStorage() { return new Cache(chrome.storage.local); }
function candidateShape(video) {
  return { id: video.id, title: String(video.title || "").slice(0, CONFIG.Pipeline.titleMaxChars), channelName: String(video.channelName || "").slice(0, CONFIG.Pipeline.channelNameMaxChars), durationSeconds: video.durationSeconds, views: video.viewCount, uploadAge: video.publishedText, description: String(video.description || "").slice(0, CONFIG.Pipeline.maxDescriptionChars) };
}
function simpleScore(video, query) {
  const words = normalizeQuery(query).toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 1);
  const haystack = `${video.title} ${video.description}`.toLocaleLowerCase();
  const matchScore = words.length ? words.filter(word => haystack.includes(word)).length / words.length : 0;
  return matchScore * 0.85 + Math.log10(Math.max(0, Number(video.viewCount) || 0) + 1) / 20;
}
function sortLearn(videos) {
  return videos.sort((a, b) => (ROLE_ORDER[a.role] ?? 4) - (ROLE_ORDER[b.role] ?? 4) || ((b.relevance || 0) + (b.quality || 0)) - ((a.relevance || 0) + (a.quality || 0)));
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
    prompts: [QUERY_EXPANSION.version, LEARN_JUDGE.version, INTEREST_EXPANSION.version, INTEREST_JUDGE.version, CURIOSITY_JUDGE.version],
    llmBaseUrl: settings.llmBaseUrl, fastModel: settings.fastModel, smartModel: settings.smartModel, retrievalProvider: settings.retrievalProvider, mockMode: settings.mockMode, pipelineConfig: CONFIG.Pipeline });
}
async function cachedExpansion(cache, keyParts, prompt, llm, correlationId) {
  const key = cacheKey({ kind: "expansion", ...keyParts });
  const cached = await cache.get(key);
  if (cached) return { value: cached, hit: true };
  const value = await llm.completeJson({ ...prompt, model: prompt.model, correlationId });
  await cache.set(key, value, CONFIG.Cache.ttlMs.expansion);
  return { value, hit: false };
}
async function retrieveWithCache(queries, settings, cache) {
  const groups = new Array(queries.length);
  const providers = new Set();
  const missing = [];
  const keys = queries.map(query => cacheKey({ kind: "retrieval", query: normalizeQuery(query).toLocaleLowerCase(), provider: settings.retrievalProvider, hasApiKey: Boolean(settings.youtubeApiKey), resultCount: CONFIG.Pipeline.resultsPerQuery, minimumDuration: CONFIG.Pipeline.minimumVideoDurationSeconds, shortsMaxDuration: CONFIG.Pipeline.shortsMaxDurationSeconds, excludeLive: CONFIG.Pipeline.excludeLiveStreams }));
  for (let index = 0; index < queries.length; index += 1) {
    const cached = await cache.get(keys[index]);
    if (cached) { groups[index] = cached.videos; cached.providers?.forEach(provider => providers.add(provider)); }
    else missing.push(index);
  }
  let lastError = null;
  if (missing.length) {
    const fresh = await retrieveQueries(missing.map(index => queries[index]), settings);
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

export async function runPipeline(request, settings, { cache = cacheStorage(), correlationId = "", isCurrent = () => true } = {}) {
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
        const videos = (fixture.videos || []).slice(0, CONFIG.Pipeline.maxVideosShown);
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
          const expansion = await cachedExpansion(cache, { version: QUERY_EXPANSION.version, query: query.toLocaleLowerCase(), queryCount: CONFIG.Pipeline.queriesPerSearch, baseUrl: settings.llmBaseUrl, model: settings.fastModel }, { system: QUERY_EXPANSION.system, user: QUERY_EXPANSION.user({ query, count: CONFIG.Pipeline.queriesPerSearch }), model: settings.fastModel, maxTokens: CONFIG.LLM.maxOutputTokens.expansion, temperature: CONFIG.LLM.temperature.expansion }, llm, correlationId);
          metadata.cacheHit ||= expansion.hit;
          queries = validateQueries(expansion.value, query, CONFIG.Pipeline.queriesPerSearch);
        } catch (error) { aiError = error; logger.warn("pipeline", `query expansion failed (${correlationId})`, error.code || error.name); }
        retrieval = await retrieveWithCache(queries, settings, cache); metadata.cacheHit ||= retrieval.cacheHit;
        rawCandidates = retrieval.videos;
      } else if (mode === "interest") {
        if (action === "home") {
          try {
            const expansion = await cachedExpansion(cache, { version: INTEREST_EXPANSION.version, interest: interest.toLocaleLowerCase(), baseUrl: settings.llmBaseUrl, model: settings.fastModel }, { system: INTEREST_EXPANSION.system, user: INTEREST_EXPANSION.user({ interest }), model: settings.fastModel, maxTokens: CONFIG.LLM.maxOutputTokens.expansion, temperature: CONFIG.LLM.temperature.expansion }, llm, correlationId);
            metadata.cacheHit ||= expansion.hit;
            queries = (Array.isArray(expansion.value?.queries) ? expansion.value.queries : []).map(item => normalizeQuery(item, CONFIG.Pipeline.queryMaxChars)).filter(Boolean).slice(0, CONFIG.Pipeline.interestFeedQueries);
            channels = (Array.isArray(expansion.value?.channels) ? expansion.value.channels : []).map(item => String(item).trim().slice(0, CONFIG.Pipeline.channelSuggestionMaxChars)).filter(Boolean).slice(0, CONFIG.Pipeline.interestChannelSuggestions);
          } catch (error) { aiError = error; queries = interest.split(/[,;]+/).map(part => part.trim()).filter(Boolean).slice(0, CONFIG.Pipeline.interestFallbackQueries); }
        } else queries = [query];
        if (!queries.length) queries = [interest];
        retrieval = await retrieveWithCache(queries, settings, cache); metadata.cacheHit ||= retrieval.cacheHit; rawCandidates = retrieval.videos;
      } else {
        try { channels = (await loadJson(SEED_URL)).slice(0, CONFIG.Pipeline.curiositySeedChannelsPerFeed).map(item => item.name); } catch { channels = []; }
        if (action === "home") queries = [...channels, ...CONFIG.Pipeline.curiosityTopicQueries].slice(0, CONFIG.Pipeline.curiositySeedChannelsPerFeed + CONFIG.Pipeline.curiosityTopicQueries.length);
        else queries = [query];
        retrieval = await retrieveWithCache(queries, settings, cache); metadata.cacheHit ||= retrieval.cacheHit; rawCandidates = retrieval.videos;
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
          const data = await llm.completeJson({ system: LEARN_JUDGE.system, user: LEARN_JUDGE.user({ query, candidates: pool }), model: settings.smartModel, maxTokens: CONFIG.LLM.maxOutputTokens.judge, temperature: CONFIG.LLM.temperature.judge, correlationId });
          judged = validateLearnJudge(data, candidateVideos).videos;
          judged = judged.filter(video => video.relevance >= CONFIG.Pipeline.minimumRelevance);
          judged = sortLearn(judged);
        } else if (mode === "interest") {
          const data = await llm.completeJson({ system: INTEREST_JUDGE.system, user: INTEREST_JUDGE.user({ interest: action === "home" ? interest : `${interest}; search: ${query}`, candidates: pool }), model: settings.smartModel, maxTokens: CONFIG.LLM.maxOutputTokens.judge, temperature: CONFIG.LLM.temperature.judge, correlationId });
          judged = validateInterestJudge(data, candidateVideos).videos.filter(video => video.relevance >= CONFIG.Pipeline.minimumRelevance).sort((a,b)=>(b.relevance+b.quality)-(a.relevance+a.quality));
        } else {
          const data = await llm.completeJson({ system: CURIOSITY_JUDGE.system, user: CURIOSITY_JUDGE.user({ candidates: pool }), model: settings.smartModel, maxTokens: CONFIG.LLM.maxOutputTokens.judge, temperature: CONFIG.LLM.temperature.judge, correlationId });
          judged = validateCuriosityJudge(data, candidateVideos).videos.filter(video => video.sensational < CONFIG.Pipeline.curiosityMaximumSensationalScore && video.substance >= CONFIG.Pipeline.minimumRelevance).sort((a,b)=>b.substance-a.substance);
          if (action === "home") {
            const seedNames = new Set(channels.map(name => name.toLocaleLowerCase()));
            judged.sort((a,b) => Number(seedNames.has(b.channelName.toLocaleLowerCase())) - Number(seedNames.has(a.channelName.toLocaleLowerCase())) || b.substance-a.substance);
          }
        }
      } catch (error) { aiError = error; rankError = error; logger.warn("pipeline", `AI judging failed (${correlationId})`, error.code || error.name); }
      metadata.timingsMs.judging = Date.now() - judgingStart;
      metadata.tokenEstimate = llm.tokenEstimate;
      if (!isCurrent()) return { ok: false, errorCode: "CANCELLED", userMessage: "A newer request replaced this one." };
      if (!judged.length && rankError) {
        judged = mode === "learn" ? rawCandidates.slice().sort((a,b)=>simpleScore(b, query)-simpleScore(a, query)).map(video=>({...video, role:"other", reason:"Basic match: AI ranking unavailable.", relevance:simpleScore(video,query), quality:0.5})) : rawCandidates.map(video=>({...video,role:"other",reason:"AI ranking unavailable; showing basic results.",relevance:simpleScore(video,query),quality:0.5})).sort((a,b)=>b.relevance-a.relevance);
      }
      const videos = judged.slice(0, action === "home" ? CONFIG.Pipeline.maxVideosShown : CONFIG.Pipeline.maxVideosShown);
      if (!videos.length) return { ok: false, errorCode: "EMPTY_RESULTS", userMessage: "No videos met the quality threshold. Try a broader query or show original results." };
      metadata.degraded = Boolean(aiError);
      metadata.reason = aiError ? aiError.code || "AI_UNAVAILABLE" : null;
      metadata.fallbackLabel = rankError ? "AI ranking unavailable, showing basic results" : aiError ? "Query expansion unavailable; searched the original query" : null;
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
