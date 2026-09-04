---
project: 10xCards
researched_at: 2026-09-03
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (SSR, output: server)
  runtime: Cloudflare Workers (workerd)
  database: Supabase (external PostgreSQL)
  auth: Supabase SSR
  ai: OpenRouter (external)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project's `wrangler.jsonc` is already configured for Workers, `@astrojs/cloudflare` v14.x is Astro-Core-maintained and GA for Astro 6 SSR, and the developer has existing Cloudflare familiarity. The free tier covers 100,000 requests per day with commercial use allowed — sufficient for early MVP traffic. Cloudflare scored highest across all five agent-friendly criteria, with a GA MCP integration that enables full deploy/debug cycles from within Claude Code. One active production bug (`nodejs_compat` + middleware → `[object Object]` SSR responses) requires a one-line `wrangler.jsonc` fix before first deploy; all other risks are documented in the risk register below.

**Important correction:** The earlier `infrastructure.md` (researched 2026-06-30) recommended Cloudflare Pages. Cloudflare deprecated Pages for new projects in April 2025 — the `@astrojs/cloudflare` adapter no longer supports Pages as of v13+. The correct deployment target is **Cloudflare Workers** (`wrangler deploy`). The project's `AGENTS.md` and `README.md` already reflect Workers; `tech-stack.md`'s `deployment_target: cloudflare-pages` field is outdated and should be corrected to `cloudflare-workers`.

## Platform Comparison

Scoring: Pass = 2 / Partial = 1 / Fail = 0. Hard filter: no platform was dropped (Q1 = no persistent connections needed, all platforms compatible). Soft weights applied: Cloudflare familiarity as tiebreaker (Q3); no edge-native bonus (Q4 = single region fine); no co-location bonus (Q5 = external Supabase + OpenRouter).

| Platform | CLI-first | Managed/Serverless | Agent docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass (GA) | **10** |
| Vercel | Pass | Pass | Pass | Pass | Partial (MCP beta) | **9** |
| Netlify | Partial (no rollback cmd) | Pass | Pass | Pass | Pass (GA, Jun 2026) | **9** |
| Render | Partial (no rollback cmd) | Pass | Pass | Pass | Pass (GA, Aug 2025) | **9** |
| Railway | Pass | Partial (needs Dockerfile) | Partial (no llms.txt) | Pass | Pass (GA) | **8** |
| Fly.io | Pass | Partial (container) | Pass | Pass | Partial (MCP preview) | **8** |

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

The project is already wired for Workers: `wrangler.jsonc` is present, `@astrojs/cloudflare` is listed as a dependency, and the developer has hands-on familiarity. The adapter is maintained by Astro Core (v14.x, GA for Astro 6 SSR including Server Islands, Actions, and Sessions). Free tier allows 100k requests/day commercially — the 3-week MVP will not outgrow it. Wrangler covers deploy, rollback, and log tailing without a GUI. Cloudflare publishes `llms.txt` + `llms-full.txt` plus scoped variants for Workers and Agents, making it the strongest platform for agent-readable documentation. The MCP integration is GA and covers 2,500+ Cloudflare API endpoints. The one active production risk (the `nodejs_compat` + middleware bug) has a documented one-line workaround that must be applied before first deploy.

#### 2. Vercel

`@astrojs/vercel` v10 is GA for Astro 6 SSR. The CLI is mature (`vercel deploy --prod`, `vercel rollback`, filtered `vercel logs`), and documentation is among the most agent-readable available (`.md` suffix, `llms.txt`, `llms-full.txt`). The MCP server at `mcp.vercel.com` is in Public Beta (launched August 2025, checked September 2026). The gap versus Cloudflare: MCP is still beta, and the free Hobby tier prohibits commercial use — a production flashcard app requires the $20/month Pro plan from day one. Single-region default (US East) is acceptable given Q4 answer.

#### 3. Render

`@astrojs/node` adapter in standalone mode is officially documented by Render for Astro SSR. The MCP server (GA since August 2025) offers the most comprehensive feature set of any platform's MCP: 20+ tools covering logs, metrics, Postgres queries, and environment variable management. Pricing is clear: Starter at $7/month eliminates free-tier cold starts (the free tier sleeps after 15 minutes with a 60-second cold start — unacceptable for production). No surprise credit exhaustion. The partial CLI score reflects the absence of a dedicated rollback command — rollback requires re-deploying a prior commit hash. External Supabase sidesteps Render's 30-day free Postgres expiry entirely.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Active production bug: `nodejs_compat` + middleware → `[object Object]` SSR responses.** The project's `src/middleware.ts` runs Supabase session resolution on every request — exactly the pattern that triggers broken SSR responses when `compatibility_date >= 2025-09-15`. The upstream GitHub issue (#15434) was closed without a first-party fix. The workaround (add `disable_nodejs_process_v2` to `compatibility_flags` in `wrangler.jsonc`) must be applied before first deploy. It is not in the starter template.

2. **The `workerd` runtime is not Node.js — every npm dependency is a hidden compatibility audit.** Packages using Node.js APIs not covered by `nodejs_compat` fail at runtime, not at build time. Error-tracking SDKs, analytics libraries, and stream-based packages are common offenders. The failure mode is often silent: errors swallowed, callbacks never called.

3. **The free tier's 10ms CPU time cap per invocation is tight.** Supabase JWT verification in middleware + Astro SSR render routinely exceeds 10ms CPU. The free tier may be insufficient even at low traffic. The $5/month paid plan is effectively mandatory from day one of production usage.

4. **`tech-stack.md` says `deployment_target: cloudflare-pages` — this field is wrong.** Pages was deprecated for new projects in April 2025. Any downstream skill or agent reading this field will generate `wrangler pages deploy` commands instead of `wrangler deploy`, breaking the deploy pipeline. This field must be corrected before running any deployment-related workflow skills.

5. **Workers are globally distributed with no single-region option.** Supabase Postgres runs in one region. Requests from distant Workers PoPs add round-trip latency on every database call. At MVP scale this is imperceptible, but the edge-first architecture is architecturally misaligned with a single-origin database.

### Pre-Mortem — How This Could Fail

The 10xCards app launched on Cloudflare Workers and appeared healthy for the first week. The first incident struck on day 3: production SSR returned `[object Object]` on all pages while `wrangler dev` showed the app working correctly. Four hours of debugging uncovered the `nodejs_compat` + middleware bug — triggered by the combination of `compatibility_date >= 2025-09-15` and the Supabase session middleware in `src/middleware.ts`. The `disable_nodejs_process_v2` flag fixed it, but the incident exposed a pattern: the workerd runtime diverges from Node.js in ways that are invisible locally.

By week 2, the free tier's 10ms CPU cap started dropping requests silently during peak hours — JWT verification alone was enough to exceed it. The $5/month upgrade resolved it, but the "free tier covers MVP" assumption had already proven wrong.

Month 2 introduced the slower failure: each new npm dependency became a compatibility investigation. An error-monitoring library used `async_hooks`; a card-import helper used Node.js `stream`. Both silently failed at edge. The developer spent evenings debugging runtime errors that didn't exist locally. By month 3, the mental overhead of the workerd compatibility tax — not any single bug — had eroded iteration speed on a solo after-hours project. Cloudflare Workers remained running throughout, but the platform's constraints had become a steady drag on the schedule.

### Unknown Unknowns

- **Production stack traces reference bundled code, not TypeScript.** `wrangler tail` streams source-mapped traces only if source maps are configured — they aren't by default in the starter template. Production debugging requires setting up source map upload to the Cloudflare dashboard separately.
- **`wrangler secret put` is the only path to production secrets** — there is no dashboard GUI for Workers secrets (unlike Vercel, Render, or Netlify). If the `wrangler` API token expires or is rotated, secret management requires direct Cloudflare REST API calls.
- **`compatibility_date` is a behavioral version pin, not just a timestamp.** Advancing it to pick up new Workers APIs can change other runtime behaviors silently. The safest practice: advance the date in a staging environment first and tail logs before promoting to production.
- **Supabase `@supabase/ssr` cookie writes must complete before the response body begins streaming.** In Cloudflare's streaming response model, setting cookies after the response has started is silently ignored — the auth session cookie doesn't reach the client. This constraint doesn't exist in Node.js runtimes and isn't documented in either the Supabase or Astro adapter docs.
- **The `tech-stack.md` → `cloudflare-pages` mismatch is a latent foot-gun** for any skill or agent that reads this field. Update `deployment_target` to `cloudflare-workers` before running downstream workflow skills (`/10x-implement`, Plan Mode deploy, etc.).

## Operational Story

- **Preview deploys**: `wrangler deploy --env staging` deploys to a named environment defined in `wrangler.jsonc`. Preview URLs take the form `<worker-name>.<subdomain>.workers.dev`. Branch previews are not automatic — they require an explicit CI step or manual `wrangler deploy --env staging` invocation per branch. Cloudflare Access can restrict preview URLs to authenticated viewers.
- **Secrets**: Production secrets are set via `wrangler secret put KEY` (interactive) or `echo "value" | wrangler secret put KEY --stdin` (non-interactive for CI). Local dev uses `.dev.vars` (gitignored, never committed). Rotation: run `wrangler secret put KEY` with the new value — Workers pick up the updated secret on the next cold start, no restart or redeploy required.
- **Rollback**: `wrangler rollback` reverts to the previous deployed version instantly. `wrangler rollback <VERSION_ID>` targets a specific version. `wrangler deployments list` shows the last 10 deployments with version IDs. Rollback is atomic and takes effect globally within seconds. Database migrations do not roll back automatically — coordinate schema rollbacks separately.
- **Approval**: Deploys and rollbacks may be performed by an agent unattended using a scoped Cloudflare API token (`Workers Scripts: Edit` permission, scoped to this project only). Billing tier changes, secret rotation (if the token is itself being rotated), and project deletion require a human in the Cloudflare dashboard.
- **Logs**: `wrangler tail [WORKER_NAME]` streams live request/response logs with optional filters: `--status 5xx`, `--method POST`, `--header`, `--search`. `--format json` for structured output. The Cloudflare Workers Observability MCP server exposes logs as structured tools for agent queries without needing `wrangler` auth in every session.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| `nodejs_compat` + middleware bug → `[object Object]` SSR responses on all pages | Devil's advocate | H | H | Add `"disable_nodejs_process_v2"` to `compatibility_flags` in `wrangler.jsonc` before first deploy |
| npm dependency incompatible with `workerd` runtime (silent failure) | Pre-mortem | M (grows with each new dependency) | M | Test every new npm package under `wrangler dev` before merging; audit `nodejs_compat` coverage per package |
| Free tier 10ms CPU cap exceeded at low traffic | Devil's advocate | H | M | Upgrade to $5/month paid plan from day one; do not rely on free tier CPU budget for any auth-involved SSR |
| `tech-stack.md` `cloudflare-pages` field misleads downstream agents into using `wrangler pages deploy` | Unknown unknowns | M | H | Update `tech-stack.md` `deployment_target` to `cloudflare-workers` immediately; verify CI uses `wrangler deploy` |
| Auth cookie silently dropped when streaming begins before middleware completes | Unknown unknowns | L | H | Ensure middleware sets all cookies synchronously before returning; avoid response streaming on auth-protected routes |
| Production secrets inaccessible if `wrangler` API token expires without a backup | Unknown unknowns | L | H | Store a backup Cloudflare API token in a secure vault independent of the CI/CD pipeline |
| `compatibility_date` advance causes silent runtime behavior changes | Unknown unknowns | L per advance, cumulative | M | Advance date in staging first; monitor `wrangler tail` output before promoting |
| Supabase Postgres round-trip latency from distant Workers PoPs | Research finding | L at MVP traffic | L | Acceptable at current scale; revisit if latency SLAs are introduced post-MVP |

## Getting Started

These steps assume `wrangler.jsonc` and `@astrojs/cloudflare` are already present (confirmed in the project).

1. **Fix the active production bug before first deploy.** In `wrangler.jsonc`, add `"disable_nodejs_process_v2"` to `compatibility_flags`:
   ```json
   "compatibility_flags": ["nodejs_compat", "disable_nodejs_process_v2"]
   ```

2. **Upgrade to the $5/month Workers paid plan** at `dash.cloudflare.com` → Workers & Pages → your Worker → Settings → Usage Model. The free tier's 10ms CPU limit will be exceeded by Supabase JWT verification in middleware. This is a one-time dashboard action.

3. **Authenticate Wrangler and set production secrets:**
   ```bash
   npx wrangler login
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```
   When the OpenRouter AI generation feature is implemented:
   ```bash
   npx wrangler secret put OPENROUTER_API_KEY
   ```

4. **Build and deploy:**
   ```bash
   npm run build
   npx wrangler deploy
   ```
   Confirm the deployed Worker URL with `npx wrangler deployments list`.

5. **Verify and tail live logs:**
   ```bash
   npx wrangler tail --status 5xx
   ```
   Exercise the auth flow (sign-in, sign-up) and confirm no `[object Object]` errors appear in the tail output.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions `wrangler deploy` workflow on merge to `master`)
- Production-scale architecture (Durable Objects, Queues, multi-region Supabase)
- Cloudflare D1 or KV as alternatives to external Supabase (out of MVP scope)
