import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
function walk(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]); }

test("manifest targets and local JavaScript imports exist", () => {
  const targets = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_ui.page, ...manifest.content_scripts.flatMap(item => [...(item.js || []), ...(item.css || [])])];
  for (const target of targets) assert.ok(existsSync(join(root, target)), `Missing manifest target: ${target}`);
  const sourceFiles = walk(join(root, "src")).filter(path => path.endsWith(".js"));
  for (const file of sourceFiles) {
    const source = readFileSync(file, "utf8");
    const imports = [...source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)].map(match => match[1]);
    for (const importPath of imports) assert.ok(existsSync(resolve(dirname(file), importPath)), `${file} imports missing ${importPath}`);
  }
});

test("content-script module imports are exposed as web-accessible resources", () => {
  const resources = (manifest.web_accessible_resources || []).flatMap(item => item.resources || []);
  const covers = path => resources.some(pattern => new RegExp(`^${pattern.split("*").map(part => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")).join(".*")}$`).test(path));
  const entryNames = new Set(manifest.content_scripts.flatMap(item => item.js || []));
  for (const file of [...entryNames].map(path => join(root, path)).filter(path => path.endsWith(".js"))) {
    const source = readFileSync(file, "utf8");
    const imports = [...source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)].map(match => match[1]);
    for (const importPath of imports) {
      const target = resolve(dirname(file), importPath).slice(root.length + 1).replaceAll("\\", "/");
      assert.ok(covers(target), `Content script dependency is not web accessible: ${target}`);
    }
  }
});

test("packaged JSON is valid and the extension has no unsafe HTML execution APIs", () => {
  for (const file of [...walk(join(root, "data")), ...walk(join(root, "src"))].filter(path => path.endsWith(".json"))) assert.doesNotThrow(() => JSON.parse(readFileSync(file, "utf8")), `Invalid JSON: ${file}`);
  for (const file of walk(join(root, "src")).filter(path => path.endsWith(".js"))) assert.doesNotMatch(readFileSync(file, "utf8"), /\binnerHTML\b|\beval\s*\(|\bnew\s+Function\s*\(/, `Unsafe code pattern in ${file}`);
});

test("extension permissions keep AI access optional and limit it to the exact HTTPS bridge at runtime", () => {
  assert.ok(manifest.host_permissions.includes("https://www.googleapis.com/*"));
  assert.ok(manifest.host_permissions.includes("https://www.youtube.com/*"));
  assert.deepEqual(manifest.optional_host_permissions, ["https://*/*"]);
  assert.equal(manifest.host_permissions.some(x => /openrouter|groq|gemini|ollama/i.test(x)), false);
  assert.ok(manifest.permissions.includes("scripting"));
  assert.match(readFileSync(join(root, "src/content/focustube.bundle.js"), "utf8"), /function runModeDomCleanup\(\)/);
  assert.match(readFileSync(join(root, "src/content/focustube.bundle.js"), "utf8"), /function setNativeSearchResultsHidden\(hidden\)/);
  assert.match(readFileSync(join(root, "remote-ollama-bridge/bridge.mjs"), "utf8"), /Client disconnected; cancelled/);
  assert.match(readFileSync(join(root, "src/options/options.js"), "utf8"), /chrome\.permissions\.request\(\{ origins:\[pattern\] \}/);
  assert.match(readFileSync(join(root, "src/background/retrieval/youtube-tab-fetch.js"), "utf8"), /world: "MAIN"/);
  assert.match(readFileSync(join(root, "src/background/llm-client.js"), "utf8"), /globalThis\.fetch\(\.\.\.args\)/);
  assert.match(readFileSync(join(root, "src/background/retrieval/index.js"), "utf8"), /hasApiKey \? \["api", "html"\]/);
  assert.match(readFileSync(join(root, "src/content/focustube.bundle.js"), "utf8"), /Find up to \${nextCount} more videos/);
});

test("v1.5.1 release has no cloud AI endpoint or provider fallback", () => {
  assert.equal(manifest.version, "1.5.1");
  const activeFiles = [...walk(join(root, "src")), join(root, "manifest.json")].filter(path => /\.(js|html|json)$/.test(path));
  for (const file of activeFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /openrouter\.ai|api\.groq\.com|generativelanguage\.googleapis\.com/i, `Unexpected cloud AI endpoint in ${file}`);
  }
  const config = readFileSync(join(root, "src/config.js"), "utf8");
  const llmClient = readFileSync(join(root, "src/background/llm-client.js"), "utf8");
  assert.match(config, /defaultModel: "qwen3:8b"/);
  assert.match(llmClient, /\/api\/chat/);
  assert.match(llmClient, /OLLAMA_JSON_OUTPUT_FAILED/);
  assert.match(llmClient, /authorization: `Bearer \$\{this\.settings\.ollamaToken\.trim\(\)\}`/);
  assert.match(readFileSync(join(root, "remote-ollama-bridge/bridge.mjs"), "utf8"), /Only \/api\/tags and \/api\/chat are exposed/);
  assert.match(readFileSync(join(root, "remote-ollama-bridge/bridge.mjs"), "utf8"), /Origin not allowed/);
  assert.match(readFileSync(join(root, "remote-ollama-bridge/bridge.mjs"), "utf8"), /Request logs include timing and token counts only/);
  assert.match(readFileSync(join(root, "remote-ollama-bridge/bridge.mjs"), "utf8"), /origin && origin !== expectedOrigin/);
  assert.match(readFileSync(join(root, "src/background/pipeline.js"), "utf8"), /INTEREST_EXPANSION/);
  assert.match(readFileSync(join(root, "src/background/pipeline.js"), "utf8"), /numPredict: 800|rankOutputBudget/);
  assert.match(readFileSync(join(root, "src/background/pipeline.js"), "utf8"), /CURIOSITY_EXPANSION/);
  assert.match(readFileSync(join(root, "src/background/service-worker.js"), "utf8"), /received pipeline request/);
  assert.match(readFileSync(join(root, "src/content/focustube.bundle.js"), "utf8"), /PIPELINE_PROGRESS/);
  assert.doesNotMatch(readFileSync(join(root, "manifest.json"), "utf8"), /openrouter\.ai|localhost|127\.0\.0\.1/);
});

test("50-video pagination and long-running connection checks remain bounded", () => {
  const bundle = readFileSync(join(root, "src/content/focustube.bundle.js"), "utf8");
  const messenger = readFileSync(join(root, "src/messages.js"), "utf8");
  const options = readFileSync(join(root, "src/options/options.js"), "utf8");
  assert.match(bundle, /Find up to \${nextCount} more videos/);
  assert.match(bundle, /homePage = page/);
  assert.match(messenger, /REQUEST_TIMEOUT/);
  assert.match(messenger, /60_000/);
  assert.doesNotMatch(messenger, /150_000/);
  assert.match(options, /65_000/);
  assert.doesNotMatch(options, /150_000/);
  assert.match(readFileSync(join(root, "src/config.js"), "utf8"), /maxVideosShown: 50/);
  assert.match(readFileSync(join(root, "src/config.js"), "utf8"), /feedBatchSize: 12/);
  assert.match(readFileSync(join(root, "src/content/home-ui.js"), "utf8"), /Find up to \${nextCount} more videos/);
});

test("active content bundle uses fast 1.5.1 settings and restores Learn UI after YouTube shadow-DOM rerenders", () => {
  const bundle = readFileSync(join(root, "src/content/focustube.bundle.js"), "utf8");
  assert.match(bundle, /expansionTimeoutMs: 9_000/);
  assert.match(bundle, /maxCandidatePoolSize: 12/);
  assert.match(bundle, /totalTimeoutMs: 45_000/);
  assert.match(bundle, /curiosityQueriesPerFeed: 6/);
  assert.match(bundle, /curiosityAreas: \[/);
  assert.match(bundle, /function observeOpenShadowRoots\(root\)/);
  assert.match(bundle, /function reattachLearnPanels\(\)/);
  assert.ok(bundle.includes("[data-focustube-shorts-hidden=\'true\']"), "Shorts ancestor markers should be restored on mode exit");
  assert.ok(bundle.includes("yt-chip-cloud-chip-renderer"), "the Shorts filter chip should be hidden in Learn mode");
  assert.match(bundle, /createLearnSearch\(\{ query, anchor: masthead/);
  assert.doesNotMatch(bundle, /maxCandidatePoolSize: 50/);
  assert.doesNotMatch(bundle, /expansionTimeoutMs: 30e3/);
});
