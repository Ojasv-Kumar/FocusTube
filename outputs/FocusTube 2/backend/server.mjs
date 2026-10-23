import http from "node:http";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const defaults = { PORT: "41731", OLLAMA_URL: "http://127.0.0.1:11434", OLLAMA_MODEL: "qwen3:4b", OLLAMA_TIMEOUT_MS: "5000", GEMINI_TIMEOUT_MS: "20000", CACHE_TTL_SECONDS: "300", MAX_REQUESTS_PER_MINUTE: "30" };
export function loadConfig(path = resolve(dirname(fileURLToPath(import.meta.url)), ".env"), env = process.env) {
  const config = { ...defaults };
  for (const [key, value] of Object.entries(env)) if (value != null) config[key] = String(value);
  if (existsSync(path)) for (const line of readFileSync(path, "utf8").split(/\r?\n/)) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (m && env[m[1]] == null) config[m[1]] = m[2].replace(/^['"]|['"]$/g, ""); }
  config.GEMINI_API_KEYS = String(config.GEMINI_API_KEYS || "").split(",").map(s => s.trim()).filter(Boolean);
  config.GEMINI_FALLBACK_MODELS = String(config.GEMINI_FALLBACK_MODELS || "").split(",").map(s => s.trim()).filter(Boolean);
  config.PORT = Number(config.PORT);
  config.GEMINI_FAST_MODEL = String(config.GEMINI_FAST_MODEL || "").trim();
  config.GEMINI_SMART_MODEL = String(config.GEMINI_SMART_MODEL || "").trim();
  return config;
}
export function validateConfig(c) {
  const errors = [];
  if (!c.GEMINI_FAST_MODEL) errors.push("Set GEMINI_FAST_MODEL in backend/.env using a model name from Google AI Studio.");
  if (!c.GEMINI_SMART_MODEL) errors.push("Set GEMINI_SMART_MODEL in backend/.env using a model name from Google AI Studio.");
  if (!Number.isInteger(c.PORT) || c.PORT < 1 || c.PORT > 65535) errors.push("PORT must be an integer from 1 to 65535.");
  if (!c.OLLAMA_MODEL) errors.push("Set OLLAMA_MODEL in backend/.env.");
  if (errors.length) throw new Error(errors.join("\n"));
}
export function extractJson(input) {
  const text = String(input || "").replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = text.indexOf("{"); const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("INVALID_JSON");
  return JSON.parse(text.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1"));
}
const safeStatus = e => e?.name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR";
const reply = (res, status, value) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(value)); };
async function readBody(req, limit = 64_000) { let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > limit) throw new Error("BODY_TOO_LARGE"); } try { return JSON.parse(raw || "{}"); } catch { throw new Error("INVALID_JSON"); } }
async function requestJson(fetchImpl, url, options = {}, timeout = 15_000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
  try { const response = await fetchImpl(url, { ...options, signal: controller.signal }); return { status: response.status, headers: response.headers, data: await response.json().catch(() => ({})) }; }
  finally { clearTimeout(timer); }
}
const getText = payload => payload?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("") || "";
function nextPacificMidnight(timestamp) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(fmt.formatToParts(timestamp).filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
  const nextDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const candidate = Date.UTC(nextDate.getUTCFullYear(), nextDate.getUTCMonth(), nextDate.getUTCDate(), 8);
  const local = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit" }).formatToParts(candidate).filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
  const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const offset = localAsUtc - candidate;
  return Date.UTC(nextDate.getUTCFullYear(), nextDate.getUTCMonth(), nextDate.getUTCDate()) - offset;
}

export function createBackendServer({ config, fetchImpl = fetch, logger = console, now = Date.now } = {}) {
  validateConfig(config);
  const states = config.GEMINI_API_KEYS.map(() => ({ disabled: false, cooldownUntil: 0 }));
  const cache = new Map(), rates = new Map();
  const ollamaRoot = config.OLLAMA_URL.replace(/\/+$/, "");
  const geminiBase = config.GEMINI_URL || "https://generativelanguage.googleapis.com/v1beta/models";
  const timeout = (value, fallback) => Math.max(100, Number(value) || fallback);
  function log(message) { try { logger.info(`[FocusTube backend] ${message}`); } catch { /* Logging must never affect requests. */ } }
  function cors(req, res) {
    const origin = req.headers.origin || "";
    if (origin.startsWith("chrome-extension://")) { res.setHeader("access-control-allow-origin", origin); res.setHeader("vary", "Origin"); }
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS"); res.setHeader("access-control-allow-headers", "content-type");
  }
  async function gemini(body, model) {
    let lastError = config.GEMINI_API_KEYS.length ? "KEYS_EXHAUSTED" : "NO_KEYS";
    for (let i = 0; i < config.GEMINI_API_KEYS.length; i++) {
      const state = states[i]; if (state.disabled || state.cooldownUntil > now()) continue;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await requestJson(fetchImpl, `${geminiBase}/${encodeURIComponent(model)}:generateContent`, {
            method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": config.GEMINI_API_KEYS[i] },
            body: JSON.stringify({ contents: [{ parts: [{ text: `${body.system}\n\n${body.user}` }] }], generationConfig: { maxOutputTokens: body.maxOutputTokens || 1200, temperature: body.temperature ?? 0.1, ...(body.expectJson === false ? {} : { responseMimeType: "application/json" }) } })
          }, timeout(config.GEMINI_TIMEOUT_MS, 20_000));
          if (response.status === 401 || response.status === 403) { state.disabled = true; lastError = "KEY_DISABLED"; log(`Gemini key index ${i + 1} disabled after HTTP ${response.status}`); break; }
          if (response.status === 429 || response.data?.error?.status === "RESOURCE_EXHAUSTED") {
            const rawRetry = response.headers.get("retry-after") || "";
            const retryHeader = Number(rawRetry);
            const daily = /daily|per.day/i.test(JSON.stringify(response.data?.error || {}));
            const retryDate = Date.parse(rawRetry);
            const retryMs = retryHeader > 0 ? retryHeader * 1000 : Number.isFinite(retryDate) ? Math.max(1000, retryDate - now()) : daily ? nextPacificMidnight(now()) - now() : 60_000;
            state.cooldownUntil = now() + retryMs; lastError = "KEY_COOLDOWN"; log(`Gemini key index ${i + 1} cooling down`); break;
          }
          if (response.status >= 500) { lastError = "UPSTREAM_ERROR"; if (!attempt) continue; break; }
          if (response.status >= 400) { lastError = "UPSTREAM_ERROR"; break; }
          const text = getText(response.data); if (!text) { lastError = "EMPTY_RESPONSE"; break; }
          return { text, provider: "gemini", model, usedFallback: false };
        } catch (error) { lastError = safeStatus(error); if (!attempt) await new Promise(resolve => setTimeout(resolve, 150)); }
      }
    }
    return { errorCode: lastError };
  }
  async function expand(body) {
    try {
      const response = await requestJson(fetchImpl, `${ollamaRoot}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: config.OLLAMA_MODEL, stream: false, format: "json", think: false, messages: [{ role: "system", content: body.system }, { role: "user", content: body.user }], options: { temperature: body.temperature ?? 0.2, num_predict: body.maxOutputTokens || 400 } }) }, timeout(config.OLLAMA_TIMEOUT_MS, 5_000));
      const text = response.data?.message?.content;
      if (response.status < 400 && text) { extractJson(text); return { text, provider: "ollama", model: config.OLLAMA_MODEL, usedFallback: false }; }
    } catch { /* Fast Gemini and deterministic fallback are intentional. */ }
    const fast = await geminiRoute(body, config.GEMINI_FAST_MODEL);
    if (fast.text) return { ...fast, usedFallback: true };
    const query = /Query data:\s*<query>([\s\S]*?)<\/query>/i.exec(body.user)?.[1]?.trim() || body.user.trim().slice(0, 200);
    if (query) return { json: { queries: [query, `${query} explained`, `${query} examples`] }, provider: "deterministic", model: "local", usedFallback: true };
    return { errorCode: fast.errorCode || "PROVIDERS_UNAVAILABLE" };
  }
  async function geminiRoute(body, primary) {
    const first = await gemini(body, primary);
    if (first.text) return first;
    for (const model of config.GEMINI_FALLBACK_MODELS || []) {
      if (model === primary) continue;
      const fallback = await gemini(body, model);
      if (fallback.text) return { ...fallback, usedFallback: true };
    }
    return first;
  }
  async function generate(body) {
    if (!body || !["expand", "judge", "score"].includes(body.task) || typeof body.system !== "string" || typeof body.user !== "string" || body.system.length > 12_000 || body.user.length > 48_000 || typeof body.expectJson !== "boolean") throw new Error("INVALID_REQUEST");
    if (body.maxOutputTokens !== undefined && (!Number.isInteger(body.maxOutputTokens) || body.maxOutputTokens < 1 || body.maxOutputTokens > 8192)) throw new Error("INVALID_REQUEST");
    if (body.temperature !== undefined && (!Number.isFinite(body.temperature) || body.temperature < 0 || body.temperature > 2)) throw new Error("INVALID_REQUEST");
    const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex"); const hit = cache.get(hash);
    if (hit && hit.until > now()) return { ...hit.value, cacheHit: true };
    let result = body.task === "expand" ? await expand(body) : await geminiRoute(body, config.GEMINI_SMART_MODEL);
    if (result.text && body.expectJson) {
      try { result.json = extractJson(result.text); }
      catch {
        const repaired = await geminiRoute({ ...body, system: "Repair the supplied output as valid JSON matching the original schema. Return JSON only.", user: result.text, expectJson: true }, config.GEMINI_SMART_MODEL);
        if (repaired.text) { try { repaired.json = extractJson(repaired.text); result = { ...repaired, usedFallback: true }; } catch { result = { errorCode: "INVALID_JSON" }; } }
        else result = { errorCode: repaired.errorCode || "INVALID_JSON" };
      }
    }
    if (!result.errorCode) { cache.set(hash, { value: result, until: now() + timeout(config.CACHE_TTL_SECONDS, 300) * 1000 }); if (cache.size > 500) cache.delete(cache.keys().next().value); }
    return result;
  }
  const server = http.createServer(async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") {
      let reachable = false, present = false;
      try { const result = await requestJson(fetchImpl, `${ollamaRoot}/api/tags`, {}, 1800); reachable = result.status < 400; present = (result.data.models || []).some(m => m.name === config.OLLAMA_MODEL || m.name?.startsWith(`${config.OLLAMA_MODEL}:`)); } catch { /* report unavailable */ }
      reply(res, 200, { ok: true, geminiKeys: { configured: states.length, available: states.filter(s => !s.disabled && s.cooldownUntil <= now()).length }, ollama: { reachable, model: config.OLLAMA_MODEL, present } }); return;
    }
    if (req.method === "POST" && url.pathname === "/v1/generate") {
      const ip = req.socket.remoteAddress || "local"; const minute = Math.floor(now() / 60_000); const rate = rates.get(ip);
      if (rate?.minute === minute && rate.count >= timeout(config.MAX_REQUESTS_PER_MINUTE, 30)) { reply(res, 429, { ok: false, errorCode: "RATE_LIMITED" }); return; }
      rates.set(ip, { minute, count: rate?.minute === minute ? rate.count + 1 : 1 });
      try { const input = await readBody(req); const result = await generate(input); reply(res, result.errorCode ? 503 : 200, { ok: !result.errorCode, text: result.text, json: result.json, provider: result.provider || null, model: result.model || null, usedFallback: Boolean(result.usedFallback), errorCode: result.errorCode || null, cacheHit: Boolean(result.cacheHit) }); }
      catch (error) { reply(res, error.message === "BODY_TOO_LARGE" ? 413 : 400, { ok: false, errorCode: error.message === "BODY_TOO_LARGE" ? "BODY_TOO_LARGE" : "INVALID_REQUEST" }); }
      return;
    }
    reply(res, 404, { ok: false, errorCode: "NOT_FOUND" });
  });
  return { server, keyStates: states, generate };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadConfig(); validateConfig(config);
  const { server } = createBackendServer({ config });
  server.listen(config.PORT, "127.0.0.1", () => console.log(`FocusTube backend listening at http://127.0.0.1:${config.PORT}; Gemini keys configured=${config.GEMINI_API_KEYS.length}`));
}
