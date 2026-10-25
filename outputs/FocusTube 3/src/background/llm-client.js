import { CONFIG } from "../config.js";
import { ConfigError, LlmError, NetworkError, TimeoutError } from "../errors.js";
import { extractJson } from "./validators.js";
import { logger } from "../logger.js";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const responseText = data => typeof data?.message?.content === "string" ? data.message.content.trim() : "";

function privateIpv4(value) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(value || "").trim());
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some(octet => octet < 0 || octet > 255)) return false;
  const [a, b] = octets;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
function normalizeEndpoint(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" || !privateIpv4(url.hostname) || url.port !== "11435" || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) return "";
    return url.origin;
  } catch { return ""; }
}

/** Talks only to the user's authenticated HTTPS bridge on their private LAN. */
export class LlmClient {
  constructor(settings = {}, { fetchImpl = (...args) => globalThis.fetch(...args), sleepImpl = pause } = {}) {
    this.settings = settings;
    this.fetch = fetchImpl;
    this.sleep = sleepImpl;
    this.endpoint = normalizeEndpoint(settings.ollamaEndpoint);
    this.model = String(settings.ollamaModel || CONFIG.LLM.defaultModel).trim();
    this.tokenEstimate = 0;
    this.providers = [];
    this.usedFallback = false;
  }

  requireConfig() {
    if (!this.endpoint) {
      const error = new ConfigError("Set the HTTPS URL of your friend's private-LAN Ollama bridge, for example https://192.168.1.42:11435.");
      error.code = "INVALID_OLLAMA_ENDPOINT";
      throw error;
    }
    if (typeof this.settings.ollamaToken !== "string" || this.settings.ollamaToken.trim().length < 32) {
      const error = new ConfigError("Enter the 64-character bridge token generated on your friend's Mac in FocusTube Options.");
      error.code = "MISSING_OLLAMA_TOKEN";
      throw error;
    }
    if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(this.model)) {
      const error = new ConfigError("Model names may contain only letters, digits, dot, underscore, colon, and hyphen.");
      error.code = "INVALID_OLLAMA_MODEL";
      throw error;
    }
  }

  async request(path, { method = "GET", body, timeoutMs = CONFIG.LLM.timeoutMs, correlationId = "" } = {}) {
    this.requireConfig();
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new TimeoutError(`Ollama took longer than ${Math.round(timeoutMs / 1000)} seconds to respond. Make sure the model is loaded on your friend's Mac.`));
      }, timeoutMs);
    });
    const execute = (async () => {
      let response;
      try {
        logger.debug("ollama", `Ollama request ${correlationId}; ${method} ${path}; model=${this.model}`);
        response = await this.fetch(`${this.endpoint}${path}`, {
          method,
          headers: { authorization: `Bearer ${this.settings.ollamaToken.trim()}`, ...(body ? { "content-type": "application/json" } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal
        });
      } catch (cause) {
        if (cause?.name === "AbortError") throw new TimeoutError(`Ollama took longer than ${Math.round(timeoutMs / 1000)} seconds to respond. Make sure the model is loaded on your friend's Mac.`);
        const detail = String(cause?.message || cause?.name || "unknown browser network error").replace(/[\r\n\t]+/g, " ").slice(0, 180);
        throw new NetworkError(`Could not reach the private Ollama bridge (${cause?.name || "network error"}): ${detail}. Check Wi-Fi, the HTTPS certificate trust, the bridge process, and its firewall rule.`, { cause });
      }
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = String(data?.error || data?.message || `HTTP ${response.status}`).replace(/[\r\n\t]+/g, " ").slice(0, 500);
        const error = response.status === 401 || response.status === 403
          ? new ConfigError(`The Ollama bridge rejected FocusTube authentication or extension origin (HTTP ${response.status}). Check the bridge token and configured extension ID.`)
          : response.status === 404 && path === "/api/chat"
            ? new ConfigError(`Ollama does not have model "${this.model}". Run: ollama pull ${this.model}`)
            : new LlmError(`Ollama bridge request failed (HTTP ${response.status}): ${detail}`);
        error.status = response.status;
        throw error;
      }
      return data;
    })();
    try { return await Promise.race([execute, deadline]); }
    finally { clearTimeout(timer); }
  }

  async generate({ model = this.model, system = "", user = "", maxTokens, temperature, expectJson = true, schema, callType = "judge", signal, correlationId = "", timeoutMs = CONFIG.LLM.timeoutMs }) {
    // `signal` is retained for caller compatibility; request owns the deadline signal so
    // individual batch calls always settle even if a caller abandons the feed.
    void signal;
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: user });
    const profile = CONFIG.LLM.callProfiles[callType] || CONFIG.LLM.callProfiles.judge;
    const data = await this.request("/api/chat", {
      method: "POST", correlationId,
      timeoutMs,
      body: {
        model,
        messages,
        stream: false,
        keep_alive: CONFIG.LLM.keepAlive,
        ...(expectJson ? { format: schema || "json" } : {}),
        think: false,
        options: {
          temperature: temperature ?? profile.temperature,
          top_p: CONFIG.LLM.topP,
          seed: CONFIG.LLM.seed,
          num_ctx: CONFIG.LLM.numCtx,
          num_predict: maxTokens ?? profile.numPredict
        }
      }
    });
    const text = responseText(data);
    if (!text) {
      const finishReason = data?.done_reason ? ` Finish reason: ${String(data.done_reason).slice(0, 40)}.` : "";
      const evalCount = Number.isFinite(data?.eval_count) ? ` Generated tokens: ${data.eval_count}.` : "";
      const error = new LlmError(`Ollama model "${model}" returned no visible message content.${finishReason}${evalCount} Confirm the model completed a non-thinking chat response and check the bridge log for latency.`);
      error.code = "NO_VISIBLE_CONTENT";
      error.finishReason = data?.done_reason || "unknown";
      error.evalCount = data?.eval_count;
      throw error;
    }
    // Ollama can return HTTP 200 with a truncated visible response when num_predict
    // is exhausted. Treat this differently from invalid credentials/network errors:
    // the ranker can split the candidate batch and retry with a smaller schema.
    if (String(data?.done_reason || "").toLocaleLowerCase() === "length") {
      const error = new LlmError(`Ollama truncated its ${callType} response at the output-token limit (${data?.eval_count ?? "unknown"} generated tokens). The task will retry with a smaller batch.`);
      error.code = "OUTPUT_TRUNCATED";
      error.finishReason = data.done_reason;
      throw error;
    }
    return text;
  }

  async rawCall(options = {}) {
    this.tokenEstimate += Math.ceil((String(options.system || "").length + String(options.user || "").length) / 4);
    const text = await this.generate({ ...options, callType: options.callType || options.task || "judge" });
    this.tokenEstimate += Math.ceil(text.length / 4);
    if (!this.providers.includes("ollama")) this.providers.push("ollama");
    return text;
  }

  async completeJson(options = {}) {
    const raw = await this.rawCall(options);
    try { return extractJson(raw); }
    catch (error) {
      if ((error?.code !== "PARSE_ERROR" && error?.name !== "ParseError") || options.repairMalformed === false) throw error;
      const repaired = await this.rawCall({
        ...options,
        system: "Return only one valid JSON object matching the task. Do not add markdown or explanations.",
        user: `Repair this output as valid JSON. Preserve only valid data.\n<output>${raw.slice(0, CONFIG.LLM.repairOutputMaxChars)}</output>\nTask/schema instructions: ${String(options.user || "").slice(0, CONFIG.LLM.repairSchemaMaxChars)}`,
        maxTokens: CONFIG.LLM.callProfiles.repair.numPredict, temperature: 0, callType: "repair", schema: options.schema, expectJson: true, repairMalformed: false
      });
      return extractJson(repaired);
    }
  }

  async health() {
    return { ok: Boolean(this.endpoint && String(this.settings.ollamaToken || "").length >= 32), provider: "ollama", endpoint: this.endpoint || "invalid", model: this.model };
  }

  async testConnection() {
    this.requireConfig();
    const timeoutMs = CONFIG.LLM.connectionTestTimeoutMs;
    const tags = await this.request("/api/tags", { timeoutMs, correlationId: "connection-test" });
    const models = Array.isArray(tags?.models) ? tags.models : [];
    const installed = models.some(entry => String(entry?.name || "") === this.model || String(entry?.model || "") === this.model);
    if (!installed) {
      const error = new ConfigError(`The bridge is reachable, but model "${this.model}" is not installed. On your friend's Mac run: ollama pull ${this.model}`);
      error.code = "OLLAMA_MODEL_NOT_INSTALLED";
      throw error;
    }
    let smoke;
    try {
      smoke = await this.completeJson({
        system: 'Return only valid JSON with one property: "ready" set to true. Do not include any other properties or text.',
        user: 'Return the JSON object {"ready":true}.',
        maxTokens: CONFIG.LLM.callProfiles.test.numPredict, temperature: 0, callType: "test", expectJson: true,
        schema: { type: "object", additionalProperties: false, required: ["ready"], properties: { ready: { type: "boolean" } } },
        correlationId: "connection-test", timeoutMs, repairMalformed: false
      });
    } catch (cause) {
      if (cause?.code === "PARSE_ERROR" || cause?.name === "ParseError") {
        const error = new LlmError("Ollama responded, but FocusTube could not parse its JSON output. Curiosity ranking needs valid JSON from the local model.", { cause });
        error.code = "OLLAMA_JSON_OUTPUT_FAILED";
        throw error;
      }
      throw cause;
    }
    if (smoke?.ready !== true) {
      const error = new LlmError("Ollama answered, but did not pass FocusTube's JSON-output check. The model must return a parseable JSON object for query expansion and video ranking.");
      error.code = "OLLAMA_JSON_OUTPUT_FAILED";
      throw error;
    }
    return { ok: true, provider: "ollama", model: this.model, endpoint: this.endpoint, jsonOutput: true };
  }
}

export { normalizeEndpoint as normalizeOllamaEndpoint };
