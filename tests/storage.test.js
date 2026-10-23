import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, getSettings, validateSettings } from "../src/storage.js";

class MemoryArea { constructor(data={}){this.data={...data};this.removed=[];} async get(){return {...this.data};} async set(values){Object.assign(this.data,values);} async remove(keys){for(const key of keys){this.removed.push(key);delete this.data[key];}} }

test("settings validation clamps invalid values back to safe defaults",()=>{
  const value=validateSettings({activeMode:"unknown",interestText:"  robotics  ",resultsPerSearch:7,curiosityStrictness:"extreme",density:"wide",hideShortsInLearn:false});
  assert.equal(value.activeMode,null);assert.equal(value.interestText,"robotics");assert.equal(value.resultsPerSearch,DEFAULT_SETTINGS.resultsPerSearch);assert.equal(value.curiosityStrictness,"balanced");assert.equal(value.density,"comfortable");assert.equal(value.hideShortsInLearn,false);
});
test("legacy provider and API key fields are removed during migration",async()=>{
  const storage=new MemoryArea({activeMode:"learn",llmApiKey:"old-secret",youtubeApiKey:"old-key",llmBaseUrl:"https://old.invalid",fastModel:"old",smartModel:"old",retrievalProvider:"api",interestText:"robotics"});
  const settings=await getSettings(storage);assert.equal(settings.activeMode,"learn");assert.equal(settings.interestText,"robotics");assert.equal("llmApiKey" in settings,false);assert.deepEqual(storage.removed,["llmApiKey","youtubeApiKey","llmBaseUrl","fastModel","smartModel","retrievalProvider"]);
});
