import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key = null) {
    if (key === null) return Object.fromEntries(this.values);
    return typeof key === "string" && this.values.has(key) ? { [key]: this.values.get(key) } : {};
  }
  async set(values) { for (const [key, value] of Object.entries(values)) this.values.set(key, value); }
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) this.values.delete(key); }
}

function searchHtml(id = "robotics-video") {
  const renderer = { videoRenderer: {
    videoId: id,
    title: { simpleText: "Robotics explained with a practical demonstration" },
    lengthText: { simpleText: "12:34" },
    ownerText: { runs: [{ text: "Engineering Channel" }] },
    navigationEndpoint: { commandMetadata: { webCommandMetadata: { url: `/watch?v=${id}` } } }
  } };
  return `ytInitialData = ${JSON.stringify({ items: [renderer] })};`;
}

test("API-only preference falls back to YouTube HTML after API failure", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.chrome = { storage: { local: new MemoryStorage() } };
  globalThis.fetch = async url => String(url).endsWith("/v1/youtube/api")
    ? { ok: true, status: 200, json: async () => ({ ok: true, status: 403, data: { error: { code: 403, errors: [{ reason: "keyInvalid" }] } } }) }
    : { ok: true, status: 200, json: async () => ({ ok: true, status: 200, html: searchHtml() }) };
  try {
    const { retrieveQueries } = await import("../src/background/retrieval/index.js");
    const result = await retrieveQueries(["robotics"], { retrievalProvider: "api", youtubeApiKey: "invalid-test-key" });
    assert.deepEqual(result.providers, ["html"]);
    assert.equal(result.videos[0]?.id, "robotics-video");
    assert.equal(result.error, null);
  } finally { globalThis.fetch = previousFetch; }
});

test("retrieval reports the exact failing source instead of blaming the AI backend", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.chrome = { storage: { local: new MemoryStorage() } };
  globalThis.fetch = async url => {
    if (String(url).endsWith("/v1/youtube/api")) {
      return { ok: true, status: 200, json: async () => ({ ok: true, status: 403, data: { error: { code: 403, errors: [{ reason: "keyInvalid" }] } } }) };
    }
    throw new TypeError("Network request blocked");
  };
  try {
    const [{ retrieveQueries }, { friendlyError }] = await Promise.all([
      import("../src/background/retrieval/index.js"), import("../src/errors.js")
    ]);
    const result = await retrieveQueries(["robotics"], { retrievalProvider: "api", youtubeApiKey: "invalid-test-key" });
    assert.equal(result.error?.code, "YOUTUBE_PROXY_UNAVAILABLE");
    assert.deepEqual(result.error?.providerFailures, [
      { provider: "api", code: "CONFIG_ERROR" },
      { provider: "html", code: "YOUTUBE_PROXY_UNAVAILABLE" }
    ]);
    const mapped = friendlyError(result.error);
    assert.match(mapped.userMessage, /local YouTube retrieval proxy/i);
    assert.match(mapped.userMessage, /api: CONFIG_ERROR; html: YOUTUBE_PROXY_UNAVAILABLE/);
    assert.doesNotMatch(mapped.userMessage, /local AI backend/);
  } finally { globalThis.fetch = previousFetch; }
});

for (const mode of ["interest", "curiosity"]) {
  test(`${mode} keeps retrieved videos when AI ranking is unavailable`, async () => {
    const previousFetch = globalThis.fetch;
    const storage = new MemoryStorage();
    globalThis.chrome = {
      runtime: { getURL: path => `chrome-extension://test/${path}` },
      storage: { local: storage }
    };
    globalThis.fetch = async url => {
      if (String(url).includes("curiosity-seed-channels.json")) {
        return { ok: true, status: 200, json: async () => [{ name: "PBS Space Time" }] };
      }
      if (String(url).includes("/v1/generate")) throw new TypeError("backend intentionally unavailable in this test");
      return { ok: true, status: 200, json: async () => ({ ok: true, status: 200, html: searchHtml() }) };
    };
    try {
      const [{ runPipeline }, { Cache }] = await Promise.all([
        import("../src/background/pipeline.js"), import("../src/background/cache.js")
      ]);
      const result = await runPipeline(
        { mode, query: "", interest: "robotics", action: "home" },
        { retrievalProvider: "html", mockMode: false, resultsPerSearch: 8, curiosityStrictness: "balanced" },
        { cache: new Cache(storage), correlationId: `fallback-${mode}` }
      );
      assert.equal(result.ok, true);
      assert.equal(result.videos[0]?.id, "robotics-video");
      assert.equal(result.metadata.degraded, true);
      assert.match(result.metadata.fallbackLabel, /unranked YouTube search matches/);
      assert.match(result.videos[0].reason, /not AI-ranked/);
    } finally { globalThis.fetch = previousFetch; }
  });
}

test("picker host rules preserve the fixed overlay layout", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../src/content/hide.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /focustube-picker-host[^}]*all:\s*initial/s);
  assert.match(css, /focustube-picker-host\s*\{[^}]*position:\s*fixed\s*!important/s);
});
