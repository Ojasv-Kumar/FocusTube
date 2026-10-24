import { CONFIG } from "../../config.js";
import { NetworkError } from "../../errors.js";

/* YouTube embeds private initial data in its HTML. VERIFY IN LIVE BROWSER. */
export function parseClockDuration(text) {
  const value = String(text || "").trim();
  if (!/^\d{1,3}(?::\d{1,2}){1,2}$/.test(value)) return null;
  const parts = value.split(":").map(Number);
  if (parts.slice(1).some(part => part >= 60)) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}
export function parseViewCount(text) {
  const value = String(text || "").replace(/,/g, "").trim().toLowerCase();
  const match = /([\d.]+)\s*([kmb])?\s*(?:views|view|visualizaciones|vues|aufrufe|просмотров)?/.exec(value);
  if (!match) return null;
  const multiplier = { k: 1e3, m: 1e6, b: 1e9 }[match[2]] || 1;
  const result = Number(match[1]) * multiplier;
  return Number.isFinite(result) ? Math.round(result) : null;
}
function extractInitialData(html) {
  const patterns = [/ytInitialData\s*=\s*/, /window\["ytInitialData"\]\s*=\s*/];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (!match) continue;
    const start = match.index + match[0].length;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < html.length; i += 1) {
      const char = html[i];
      if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
      if (char === '"') quoted = true;
      else if (char === "{") depth += 1;
      else if (char === "}" && --depth === 0) { try { return JSON.parse(html.slice(start, i + 1)); } catch { break; } }
    }
  }
  return null;
}
function textValue(value) {
  if (typeof value?.simpleText === "string") return value.simpleText;
  if (Array.isArray(value?.runs)) return value.runs.map(run => run?.text || "").join("");
  return "";
}
function collectRenderers(root, output = []) {
  if (!root || typeof root !== "object") return output;
  if (root.videoRenderer) output.push(root.videoRenderer);
  for (const value of Object.values(root)) {
    if (Array.isArray(value)) for (const child of value) collectRenderers(child, output);
    else if (value && typeof value === "object") collectRenderers(value, output);
  }
  return output;
}
export function normalizeRenderer(renderer) {
  const title = textValue(renderer.title);
  const durationSeconds = parseClockDuration(textValue(renderer.lengthText));
  const runs = renderer.viewCountText?.runs || [];
  const viewText = textValue(renderer.viewCountText) || textValue(renderer.shortViewCountText);
  const endpoint = renderer.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || "";
  const channel = renderer.ownerText || renderer.longBylineText || renderer.shortBylineText;
  const thumbnail = renderer.thumbnail?.thumbnails || [];
  const liveText = `${textValue(renderer.badges?.[0]?.metadataBadgeRenderer?.label)} ${textValue(renderer.thumbnailOverlays?.[0]?.thumbnailOverlayTimeStatusRenderer?.text)}`.toLowerCase();
  return {
    id: String(renderer.videoId || endpoint.match(/[?&]v=([^&]+)/)?.[1] || ""), title,
    channelName: textValue(channel), channelId: renderer.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || null,
    durationSeconds, viewCount: parseViewCount(viewText), publishedText: textValue(renderer.publishedTimeText), publishedAt: null,
    description: textValue(renderer.detailedMetadataSnippets?.[0]?.snippetText).slice(0, CONFIG.Pipeline.maxDescriptionChars),
    thumbnailUrl: thumbnail.at(-1)?.url || "", isLive: /live|premiere|streaming/.test(liveText),
    isShort: endpoint.startsWith("/shorts/") || (durationSeconds !== null && durationSeconds <= CONFIG.Pipeline.shortsMaxDurationSeconds)
  };
}
export class HtmlProvider {
  constructor({ fetchImpl = fetch } = {}) { this.fetch = fetchImpl; }
  async search(query, options = {}) {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(String(query || "").trim())}`;
    let response;
    try { response = await this.fetch(url, { method: "GET", credentials: "omit", cache: "no-store" }); }
    catch (cause) {
      const error = new NetworkError("Could not retrieve YouTube search in this browser.", { cause });
      error.code = "YOUTUBE_HTML_FETCH_FAILED";
      throw error;
    }
    let html;
    try { html = await response.text(); }
    catch {
      const error = new NetworkError("YouTube returned unreadable search data.");
      error.code = "YOUTUBE_HTML_INVALID";
      throw error;
    }
    if (!response.ok) {
      const error = new NetworkError(`YouTube search returned HTTP ${response.status}.`);
      error.code = `YOUTUBE_HTML_HTTP_${response.status}`;
      throw error;
    }
    html = String(html || "");
    if (/captcha|consent\.youtube|before you continue|unusual traffic/i.test(html.slice(0, 100_000))) {
      const error = new NetworkError("YouTube showed a consent or verification page; HTML retrieval is unavailable.");
      error.code = "YOUTUBE_CONSENT_REQUIRED";
      throw error;
    }
    const data = extractInitialData(html);
    if (!data) {
      const error = new NetworkError("YouTube's search page structure was not recognized.");
      error.code = "YOUTUBE_HTML_PARSE_FAILED";
      throw error;
    }
    const renderers = collectRenderers(data);
    const limit = options.maxResults || CONFIG.Pipeline.resultsPerQuery;
    return renderers.map(normalizeRenderer).filter(video => video.id && video.title).slice(0, limit);
  }
}
