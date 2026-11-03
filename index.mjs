import { randomUUID } from 'node:crypto';

const ENDPOINT = 'https://search.parallel.ai/mcp';
const USER_AGENT = 'career-ops-plugin-parallel/0.1.0';

// One object per conversation/research run, never per process or cached client.
// Each search-hook invocation is a standalone run. Related research uses this API.
export function createResearchRun(ctx) {
  const sessionId = randomUUID();
  let nextId = 0;
  let transportSession;
  let ready;

  async function rpc(method, params, notification = false) {
    const id = notification ? undefined : ++nextId;
    const response = await ctx.fetch(ENDPOINT, {
      method: 'POST',
      timeoutMs: 15000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'User-Agent': USER_AGENT,
        'MCP-Protocol-Version': '2025-03-26',
        ...(transportSession ? { 'Mcp-Session-Id': transportSession } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', ...(id ? { id } : {}), method, params }),
    });
    if (!response.ok) throw new Error(`Parallel MCP HTTP ${response.status}`);
    transportSession = response.headers.get('mcp-session-id') || transportSession;
    if (notification) return;
    const text = await response.text();
    const messages = response.headers.get('content-type')?.includes('text/event-stream')
      ? text.split(/\r?\n\r?\n/).flatMap(event => {
        const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        return data ? [JSON.parse(data)] : [];
      })
      : [JSON.parse(text)];
    const message = messages.find(m => m.id === id);
    if (!message || message.jsonrpc !== '2.0') throw new Error('Invalid Parallel MCP response');
    if (message.error) throw new Error(`Parallel MCP: ${message.error.message || 'RPC error'}`);
    if (!('result' in message)) throw new Error('Missing Parallel MCP result');
    return message.result;
  }

  async function initialize() {
    const init = await rpc('initialize', {
      protocolVersion: '2025-03-26', capabilities: {},
      clientInfo: { name: 'career-ops-plugin-parallel', version: '0.1.0' },
    });
    if (init.protocolVersion !== '2025-03-26') throw new Error('Unsupported MCP protocol version');
    await rpc('notifications/initialized', {}, true);
    const list = await rpc('tools/list', {});
    if (!['web_search', 'web_fetch'].every(name => list.tools?.some(t => t.name === name))) {
      throw new Error('Parallel MCP search/fetch tools unavailable');
    }
  }

  async function call(name, args) {
    ready ??= initialize();
    await ready;
    const result = await rpc('tools/call', { name, arguments: { ...args, session_id: sessionId } });
    if (result.isError) throw new Error(`Parallel ${name} failed: ${(result.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n')}`);
    return result;
  }

  return Object.freeze({
    async search(query) {
      if (typeof query !== 'string' || !query.trim()) throw new Error('A public research query is required');
      return call('web_search', { objective: query.trim(), search_queries: [query.trim()] });
    },
    fetch: async (urls, objective = '') => {
      if (!Array.isArray(urls) || !urls.length || urls.length > 20) throw new Error('Supply 1-20 public page URLs');
      for (const url of urls) {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use public HTTP(S) URLs without credentials');
      }
      return call('web_fetch', { urls, objective: objective.slice(0, 200) });
    },
  });
}

// Keep the raw excerpts in the research API. The engine's search hook consumes
// Job[]; never infer a company, location, score or vacancy legitimacy from a URL.
export function searchResults(result) {
  let data = result.structuredContent;
  if (!data) {
    const text = (result.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    try { data = JSON.parse(text); } catch { throw new Error('Unrecognized Parallel search result format'); }
  }
  const rows = data.results || data.search_results;
  if (!Array.isArray(rows)) throw new Error('Missing Parallel search results');
  return rows.filter(r => {
    try { return ['https:', 'http:'].includes(new URL(r.url).protocol); } catch { return false; }
  }).map(r => ({ title: String(r.title || ''), url: r.url, company: '', location: '' }));
}

export default {
  async search(query, ctx) {
    return searchResults(await createResearchRun(ctx).search(query));
  },
};
