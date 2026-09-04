# Cloudflare Workers Deployment Plan — 10xCards

## Context

Astro 6 SSR app wired for Cloudflare Workers (`wrangler.jsonc` + `@astrojs/cloudflare` present) that has never been deployed. `infrastructure.md` (2026-09-03) identifies one active production bug that must be fixed before first deploy. This plan covers config fixes, manual human gates, secrets, first deploy, CI/CD, and operational references.

---

## Phase 0 — Prerequisites & Setup

Complete all steps before Phase 1. Each section is independent — work through them in order.

---

### 0.1 Node.js

**Check:**
```bash
node --version   # must be v22.x.x
```

**If missing or wrong version — install nvm then Node 22:**
```bash
# install nvm (macOS/Linux)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# restart terminal, then:
nvm install 22
nvm use 22          # uses .nvmrc automatically if you're in the project root
```

**Verify:**
```bash
node --version   # v22.14.0
npm --version    # 10.x.x
```

---

### 0.2 Project dependencies

```bash
npm ci
```

Wrangler (v4) is already in `devDependencies` — no global install needed. After `npm ci`, `npx wrangler` resolves to the local version.

**Verify wrangler is available:**
```bash
npx wrangler --version   # 4.x.x
```
✅ Wrangler CLI zainstalowany — v4.90.0

**Optional — install wrangler globally** (so you can run `wrangler` without `npx` anywhere):
```bash
npm install -g wrangler
wrangler --version
```

---

### 0.3 Cloudflare account

**If you don't have an account:**
1. Go to `dash.cloudflare.com/sign-up`
2. Enter email + password → verify email
3. Skip domain setup (click "Skip, I'll do this later" / "Add a website" is not needed for Workers)
4. You're on the Free plan by default — fine for Phase 4 first deploy

**If you already have an account:**
- [x] Sign in at `dash.cloudflare.com` and confirm you can see the dashboard ✅
- [x] Wrangler authenticated: `majkeleight@gmail.com`, Account ID: `ee05691cd34553f6098d157b7c44edb0` ✅

**Note your Account ID** (needed in Phase 7):
- Visible in the right sidebar of the dashboard home, or at:
  `dash.cloudflare.com` → any Worker → Overview → Account ID

---

### 0.4 Authenticate Wrangler with Cloudflare

Wrangler musi być zalogowany do Twojego konta Cloudflare zanim będziesz mógł deployować, zarządzać sekretami czy streamować logi.

#### Krok 1 — uruchom login

```bash
npx wrangler login
```

#### Krok 2 — autoryzuj w przeglądarce

Wrangler automatycznie otwiera przeglądarkę pod adresem `dash.cloudflare.com/oauth2/auth`.

1. Jeśli nie jesteś zalogowany w dashboardzie — zaloguj się
2. Cloudflare wyświetla ekran: **"Wrangler is requesting access to your account"**
3. Kliknij **Allow** (pozwala Wranglerowi na: deploy workerów, zarządzanie sekretami, listowanie deploymentów)
4. Przeglądarka wyświetla: **"You have granted authorization to Wrangler"** — wróć do terminala

Cloudflare zapisuje token OAuth w `~/.wrangler/config/default.toml` — lokalnie na komputerze, nigdy nie commituj tego pliku.

#### Krok 3 — weryfikacja

```bash
npx wrangler whoami
```

Oczekiwany output:
```
 ⛅️ wrangler 4.x.x
--------------------
Getting User settings...
👋 You are logged in with an OAuth Token, associated with the email 'twoj@email.com'!
┌────────────────────────────┬──────────────────────────────────┐
│ Account Name               │ Account ID                       │
├────────────────────────────┼──────────────────────────────────┤
│ Twoje Imię / Nazwa konta   │ xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx │
└────────────────────────────┘
```

- [x] **Account ID**: `ee05691cd34553f6098d157b7c44edb0` — potrzebny w Phase 7 ✅

#### Krok 4 — sprawdź dostęp do Workers

```bash
npx wrangler deployments list
```

Jeśli to pierwszy deploy — zobaczy `No deployments found` (OK). Jeśli pojawi się błąd autoryzacji — powtórz login.

#### Troubleshooting

| Problem | Rozwiązanie |
|---|---|
| Przeglądarka nie otwiera się automatycznie | Skopiuj URL wydrukowany w terminalu i otwórz ręcznie |
| OAuth error / timeout | `npx wrangler logout` → `npx wrangler login` |
| `Authentication error: could not refresh token` | Token wygasł — ponownie `npx wrangler login` |
| Proxy firmowy blokuje OAuth | Utwórz API token ręcznie: `dash.cloudflare.com` → My Profile → API Tokens → Create Token → **Edit Cloudflare Workers** → zapisz jako `CLOUDFLARE_API_TOKEN` w env i uruchom `CLOUDFLARE_API_TOKEN=<token> npx wrangler whoami` |
| Kilka kont Cloudflare | `npx wrangler login` loguje do domyślnego konta; aby wybrać inne: `CLOUDFLARE_ACCOUNT_ID=<id> npx wrangler deploy` |

---

### 0.5 Supabase project

You need a live Supabase project (cloud or local) before setting production secrets.

**Option A — Cloud Supabase (recommended for production):**
1. Go to `supabase.com` → New project
2. Choose a region (pick one closest to your users; note it — Cloudflare Workers will round-trip to this region on every DB call)
3. After project is ready: Settings → API → copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon / public** key → `SUPABASE_KEY`

**Option B — Local Supabase (dev only, requires Docker):**
```bash
npx supabase start
# credentials printed after start — copy SUPABASE_URL and SUPABASE_KEY
```

- [x] Supabase cloud project exists ✅
- [ ] Record `SUPABASE_URL` and `SUPABASE_KEY` — needed in Phase 3 (`.dev.vars`) and Phase 5 (production secrets)

---

### 0.6 Verify local build passes

```bash
npm run build
```

Expected: `dist/` created, no errors. The env vars are `optional: true` in `astro.config.mjs` so build succeeds without them set.

✅ Build przechodzi — `Complete!` (sitemap warning bez `site` w astro.config — niekrytyczne)

**If build fails:** fix errors before proceeding — a failing build means a failing deploy.

---

### 0.7 Git state

- [ ] ⚠️ **Repo nie jest zainicjalizowany** (`git status` → "not a git repo") — wymagane dla Phase 7 (Cloudflare Git integration). Uruchom:
  ```bash
  git init
  git add .
  git commit -m "initial commit"
  ```
- [ ] GitHub remote skonfigurowany (wymagane dla Cloudflare Git integration):
  ```bash
  # utwórz repo na github.com, następnie:
  git remote add origin https://github.com/<user>/<repo>.git
  git push -u origin master
  ```

---

## Phase 1 — Critical Config Fixes (agent-automated)

- [x] **1.1 Fix `nodejs_compat` + middleware bug** — `wrangler.jsonc`

  Add `"disable_nodejs_process_v2"` to `compatibility_flags`:
  ```jsonc
  "compatibility_flags": ["nodejs_compat", "disable_nodejs_process_v2"]
  ```
  `compatibility_date` is `"2026-05-08"` (past the `2025-09-15` threshold). `src/middleware.ts` runs `supabase.auth.getUser()` on every request — exactly the pattern that triggers `[object Object]` SSR responses on all pages. Upstream issue #15434 closed without a first-party fix; this flag is the only workaround.

- [x] **1.2 `@astrojs/cloudflare` stays at v13.5.0** — no upgrade

  `@astrojs/cloudflare@14.x` requires `astro@^7.2.0`; the project is on Astro 6 (`^6.3.1`). Upgrading is a separate Astro 6→7 major-version task, out of scope for this deployment. v13.5.0 is GA and stable for Astro 6 SSR.

- [x] **1.3 Add `wrangler dev` script** — `package.json` scripts

  Add `"cf:dev": "wrangler dev"`. Current `"dev": "astro dev"` uses Vite/Node.js, not the actual workerd runtime. `wrangler dev` reads `.dev.vars` and surfaces workerd-only runtime errors before they reach production.

---

## Phase 2 — Manual Human Gates ⚠️ (cannot be automated)

- [ ] **2.1** Sign in at `dash.cloudflare.com`

- [ ] **2.2 Upgrade to Workers Paid plan — mandatory before going live**

  `dash.cloudflare.com` → Workers & Pages → `10x-astro-starter` → Settings → Usage Model → **Paid** ($5/month)

  > Complete **after Phase 4** — the option only appears once the worker exists.

  Free tier's 10ms CPU cap will be exceeded by Supabase JWT verification in middleware alone.

- [ ] **2.3 Authorize GitHub → Cloudflare connection** (needed for Git integration in Phase 7)

  No manual API token needed — Cloudflare's Git integration uses OAuth to connect directly to your GitHub repo. You'll authorize this in Phase 7.1 inside the Cloudflare dashboard.

---

## Phase 3 — Local Environment

- [ ] **3.1 Create `.dev.vars`:**
  ```bash
  cp .env.example .dev.vars
  # fill in SUPABASE_URL and SUPABASE_KEY with real values
  ```
  Verify `.dev.vars` does not appear in `git status`.

- [ ] **3.2 Wrangler authenticated** — confirm `npx wrangler whoami` returns your account (covered in Phase 0.4)

---

## Phase 4 — First Deploy

- [ ] **Build:**
  ```bash
  npm run build
  ```

- [ ] **Deploy:**
  ```bash
  npx wrangler deploy
  ```
  Expected output: `https://10x-astro-starter.<subdomain>.workers.dev`

- [ ] **Confirm:**
  ```bash
  npx wrangler deployments list
  ```
  Note the version ID for rollback.

---

## Phase 5 — Production Secrets

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

Future (when OpenRouter is implemented):
```bash
npx wrangler secret put OPENROUTER_API_KEY
```

Non-interactive / CI rotation:
```bash
echo "new-value" | npx wrangler secret put SUPABASE_KEY --stdin
```

---

## Phase 6 — Verification

- [ ] **Stream live error logs** (keep running during testing):
  ```bash
  npx wrangler tail 10x-astro-starter --status 5xx
  ```

- [ ] **Exercise auth flow:**
  1. `/auth/signup` → create test account
  2. `/auth/signin` → sign in
  3. `/dashboard` → confirm access when authenticated
  4. Sign out → `/dashboard` → confirm redirect to `/auth/signin`

- [ ] **Tail output clean:** no `[object Object]`, no unhandled exceptions

- [ ] **Return to Phase 2.2** — upgrade to Paid plan now that the worker exists

**Edge case — `[object Object]` still appears:** `disable_nodejs_process_v2` wasn't picked up. Verify `wrangler.jsonc` and redeploy.

**Edge case — auth cookie lost after sign-in:** Middleware is setting cookies after streaming begins. Ensure `src/middleware.ts` sets cookies synchronously before calling `next()` (current implementation is correct; watch future changes).

---

## Phase 7 — Auto-Deploy via Cloudflare Git Integration

Auto-deploy on push to `master` is handled by Cloudflare natively — no GitHub Actions deploy job needed. `.github/workflows/ci.yml` stays as lint + build only.

- [ ] **7.1 Connect GitHub repo in Cloudflare dashboard:**

  `dash.cloudflare.com` → Workers & Pages → `10x-astro-starter` → Settings → **Git** (or Builds & Deployments) → Connect to Git → authorize GitHub → select this repo → branch: `master`

- [ ] **7.2 Configure build settings:**

  | Field | Value |
  |---|---|
  | Build command | `npm run build` |
  | Build output directory | `dist` |
  | Root directory | `/` (repo root) |
  | Node.js version | `22` |

- [ ] **7.3 Add build-time env vars** in the Cloudflare dashboard (Settings → Environment Variables → Production):
  - `SUPABASE_URL` — production value
  - `SUPABASE_KEY` — production value

  > Worker *secrets* (set via `wrangler secret put` in Phase 5) are runtime secrets; build-time env vars are separate and needed for `npm run build` to succeed.

- [ ] **7.4 Trigger first auto-deploy:** push a commit to `master` and confirm Cloudflare picks it up in the Builds tab.

**Note:** GitHub Actions CI (`ci.yml`) continues running lint + build on every push/PR — it remains the quality gate. Cloudflare handles the actual deploy independently.

---

## Operational Reference

| Operation | Command |
|---|---|
| Staging deploy | `npx wrangler deploy --env staging` |
| Rollback (previous) | `npx wrangler rollback` |
| Rollback (specific) | `npx wrangler rollback <VERSION_ID>` |
| List deployments | `npx wrangler deployments list` |
| Stream all logs | `npx wrangler tail 10x-astro-starter` |
| Stream 5xx only | `npx wrangler tail 10x-astro-starter --status 5xx` |
| Rotate secret (CI) | `echo "val" \| npx wrangler secret put KEY --stdin` |

---

## Risk Register

| Risk | Mitigation |
|---|---|
| `nodejs_compat` + middleware → `[object Object]` SSR | Phase 1.1: `disable_nodejs_process_v2` flag |
| Free 10ms CPU cap drops requests silently | Phase 2.2: $5/month Paid plan |
| npm dep incompatible with workerd (silent) | Phase 1.3: `cf:dev` script exposes this locally |
| Auth cookie dropped during streaming | Phase 6: end-to-end auth flow check |
| `compatibility_date` advance causes silent behavior changes | Advance only in staging first |
| Wrangler token expires, no backup | Phase 2.3: store token in password manager |

---

## Files Modified by Phase 1 (automated)

| File | Change |
|---|---|
| `wrangler.jsonc` | Add `"disable_nodejs_process_v2"` to `compatibility_flags` |
| `package.json` | `@astrojs/cloudflare` → `^14.0.0`; add `"cf:dev": "wrangler dev"` |
| `.github/workflows/ci.yml` | Add `deploy` job with `cloudflare/wrangler-action@v3` |
