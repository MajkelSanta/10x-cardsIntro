# Repository Guidelines

Astro 6 SSR app with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui, deployed to Cloudflare Workers. See @README.md for full setup and @CLAUDE.md for extended conventions.

## Hard Rules

- Never set `export const prerender = true` on files under `src/pages/api/`; `astro.config.mjs` uses `output: "server"` — all routes are already SSR by default.
- Never concatenate Tailwind class strings; use `cn()` from `@/lib/utils` (clsx + tailwind-merge).
- Never use Next.js directives (`"use client"`, `"use server"`) in React files — this is Astro, not Next.js.
- `SUPABASE_URL` and `SUPABASE_KEY` are declared server-only in `astro.config.mjs` `env.schema`; they must not appear in client-rendered code.
- Enable RLS on every new Supabase table with per-operation, per-role policies.
- React Compiler is enforced (`react-compiler/react-compiler: "error"` in `eslint.config.js`); components must follow the Rules of React — no direct mutations, hooks at top level only.

## Project Structure

`src/` holds `components/` (Astro + React; shadcn/ui primitives in `components/ui/`), `layouts/`, `lib/` (utilities, services, Supabase client), `pages/` (file-based routes; `pages/api/` for API endpoints), and `styles/`. SQL migrations live in `supabase/migrations/`. Path alias `@/*` maps to `src/*` — see @tsconfig.json.

## Commands

- `npm run dev` — Cloudflare workerd dev server; secrets come from `.dev.vars`, not `.env`
- `npm run build` — production SSR build; requires `SUPABASE_URL` and `SUPABASE_KEY` in environment
- `npm run lint` / `npm run lint:fix` — ESLint with full type-checking
- `npm run format` — Prettier (double quotes, semicolons, 120-col print width, trailing commas — see @.prettierrc.json)

Pre-commit: lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Conventions

- **Component authoring**: Astro components for static content and layout; React (`*.tsx`) only for client-side interactivity.
- **shadcn/ui**: install new components with `npx shadcn@latest add <name>` ("new-york" variant); do not hand-author files in `src/components/ui/`.
- **File placement**: hooks → `src/components/hooks/`; services and helpers → `src/lib/` or `src/lib/services/`; shared entity/DTO types → `src/types.ts`.
- **API routes**: export uppercase handlers (`GET`, `POST`); validate and sanitize input at API boundaries before use.
- **Migrations**: name files `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`.

## Auth

`src/middleware.ts` resolves the Supabase session on every request and sets `context.locals.user`. Add paths to `PROTECTED_ROUTES` in that file to require authentication. Supabase client: `src/lib/supabase.ts` (SSR cookie-based sessions via `@supabase/ssr`).

## CI

GitHub Actions runs `npx astro sync → npm run lint → npm run build` on push and PR to `master`. Both `SUPABASE_URL` and `SUPABASE_KEY` must be set as repository secrets for the build step. No test suite is configured — set up Vitest or equivalent before writing tests.
