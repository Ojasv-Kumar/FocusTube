import { CONFIG } from "../config.js";
const PREFIX = "focustube.cache.";
export class Cache {
  constructor(storage = globalThis.chrome?.storage?.local, now = () => Date.now(), maxEntries = CONFIG.Cache.maxEntries) { this.storage = storage; this.now = now; this.maxEntries = maxEntries; }
  async get(key) {
    const name = PREFIX + key;
    try {
      const row = (await this.storage?.get(name))?.[name];
      if (!row) return null;
      if (row.expiresAt <= this.now()) { await this.storage.remove(name); return null; }
      return row.value;
    } catch { return null; }
  }
  async set(key, value, ttlMs) {
    return this.setMany([[key, value]], ttlMs);
  }
  async setMany(rowsInput, ttlMs) {
    if (!this.storage) return false;
    const rows = Object.fromEntries((rowsInput || []).filter(([key]) => typeof key === "string").map(([key, value]) => [PREFIX + key, { value, createdAt: this.now(), expiresAt: this.now() + ttlMs }]));
    const names = Object.keys(rows);
    if (!names.length) return true;
    try {
      await this.storage.set(rows);
      const all = await this.storage.get(null);
      const cacheEntries = Object.entries(all || {}).filter(([candidate, data]) => candidate.startsWith(PREFIX) && data?.createdAt);
      cacheEntries.sort((a, b) => a[1].createdAt - b[1].createdAt);
      const remove = cacheEntries.slice(0, Math.max(0, cacheEntries.length - this.maxEntries)).map(([candidate]) => candidate);
      if (remove.length) await this.storage.remove(remove);
      return true;
    } catch {
      try {
        const all = await this.storage.get(null);
        const existing = Object.entries(all || {}).filter(([candidate, data]) => candidate.startsWith(PREFIX) && data?.createdAt).sort((a,b)=>a[1].createdAt-b[1].createdAt);
        const excess = Math.max(1, existing.length + names.filter(name => !all?.[name]).length - this.maxEntries);
        const remove = existing.slice(0, excess).map(([candidate]) => candidate);
        if (remove.length) await this.storage.remove(remove);
        await this.storage.set(rows);
        return true;
      } catch { return false; }
    }
  }
  async clear() {
    if (!this.storage) return 0;
    const all = await this.storage.get(null);
    const keys = Object.keys(all || {}).filter(key => key.startsWith(PREFIX));
    if (keys.length) await this.storage.remove(keys);
    return keys.length;
  }
}
export function cacheKey(parts) { return encodeURIComponent(JSON.stringify(parts)); }
