# FocusTube

FocusTube is a no-build Chrome extension for YouTube with two modes: **Learn** and **Relax**. It uses no AI provider, API key, backend, or local server.

## Install or update

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Select **Load unpacked** and choose this project folder, the one containing this `manifest.json`.
3. After an update, click the extension’s **Reload** button and refresh YouTube tabs.
4. Choose Learn or Relax in the first-run picker or extension popup.

To update another computer, copy the latest project folder there, then use **Load unpacked** to select that folder (or replace the old folder and click **Reload**). Unpacked extension files do not sync between computers.

## Modes

- **Learn:** removes the home feed, Shorts, Trending/Explore links, watch-page recommendations, end-screen cards, the masthead search field, search filter chips, and notification bell. The home page presents a focused search prompt. Search keeps regular video results only and locally filters them into **Relevant matches** from the exact search and **Related searches** from deterministic “explained” and “tutorial” query expansions. Cards show only the video and its metadata; there is no AI ranking or per-video role/reason label. Original YouTube results remain available from the results panel.
- **Relax:** removes FocusTube’s page changes and returns to normal YouTube.

The Settings page contains only Learn comments visibility, Learn Subscriptions visibility, and FocusTube’s dark/light appearance. Earlier saved API keys are removed from extension storage during migration.

## Verification

Run `npm test` with Node.js. Tests cover local relevance ranking, video-only extraction, Shorts shelf exclusion, mode/settings validation, and package permissions. YouTube changes its private search-page data format, so HTML parsing can need maintenance. A network or consent failure leaves the original YouTube results available.
