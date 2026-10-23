import { clamp } from "../utils.js";
import { ParseError } from "../errors.js";
import { CONFIG } from "../config.js";

export function extractJson(text) {
  if (typeof text !== "string") throw new ParseError();
  let candidate = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = candidate.indexOf("{");
  if (start < 0) throw new ParseError();
  let depth = 0, quoted = false, escaped = false, end = -1;
  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) { end = index + 1; break; }
  }
  if (end < 0) throw new ParseError();
  const jsonText = candidate.slice(start, end).replace(/,\s*([}\]])/g, "$1");
  try { return JSON.parse(jsonText); } catch (cause) { throw new ParseError("The AI response was not valid JSON.", { cause }); }
}

function limitedString(value, length, fallback = "") { return typeof value === "string" ? value.trim().slice(0, length) : fallback; }
export function validateLearnJudge(value, pool) {
  const allowed = new Map(pool.map(video => [video.id, video]));
  const roles = new Set(["intro", "deep_dive", "hands_on", "reference", "other"]);
  const rows = Array.isArray(value?.videos) ? value.videos : [];
  return { videos: rows.filter(row => row && allowed.has(String(row.id)) && row.include !== false).map(row => ({
    ...allowed.get(String(row.id)), relevance: clamp(row.relevance, 0, 1), quality: clamp(row.quality, 0, 1),
    role: roles.has(row.role) ? row.role : "other", reason: limitedString(row.reason, CONFIG.Pipeline.reasonMaxChars, "Selected as a potentially useful result.")
  })) };
}
export function validateInterestJudge(value, pool) {
  const allowed = new Map(pool.map(video => [video.id, video]));
  return { videos: (Array.isArray(value?.videos) ? value.videos : []).filter(row => row && allowed.has(String(row.id)) && row.include !== false).map(row => ({
    ...allowed.get(String(row.id)), relevance: clamp(row.relevance, 0, 1), quality: clamp(row.quality, 0, 1),
    role: "other", reason: limitedString(row.reason, CONFIG.Pipeline.reasonMaxChars, "Fits the stated interest.")
  })) };
}
export function validateCuriosityJudge(value, pool) {
  const allowed = new Map(pool.map(video => [video.id, video]));
  return { videos: (Array.isArray(value?.videos) ? value.videos : []).filter(row => row && allowed.has(String(row.id))).map(row => ({
    ...allowed.get(String(row.id)), substance: clamp(row.substance, 0, 1), sensational: clamp(row.sensational, 0, 1),
    relevance: clamp(row.substance, 0, 1), role: "other", reason: limitedString(row.reason, CONFIG.Pipeline.reasonMaxChars, "Limited information available.")
  })) };
}
export function validateQueries(value, original, count = CONFIG.Pipeline.queriesPerSearch) {
  const queries = Array.isArray(value?.queries) ? value.queries : [];
  const normalized = [...new Set([original, ...queries].map(item => String(item || "").normalize("NFC").trim()).filter(Boolean))];
  return normalized.slice(0, Math.max(1, count));
}
