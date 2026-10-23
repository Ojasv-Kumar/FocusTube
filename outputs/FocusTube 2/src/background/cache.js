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
    if (!this.storage) return false;
    const name = PREFIX + key;
    const row = { value, createdAt: this.now(), expiresAt: this.now() + ttlMs };
    try {
      await this.storage.set({ [name]: row });
      const all = await this.storage.get(null);
      const entries = Object.entries(all || {}).filter(([candidate, data]) => candidate.startsWith(PREFIX) && data?.createdAt);
      entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
      const remove = entries.slice(0, Math.max(0, entries.length - this.maxEntries)).map(([candidate]) => candidate);
      if (remove.length) await this.storage.remove(remove);
      return true;
    } catch {
      try {
        const all = await this.storage.get(null);
        const oldest = Object.entries(all || {}).filter(([candidate, data]) => candidate.startsWith(PREFIX) && data?.createdAt).sort((a,b)=>a[1].createdAt-b[1].createdAt)[0]?.[0];
        if (oldest) await this.storage.remove(oldest);
        await this.storage.set({ [name]: row });
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
