/* Local behavior and UI tuning. FocusTube uses YouTube search HTML; no external API keys. */
export const CONFIG = Object.freeze({
  Pipeline: {
    resultsPerSearch: 30,
    maxVideosShown: 12,
    maxDescriptionChars: 420,
    queryMaxChars: 240,
    titleMaxChars: 260,
    channelNameMaxChars: 120,
    minimumLocalRelevance: 0.34,
    nearDuplicateSimilarity: 0.88,
    excludeLiveStreams: true
  },
  Cache: { ttlMs: { pipeline: 10 * 60_000, retrieval: 20 * 60_000 }, maxEntries: 120 },
  Modes: {
    learn: { hideHomeFeed: true, hideShorts: true, hideTrending: true, hideSidebarRecommendations: true, hideEndscreen: true, disableAutoplay: true },
    relax: { hideHomeFeed: false, hideShorts: false, hideTrending: false, hideSidebarRecommendations: false, hideEndscreen: false, disableAutoplay: false }
  },
  Behaviour: { showFloatingSwitcher: false, maxWaitMs: 8_000, selectorRetryMs: 250, navigationDebounceMs: 100, autoplayCheckMs: 1_000, autoplayMaxChecks: 12 },
  Settings: { hideCommentsInLearn: false, hideSubscriptionsInLearn: true, theme: "dark" },
  UI: {
    skeletonCardCount: 4,
    modeDescriptions: { learn: "A quieter YouTube with focused, locally filtered search.", relax: "Use YouTube as usual." }
  },
});

export function validateConfig(config = CONFIG) {
  const problems = [];
  if (config.Pipeline.maxVideosShown < 1) problems.push("maxVideosShown must be positive");
  if (config.Pipeline.minimumLocalRelevance < 0 || config.Pipeline.minimumLocalRelevance > 1) problems.push("minimumLocalRelevance must be 0..1");
  if (!config.Modes.learn || !config.Modes.relax) problems.push("learn and relax modes are required");
  return { ok: problems.length === 0, problems };
}
