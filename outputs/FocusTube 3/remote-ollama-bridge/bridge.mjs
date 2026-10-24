#!/usr/bin/env node
import https from 'node:https';
import fs from 'node:fs';
import net from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.FOCUSTUBE_BRIDGE_PORT || 11435);
const TOKEN = String(process.env.FOCUSTUBE_OLLAMA_TOKEN || '').trim();
const EXTENSION_ID = String(process.env.FOCUSTUBE_EXTENSION_ID || '').trim();
const CERT = process.env.FOCUSTUBE_TLS_CERT || path.join(here, 'certs', 'server.crt');
const KEY = process.env.FOCUSTUBE_TLS_KEY || path.join(here, 'certs', 'server.key');
const UPSTREAM = 'http://127.0.0.1:11434';
const MAX_BODY_BYTES = 800_000;
const CLIENT_TIMEOUT_MS = 45_000;
const WARM_MODEL = String(process.env.FOCUSTUBE_OLLAMA_MODEL || 'qwen3:8b').trim();

function fail(message) { console.error(`[FocusTube bridge] ${message}`); process.exit(1); }
if (!/^[0-9a-f]{64}$/i.test(TOKEN)) fail('FOCUSTUBE_OLLAMA_TOKEN must be a 64-character hex token. Generate one with: openssl rand -hex 32');
if (!/^[a-p]{32}$/.test(EXTENSION_ID)) fail('FOCUSTUBE_EXTENSION_ID must be the 32-character extension ID shown at brave://extensions.');
if (!fs.existsSync(CERT) || !fs.existsSync(KEY)) fail('TLS certificate/key not found. Run bash ./generate-certs.sh <friend-Mac-private-IPv4> first.');
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) fail('FOCUSTUBE_BRIDGE_PORT must be a port from 1024 to 65535.');

const expectedOrigin = `chrome-extension://${EXTENSION_ID}`;
const tokenBytes = Buffer.from(TOKEN, 'utf8');
function isPrivateIPv4(value) {
  const address = String(value || '').replace(/^::ffff:/i, '');
  if (net.isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
function authMatches(header) {
  const match = /^Bearer\s+(.+)$/i.exec(String(header || ''));
  if (!match) return false;
  const candidate = Buffer.from(match[1], 'utf8');
  return candidate.length === tokenBytes.length && timingSafeEqual(candidate, tokenBytes);
}
function send(res, status, data, origin = expectedOrigin) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'vary': 'Origin',
    'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}
function safeModelName(value) { return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(value); }

const server = https.createServer({ key: fs.readFileSync(KEY), cert: fs.readFileSync(CERT), minVersion: 'TLSv1.2' }, async (req, res) => {
  const startedAt = Date.now();
  const remoteAddress = String(req.socket.remoteAddress || '').replace(/^::ffff:/i, '');
  const origin = String(req.headers.origin || '');
  const pathname = new URL(req.url || '/', 'https://bridge.invalid').pathname;
  let modelName = '';
  let inferenceSummary = '';
  let logged = false;
  let upstreamController = null;
  let clientDisconnected = false;
  res.on('close', () => {
    if (!res.writableEnded && upstreamController) {
      clientDisconnected = true;
      upstreamController.abort();
      console.log(`[FocusTube bridge] Client disconnected; cancelled ${req.method} ${pathname} after ${Date.now() - startedAt}ms from ${remoteAddress}.`);
    }
  });
  const logResult = status => {
    if (logged) return;
    logged = true;
    res.once('finish', () => {
      // Never log bearer tokens, prompts, video metadata, or model responses.
      const modelLabel = modelName ? ` model=${modelName}` : '';
      const inferenceLabel = req.method === 'POST' && pathname === '/api/chat' && inferenceSummary ? ` ${inferenceSummary}` : '';
      console.log(`[FocusTube bridge] ${req.method} ${pathname} -> HTTP ${status} in ${Date.now() - startedAt}ms from ${remoteAddress}; origin=${origin || '(missing)'}${modelLabel}${inferenceLabel}`);
    });
  };
  const reply = (status, payload, corsOrigin = expectedOrigin) => {
    logResult(status);
    return send(res, status, payload, corsOrigin);
  };

  if (!isPrivateIPv4(remoteAddress)) return reply(403, { error: 'Clients must be on a private IPv4 LAN.' });
  // Browser fetches from extension service workers may omit Origin on the actual GET.
  // A present Origin must match exactly; OPTIONS preflight always requires the exact origin.
  if ((origin && origin !== expectedOrigin) || (!origin && req.method === 'OPTIONS')) return reply(403, { error: 'Origin not allowed.' });
  if (req.method === 'OPTIONS') {
    logResult(204);
    res.writeHead(204, {
      'access-control-allow-origin': expectedOrigin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '600',
      'vary': 'Origin'
    });
    return res.end();
  }
  // With a missing Origin header, the high-entropy token is still required.
  if (!authMatches(req.headers.authorization)) return reply(401, { error: 'Invalid bridge token.' });
  if (pathname === '/health' && req.method === 'GET') return reply(200, { ok: true, service: 'focustube-ollama-bridge' });
  if (pathname !== '/api/tags' && pathname !== '/api/chat') return reply(404, { error: 'Only /api/tags and /api/chat are exposed.' });
  if (pathname === '/api/tags' && req.method !== 'GET') return reply(405, { error: 'Use GET for /api/tags.' });
  if (pathname === '/api/chat' && req.method !== 'POST') return reply(405, { error: 'Use POST for /api/chat.' });

  let body;
  if (pathname === '/api/chat') {
    try { body = await readBody(req); }
    catch (error) { return reply(error.status || 400, { error: error.message }); }
    if (!safeModelName(body?.model) || !Array.isArray(body?.messages) || body.messages.length < 1 || body.messages.length > 8 || body.messages.some(message => !['system', 'user', 'assistant'].includes(message?.role) || typeof message?.content !== 'string' || message.content.length > 250_000)) {
      return reply(400, { error: 'Invalid chat payload.' });
    }
    modelName = body.model;
    // Do not permit caller-controlled streaming or tools; only bounded chat inference is exposed.
    const suppliedFormat = body.format === 'json' ? 'json'
      : body.format && typeof body.format === 'object' && JSON.stringify(body.format).length <= 16_000 ? body.format
        : undefined;
    const rawKeepAlive = String(body.keep_alive || '30m');
    const keepAlive = /^([1-9][0-9]?)(s|m|h)$/.test(rawKeepAlive) ? rawKeepAlive : '30m';
    body = {
      model: body.model,
      messages: body.messages,
      stream: false,
      keep_alive: keepAlive,
      ...(suppliedFormat ? { format: suppliedFormat } : {}),
      ...(body.think === false ? { think: false } : {}),
      options: {
        temperature: Number.isFinite(body?.options?.temperature) ? Math.max(0, Math.min(1, body.options.temperature)) : 0.1,
        top_p: Number.isFinite(body?.options?.top_p) ? Math.max(0.01, Math.min(1, body.options.top_p)) : 0.9,
        seed: Number.isInteger(body?.options?.seed) ? Math.max(0, Math.min(2_147_483_647, body.options.seed)) : 42,
        num_ctx: Number.isInteger(body?.options?.num_ctx) ? Math.max(1024, Math.min(8192, body.options.num_ctx)) : 8192,
        num_predict: Number.isInteger(body?.options?.num_predict) ? Math.max(16, Math.min(2048, body.options.num_predict)) : 800
      }
    };
  }

  const controller = new AbortController();
  upstreamController = controller;
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${UPSTREAM}${pathname}`, {
      method: pathname === '/api/tags' ? 'GET' : 'POST',
      ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      signal: controller.signal
    });
    const text = await upstream.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = { error: 'Ollama returned a non-JSON response.' }; }
    if (pathname === '/api/chat') {
      const visibleLength = String(payload?.message?.content || '').length;
      const thinkingLength = String(payload?.message?.thinking || '').length;
      const doneReason = String(payload?.done_reason || 'unknown').slice(0, 32);
      const evalCount = Number.isFinite(payload?.eval_count) ? payload.eval_count : 'n/a';
      inferenceSummary = `contentChars=${visibleLength} thinkingChars=${thinkingLength} done=${doneReason} evalTokens=${evalCount}`;
      if (upstream.ok && visibleLength === 0) console.warn(`[FocusTube bridge] Ollama returned HTTP 200 with empty visible content; done=${doneReason}, thinkingChars=${thinkingLength}. Check num_predict/schema and retry.`);
    }
    return reply(upstream.status, payload);
  } catch (error) {
    if (clientDisconnected || res.destroyed || res.writableEnded) return;
    const status = error?.name === 'AbortError' ? 504 : 502;
    return reply(status, { error: status === 504 ? 'Ollama request timed out.' : 'Cannot reach Ollama at 127.0.0.1:11434. Start Ollama on this Mac first.' });
  } finally { clearTimeout(timer); }
});
server.requestTimeout = CLIENT_TIMEOUT_MS;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
async function warmModel() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(`${UPSTREAM}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ model: WARM_MODEL, messages: [{ role: 'user', content: 'Return the word READY.' }], stream: false, think: false, keep_alive: '30m', options: { temperature: 0, top_p: 0.9, seed: 42, num_ctx: 8192, num_predict: 1 } })
    });
    if (!response.ok) console.warn(`[FocusTube bridge] Model warm-up returned HTTP ${response.status}. Check that ${WARM_MODEL} is installed.`);
    else console.log(`[FocusTube bridge] Model warm-up request sent for ${WARM_MODEL}; the first response may take a little longer while it loads.`);
  } catch (error) {
    console.warn(`[FocusTube bridge] Could not pre-warm ${WARM_MODEL}; the first request will load it on demand (${error?.name || 'network error'}).`);
  } finally { clearTimeout(timer); }
}
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[FocusTube bridge] HTTPS listening on 0.0.0.0:${PORT}`);
  console.log(`[FocusTube bridge] Only ${expectedOrigin} is allowed; clients must use a private LAN IPv4 address.`);
  console.log('[FocusTube bridge] Ollama remains bound to localhost; do not add router port forwarding.');
  console.log('[FocusTube bridge] Request logs include timing and token counts only; prompts and outputs are never logged.');
  void warmModel();
});
server.on('error', error => fail(`Could not listen: ${error.message}`));
