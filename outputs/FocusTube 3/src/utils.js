import { CONFIG } from "./config.js";

export function normalizeQuery(value, maxLength = CONFIG.Pipeline.queryMaxChars) {
  return Array.from(String(value ?? "").normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()).slice(0, maxLength).join("");
}
export function makeCorrelationId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
export function clamp(value, minimum, maximum, fallback = minimum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}
export function safeJsonParse(value) { try { return { ok: true, value: JSON.parse(value) }; } catch (error) { return { ok: false, error }; } }
export function timeoutPromise(promise, milliseconds, makeError) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(makeError()), milliseconds); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
