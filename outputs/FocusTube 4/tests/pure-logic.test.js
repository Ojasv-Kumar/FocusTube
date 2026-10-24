import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG, validateConfig } from "../src/config.js";
import { normalizeQuery } from "../src/utils.js";
import { pageTypeFromUrl, makeHideCss } from "../src/selectors.js";
import { parseClockDuration, parseViewCount, normalizeRenderer } from "../src/background/retrieval/html-provider.js";
import { mergeVideos } from "../src/background/retrieval/index.js";

test("HTML durations and view counts normalize safely", () => {
  assert.equal(parseClockDuration("12:34"), 754); assert.equal(parseClockDuration("1:02:03"), 3723); assert.equal(parseClockDuration("1:88"), null);
  assert.equal(parseViewCount("1.2M views"), 1_200_000); assert.equal(parseViewCount("no count"), null);
  const video = normalizeRenderer({ videoId: "v1", title: { simpleText: "Test title" }, lengthText: { simpleText: "12:34" }, ownerText: { runs: [{ text: "Channel" }] } });
  assert.equal(video.id, "v1"); assert.equal(video.durationSeconds, 754); assert.equal(video.channelName, "Channel");
});
test("merge deduplicates and excludes Shorts and live streams", () => {
  assert.deepEqual(mergeVideos([[{ id: "a", title: "one" }, { id: "b", title: "two", isShort: true }], [{ id: "a", title: "duplicate" }, { id: "c", title: "live", isLive: true }]]).map(v => v.id), ["a"]);
});
test("settings and route configuration are valid", () => {
  assert.deepEqual(validateConfig(), { ok: true, problems: [] }); assert.deepEqual(Object.keys(CONFIG.Modes), ["learn", "relax"]);
  assert.equal(normalizeQuery("  हिंदी\tAI\u0000  "), "हिंदी AI"); assert.equal(normalizeQuery("long".repeat(100), 12).length, 12);
  assert.equal(pageTypeFromUrl("https://www.youtube.com/results?search_query=robotics"), "search");
  assert.equal(pageTypeFromUrl("https://www.youtube.com/shorts/abc"), "shorts");
  const css = makeHideCss(CONFIG.Modes); assert.match(css, /data-focustube-page="home"/); assert.match(css, /ytd-reel-shelf-renderer/); assert.match(css, /grid-shelf-view-model:has\(a\[href\^='\/shorts\/'\]\)/); assert.match(css, /ytd-search #primary > ytd-section-list-renderer/); assert.match(css, /ytd-masthead #center/); assert.match(css, /ytd-feed-filter-chip-bar-renderer/); assert.match(css, /ytd-search-header-renderer/); assert.match(css, /ytd-notification-topbar-button-renderer/);
});
