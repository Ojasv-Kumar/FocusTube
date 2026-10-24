# FocusTube 3.0.0 installation

1. Keep this project folder at a stable path. The folder you load must contain `manifest.json` at its top level.
2. Open `brave://extensions`, enable Developer mode, then click **Load unpacked** and select this repository folder.
3. Configure your YouTube Data API key and Ollama model under **FocusTube → Options**. Follow `OLLAMA-REMOTE-SETUP.md` if Ollama runs on your friend's Mac; you may reuse existing bridge credentials and certificates if its IP did not change.
4. Copy the current extension ID into the bridge configuration if needed, test the Ollama connection, then refresh YouTube.
5. Check Learn, Interest, Curiosity, and Relax. In Learn, FocusTube search remains while YouTube's masthead search, Shorts, filters, and notification bell are hidden. Camera gestures work on regular video pages in every mode after setup.

No Gemini or other cloud AI key is used. The YouTube Data API key is for video retrieval. Do not distribute `.bridge-token`, `certs/ca.key`, or `certs/server.key`.
