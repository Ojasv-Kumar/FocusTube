# Legacy backend folder

FocusTube no longer uses a local backend or Ollama. The extension sends Gemini and optional YouTube Data API requests directly from its service worker. This folder exists only to keep any old ignored `.env` file from being confused with active setup; the extension does not read it. Do not start or distribute a local service. Never include `.env` in a shared package.
