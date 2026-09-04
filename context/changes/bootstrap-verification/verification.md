---
bootstrapped_at: 2026-08-23T00:00:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: 10x-cards
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-cards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

**Why this stack:** 10xCards is a solo, after-hours, 3-week MVP (web-app, JS) with auth and AI generation as the two technology-forcing features from the PRD. The recommended default for `(web-app, js)` is `10x-astro-starter`, which ships Supabase (auth + PostgreSQL) and Cloudflare Pages edge deployment out of the box — covering both forcing features without additional integration work. It clears all four agent-friendly gates: typed via TypeScript and Zod schemas at boundaries, convention-based via Astro's file-based routing, well-represented in JS training data, and well-documented. The short timeline and solo context favor a battle-tested opinionated starter over a hand-assembled stack. Bootstrapper confidence is `first-class` — registered with a valid CLI, expected to scaffold cleanly with occasional manual steps. The AI generation feature (FR-002/FR-003) requires an external LLM integration not bundled in the starter; it will surface as an open connection point during bootstrapping. CI runs on GitHub Actions with auto-deploy-on-merge.

## Pre-scaffold verification

| Signal      | Value    | Severity | Notes                                       |
| ----------- | -------- | -------- | ------------------------------------------- |
| npm package | not run  | n/a      | git-clone strategy; no npm package to check |
| GitHub repo | not run  | n/a      | gh CLI not installed; check unavailable     |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 0 (all root-level files already existed in cwd from prior bootstrap run)
**Conflicts (.scaffold siblings)**: CLAUDE.md.scaffold — user-customized CLAUDE.md differs from starter version; all other conflicting files were identical to cwd (existing wins, no siblings for identical content)
**.gitignore handling**: existing file identical to scaffold version; append-merge resulted in no new lines
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 1 CRITICAL, 13 HIGH, 7 MODERATE, 2 LOW
**Direct vs transitive**: not distinguished cleanly by npm audit output for this project

#### CRITICAL findings

- **tar** — node-tar: PAX size override to intermediary long-name/long-link headers (file smuggling); process crash via PAX numeric path type confusion; decompression/parse DoS via unlimited input; negative tar entry size causes infinite loop in archive replace; uncaught exception DoS via NUL byte in PAX path/linkpath records; uncontrolled recursion in mapHas/filesFilter via crafted long-path tar

#### HIGH findings

- **astro** — XSS via unescaped attribute names in spread props (CVE-2026-54298); XSS via unescaped spread attribute names in renderHTMLElement (incomplete fix); XSS via unescaped `transition:*` directive values on hydrated islands; reflected XSS via unescaped View Transition animation properties; Host header SSRF in prerendered error page fetch; reflected XSS via unescaped slot name
- **brace-expansion** — DoS via exponential-time expansion of consecutive non-expanding `{}` groups; DoS via unbounded expansion length causing OOM; DoS via unbounded intermediate arrays (CVE-2026-14257 mitigation bypass)
- **devalue** — DoS via sparse array deserialization
- **fast-uri** — host confusion via literal backslash authority delimiter; host confusion via backslash authority introducer; host confusion via failed IDN canonicalization
- **js-yaml** — quadratic-complexity DoS in merge key handling via repeated aliases; quadratic CPU consumption via `!!omap` resolution (CVE-2026-59870 fix not backported)
- **miniflare** — indirect (inherits from sharp, undici, ws)
- **nanoid** — non-secure generators can loop indefinitely with negative size; custom generators can loop with zero size
- **postcss** — path traversal in previous source map auto-loading leads to arbitrary `.map` file disclosure; incomplete fix of GHSA-6g55-p6wh-862q
- **sharp** — inherited libvips CVEs: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591
- **svgo** — removeScripts plugin leaves some executable scripts intact
- **undici** — 12 advisories: TLS certificate validation bypass via dropped requestTls in SOCKS5; HTTP header injection via Set-Cookie percent-decoding; WebSocket DoS via fragment count bypass; cross-origin request routing via SOCKS5 proxy pool reuse; Set-Cookie SameSite downgrade; cross-user information disclosure via shared cache whitespace bypass; downstream response desynchronization; cross-user disclosure and parse-time crash via degenerate private cache directives; CRLF injection via blob-like body `type` property; cross-user disclosure via whitespace around equals in Cache-Control; cookie attribute injection via unsanitized domain and unparsed setCookie fields; HTTP response queue poisoning via keep-alive socket reuse
- **vite** — NTLMv2 hash disclosure via UNC path handling on Windows (launch-editor); `server.fs.deny` bypass on Windows alternate paths
- **ws** — uninitialized memory disclosure; memory exhaustion DoS from tiny fragments and data chunks

#### MODERATE findings

7 moderate findings — not surfaced inline per severity-tiering policy. Run `npm audit` for the full list.

#### LOW findings

2 low findings — log only.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | true                 |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` — diff it against your current `CLAUDE.md` to confirm your customizations are preserved (they are — existing file won).
- Run `npm audit fix` after reviewing the CRITICAL/HIGH findings above. Most actionable: **tar** (CRITICAL) and **astro** (HIGH — XSS in core framework, check for Astro patch releases).
- Address audit findings per your project's risk tolerance — full breakdown is in this log.
