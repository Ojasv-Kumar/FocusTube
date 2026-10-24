# Remote Ollama setup: two Macs on the same trusted Wi-Fi

This release uses a private HTTPS bridge rather than opening Ollama itself to the network. Do not skip the certificate or token steps; direct calls to an unprotected Ollama server would not have authentication.

## Upgrade an existing remote setup to 3.0.0 (keep your current token and certificates)

If you already generated certificates and `.bridge-token`, **do not run `generate-certs.sh` again and do not delete `.bridge-token`** unless the server IP changed or you intentionally want to rotate the secret.

1. Stop the old bridge with `Ctrl+C`.
2. Load FocusTube 3.0.0 from the project folder on your Mac, then copy its current ID from `brave://extensions`.
3. On your friend's Mac, copy `remote-ollama-bridge/bridge.mjs` from the project folder over the existing bridge folder's `bridge.mjs`. Keep that existing folder's `certs/`, `.bridge-token`, and `start-bridge.sh`.
4. In that existing bridge folder, restart with `bash ./start-bridge.sh YOUR_CURRENT_FOCUSTUBE_EXTENSION_ID`. Use the current ID from your Mac.
5. Open FocusTube Options and test the connection. The updated bridge logs each request's route/status/time/model and output diagnostics (never token, prompt or generated text). For an Interest/Curiosity home feed, query expansion should happen before YouTube retrieval, followed by indexed candidate-ranking requests.

## A. On your friend's MacBook Air M4 (the server)

### 1. Install Ollama and download the model

Install [Ollama for Mac](https://ollama.com/download/mac) and [Node.js 18 or newer](https://nodejs.org/en/download) (the bridge uses Node’s built-in HTTPS server and `fetch`). Open Ollama, then run this in Terminal:

```sh
ollama pull qwen3:8b
curl http://127.0.0.1:11434/api/tags
```

The `curl` output should list `qwen3:8b`. Start with `qwen3:8b` for a typical 16 GB M4 Air. If the Mac has more memory and you want to experiment with a larger model, pull the model on that Mac first and use exactly the same model name in FocusTube Options.

### 2. Get the Mac's private Wi-Fi IP

```sh
ipconfig getifaddr en0
```

If that prints nothing, find the Wi-Fi IP in **System Settings → Network → Wi-Fi → Details**. It should be a private address such as `192.168.1.42`, `10.0.0.12`, or `172.16.0.8`. Both Macs must be on the same trusted network, and Wi-Fi client isolation must not block device-to-device traffic.

### 3. Generate an HTTPS certificate for that IP

From the extracted FocusTube folder, enter the bridge folder:

```sh
cd remote-ollama-bridge
bash ./generate-certs.sh 192.168.1.42
```

Replace the example address with your friend's actual private Wi-Fi IP. This creates a local certificate authority and a server certificate containing that IP. The private files remain on this Mac:

- `certs/ca.key` — private CA key; never share it.
- `certs/server.key` — private HTTPS server key; never share it.
- `certs/server.crt` — server certificate.
- `certs/ca.crt` — public CA certificate, which you will transfer to your own Mac in step B.

If you re-generate certificates later, replace the CA trust on your Mac as well. A changed Wi-Fi IP needs a new server certificate.

### 4. Get your FocusTube extension ID

On **your Mac**, open `brave://extensions`, find FocusTube, and copy the **ID** from its details. Send your friend only this 32-character ID. It is not a secret; the bridge uses it to restrict browser origins.

### 5. Start the bridge

Still in `remote-ollama-bridge` on your friend's Mac:

```sh
bash ./start-bridge.sh YOUR_FOCUSTUBE_EXTENSION_ID
```

The first run creates a random 64-character bearer token in `.bridge-token`, with file permissions restricted to the local user. Keep this terminal running. In another Terminal window in the same folder, display the token so you can copy it privately:

```sh
cat .bridge-token
```

Enter that token in FocusTube Options on your own Mac. Do not paste it into a chat, issue, or public repository. If macOS asks whether Node may accept incoming connections, allow it only for this trusted private network. Press **Ctrl+C** in the bridge terminal to stop the server.

Ollama itself must keep running on the friend Mac. The bridge forwards only to `http://127.0.0.1:11434`, so do **not** set `OLLAMA_HOST=0.0.0.0` and do **not** enable router port forwarding.

## B. On your Mac (Brave + FocusTube client)

### 1. Trust the friend's public CA certificate

Transfer **only** `certs/ca.crt` from the server Mac to your Mac, for example with AirDrop. Do not transfer `ca.key` or `server.key`.

Recommended GUI path: open **Keychain Access**, choose the **login** keychain, import `ca.crt`, then open the imported certificate and set **Trust → When using this certificate → Always Trust**. macOS may ask you to authenticate. Afterward, close/reopen Brave if TLS trust is not picked up immediately.

Alternatively, from Terminal in the folder containing `ca.crt`:

```sh
security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db ca.crt
```

Only trust the CA you and your friend generated for this connection.

### 2. Configure FocusTube

Open FocusTube Options and enter:

- **Remote HTTPS bridge URL:** `https://192.168.1.42:11435` — use your friend's actual IP.
- **Bridge token:** the contents of `.bridge-token` on the server Mac.
- **Ollama model:** `qwen3:8b`.

Click **Test remote Ollama connection**. Brave should ask to allow FocusTube to contact that exact bridge origin; approve it. The test checks that the bridge responds, the model is installed, and a small inference request succeeds.

Then open YouTube and try Interest and Curiosity. The bridge warms `qwen3:8b` at startup, but a new model load or large generation can still take longer. Ranking is done in compact six-video ranking requests for each 12-video page and saved per video/target/model so repeated feed refreshes may be faster. Query expansion is capped at 9 seconds; ranking requests are capped at 15 seconds, and the feed has a 45-second total budget. A timeout cancels the upstream request instead of leaving Ollama to finish a stale generation.

## If the connection test fails

- **Certificate / `ERR_CERT_AUTHORITY_INVALID`:** import and trust `ca.crt` on the client Mac; confirm the URL's IP matches the IP used to create the certificate.
- **Network error / timeout:** confirm both Macs are on the same trusted Wi-Fi, the friend Mac's IP is correct, the bridge terminal is still running, and the macOS firewall allows incoming Node connections on port `11435`.
- **401 / token rejected:** copy the full contents of `.bridge-token` again and check that the bridge was launched with the same token file.
- **403 / origin rejected:** rerun `./start-bridge.sh` with the ID currently shown for FocusTube at `brave://extensions` on your Mac.
- **Model not installed:** on the server Mac run `ollama pull qwen3:8b` and retry.
- **Nothing responds from YouTube HTML search:** that's separate from Ollama; check the YouTube connection or configure the optional YouTube Data API key in the Video search section.

If you change FocusTube's extracted directory and Brave generates a new extension ID, restart the bridge with the new ID. Keep the server and client on the same private network and never expose this listener to the public internet.
