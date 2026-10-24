import { CONFIG } from "../config.js";
import { logger } from "../logger.js";
import { friendlyError } from "../errors.js";
import { normalizeQuery } from "../utils.js";
import { Cache, cacheKey } from "./cache.js";
import { LlmClient } from "./llm-client.js";
import { QUERY_EXPANSION, INTEREST_EXPANSION, CURIOSITY_EXPANSION, LEARN_JUDGE, INTEREST_JUDGE, CURIOSITY_JUDGE, OLLAMA_SCHEMAS } from "./prompts.js";
import { validateLearnJudge, validateInterestJudge, validateCuriosityJudge, validateQueries } from "./validators.js";
import { LlmError } from "../errors.js";
import { retrieveQueries, mergeVideos, interleaveQueryResults } from "./retrieval/index.js";

const inFlight = new Map();
const ROLE_ORDER = { intro: 0, deep_dive: 1, hands_on: 2, reference: 3, other: 4 };
async function loadJson(url) { const response = await fetch(url); if (!response.ok) throw new Error(`Fixture read failed: ${response.status}`); return response.json(); }
function cacheStorage() { return new Cache(chrome.storage.local); }
function candidateShape(video) {
  return { id: video.id, title: String(video.title || "").slice(0, CONFIG.Pipeline.titleMaxChars), channelName: String(video.channelName || "").slice(0, CONFIG.Pipeline.channelNameMaxChars), durationSeconds: video.durationSeconds, views: video.viewCount, uploadAge: video.publishedText, sourceQuery: String(video.sourceQuery || "").slice(0, 100), description: String(video.description || "").slice(0, CONFIG.Pipeline.maxDescriptionChars) };
}
function sortLearn(videos) {
  const ordered = [...videos].sort((a, b) => (ROLE_ORDER[a.role] ?? 4) - (ROLE_ORDER[b.role] ?? 4) || ((b.relevance || 0) + (b.quality || 0)) - ((a.relevance || 0) + (a.quality || 0)));
  const counts = new Map();
  return ordered.filter(video => {
    const role = ROLE_ORDER[video.role] ?? 4;
    const count = counts.get(role) || 0;
    if (count >= CONFIG.Pipeline.maxLearnVideosPerRole) return false;
    counts.set(role, count + 1);
    return true;
  });
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
  const prefix = error?.code ? `${error.code}: ` : "";
  return `${prefix}${String(error?.message || "Ollama could not complete the ranking request.")}`
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
function metadataFallbackInterestScore(video, interest) {
  const terms = normalizeQuery(interest).toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(term => term.length > 1);
  const title = String(video.title || "").toLocaleLowerCase();
  const details = `${title} ${String(video.description || "").toLocaleLowerCase()} ${String(video.channelName || "").toLocaleLowerCase()}`;
  const titleCoverage = terms.length ? terms.filter(term => title.includes(term)).length / terms.length : 0;
  const metadataCoverage = terms.length ? terms.filter(term => details.includes(term)).length / terms.length : 0;
  const clickbait = /\b(shocking|insane|unbelievable|you won't believe|must watch|exposed)\b/i.test(title);
  const quality = Math.max(0.38, Math.min(0.72, 0.52 + (video.durationSeconds && video.durationSeconds > 600 ? 0.08 : 0) + (video.description?.length > 120 ? 0.06 : 0) - (clickbait ? 0.18 : 0)));
  const relevance = Math.max(0.35, Math.min(0.86, 0.42 + titleCoverage * 0.30 + metadataCoverage * 0.14));
  return { ...video, relevance, quality, role: "other", reason: "Metadata-ranked fallback (not AI-ranked): Ollama did not return a score for this candidate." };
}
function metadataFallbackCuriosityScore(video) {
  const title = String(video.title || "");
  const clickbait = /\b(shocking|insane|unbelievable|you won't believe|must watch|exposed|destroyed)\b/i.test(title);
  const substance = Math.max(0.4, Math.min(0.68, 0.44 + (video.durationSeconds && video.durationSeconds > 600 ? 0.07 : 0) + (video.description?.length > 120 ? 0.08 : 0) + (title.length > 45 ? 0.04 : 0)));
  const sensational = clickbait ? 0.82 : 0.42;
  return { ...video, substance, sensational, relevance: substance, role: "other", reason: "Metadata-ranked fallback (not AI-ranked): Ollama did not return a score for this candidate." };
}
function applyPartialRankingFallback({ mode, data, candidateVideos, judged, interest, metadata }) {
  const rows = Array.isArray(data?.videos) ? data.videos : [];
  const validIds = new Set(candidateVideos.map(video => video.id));
  const scoredIds = new Set(rows.map(row => String(row?.id || "")).filter(id => validIds.has(id)));
  const missing = candidateVideos.filter(video => !scoredIds.has(video.id));
  if (!missing.length) return judged;
  metadata.degraded = true;
  metadata.reason = "PARTIAL_AI_RANKING";
  metadata.fallbackLabel = scoredIds.size === 0
    ? `Ollama ranking unavailable. Remaining videos use metadata-based fallback ordering; these are unranked YouTube search matches.`
    : `Ollama scored ${scoredIds.size} of ${candidateVideos.length} candidates. Remaining videos use metadata-based fallback ordering.`;
  const supplemental = missing.map(video => mode === "interest" ? metadataFallbackInterestScore(video, interest) : metadataFallbackCuriosityScore(video));
  return [...judged, ...supplemental];
}

// Qwen3 8B is more consistent when each prompt contains no more than 25 videos.
// Invalid, empty, partial, or truncated score responses are retried and then split.
const RANKING_BATCH_SIZE = CONFIG.Pipeline.rankingBatchSize;
function rankOutputBudget(candidateCount) {
  // Indexed score rows (i/fit/q/role) are compact; leave headroom without
  // allocating an output budget so small that a normal 25-row response truncates.
  return Math.min(CONFIG.LLM.callProfiles.judge.numPredict, Math.max(96, CONFIG.Pipeline.rankingOutputTokenBase + candidateCount * CONFIG.Pipeline.rankingOutputTokensPerCandidate));
}
async function rankCandidatesInBatches({ mode, llm, query, interest, action, candidateVideos, correlationId, deadlineAt, onProgress, cache }) {
  const scored = new Map();
  const failures = [];
  let requestNumber = 0;
  let cachedCount = 0;
  const rankingTarget = mode === "interest"
    ? normalizeQuery(action === "home" ? interest : `${interest}; search: ${query}`).toLocaleLowerCase()
    : "general-curious-viewer";
  const promptVersion = mode === "interest" ? INTEREST_JUDGE.version : CURIOSITY_JUDGE.version;
  const scoreCacheKey = video => cacheKey({ kind: "judged-video", mode, target: rankingTarget, videoId: video.id, model: llm.model, promptVersion });
  const pending = [];
  for (const video of candidateVideos) {
    const cached = await cache?.get(scoreCacheKey(video));
    if (cached && typeof cached === "object" && ((mode === "interest" && Number.isFinite(cached.relevance) && Number.isFinite(cached.quality)) || (mode === "curiosity" && Number.isFinite(cached.substance) && Number.isFinite(cached.sensational)))) {
      scored.set(video.id, { ...video, ...cached, aiRanked: true });
      cachedCount += 1;
    } else pending.push(video);
  }
  if (cachedCount) emitProgress(onProgress, correlationId, "ranking", `Reusing ${cachedCount} cached Ollama score${cachedCount === 1 ? "" : "s"}…`, { cachedCount, candidateCount: candidateVideos.length });
  const baseSchema = mode === "interest" ? OLLAMA_SCHEMAS.interestJudge : OLLAMA_SCHEMAS.curiosityJudge;

  async function scoreBatch(batch, retry = 0) {
    if (!batch.length) return;
    if (Date.now() >= deadlineAt) {
      const error = new LlmError("The feed time budget was reached; remaining candidates were not AI-ranked.");
      error.code = "PIPELINE_DEADLINE";
      failures.push({ ids: batch.map(video => video.id), error });
      return;
    }
    requestNumber += 1;
    emitProgress(onProgress, correlationId, "ranking", `Ollama ranking request ${requestNumber} (${batch.length} videos${retry ? ", retry" : ""})…`, { request: requestNumber, candidateCount: candidateVideos.length });
    // Don't ask a model to copy opaque YouTube IDs. A short per-batch index maps
    // each returned score back to the exact candidate and prevents ID hallucinations.
    const pool = batch.map((video, i) => {
      const shaped = candidateShape(video);
      const { id: _id, ...metadataOnly } = shaped;
      return { i, title: metadataOnly.title, channelName: metadataOnly.channelName,
        durationSeconds: metadataOnly.durationSeconds, views: metadataOnly.views,
        uploadAge: metadataOnly.uploadAge, sourceQuery: metadataOnly.sourceQuery,
        description: metadataOnly.description };
    });
    const rowSchema = baseSchema.properties.videos.items;
    const schema = {
      ...baseSchema,
      properties: { videos: {
        ...baseSchema.properties.videos,
        minItems: batch.length,
        maxItems: batch.length,
        items: { ...rowSchema, properties: { ...rowSchema.properties, i: { type: "integer", minimum: 0, maximum: batch.length - 1 } } }
      } }
    };
    const options = mode === "interest"
      ? { system: INTEREST_JUDGE.system, user: INTEREST_JUDGE.user({ interest: action === "home" ? interest : `${interest}; search: ${query}`, candidates: pool }), schema }
      : { system: CURIOSITY_JUDGE.system, user: CURIOSITY_JUDGE.user({ candidates: pool }), schema };
    try {
      const remainingMs = Math.max(1_000, deadlineAt - Date.now());
      const data = await llm.completeJson({ ...options, task: "judge", callType: "judge", maxTokens: rankOutputBudget(batch.length), temperature: CONFIG.LLM.callProfiles.judge.temperature, correlationId, timeoutMs: Math.min(CONFIG.LLM.timeoutMs, remainingMs), repairMalformed: batch.length <= 3 });
      const validated = (mode === "interest" ? validateInterestJudge(data, batch).videos : validateCuriosityJudge(data, batch).videos);
      if (!validated.length) {
        const error = new LlmError(`Ollama returned JSON, but no valid indexed scores matched this batch of ${batch.length} candidates. The response may have omitted or changed candidate indexes.`);
        error.code = "INVALID_RANKING_RESPONSE";
        throw error;
      }
      for (const video of validated) {
        const scoredVideo = { ...video, aiRanked: true };
        scored.set(video.id, scoredVideo);
        const { id: _id, title: _title, channelName: _channel, description: _description, sourceQuery: _sourceQuery, durationSeconds: _duration, viewCount: _views, publishedText: _published, ...scoreFields } = video;
        void _id; void _title; void _channel; void _description; void _sourceQuery; void _duration; void _views; void _published;
        await cache?.set(scoreCacheKey(video), scoreFields, CONFIG.Cache.ttlMs.ranking);
      }
      const scoredIds = new Set(validated.map(video => video.id));
      const missing = batch.filter(video => !scoredIds.has(video.id) && !scored.has(video.id));
      if (missing.length) {
        if (retry === 0) {
          logger.warn("pipeline", `Ollama returned ${validated.length}/${batch.length} valid score rows; retrying ${missing.length} omitted candidates`, "PARTIAL_RANKING_RESPONSE");
          await scoreBatch(missing, 1);
        } else if (missing.length > 1) {
          const middle = Math.ceil(missing.length / 2);
          await scoreBatch(missing.slice(0, middle));
          await scoreBatch(missing.slice(middle));
        } else {
          const error = new LlmError("Ollama returned valid JSON but repeatedly omitted one candidate ID.");
          error.code = "INCOMPLETE_RANKING_RESPONSE";
          failures.push({ ids: missing.map(video => video.id), error });
        }
      }
    } catch (error) {
      const requestTooLarge = error?.status === 413 || /request too large|tokens per minute.*requested|http 413/i.test(String(error?.message || ""));
      const malformedOutput = ["PARSE_ERROR", "OUTPUT_TRUNCATED", "NO_VISIBLE_CONTENT"].includes(error?.code) || error?.name === "ParseError";
      const timedOut = error?.code === "TIMEOUT_ERROR" || error?.name === "TimeoutError";
      // Do not spend a second full timeout repeating the same slow batch. Split
      // immediately after a timeout/empty/truncated response so smaller prompts
      // can still complete within the overall feed deadline.
      if (batch.length > 1 && (requestTooLarge || malformedOutput || timedOut)) {
        const middle = Math.ceil(batch.length / 2);
        const cause = requestTooLarge ? "HTTP 413" : timedOut ? "timeout" : "invalid/truncated/empty JSON";
        logger.warn("pipeline", `splitting ${mode} ranking batch of ${batch.length} after ${cause}`, error.code || error.name);
        await scoreBatch(batch.slice(0, middle));
        await scoreBatch(batch.slice(middle));
      } else if (retry === 0 && error?.code !== "PIPELINE_DEADLINE") {
        logger.warn("pipeline", `retrying ${mode} ranking request after ${error.code || error.name || "error"}`, "RANKING_RETRY");
        await scoreBatch(batch, 1);
      } else if (batch.length > 1 && error?.code !== "PIPELINE_DEADLINE") {
        const middle = Math.ceil(batch.length / 2);
        await scoreBatch(batch.slice(0, middle));
        await scoreBatch(batch.slice(middle));
      } else {
        failures.push({ ids: batch.map(video => video.id), error });
      }
    }
  }

  for (let offset = 0; offset < pending.length; offset += RANKING_BATCH_SIZE) {
    await scoreBatch(pending.slice(offset, offset + RANKING_BATCH_SIZE));
  }
  return { data: { videos: [...scored.keys()].map(id => ({ id })) }, judged: [...scored.values()], failures, cachedCount };
}

async function rankLearnCandidatesInBatches({ llm, query, candidateVideos, correlationId, deadlineAt, onProgress }) {
  const videos = [];
  const failures = [];
  let requestNumber = 0;
  const batchSize = CONFIG.Pipeline.learnRankingBatchSize;
  async function judgeBatch(batch) {
    if (!batch.length) return;
    if (Date.now() >= deadlineAt) {
      const error = new LlmError("The feed time budget was reached before all learning candidates could be scored.");
      error.code = "PIPELINE_DEADLINE";
      failures.push(error);
      return;
    }
    requestNumber += 1;
    emitProgress(onProgress, correlationId, "ranking", `Ollama grading learning videos (${requestNumber}; ${batch.length} at a time)…`, { candidateCount: candidateVideos.length, request: requestNumber });
    const pool = batch.map((video, i) => {
      const { id: _id, ...metadataOnly } = candidateShape(video);
      void _id;
      return { i, title: metadataOnly.title, channelName: metadataOnly.channelName, durationSeconds: metadataOnly.durationSeconds,
        views: metadataOnly.views, uploadAge: metadataOnly.uploadAge, sourceQuery: metadataOnly.sourceQuery, description: metadataOnly.description };
    });
    const baseSchema = OLLAMA_SCHEMAS.learnJudge;
    const schema = { ...baseSchema, properties: { videos: {
      ...baseSchema.properties.videos,
      maxItems: batch.length,
      items: { ...baseSchema.properties.videos.items, properties: {
        ...baseSchema.properties.videos.items.properties,
        i: { type: "integer", minimum: 0, maximum: batch.length - 1 }
      } }
    } } };
    try {
      const data = await llm.completeJson({ task: "judge", callType: "judge", schema, system: LEARN_JUDGE.system,
        user: LEARN_JUDGE.user({ query, candidates: pool }), maxTokens: Math.min(CONFIG.LLM.callProfiles.judge.numPredict, Math.max(96, 24 + batch.length * 16)),
        temperature: CONFIG.LLM.callProfiles.judge.temperature, correlationId,
        timeoutMs: Math.min(CONFIG.LLM.timeoutMs, Math.max(1_000, deadlineAt - Date.now())), repairMalformed: false });
      const validated = validateLearnJudge(data, batch).videos;
      if (!validated.length && Array.isArray(data?.videos) && data.videos.length) {
        const error = new LlmError("Ollama returned score rows that did not map to the supplied learning candidates.");
        error.code = "INVALID_LEARN_RANKING";
        throw error;
      }
      videos.push(...validated.filter(video => video.relevance >= CONFIG.Pipeline.minimumRelevance && video.quality >= CONFIG.Pipeline.minimumLearnQuality));
    } catch (error) {
      const splittable = ["OUTPUT_TRUNCATED", "PARSE_ERROR", "NO_VISIBLE_CONTENT", "INVALID_LEARN_RANKING"].includes(error?.code) || error?.code === "TIMEOUT_ERROR" || error?.name === "TimeoutError";
      if (batch.length > 1 && splittable) {
        logger.warn("pipeline", `splitting Learn ranking batch of ${batch.length} after ${error?.code || error?.name}`, "LEARN_BATCH_SPLIT");
        const middle = Math.ceil(batch.length / 2);
        await judgeBatch(batch.slice(0, middle));
        await judgeBatch(batch.slice(middle));
      } else {
        failures.push(error);
      }
    }
  }
  for (let offset = 0; offset < candidateVideos.length; offset += batchSize) await judgeBatch(candidateVideos.slice(offset, offset + batchSize));
  return { videos: sortLearn(videos), failures };
}

function titleTokens(title) {
  return new Set(String(title || "").toLocaleLowerCase().normalize("NFC").split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 2));
}
function titleSimilarity(left, right) {
  const a = titleTokens(left), b = titleTokens(right);
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  return [...a].filter(token => b.has(token)).length / union.size;
}
const CURIOSITY_TOPIC_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "what", "why", "how", "when", "where", "does", "did", "are", "was", "were", "you", "your", "into", "about", "after", "before", "over", "under", "real", "reason", "explained", "explain", "story", "documentary", "analysis", "deep", "dive", "guide", "facts", "things", "people", "world", "history", "science", "physics", "biology", "chemistry", "math", "mathematics", "engineering", "technology", "tech", "learning", "programming", "coding", "tutorial", "tutorials", "course", "lecture", "university", "review", "podcast", "video", "videos", "episode", "best", "top", "ultimate", "insane", "shocking", "mystery", "mysterious", "documentary", "failure", "failures", "failed", "collapse", "collapsed", "bridge", "bridges", "crash", "crashes", "disaster", "disasters", "building", "built", "making", "made", "works", "work", "working", "mechanism", "mechanisms", "hidden", "secret", "secrets", "surprising", "interesting", "curious", "quick", "shorts", "full", "complete", "beginner", "advanced", "basics", "introduction", "intro", "experiment", "experiments", "visual", "explanation", "explanations", "build", "hands", "angle", "measured", "research", "field", "expert", "interview", "historical", "case", "stepwise", "investigation", "design", "architecture", "mechanism", "mechanisms", "phenomenon", "phenomena"
]);
function curiosityTopicTokens(title) {
  return new Set([...titleTokens(title)].filter(token => token.length > 2 && !CURIOSITY_TOPIC_STOPWORDS.has(token)));
}
function sameCuriosityTopic(left, right) {
  const leftSource = normalizeQuery(left.sourceQuery || "").toLocaleLowerCase();
  const rightSource = normalizeQuery(right.sourceQuery || "").toLocaleLowerCase();
  // Let one query contribute up to the configured per-query cap; the separate
  // source cap handles same-query diversity without collapsing every result that
  // naturally repeats the query words. This guard only compares distinct searches.
  if (leftSource && rightSource && leftSource === rightSource) return false;
  const a = curiosityTopicTokens(left.title);
  const b = curiosityTopicTokens(right.title);
  if (!a.size || !b.size) return false;
  const shared = [...a].filter(token => b.has(token));
  // A distinctive entity (Tacoma, Chernobyl, Titanic, etc.) repeated across
  // differently worded titles is a stronger topic signal than raw title Jaccard.
  if (shared.some(token => token.length >= 6)) return true;
  const union = new Set([...a, ...b]);
  return shared.length >= 2 && shared.length / union.size >= 0.5;
}
export function prefilterCandidates(videos, mode = "") {
  const kept = [], ids = new Set();
  for (const video of videos) {
    if (!video?.id || !video?.title || ids.has(String(video.id))) continue;
    if (video.isShort || video.isLive) continue;
    if (Number.isFinite(video.durationSeconds) && CONFIG.Pipeline.minimumVideoDurationSeconds > 0 && video.durationSeconds < CONFIG.Pipeline.minimumVideoDurationSeconds) continue;
    if (kept.some(other => titleSimilarity(video.title, other.title) >= CONFIG.Ranking.duplicateTitleJaccard || (mode === "curiosity" && sameCuriosityTopic(video, other)))) continue;
    ids.add(String(video.id)); kept.push(video);
  }
  return kept;
}
function clickbaitPenalty(video) {
  const title = String(video.title || "");
  let flags = 0;
  if (title.length >= 12 && title === title.toLocaleUpperCase() && /[A-Z]/.test(title)) flags += 1;
  if ((title.match(/\p{Extended_Pictographic}/gu) || []).length >= 3) flags += 1;
  if (/!!!/.test(title)) flags += 1;
  const lower = title.toLocaleLowerCase();
  for (const phrase of CONFIG.Ranking.clickbaitPhrases) if (lower.includes(phrase)) flags += 1;
  return Math.min(CONFIG.Ranking.maxClickbaitPenalty, flags * CONFIG.Ranking.clickbaitPenalty);
}
function clampScore(value) { return Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0)); }
function compositeScore(video, mode, allowedChannelBonuses = new Set()) {
  const weights = CONFIG.Ranking.weights[mode] || CONFIG.Ranking.weights.interest;
  const fit = clampScore(mode === "curiosity" ? (video.substance ?? video.relevance) : video.relevance);
  const quality = clampScore(video.quality ?? video.substance);
  const views = Math.max(0, Number(video.viewCount ?? video.views) || 0);
  const engagement = Math.max(0, Math.min(1, Math.log10(Math.max(1, views)) / 7));
  const minutes = Number(video.durationSeconds) / 60;
  const ideal = CONFIG.Ranking.idealDurationMinutes[mode] || CONFIG.Ranking.idealDurationMinutes.interest;
  const duration = !Number.isFinite(minutes) || minutes <= 0 ? 0.4 : minutes < ideal.min ? Math.max(0, minutes / ideal.min) : minutes > ideal.max ? Math.max(0, ideal.max / minutes) : 1;
  const channel = allowedChannelBonuses.has(String(video.channelName || "").trim().toLocaleLowerCase()) ? 1 : 0;
  const penalty = clickbaitPenalty(video);
  const score = weights.fit * fit + weights.quality * quality + weights.engagement * engagement + weights.duration * duration + weights.channel * channel - penalty;
  return { ...video, score: Math.max(0, score), clickbaitPenalty: penalty };
}
function diversifyRanked(videos, mode, limit, maxPerChannel) {
  const remaining = [...videos];
  const selected = [], channelCounts = new Map(), sourceCounts = new Map();
  while (remaining.length && selected.length < limit) {
    let bestIndex = -1, bestAdjusted = -Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const video = remaining[i];
      const channel = String(video.channelName || "").trim().toLocaleLowerCase() || `unknown:${video.id}`;
      const sourceKey = String(video.sourceQuery || "").trim().toLocaleLowerCase();
      if ((channelCounts.get(channel) || 0) >= maxPerChannel) continue;
      if (mode === "curiosity" && sourceKey && (sourceCounts.get(sourceKey) || 0) >= CONFIG.Pipeline.maxVideosPerCuriosityQuery) continue;
      let adjusted = (video.aiRanked ? 10 : 0) + (Number(video.score) || 0);
      for (const prior of selected) {
        const sameChannel = String(prior.channelName || "").trim().toLocaleLowerCase() === channel;
        if (sameChannel) adjusted -= 0.15;
        if (video.sourceQuery && prior.sourceQuery && video.sourceQuery === prior.sourceQuery) adjusted -= 0.10;
        if (mode === "interest" && video.role && prior.role && video.role === prior.role && video.role !== "other") adjusted -= 0.04;
      }
      if (adjusted > bestAdjusted) { bestAdjusted = adjusted; bestIndex = i; }
    }
    if (bestIndex < 0) break;
    const [picked] = remaining.splice(bestIndex, 1);
    const channel = String(picked.channelName || "").trim().toLocaleLowerCase() || `unknown:${picked.id}`;
    channelCounts.set(channel, (channelCounts.get(channel) || 0) + 1);
    const sourceKey = String(picked.sourceQuery || "").trim().toLocaleLowerCase();
    if (sourceKey) sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) || 0) + 1);
    selected.push(picked);
  }
  return selected;
}
function buildInterestQueries(interest, page = 0) {
  const count = CONFIG.Pipeline.interestPlanQueries;
  const suffixes = CONFIG.Pipeline.interestFallbackQuerySuffixes;
  return Array.from({ length: count }, (_, index) => {
    const suffix = index === 0 ? "" : suffixes[(index - 1) % suffixes.length];
    return normalizeQuery([interest, suffix].filter(Boolean).join(" "), CONFIG.Pipeline.queryMaxChars);
  }).filter(Boolean);
}
function selectInterestQueries(plan, interest, page = 0) {
  const selectedCount = CONFIG.Pipeline.interestQueriesPerFeed;
  const original = normalizeQuery(interest, CONFIG.Pipeline.queryMaxChars);
  const rows = (Array.isArray(plan) ? plan : [])
    .map(item => typeof item === "string" ? { q: item, sub: null } : ({ q: item?.q, sub: Number.isInteger(item?.sub) ? item.sub : null }))
    .filter(row => typeof row.q === "string" && row.q.trim());
  const generated = uniqueQueries(rows.map(row => row.q), [], CONFIG.Pipeline.interestPlanQueries)
    .filter(value => value.toLocaleLowerCase() !== original.toLocaleLowerCase());
  if (!generated.length) return uniqueQueries([original], buildInterestQueries(interest, page), selectedCount);

  // Rotate the actual AI query-plan rows (not just the fallback list) across pages.
  // This prevents page 2 from repeating the same first subtopics and then returning
  // only a handful of unseen videos after duplicate-ID filtering.
  const start = (Math.max(0, page) * Math.max(1, selectedCount - 1)) % rows.length;
  const rotatedRows = [...rows.slice(start), ...rows.slice(0, start)];
  const candidatesInRotation = [...generated.slice(start % generated.length), ...generated.slice(0, start % generated.length)];
  const picked = [];
  const seenSubtopics = new Set();
  for (const row of rotatedRows) {
    const q = normalizeQuery(row.q, CONFIG.Pipeline.queryMaxChars);
    if (!generated.some(value => value.toLocaleLowerCase() === q.toLocaleLowerCase())) continue;
    if (row.sub !== null && !seenSubtopics.has(row.sub)) {
      seenSubtopics.add(row.sub);
      picked.push(q);
    }
    if (picked.length >= selectedCount - 1) break;
  }
  for (const q of candidatesInRotation) {
    if (picked.length >= selectedCount - 1) break;
    if (!picked.some(value => value.toLocaleLowerCase() === q.toLocaleLowerCase())) picked.push(q);
  }
  return uniqueQueries([original, ...picked], buildInterestQueries(interest, page), selectedCount);
}
function buildCuriosityAreas(page = 0) {
  const areas = CONFIG.Pipeline.curiosityAreas;
  const day = Math.floor(Date.now() / 86_400_000);
  const count = Math.min(CONFIG.Pipeline.curiosityQueriesPerFeed, areas.length);
  const rotation = Array.from({ length: areas.length }, (_, index) => areas[(day + index * CONFIG.Pipeline.curiosityAreaStride) % areas.length]);
  const start = (Math.max(0, page) * count) % rotation.length;
  return Array.from({ length: count }, (_, index) => rotation[(start + index) % rotation.length]);
}
function buildCuriosityQueries(page = 0) {
  const areas = buildCuriosityAreas(page);
  return areas.map(area => {
    const index = CONFIG.Pipeline.curiosityAreas.indexOf(area);
    return normalizeQuery(CONFIG.Pipeline.curiosityTopicQueries[index] || area, CONFIG.Pipeline.queryMaxChars);
  }).filter(Boolean);
}
function pipelineCacheKey(mode, query, interest, action, settings, page = 0, excludeIds = []) {
  return cacheKey({ mode, query: normalizeQuery(query).toLocaleLowerCase(), interest: normalizeQuery(interest).toLocaleLowerCase(), action,
    page, excludedVideoIds: excludeIds.slice().sort(), feedVersion: "1.5.1-fast-batched-diverse-ollama",
    retrievalProvider: settings.retrievalProvider || CONFIG.Retrieval.defaultProvider, hasYoutubeApiKey: Boolean(settings.youtubeApiKey),
    prompts: [QUERY_EXPANSION.version, INTEREST_EXPANSION.version, CURIOSITY_EXPANSION.version, LEARN_JUDGE.version, INTEREST_JUDGE.version, CURIOSITY_JUDGE.version],
    mockMode: settings.mockMode, resultsPerSearch: settings.resultsPerSearch, curiosityStrictness: settings.curiosityStrictness, pipelineConfig: CONFIG.Pipeline });
}
function emitProgress(callback, correlationId, stage, message, details = {}) {
  logger.info("pipeline-progress", `${correlationId || "no-id"} ${stage}: ${message}`);
  try { callback?.({ correlationId, stage, message, ...details }); } catch { /* Progress must never break feed generation. */ }
}
function withTimeout(promise, timeoutMs, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => { timer = setTimeout(() => {
      const error = new Error(message); error.name = "TimeoutError"; error.code = "PIPELINE_TIMEOUT"; reject(error);
    }, timeoutMs); })
  ]).finally(() => clearTimeout(timer));
}
function uniqueQueries(primary, fallback, limit) {
  const output = [];
  const seen = new Set();
  for (const value of [...(primary || []), ...(fallback || [])]) {
    const query = normalizeQuery(value, CONFIG.Pipeline.queryMaxChars);
    const key = query.toLocaleLowerCase();
    if (!query || seen.has(key)) continue;
    seen.add(key); output.push(query);
    if (output.length >= limit) break;
  }
  return output;
}
function validateChannelSuggestions(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).map(row => typeof row === "string" ? { name: row, reason: "Suggested as a useful channel for this interest." } : row)
    .filter(row => row && typeof row.name === "string")
    .map(row => ({ name: normalizeQuery(row.name, CONFIG.Pipeline.channelSuggestionMaxChars), reason: normalizeQuery(row.reason || "Suggested as a useful channel for this interest.", CONFIG.Pipeline.reasonMaxChars) }))
    .filter(row => row.name && !seen.has(row.name.toLocaleLowerCase()) && seen.add(row.name.toLocaleLowerCase()))
    .slice(0, CONFIG.Pipeline.interestChannelSuggestions);
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
  const taggedGroups = groups.map((group, index) => (group || []).map(video => ({ ...video, sourceQuery: video.sourceQuery || queries[index] })));
  return { videos: mergeVideos(taggedGroups), queryResults: taggedGroups, providers: [...providers], error: taggedGroups.flat().length ? null : lastError, cacheHit: queries.some((_, index) => !missing.includes(index)) };
}

export async function runPipeline(request, settings, { cache = cacheStorage(), correlationId = "", isCurrent = () => true, htmlFetchImpl, onProgress } = {}) {
  const startedAt = Date.now();
  const mode = request.mode || "learn";
  const action = request.action || "search";
  const query = normalizeQuery(request.query, CONFIG.Pipeline.queryMaxChars);
  const interest = normalizeQuery(request.interest || settings.interestText, CONFIG.ModesPicker.interestMaxChars);
  const metadata = baseMetadata(startedAt);
  const deadlineAt = startedAt + CONFIG.Pipeline.totalTimeoutMs;
  emitProgress(onProgress, correlationId, "starting", "Starting FocusTube feed…", { mode, action });
  if (!["learn", "interest", "curiosity"].includes(mode)) return { ok: true, videos: [], metadata };
  if (mode === "learn" && !query) { emitProgress(onProgress, correlationId, "failed", "Enter a topic to see a focused learning path."); return { ok: false, errorCode: "EMPTY_QUERY", userMessage: "Enter a topic to see a focused learning path." }; }
  if (mode === "interest" && !interest) { emitProgress(onProgress, correlationId, "failed", "Choose an interest first, then retry this view."); return { ok: false, errorCode: "EMPTY_INTEREST", userMessage: "Choose an interest first, then retry this view." }; }
  const page = Math.max(0, Math.min(100, Math.floor(Number(request.page) || 0)));
  const excludeIds = [...new Set((Array.isArray(request.excludeIds) ? request.excludeIds : []).map(id => String(id || "").trim()).filter(Boolean))].slice(0, 500);
  const key = pipelineCacheKey(mode, query, interest, action, settings, page, excludeIds);
  const inMemory = inFlight.get(key);
  if (inMemory) return inMemory;
  const operation = (async () => {
    const cached = await cache.get(key);
    if (cached) { cached.metadata.cacheHit = true; cached.metadata.timingsMs.total = Date.now() - startedAt; emitProgress(onProgress, correlationId, "complete", "Loaded saved recommendations."); return cached; }
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
          const expansion = await cachedExpansion(cache, { version: QUERY_EXPANSION.version, query: query.toLocaleLowerCase(), queryCount: CONFIG.Pipeline.queriesPerSearch }, { system: QUERY_EXPANSION.system, user: QUERY_EXPANSION.user({ query, count: CONFIG.Pipeline.queriesPerSearch }), schema: OLLAMA_SCHEMAS.queryExpansion, callType: "expand", repairMalformed: false, maxTokens: CONFIG.LLM.callProfiles.expand.numPredict, temperature: CONFIG.LLM.callProfiles.expand.temperature, timeoutMs: Math.min(CONFIG.LLM.expansionTimeoutMs, Math.max(1_000, deadlineAt - Date.now())) }, llm, correlationId);
          metadata.cacheHit ||= expansion.hit;
          queries = validateQueries(expansion.value, query, CONFIG.Pipeline.queriesPerSearch);
        } catch (error) {
          aiError = error;
          queries = uniqueQueries([query, `${query} explained`, `${query} worked example`], [], CONFIG.Pipeline.queriesPerSearch);
          logger.warn("pipeline", `query expansion failed (${correlationId}); using compact deterministic queries`, error.code || error.name);
        }
        retrieval = await withTimeout(retrieveWithCache(queries, settings, cache, htmlFetchImpl), CONFIG.Pipeline.retrievalTimeoutMs, `YouTube retrieval exceeded its ${Math.round(CONFIG.Pipeline.retrievalTimeoutMs / 1000)}-second time budget.`).catch(error => ({ videos: [], queryResults: [], providers: [], error })); metadata.cacheHit ||= retrieval.cacheHit;
        rawCandidates = interleaveQueryResults(retrieval.queryResults || []);
      } else if (mode === "interest") {
        if (action === "home") {
          const fallbackQueries = buildInterestQueries(interest, page);
          emitProgress(onProgress, correlationId, "expanding", "Asking Ollama to expand your interest into varied searches…");
          try {
            const interestCount = CONFIG.Pipeline.interestPlanQueries;
            const interestSchema = { ...OLLAMA_SCHEMAS.interestExpansion, properties: {
              ...OLLAMA_SCHEMAS.interestExpansion.properties,
              queries: { ...OLLAMA_SCHEMAS.interestExpansion.properties.queries, minItems: interestCount, maxItems: interestCount }
            } };
            const expansion = await cachedExpansion(cache,
              { version: INTEREST_EXPANSION.version, interest: interest.toLocaleLowerCase(), queryCount: interestCount },
              { system: INTEREST_EXPANSION.system, user: INTEREST_EXPANSION.user({ interest, count: interestCount }), schema: interestSchema, callType: "interestPlan", maxTokens: CONFIG.LLM.callProfiles.interestPlan.numPredict, temperature: CONFIG.LLM.callProfiles.interestPlan.temperature, timeoutMs: Math.min(CONFIG.LLM.expansionTimeoutMs, Math.max(1_000, deadlineAt - Date.now())), repairMalformed: false },
              llm, correlationId);
            metadata.cacheHit ||= expansion.hit;
            queries = selectInterestQueries(expansion.value?.queries, interest, page);
            metadata.subtopics = [];
            channels = validateChannelSuggestions(expansion.value?.channels);
          } catch (error) {
            aiError = error;
            queries = fallbackQueries;
            logger.warn("pipeline", `interest query expansion failed (${correlationId})`, error.code || error.name);
          }
        } else queries = [query];
        if (!queries.length) queries = [interest];
        emitProgress(onProgress, correlationId, "retrieval", `Searching YouTube across ${queries.length} interest queries…`, { queryCount: queries.length });
        retrieval = await withTimeout(retrieveWithCache(queries, settings, cache, htmlFetchImpl), CONFIG.Pipeline.retrievalTimeoutMs, `YouTube retrieval exceeded its ${Math.round(CONFIG.Pipeline.retrievalTimeoutMs / 1000)}-second time budget.`).catch(error => ({ videos: [], queryResults: [], providers: [], error }));
        metadata.cacheHit ||= retrieval.cacheHit;
        rawCandidates = action === "home" ? interleaveQueryResults(retrieval.queryResults || []) : retrieval.videos;
      } else {
        if (action === "home") {
          const fallbackQueries = buildCuriosityQueries(page);
          const areas = buildCuriosityAreas(page);
          // Read recent generated plans, not only the hard-coded fallback terms, so
          // a model repeating its last answer cannot cause an empty second page.
          const recentQueries = [];
          for (let priorPage = page - 1; priorPage >= Math.max(0, page - CONFIG.Pipeline.curiosityRecentPages); priorPage -= 1) {
            const priorAreas = buildCuriosityAreas(priorPage);
            const priorKey = cacheKey({ kind: "expansion", version: CURIOSITY_EXPANSION.version, page: priorPage, areas: priorAreas, queryCount: priorAreas.length });
            const prior = await cache.get(priorKey);
            if (Array.isArray(prior?.items)) recentQueries.push(...prior.items.map(item => item?.q ?? item?.query).filter(item => typeof item === "string"));
            else if (Array.isArray(prior?.queries)) recentQueries.push(...prior.queries.filter(item => typeof item === "string"));
          }
          const recentSet = new Set([...recentQueries, ...(page > 0 ? buildCuriosityQueries(page - 1) : [])].map(value => normalizeQuery(value).toLocaleLowerCase()));
          emitProgress(onProgress, correlationId, "expanding", `Asking Ollama for ${areas.length} specific curiosity searches…`);
          try {
            const curiosityCount = areas.length;
            const curiositySchema = { ...OLLAMA_SCHEMAS.curiosityExpansion, properties: {
              ...OLLAMA_SCHEMAS.curiosityExpansion.properties,
              items: { ...OLLAMA_SCHEMAS.curiosityExpansion.properties.items, minItems: curiosityCount, maxItems: curiosityCount,
                items: { ...OLLAMA_SCHEMAS.curiosityExpansion.properties.items.items,
                  properties: { ...OLLAMA_SCHEMAS.curiosityExpansion.properties.items.items.properties,
                    i: { type: "integer", minimum: 0, maximum: curiosityCount - 1 }
                  }
                }
              }
            } };
            const expansion = await cachedExpansion(cache,
              { version: CURIOSITY_EXPANSION.version, page, areas, queryCount: curiosityCount },
              { system: CURIOSITY_EXPANSION.system, user: CURIOSITY_EXPANSION.user({ count: curiosityCount, page, examples: [...recentSet].slice(-CONFIG.Pipeline.curiosityMaxRecentQueries), areas }), schema: curiositySchema, callType: "curiosity", maxTokens: CONFIG.LLM.callProfiles.curiosity.numPredict, temperature: CONFIG.LLM.callProfiles.curiosity.temperature, timeoutMs: Math.min(CONFIG.LLM.expansionTimeoutMs, Math.max(1_000, deadlineAt - Date.now())), repairMalformed: false },
              llm, correlationId);
            metadata.cacheHit ||= expansion.hit;
            const generatedItems = (Array.isArray(expansion.value?.items) ? expansion.value.items : [])
              .filter(item => Number.isInteger(item?.i) && item.i >= 0 && item.i < areas.length && typeof item?.q === "string" && !recentSet.has(normalizeQuery(item.q).toLocaleLowerCase()));
            const freshGenerated = generatedItems.map(item => {
              const requestedArea = areas[item.i];
              const text = normalizeQuery(item.q, CONFIG.Pipeline.queryMaxChars);
              if (!requestedArea || !text) return "";
              const areaTerms = requestedArea.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(term => term.length > 2);
              const includesArea = areaTerms.some(term => text.toLocaleLowerCase().includes(term));
              const shortArea = areaTerms.slice(0, 2).join(" ");
              return normalizeQuery(includesArea ? text : `${shortArea} ${text}`, CONFIG.Pipeline.queryMaxChars);
            }).filter(Boolean);
            queries = uniqueQueries(freshGenerated, fallbackQueries, fallbackQueries.length);
          } catch (error) {
            aiError = error;
            queries = fallbackQueries;
            logger.warn("pipeline", `curiosity query expansion failed (${correlationId})`, error.code || error.name);
          }
        } else queries = [query];
        emitProgress(onProgress, correlationId, "retrieval", `Searching YouTube across ${queries.length} curiosity topics…`, { queryCount: queries.length });
        retrieval = await withTimeout(retrieveWithCache(queries, settings, cache, htmlFetchImpl), CONFIG.Pipeline.retrievalTimeoutMs, `YouTube retrieval exceeded its ${Math.round(CONFIG.Pipeline.retrievalTimeoutMs / 1000)}-second time budget.`).catch(error => ({ videos: [], queryResults: [], providers: [], error }));
        metadata.cacheHit ||= retrieval.cacheHit;
        rawCandidates = action === "home" ? interleaveQueryResults(retrieval.queryResults || []) : retrieval.videos;
      }
      metadata.providers = retrieval.providers || [];
      metadata.timingsMs.retrieval = Date.now() - retrievalStart;
      if (excludeIds.length) {
        const excluded = new Set(excludeIds);
        rawCandidates = rawCandidates.filter(video => !excluded.has(String(video.id)));
      }
      rawCandidates = prefilterCandidates(rawCandidates, mode);
      if (!rawCandidates.length) {
        emitProgress(onProgress, correlationId, "failed", retrieval.error ? "YouTube search did not return videos; check retrieval access." : "No eligible long-form YouTube videos were found. Shorts, live streams, duplicate titles, and videos under four minutes are filtered in this mode.");
        if (retrieval.error) { const error = friendlyError(retrieval.error); return { ok: false, ...error }; }
        return { ok: false, errorCode: "EMPTY_RESULTS", userMessage: "No videos were found. Try another search or show original YouTube results." };
      }
      if (!isCurrent()) return { ok: false, errorCode: "CANCELLED", userMessage: "A newer request replaced this one." };
      const candidatePoolLimit = Math.min(CONFIG.Pipeline.maxCandidatePoolSize, CONFIG.Pipeline.feedBatchSize, CONFIG.Pipeline.maxVideosShown);
      const candidateVideos = rawCandidates.slice(0, candidatePoolLimit);
      const resultLimit = Math.min(CONFIG.Pipeline.feedBatchSize, CONFIG.Pipeline.maxVideosShown, Number(settings.resultsPerSearch) || CONFIG.Pipeline.feedBatchSize);
      const pool = candidateVideos.map((video, i) => {
        const { id: _id, ...metadataOnly } = candidateShape(video);
        void _id;
        return { i, ...metadataOnly };
      });
      let judged = [];
      const judgingStart = Date.now();
      emitProgress(onProgress, correlationId, "ranking", `Retrieved ${candidateVideos.length} candidates; ranking with Ollama…`, { candidateCount: candidateVideos.length });
      try {
        if (mode === "learn") {
          const learningRanking = await rankLearnCandidatesInBatches({ llm, query, candidateVideos, correlationId, deadlineAt, onProgress });
          judged = learningRanking.videos;
          if (learningRanking.failures.length) {
            const firstFailure = learningRanking.failures[0];
            if (!judged.length) throw firstFailure;
            metadata.degraded = true;
            metadata.reason = "PARTIAL_AI_RANKING";
            metadata.fallbackLabel = `Ollama ranked ${judged.length} of ${candidateVideos.length} learning candidates; unscored videos were left out.`;
          }
        } else if (mode === "interest") {
          const ranking = await rankCandidatesInBatches({ mode, llm, query, interest, action, candidateVideos, correlationId, deadlineAt, onProgress, cache });
          metadata.cacheHit ||= ranking.cachedCount > 0;
          if (ranking.cachedCount > 0 && !llm.providers.includes("ollama")) llm.providers.push("ollama");
          judged = applyPartialRankingFallback({ mode, data: ranking.data, candidateVideos, judged: ranking.judged, interest, metadata });
          const realChannels = new Set(candidateVideos.map(video => String(video.channelName || "").trim().toLocaleLowerCase()).filter(Boolean));
          const channelBonuses = new Set(channels.map(channel => channel.name.toLocaleLowerCase()).filter(name => realChannels.has(name)));
          channels = channels.filter(channel => realChannels.has(channel.name.toLocaleLowerCase()));
          judged = judged
            .filter(video => !video.aiRanked || (video.relevance >= CONFIG.Pipeline.minInterestRelevance && video.quality >= CONFIG.Pipeline.minJudgeQuality))
            .map(video => compositeScore(video, "interest", channelBonuses));
          if (ranking.failures.length) {
            const firstFailure = ranking.failures[0].error;
            metadata.degraded = true;
            metadata.reason = metadata.reason || "PARTIAL_AI_RANKING";
            metadata.fallbackLabel = ranking.judged.length === 0
              ? `Ollama relevance ranking unavailable (${firstFailure?.code || "AI_UNAVAILABLE"}). ${safeAiFailure(firstFailure)} These are unranked YouTube search matches.`
              : `${metadata.fallbackLabel || `Ollama ranked ${ranking.judged.length} of ${candidateVideos.length} candidates.`} Some smaller batches could not be ranked: ${safeAiFailure(firstFailure)}`;
          }
          judged = diversifyRanked(judged.sort((a, b) => Number(Boolean(b.aiRanked)) - Number(Boolean(a.aiRanked)) || (b.score || 0) - (a.score || 0)), "interest", resultLimit, CONFIG.Ranking.maxPerChannel.interest);
        } else {
          const ranking = await rankCandidatesInBatches({ mode, llm, query, interest, action, candidateVideos, correlationId, deadlineAt, onProgress, cache });
          metadata.cacheHit ||= ranking.cachedCount > 0;
          if (ranking.cachedCount > 0 && !llm.providers.includes("ollama")) llm.providers.push("ollama");
          const strictnessLimit = { relaxed: 0.9, balanced: CONFIG.Pipeline.curiosityMaximumSensationalScore, strict: 0.55 }[settings.curiosityStrictness] ?? CONFIG.Pipeline.curiosityMaximumSensationalScore;
          const completedScores = applyPartialRankingFallback({ mode, data: ranking.data, candidateVideos, judged: ranking.judged, interest, metadata }).sort((a,b)=>b.substance-a.substance);
          if (ranking.failures.length) {
            const firstFailure = ranking.failures[0].error;
            metadata.degraded = true;
            metadata.reason = metadata.reason || "PARTIAL_AI_RANKING";
            metadata.fallbackLabel = ranking.judged.length === 0
              ? `Ollama substance scoring unavailable (${firstFailure?.code || "AI_UNAVAILABLE"}). ${safeAiFailure(firstFailure)} These are unranked YouTube search matches.`
              : `${metadata.fallbackLabel || `Ollama ranked ${ranking.judged.length} of ${candidateVideos.length} candidates.`} Some smaller batches could not be ranked: ${safeAiFailure(firstFailure)}`;
          }
          const approvedAi = completedScores
            .filter(video => video.aiRanked && video.sensational < strictnessLimit && video.substance >= CONFIG.Pipeline.minCuriositySubstance)
            .map(video => compositeScore(video, "curiosity"));
          const unrankedFallback = completedScores
            .filter(video => !video.aiRanked)
            .map(video => compositeScore(video, "curiosity"));
          // Never pad a valid AI ranking with low-scoring AI candidates. Unranked
          // fallback rows may still be shown when some individual requests failed.
          judged = [...diversifyRanked(approvedAi, "curiosity", resultLimit, CONFIG.Ranking.maxPerChannel.curiosity),
            ...diversifyRanked(unrankedFallback, "curiosity", Math.max(0, resultLimit - approvedAi.length), CONFIG.Ranking.maxPerChannel.curiosity)];
        }
      } catch (error) { aiError = error; rankError = error; logger.warn("pipeline", `AI judging failed (${correlationId})`, error.code || error.name); }
      metadata.timingsMs.judging = Date.now() - judgingStart;
      metadata.tokenEstimate = llm.tokenEstimate;
      metadata.llmProviders = [...llm.providers];
      metadata.usedFallback = llm.usedFallback;
      if (!isCurrent()) return { ok: false, errorCode: "CANCELLED", userMessage: "A newer request replaced this one." };
      if (rankError && mode === "learn") return { ok: false, errorCode: rankError?.code || "AI_UNAVAILABLE", userMessage: "FocusTube could not rank these results with Ollama. Retry the learning path or explicitly choose original YouTube results." };
      if (rankError && (mode === "interest" || mode === "curiosity")) {
        // Keep these browsing modes useful when retrieval worked but the
        // ranking provider did not. Never imply that these candidates were
        // AI curated; make the fallback explicit in the feed.
        judged = candidateVideos
          .map(video => mode === "interest" ? metadataFallbackInterestScore(video, interest) : metadataFallbackCuriosityScore(video))
          .map(video => compositeScore(video, mode === "interest" ? "interest" : "curiosity"))
          .sort((a, b) => (b.score || 0) - (a.score || 0));
        metadata.degraded = true;
        metadata.reason = rankError?.code || "AI_UNAVAILABLE";
        const aiTask = mode === "curiosity" ? "Ollama substance scoring" : "Ollama relevance ranking";
        metadata.fallbackLabel = `${aiTask} unavailable (${metadata.reason}). ${safeAiFailure(rankError)} These are unranked YouTube search matches.`;
      }
      const videos = judged.slice(0, resultLimit);
      if (!videos.length) return { ok: false, errorCode: "EMPTY_RESULTS", userMessage: "No videos met the quality threshold. Try a broader query or show original results." };
      if (!metadata.degraded) {
        metadata.degraded = Boolean(aiError);
        metadata.reason = aiError ? aiError.code || "AI_UNAVAILABLE" : null;
        metadata.fallbackLabel = aiError ? "Ollama query expansion failed; a deterministic query plan was used. Ranking status is shown by the video reasons." : null;
      } else if (!metadata.fallbackLabel && aiError) {
        metadata.fallbackLabel = "Ollama query expansion fell back to a deterministic plan. Video ranking results are marked individually.";
      }
      const channelNamesInResults = new Set(candidateVideos.map(video => String(video.channelName || "").trim().toLocaleLowerCase()).filter(Boolean));
      metadata.channels = channels.filter(channel => channelNamesInResults.has(channel.name.toLocaleLowerCase()));
      metadata.timingsMs.total = Date.now() - startedAt;
      const result = { ok: true, videos, channels: metadata.channels, metadata };
      await cache.set(key, result, CONFIG.Cache.ttlMs.pipeline);
      logger.info("pipeline", `completed ${mode}/${action} ${correlationId}: ${videos.length} videos; candidates=${candidateVideos.length}; providers=${(metadata.llmProviders || []).join(",") || "none"}; degraded=${metadata.degraded}; totalMs=${metadata.timingsMs.total}`);
      emitProgress(onProgress, correlationId, "complete", `Feed ready — ${videos.length} videos${metadata.degraded ? " (with fallback details)" : " ranked by Ollama"}.`, { count: videos.length, degraded: metadata.degraded });
      return result;
    } catch (error) {
      logger.error("pipeline", `failed ${mode}/${action} ${correlationId}`, error?.code || error?.name || "UNKNOWN");
      emitProgress(onProgress, correlationId, "failed", error?.message || "FocusTube could not finish this feed.");
      const mapped = friendlyError(error);
      return { ok: false, ...mapped };
    }
  })();
  inFlight.set(key, operation);
  try { return await operation; } finally { inFlight.delete(key); }
}
