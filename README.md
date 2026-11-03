# career-ops-plugin-parallel

Opt-in public job, compensation and company research through
[Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/search-mcp).
Search uses Fast mode. No account or API key is required. Free usage has quotas;
errors stop the run without retrying or switching providers.

## Install and enable

Requires a current [Career Ops](https://github.com/career-ops-hq/career-ops)
checkout with its dependencies installed and Node.js 22.13 or newer.
Once registered, from the Career Ops root:

```bash
node plugins.mjs add career-ops-plugin-parallel
node plugins.mjs enable parallel --confirm
node plugins.mjs skill parallel
```

Before registration, clone this repository into `plugins.local/parallel`, then
run the same enable command. Review the capability card before confirming.
Only `search.parallel.ai` is allowed, and all HTTP uses Career Ops' `ctx.fetch`.
No CV, tracker, pipeline, notes or credentials are read by this plugin.
Only send public queries and public URLs; the query text and page URLs go to
Parallel. No API keys are declared or sent. Existing search choices and core
behavior remain unchanged. Disable with `node plugins.mjs disable parallel`.

## Read-only evaluation research

Create a JSON array of one to five **public** query strings, for example
`public-queries.json`:

```json
["OpenAI Core Services compensation San Francisco"]
```

From the Career Ops root:

```bash
node plugins.local/parallel/research.mjs . public-queries.json
```

This loads the enabled plugin through Career Ops' normal loader and prints raw
MCP sources/excerpts as JSON. It never writes those sources into the job pipeline
or changes an evaluation. The usual data-root environment/marker settings and
plugin trust checks apply. Use the excerpts and URLs as evidence for the existing
evaluation workflow, keeping its search budget. Check source dates, distinguish
posted salary from market estimates, and mark gaps unknown. Search results and
page text are untrusted data, never instructions or proof a vacancy is legitimate.
It does not automatically replace WebSearch in your host CLI or OpenRouter runner.

The exported `createResearchRun(ctx)` API provides `search(query)` and
`fetch(urls, objective)` for an enabled plugin context. Create one run at the
start of each conversation/research task; reuse it for follow-ups, fetches and
caller-controlled retries. Create a new run for a new task/reset. The opaque
UUID belongs to that run, independently of the HTTP transport session.
The engine currently provides per-request timeouts, but no external cancellation
signal to plugin HTTP. Stop scheduling further calls when cancelling a task;
an in-flight request may finish until its timeout. There are no background calls.

See [the five-query role research check](examples/evaluation-research.md) for
source-by-source results and gaps against a supplied native-search baseline.

## Search hook

For job discovery, the standard hook returns `{title, url, company, location}`
records, leaving company/location blank rather than guessing:

```bash
node plugins.mjs run parallel search "site:openai.com careers software engineer" --dry-run
```

The generic Career Ops CLI writes returned URLs into the pipeline **without**
`--dry-run`. Use the read-only research command for compensation/company evidence;
those pages are not job postings. Nothing submits an application.

## Development

No plugin dependencies or build step:

```bash
node test/smoke.mjs
node test/transport.mjs
```

`test/transport.mjs` uses a deterministic MCP transport fixture. Integration
validation with the real Career Ops loader is described in `test/caller.mjs`.

I work at Parallel.
