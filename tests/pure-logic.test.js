import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG, validateConfig } from "../src/config.js";
import { normalizeQuery } from "../src/utils.js";
import { extractJson, validateLearnJudge, validateInterestJudge, validateCuriosityJudge, validateQueries } from "../src/background/validators.js";
import { ApiProvider, parseIsoDuration } from "../src/background/retrieval/api-provider.js";
import { parseClockDuration, parseViewCount, normalizeRenderer } from "../src/background/retrieval/html-provider.js";
import { mergeVideos, interleaveQueryResults } from "../src/background/retrieval/index.js";
import { Cache } from "../src/background/cache.js";
import { prefilterCandidates } from "../src/background/pipeline.js";
import { addQuotaUsage, canSpendQuota, pacificDateKey } from "../src/background/quota.js";
import { pageTypeFromUrl, makeHideCss } from "../src/selectors.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key = null) {
    if (key === null) return Object.fromEntries(this.values);
    if (Array.isArray(key)) return Object.fromEntries(key.filter(item => this.values.has(item)).map(item => [item, this.values.get(item)]));
    if (typeof key === "string") return this.values.has(key) ? { [key]: this.values.get(key) } : {};
    return {};
  }
  async set(values) { for (const [key, value] of Object.entries(values)) this.values.set(key, value); }
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) this.values.delete(key); }
}

test("HTML clock durations parse mm:ss and hh:mm:ss strictly", () => {
  assert.equal(parseClockDuration("12:34"), 754);
  assert.equal(parseClockDuration("1:02:03"), 3723);
  assert.equal(parseClockDuration("00:00"), 0);
  assert.equal(parseClockDuration("1:88"), null);
  assert.equal(parseClockDuration("live"), null);
});

test("ISO 8601 durations parse hours, fractional seconds, and days", () => {
  assert.equal(parseIsoDuration("PT12M34S"), 754);
  assert.equal(parseIsoDuration("PT1H2M3S"), 3723);
  assert.equal(parseIsoDuration("PT1.5S"), 1);
  assert.equal(parseIsoDuration("P1DT2H"), 93600);
  assert.equal(parseIsoDuration("P"), null);
  assert.equal(parseIsoDuration("3:21"), null);
});

test("view counts parse compact values and localized labels", () => {
  assert.equal(parseViewCount("1.2M views"), 1_200_000);
  assert.equal(parseViewCount("845K views"), 845_000);
  assert.equal(parseViewCount("1,234 views"), 1234);
  assert.equal(parseViewCount("2.5B views"), 2_500_000_000);
  assert.equal(parseViewCount("no count"), null);
});

test("JSON extraction strips fences, tolerates trailing commas, and ignores braces in strings", () => {
  assert.deepEqual(extractJson('answer: ```json\n{"text":"brace } inside", "items":[1,2,],}\n```'), { text: "brace } inside", items: [1, 2] });
  assert.throws(() => extractJson("not json"), { code: "PARSE_ERROR" });
});

test("judge validation clamps scores and drops IDs outside the candidate pool", () => {
  const candidates = [{ id: "known", title: "Known", channelName: "Channel" }];
  const result = validateLearnJudge({ videos: [
    { id: "known", relevance: 4, quality: -2, role: "nonsense", reason: "x".repeat(300), include: true },
    { id: "unknown", relevance: 1, include: true }
  ] }, candidates);
  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0].relevance, 0.4);
  assert.equal(result.videos[0].quality, 0);
  assert.equal(result.videos[0].role, "other");
  assert.equal(result.videos[0].reason.length, 140);
  const indexed = validateLearnJudge({ videos: [{ i: 1, fit: 0.8, q: 0.75, role: "handson", w: "Build a small example" }] }, [
    { id: "first", title: "First" }, { id: "second", title: "Second" }
  ]);
  assert.equal(indexed.videos[0].id, "second");
  assert.equal(indexed.videos[0].role, "hands_on");
});


test("compact index-based Ollama scores map back to the exact YouTube candidates", () => {
  const candidates = [
    { id: "abcdefghijk", title: "Neural network basics", channelName: "A" },
    { id: "lmnopqrstuv", title: "Transformer attention", channelName: "B" }
  ];
  const interest = validateInterestJudge({ videos: [
    { i: 0, fit: 0.9, q: 0.8, role: "core" },
    { i: 1, fit: 0.7, q: 0.9, role: "tutorial" }
  ] }, candidates);
  assert.deepEqual(interest.videos.map(video => video.id), ["abcdefghijk", "lmnopqrstuv"]);
  assert.equal(interest.videos[0].relevance, 0.9);
  const curiosity = validateCuriosityJudge({ videos: [{ i: 1, q: 0.88, clickbait: 0.12 }] }, candidates);
  assert.equal(curiosity.videos.length, 1);
  assert.equal(curiosity.videos[0].id, "lmnopqrstuv");
  assert.equal(curiosity.videos[0].substance, 0.88);
});

test("query expansion always includes the original and removes duplicates", () => {
  assert.deepEqual(validateQueries({ queries: ["intuition", "intuition", "examples"] }, "Backpropagation", 3), ["Backpropagation", "intuition", "examples"]);
});

test("query normalization trims controls and preserves Unicode", () => {
  assert.equal(normalizeQuery("  हिंदी\tAI\u0000  "), "हिंदी AI");
  assert.equal(normalizeQuery("long".repeat(100), 12).length, 12);
  assert.equal(normalizeQuery("a".repeat(239) + "😀z", 240).endsWith("😀"), true);
});

test("dedupe merges repeated IDs and near-identical titles", () => {
  const result = mergeVideos([[{ id: "a", title: "Visual Guide to Gradient Descent", description: "" }, { id: "a", title: "Visual Guide to Gradient Descent", description: "A longer description" }, { id: "b", title: "Visual Guide to Gradient Descent", description: "duplicate" }, { id: "c", title: "An unrelated history of Rome", description: "" }]], 0.88);
  assert.equal(result.length, 2);
  assert.equal(result[0].description, "A longer description");
});

test("query result groups are interleaved so one source cannot fill the feed first", () => {
  const result = interleaveQueryResults([
    [{ id: "channel-a-1", title: "Robotics assembly tutorial", channelName: "Channel A" }, { id: "channel-a-2", title: "Circuit design practical guide", channelName: "Channel A" }],
    [{ id: "topic-b-1", title: "Medieval trade route documentary", channelName: "Channel B" }, { id: "topic-b-2", title: "Marine biology field research", channelName: "Channel B" }],
    [{ id: "topic-c-1", title: "Modern architecture history", channelName: "Channel C" }]
  ]);
  assert.deepEqual(result.map(video => video.id), ["channel-a-1", "topic-b-1", "topic-c-1", "channel-a-2", "topic-b-2"]);
});

test("cache honors TTL and evicts the oldest entry", async () => {
  const storage = new MemoryStorage();
  let now = 100;
  const cache = new Cache(storage, () => now, 2);
  await cache.set("first", { value: 1 }, 50);
  await cache.set("second", { value: 2 }, 500);
  assert.deepEqual(await cache.get("first"), { value: 1 });
  await cache.set("third", { value: 3 }, 500);
  assert.equal(await cache.get("first"), null);
  assert.deepEqual(await cache.get("second"), { value: 2 });
  now = 700;
  assert.equal(await cache.get("second"), null);
});

test("quota accounting tracks Pacific-day search calls and other units", () => {
  assert.equal(pacificDateKey(new Date("2026-10-23T06:30:00Z")), "2026-10-22");
  assert.equal(pacificDateKey(new Date("2026-10-23T07:30:00Z")), "2026-10-23");
  const usage = addQuotaUsage({ dateKey: "2026-10-23", searchCalls: 99, searchUnits: 99, otherUnits: 9998 }, { searchCalls: 1, searchUnits: 1, otherUnits: 1 }, "2026-10-23");
  assert.equal(canSpendQuota(usage, { searchCalls: 1, searchUnits: 1 }, { searchCalls: 100, searchUnits: 100, otherUnits: 10000 }), false);
  assert.deepEqual(addQuotaUsage(usage, { searchCalls: 1, searchUnits: 1 }, "2026-10-24"), { dateKey: "2026-10-24", searchCalls: 1, searchUnits: 1, otherUnits: 0 });
});

test("concurrent API calls do not overwrite each other's quota accounting", async () => {
  const storage = new MemoryStorage();
  const api = new ApiProvider({ apiKey: "test", storage, fetchImpl: async () => {
    await new Promise(resolve => setTimeout(resolve, 2));
    return { ok: true, status: 200, json: async () => ({ items: [] }) };
  } });
  await Promise.all([
    api.request("search", { part: "snippet", type: "video", q: "robotics", maxResults: 8 }, 1),
    api.request("search", { part: "snippet", type: "video", q: "robotics projects", maxResults: 8 }, 1)
  ]);
  const usage = (await storage.get("focustube.apiQuota"))["focustube.apiQuota"];
  assert.equal(usage.searchCalls, 2);
  assert.equal(usage.searchUnits, 2);
});

test("config sanity checks pass and required roles are configured", () => {
  assert.deepEqual(validateConfig(), { ok: true, problems: [] });
  assert.equal(CONFIG.UI.labels.intro, "Start here");
  assert.equal(CONFIG.Retrieval.searchListCost, 1);
  assert.equal(CONFIG.Retrieval.apiDailySearchCalls, 100);
});

test("page type detection handles YouTube routes and invalid URLs", () => {
  assert.equal(pageTypeFromUrl("https://www.youtube.com/"), "home");
  assert.equal(pageTypeFromUrl("https://www.youtube.com/results?search_query=robotics"), "search");
  assert.equal(pageTypeFromUrl("https://www.youtube.com/watch?v=abc"), "watch");
  assert.equal(pageTypeFromUrl("https://www.youtube.com/shorts/abc"), "shorts");
  assert.equal(pageTypeFromUrl("https://www.youtube.com/@channel"), "channel");
  assert.equal(pageTypeFromUrl("not a url"), "other");
});

test("HTML renderer normalization produces a safe normalized video", () => {
  const video = normalizeRenderer({ videoId: "abc123", title: { simpleText: "Test title" }, lengthText: { simpleText: "12:34" }, viewCountText: { simpleText: "1.2M views" }, ownerText: { runs: [{ text: "A channel" }] }, navigationEndpoint: { commandMetadata: { webCommandMetadata: { url: "/watch?v=abc123" } } } });
  assert.equal(video.id, "abc123");
  assert.equal(video.durationSeconds, 754);
  assert.equal(video.viewCount, 1_200_000);
  assert.equal(video.channelName, "A channel");
});

test("mode CSS is scoped to home and generated from centralized selectors", () => {
  const css = makeHideCss(CONFIG.Modes);
  assert.match(css, /data-focustube-page="home"/);
  assert.match(css, /ytd-reel-shelf-renderer/);
  assert.match(css, /ytd-shelf-renderer:has\(a\[href\^='\/shorts\/'\]\)/);
  assert.match(css, /ytd-masthead #center ytd-searchbox/);
  assert.match(css, /data-focustube-search="true"/);
});

test("Curiosity removes repeat videos about the same distinctive event but Interest keeps relevant variants", () => {
  const videos = [
    { id: "a", title: "Why the Tacoma Narrows Bridge Collapsed", durationSeconds: 700 },
    { id: "b", title: "Tacoma Narrows Bridge Failure Explained", durationSeconds: 650 },
    { id: "c", title: "How Octopuses Change Color to Hide", durationSeconds: 540 },
    { id: "d", title: "The Economics of Airline Overbooking", durationSeconds: 620 }
  ];
  assert.deepEqual(prefilterCandidates(videos, "curiosity").map(video => video.id), ["a", "c", "d"]);
  assert.deepEqual(prefilterCandidates(videos, "interest").map(video => video.id), ["a", "b", "c", "d"]);
});
