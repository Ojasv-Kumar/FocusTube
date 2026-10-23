import { CONFIG } from "../config.js";
import { ConfigError, LlmError, NetworkError, ParseError, TimeoutError } from "../errors.js";
import { extractJson } from "./validators.js";
import { logger } from "../logger.js";

function requestError(response, body) {
  if (response.status === 401 || response.status === 403) { const error = new LlmError("The provider rejected the API key or access."); error.code = "BAD_KEY"; return error; }
  if (response.status === 429) { const error = new LlmError("The provider rate limited this request."); error.code = "RATE_LIMITED"; error.retryAfter = response.headers.get("retry-after"); return error; }
  if (response.status >= 500) { const error = new LlmError("The AI provider is temporarily unavailable."); error.code = "PROVIDER_DOWN"; return error; }
  const text = String(body?.error?.message || "").slice(0, 240);
  return new LlmError(text || `The AI provider returned HTTP ${response.status}.`);
}
function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(CONFIG.LLM.retryAfterMaxMs, Math.max(0, seconds * 1000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(CONFIG.LLM.retryAfterMaxMs, Math.max(0, date - Date.now())) : null;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class LlmClient {
  constructor(settings, { fetchImpl = fetch, permissionApi = chrome.permissions, random = Math.random } = {}) {
    this.settings = settings; this.fetch = fetchImpl; this.permissions = permissionApi; this.random = random;
    this.baseUrl = settings.llmBaseUrl.replace(/\/+$/, "");
    this.tokenEstimate = 0;
  }
  async ensureHostPermission() {
    let origin;
    try { const url = new URL(this.baseUrl); if (url.protocol !== "https:") throw new Error("HTTPS required"); origin = `${url.origin}/*`; }
    catch { throw new ConfigError("The LLM base URL must be a valid HTTPS URL."); }
    const granted = await this.permissions.contains({ origins: [origin] });
    if (!granted) { const error = new ConfigError("Grant access to this LLM host in the options page before making requests."); error.code = "PERMISSION_DENIED"; throw error; }
  }
  async rawCall({ system, user, model, maxTokens, temperature, correlationId }) {
    if (!this.settings.llmApiKey) throw new ConfigError("Add an LLM API key in FocusTube options or enable mock mode.");
    await this.ensureHostPermission();
    const url = `${this.baseUrl}/chat/completions`;
    const body = { model: model || this.settings.smartModel, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: temperature ?? CONFIG.LLM.temperature.judge, max_tokens: maxTokens || CONFIG.LLM.maxOutputTokens.judge, response_format: { type: "json_object" } };
    const approxInputTokens = Math.ceil((system.length + user.length) / 4);
    this.tokenEstimate += approxInputTokens;
    logger.debug("llm", `request ${correlationId} estimated input ${approxInputTokens} tokens`);
    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CONFIG.LLM.timeoutMs);
      try {
        const response = await this.fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.settings.llmApiKey}` }, body: JSON.stringify(body), signal: controller.signal });
        clearTimeout(timer);
        let payload;
        try { payload = await response.json(); }
        catch {
          if (response.ok) throw new LlmError("The AI provider returned an unreadable response.");
          payload = {};
        }
        if (response.ok) {
          const content = payload?.choices?.[0]?.message?.content;
          const text = Array.isArray(content) ? content.map(part => part?.text || "").join("") : content;
          if (typeof text !== "string") throw new LlmError("The AI provider response did not contain message text.");
          logger.debug("llm", `response ${correlationId} estimated output ${Math.ceil(text.length / 4)} tokens`);
          this.tokenEstimate += Math.ceil(text.length / 4);
          return text;
        }
        const mapped = requestError(response, payload);
        const retryable = ["RATE_LIMITED", "PROVIDER_DOWN"].includes(mapped.code) || mapped instanceof NetworkError;
        if (!retryable || attempt >= CONFIG.LLM.maxRetries) throw mapped;
        const waitMs = mapped.retryAfter ? parseRetryAfter(mapped.retryAfter) : CONFIG.LLM.backoffBaseMs * (2 ** attempt) * (0.75 + this.random() * 0.5);
        attempt += 1; await sleep(waitMs);
      } catch (error) {
        clearTimeout(timer);
        if (error?.name === "AbortError") throw new TimeoutError();
        if (["BAD_KEY", "RATE_LIMITED", "PROVIDER_DOWN", "CONFIG_ERROR", "PERMISSION_DENIED", "TIMEOUT_ERROR", "LLM_ERROR"].includes(error?.code)) throw error;
        if (attempt >= CONFIG.LLM.maxRetries) throw new NetworkError("Could not connect to the configured AI provider.", { cause: error });
        await sleep(CONFIG.LLM.backoffBaseMs * (2 ** attempt) * (0.75 + this.random() * 0.5));
        attempt += 1;
      }
    }
  }
  async completeJson(options) {
    const raw = await this.rawCall(options);
    try { return extractJson(raw); }
    catch (firstError) {
      if (!(firstError instanceof ParseError)) throw firstError;
      const repaired = await this.rawCall({ ...options, system: "Return only one valid JSON object matching the required schema. Do not add markdown or explanations.", user: `Repair this output into the required JSON schema. Preserve only valid data.\n<output>${raw.slice(0, CONFIG.LLM.repairOutputMaxChars)}</output>\nSchema instructions: ${options.user.slice(0, CONFIG.LLM.repairSchemaMaxChars)}`, maxTokens: CONFIG.LLM.maxOutputTokens.repair, temperature: CONFIG.LLM.temperature.repair });
      return extractJson(repaired);
    }
  }
}
