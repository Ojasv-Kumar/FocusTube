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
function hash(value) {
  let h = 2166136261;
  for (const char of value) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
function htmlForQuery(query) {
  const q = String(query || "topic");
  const tag = hash(q);
  const descriptors = ["hands-on build", "measured experiment", "visual explanation", "historical case", "mathematical derivation", "field research", "design analysis", "failure investigation", "stepwise tutorial", "expert interview"];
  const items = Array.from({ length: 10 }, (_, i) => {
    const id = `v${tag}-${i}`;
    const title = `${q} ${descriptors[i]} angle ${i} ${tag}`;
    return { videoRenderer: {
      videoId: id,
      title: { simpleText: title },
      lengthText: { simpleText: "12:34" },
      ownerText: { runs: [{ text: `Channel ${tag}-${i}` }] },
      viewCountText: { simpleText: `${1000 + i} views` },
      navigationEndpoint: { commandMetadata: { webCommandMetadata: { url: `/watch?v=${id}` } } }
    } };
  });
  return `ytInitialData = ${JSON.stringify({ items })};`;
}
function parseCandidates(user) {
  const marker = "Candidates: ";
  const index = user.lastIndexOf(marker);
  assert.notEqual(index, -1, "ranking prompt should include candidate metadata");
  return JSON.parse(user.slice(index + marker.length));
}

test("Interest and Curiosity produce fast AI-ranked 12-video batches and unique next pages", async () => {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  const storage = new MemoryStorage();
  const upstreamCalls = { youtube: 0, ollama: 0 };
  const callOrder = [];
  const timeoutSplitLengths = [];
  globalThis.chrome = {
    runtime: { getURL: path => `chrome-extension://test/${path}` },
    storage: { local: storage },
    permissions: { contains: async () => true }
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/api/chat")) {
      upstreamCalls.ollama += 1;
      const req = JSON.parse(init.body || "{}");
      const user = req.messages?.at(-1)?.content || "";
      const system = req.messages?.find(m => m.role === "system")?.content || "";
      const isInterestPlan = system.includes("YouTube discovery planner");
      const isCuriosityPlan = system.includes("surprising, high-substance YouTube search queries");
      const isLearnExpansion = system.includes("planning focused learning searches");
      callOrder.push(isInterestPlan ? "interest-expansion" : isCuriosityPlan ? "curiosity-expansion" : isLearnExpansion ? "learn-expansion" : "ranking");
      if (isInterestPlan) {
        const queries = ["neural network intuition", "attention architecture walkthrough", "training experiments pytorch", "deep learning history", "interpreting trained networks"];
        return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ queries }) }, done: true }) };
      }
      if (isCuriosityPlan) {
        const areaMatch = user.match(/Areas: (\[[^\n]*?\])/);
        assert.ok(areaMatch, "curiosity prompt should list indexed areas as JSON");
        const areas = JSON.parse(areaMatch[1]);
        const curiosityQueries = ["why physics experiments reveal hidden forces", "ancient engineering mechanisms still function", "mathematical paradoxes have visual proofs", "animals navigate using magnetic fields", "architecture passively regulates temperature", "psychology perception experiments surprise researchers", "economic incentives produce counterintuitive outcomes", "cinema visual effects rely on physics"];
        return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ items: areas.map((row, index) => ({ i: row.i, q: curiosityQueries[index % curiosityQueries.length] })) }) }, done: true }) };
      }
      if (isLearnExpansion) {
        return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ queries: ["neural network intuition and overview", "neural network step by step derivation", "neural network code worked example"] }) }, done: true }) };
      }
      const candidates = parseCandidates(user);
      // Simulate a slow large response. The feed should split immediately on timeout,
      // not waste another full timeout retrying the identical batch.
      if (user.toLowerCase().includes("simulate timeout split") && candidates.length > 5) {
        timeoutSplitLengths.push(candidates.length);
        await new Promise(resolve => setTimeout(resolve, 80));
      } else if (user.toLowerCase().includes("simulate timeout split")) {
        timeoutSplitLengths.push(candidates.length);
      }
      // Simulate a provider token/size cap and prove FocusTube splits the batch.
      if (user.toLowerCase().includes("simulate 413 split") && candidates.length > 5) {
        return { ok: false, status: 413, json: async () => ({ error: { message: "Request too large for test" } }) };
      }
      const partialResponse = user.toLocaleLowerCase().includes("partial ranking demo");
      const rowsToScore = partialResponse ? candidates.slice(0, 5) : candidates;
      const videos = system.includes("general curious viewer")
        ? rowsToScore.map(v => ({ i: v.i, q: 0.82, clickbait: 0.08 }))
        : rowsToScore.map((v, index) => ({ i: v.i, fit: 0.7 + (index % 3) * 0.1, q: 0.85, role: ["core", "tutorial", "project"][index % 3] }));
      return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ videos }) }, done: true }) };
    }
    if (url.startsWith("https://www.youtube.com/results")) {
      upstreamCalls.youtube += 1;
      callOrder.push("youtube-search");
      return { ok: true, status: 200, text: async () => htmlForQuery(new URL(url).searchParams.get("search_query")) };
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const [{ runPipeline }, { Cache }, { CONFIG }] = await Promise.all([
      import("../src/background/pipeline.js"), import("../src/background/cache.js"), import("../src/config.js")
    ]);
    for (const mode of ["interest", "curiosity"]) {
      const settings = {
        ollamaEndpoint: "https://192.168.1.42:11435", ollamaToken: "a".repeat(64), ollamaModel: "qwen3:8b",
        youtubeApiKey: "", retrievalProvider: "html", mockMode: false, resultsPerSearch: 50,
        curiosityStrictness: "balanced", interestText: "neural networks"
      };
      const cache = new Cache(storage);
      const progress = [];
      const beforeCallOrder = callOrder.length;
      const first = await runPipeline({ mode, action: "home", interest: "neural networks", page: 0 }, settings, { cache, correlationId: `feed-${mode}-0`, onProgress: item => progress.push(item) });
      assert.equal(first.ok, true, `${mode} first page should succeed: ${first.userMessage || ""}`);
      assert.equal(first.videos.length, 12, `${mode} should fill the fast first batch`);
      assert.equal(first.metadata.degraded, false, `${mode} should be genuinely AI-ranked in this test`);
      assert.ok(first.metadata.llmProviders.includes("ollama"));
      const newEvents = callOrder.slice(beforeCallOrder);
      assert.equal(newEvents.filter(event => event === "ranking").length, 2, `${mode} should rank the 12-candidate first batch as two compact six-video requests`);
      assert.ok(newEvents[0]?.endsWith("expansion"), `${mode} must call Ollama query expansion before YouTube retrieval; calls=${newEvents.slice(0, 5).join(",")}`);
      assert.ok(newEvents.indexOf("youtube-search") > 0, `${mode} should retrieve expanded YouTube queries after expansion`);
      assert.ok(newEvents.lastIndexOf("ranking") > newEvents.indexOf("youtube-search"), `${mode} should rank candidates after retrieval`);
      assert.ok(progress.some(item => item.stage === "expanding"));
      assert.ok(progress.some(item => item.stage === "retrieval"));
      assert.ok(progress.some(item => item.stage === "ranking"));
      assert.ok(progress.some(item => item.stage === "complete"));
      const ids = first.videos.map(v => v.id);
      assert.equal(new Set(ids).size, 12, `${mode} page 1 must not contain duplicate IDs`);

      if (mode === "interest") {
        const beforeReuse = upstreamCalls.ollama;
        const reused = await runPipeline({ mode, action: "home", interest: "neural networks", page: 0, excludeIds: ["not-a-real-youtube-id"] }, settings, { cache, correlationId: "score-cache-reuse" });
        assert.equal(reused.ok, true);
        assert.equal(reused.videos.length, 12);
        assert.equal(reused.metadata.cacheHit, true, "per-video Ollama scores should be reused for a repeated feed target");
        assert.ok(reused.videos.every(video => video.aiRanked === true));
        assert.equal(upstreamCalls.ollama, beforeReuse, "cached scores should avoid another model request");
      }

      const second = await runPipeline({ mode, action: "home", interest: "neural networks", page: 1, excludeIds: ids }, settings, { cache, correlationId: `feed-${mode}-1` });
      assert.equal(second.ok, true, `${mode} second page should succeed: ${second.userMessage || ""}`);
      assert.equal(second.videos.length, 12, `${mode} should return another fast batch`);
      assert.equal(new Set(second.videos.map(v => v.id)).size, 12, `${mode} page 2 must not contain duplicate IDs`);
      assert.equal(second.videos.some(v => ids.includes(v.id)), false, `${mode} page 2 must exclude IDs already shown`);
    }
    // A model can occasionally omit rows even when the JSON is parseable. The ranker
    // should retry the missing IDs and split as necessary before using metadata fallback.
    const partial = await runPipeline({ mode: "interest", action: "home", interest: "partial ranking demo", page: 0 }, {
      ollamaEndpoint: "https://192.168.1.42:11435", ollamaToken: "a".repeat(64), ollamaModel: "qwen3:8b",
      youtubeApiKey: "", retrievalProvider: "html", mockMode: false, resultsPerSearch: 50,
      curiosityStrictness: "balanced", interestText: "partial ranking demo"
    }, { cache: new Cache(storage), correlationId: "partial-ranking-fill" });
    assert.equal(partial.ok, true);
    assert.equal(partial.videos.length, 12);
    assert.equal(partial.metadata.degraded, false, "all IDs should be recovered by targeted retries and split batches");
    assert.ok(partial.videos.every(video => video.aiRanked === true), "the recovered rows must remain AI-ranked, not metadata fallback");

    // An explicit HTTP 413 on six-video judge requests should recursively split them into
    // smaller batches and still produce an AI-ranked feed instead of a full fallback.
    const splitSettings = {
      ollamaEndpoint: "https://192.168.1.42:11435", ollamaToken: "a".repeat(64), ollamaModel: "qwen3:8b",
      youtubeApiKey: "", retrievalProvider: "html", mockMode: false, resultsPerSearch: 50,
      curiosityStrictness: "balanced", interestText: "simulate 413 split"
    };
    const beforeSplitCalls = upstreamCalls.ollama;
    const split = await runPipeline({ mode: "interest", action: "home", interest: "simulate 413 split", page: 0 }, splitSettings, {
      cache: new Cache(storage), correlationId: "ollama-413-split"
    });
    assert.equal(split.ok, true, `feed should survive HTTP 413: ${split.userMessage || ""}`);
    assert.equal(split.videos.length, 12);
    assert.equal(split.metadata.degraded, false, "smaller batches should still be AI-ranked after a 413");
    assert.ok(upstreamCalls.ollama > beforeSplitCalls + 5, "413 should cause recursive smaller-batch requests");

    // Timeout regression: no identical six-video judge batch should be retried after it times out.
    const originalTimeout = CONFIG.LLM.timeoutMs;
    CONFIG.LLM.timeoutMs = 15;
    try {
      const timeoutResult = await runPipeline({ mode: "interest", action: "home", interest: "simulate timeout split", page: 0 }, {
        ...splitSettings, interestText: "simulate timeout split"
      }, { cache: new Cache(storage), correlationId: "ollama-timeout-split" });
      assert.equal(timeoutResult.ok, true, `feed should recover by splitting timeout-prone batches: ${timeoutResult.userMessage || ""}`);
      assert.equal(timeoutResult.metadata.degraded, false, "smaller batches should recover after a timed-out large request");
      assert.equal(timeoutResult.videos.length, 12);
      assert.equal(timeoutSplitLengths.filter(size => size === 6).length, 2, "each initial six-video batch should be attempted only once before splitting");
      assert.ok(timeoutSplitLengths.some(size => size < 6 && size > 1));
    } finally { CONFIG.LLM.timeoutMs = originalTimeout; }

    assert.ok(upstreamCalls.youtube >= 12, "multiple topic searches should actually be performed");
    assert.ok(upstreamCalls.ollama >= 5, "each feed page should actually call Ollama for expansion and ranking");
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome; else globalThis.chrome = previousChrome;
    if (previousFetch === undefined) delete globalThis.fetch; else globalThis.fetch = previousFetch;
  }
});
