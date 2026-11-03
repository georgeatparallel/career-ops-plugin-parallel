// Read-only public-source research, using Career Ops' enabled plugin context.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createResearchRun } from './index.mjs';

export async function research(rootArg, queries) {
const root = path.resolve(rootArg);
if (!Array.isArray(queries) || !queries.length || queries.length > 5 || queries.some(q => typeof q !== 'string' || !q.trim())) {
  throw new Error('Supply an array of one to five public research queries');
}
// Import the engine from the user's chosen Career Ops checkout. It supplies the
// opt-in, integrity and allowedHosts checks. Do not read any candidate files.
const engineUrl = pathToFileURL(path.join(root, 'plugins', '_engine.mjs')).href;
const { loadPlugins } = await import(engineUrl);
const resolverUrl = pathToFileURL(path.join(root, 'path-resolver.mjs')).href;
const { getCareerOpsRoot } = await import(resolverUrl);
const dataRoot = getCareerOpsRoot();
const plugins = await loadPlugins('search', { root, dataRoot, pluginId: 'parallel' });
const loaded = plugins.find(p => p.id === 'parallel');
if (!loaded) throw new Error('Enable and trust the parallel plugin in Career Ops first');
const run = createResearchRun(loaded.ctx);
const results = [];
for (const query of queries) {
  try { results.push({ query, result: await run.search(query) }); }
  catch (error) {
    // Stop on errors/quotas. No automatic retries or session rotation.
    results.push({ query, error: error.message });
    return { results, completed: false };
  }
}
return { results, completed: true };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [rootArg, queriesArg] = process.argv.slice(2);
  if (!rootArg || !queriesArg || process.argv.length !== 4) {
    console.error('Usage: node research.mjs <career-ops-root> <public-queries.json>');
    process.exitCode = 2;
  } else {
    const output = await research(rootArg, JSON.parse(readFileSync(queriesArg, 'utf8')));
    console.log(JSON.stringify(output, null, 2));
    if (!output.completed) process.exitCode = 1;
  }
}
