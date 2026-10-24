import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, getSettings, validateSettings } from "../src/storage.js";

class MemoryArea { constructor(data = {}) { this.data = { ...data }; this.removed = []; } async get() { return { ...this.data }; } async set(values) { Object.assign(this.data, values); } async remove(keys) { for (const key of keys) { this.removed.push(key); delete this.data[key]; } } }

test("only Learn and Relax plus the three supported preferences are accepted", () => {
  const value = validateSettings({ activeMode: "curiosity", hideCommentsInLearn: true, hideSubscriptionsInLearn: false, theme: "light", geminiApiKeys: "secret", resultsPerSearch: 999 });
  assert.equal(value.activeMode, null);
  assert.equal(value.hideCommentsInLearn, true);
  assert.equal(value.hideSubscriptionsInLearn, false);
  assert.equal(value.theme, "light");
  assert.equal(value.resultsPerSearch, DEFAULT_SETTINGS.resultsPerSearch);
  assert.equal("geminiApiKeys" in value, false);
});

test("old provider keys and obsolete modes are removed from extension storage", async () => {
  const storage = new MemoryArea({ activeMode: "learn", youtubeApiKey: "yt-secret", geminiApiKeys: "gm-secret", interestText: "robotics", curiosityStrictness: "balanced" });
  const settings = await getSettings(storage);
  assert.equal(settings.activeMode, "learn");
  assert.equal("youtubeApiKey" in storage.data, false);
  assert.equal("geminiApiKeys" in storage.data, false);
  assert.equal("interestText" in storage.data, false);
  assert.ok(storage.removed.includes("youtubeApiKey"));
  assert.ok(storage.removed.includes("geminiApiKeys"));
});
