# Project Audit — fl-moodtracker

_Date: 2026-04-19_
_Scope: full repository — `apps/web`, `supabase/`, `scripts/`, root config_
_Context: transitioning from MVP to production. This audit is the punch-list for hardening the codebase before expansion._

---

## Executive summary

The app has a reasonable foundation — Next.js 15 App Router, React Query, Supabase SSR auth, Zod at most API boundaries, TypeScript strict mode on, RLS on user-data tables — but it is **not production-ready**. There is one critical key-leak risk, an SSRF in the AI vision endpoint, debug endpoints live in the deployed app, no CI, no tests, no structured logging, over-permissive database grants, and personal data / build artifacts tracked in git. Most issues are straightforward to fix; the hardening roadmap in §10 groups them into three phases.

### Top 5 production blockers

1. **`NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`** exists in `apps/web/.env.local`. The `NEXT_PUBLIC_` prefix inlines the value into client bundles. Assume the key is compromised — rotate it, rename the variable.
2. **Personal data + build artifacts tracked in git** — `networklogs.txt` (252 KB), `google_codenode.json` (Apple Watch export in Spanish), `id.txt`, `.DS_Store` files.
3. **SSRF in `/api/ai/vision`** — the server fetches any URL the client sends.
4. **`GRANT ALL ON ALL TABLES ... TO anon, authenticated`** in the initial migration — violates least privilege, makes every future table implicitly public.
5. **No CI/CD, no tests** — deploys reach prod with zero automated validation.

### Rough effort

- **Phase 0 (stop the bleeding):** ~1–2 focused days.
- **Phase 1 (pre-prod hardening):** ~1–2 weeks.
- **Phase 2 (polish):** ongoing alongside feature work.

---

## 1. Security

### Critical

**1.1 Service-role key in client-accessible env var**
`apps/web/.env.local` contains `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=...`. Next.js bundles any `NEXT_PUBLIC_*` var into client JS at build time. The service-role key bypasses RLS and grants full DB access.
**Fix:** rotate the key in Supabase immediately. Rename the env var to `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, `.env.example`, Vercel, and anywhere it is read. Grep for `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` in the codebase — if any client code reads it, that's the actual leak.

**1.2 SSRF in AI vision endpoint**
`apps/web/app/api/ai/vision/route.ts:77-86` — `analyzeWithGemini()` does `await fetch(imageUrl)` on a client-supplied URL. An attacker can target internal services, cloud metadata endpoints (`http://169.254.169.254/...`), or the Supabase admin API from the server's network context.
**Fix:** reject any URL that isn't from the app's own Supabase storage bucket. Ideally require the client to upload the image and pass a storage path, then the server pulls the signed URL itself.

**1.3 Debug / test DB endpoints deployed to production**
`apps/web/app/api/debug-db/route.ts` and `apps/web/app/api/test-db/route.ts` exist as deployed routes. They were likely added during MVP development and leak schema/connection info.
**Fix:** delete both, or wrap the handlers in `if (process.env.NODE_ENV === 'production') return new Response(null, { status: 404 })`.

**1.4 Over-permissive DB grants to anon/authenticated**
`supabase/migrations/000_init.sql:266-268`:
```sql
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
```
This counts on RLS being the only defense. Any table created without RLS enabled becomes world-readable and -writable (see **1.5**).
**Fix:** drop `GRANT ALL`; grant only `SELECT, INSERT, UPDATE, DELETE` per table explicitly, and add a new migration that revokes the existing grants. Treat RLS as a second line of defense, not the only one.

**1.5 `sync_log` table has no RLS enabled**
`supabase/migrations/005_sync_log.sql` — creates `sync_log` without `ENABLE ROW LEVEL SECURITY` and without policies. Combined with **1.4**, this table is readable and writable by any authenticated user and by anon. It contains operational data (sheet names, row counts, error messages, timestamps) and is written by the `sync-healthfit` edge function with the service-role key.
**Fix:** new migration enabling RLS on `sync_log` with no policies (service-role-only access, since the edge function uses the service role).

**1.6 `SECURITY DEFINER` function without caller identity check**
`supabase/migrations/000_init.sql:216-263` — `calculate_weekly_metrics(user_uuid, ...)` is declared `SECURITY DEFINER`, meaning it runs with the permissions of its owner (superuser). It enforces ownership only via `WHERE user_id = user_uuid` in its query, but does NOT verify that `auth.uid() = user_uuid` — any authenticated user can pass any other user's UUID and read their aggregates.
**Fix:** add `IF auth.uid() IS DISTINCT FROM user_uuid THEN RAISE EXCEPTION 'unauthorized'; END IF;` at the top of the function, or change to `SECURITY INVOKER` so RLS applies.

### High

**1.7 Middleware does not enforce route protection**
`apps/web/middleware.ts` only calls `supabase.auth.getUser()` to refresh the session — it never redirects unauthenticated users. Protection relies entirely on client-side hooks and RLS.
**Fix:** after `getUser()`, if `user` is null and the request path is under the protected area (everything except `/login`, `/auth/*`, public assets), return `NextResponse.redirect(new URL('/login', request.url))`.

**1.8 Wildcard CORS on authenticated API routes**
`vercel.json:41-56` — sets `Access-Control-Allow-Origin: *` on `/api/(.*)`. Combined with cookie-based auth, this is mitigated by browsers (credentialed CORS requires a specific origin, not `*`), but it is still wrong and an antipattern. Any non-credentialed request is also allowed from any origin.
**Fix:** set the header to the known frontend origin(s), or remove CORS entirely and let Next.js handle same-origin by default.

**1.9 Sync edge function callable without request auth**
`supabase/functions/sync-healthfit/index.ts:552` — `serve(async () => { ... })` never inspects the incoming request, so the function body runs regardless of caller identity. It reads `SYNC_USER_ID` from env and writes with the service-role key.
**Fix:** either deploy the function with `--no-verify-jwt=false` (Supabase's default JWT gate, confirmed still enabled) **and** verify the JWT maps to an admin user, or require an explicit shared-secret header matching a Supabase secret. Confirm current deploy setting.

**1.10 Error payloads leak internals**
Multiple API routes (`apps/web/app/api/ai/*/route.ts`) construct errors like `new Error(`OpenAI API error: ${response.status} - ${errorText}`)` and may surface that message to clients. `apps/web/app/api/storage/sign/route.ts:77` checks for a Zod error by substring-matching `'ZodError'` on the message — brittle and also means raw Zod messages can land on the client via unhandled paths.
**Fix:** centralize error handling. Log full detail server-side; return opaque `{ error: 'internal_error' }` + request ID to client.

**1.11 `/(app)/design` scratch page deployed**
`apps/web/app/(app)/design/page.tsx` is a design-system showcase exposed to every authenticated user. It's not sensitive by itself, but it's an attack surface for information-gathering.
**Fix:** delete, or gate on `NODE_ENV !== 'production'`.

### Medium

**1.12 No rate limiting**
AI routes (OpenAI/Gemini/Whisper) have no per-user throttle. A single malicious or buggy client can burn the billing budget.
**Fix:** middleware-level rate limiter (Upstash Redis, Vercel KV, or `next-safe-action`-style token bucket). Separate budget for AI endpoints vs. storage/auth.

**1.13 Input validation gaps**
- `apps/web/app/api/storage/sign/route.ts` — the `SignedURLRequestSchema` is used, but we did not confirm it bounds `expiresIn` (recommend 60–3600). Verify `apps/web/lib/validations.ts`.
- `apps/web/app/api/sync/route.ts` — confirm a Zod schema guards the body.
- The POST handler at `apps/web/app/api/storage/sign/route.ts:44-47` silently rewrites an out-of-prefix path to be under the user's prefix instead of returning 403. The GET handler at line 126 correctly rejects — make POST/PUT consistent and reject.

**1.14 Demo mode creates a fake session in memory**
`apps/web/lib/auth-context.tsx:252-298` — `signInDemo()` sets a synthetic `User` / `Session` in React state (`access_token: 'demo-access-token'`). This never authenticates with Supabase, so any actual API call will fail. It's not directly exploitable, but it creates a UI state where the user appears logged in without any backend session — confusing and brittle.
**Fix:** either build a real demo account with seeded data, or gate the function out of production builds.

**1.15 Auth callback error reflection**
`apps/web/app/auth/callback/route.ts` — verify that any `error_description` / `error` query parameter is URL-encoded before being redirected back into the app. Reflected errors can become XSS if rendered without escaping.

### Low

**1.16 Missing security headers**
`vercel.json` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. Missing: **CSP** (most important), `Strict-Transport-Security`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`.
**Fix:** add a strict CSP. Start with `default-src 'self'; connect-src 'self' *.supabase.co; img-src 'self' data: blob: *.supabase.co; style-src 'self' 'unsafe-inline'; script-src 'self'` and tighten from there.

**1.17 Service-role admin client has no audit trail**
`apps/web/lib/supabase-server.ts` exposes an admin client. Any use should be logged with user context + operation.

---

## 2. Code quality & TypeScript hygiene

### Must-fix before prod

**2.1 `any` escapes undermine TypeScript strict mode**
`tsconfig.json:11` has `strict: true` — good. But `apps/web/eslint.config.mjs:23-37` disables `@typescript-eslint/no-explicit-any` for three files:
- `lib/database.ts`
- `app/(app)/insights/page.tsx`
- `app/api/ai/insights/route.ts`

`app/api/ai/insights/route.ts` alone contains ~11 `any` casts. This is the app's biggest type-debt hotspot.
**Fix:** regenerate Supabase types (`supabase gen types typescript`), wire them through `lib/supabase-server.ts` / `supabase-browser.ts`, remove the ESLint exceptions, fix the resulting errors.

**2.2 No tests of any kind**
No vitest, jest, playwright, or test files exist anywhere in `apps/web`.
**Fix (minimum viable for prod):**
- `vitest` + `@testing-library/react` for hooks and pure utilities.
- API route tests using `next-test-api-route-handler` or similar (mock Supabase client).
- One Playwright smoke suite: login → create mood entry → view dashboard → sign out.
- Wire to GitHub Actions.

**2.3 Unchecked error handling + stack traces in console**
API routes do `console.error('... error:', error)` with the full error object, which in Vercel logs is fine but risks leaking via observability tooling if it's ever plumbed differently. More importantly, client hooks swallow errors silently in places.
**Fix:** centralized error utility — `logError(err, context)` server-side; `ErrorBoundary` at the route-group level client-side.

**2.4 Build config does not hide errors, but verify**
`apps/web/next.config.ts` — clean; no `ignoreBuildErrors` or `ignoreDuringBuilds`. Good. Confirm `npm run build` passes with lint errors as failures.

### Should-fix

**2.5 23+ raw `console.*` calls, no structured logger**
`.env.example` mentions `SENTRY_DSN`, but Sentry is not wired up. PostHog also referenced, not wired up.
**Fix:** install `@sentry/nextjs`, configure server+client DSNs, replace key `console.error` calls with `Sentry.captureException`. Optional: `pino` for server-side structured logs.

**2.6 Duplicate voice-recorder components**
`apps/web/components/upload/voice-recorder.tsx` (33 KB) and `apps/web/components/upload/simple-voice-recorder.tsx` (2.7 KB) co-exist. Only one is likely imported.
**Fix:** grep imports of each; delete the unused one.

**2.7 Profile page is a UX stub**
`apps/web/app/(app)/profile/page.tsx` — lines 181, 195, 209, 232 have `// TODO` comments inside handlers that only `console.log` and then show a success toast. The user will think their profile saved / data exported / account deleted when nothing happened. This is worse than not having the buttons.
**Fix:** implement, or remove the buttons until implemented. For data export and account deletion see **§8** (GDPR).

**2.8 Monorepo shape without workspaces**
`apps/web/` suggests a monorepo, but there's no root `package.json` or workspace config. The 93-byte root `package-lock.json` is a leftover stub.
**Fix:** decide — either delete `package-lock.json` at root and move everything up into the root, or adopt `npm workspaces` / `pnpm` with a proper root.

**2.9 Scratch files in app code**
- `apps/web/exercise.md` — design notes living in app root.
- `apps/web/app/(app)/design/page.tsx` — scratch UI.
**Fix:** move to `docs/` or delete.

### Nice-to-have

**2.10 No Prettier / lint-staged / husky.** Formatting drift over time. Add `prettier` + `lint-staged` + `husky` pre-commit hook.

**2.11 No error boundary components.** Data hooks are robust but uncaught render errors in client components show the default Next.js error.

**2.12 Flat components folder.** Only mildly organized (`ui/`, `upload/`, `entry/`, `skeletons/`). Fine for current size; revisit as the app grows.

---

## 3. Repository & project structure

**3.1 Tracked files that should not be in git**
Via `git ls-files`:
- `networklogs.txt` — 252 KB of raw logs.
- `id.txt` — empty.
- `google_codenode.json` — personal Apple Watch workout export, Spanish field names, contains workout times/dates/heart rates. **Personal health data in a public-ish repo is a privacy problem.**
- `.DS_Store` files at repo root and in `supabase/` (and possibly `supabase/functions/`). Already ignored in `.gitignore:39` but already tracked — git ignore doesn't retroactively untrack.

**Fix:**
```bash
git rm --cached networklogs.txt id.txt google_codenode.json
git rm --cached .DS_Store supabase/.DS_Store supabase/functions/.DS_Store
git commit -m "chore: remove tracked junk and personal data"
```
For the personal health export (`google_codenode.json`, `networklogs.txt` if sensitive), history rewrite is worth considering — `git filter-repo --invert-paths --path google_codenode.json --path networklogs.txt` — since `git rm` leaves the content in history. Decide based on whether the repo is or will become public.

**3.2 Root `package-lock.json` is a 93-byte stub.** Delete.

**3.3 Root `.gitignore` and `apps/web/.gitignore` diverge.**
- Root ignores `.env.local` but it lives under `apps/web/` — covered by `**/.env.local` at line 5. Good.
- `apps/web/.gitignore:40` ignores `*.tsbuildinfo` — good. Verify with `git ls-files | grep tsbuildinfo` that it isn't tracked.

**3.4 Product name drift.**
- `README.md:1` — "fl-moodtracker"
- `package.json:2` — `"name": "web"` (app package), `vercel.json:3` — `"name": "sofi-wellness-web"`
- `docs/01-architecture.md` and `apps/web/public/sw.js:1` — "Pulse"
- `apps/web/lib/auth-context.tsx:259` — `demo@pulse.app`

**Fix:** pick one name, propagate. Update `vercel.json.name`, all docs, service-worker cache name, demo email.

**3.5 `scripts/backfill_historical.py`.** Document status. If one-shot, move to `docs/` or archive. If ongoing, add argparse, env validation, and a README.

---

## 4. Database & Supabase

**4.1 RLS coverage — partial.** `mood_entries`, `food_entries`, `insights`, `streaks`, `user_preferences` all have RLS + per-user policies (`000_init.sql:86-156`). Good. `sync_log` does not (see **1.5**). Audit every subsequent migration (`002` through `008`) for `ENABLE ROW LEVEL SECURITY` + policies on any new user tables. (Not re-verified line-by-line here; should be part of the Phase 0 pass.)

**4.2 Migration idempotency.** `000_init.sql` uses bare `CREATE TABLE`, `CREATE TYPE`, `CREATE POLICY`, `CREATE TRIGGER`. Re-running the migration fails. Later migrations (`002`–`008`) use `IF NOT EXISTS`, which is the right pattern.
**Fix:** leave `000_init.sql` alone (it's historical), but establish the convention for all new migrations.

**4.3 Trigger on `auth.users`.** `000_init.sql:208-210` — `CREATE TRIGGER create_user_preferences_trigger AFTER INSERT ON auth.users`. Writing triggers on Supabase's managed `auth.users` is risky — it can break sign-up flows if the trigger raises. Verify it's wrapped in error-tolerant logic, or move to the `handle_new_user` pattern that Supabase docs recommend.

**4.4 Edge function auth.** `supabase/functions/sync-healthfit/index.ts:552` doesn't introspect the request (see **1.9**). Other functions (e.g., `ai-speech`) do verify the user. Inconsistent.

**4.5 Storage bucket policies.** `000_init.sql:212-213` notes that bucket policies are set "separately via Supabase dashboard or CLI" — i.e., not in migrations. This is a configuration-drift risk: the security of `food-photos` and `voice-notes` buckets is undocumented and not version-controlled.
**Fix:** codify bucket policies in a migration (`CREATE POLICY ... ON storage.objects`) so they can be recreated on a fresh project.

---

## 5. Infrastructure / CI-CD / deploy

**5.1 No CI/CD.** No `.github/workflows/`, no pre-merge gates. Vercel auto-deploys whatever lands on `main`.
**Fix — minimum viable CI (`.github/workflows/ci.yml`):**
- On PR: `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, run tests.
- Block merge on failure.
- Optional: `trufflehog` / `gitleaks` secret scan; `npm audit --production`.

**5.2 Vercel catch-all rewrite may conflict with App Router.**
`vercel.json:81-84`:
```json
"rewrites": [
  { "source": "/((?!api|_next|_static|favicon.ico|sw.js|manifest.json|icons).*)",
    "destination": "/" }
]
```
This rewrites every non-listed path to `/`. For Next.js App Router with SSR pages at `/dashboard`, `/health`, etc., this is almost certainly wrong — it either does nothing (Next.js routes match first) or masks real routes.
**Fix:** remove the rewrite; let Next.js App Router handle routing. If it was for SPA-style 404 fallback from an earlier iteration, it's vestigial.

**5.3 PWA cache versioning is static.**
`apps/web/public/sw.js:1` — `const CACHE_NAME = 'pulse-v1'`. Deploys don't bust the cache, so returning users may be stuck on old assets indefinitely.
**Fix:** tie cache name to build hash (`NEXT_PUBLIC_BUILD_ID` injected at build time), or regenerate via `next-pwa` / `@serwist/next` rather than hand-rolling.

**5.4 Secrets hygiene in deploys.** With no CI, secrets live only in `.env.local` + Vercel dashboard. No rotation policy, no inventory.
**Fix:** maintain `docs/05-operations-runbook.md` as the source of truth for what lives where, who rotates when.

---

## 6. Observability & operations

**6.1 No error tracking deployed.** `.env.example` lists `SENTRY_DSN` and `POSTHOG_API_KEY` but neither is wired up. For production, errors and 5xx spikes will be invisible.
**Fix:** `@sentry/nextjs` with server + client + edge runtime configs. Filter noise before shipping.

**6.2 No structured logging.** 23+ `console.log` / `console.error` calls scattered across routes. Vercel collects them but correlation is hard.
**Fix:** introduce `pino` (server) or a lightweight context-carrying logger. Attach a `request_id` per incoming request.

**6.3 Operational runbook exists (`docs/05-operations-runbook.md`)**, which is good. Cross-check it against current code — the README flags that some older files reference previous env naming conventions.

---

## 7. Testing

Zero coverage. Minimum viable pre-production target:

| Layer | Tool | Scope |
|-------|------|-------|
| Unit (utils, lib) | vitest | `lib/activity.ts`, `lib/range-utils.ts`, date math |
| Hooks | vitest + RTL | all 8 `hooks/use*Data.ts` — error states, empty states |
| API routes | `next-test-api-route-handler` | every route in `app/api/**`, mocked Supabase — at minimum: 401 without session, 400 on bad input, 200 happy path |
| Auth flows | Playwright | sign-in, sign-out, session refresh |
| Smoke | Playwright | login → log mood → see it on dashboard |

Gate merges on green tests. Target coverage: 60% for a realistic first goal; push to 80% after stabilization.

---

## 8. Compliance & data handling

This app stores **personal health data** (food logs, workouts, heart rate, mood, voice recordings, photos). Even if no specific regulation applies today, GDPR-style obligations are a realistic near-term concern.

**8.1 Data export unimplemented.** `apps/web/app/(app)/profile/page.tsx:209` — `handleExportData` logs and fakes success. There is no export pipeline.
**Fix:** server route that bundles user's mood/food/insights/streaks + signed URLs for their photos/voice into a zip or JSON, emailed or downloaded.

**8.2 Account deletion unimplemented.** `handleDeleteAccount` at line 232 doesn't delete anything. User rows, storage objects, and auth user must all be cleared.
**Fix:** server route with service-role client that cascades deletion (auth user deletion already cascades via `ON DELETE CASCADE` on `user_id` FKs — see `000_init.sql:14`). Separately delete storage objects under `{user_id}/` prefix in both buckets.

**8.3 Privacy-adjacent: `google_codenode.json` checked into git** (see **3.1**) — personal workout data of the repo owner. Either the repo must stay private, or history needs to be rewritten.

**8.4 Voice recordings + photos in buckets.** Confirm retention policy — are voice notes kept forever? Does the user have UI to delete individual entries along with their storage objects, or just the DB row? (The DB cascade doesn't clean storage.)

---

## 9. Dependencies

**9.1 `shadcn` in `dependencies`.** `apps/web/package.json:32` — `"shadcn": "^4.2.0"`. This is the CLI used to scaffold components; it belongs in `devDependencies`. Moving it avoids shipping unnecessary bytes and tightens the supply-chain surface.

**9.2 `radix-ui` v1.4.3 as a single package.** Unusual — Radix primitives normally install as separate `@radix-ui/react-*` packages. Verify this resolves correctly and includes what shadcn needs; consider migrating to per-primitive imports if it causes bundle bloat.

**9.3 React 19 + Next 15.** Fine, but verify all third-party components (leaflet, recharts, react-hook-form, next-themes) are fully compatible with React 19's stricter rendering. If anything silently errors in production, it'll surface in Sentry once that's wired.

**9.4 `@jridgewell/gen-mapping` as direct dep.** That's a source-maps util normally a transitive dep. If nothing in app code imports it directly, remove.

**9.5 No lockfile audit.** Add `npm audit --production` to CI; set a severity threshold for failure.

---

## 10. Prioritized remediation roadmap

### Phase 0 — Stop the bleeding (do before any further feature work)

- [ ] **Rotate** the Supabase service-role key. Rename env var to `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_`) in `.env.local`, `.env.example`, Vercel dashboard, and any reader.
- [ ] **Purge** tracked junk: `git rm --cached networklogs.txt id.txt google_codenode.json` + all `.DS_Store`. Decide on history rewrite for personal data.
- [ ] **Delete or gate** `app/api/debug-db/route.ts` and `app/api/test-db/route.ts`.
- [ ] **Patch SSRF** in `app/api/ai/vision/route.ts` — restrict to own storage.
- [ ] **New migration** — revoke `GRANT ALL`; enable RLS on `sync_log`; add `auth.uid()` guard to `calculate_weekly_metrics`.
- [ ] **Review** `sync-healthfit` edge function auth stance; require JWT or shared-secret.

### Phase 1 — Pre-production hardening

- [ ] GitHub Actions CI: install, typecheck, lint, build, test on every PR. Block merge on fail.
- [ ] Enforce auth in `middleware.ts` — redirect unauthenticated users off protected routes.
- [ ] Consistent Zod validation + centralized error handler on every route in `app/api/**`. Opaque 500s with request IDs.
- [ ] Wire Sentry (server + client + edge). Remove or reclassify most `console.*` calls.
- [ ] CORS: replace `Access-Control-Allow-Origin: *` with known origins, or drop the block entirely.
- [ ] Test scaffolding + one smoke E2E.
- [ ] Rate limit AI endpoints.
- [ ] Remove the suspicious Vercel rewrite (or justify and document it).
- [ ] Tighten security headers — add CSP, HSTS.

### Phase 2 — Production-grade polish

- [ ] Remove the three ESLint `no-explicit-any` exceptions. Regenerate Supabase types. Eliminate remaining `any`.
- [ ] Implement profile: save, preferences, export (§8.1), delete-account (§8.2).
- [ ] Codify storage bucket policies in a migration.
- [ ] PWA cache name tied to build hash.
- [ ] Dedupe voice recorder components. Delete `design/page.tsx`. Delete `apps/web/exercise.md`.
- [ ] Decide monorepo shape — flatten or adopt workspaces. Delete root `package-lock.json` stub.
- [ ] Standardize product name across README, `vercel.json`, `sw.js`, demo email, docs.
- [ ] Add Prettier + `lint-staged` + `husky`.
- [ ] Move `shadcn` to devDependencies. Audit `radix-ui` meta-package and stray transitive deps.
- [ ] Structured logging with request correlation.
- [ ] Document env-var inventory + rotation cadence.

---

## Appendix — files referenced in this audit

- `apps/web/.env.local`, `apps/web/.env.example`, root `.env.example`
- `apps/web/middleware.ts`
- `apps/web/app/api/ai/{vision,speech,text,insights}/route.ts`
- `apps/web/app/api/{debug-db,test-db,sync,storage/sign}/route.ts`
- `apps/web/app/auth/callback/route.ts`
- `apps/web/app/(app)/{profile,design}/page.tsx`
- `apps/web/lib/{supabase-server,supabase-browser,auth-context,database,validations}.ts`
- `apps/web/eslint.config.mjs`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/package.json`
- `apps/web/public/sw.js`
- `apps/web/components/upload/{voice-recorder,simple-voice-recorder}.tsx`
- `vercel.json`
- `supabase/migrations/000_init.sql` .. `008_insights_report.sql`
- `supabase/functions/{sync-healthfit,ai-speech,...}/index.ts`
- `scripts/backfill_historical.py`
- `.gitignore` (root + `apps/web`)
- Root junk: `networklogs.txt`, `id.txt`, `google_codenode.json`, `package-lock.json` (stub), `.DS_Store` files
