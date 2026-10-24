# FocusTube diagnostics

## Gemini

- Open FocusTube Options, paste keys separated by commas or new lines, choose an available Gemini model, save, then click **Test Gemini connection**.
- FocusTube now sends Gemini requests directly from the extension. Keys left only in the former `backend/.env` are not loaded; save the key under **Options → Gemini AI** in each browser profile.
- A Gemini failure can mean an invalid/restricted key, unavailable model, exhausted quota, internet/VPN filtering, or missing extension host permission. Check the Options test result and the service worker console; never share key values.
- Interest and Curiosity fallback banners include Gemini's error code and a short safe explanation. `MISSING_GEMINI_KEYS` means the key is not saved in this browser profile; `CONFIG_ERROR` usually means the key/model was rejected; `QUOTA_ERROR` means to wait and retry; `NETWORK_ERROR` means the browser could not reach Gemini.
- The fast and smart model names may be identical. Fallback model names are optional. Multiple keys are rotated when a key is rate-limited.

## YouTube retrieval

- The YouTube Data API key is optional. If configured, FocusTube uses it first and falls back to YouTube HTML search after API errors.
- HTML retrieval can fail if YouTube returns a consent, captcha, or changed page. Check the browser network/VPN policy and retry; the UI offers original YouTube results.
- If both sources fail, the page reports which provider failed. A Gemini connection test does not verify YouTube retrieval.

## Modes and recovery

- If Interest or Curiosity ranking fails but retrieval succeeds, the feed labels videos as unranked matches instead of hiding them.
- If Learn curation fails, use the **Show original YouTube results** recovery control or Retry after fixing the source.
- **Mock mode** uses local bundled fixtures and makes no provider calls. Try backpropagation, op amp basics, or recursion in Python.
- After editing extension files, use **Reload** on the extension card and refresh YouTube. On another computer, copy the updated folder, reload it there, and configure that browser's keys separately.

Automated tests use fake providers. They do not verify current YouTube selectors or real keys/network availability.
