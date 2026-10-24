# FocusTube 1.5.1 — fast, diverse Ollama feeds

FocusTube uses **Ollama on a friend's MacBook Air M4** for AI query expansion and ranking in Learn, Interest and Curiosity. Brave and FocusTube remain on the client Mac; YouTube retrieval remains in the extension and can optionally use a YouTube Data API key. There are **no OpenRouter, Gemini or Groq inference paths and no cloud AI fallback**.

## What changed in 1.5.1

- **Faster AI calls:** the active content bundle and source configuration are synchronized. Query expansion has a 9-second deadline, ranking calls are bounded to 15 seconds, the overall feed deadline is 45 seconds, and browser requests cancel the upstream Ollama request instead of leaving it to consume another long generation. The bridge has a 45-second hard request timeout. Compact output limits are set per call type.
- **Learn uses Ollama:** Ollama expands a focused query plan and ranks long-form candidate videos. Learn filters Shorts and videos under four minutes, and the Learn UI remains mounted when YouTube re-renders its open Shadow DOM.
- **Curiosity is broader:** 30 curated topic areas cover the supplied science, math, history, philosophy, finance, geopolitics, languages, courses, programming, hardware, DIY, careers, fitness, gaming, culture, true crime, travel, cooking, transport and ambient categories. Each page samples six different areas, filters recent query repeats, caps results per source query, and drops titles that appear to concern the same distinctive event/entity.
- **Compact score mapping:** the model returns numeric per-batch indexes rather than opaque YouTube IDs. The extension maps those indexes back to the exact candidate and validates every score.
- **Resilient ranking:** up to 12 candidates are ranked in six-video requests. If a response times out, truncates or is too large, batches are split immediately rather than repeating the same slow request. Valid per-video scores are cached by mode, target, model and prompt version.
- **Honest pagination:** the page shows up to 12 videos at a time, prefetches the next batch in the background, and labels the button `Find up to N more videos`. The feed can show up to 50 videos across pages; a single click does not promise 50.
- **Consistent YouTube-style design:** the popup, Options page and dashboard share the YouTube-dark palette. Learn hides Shorts chips, shelves, Shorts links and the native YouTube search field while keeping FocusTube's own search interface visible.
- **Safer diagnostics:** the HTTPS bridge logs route, status, duration, source IP and non-sensitive output statistics only. Prompts, generated text and bearer tokens are never logged. Ollama remains bound to `127.0.0.1:11434` behind the authenticated bridge.

## Install

1. Extract this ZIP into a stable folder on your Mac.
2. Open `brave://extensions`, enable Developer mode, disable/remove the prior unpacked FocusTube and choose **Load unpacked** for the folder containing `manifest.json`.
3. Copy the new extension ID from `brave://extensions`. If it changes, restart the bridge with that ID.
4. Follow **[OLLAMA-REMOTE-SETUP.md](OLLAMA-REMOTE-SETUP.md)**. Keep the existing token and certificates if the server IP did not change; copy only the new `remote-ollama-bridge/bridge.mjs` to your friend's existing bridge folder.
5. In FocusTube Options, set the HTTPS bridge URL, private token and `qwen3:8b`, then click **Test remote Ollama connection**.

## Security

Use only on a trusted private Wi-Fi network that allows peer-to-peer connections. Transfer only `certs/ca.crt` to the client Mac. Keep `ca.key`, `server.key` and `.bridge-token` on the server Mac. Never port-forward port `11435`, and do not expose Ollama's unauthenticated port `11434` to the LAN.

## Tests and live verification

Run `npm test` in the extracted folder. The test suite covers pagination, index mapping, score cache, timeout/partial JSON recovery, Curiosity entity deduplication, Learn Ollama ranking, selectors/Shadow-DOM cleanup, and package integrity. Automated tests use mocked AI/YouTube responses and do **not** prove that the real Qwen model, live YouTube retrieval, institution Wi-Fi or macOS certificate trust work end to end. Verify that on the two Macs with the connection test and one feed in each mode.
