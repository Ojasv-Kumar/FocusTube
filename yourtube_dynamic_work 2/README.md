# FocusTube 3.0.0

FocusTube is a Chromium extension that offers **Learn**, **Curiosity**, and **Relax** modes. Learn and Curiosity use a local Ollama model for learning query planning and a varied, ranked Curiosity home feed. Curiosity search results remain native YouTube results. Relax restores native YouTube. The optional MediaPipe camera feature provides attention alerts in Learn and open-palm pause/play control in all three modes.

## Install or update

1. Open `brave://extensions` or `chrome://extensions` and enable Developer mode.
2. Click **Load unpacked** and select this repository folder, the one containing `manifest.json`.
3. After code changes, click the extension’s **Reload** button. Choosing a mode reloads all open YouTube tabs so it takes effect immediately.
4. Configure the YouTube Data API key and Ollama endpoint/model under **FocusTube → Options**.

Unpacked extension folders do not sync between computers; copy the updated folder and load/reload it on each browser profile.

## Modes

- **Learn:** removes the home feed, Shorts, Trending/Explore links, watch-page recommendations, end-screen cards, YouTube’s masthead search field and menu button, search filter chips, and notification bell. It provides its own search field. Search results are regular videos only, split into **Relevant videos** and **Related searches**. It hides unrelated results and keeps comments/subscriptions according to the Learn settings. The original YouTube result list can be shown from the results panel.
- **Curiosity:** rotates through a varied, ranked home feed. Search pages remain native YouTube results, like Relax.
- **Relax:** disables FocusTube’s feed/search changes and returns to native YouTube.

The camera open-palm gesture can pause or resume regular videos in every mode. It does not run on Shorts. Face-missing and looking-away alerts are for Learn mode only; they pause playback and stay visible until the user resumes. Camera frames are processed locally by the bundled MediaPipe runtime.

## APIs and Ollama

Set a YouTube Data API key in Options to use `search.list`; without it, retrieval uses the HTML search provider. YouTube API access is optional and can be tested in Options.

For Ollama running on this computer, set its endpoint and model in Options. For a model running on another computer, use the included `remote-ollama-bridge` setup described in [OLLAMA-REMOTE-SETUP.md](OLLAMA-REMOTE-SETUP.md). The bridge must be reachable over trusted private Wi-Fi with HTTPS and a token. Never commit API keys, bridge tokens, or private certificates.

The Ollama model plans and ranks Learn results and plans and ranks the Curiosity home feed. If Ollama is unavailable, FocusTube reports a degraded result and falls back to its non-AI relevance rules; it does not send prompts to a cloud model.

## Settings

Settings include the Learn comments/subscriptions switches, light/dark appearance, camera enable/setup, Ollama connection, YouTube Data API key, feed size, and diagnostics. Camera setup requests permission in an extension-owned page and includes calibration.

## Verification

Run `npm test` with Node.js. Tests cover pipeline ranking, retrieval behavior, Ollama requests, settings, and package integrity. Live YouTube, API-key quota, Ollama host availability, and camera hardware behavior depend on the current browser and network, so validate those in the target browser after loading the unpacked folder.
