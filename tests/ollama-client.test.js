import test from "node:test";
import assert from "node:assert/strict";
import { LlmClient, normalizeOllamaEndpoint } from "../src/background/llm-client.js";

const endpoint = "https://192.168.1.42:11435";
const token = "a".repeat(64);
const settings = { ollamaEndpoint: endpoint, ollamaToken: token, ollamaModel: "qwen3:8b" };
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("Ollama endpoint validation accepts only HTTPS private-LAN IPv4 bridge URLs", () => {
  assert.equal(normalizeOllamaEndpoint(endpoint), endpoint);
  assert.equal(normalizeOllamaEndpoint("https://10.0.0.4:11435/"), "https://10.0.0.4:11435");
  for (const url of ["http://192.168.1.42:11435", "https://8.8.8.8:11435", "https://localhost:11435", "https://192.168.1.42:11434", "https://192.168.1.42:11435/api/chat", "https://user:pass@192.168.1.42:11435"]) {
    assert.equal(normalizeOllamaEndpoint(url), "", `should reject ${url}`);
  }
});

test("connection test checks installed model then sends an authenticated Ollama chat request", async () => {
  const calls = [];
  const client = new LlmClient(settings, { fetchImpl: async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/api/tags")) return response(200, { models: [{ name: "qwen3:8b", model: "qwen3:8b" }] });
    return response(200, { message: { content: '{"ready":true}' }, done: true });
  }});
  const result = await client.testConnection();
  assert.deepEqual(result, { ok: true, provider: "ollama", model: "qwen3:8b", endpoint, jsonOutput: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `${endpoint}/api/tags`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.authorization, `Bearer ${token}`);
  assert.equal(calls[1].url, `${endpoint}/api/chat`);
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[1].init.headers.authorization, `Bearer ${token}`);
  const body = JSON.parse(calls[1].init.body);
  assert.equal(body.model, "qwen3:8b");
  assert.equal(body.stream, false);
  assert.equal(body.think, false);
  assert.equal(body.options.num_predict, 64);
  assert.equal(typeof body.format, "object");
  assert.deepEqual(body.format.required, ["ready"]);
  assert.match(body.messages.at(-1).content, /ready/);
});

test("connection test explains when the chosen Ollama model is not installed", async () => {
  const client = new LlmClient(settings, { fetchImpl: async () => response(200, { models: [{ name: "llama3.2:3b" }] }) });
  await assert.rejects(client.testConnection(), error => error.code === "OLLAMA_MODEL_NOT_INSTALLED" && /ollama pull qwen3:8b/.test(error.message));
});

test("ranker requests valid JSON and parses the Ollama message content", async () => {
  let seen;
  const client = new LlmClient(settings, { fetchImpl: async (url, init) => {
    seen = { url: String(url), init };
    return response(200, { message: { content: '{"videos":[]}' }, done: true });
  }});
  const schema = { type: "object", properties: { videos: { type: "array", items: { type: "object" } } }, required: ["videos"] };
  const result = await client.completeJson({ system: "rank", user: "rank these", schema, callType: "judge", maxTokens: 200, temperature: 0.1 });
  assert.deepEqual(result, { videos: [] });
  const body = JSON.parse(seen.init.body);
  assert.equal(seen.url, `${endpoint}/api/chat`);
  assert.deepEqual(body.format, schema);
  assert.equal(body.options.num_predict, 200);
});

test("bad credentials and malformed endpoints fail before network access", async () => {
  let calls = 0;
  const client = new LlmClient({ ollamaEndpoint: "http://192.168.1.42:11435", ollamaToken: "short", ollamaModel: "qwen3:8b" }, { fetchImpl: async () => { calls += 1; return response(200, {}); } });
  await assert.rejects(client.testConnection(), error => error.code === "INVALID_OLLAMA_ENDPOINT");
  assert.equal(calls, 0);
});


test("connection test fails clearly when model replies without valid JSON output", async () => {
  const client = new LlmClient(settings, { fetchImpl: async url => String(url).endsWith("/api/tags")
    ? response(200, { models: [{ name: "qwen3:8b" }] })
    : response(200, { message: { content: "I am ready" }, done: true }) });
  await assert.rejects(client.testConnection(), error => error.code === "OLLAMA_JSON_OUTPUT_FAILED" && /JSON output/.test(error.message));
});
