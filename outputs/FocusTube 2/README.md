# FocusTube

FocusTube is a no-build Chrome Manifest V3 extension that makes YouTube more intentional. Learn, Interest, and Curiosity retrieve and curate videos; Relax restores normal YouTube behavior. AI and search requests run directly from the extension. There is no FocusTube server, Node process, or Ollama dependency.

## Install or update

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this project folder, the one containing this root `manifest.json`.
3. After changing files, click the extension's **Reload** button, approve the added scripting permission if prompted, and refresh each YouTube tab.
4. Open FocusTube **Options**, enter a Gemini API key, and click **Test Gemini connection**. Set the fast and smart models to a model enabled for your key. They may be the same model.
5. Optionally add a YouTube Data API key in **Video search**. Without it, FocusTube retrieves candidates from YouTube's public search page using the open YouTube tab, then falls back to the extension worker request if needed.
6. Use the FocusTube toolbar popup to choose a mode. Switching modes updates open YouTube tabs without reloading.

Use the same project folder on every computer. Unpacked extension files and API keys do not sync between computers: copy the latest folder, select **Load unpacked** (or update the existing unpacked folder and click **Reload**) and configure keys in that browser profile. Keep the folder private because Gemini keys are stored in local extension storage and sent directly to Google.

## Modes

- **Learn:** replace the home feed with a learning prompt; expand a query into learning angles; group selected videos by role and explain each pick. Native YouTube results remain available when retrieval or Gemini fails.
- **Interest:** remember one interest; build a related home feed, suggest channels separately, and rank search results within that interest.
- **Curiosity:** discover broadly and rank for informational substance with neutral language.
- **Relax:** leave YouTube unchanged; the popup remains available for switching.

If Gemini is down, Interest and Curiosity label their retrieved candidates as unranked. If YouTube or Gemini cannot be reached, the extension offers retry and a route back to original YouTube. Enable **Mock mode** in Options to demo offline; bundled fixtures cover backpropagation, op amp basics, recursion in Python, and home feeds.

## Preferences

Options contains Gemini keys (comma, semicolon, or newline separated), fast/smart model names, optional fallback model names, optional YouTube Data API key, retrieval preference, mode behavior, mock mode, diagnostics, and cache controls. YouTube API retrieval falls back to direct public HTML search if the API key is missing, invalid, or out of quota. The YouTube key is optional.

Gemini's API key is sent in the `x-goog-api-key` request header from the extension service worker. The YouTube Data API key is included in Google's documented `key` query parameter. FocusTube does not send keys to its own server because it has no server. Do not share your configured browser profile or extension folder containing keys.

## Checks

Run the dependency-free test suite with:

```sh
node --test
```

Offline UI preview: open [dev/preview.html](dev/preview.html). It demonstrates representative picker, search, results, feed, popup, preferences, loading, empty, and error states.

## Manual verification

Automated tests use fake Gemini and YouTube responses. They do not validate your API key, network/VPN policy, current YouTube DOM, browser-specific host permission state, playback, or visual layout. In Chrome, verify:

- [ ] Reload this folder in `chrome://extensions`, then refresh YouTube.
- [ ] Open Options, save a Gemini key and model, then use **Test Gemini connection**.
- [ ] Choose Learn and search a specific topic; confirm grouped videos and reasons, then use the original-results fallback.
- [ ] Choose Interest, set an interest, refresh the home feed, and search; confirm channel suggestions and labeled graceful fallback if AI is unavailable.
- [ ] Choose Curiosity, refresh/search, and check neutral substance-oriented ordering.
- [ ] Switch all four modes from the popup without reloading; verify Relax restores native YouTube.
- [ ] Try with and without a YouTube Data API key; HTML search should be attempted as a fallback.
- [ ] Test home, watch, search, and Shorts routes, plus narrow and wide windows.

## Known limitations

YouTube HTML search parsing uses undocumented page data and can fail on consent checks, network restrictions, or YouTube page changes. The extension retains original YouTube results as a recovery path. AI ranking uses video metadata and descriptions; FocusTube does not watch videos or verify their teaching quality. Google API model availability and quota depend on the key's project and current Google policy.
