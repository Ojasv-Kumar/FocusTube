import { HtmlProvider } from "./html-provider.js";
import { CONFIG } from "../../config.js";

export function mergeVideos(groups) {
  const seen = new Set();
  return groups.flat().filter(video => {
    if (!video?.id || !video.title || video.isShort || video.isLive || seen.has(video.id)) return false;
    seen.add(video.id);
    return true;
  });
}

export async function retrieveQueries(queries, _settings, { htmlFetchImpl = fetch } = {}) {
  const provider = new HtmlProvider({ fetchImpl: htmlFetchImpl });
  const queryResults = [];
  let error = null;
  for (const query of queries) {
    try { queryResults.push(await provider.search(query, { maxResults: CONFIG.Pipeline.resultsPerSearch })); }
    catch (caught) { queryResults.push([]); error ||= caught; }
  }
  const videos = mergeVideos(queryResults);
  return { videos, queryResults, providers: videos.length ? ["youtube-html"] : [], error: videos.length ? null : error };
}
