# FocusTube debugging

## Check the local backend

Start it from the project root with `node backend/server.mjs`. Visit `http://127.0.0.1:41731/health`. Health reports configured/available Gemini-key counts and Ollama reachability/model presence, never key values. See [backend/README.md](backend/README.md) for model setup and troubleshooting.

## Inspect the extension

1. Open `chrome://extensions`, find FocusTube, and choose **service worker → Inspect**.
2. Enable **Debug logging** in Options and retry. Correlation IDs connect page actions, service-worker pipeline logs, and backend calls. Logs must not contain provider keys.
3. In a YouTube tab's FocusTube content-script context, run `window.FocusTube.selectorHealth()` or use the selector health check in Options.

## Common symptoms

- **Picker or gate remains:** the gate watchdog is controlled by `CONFIG.Behaviour.gateWatchdogMs`. Refresh the tab and inspect the `[FocusTube][loader]` console message. The watchdog should restore YouTube and show a small failure notice if startup does not finish.
- **Popup says connected but a feed fails:** the popup checks only the local AI backend's `/health`. Interest and Curiosity also retrieve YouTube search results. The page now reports YouTube retrieval failures separately and tries HTML retrieval if the optional Data API fails.
- **The other computer says `FETCH_FAILED`:** `127.0.0.1` always means that same computer. Start this project's backend on that computer, install Ollama and the configured model there, create its own `backend/.env`, then confirm `http://127.0.0.1:41731/health` on that computer.
- **Backend is genuinely unavailable:** start `node backend/server.mjs`, verify the configured port equals `CONFIG.Backend.baseUrl`, grant FocusTube access to `http://127.0.0.1`, then reload the extension and refresh YouTube.
- **Interest/Curiosity AI ranking is unavailable:** if YouTube retrieval worked, the feed keeps the search matches and labels them as unranked instead of showing an empty error panel.
- **Learn results fall back to YouTube:** the backend may be unavailable, Ollama/Gemini may be down, or YouTube HTML retrieval may have changed. Native YouTube results are the recovery path; retry after service recovery.
- **No mock videos:** try `backpropagation`, `op amp basics`, or `recursion in python`. Mock mode is offline and makes no retrieval/backend calls.
- **Learn bar missing:** inspect whether a current `mastheadSearchRegion` selector matches. YouTube's masthead DOM is not a stable public API.
- **Native results do not return after an error:** inspect `data-focustube-search`; it should be removed when the results error renders or the results UI is disposed.
- **Unexpected setting behavior:** save Options and refresh if the unpacked extension was reloaded. Check `chrome.storage.local` for migrated current settings; obsolete API key fields should be removed.
- **A YouTube control overlaps the picker:** inspect the document-start gate (`data-focustube-gate="pending"`), `ytd-app.inert`, and the picker host stacking context. Test fresh hard loads on home, Shorts, and watch routes.

## Verification limits

Automated tests cover pure logic and fake backend upstreams. They do not verify current YouTube selectors, video playback state, sidebar layout at multiple viewport widths, Chrome picker focus behavior, or real Google/Ollama services. Use the unchecked checklist in README for those checks.
