import test from "node:test";
import assert from "node:assert/strict";
import { LlmClient } from "../src/background/llm-client.js";

const response = text => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });

test("Gemini client sends a direct REST request with the configured header key and model", async () => {
  let seen;
  const client = new LlmClient({ geminiApiKeys: "secret-key", geminiFastModel: "fast-model", geminiSmartModel: "smart-model" }, {
    fetchImpl: async (url, init) => { seen = { url, init }; return response('{"ok":true}'); }
  });
  const result = await client.completeJson({ task: "judge", system: "Judge", user: "Candidates", maxTokens: 20 });
  assert.deepEqual(result, { ok: true });
  assert.match(seen.url, /models\/smart-model:generateContent$/);
  assert.equal(seen.init.headers["x-goog-api-key"], "secret-key");
  assert.equal(JSON.parse(seen.init.body).generationConfig.responseMimeType, "application/json");
  assert.equal(new URL(seen.url).searchParams.has("key"), false);
  assert.equal(JSON.stringify(seen.init.headers).includes("secret-key"), true);
});

test("Gemini client accepts any number of comma/newline separated keys and rotates after 429", async () => {
  const keys = [];
  const client = new LlmClient({ geminiApiKeys: "key-a,\nkey-b; key-c", geminiFastModel: "same", geminiSmartModel: "same" }, {
    fetchImpl: async (_url, init) => {
      const key = init.headers["x-goog-api-key"]; keys.push(key);
      if (key === "key-a") return { ok: false, status: 429, json: async () => ({ error: { message: "slow down" } }) };
      return response('{"queries":["one"]}');
    }
  });
  const result = await client.completeJson({ task: "expand", system: "Expand", user: "Topic" });
  assert.deepEqual(result, { queries: ["one"] });
  assert.deepEqual(keys, ["key-a", "key-b"]);
});

test("Gemini client gives a clear error when no key is saved", async () => {
  const client = new LlmClient({ geminiApiKeys: "" });
  await assert.rejects(client.completeJson({ user: "test" }), error => error.code === "MISSING_GEMINI_KEYS" && /Gemini API keys/.test(error.message));
});

test("Gemini client stops before fetch when the browser has not granted Gemini host access", async () => {
  const previousChrome = globalThis.chrome;
  let fetched = false;
  globalThis.chrome = { permissions: { contains: async () => false } };
  try {
    const client = new LlmClient({ geminiApiKeys: "secret-key", geminiSmartModel: "smart-model" }, {
      fetchImpl: async () => { fetched = true; return response("OK"); }
    });
    await assert.rejects(client.testConnection(), error => error.code === "MISSING_GEMINI_HOST_PERMISSION" && /Test Gemini connection/.test(error.message));
    assert.equal(fetched, false);
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
});

test("Gemini client preserves the browser's underlying fetch failure in the diagnostic", async () => {
  const client = new LlmClient({ geminiApiKeys: "secret-key", geminiSmartModel: "smart-model" }, {
    fetchImpl: async () => { throw new TypeError("Failed to fetch"); }
  });
  await assert.rejects(client.testConnection(), error => error.code === "NETWORK_ERROR" && /TypeError.*Failed to fetch/.test(error.message));
});

test("Gemini client preserves request timeouts for useful diagnostics", async () => {
  const client = new LlmClient({ geminiApiKeys: "secret-key", geminiSmartModel: "smart-model" }, {
    fetchImpl: async () => { const error = new Error("aborted"); error.name = "AbortError"; throw error; }
  });
  await assert.rejects(client.completeJson({ task: "judge", user: "test" }), error => error.code === "TIMEOUT_ERROR");
});
