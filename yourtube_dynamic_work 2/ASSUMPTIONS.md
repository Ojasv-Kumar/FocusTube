# Release assumptions

- AI inference for Learn, Interest, and Curiosity uses only the configured Ollama model, reached through the private HTTPS bridge. There is no OpenRouter/Groq/Gemini fallback.
- The extension validates a private-IPv4 HTTPS endpoint on port 11435 and asks browser permission for the configured origin after the user clicks the connection test.
- The bridge only allows one configured FocusTube extension origin, a random bearer token, private IPv4 clients, bounded request bodies, and `/api/tags` + `/api/chat`; Ollama remains bound to localhost.
- The client Mac trusts the local CA generated on the server Mac. The setup assumes that the two Macs are on a trusted Wi-Fi network that permits peer-to-peer traffic.
- YouTube Data API is a retrieval option, not an AI provider; it remains optional and falls back to YouTube HTML search according to existing behavior.
- Automated integration tests use mocked server responses. A real network connection, macOS certificate trust, local model availability, and model performance require the user to run the in-extension connection test.

- FocusTube 3.0.0 retains the six-video judge batches, 9-second expansion timeout, 15-second ranking requests, and 45-second pipeline/bridge limits from the Rudra Ollama implementation.
