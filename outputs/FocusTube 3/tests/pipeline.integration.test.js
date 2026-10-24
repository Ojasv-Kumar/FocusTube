import test from "node:test";
import assert from "node:assert/strict";
import { locallyRankVideos, runPipeline } from "../src/background/pipeline.js";
import { Cache } from "../src/background/cache.js";
import { HtmlProvider } from "../src/background/retrieval/html-provider.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key = null) { if (key === null) return Object.fromEntries(this.values); return this.values.has(key) ? { [key]: this.values.get(key) } : {}; }
  async set(values) { for (const [key, value] of Object.entries(values)) this.values.set(key, value); }
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) this.values.delete(key); }
}
const renderer = (id, title, endpoint = `/watch?v=${id}`, duration = "12:34") => ({ videoRenderer: { videoId: id, title: { simpleText: title }, lengthText: { simpleText: duration }, ownerText: { runs: [{ text: "Learning Channel" }] }, navigationEndpoint: { commandMetadata: { webCommandMetadata: { url: endpoint } } } } });

test("local ranking filters unrelated results by title and description metadata", () => {
  const result = locallyRankVideos([
    { id: "a", title: "Copilot basics for beginners", description: "Learn to use GitHub Copilot", channelName: "Code school" },
    { id: "b", title: "Build a Copilot coding project", description: "A hands-on GitHub Copilot example" },
    { id: "c", title: "Celebrity news this week", description: "Entertainment roundup" }
  ], "Copilot basics", 8);
  assert.deepEqual(result.map(row => row.id), ["a", "b"]);
  assert.ok(result[0].relevance >= result[1].relevance);
  assert.ok(result.every(row => !("role" in row) && !("reason" in row)));
});

test("YouTube HTML retrieval only extracts regular video results, never playlist or Shorts shelves", async () => {
  const data = { contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [
    { itemSectionRenderer: { contents: [renderer("normal", "Copilot basics explained"), { playlistRenderer: { title: { simpleText: "Copilot playlist" } } }] } },
    { reelShelfRenderer: { contents: [renderer("short-shelf", "Copilot quick tip", "/shorts/short-shelf", "0:30")] } }
  ] } } } } };
  const provider = new HtmlProvider({ fetchImpl: async () => ({ ok: true, text: async () => `ytInitialData = ${JSON.stringify(data)};` }) });
  const rows = await provider.search("Copilot basics");
  assert.deepEqual(rows.map(row => row.id), ["normal"]);
});

test("Learn pipeline uses YouTube HTML results and separates original matches from related searches", async () => {
  const storage = new MemoryStorage();
  const dataByQuery = [
    { items: [renderer("relevant", "Copilot basics explained for beginners"), renderer("unrelated", "Celebrity news roundup")] },
    { items: [renderer("related-explained", "Copilot basics explained with examples")] },
    { items: [renderer("related-tutorial", "Copilot basics tutorial and coding workflow")] }
  ];
  let requests = 0;
  const htmlFetchImpl = async () => { const data = dataByQuery[requests++]; return { ok: true, text: async () => `ytInitialData = ${JSON.stringify(data)};` }; };
  const result = await runPipeline({ mode: "learn", query: "Copilot basics" }, { resultsPerSearch: 8 }, { cache: new Cache(storage), htmlFetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.metadata.ranking, "local");
  assert.deepEqual(result.videos.map(row => [row.id, row.group]), [["relevant", "relevant"], ["related-explained", "related"], ["related-tutorial", "related"]]);
  assert.equal(requests, 3);
});

test("pipeline rejects unsupported modes without making network requests", async () => {
  let requests = 0;
  const result = await runPipeline({ mode: "unsupported", query: "anything" }, {}, { cache: new Cache(new MemoryStorage()), htmlFetchImpl: async () => { requests += 1; } });
  assert.equal(result.ok, true);
  assert.equal(requests, 0);
});
