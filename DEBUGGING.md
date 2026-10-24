# FocusTube troubleshooting

## Ollama connection

Use FocusTube Options → **Test remote Ollama connection**. It performs authenticated requests to the configured HTTPS bridge, verifies the selected model exists, and validates a JSON completion. The bridge requires the exact FocusTube extension ID and a 64-character token, accepts only private IPv4 clients, and forwards only model-list/chat requests to Ollama on localhost. Keep it on trusted Wi-Fi; never forward the port through a router.

## Feed ranking

- Update `remote-ollama-bridge/bridge.mjs` from this release on your friend's Mac and restart the bridge. Each `/api/chat` log includes method, status, time, source IP, model, visible-output length, thinking length, completion reason and generated token count. Prompts and responses are never logged.
- For an Interest/Curiosity home feed, the first `/api/chat` after the action begins should expand queries. After YouTube retrieval, additional calls rank compact indexed score rows in six-video batches (two requests for a normal 12-video page). More calls mean the model omitted rows, returned malformed/truncated output, or had to split a batch.
- Interest uses the cached expansion plan and rotates query-plan rows per batch. Curiosity queries are area-tagged and repeated recent query strings are filtered; if the model repeats its prior plan, deterministic fresh searches are used for that page.
- The ranker maps numeric indexes back to video IDs rather than trusting the model to copy IDs exactly. Curiosity has an additional title/entity deduper so different phrasings of the same distinctive event are less likely to dominate a page. AI scores are cached by target/model/prompt version. A changed prompt clears cache keys automatically; you can clear all extension cache under Options → Demo and diagnostics → Clear cache.
- If Ollama ranking fails, the feed labels metadata-ranked results as unranked instead of pretending AI ranked them. A timeout or output truncation can still cause metadata fallback; inspect the visible feed phase and bridge log timings.
- A certificate warning means the public `ca.crt` is not trusted on the client Mac or the URL IP differs from the certificate IP. If Wi-Fi IP changes, regenerate the certificate, re-trust `ca.crt`, and update Options.
- YouTube retrieval is separate from AI inference. Test YouTube HTML retrieval or the optional YouTube Data API key separately when no candidates are returned.

## Slow expansion or infinite loading

The current client times out query expansion after 9 seconds, individual ranking requests after 15 seconds, YouTube retrieval after 12 seconds, and the whole pipeline after 45 seconds. The server bridge cancels the Ollama request when the client times out and has a 45-second hard limit. The connection test can take up to about a minute on the first cold start. The feed button says `Find up to 12 more videos` because each click is one 12-video page; 50 is the overall cap, not the size of a single page.
