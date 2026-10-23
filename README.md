# FocusTube

FocusTube is a no-build Chrome Manifest V3 extension for YouTube. Learn, Interest, and Curiosity make YouTube calmer and more useful; Relax restores the native page. The highest-priority flow is a guided Learn search: expand a topic into learning angles, retrieve YouTube candidates, ask the local backend to rank them, and show inline grouped picks with reasons and a native-results recovery path.

## Load the unpacked extension

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked** and select this project folder, the one containing the root `manifest.json` (not an individual `src` folder).
3. Reload the extension after code changes, then refresh open YouTube tabs.
4. Open the FocusTube popup to switch modes. Use Options for preferences and mock mode.

The extension uses only vanilla JavaScript, HTML, CSS, and Chrome APIs. No build or npm install is required.

## Local AI backend

The extension has no provider keys or direct AI-provider calls. For AI ranking, configure and run the local service by following [backend/README.md](backend/README.md). It binds to loopback, defaults to port `41731`, and uses Ollama for query expansion with Gemini fallback. Model names must come from Google AI Studio and be set in the ignored `backend/.env`.

For an offline demo, enable **Mock mode** in Options. Fixtures cover `backpropagation`, `op amp basics`, and `recursion in python`, plus Interest and Curiosity home feeds. Mock mode makes no backend or retrieval requests.

## Modes

- **Learn:** focused home prompt, custom masthead search, hidden native video cards while curation loads, inline grouped results with short reasons, optional comments, Shorts suppression, and autoplay control.
- **Interest:** a feed of topic videos, separate suggested-channel section, and interest-aware ranking. The topic is remembered and can be changed in Options or the popup.
- **Curiosity:** broad video discovery scored for informational substance and sensationalism. Filtering strictness is configurable and wording stays neutral.
- **Relax:** native YouTube behavior without FocusTube styles, attributes, floating UI, mutation observers, or retrieval calls. The popup can still switch out of Relax.

The first-visit picker is mandatory when there is no tab choice and cannot be dismissed without selecting a mode. Switching modes from the popup updates open YouTube tabs without a reload.

## Preferences

Options includes ask-on-new-tab, default Interest, results count, Curiosity strictness, Learn Shorts/autoplay/comments, result reasons, density, mock mode, debug logging, selector health, cache clearing, and reset. Legacy API key/provider fields are removed from extension storage when encountered. End users never enter provider keys in the extension.

## Developer checks

Run the dependency-free checks with:

```sh
node --test
```

Check the backend independently with:

```sh
node --test tests/backend.test.js
node backend/server.mjs
```

Offline UI preview: open [dev/preview.html](dev/preview.html) in a browser. It uses the shared design tokens and demonstrates representative picker, search, results, feed, popup, preferences, loading, empty, and error states.

## Manual verification checklist

These checks require live YouTube in Chrome and are not represented as passed by the automated suite:

- [ ] Load this folder unpacked; hard-refresh YouTube home and confirm no page flash under the picker.
- [ ] Repeat the hard refresh on a `/shorts/` URL and a `/watch` URL; confirm media stays paused until a choice.
- [ ] Click outside the required picker and press Escape; it must remain until a mode is chosen. Test Interest → Back.
- [ ] Choose Relax; confirm YouTube is native and FocusTube injects no UI or mode attributes. Switch out using popup.
- [ ] In Learn, confirm Subscriptions, notification bell, Shorts, Trending, and watch recommendations are hidden as configured.
- [ ] Confirm Learn's custom masthead search pre-fills on results pages and handles empty, long, Unicode, and special-character queries.
- [ ] Search in Learn, Interest, and Curiosity; confirm result cards appear inline in the results area and original results return on failure.
- [ ] Stop the backend and search; confirm native results return with an inline dismissible notice and Retry.
- [ ] Inspect filter chips and card layout at widths 800, 1024, 1280, and 1440 px with YouTube's sidebar expanded and collapsed.
- [ ] Change every Options preference and verify the corresponding behavior; check popup switching from all four modes and backend health status.
- [ ] Verify autoplay, comments, channel suggestions, and Curiosity strictness on current YouTube pages.

## Known weaknesses and unconfirmed selectors

- This task run has not been exercised in a live Chrome/YouTube browser. YouTube's private DOM changes frequently; the masthead, result renderer, filter chips, subscriptions/mini-guide, notification bell, autoplay, end-screen, comments, and Shorts selectors need the manual checks above.
- HTML retrieval parses YouTube's undocumented search response and can fail on consent, captcha, locale, or page changes. On failure the UI should preserve native results.
- AI scores use supplied metadata only; FocusTube does not watch videos. Use native results when picks are not useful.
- Backend provider behavior is covered with fake local upstream tests, not real Google AI Studio or Ollama credentials in this environment.

See [ASSUMPTIONS.md](ASSUMPTIONS.md) for implementation choices and [DEBUGGING.md](DEBUGGING.md) for recovery steps.
