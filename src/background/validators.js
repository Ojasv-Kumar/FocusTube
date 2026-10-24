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
function normalizedScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  // Accept 0..1 JSON-schema scores and a 0..10 model response from older prompts.
  const scaled = value > 1 && value <= 10 ? value / 10 : value;
  return clamp(scaled, 0, 1);
}
function rowId(row, allowed, pool = []) {
  // Indexed outputs are much more reliable for local models than copying 11-char
  // YouTube IDs. Keep accepting literal IDs for backwards compatibility.
  const explicit = String(row?.id ?? row?.videoId ?? "").trim();
  if (explicit && allowed.has(explicit)) return explicit;
  const rawIndex = row?.i;
  const index = Number.isInteger(rawIndex) ? rawIndex : (typeof rawIndex === "string" && /^\d+$/.test(rawIndex) ? Number(rawIndex) : -1);
  if (index >= 0 && index < pool.length && pool[index]?.id && allowed.has(String(pool[index].id))) return String(pool[index].id);
  const legacy = String(rawIndex ?? "").trim();
  return allowed.has(legacy) ? legacy : "";
}
export function validateLearnJudge(value, pool) {
  const allowed = new Map(pool.map(video => [video.id, video]));
  const roleMap = { intro: "intro", theory: "deep_dive", handson: "hands_on", deep: "deep_dive", reference: "reference", deep_dive: "deep_dive", hands_on: "hands_on", other: "other" };
  const rows = Array.isArray(value?.videos) ? value.videos : Array.isArray(value?.v) ? value.v : [];
  const videos = [];
  const used = new Set();
  for (const row of rows) {
    const id = rowId(row, allowed, pool);
    const relevance = normalizedScore(row?.relevance ?? row?.fit);
    const quality = normalizedScore(row?.quality ?? row?.q);
    if (!id || used.has(id) || relevance === null || quality === null || row.include === false) continue;
    used.add(id);
    videos.push({ ...allowed.get(id), relevance, quality,
      role: roleMap[row.role] || "other",
      reason: limitedString(row.reason ?? row.w, CONFIG.Pipeline.reasonMaxChars, "Selected as a potentially useful learning result.") });
  }
  return { videos };
}
export function validateInterestJudge(value, pool) {
  const allowed = new Map(pool.map(video => [video.id, video]));
  const roles = new Set(["core", "tutorial", "project", "news", "talk", "other"]);
  const rows = Array.isArray(value?.videos) ? value.videos : Array.isArray(value?.v) ? value.v : [];
  const videos = [];
  const used = new Set();
  for (const row of rows) {
    const id = rowId(row, allowed, pool);
    const relevance = normalizedScore(row?.relevance ?? row?.fit);
    const quality = normalizedScore(row?.quality ?? row?.q);
    if (!id || used.has(id) || relevance === null || quality === null) continue;
    used.add(id);
    videos.push({ ...allowed.get(id), relevance, quality,
      role: roles.has(row.role) ? row.role : "other",
      reason: limitedString(row.reason ?? row.w, CONFIG.Pipeline.reasonMaxChars, relevance >= 0.8 ? "Strong metadata match for this interest." : relevance >= 0.6 ? "Relevant to this interest based on metadata." : "Lower relevance based on the available metadata.") });
  }
  return { videos };
}
export function validateCuriosityJudge(value, pool) {
  const allowed = new Map(pool.map(video => [video.id, video]));
  const rows = Array.isArray(value?.videos) ? value.videos : Array.isArray(value?.v) ? value.v : [];
  const videos = [];
  const used = new Set();
  for (const row of rows) {
    const id = rowId(row, allowed, pool);
    const substance = normalizedScore(row?.substance ?? row?.q ?? row?.quality);
    const sensational = normalizedScore(row?.sensational ?? row?.clickbait ?? 0);
    if (!id || used.has(id) || substance === null || sensational === null) continue;
    used.add(id);
    videos.push({ ...allowed.get(id), substance, sensational, relevance: substance, quality: substance, role: "other",
      reason: limitedString(row.reason ?? row.w, CONFIG.Pipeline.reasonMaxChars, substance >= 0.75 && sensational < 0.35 ? "Substantive explainer with a low-sensationalism title." : "Ranked for informative value using metadata.") });
  }
  return { videos };
}
export function validateQueries(value, original, count = CONFIG.Pipeline.queriesPerSearch) {
  const queries = Array.isArray(value?.queries) ? value.queries : [];
  const normalized = [...new Set([original, ...queries.filter(item => typeof item === "string")].map(item => String(item || "").normalize("NFC").trim()).filter(Boolean))];
  return normalized.slice(0, Math.max(1, count));
}
