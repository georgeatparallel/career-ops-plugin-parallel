import assert from 'node:assert';
import plugin, { createResearchRun, searchResults } from '../index.mjs';

const observed = [];
let failure;
const ctx = { fetch: async (url, opts) => {
  assert.equal(url, 'https://search.parallel.ai/mcp');
  assert.equal(opts.headers['User-Agent'], 'career-ops-plugin-parallel/0.1.0');
  assert.equal(opts.timeoutMs, 15000);
  const request = JSON.parse(opts.body);
  observed.push(request);
  if (failure && request.method === 'tools/call') {
    const error = failure; failure = null; throw error;
  }
  let result = {};
  if (request.method === 'initialize') result = { protocolVersion: '2025-03-26' };
  if (request.method === 'tools/list') result = { tools: [{ name: 'web_search' }, { name: 'web_fetch' }] };
  if (request.method === 'tools/call') result = { content: [{ type: 'text', text: JSON.stringify({ results: [{ title: 'Public role', url: 'https://example.com/jobs/1' }, {url:'javascript:bad'}] }) }] };
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), { headers: { 'content-type': 'application/json', 'mcp-session-id': 'transport-only' } });
} };
const first = createResearchRun(ctx), second = createResearchRun(ctx);
const [a] = await Promise.all([first.search('public role'), second.search('public company')]);
await first.fetch(['https://example.com/jobs/1']);
await first.search('public followup');
assert.deepEqual(searchResults(a), [{ title: 'Public role', url: 'https://example.com/jobs/1', company: '', location: '' }]);
let calls = observed.filter(r => r.method === 'tools/call');
const session = calls[0].params.arguments.session_id;
assert.notEqual(session, calls[1].params.arguments.session_id);
assert.equal(calls[2].params.arguments.session_id, session);
assert.equal(calls[3].params.arguments.session_id, session);
assert.notEqual(session, 'transport-only');
failure = new Error('quota 429');
await assert.rejects(first.search('public retry'), /quota 429/);
await first.search('public retry');
calls = observed.filter(r => r.method === 'tools/call');
assert(calls.slice(-2).every(r => r.params.arguments.session_id === session));
await createResearchRun(ctx).search('new task');
assert.notEqual(observed.at(-1).params.arguments.session_id, session);
for (const name of ['AbortError', 'TimeoutError']) {
  failure = new DOMException(name, name);
  await assert.rejects(first.search('public error'), { name });
}
await assert.rejects(first.search(''), /required/);
await assert.rejects(first.fetch(['file:///etc/passwd']), /HTTP/);
assert.throws(() => searchResults({ content: [{type:'text',text:'unexpected'}] }), /Unrecognized/);
const jobs = await plugin.search('public role', ctx);
assert.equal(jobs[0].url, 'https://example.com/jobs/1');
// JSON-RPC and tool-level errors are never treated as empty search successes.
for (const packet of [{ error: { message: 'RPC failed' } }, { result: { isError: true, content: [{type:'text',text:'quota'}] } }]) {
 const broken = { fetch: async (_u, o) => { const r=JSON.parse(o.body); return new Response(JSON.stringify({jsonrpc:'2.0',id:r.id,...(r.method==='tools/call'?packet:{result:r.method==='initialize'?{protocolVersion:'2025-03-26'}:{tools:[{name:'web_search'},{name:'web_fetch'}]}})})); } };
 await assert.rejects(createResearchRun(broken).search('public role'), /RPC failed|quota/);
}
// Event-stream responses use the matching JSON-RPC id.
const sse = { fetch: async (_u, o) => {
 const r=JSON.parse(o.body);
 const result=r.method==='initialize'?{protocolVersion:'2025-03-26'}:r.method==='tools/list'?{tools:[{name:'web_search'},{name:'web_fetch'}]}:{structuredContent:{results:[]}};
 return new Response(`event: message\ndata: ${JSON.stringify({jsonrpc:'2.0',id:r.id,result})}\n\n`,{headers:{'content-type':'text/event-stream'}});
} };
assert.deepEqual(searchResults(await createResearchRun(sse).search('public role')), []);
console.log(JSON.stringify({passed:true,requestCount:observed.length,sessionIsolation:true,retryIdentity:true,searchFetchFollowup:true,errorTimeoutAbort:true,userAgentObserved:true}));
