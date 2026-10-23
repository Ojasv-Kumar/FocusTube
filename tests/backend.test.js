import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createBackendServer, extractJson, validateConfig } from "../backend/server.mjs";

async function listen(server) { await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); return `http://127.0.0.1:${server.address().port}`; }
async function close(server) { await new Promise(resolve => server.close(resolve)); }
function upstream(handler) { return http.createServer(async (req, res) => { let raw=""; for await (const chunk of req) raw+=chunk; const result=await handler(req,raw); res.writeHead(result.status||200,{"content-type":"application/json",...(result.headers||{})}); res.end(JSON.stringify(result.body||{})); }); }
function config(overrides={}) { return { PORT:41731, GEMINI_API_KEYS:["secret-alpha","secret-beta"], GEMINI_FALLBACK_MODELS:[], GEMINI_FAST_MODEL:"fast-test", GEMINI_SMART_MODEL:"smart-test", GEMINI_TIMEOUT_MS:"400", OLLAMA_TIMEOUT_MS:"400", OLLAMA_URL:"http://127.0.0.1:9", OLLAMA_MODEL:"local-test", CACHE_TTL_SECONDS:"60", MAX_REQUESTS_PER_MINUTE:"100", ...overrides }; }
async function withBackend(opts, fn) {
  const backend=createBackendServer(opts); const root=await listen(backend.server);
  try { await fn({root,...backend}); } finally { await close(backend.server); }
}
async function post(root, body) { return fetch(`${root}/v1/generate`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}); }
const expansion={task:"expand",system:"Return JSON",user:"Query data: <query>linear algebra</query>",expectJson:true};
const judge={task:"judge",system:"Return JSON",user:"Rank",expectJson:true};

test("config validation requires explicit provider model names",()=>{
  assert.throws(()=>validateConfig(config({GEMINI_FAST_MODEL:""})),/GEMINI_FAST_MODEL/);
  assert.deepEqual(extractJson("```json\n{\"ok\":true,}\n```"),{ok:true});
});
test("Gemini rotates after a rate limited key and cooldown expires",async()=>{
  let now=1000; const seen=[]; let first=true;
  const fake=upstream(req=>{seen.push(req.headers["x-goog-api-key"]);if(first){first=false;return{status:429,headers:{"retry-after":"1"},body:{error:{status:"RESOURCE_EXHAUSTED"}}};}return{body:{candidates:[{content:{parts:[{text:'{"videos":[]}'}]}}]}};});
  const url=await listen(fake);
  try { await withBackend({config:config({GEMINI_URL:`${url}/v1beta/models`}),fetchImpl:fetch,now:()=>now,logger:{info(){}}},async({generate,keyStates})=>{
    const result=await generate(judge);assert.equal(result.provider,"gemini");assert.deepEqual(seen,["secret-alpha","secret-beta"]);assert.equal(keyStates[0].cooldownUntil,2000);
    now=2001;first=true;seen.length=0;await generate({...judge,user:"second request"});assert.deepEqual(seen,["secret-alpha","secret-beta"]);assert.equal(keyStates[0].cooldownUntil,3001);
  }); } finally { await close(fake); }
});
test("401 disables a Gemini key for this backend session",async()=>{
  const seen=[];const fake=upstream(req=>{seen.push(req.headers["x-goog-api-key"]);return seen.length===1?{status:401,body:{}}:{body:{candidates:[{content:{parts:[{text:'{"ok":true}'}]}}]}};});const url=await listen(fake);
  try { await withBackend({config:config({GEMINI_URL:`${url}/v1beta/models`}),logger:{info(){}}},async({generate,keyStates})=>{const out=await generate(judge);assert.equal(out.provider,"gemini");assert.equal(keyStates[0].disabled,true);assert.deepEqual(seen,["secret-alpha","secret-beta"]);}); } finally { await close(fake); }
});
test("Ollama failure falls back through Gemini then deterministic expansion",async()=>{
  await withBackend({config:config({GEMINI_API_KEYS:[]}),fetchImpl:async()=>{throw Error("offline");},logger:{info(){}}},async({generate})=>{const out=await generate(expansion);assert.equal(out.provider,"deterministic");assert.equal(out.json.queries[0],"linear algebra");assert.equal(out.usedFallback,true);});
});
test("Ollama failure uses Gemini fast before deterministic expansion",async()=>{
  const fake=upstream(()=>({body:{candidates:[{content:{parts:[{text:'{"queries":["linear algebra","linear algebra intuition"]}'}]}}]}}));const url=await listen(fake);
  try { await withBackend({config:config({GEMINI_URL:`${url}/v1beta/models`}),logger:{info(){}}},async({generate})=>{const out=await generate(expansion);assert.equal(out.provider,"gemini");assert.equal(out.usedFallback,true);assert.equal(out.json.queries.length,2);}); } finally { await close(fake); }
});
test("invalid Gemini JSON is repaired once and request results are cached",async()=>{
  let calls=0;const fake=upstream(()=>{calls++;return{body:{candidates:[{content:{parts:[{text:calls===1?"not-json":'{"videos":[]}'}]}}]}};});const url=await listen(fake);
  try { await withBackend({config:config({GEMINI_URL:`${url}/v1beta/models`}),logger:{info(){}}},async({generate})=>{const first=await generate(judge);assert.equal(first.json.videos.length,0);assert.equal(calls,2);const second=await generate(judge);assert.equal(second.cacheHit,true);assert.equal(calls,2);}); } finally { await close(fake); }
});
test("health never exposes keys and HTTP rejects oversized bodies",async()=>{
  const lines=[];await withBackend({config:config({GEMINI_API_KEYS:["private-key-value"]}),fetchImpl:async()=>{throw Error("offline");},logger:{info:s=>lines.push(s)}},async({root})=>{
    const health=await (await fetch(`${root}/health`)).json();assert.deepEqual(health.geminiKeys,{configured:1,available:1});assert.equal(JSON.stringify(health).includes("private-key-value"),false);
    assert.equal(health.youtubeRetrievalProxy,1);
    const smoke=await fetch(`${root}/v1/generate`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(expansion)});const generated=await smoke.json();assert.equal(smoke.status,200);assert.equal(generated.provider,"deterministic");
    const large=await fetch(`${root}/v1/generate`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({x:"a".repeat(70_000)})});assert.equal(large.status,413);
  });assert.equal(lines.some(line=>line.includes("private-key-value")),false);
});
test("local backend proxies YouTube HTML and Data API requests without logging API keys",async()=>{
  const seen=[];
  const fetchImpl=async(url,options={})=>{
    seen.push({url:String(url),key:options.headers?.["x-goog-api-key"]});
    if(String(url).includes("youtube.com/results")) return {status:200,headers:new Headers(),text:async()=>"youtube-search-html"};
    const data=String(url).includes("/search?")
      ? {items:[{id:{videoId:"video-123"},snippet:{title:"Robotics"}}]}
      : {items:[{id:"video-123",contentDetails:{duration:"PT5M"}}]};
    return {status:200,headers:new Headers(),json:async()=>data};
  };
  await withBackend({config:config(),fetchImpl,logger:{info(){}}},async({root})=>{
    const preflight=await fetch(`${root}/v1/youtube/html`,{method:"OPTIONS",headers:{origin:"chrome-extension://test-extension", "access-control-request-method":"POST", "access-control-request-headers":"content-type", "access-control-request-private-network":"true"}});
    assert.equal(preflight.status,204);assert.equal(preflight.headers.get("access-control-allow-origin"),"chrome-extension://test-extension");assert.equal(preflight.headers.get("access-control-allow-private-network"),"true");
    const html=await fetch(`${root}/v1/youtube/html`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({query:"robotics"})});
    const htmlData=await html.json();assert.equal(htmlData.ok,true);assert.equal(htmlData.html,"youtube-search-html");
    const api=await fetch(`${root}/v1/youtube/api`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"search",query:"robotics",maxResults:8,apiKey:"private-youtube-key"})});
    const apiData=await api.json();assert.equal(apiData.status,200);assert.equal(apiData.data.items[0].id.videoId,"video-123");
    assert.equal(seen.some(item=>item.key==="private-youtube-key"),true);
    assert.equal(JSON.stringify(apiData).includes("private-youtube-key"),false);
  });
});
