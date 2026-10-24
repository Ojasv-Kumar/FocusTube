/* All product tuning lives here. Keep units and safe ranges beside each value. */
export const CONFIG = Object.freeze({
  LLM: {
    defaultEndpoint: "",
    defaultModel: "qwen3:8b",
    timeoutMs: 15_000,
    connectivityTimeoutMs: 8_000,
    connectionTestTimeoutMs: 60_000,
    expansionTimeoutMs: 9_000,
    keepAlive: "30m",
    topP: 0.9,
    seed: 42,
    numCtx: 8192,
    maxOutputTokens: { expansion: 80, judge: 192, repair: 96, test: 64 },
    temperature: { expansion: 0.3, judge: 0.1, repair: 0, test: 0 },
    callProfiles: {
      expand: { temperature: 0.3, numPredict: 72 },
      judge: { temperature: 0.1, numPredict: 192 },
      interestPlan: { temperature: 0.4, numPredict: 80 },
      curiosity: { temperature: 0.8, numPredict: 96 },
      repair: { temperature: 0, numPredict: 96 },
      test: { temperature: 0, numPredict: 64 }
    },
    repairOutputMaxChars: 2_000,
    repairSchemaMaxChars: 1_200,
    retryAfterMaxMs: 30_000
  },
  Pipeline: {
    queriesPerSearch: 3, // 1..8; includes the original query
    resultsPerQuery: 10, // A small retrieval sample across distinct queries
    maxCandidatePoolSize: 12, // Rank one fast batch at a time; later batches are prefetched and paged
    maxDescriptionChars: 64, // Keep local-model prompts compact for Qwen 8B
    minimumVideoDurationSeconds: 240, // drop videos shorter than four minutes; 0 disables
    shortsMaxDurationSeconds: 180, // eligible short uploads up to 180s are removed
    minimumRelevance: 0.60, // 0..1; Learn fit threshold
    minimumLearnQuality: 0.50, // 0..1; Learn quality floor
    maxLearnVideosPerRole: 3, // avoid a feed dominated by one instructional format
    maxVideosShown: 50, // Maximum videos across all paged batches
    feedBatchSize: 12, // Initial/next visible batch; next batch is prefetched in the background
    prefetchDelayMs: 250,
    interestPlanQueries: 5, // compact expansion plan cached once per interest
    interestQueriesPerFeed: 5, // original query plus four planned searches
    interestFallbackQuerySuffixes: ["explained", "analysis", "deep dive", "documentary", "history", "hidden details", "theories", "case study", "interview", "timeline", "beginner guide", "advanced concepts", "myths and misconceptions", "behind the scenes", "underrated"],
    curiosityAreaStride: 7, // deterministic permutation stride; coprime with 30 configured areas
    curiosityRecentPages: 3,
    curiosityMaxRecentQueries: 6,
    rankingBatchSize: 6, // Two compact Ollama judge calls make one 12-video page; avoids long truncated generations
    learnRankingBatchSize: 6, // Keep Learn JSON compact while still returning a 10-12 video page
    rankingOutputTokenBase: 32,
    rankingOutputTokensPerCandidate: 24,
    minInterestRelevance: 0.6,
    minJudgeQuality: 0.5,
    minCuriositySubstance: 0.7,
    excludeLiveStreams: true,
    curiosityQueriesPerFeed: 6,
    curiosityAreas: [
      "science explainers physics space biology chemistry", "math and visual intuition", "history and documentaries",
      "philosophy and psychology", "economics finance and money systems", "geopolitics and world affairs",
      "language learning and polyglots", "university lecture series", "programming tutorials and coding projects",
      "competitive programming and algorithms", "artificial intelligence and machine learning", "electronics hardware robotics",
      "gadgets chips and technology news", "woodworking metalworking and restoration", "engineering failures and megaprojects",
      "productivity study techniques and focus", "careers interviews and workplace stories", "entrepreneurship startups and business cases",
      "fitness training science and mobility", "personal finance freelancing side hustles", "gaming speedruns esports and game lore",
      "film anime and video essays", "music production and instrument covers", "expert podcasts and long conversations",
      "comedy sketches and parody", "true crime and internet mysteries", "travel and street food documentaries",
      "cooking techniques and food science", "cars aviation trains and transport", "ambient nature and slow living content"
    ],
    nearDuplicateSimilarity: 0.88, // 0..1 title-token Jaccard threshold
    concurrency: 5, // 1..8 in-flight retrieval queries
    retrievalTimeoutMs: 12_000, // bound the whole retrieval phase
    totalTimeoutMs: 45_000, // Bound every feed stage; expansion/ranking each have their own stricter timeout
    queryMaxChars: 240,
    titleMaxChars: 90,
    channelNameMaxChars: 120,
    reasonMaxChars: 140,
    interestChannelSuggestions: 4, // 0..20 names from the compact expansion response
    channelSuggestionMaxChars: 100,
    interestFallbackQueries: 4, // 1..8 comma-separated fallback searches
    curiositySeedChannelsPerFeed: 0, // Diverse topic queries outperform channel-only searches
    curiosityMaximumSensationalScore: 0.75, // 0..1; higher scores are filtered
    maxVideosPerCuriosityQuery: 2, // Hard cap to prevent one topic/source query dominating a batch
    curiosityTopicQueries: [
      "surprising physics space biology chemistry mechanisms", "math concepts explained with visual intuition", "ancient civilization discoveries documentary deep dive",
      "cognitive biases that change everyday decisions", "economics incentives that create unexpected outcomes", "why countries make strategic geopolitical choices",
      "comprehensible language input immersion methods", "MIT Stanford NPTEL lecture concept explained", "build a useful coding project from scratch",
      "competitive programming algorithm walkthrough with proof", "machine learning model explained with a demo", "Arduino robotics PCB teardown engineering project",
      "how chip architecture changes laptop performance", "woodworking metalworking restoration process explained", "megaproject failures and engineering lessons learned",
      "study techniques tested by cognitive science", "technical interview problem solving and career lessons", "startup business case study failure analysis",
      "strength training mobility mechanisms evidence based", "personal finance freelancing income systems explained", "speedrun strategy game mechanics lore deep dive",
      "film anime visual storytelling analysis essay", "music production sound design instrument technique", "expert long form conversation about a difficult idea",
      "comedy sketch structure parody writing breakdown", "evidence based analysis of an internet mystery", "slow travel street food culture documentary",
      "restaurant cooking technique food science explained", "aviation train car engineering investigation documentary", "ambient nature soundscape study with me"
    ],
    demoQueries: ["backpropagation", "op amp basics", "recursion in python"]
  },
  Cache: {
    ttlMs: { pipeline: 20 * 60_000, expansion: 6 * 60 * 60_000, retrieval: 30 * 60_000, ranking: 7 * 24 * 60 * 60_000 },
    maxEntries: 400 // includes query, retrieval, and per-video ranking cache rows
  },
  Modes: {
    learn: { hideHomeFeed: true, hideShorts: true, hideSubscriptions: false, hideNotifications: true, hideSidebarRecommendations: true, hideEndscreen: true, disableAutoplay: true, hideComments: false, hideTrending: true, redirectShortsToWatch: true, rankingProfile: "learning" },
    interest: { hideHomeFeed: true, hideShorts: true, hideSidebarRecommendations: false, hideEndscreen: true, disableAutoplay: true, hideComments: false, hideTrending: true, redirectShortsToWatch: true, rankingProfile: "interest" },
    curiosity: { hideHomeFeed: true, hideShorts: true, hideSidebarRecommendations: false, hideEndscreen: true, disableAutoplay: true, hideComments: false, hideTrending: true, redirectShortsToWatch: true, rankingProfile: "substance" },
    relax: { hideHomeFeed: false, hideShorts: false, hideSidebarRecommendations: false, hideEndscreen: false, disableAutoplay: false, hideComments: false, hideTrending: false, redirectShortsToWatch: false, rankingProfile: "none" }
  },
  Ranking: {
    duplicateTitleJaccard: 0.8,
    clickbaitPenalty: 0.15,
    maxClickbaitPenalty: 0.45,
    clickbaitPhrases: ["you won't believe", "shocking", "gone wrong", "exposed", "insane", "must watch", "destroyed", "what happens next"],
    weights: {
      learn: { fit: 0.50, quality: 0.30, engagement: 0.05, duration: 0.10, channel: 0.05 },
      interest: { fit: 0.50, quality: 0.25, engagement: 0.10, duration: 0.05, channel: 0.10 },
      curiosity: { fit: 0.40, quality: 0.35, engagement: 0.15, duration: 0.05, channel: 0.05 }
    },
    idealDurationMinutes: { learn: { min: 8, max: 40 }, interest: { min: 5, max: 45 }, curiosity: { min: 5, max: 35 } },
    maxPerChannel: { learn: 2, interest: 3, curiosity: 2 }
  },
  Behaviour: { debugLogging: false, showFloatingSwitcher: false, gateWatchdogMs: 15_000, maxWaitMs: 8_000, selectorRetryMs: 250, navigationDebounceMs: 100, autoplayCheckMs: 1_000, autoplayMaxChecks: 12 },
  Settings: { hideShortsInLearn: true, disableAutoplayInLearn: true, resultsPerSearch: 50, showReasons: false, defaultInterestTopic: "", curiosityStrictness: "balanced", density: "comfortable", mockMode: false, debugLogging: false, askForModeEveryTab: true, keepCommentsVisible: true },
  UI: {
    maxResultsShown: 12,
    skeletonCardCount: 4,
    labels: { intro: "Start here", deep_dive: "Go deeper", hands_on: "Build it", reference: "Keep handy", other: "More useful picks" },
    modeDescriptions: {
      learn: "Learn something specific, with a guided path.",
      interest: "Explore one interest through videos and channels.",
      curiosity: "Browse broadly, with an eye for high substance.",
      relax: "Use YouTube as usual."
    }
  },
  Retrieval: {
    defaultProvider: "auto", // Prefer the YouTube Data API when configured; use HTML as a fallback.
    apiProviderEnabled: true,
    requestTimeoutMs: 8_000,
    apiDailySearchCalls: 100, // current YouTube Search Queries bucket default
    apiDailySearchUnits: 100,
    apiDailyQuotaLimit: 10_000, // videos.list and other read quota units
    searchListCost: 1, // current official Search Queries bucket cost per call
    videosListCost: 1,
    apiResetTimeZone: "America/Los_Angeles"
  },
  ModesPicker: { interestMaxChars: 120, interestMinChars: 2 }
});

export function validateConfig(config = CONFIG) {
  const problems = [];
  if (config.Pipeline.queriesPerSearch < 1 || config.Pipeline.queriesPerSearch > 8) problems.push("queriesPerSearch must be 1..8");
  if (config.Pipeline.minimumRelevance < 0 || config.Pipeline.minimumRelevance > 1) problems.push("minimumRelevance must be 0..1");
  if (config.Cache.maxEntries < 1) problems.push("cache maxEntries must be positive");
  if (!config.Modes.learn || !config.Modes.relax) problems.push("learn and relax modes are required");
  return { ok: problems.length === 0, problems };
}
