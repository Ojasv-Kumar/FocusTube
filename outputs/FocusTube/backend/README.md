# FocusTube local backend

The extension sends AI and YouTube retrieval requests only to `http://127.0.0.1:41731`. Gemini keys stay in this folder's ignored `.env` file and are never returned by `/health`. An optional YouTube Data API key is stored in the extension and sent to this loopback service only for the matching request; the service forwards it in a header and does not log it. YouTube HTML retrieval also runs here so the extension worker does not need direct access to YouTube or Google.

## Setup

1. Install Ollama from [ollama.com](https://ollama.com), start it, then pull the configured model: `ollama pull qwen3:4b`.
2. Copy `.env.example` to `.env`. Create four separate Google AI Studio projects, put one key from each in `GEMINI_API_KEYS`, and copy the exact available fast and smart model names from Google AI Studio into the corresponding fields. Do not guess model names.
3. Start the local service from the project root with `node backend/server.mjs`.
4. Keep the Mac awake during the live demo with `caffeinate -dimsu` in a separate terminal.
5. Open `http://127.0.0.1:41731/health` to check that Ollama is reachable and has the configured model. The endpoint reports Gemini key counts only, never key material.

No npm install is needed. The server uses Node built-in modules only. It binds to loopback, caps request bodies, rate-limits generation calls, applies timeouts, and keeps a short in-memory response cache. Query expansion tries Ollama, then Gemini fast, then deterministic local variants. Ranking goes to Gemini smart. YouTube API and HTML requests are proxied through loopback to avoid extension-worker network restrictions. If retrieval or AI services are unavailable, the extension restores native YouTube results and offers retry.

## Troubleshooting

- **Missing model settings:** add `GEMINI_FAST_MODEL` and `GEMINI_SMART_MODEL` from Google AI Studio; startup prints which setting is missing.
- **Ollama missing in `/health`:** start Ollama and run `ollama pull qwen3:4b` (or match `OLLAMA_MODEL` to the model you installed).
- **Backend shows not connected:** start the server, confirm the `PORT` matches `src/config.js`, then reload the extension and YouTube tab.
- **Backend shows connected but curated feeds fail:** the health check is a GET, while video retrieval uses POST and can be blocked by a browser's private-network preflight. Restart the server from this updated folder so it returns the matching preflight headers; then reload the unpacked extension and refresh YouTube. The updated server must expose `/v1/youtube/html` and `/v1/youtube/api`.
- **Using a second computer:** the loopback backend at `127.0.0.1` is per computer. Run this backend (and Ollama, if selected) on each computer that uses FocusTube; a server running on another laptop is not reachable through that laptop's own `127.0.0.1`.
- **Gemini reports unavailable:** check key validity, project billing/quota, and that model names match AI Studio. Never paste keys into extension Options or issue reports.
- **Demo without services:** enable Mock mode in FocusTube Options. It uses bundled fixtures and requires no backend/provider requests.

Run backend tests with `node --test tests/backend.test.js` from the project root.
