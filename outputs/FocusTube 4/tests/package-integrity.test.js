import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]);
}

test("manifest targets and local JavaScript imports exist", () => {
  const targets = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_ui.page,
    ...manifest.content_scripts.flatMap(item => [...(item.js || []), ...(item.css || [])])];
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
  const covers = path => resources.some(pattern => {
    const glob = pattern.split("*").map(part => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")).join(".*");
    const expression = new RegExp(`^${glob}$`);
    return expression.test(path);
  });
  const entryNames = new Set(manifest.content_scripts.flatMap(item => item.js || []));
  const sourceFiles = [...entryNames].map(path => join(root, path)).filter(path => path.endsWith(".js"));
  for (const file of sourceFiles) {
    const source = readFileSync(file, "utf8");
    const imports = [...source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)].map(match => match[1]);
    for (const importPath of imports) {
      const target = resolve(dirname(file), importPath);
      const packagedPath = target.slice(root.length + 1).replaceAll("\\", "/");
      assert.ok(covers(packagedPath), `Content script dependency is not web accessible: ${packagedPath}`);
    }
  }
});

test("packaged JSON is valid and the extension has no unsafe HTML execution APIs", () => {
  const dataFiles = [...(existsSync(join(root, "data")) ? walk(join(root, "data")) : []), ...walk(join(root, "src"))].filter(path => path.endsWith(".json"));
  for (const file of dataFiles) assert.doesNotThrow(() => JSON.parse(readFileSync(file, "utf8")), `Invalid JSON: ${file}`);
  const sourceFiles = walk(join(root, "src")).filter(path => path.endsWith(".js"));
  for (const file of sourceFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\binnerHTML\b|\beval\s*\(|\bnew\s+Function\s*\(/, `Unsafe code pattern in ${file}`);
  }
});

test("extension only requests YouTube access and supports the two selected modes", () => {
  assert.ok(manifest.host_permissions.includes("https://www.youtube.com/*"));
  assert.equal(manifest.host_permissions.length, 1);
  assert.equal(manifest.optional_host_permissions, undefined);
  assert.ok(manifest.permissions.includes("scripting"));
  assert.match(readFileSync(join(root, "src/background/retrieval/youtube-tab-fetch.js"), "utf8"), /world: "MAIN"/);
  const bundled = readFileSync(join(root, "src/content/focustube.bundle.js"), "utf8");
  assert.doesNotMatch(bundled, /generativelanguage\.googleapis\.com|www\.googleapis\.com|Interest|Curiosity/);
  assert.match(bundled, /LOCAL FILTERING/);
});
