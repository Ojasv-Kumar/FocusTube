import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key = null) {
    if (key === null) return Object.fromEntries(this.values);
    if (typeof key === "string") return this.values.has(key) ? { [key]: this.values.get(key) } : {};
    return {};
  }
  async set(values) { for (const [key, value] of Object.entries(values)) this.values.set(key, value); }
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) this.values.delete(key); }
}

function renderer(id, title, duration, endpoint = `/watch?v=${id}`) {
  return { videoRenderer: {
    videoId: id,
    title: { simpleText: title },
    lengthText: { simpleText: duration },
    ownerText: { runs: [{ text: "Engineering Channel" }] },
    navigationEndpoint: { commandMetadata: { webCommandMetadata: { url: endpoint } } }
  } };
}

test("Learn pipeline ranks only its candidate pool and excludes likely Shorts", async () => {
  const local = new MemoryStorage();
  globalThis.chrome = {
    runtime: { getURL: path => `chrome-extension://test/${path}` },
    storage: { local },
    permissions: { contains: async () => true }
  };
  const html = `ytInitialData = ${JSON.stringify({ items: [
    renderer("long-one", "Backpropagation explained", "12:34"),
    renderer("short-duration", "Quick backpropagation tip", "2:55"),
    renderer("short-route", "Backpropagation clip", "5:00", "/shorts/short-route")
  ]})};`;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).endsWith("/api/chat")) {
      const request = JSON.parse(init.body);
      const user = request.messages.at(-1).content;
      const system = request.messages.find(message => message.role === "system")?.content || "";
      calls.push({ user, system });
      const result = system.includes("planning focused learning searches")
        ? { queries: ["Backpropagation intuition", "Backpropagation derivation"] }
        : { videos: [{ i: 0, fit: 0.94, q: 0.9, role: "intro", w: "Clear step-by-step explanation" }] };
      return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify(result) }, done: true }), headers: new Headers() };
    }
    return { ok: true, status: 200, text: async () => html };
  };

  const { runPipeline } = await import("../src/background/pipeline.js");
  const { Cache } = await import("../src/background/cache.js");
  const result = await runPipeline(
    { mode: "learn", query: "Backpropagation", action: "search" },
    { ollamaEndpoint: "https://192.168.1.42:11435", ollamaToken: "a".repeat(64), ollamaModel: "qwen3:8b", retrievalProvider: "html", youtubeApiKey: "", mockMode: false },
    { cache: new Cache(local), correlationId: "integration" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.metadata.degraded, false);
  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0].id, "long-one");
  assert.equal(result.videos[0].role, "intro");
  assert.equal(calls.length, 2, "one expansion call and one judge call should complete");
  assert.doesNotMatch(calls[1].user, /short-duration|short-route/);

  globalThis.fetch = async url => String(url).endsWith("/api/chat")
    ? { ok: false, status: 503, json: async () => ({ error: "Unavailable" }) }
    : { ok: true, status: 200, text: async () => html };
  const fallback = await runPipeline({ mode: "learn", query: "Backpropagation fallback", action: "search" }, { mockMode: false }, { cache: new Cache(local), correlationId: "fallback" });
  assert.equal(fallback.ok, false);
  assert.match(fallback.userMessage, /explicitly choose original YouTube results/);
});
