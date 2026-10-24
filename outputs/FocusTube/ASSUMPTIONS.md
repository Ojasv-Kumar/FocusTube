# FocusTube implementation notes

1. The project root containing `manifest.json` is the canonical Load unpacked folder.
2. The extension stores provider keys in local extension storage and sends requests from its service worker directly to Gemini and Google APIs. No FocusTube backend, account, analytics, or Ollama is used.
3. A Gemini API key and an available fast/smart model are required for AI ranking. Fast and smart can be the same model; model fallbacks and additional keys are optional.
4. The YouTube Data API key is optional. Retrieval tries the configured source and falls back to public YouTube HTML search.
5. When ranking fails, Interest and Curiosity show labeled unranked results if retrieval succeeded. Learn restores native YouTube results on curation failure.
6. Mock mode reads bundled fixtures and makes no upstream requests.
7. YouTube search HTML and DOM selectors are undocumented and may change; user-visible recovery keeps native YouTube accessible.
8. Eligible vertical/square Shorts cannot be reliably inferred from HTML metadata. Duration and `/shorts/` route handling are conservative heuristics.
9. AI judges supplied metadata and descriptions only; it does not watch videos or guarantee factual accuracy.
