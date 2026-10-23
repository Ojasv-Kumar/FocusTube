/* All product tuning lives here. Keep units and safe ranges beside each value. */
export const CONFIG = Object.freeze({
  LLM: {
    baseUrl: "https://api.openai.com/v1",
    fastModel: "gpt-4o-mini",
    smartModel: "gpt-4o-mini",
    timeoutMs: 25_000, // 1,000..120,000 ms
    maxRetries: 2, // 0..5 retries after the first attempt
    backoffBaseMs: 500, // 100..10,000 ms
    maxOutputTokens: { expansion: 500, judge: 1800, repair: 1800, test: 32 },
    temperature: { expansion: 0.2, judge: 0.1, repair: 0, test: 0 },
    repairOutputMaxChars: 12_000,
    repairSchemaMaxChars: 3_000,
    retryAfterMaxMs: 30_000
  },
  Pipeline: {
    queriesPerSearch: 3, // 1..8; includes the original query
    resultsPerQuery: 8, // 1..25
    maxCandidatePoolSize: 36, // 5..100
    maxDescriptionChars: 420, // 80..2,000
    minimumVideoDurationSeconds: 181, // seconds; conservative proxy for Shorts up to 3 minutes (0 disables)
    shortsMaxDurationSeconds: 180, // eligible square/vertical uploads up to 180s can be Shorts
    minimumRelevance: 0.55, // 0..1
    maxVideosShown: 12, // 1..30
    excludeLiveStreams: true,
    nearDuplicateSimilarity: 0.88, // 0..1 title-token Jaccard threshold
    concurrency: 3, // 1..8 in-flight retrieval queries
    queryMaxChars: 240,
    titleMaxChars: 260,
    channelNameMaxChars: 120,
    reasonMaxChars: 140,
    interestFeedQueries: 15, // 1..15 expansion searches per interest refresh
    interestChannelSuggestions: 8, // 0..20 names from the expansion response
    channelSuggestionMaxChars: 100,
    interestFallbackQueries: 4, // 1..8 comma-separated fallback searches
    curiositySeedChannelsPerFeed: 6, // 1..40 channel searches per refresh
    curiosityMaximumSensationalScore: 0.75, // 0..1; higher scores are filtered
    curiosityTopicQueries: ["science explained", "engineering projects", "history documentary", "mathematics visual explanation"],
    demoQueries: ["backpropagation", "op amp basics", "recursion in python"]
  },
  Cache: {
    ttlMs: { pipeline: 20 * 60_000, expansion: 6 * 60 * 60_000, retrieval: 30 * 60_000 },
    maxEntries: 120 // 10..2,000; oldest-first eviction
  },
  Modes: {
    learn: { hideHomeFeed: true, hideShorts: true, hideSidebarRecommendations: true, hideEndscreen: true, disableAutoplay: true, hideComments: false, hideTrending: true, redirectShortsToWatch: true, rankingProfile: "learning" },
    interest: { hideHomeFeed: true, hideShorts: true, hideSidebarRecommendations: false, hideEndscreen: true, disableAutoplay: true, hideComments: false, hideTrending: true, redirectShortsToWatch: true, rankingProfile: "interest" },
    curiosity: { hideHomeFeed: true, hideShorts: true, hideSidebarRecommendations: false, hideEndscreen: true, disableAutoplay: true, hideComments: false, hideTrending: true, redirectShortsToWatch: true, rankingProfile: "substance" },
    relax: { hideHomeFeed: false, hideShorts: false, hideSidebarRecommendations: false, hideEndscreen: false, disableAutoplay: false, hideComments: false, hideTrending: false, redirectShortsToWatch: false, rankingProfile: "none" }
  },
  Behaviour: { askForModeOnEveryNewTab: true, debugLogging: false, maxWaitMs: 8_000, selectorRetryMs: 250, navigationDebounceMs: 100, autoplayCheckMs: 1_000, autoplayMaxChecks: 12 },
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
    defaultProvider: "auto", // api | html | auto
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
