// Usage: node test/caller.mjs /absolute/career-ops-root
// Real loader and guarded HTTP, with deterministic transport responses.
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { research } from '../research.mjs';

const upstream = path.resolve(process.argv[2]);
const { runHook, loadPlugins } = await import(pathToFileURL(path.join(upstream, 'plugins/_engine.mjs')).href);
const scratch = mkdtempSync(path.join(tmpdir(), 'parallel-caller-'));
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(path.join(scratch, 'plugins.local'), {recursive:true});
mkdirSync(path.join(scratch, 'config'));
cpSync(source, path.join(scratch, 'plugins.local/parallel'), {recursive:true,filter:p=>!p.includes('/.git')});
// The helper resolves engine/data-root through the chosen Career Ops root.
// Use the real checkout root for discovery; the local fixture copy isolates gates.
symlinkSync(path.join(upstream, 'plugins'), path.join(scratch, 'plugins'), 'dir');
symlinkSync(path.join(upstream, 'path-resolver.mjs'), path.join(scratch, 'path-resolver.mjs'));
const calls = [];
const originalFetch = globalThis.fetch;
let mode = 'ok';
globalThis.fetch = async (url, opts) => {
 assert.equal(url, 'https://search.parallel.ai/mcp');
 assert.equal(opts.headers['User-Agent'], 'career-ops-plugin-parallel/0.1.0');
 assert(opts.signal instanceof AbortSignal);
 const r = JSON.parse(opts.body); calls.push(r);
 if (mode === 'error') throw new Error('network failure');
 if (mode === 'timeout') return new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(new DOMException('request timed out','AbortError')),{once:true}));
 const result = r.method==='initialize'?{protocolVersion:'2025-03-26'}:r.method==='tools/list'?{tools:[{name:'web_search'},{name:'web_fetch'}]}:{content:[{type:'text',text:JSON.stringify({results:[{title:'Public engineering role',url:'https://example.com/jobs/1'}]})}]};
 return new Response(JSON.stringify({jsonrpc:'2.0',id:r.id,result}),{headers:{'content-type':'application/json'}});
};
try {
 assert.deepEqual(await loadPlugins('search',{root:scratch,pluginId:'parallel'}),[]);
 assert.equal(calls.length,0);
 writeFileSync(path.join(scratch,'config/plugins.yml'),'plugins:\n  parallel:\n    enabled: true\n');
 const result=await runHook('search','public engineering role',{root:scratch,pluginId:'parallel'});
 assert.equal(result[0].ok,true);
 assert.equal(result[0].result[0].url,'https://example.com/jobs/1');
 assert(!existsSync(path.join(scratch,'data/pipeline.md')));
 const [loaded]=await loadPlugins('search',{root:scratch,pluginId:'parallel'});
 await assert.rejects(loaded.ctx.fetch('https://example.com/private'),/allowedHosts/);
 mode='error';
 const failed=await runHook('search','public engineering role',{root:scratch,pluginId:'parallel'});
 assert.equal(failed[0].ok,false);
 mode='timeout';
 const timed=await runHook('search','public engineering role',{root:scratch,pluginId:'parallel',timeoutMs:20000});
 assert.equal(timed[0].ok,false);
 assert.match(timed[0].error,/timed out/);
 mode='ok';
 // Exercise production grouping and source consumption through research().
 const oldRoot=process.env.CAREER_OPS_ROOT;
 process.env.CAREER_OPS_ROOT=scratch;
 try {
   const output=await research(scratch,['public compensation','public company']);
   assert.equal(output.completed,true);
   assert.equal(output.results.length,2);
   assert.match(output.results[0].result.content[0].text,/example.com/);
   const latest=calls.filter(r=>r.method==='tools/call').slice(-2);
   assert.equal(latest[0].params.arguments.session_id,latest[1].params.arguments.session_id);
 } finally {if(oldRoot===undefined)delete process.env.CAREER_OPS_ROOT;else process.env.CAREER_OPS_ROOT=oldRoot;}
 console.log(JSON.stringify({passed:true,requestObserved:true,userAgent:'career-ops-plugin-parallel/0.1.0',loaderVerified:true,disabledPreserved:true,guardedEgress:true,resultConsumed:true,timeoutVerified:true,requestCount:calls.length}));
} finally {globalThis.fetch=originalFetch;}
