# FocusTube 1.5.1 test report

## Automated suite

`npm test` (`node --test tests/*.test.js`) passes **50/50 tests** in the working tree after the latest patches. The suite covers:

- manifest/import/package integrity and absence of cloud AI endpoints;
- authenticated HTTPS Ollama requests, model presence, JSON output, parsing and timeout behavior using mocked responses;
- indexed score mapping from model output back to the exact YouTube candidates;
- query expansion before retrieval, Interest/Curiosity 12-video paging, query rotation, recent Curiosity query filtering and score-cache reuse;
- partial/malformed ranking recovery, immediate batch splitting after timeout/truncation/HTTP 413, metadata fallback and stalled-retrieval deadline;
- Curiosity filtering of repeated distinctive events such as differently worded Tacoma Narrows Bridge titles, while leaving Interest results less aggressively filtered;
- Learn mode's Ollama query expansion/ranking, Shorts/native-search selectors, active bundle configuration and Shadow-DOM cleanup;
- JavaScript package integrity, settings migration and private-bridge permissions.

## Bridge

The bridge enforces HTTPS, private-LAN source IPs, the configured extension ID when an Origin is present, and the high-entropy bearer token on every allowed route. It only exposes `/api/tags` and `/api/chat`; Ollama stays bound to `127.0.0.1:11434`. Request logs report timing/status/model and non-sensitive output diagnostics without logging prompts, generated text or tokens. Browser cancellation aborts the upstream Ollama request; the bridge also imposes a 45-second hard request deadline.

## Not yet verified

This environment cannot access your friend's live M4 Air, actual Qwen model process, institution Wi-Fi, Brave or macOS Keychain trust state. These 50 tests use mock AI/YouTube responses and **do not prove end-to-end live inference**. After installing 1.5.1 and updating `remote-ollama-bridge/bridge.mjs` on your friend's Mac, run the connection test and try one Learn query, one Interest feed and one Curiosity feed. Watch the visible progress phase and the bridge's timings/token counts if any stage falls back.
