import test from "node:test";
import assert from "node:assert/strict";
import { LlmClient } from "../src/background/llm-client.js";
import { fetchWithTimeout } from "../src/background/network.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key = null) { if (key === null) return Object.fromEntries(this.values); return typeof key === "string" && this.values.has(key) ? { [key]: this.values.get(key) } : {}; }
  async set(values) { for (const [key, value] of Object.entries(values)) this.values.set(key, value); }
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) this.values.delete(key); }
}
const endpoint = "https://192.168.1.42:11435", token = "b".repeat(64);
const response = body => ({ ok: true, status: 200, json: async () => body });

test("default Ollama fetch preserves the global browser receiver", async () => {
  const previousFetch = globalThis.fetch, calls = [];
  globalThis.fetch = function (url, init) {
    assert.equal(this, globalThis, "native fetch must be invoked with the global receiver");
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/api/tags")) return Promise.resolve(response({ models: [{ name: "qwen3:8b" }] }));
    return Promise.resolve(response({ message: { content: '{"ready":true}' } }));
  };
  try {
    const client = new LlmClient({ ollamaEndpoint: endpoint, ollamaToken: token, ollamaModel: "qwen3:8b" });
    const result = await client.testConnection();
    assert.deepEqual(result, { ok: true, provider: "ollama", model: "qwen3:8b", endpoint, jsonOutput: true });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, `${endpoint}/api/tags`);
    assert.equal(calls[1].url, `${endpoint}/api/chat`);
  } finally { if (previousFetch === undefined) delete globalThis.fetch; else globalThis.fetch = previousFetch; }
});

test("network helper always settles if a fetch implementation hangs", async () => {
  await assert.rejects(fetchWithTimeout(() => new Promise(() => {}), "https://unit.test/", {}, 10, "test request"), error => error.code === "TIMEOUT_ERROR" && /timed out/.test(error.message));
});

test("connection-level Ollama network errors fail promptly without cloud fallback", async () => {
  let calls = 0;
  const client = new LlmClient({ ollamaEndpoint: endpoint, ollamaToken: token, ollamaModel: "qwen3:8b" }, { fetchImpl: async () => { calls += 1; throw new TypeError("Network unavailable"); } });
  await assert.rejects(client.testConnection(), error => error.code === "NETWORK_ERROR");
  assert.equal(calls, 1, "network failure should not rotate through cloud providers or keys");
});

test("YouTube Data API is actually called first when an API key is configured", async () => {
  const previousChrome = globalThis.chrome, previousFetch = globalThis.fetch;
  const seen = []; let htmlCalls = 0;
  globalThis.chrome = { storage: { local: new MemoryStorage() } };
  globalThis.fetch = async url => {
    const parsed = new URL(String(url)); seen.push(parsed);
    if (parsed.hostname !== "www.googleapis.com") throw new Error(`Unexpected upstream host ${parsed.hostname}`);
    if (parsed.pathname.endsWith("/search")) return { ok: true, status: 200, json: async () => ({ items: [{ id: { videoId: "api-video-001" }, snippet: { title: "Robotics explained in depth", channelTitle: "Engineering Channel", channelId: "channel-1", publishedAt: "2025-01-01T00:00:00Z" } }] }) };
    if (parsed.pathname.endsWith("/videos")) return { ok: true, status: 200, json: async () => ({ items: [{ id: "api-video-001", snippet: { title: "Robotics explained in depth", channelTitle: "Engineering Channel", channelId: "channel-1", publishedAt: "2025-01-01T00:00:00Z", description: "A detailed demonstration." }, contentDetails: { duration: "PT12M34S" }, statistics: { viewCount: "12345" }, liveStreamingDetails: {} }] }) };
    throw new Error(`Unexpected YouTube endpoint ${parsed.pathname}`);
  };
  try {
    const { retrieveQueries } = await import("../src/background/retrieval/index.js");
    const result = await retrieveQueries(["robotics"], { retrievalProvider: "auto", youtubeApiKey: "fake-youtube-key" }, { htmlFetchImpl: async () => { htmlCalls += 1; throw new Error("HTML must not run after successful API response"); } });
    assert.deepEqual(result.providers, ["api"]);
    assert.equal(result.videos[0]?.id, "api-video-001");
    assert.deepEqual(seen.map(url => url.pathname), ["/youtube/v3/search", "/youtube/v3/videos"]);
    assert.ok(seen.every(url => url.searchParams.get("key") === "fake-youtube-key"));
    assert.equal(htmlCalls, 0);
  } finally { if (previousChrome === undefined) delete globalThis.chrome; else globalThis.chrome = previousChrome; if (previousFetch === undefined) delete globalThis.fetch; else globalThis.fetch = previousFetch; }
});

test("a hanging Ollama call times out and Interest still returns a clearly labeled feed", async () => {
  const previousChrome = globalThis.chrome, previousFetch = globalThis.fetch;
  const { CONFIG } = await import("../src/config.js"); const originalTimeout = CONFIG.LLM.timeoutMs; const originalExpansionTimeout = CONFIG.LLM.expansionTimeoutMs; const originalRetrievalTimeout = CONFIG.Pipeline.retrievalTimeoutMs; const originalRequestTimeout = CONFIG.Retrieval.requestTimeoutMs;
  const storage = new MemoryStorage();
  const renderer = { videoRenderer: { videoId: "timeout-fallback-video", title: { simpleText: "Neural networks explained with a practical long-form example" }, lengthText: { simpleText: "12:34" }, ownerText: { runs: [{ text: "Engineering Channel" }] }, navigationEndpoint: { commandMetadata: { webCommandMetadata: { url: "/watch?v=timeout-fallback-video" } } } } };
  const html = `ytInitialData = ${JSON.stringify({ items: [renderer] })};`;
  globalThis.chrome = { runtime: { getURL: path => `chrome-extension://test/${path}` }, storage: { local: storage } };
  globalThis.fetch = url => String(url).endsWith("/api/chat") ? new Promise(() => {}) : Promise.reject(new Error(`Unexpected fetch ${url}`));
  CONFIG.LLM.timeoutMs = 20; CONFIG.LLM.expansionTimeoutMs = 20;
  try {
    const [{ runPipeline }, { Cache }] = await Promise.all([import("../src/background/pipeline.js"), import("../src/background/cache.js")]);
    const started = Date.now();
    const result = await runPipeline({ mode: "interest", action: "home", interest: "neural networks" }, { ollamaEndpoint: endpoint, ollamaToken: token, ollamaModel: "qwen3:8b", retrievalProvider: "html", youtubeApiKey: "", resultsPerSearch: 50, mockMode: false }, { cache: new Cache(storage), correlationId: "forced-timeout", htmlFetchImpl: async () => ({ ok: true, status: 200, text: async () => html }) });
    assert.ok(Date.now() - started < 1_000, "the test request should not remain loading after its deadline");
    assert.equal(result.ok, true);
    assert.equal(result.metadata.degraded, true);
    assert.match(result.metadata.fallbackLabel, /TIMEOUT_ERROR/);
    assert.equal(result.videos[0]?.id, "timeout-fallback-video");
    assert.match(result.videos[0].reason, /not AI-ranked/);
  } finally { CONFIG.LLM.timeoutMs = originalTimeout; CONFIG.LLM.expansionTimeoutMs = originalExpansionTimeout; CONFIG.Pipeline.retrievalTimeoutMs = originalRetrievalTimeout; CONFIG.Retrieval.requestTimeoutMs = originalRequestTimeout; if (previousChrome === undefined) delete globalThis.chrome; else globalThis.chrome = previousChrome; if (previousFetch === undefined) delete globalThis.fetch; else globalThis.fetch = previousFetch; }
});


test("a stalled YouTube retrieval phase stops loading within its configured deadline", async () => {
  const previousChrome = globalThis.chrome, previousFetch = globalThis.fetch;
  const { CONFIG } = await import("../src/config.js");
  const originalRetrievalTimeout = CONFIG.Pipeline.retrievalTimeoutMs;
  const originalRequestTimeout = CONFIG.Retrieval.requestTimeoutMs;
  const storage = new MemoryStorage();
  globalThis.chrome = { runtime: { getURL: path => `chrome-extension://test/${path}` }, storage: { local: storage } };
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).endsWith("/api/chat")) {
      const body = JSON.parse(init.body || "{}");
      const system = body.messages?.find(row => row.role === "system")?.content || "";
      if (system.includes("YouTube discovery planner")) return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ queries: ["robotics control systems", "robotics sensors", "robotics history", "robotics engineering"] }) } }) };
      return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ videos: [] }) } }) };
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  CONFIG.Pipeline.retrievalTimeoutMs = 20;
  CONFIG.Retrieval.requestTimeoutMs = 30;
  try {
    const [{ runPipeline }, { Cache }] = await Promise.all([import("../src/background/pipeline.js"), import("../src/background/cache.js")]);
    const phases = []; const started = Date.now();
    const result = await runPipeline({ mode: "interest", action: "home", interest: "robotics" }, { ollamaEndpoint: endpoint, ollamaToken: token, ollamaModel: "qwen3:8b", retrievalProvider: "html", youtubeApiKey: "", mockMode: false, resultsPerSearch: 50 }, { cache: new Cache(storage), correlationId: "stalled-retrieval", htmlFetchImpl: async () => new Promise(() => {}), onProgress: row => phases.push(row.stage) });
    assert.ok(Date.now() - started < 500, "the feed should not wait for stalled search fetches");
    assert.equal(result.ok, false);
    assert.ok(["PIPELINE_TIMEOUT", "YOUTUBE_HTML_TIMEOUT", "YOUTUBE_HTML_FETCH_FAILED"].includes(result.errorCode), `unexpected error code: ${result.errorCode}`);
    assert.ok(phases.includes("retrieval"));
    assert.ok(phases.includes("failed"));
  } finally {
    CONFIG.Pipeline.retrievalTimeoutMs = originalRetrievalTimeout; CONFIG.Retrieval.requestTimeoutMs = originalRequestTimeout;
    if (previousChrome === undefined) delete globalThis.chrome; else globalThis.chrome = previousChrome;
    if (previousFetch === undefined) delete globalThis.fetch; else globalThis.fetch = previousFetch;
  }
});
