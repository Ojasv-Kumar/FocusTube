import { CONFIG } from "../config.js";
import { LlmError, NetworkError, TimeoutError } from "../errors.js";
import { extractJson } from "./validators.js";
import { logger } from "../logger.js";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function callBackend(fetchImpl, url, init) {
  let lastError;
  for (let attempt = 0; attempt <= CONFIG.Backend.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.Backend.requestTimeoutMs);
    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      if (response.status < 500 || attempt === CONFIG.Backend.maxRetries) return response;
      try { await response.body?.cancel(); } catch { /* Retry the cached backend request. */ }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === CONFIG.Backend.maxRetries) throw error;
    } finally { clearTimeout(timer); }
    await pause(CONFIG.Backend.retryDelayMs * (attempt + 1));
  }
  throw lastError || new Error("Backend unavailable");
}

/** The extension never contacts an AI provider directly. Secrets stay in backend/.env. */
export class LlmClient {
  constructor(settings = {}, { fetchImpl = fetch } = {}) {
    this.settings = settings;
    this.fetch = fetchImpl;
    this.tokenEstimate = 0;
    this.providers = [];
    this.usedFallback = false;
  }

  async rawCall({ system = "", user = "", task = "judge", maxTokens, temperature, correlationId = "" }) {
    if (this.settings.mockMode) throw new LlmError("Mock mode is enabled; no backend request was made.");
    const approxInputTokens = Math.ceil((system.length + user.length) / 4);
    this.tokenEstimate += approxInputTokens;
    logger.debug("llm", `backend request ${correlationId}; task=${task}; estimated input=${approxInputTokens}`);
    try {
      const response = await callBackend(this.fetch, `${CONFIG.Backend.baseUrl.replace(/\/+$/, "")}/v1/generate`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ task, system, user, expectJson: true, maxOutputTokens: maxTokens || CONFIG.LLM.maxOutputTokens.judge, temperature: temperature ?? CONFIG.LLM.temperature.judge }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        const error = new LlmError(result?.errorCode === "BACKEND_UNAVAILABLE" ? "FocusTube's local AI backend is unavailable." : `FocusTube backend request failed (${result?.errorCode || response.status}).`);
        error.code = result?.errorCode || "BACKEND_ERROR";
        throw error;
      }
      const text = typeof result.text === "string" ? result.text : JSON.stringify(result.json ?? {});
      if (result.provider && !this.providers.includes(result.provider)) this.providers.push(result.provider);
      this.usedFallback ||= Boolean(result.usedFallback);
      this.tokenEstimate += Math.ceil(text.length / 4);
      logger.debug("llm", `backend response ${correlationId}; provider=${result.provider || "unknown"}; fallback=${Boolean(result.usedFallback)}`);
      return text;
    } catch (error) {
      if (error?.name === "AbortError") throw new TimeoutError("FocusTube backend timed out.");
      if (error?.code) throw error;
      const unavailable = new NetworkError("Could not reach the local FocusTube backend.", { cause: error });
      unavailable.code = "BACKEND_UNAVAILABLE";
      throw unavailable;
    }
  }

  async completeJson(options) {
    const raw = await this.rawCall({ ...options, task: options.task || (options.system?.toLowerCase().includes("expand") ? "expand" : "judge") });
    try { return extractJson(raw); }
    catch (error) {
      if (error?.code !== "PARSE_ERROR" && error?.name !== "ParseError") throw error;
      const repaired = await this.rawCall({ ...options, task: "judge", system: "Return only one valid JSON object matching the required schema. Do not add markdown or explanations.", user: `Repair this output as valid JSON. Preserve only valid data.\n<output>${raw.slice(0, CONFIG.LLM.repairOutputMaxChars)}</output>\nSchema instructions: ${String(options.user || "").slice(0, CONFIG.LLM.repairSchemaMaxChars)}`, maxTokens: CONFIG.LLM.maxOutputTokens.repair, temperature: 0 });
      return extractJson(repaired);
    }
  }

  async health() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.Backend.healthTimeoutMs);
    try {
      const response = await this.fetch(`${CONFIG.Backend.baseUrl.replace(/\/+$/, "")}/health`, { signal: controller.signal });
      if (!response.ok) return { ok: false, errorCode: `HTTP_${response.status}` };
      const health = await response.json();
      return health?.ok ? health : { ok: false, errorCode: "INVALID_HEALTH_RESPONSE" };
    } catch (error) {
      return { ok: false, errorCode: error?.name === "AbortError" ? "HEALTH_TIMEOUT" : "FETCH_FAILED" };
    }
    finally { clearTimeout(timer); }
  }
}
