import { CONFIG } from "../config.js";
import { ConfigError, LlmError, NetworkError, QuotaError, TimeoutError } from "../errors.js";
import { extractJson } from "./validators.js";
import { logger } from "../logger.js";

const cooldowns = new Map();
const GEMINI_HOST_PERMISSION = "https://generativelanguage.googleapis.com/*";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const splitList = value => (Array.isArray(value) ? value : String(value || "").split(/[\n,;]+/))
  .map(item => String(item || "").trim()).filter(Boolean);
const responseText = data => data?.candidates?.[0]?.content?.parts?.map(part => part?.text || "").join("") || "";
const safeKeyId = (key, index) => `${index}:${key.slice(-4)}`;
async function hasGeminiHostPermission() {
  const permissions = globalThis.chrome?.permissions;
  if (!permissions?.contains) return null;
  try { return await permissions.contains({ origins: [GEMINI_HOST_PERMISSION] }); }
  catch { return null; }
}

/** Gemini requests run from the extension service worker; no local server is used. */
export class LlmClient {
  constructor(settings = {}, { fetchImpl = fetch, now = Date.now } = {}) {
    this.settings = settings;
    this.fetch = fetchImpl;
    this.now = now;
    this.tokenEstimate = 0;
    this.providers = [];
    this.usedFallback = false;
  }

  keys() { return splitList(this.settings.geminiApiKeys); }
  modelChain(task) {
    const fast = this.settings.geminiFastModel || CONFIG.LLM.fastModel;
    const smart = this.settings.geminiSmartModel || CONFIG.LLM.smartModel;
    const fallbacks = splitList(this.settings.geminiFallbackModels);
    const chain = task === "expand" ? [fast, ...fallbacks, smart] : [smart, ...fallbacks, fast];
    return [...new Set(chain.filter(Boolean))];
  }

  async generate({ model, apiKey, system = "", user = "", maxTokens, temperature, expectJson = true, signal }) {
    const url = `${CONFIG.LLM.apiBaseUrl}/${encodeURIComponent(model)}:generateContent`;
    const body = {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: maxTokens || CONFIG.LLM.maxOutputTokens.judge,
        temperature: temperature ?? CONFIG.LLM.temperature.judge,
        ...(expectJson ? { responseMimeType: "application/json" } : {})
      }
    };
    let response;
    try {
      response = await this.fetch(url, {
        method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body), signal
      });
    } catch (cause) {
      if (cause?.name === "AbortError") throw cause;
      const detail = String(cause?.message || cause?.name || "unknown browser network error").replace(/[\r\n\t]+/g, " ").slice(0, 180);
      throw new NetworkError(`Gemini request failed before an HTTP response (${cause?.name || "network error"}): ${detail}`, { cause });
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const status = data?.error?.status || data?.error?.errors?.[0]?.reason || "";
      const detail = String(data?.error?.message || status || `HTTP ${response.status}`).slice(0, 300);
      const error = response.status === 429
        ? new QuotaError(`Gemini rate or quota limit: ${detail}`)
        : response.status === 401 || response.status === 403
          ? new ConfigError(`Gemini rejected a key or model permission: ${detail}`)
          : new LlmError(`Gemini request failed (${response.status}): ${detail}`);
      error.status = response.status;
      throw error;
    }
    const text = responseText(data);
    if (!text) throw new LlmError("Gemini returned no text for this request.");
    return text;
  }

  async requestWithRotation({ task = "judge", system = "", user = "", maxTokens, temperature, expectJson = true, correlationId = "" }) {
    const keys = this.keys();
    if (!keys.length) {
      const error = new ConfigError("Add one or more Gemini API keys in FocusTube Options.");
      error.code = "MISSING_GEMINI_KEYS";
      throw error;
    }
    const models = this.modelChain(task);
    if (!models.length) throw new ConfigError("Set Gemini fast and smart model names in FocusTube Options.");
    if (await hasGeminiHostPermission() === false) {
      const error = new ConfigError("FocusTube does not have Gemini host access in this browser. Open Options and click Test Gemini connection, then allow access when prompted.");
      error.code = "MISSING_GEMINI_HOST_PERMISSION";
      throw error;
    }
    this.tokenEstimate += Math.ceil((system.length + user.length) / 4);
    let lastError;
    for (const model of models) {
      for (let index = 0; index < keys.length; index += 1) {
        const apiKey = keys[index];
        const keyId = safeKeyId(apiKey, index);
        if ((cooldowns.get(keyId) || 0) > this.now()) continue;
        for (let attempt = 0; attempt <= CONFIG.LLM.retriesPerKey; attempt += 1) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), CONFIG.LLM.timeoutMs);
          try {
            logger.debug("llm", `Gemini request ${correlationId}; task=${task}; model=${model}; key=${index + 1}`);
            const text = await this.generate({ model, apiKey, system, user, maxTokens, temperature, expectJson, signal: controller.signal });
            if (!this.providers.includes("gemini")) this.providers.push("gemini");
            this.usedFallback ||= model !== models[0] || index > 0;
            this.tokenEstimate += Math.ceil(text.length / 4);
            return { text, model, keyIndex: index };
          } catch (error) {
            lastError = error;
            if (error?.name === "AbortError") lastError = new TimeoutError("Gemini took too long to respond.");
            if (error?.status === 429) { cooldowns.set(keyId, this.now() + 30_000); break; }
            // A permission/model error will not improve with another retry on the same key.
            if (error?.status === 400 || error?.status === 401 || error?.status === 403) break;
            if (attempt < CONFIG.LLM.retriesPerKey) await pause(350 * (attempt + 1));
          } finally { clearTimeout(timer); }
          if (lastError?.status === 400 || lastError?.status === 401 || lastError?.status === 403) break;
        }
      }
    }
    if (lastError) throw lastError;
    throw new QuotaError("All configured Gemini keys are in cooldown. Wait briefly, then retry.");
  }

  async rawCall(options = {}) {
    const result = await this.requestWithRotation(options);
    return result.text;
  }

  async completeJson(options = {}) {
    const raw = await this.rawCall({ ...options, task: options.task || (options.system?.toLowerCase().includes("expand") ? "expand" : "judge"), expectJson: true });
    try { return extractJson(raw); }
    catch (error) {
      if (error?.code !== "PARSE_ERROR" && error?.name !== "ParseError") throw error;
      const repaired = await this.rawCall({
        ...options, task: "judge", expectJson: true,
        system: "Return only one valid JSON object matching the required schema. Do not add markdown or explanations.",
        user: `Repair this output as valid JSON. Preserve only valid data.\n<output>${raw.slice(0, CONFIG.LLM.repairOutputMaxChars)}</output>\nSchema instructions: ${String(options.user || "").slice(0, CONFIG.LLM.repairSchemaMaxChars)}`,
        maxTokens: CONFIG.LLM.maxOutputTokens.repair, temperature: 0
      });
      return extractJson(repaired);
    }
  }

  async health() {
    const keys = this.keys();
    return {
      ok: keys.length > 0,
      provider: "gemini",
      configuredKeys: keys.length,
      fastModel: this.settings.geminiFastModel || CONFIG.LLM.fastModel,
      smartModel: this.settings.geminiSmartModel || CONFIG.LLM.smartModel
    };
  }

  async testConnection() {
    const result = await this.requestWithRotation({ task: "judge", system: "Reply with exactly the word OK.", user: "OK", maxTokens: 8, temperature: 0, expectJson: false, correlationId: "options-test" });
    return { ok: true, provider: "gemini", model: result.model };
  }
}
