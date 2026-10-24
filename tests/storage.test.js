import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, getSettings, validateSettings } from "../src/storage.js";
class MemoryArea { constructor(data={}){this.data={...data};this.removed=[];} async get(){return {...this.data};} async set(values){Object.assign(this.data,values);} async remove(keys){for(const key of keys){this.removed.push(key);delete this.data[key];}} }

test("settings validation clamps invalid values back to safe defaults",()=>{
  const value=validateSettings({activeMode:"unknown",interestText:"  robotics  ",resultsPerSearch:7,curiosityStrictness:"extreme",density:"wide",hideShortsInLearn:false});
  assert.equal(value.activeMode,null);assert.equal(value.interestText,"robotics");assert.equal(value.resultsPerSearch,DEFAULT_SETTINGS.resultsPerSearch);assert.equal(value.curiosityStrictness,"balanced");assert.equal(value.density,"comfortable");assert.equal(value.hideShortsInLearn,false);
});

test("Ollama defaults use Qwen3 8B and reject non-HTTPS, public, or non-bridge endpoints",()=>{
  assert.equal(DEFAULT_SETTINGS.ollamaModel,"qwen3:8b");
  assert.equal(validateSettings({}).ollamaEndpoint, "");
  assert.equal(validateSettings({ollamaEndpoint:"http://192.168.1.42:11435"}).ollamaEndpoint, "");
  assert.equal(validateSettings({ollamaEndpoint:"https://8.8.8.8:11435"}).ollamaEndpoint, "");
  assert.equal(validateSettings({ollamaEndpoint:"https://192.168.1.42:11434"}).ollamaEndpoint, "");
  assert.equal(validateSettings({ollamaEndpoint:"https://192.168.1.42:11435/"}).ollamaEndpoint, "https://192.168.1.42:11435");
  assert.equal(validateSettings({ollamaModel:"bad model name"}).ollamaModel, "qwen3:8b");
});

test("migration removes old cloud-provider credentials and keeps YouTube retrieval settings",async()=>{
  const storage=new MemoryArea({activeMode:"learn",llmApiKey:"old-secret",youtubeApiKey:"saved-key",llmBaseUrl:"https://old.invalid",fastModel:"old",smartModel:"old",geminiApiKeys:"old-gemini-secret",geminiFastModel:"old-model",groqApiKey:"old-groq-secret",openrouterApiKey:"old-openrouter-secret",openrouterFallbackModels:"old",retrievalProvider:"api",interestText:"robotics"});
  const settings=await getSettings(storage);
  assert.equal(settings.activeMode,"learn");assert.equal(settings.interestText,"robotics");assert.equal(settings.youtubeApiKey,"saved-key");assert.equal(settings.retrievalProvider,"api");
  for (const key of ["llmApiKey","llmBaseUrl","fastModel","smartModel","geminiApiKeys","geminiFastModel","groqApiKey","openrouterApiKey","openrouterFallbackModels"]) assert.equal(key in settings,false);
  assert.ok(storage.removed.includes("openrouterApiKey"));
});

test("private bridge token is trimmed and bounded",()=>{
  const value=validateSettings({ollamaToken:`  ${"x".repeat(300)}  `});
  assert.equal(value.ollamaToken.length,256);
});
