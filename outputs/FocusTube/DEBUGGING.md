# FocusTube debugging

## Open the service worker console

1. Open `chrome://extensions`.
2. Find FocusTube and click **service worker → Inspect**.
3. Enable **Debug logging** in the FocusTube Options page, save, and retry the action.
4. Filter the console for `[FocusTube]`. Logs identify the module and include correlation IDs for pipeline actions. API keys and request headers are never logged.

## Inspect a YouTube tab

Open DevTools on YouTube. In the JavaScript context dropdown, choose the FocusTube content-script context and run:

```js
window.FocusTube.selectorHealth()
```

Or open the extension popup and use **Check YouTube selectors**. The report lists each fallback selector and whether it matched the current page. A selector can legitimately be unmatched when checking a page type it does not apply to.

## Common symptoms

- **Picker or switcher does not appear:** refresh the YouTube tab after loading/reloading the unpacked extension. Check the content-script console for `[FocusTube][loader]`; module bootstrap failures can indicate a missing web-accessible file or browser restriction.
- **YouTube is hidden after page load:** inspect the root element's `data-focustube-mode`. It should change from `startup`/`picker` to a saved mode. If not, reload the extension and tab.
- **Search panel says retrieval failed:** the YouTube API key may be missing/invalid/quota-limited, or YouTube may have changed its HTML page structure. Use HTML retrieval in Auto mode, enable mock mode for a demo, or show original results.
- **AI ranking unavailable:** open Options and use **Test LLM connection**. `BAD_KEY`, `RATE_LIMITED`, `PROVIDER_DOWN`, `TIMEOUT_ERROR`, `PARSE_ERROR`, and `PERMISSION_DENIED` identify the failure category. Basic results remain available when retrieval succeeded.
- **Custom provider gets a permission error:** save Options again and grant the requested HTTPS hostname. A declined permission does not prevent saving settings.
- **No videos in mock mode:** use one of `backpropagation`, `op amp basics`, or `recursion in python`. Other queries intentionally do not borrow unrelated fixture rows.
- **Home feed remains visible:** use the selector health check on the home page. YouTube may have reshaped its home renderer; add the verified selector fallback in `src/selectors.js`.
- **Autoplay remains on:** the player toggle selector may have changed or appeared outside the configured retry window. Autoplay suppression is best effort. Once a user turns it back on, FocusTube stops trying for that tab session.
- **A result looks stale:** correlation ID traces plus the current page URL help identify it. Content results are gated by a monotonically increasing request token, so a superseded response should be ignored.
- **Extension reload made an open tab stop responding:** refresh YouTube. The content script will report that its extension context was invalidated rather than breaking the page.

## Correlation IDs

Each search/feed action creates a short correlation ID. The content message carries it to the service worker; pipeline and LLM debug entries use the same ID. If logs are sparse, turn on debug logging before repeating the action. Cached actions can finish without making an LLM request.

## Tests

Run the pure logic checks from this folder with `node --test`. They cover parsing, validation, normalization, dedupe, cache TTL/eviction, quota accounting, page types, and generated hide selectors. They do not replace the live browser checklist in the README.
