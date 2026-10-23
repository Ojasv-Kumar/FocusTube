# FocusTube

FocusTube is a no-build Chrome Manifest V3 extension for YouTube. It gives the user four modes: Learn, Interest, Curiosity, and Relax. The priority path is Learn: choose a topic, expand the search into learning angles, retrieve candidates from YouTube, ask an OpenAI-compatible model to select and group useful picks, and keep the original YouTube results one click away.

This folder is the unpacked extension. It uses vanilla JavaScript modules, HTML, CSS, and Chrome's built-in APIs. No package install or build command is needed to load it. `package.json` only lets Node run the dependency-free tests.

## Install and set up

1. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked** and select this project folder (the folder containing `manifest.json`).
3. Open the FocusTube extension menu and choose **Options**.
4. Enter an OpenAI-compatible base URL and model names. Add an LLM API key for live AI ranking.
5. Choose retrieval:
   - **Auto** uses the YouTube Data API when a key is saved, then falls back to YouTube search HTML if the API is unavailable.
   - **YouTube Data API** requires the optional key field and reports API errors directly.
   - **YouTube search HTML** avoids a YouTube API key but depends on YouTube's private page data.
6. Save, then open or refresh `https://www.youtube.com/`. The first page in each tab asks what you are here for.

For an offline UI demo, turn on **Mock mode** in Options and keep YouTube open. FocusTube will load only its packaged fixtures for the supported demo topics; it makes no provider or YouTube Data API requests. The YouTube site itself still needs to be open in the browser. The fixtures cover `backpropagation`, `op amp basics`, and `recursion in python`, plus Interest and Curiosity home feeds.

Your keys are stored in `chrome.storage.local` and are sent only to the configured provider. The content script receives redacted settings and never receives either key. A custom LLM host requires a one-time Chrome host-access grant from the Options page. FocusTube asks only for the configured HTTPS host.

## Modes

- **Learn** hides the home feed, Shorts, Trending/Explore links, watch-page recommendations, and end-screen cards. The home page becomes a focused search prompt. Search results are grouped into learning roles and each pick includes a reason. If AI ranking is unavailable, the panel is labeled and uses a deterministic basic ranking. The original YouTube results stay available in the panel.
- **Interest** asks for one interest, remembers it, and builds a video feed. Suggested channels appear separately with search links. Search is re-ranked against the saved interest.
- **Curiosity** combines a small sample of the editable seed-channel list with broad topic searches and applies neutral substance/sensationalism scores. Titles are never labeled worthless.
- **Relax** leaves YouTube's page behavior alone. The mode picker and small switcher stay available; no FocusTube retrieval pipeline runs.

Use the floating **Switch mode** control or the extension popup. Mode changes apply to open YouTube tabs through extension storage events, without a page reload.

## Where to change things

- Tuning values, timeouts, query counts, cache lifetime, labels, and mode behavior: [src/config.js](src/config.js)
- YouTube page selectors and route detection: [src/selectors.js](src/selectors.js)
- Search and ranking prompts: [src/background/prompts.js](src/background/prompts.js)
- Provider selection and normalized results: [src/background/retrieval/](src/background/retrieval/)
- Seed channels: [data/curiosity-seed-channels.json](data/curiosity-seed-channels.json). Edit channel names/categories; channel IDs are intentionally `null`.
- Demo fixtures: [data/mock-responses/](data/mock-responses/)

To swap LLM providers, enter the provider's HTTPS base URL and chat-completions model names in Options. The adapter sends `POST {baseUrl}/chat/completions`, a bearer key, and JSON output preference. Provider differences in the JSON response format can still cause a clearly labeled fallback.

## Developer checks

Run the pure-logic suite with Node's built-in runner:

```sh
node --test
```

The tests need no npm install. To inspect the extension service worker, open `chrome://extensions`, find FocusTube, and choose **service worker → Inspect**. For the YouTube integration, open DevTools on a YouTube tab and select the **FocusTube** content-script execution context to call `window.FocusTube.selectorHealth()`.

## Things to verify manually in a live browser

YouTube's DOM and initial page data are private and change over time. The selectors and HTML parsing below are intentionally isolated and marked `VERIFY IN LIVE BROWSER` in code.

- Dynamic module bootstrap from the document-start content script and that the startup cover does not flash or hide YouTube after initialization.
- Mode picker cards, keyboard navigation, Escape behavior, Interest validation, and focus trap.
- Mode changes from the floating control and popup while YouTube stays on the same SPA page.
- Learn mode on home, search, watch, channel, and Shorts routes; verify native results hide and return correctly.
- Search results DOM placement and all selector fallbacks; use the popup's **Check YouTube selectors** action and inspect the report.
- HTML retrieval with and without sign-in, consent/captcha pages, non-English queries, and unusual titles.
- YouTube API key validation, API quota exhaustion, and current daily quota reset behavior.
- Interest and Curiosity home feeds, separate channel section, and search re-ranking.
- Autoplay control appearing late, then manually turning autoplay back on to confirm FocusTube stops intervening.
- End-screen cards, Shorts shelves/tab, Trending/Explore, comments setting, watch recommendations, and home feed hiding.
- Mock mode for each Learn fixture and both home feeds; bad LLM key, offline provider, empty query/results, and the original-results toggle.

## Manual test checklist

- [ ] Load unpacked from this folder and open Options.
- [ ] Save settings; test an LLM connection and a YouTube API key.
- [ ] Enable mock mode and run all three Learn fixture queries.
- [ ] Open a fresh YouTube tab; choose each mode in the picker.
- [ ] Learn: home prompt submits a normal YouTube search; curated search shows grouped reasons and an original-results toggle.
- [ ] Interest: save a non-empty interest; verify the home feed, suggested channels, and search reranking.
- [ ] Curiosity: verify the home feed and search ranking use neutral wording.
- [ ] Relax: verify normal YouTube is visible; switcher and popup can still change the mode.
- [ ] Switch modes from the floating control and popup without reloading.
- [ ] Navigate home → search → watch → Shorts → back using YouTube SPA links.
- [ ] Verify no duplicate panels appear after repeated navigation or mode switching.
- [ ] Test Show original YouTube results, then Show FocusTube results.
- [ ] Test mock mode with network disconnected from provider/API access.
- [ ] Test a bad LLM key, an offline provider, empty results, and a depleted API quota; verify each has a recovery path.
- [ ] Run `node --test`.

## Limitations

- YouTube HTML retrieval depends on undocumented embedded data and may stop working after a YouTube change. API retrieval is the more stable option when a key and quota are available.
- AI rankings depend on model/provider quality and metadata only; FocusTube does not watch the videos. Use the original YouTube results whenever the curated list is not useful.
- The current default models are editable examples. Confirm they exist for your chosen provider.
- Runtime permissions for a custom provider are scoped to its HTTPS hostname. If access is declined, settings can still be saved but the provider request will show a permission error.
- No account, backend, analytics, downloads, Firefox build, or Web Store pipeline is included.

## Current quota accounting

The brief describes each `search.list` call as 100 quota units. The current YouTube API documentation instead describes a separate Search Queries bucket with 100 calls per day at 1 unit per call; `videos.list` is 1 unit per call, and the general read quota is tracked separately. FocusTube follows the current bucket model in `src/config.js`, including the 100-call daily search cap. Verify your project's actual quota limits in Google Cloud before a demo.

References: [Chrome optional host permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [YouTube API quota costs](https://developers.google.com/youtube/data/determine_quota_cost), [YouTube search.list](https://developers.google.com/youtube/data/reference/rest/v3/search/list), [YouTube videos.list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list), [YouTube three-minute Shorts rules](https://support.google.com/youtube/answer/15424877).
