# FocusTube 1.5.1 installation

1. Extract the ZIP into a stable folder on your Mac.
2. Open `brave://extensions`, enable Developer mode, remove/disable the previous unpacked FocusTube, then choose **Load unpacked** and select the directory containing `manifest.json`.
3. Copy the extension ID shown for this newly loaded version.
4. Follow `OLLAMA-REMOTE-SETUP.md` to update your friend's remote Ollama bridge. Keep the existing token and TLS certificates if the server IP did not change.
5. In FocusTube Options enter the private HTTPS bridge URL, token, and model. Click **Test remote Ollama connection** and approve the exact host permission.
6. Reload YouTube. Test Learn with one topic, Interest with one topic, and Curiosity. Each home-feed page shows up to 12 videos; the button states the actual next-page count. In Learn mode, the native YouTube search field and Shorts shelves should be hidden; FocusTube's own search field remains available.

No cloud AI API key is required. The optional YouTube Data API key is only for video retrieval. Do not distribute `.bridge-token`, `certs/ca.key`, or `certs/server.key`.
