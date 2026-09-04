---
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-cards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
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
---

## Why this stack

10xCards is a solo, after-hours, 3-week MVP (web-app, JS) with auth and AI generation as the two technology-forcing features from the PRD. The recommended default for `(web-app, js)` is `10x-astro-starter`, which ships Supabase (auth + PostgreSQL) and Cloudflare Pages edge deployment out of the box — covering both forcing features without additional integration work. It clears all four agent-friendly gates: typed via TypeScript and Zod schemas at boundaries, convention-based via Astro's file-based routing, well-represented in JS training data, and well-documented. The short timeline and solo context favor a battle-tested opinionated starter over a hand-assembled stack. Bootstrapper confidence is `first-class` — registered with a valid CLI, expected to scaffold cleanly with occasional manual steps. The AI generation feature (FR-002/FR-003) requires an external LLM integration not bundled in the starter; it will surface as an open connection point during bootstrapping. CI runs on GitHub Actions with auto-deploy-on-merge.
