# FocusTube

FocusTube is a no-build Chrome extension for YouTube with two modes: **Learn** and **Relax**. It uses no AI provider, API keys, backend, or local server. Its optional camera assist bundles MediaPipe locally and blocks MediaPipe's optional external usage metrics; camera frames stay on the device. Search retrieval still uses YouTube.

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

## Optional camera attention assist

Open **Settings → Set up camera and calibration**, review and accept the MediaPipe metrics notice, then grant camera permission and complete the 3-second calibration. Camera analysis runs only on the active, visible YouTube video in Learn or Relax. Face-missing and looking-away alerts are limited to Learn mode and include a soft chime and cooldown. An open palm toggles playback in either mode after a brief hold (about 0.2 seconds); Shorts are excluded. If you pause using the player, camera monitoring stops; if an open-palm gesture pauses the video, hand recognition stays active so you can gesture to resume it. Disable the setting or revoke the browser camera permission to stop access.

The extension includes the MediaPipe Tasks Vision 1.1.1 runtime, WASM files, and task models under `vendor/mediapipe/`; no build or network download is needed. The extension's policy allows extension pages to connect only to extension files and YouTube, so MediaPipe's optional Google metrics endpoint is blocked. The runtime is Apache-2.0 licensed. MediaPipe's published privacy notice explains its on-device frame processing and its separate usage/performance metrics collection: https://developers.google.com/edge/mediapipe/solutions/tasks.

## Verification

Run `npm test` with Node.js. Tests cover local relevance ranking, video-only extraction, Shorts shelf exclusion, mode/settings validation, and package permissions. YouTube changes its private search-page data format, so HTML parsing can need maintenance. A network or consent failure leaves the original YouTube results available.
