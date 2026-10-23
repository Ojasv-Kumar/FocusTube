# Assumptions and implementation decisions

1. One saved mode and Interest topic apply across open YouTube tabs. When ask-on-new-tab is enabled, each new tab presents the required choice picker once per tab session.
2. The Manifest V3 content-script entry is a classic document-start bootstrap. It gates the YouTube app and media, then dynamically imports local ES modules; all code is packaged and no remote code or fonts are used.
3. Relax removes FocusTube-owned UI, styles, and attributes and does not start the SPA MutationObserver or retrieval pipeline. A Chrome storage listener remains so a popup mode change can activate another mode without reloading.
4. The service worker talks only to the loopback backend. Provider keys are stored in `backend/.env`, which is ignored by Git. The extension exposes no provider-key inputs and contains no direct AI API call.
5. The backend defaults to HTML retrieval in the extension and uses Gemini model names explicitly configured from Google AI Studio. Ollama is the first query-expansion provider, Gemini fast is the backup, and deterministic query variants are the final fallback.
6. API-based YouTube retrieval remains in the source for the documented disabled provider path, but `CONFIG.Retrieval.apiProviderEnabled` is false and no end-user YouTube API key exists.
7. YouTube selectors and embedded search data are undocumented. They are centralized in `src/selectors.js` and `src/background/retrieval/html-provider.js`; the bundled automated tests cannot prove they match current live pages.
8. Search replacement hides individual video renderers rather than YouTube's `#contents` or layout containers. The FocusTube results host is a normal-flow block with bounded width, `min-width: 0`, border-box sizing, and clipped overflow. Live viewport checks remain outstanding.
9. Eligible vertical/square Shorts cannot be inferred reliably from HTML metadata. The default minimum duration is a conservative proxy, while `/shorts/` routes are redirected to the watch page in focus modes.
10. Interest channel suggestions are names-only search links. IDs are not inferred or fabricated.
11. Mock mode uses bundled fixtures only. Unsupported Learn queries return an explicit empty-fixture state rather than unrelated videos.
12. Backend tests use fake loopback upstreams; live credentials and real upstream model availability have not been validated during this run.
