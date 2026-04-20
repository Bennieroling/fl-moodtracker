# Pulse — Agent Repo Backlog

_Created: 2026-04-19_
_For: Claude Code, Codex, or any other coding agent working in the repo._

This file is work an AI coding agent can drive end-to-end with human
confirmation on each change. It covers the Next.js app, Edge Functions,
env var hygiene, git cleanup, CI/CD, tests, and observability.

The companion file `TODO-manual-supabase.md` covers SQL-only work that
the user runs manually in the Supabase SQL Editor. When a task here
has a prerequisite or companion task there, it's called out inline
(e.g. "pairs with `TODO-manual-supabase.md` A3").

## How to use this file as an agent

1. Work top-to-bottom within a phase. Each task has a **Context**,
   **Change**, and **Verify** block.
2. **Before editing any file**, read it and the surrounding code.
   Many tasks have subtler scope than the summary suggests.
3. **Don't batch unrelated changes into one commit.** One task = one
   commit (or one PR). Easier to review and revert.
4. After each change, run:
   - `npm run lint`
   - `npx tsc --noEmit`
   - `npm run build`
   - whatever tests exist (none yet — task R-P1.3 adds scaffolding)
5. **Confirm with the user before any irreversible action**: rotating
   keys, rewriting git history, deleting tables referenced by code.

## Legend

- 🔒 Security  🐛 Bug  🚧 Multi-user blocker  🧹 Tech debt
- ✨ Improvement  🧪 Tests/CI  📦 Dep/config  📝 Docs
- **S** under 30 min · **M** 1–2 hours · **L** half-day+

---

## Phase P0 — Stop the bleeding (before any feature work)

### R-P0.1 Rotate and rename `SUPABASE_SERVICE_ROLE_KEY`  🔒 S

**Context**

`apps/web/.env.local` has `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=...`.
The `NEXT_PUBLIC_` prefix inlines the value into client JS bundles at
build time. Anyone inspecting the compiled site has this key. It
bypasses RLS.

**Change**

1. **Human does first (can't be automated):** generate a new
   service-role key in Supabase Dashboard → Project Settings → API →
   Reset service role key.
2. Update `.env.local` in `apps/web/`:
   - Remove: `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=...`
   - Add: `SUPABASE_SERVICE_ROLE_KEY=<new-key>`
3. Update `apps/web/.env.example` and any root `.env.example` to the
   new name (value placeholder only).
4. Grep the whole repo — not just `apps/web/` — for every reader of
   the old name:
   ```bash
   rg 'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY'
   ```
   For every match, change it to `SUPABASE_SERVICE_ROLE_KEY`.
   **If any match is in a file under `app/` or `components/` (i.e.
   client-side code), flag it — that's the actual leak.**
5. **Human does:** update `SUPABASE_SERVICE_ROLE_KEY` in Vercel
   project settings, delete the old `NEXT_PUBLIC_...` entry.
6. Redeploy.

**Verify**

```bash
rg 'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY'
# Expect: no matches

# After redeploy, the key should NOT appear in any client bundle:
curl -s https://health.festinalente.dev/ | grep -o 'eyJ[A-Za-z0-9_-]\+' || echo "no JWTs in HTML"
```

☐ Done

---

### R-P0.2 Patch SSRF in `/api/ai/vision`  🔒 S

**Context**

`apps/web/app/api/ai/vision/route.ts:77-86` does
`await fetch(imageUrl)` on a client-supplied URL. An attacker can
target cloud metadata endpoints (`http://169.254.169.254/...`),
internal Supabase admin APIs, etc.

**Change**

Options ranked preferred-first:

1. **Best:** require a storage path instead of a URL. Client uploads
   to Supabase Storage, sends the path, server creates its own signed
   URL and fetches that.
2. **Acceptable:** validate the incoming URL is on the project's own
   Supabase storage host:
   ```typescript
   const url = new URL(imageUrl);
   const allowedHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host;
   if (url.host !== allowedHost) {
     return NextResponse.json({ error: 'unauthorized_host' }, { status: 400 });
   }
   if (url.protocol !== 'https:') {
     return NextResponse.json({ error: 'https_required' }, { status: 400 });
   }
   ```
3. Add to the route's Zod schema: a URL shape check so non-URLs are
   rejected earlier.

**Verify**

Manually POST with a non-Supabase URL (e.g.
`http://169.254.169.254/latest/meta-data`) and confirm a 400 before
anything external is fetched.

☐ Done

---

### R-P0.3 Delete or gate debug/test DB endpoints  🔒 S

**Context**

`apps/web/app/api/debug-db/route.ts` and
`apps/web/app/api/test-db/route.ts` are in the deployed app. They
leak schema/connection info.

**Change**

Preferred: **delete both files.** If a reason to keep them exists,
gate each handler:

```typescript
export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return new Response(null, { status: 404 });
  }
  // ... existing handler
}
```

**Verify**

```bash
rg 'api/(debug|test)-db' --type ts
# Expect: no results, or only the gated handlers
```

Post-deploy:
```bash
curl -i https://health.festinalente.dev/api/debug-db
# Expect: 404
```

☐ Done

---

### R-P0.4 Purge tracked junk from git  🔒 S

**Context**

These files are in the repo:
- `networklogs.txt` (252 KB of raw network logs)
- `google_codenode.json` (personal Apple Watch export, Spanish field
  names, contains HR/timestamps)
- `id.txt` (empty)
- Various `.DS_Store` files

**Change**

```bash
git rm --cached networklogs.txt id.txt google_codenode.json
git rm --cached .DS_Store supabase/.DS_Store 2>/dev/null || true
# catch any others
git ls-files | grep -E '(\.DS_Store$|\.log$)' | xargs -r git rm --cached
git commit -m "chore: remove tracked junk and personal health data"
```

**⚠️ Critical confirmation before anything irreversible:**

`git rm --cached` leaves the files in git history. If the repo is or
may become public, history rewriting is needed:

```bash
# DESTRUCTIVE — requires force-push and invalidates existing clones
git filter-repo --invert-paths \
  --path networklogs.txt \
  --path google_codenode.json
```

**Do not run the filter-repo step without explicit human
confirmation.** Ask:
- Is the repo private now?
- Will it ever be public?
- Are there active collaborators whose clones would be invalidated?

**Verify**

```bash
git ls-files | grep -E '(networklogs|google_codenode|id\.txt|\.DS_Store)'
# Expect: no output
```

Update `.gitignore` in `apps/web/` and root to cover these patterns
so they can't sneak back.

☐ Done

---

### R-P0.5 Harden the `ingest-hae` Edge Function  🔒 S

**Context**

`supabase/functions/ingest-hae/index.ts` logs the full `HAE_API_KEY`
and received token on every request (see `04-edge-functions.md §
Known issues`).

**Change**

Delete these three lines from the function:

```typescript
console.log("apiKey from env:", apiKey ? `"${apiKey}" (len=${apiKey.length})` : "NOT SET");
console.log("token from header:", `"${token}" (len=${token.length})`);
console.log("match:", token === apiKey);
```

Redeploy:
```bash
supabase functions deploy ingest-hae
```

**Verify**

Trigger a push (via HAE or curl test in the runbook), then check
Supabase Dashboard → Edge Functions → `ingest-hae` → Logs. The key
should no longer appear.

> **Follow-up:** because the key was in logs for an unknown period,
> also rotate `HAE_API_KEY`. That's handled as part of R-C1 — don't
> rotate yet if multi-user work (Phase C) is near, since the key
> goes away entirely there.

☐ Done

---

### R-P0.6 Review `sync-healthfit` Edge Function auth stance  🔒 S

**Context**

`supabase/functions/sync-healthfit/index.ts:552` — `serve(async () =>
{ ... })` never inspects the incoming request. Runs with service-role
regardless of caller.

**Change**

Two options:

1. **If still in use:** add JWT verification at the top, OR require a
   shared-secret header matched against a Supabase secret.
2. **If legacy (HAE pipeline replaced it):** delete the function and
   any references to it:
   ```bash
   rg 'sync-healthfit' --type ts
   # Check what's still calling it
   supabase functions delete sync-healthfit  # if nothing does
   ```

**Verify**

If kept: call the function without a JWT and confirm a 401. If
deleted: `supabase functions list` no longer shows it.

☐ Done

---

## Phase P1 — Pre-production hardening

### R-P1.1 Enforce auth in middleware  🔒 M

**Context**

`apps/web/middleware.ts` refreshes the session but never redirects
unauthenticated users. Protection relies on client-side hooks and
RLS — which means any public route briefly shows skeleton UI to
unauthenticated scraping.

**Change**

After `supabase.auth.getUser()`:

```typescript
const { data: { user } } = await supabase.auth.getUser();

const publicPaths = ['/login', '/auth', '/_next', '/favicon.ico', '/sw.js', '/manifest.json'];
const isPublic = publicPaths.some(p => request.nextUrl.pathname.startsWith(p));

if (!user && !isPublic) {
  return NextResponse.redirect(new URL('/login', request.url));
}
```

Match the matcher config to include all routes (the middleware may
currently only run on a subset).

**Verify**

- `curl -I https://health.festinalente.dev/dashboard` without
  cookies → 307/302 to `/login`
- Logged-in browsing still works

☐ Done

---

### R-P1.2 Centralize error handling + Zod validation  🔒 M

**Context**

`apps/web/app/api/storage/sign/route.ts:77` substring-matches
`'ZodError'` on error messages — brittle and also means raw Zod
messages can reach clients. Several AI routes surface upstream error
messages (OpenAI, Gemini) verbatim to clients.

**Change**

1. Create `apps/web/lib/api-handler.ts` with a wrapper:
   ```typescript
   export function apiHandler<T>(
     schema: z.ZodSchema<T>,
     handler: (req: Request, parsed: T) => Promise<Response>
   ) {
     return async (req: Request) => {
       const requestId = crypto.randomUUID();
       try {
         const body = await req.json();
         const parsed = schema.parse(body);
         return await handler(req, parsed);
       } catch (err) {
         if (err instanceof z.ZodError) {
           return Response.json({ error: 'invalid_input', requestId }, { status: 400 });
         }
         console.error(`[${requestId}]`, err);
         return Response.json({ error: 'internal_error', requestId }, { status: 500 });
       }
     };
   }
   ```
2. Convert routes one at a time (`storage/sign`, `sync`, AI routes).
   Don't attempt all in one commit.

3. Also fix the POST handler in `storage/sign/route.ts:44-47` — it
   silently rewrites out-of-prefix paths instead of returning 403.
   GET already rejects. Make POST/PUT consistent: reject with 403.

**Verify**

- Bad JSON → 400 with `invalid_input`
- Good request → 200 as before
- No Zod internals in response bodies

☐ Done

---

### R-P1.3 CI: GitHub Actions  🧪 M

**Context**

No CI at all today. Deploys reach prod with zero validation.

**Change**

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  quality:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: apps/web/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm run build
      # tests added by R-P1.4
```

Set branch protection on `main` to require this check.

**Verify**

Open a PR with an intentional TS error. CI fails. Fix. CI passes.

☐ Done

---

### R-P1.4 Test scaffolding  🧪 M

**Context**

Zero tests exist.

**Change**

1. Add Vitest + RTL:
   ```bash
   cd apps/web
   npm i -D vitest @testing-library/react @testing-library/jest-dom happy-dom
   ```
2. Create `apps/web/vitest.config.ts` and `apps/web/src/test-setup.ts`.
3. Write 3 tests to prove the scaffolding:
   - A unit test for one function in `lib/range-utils.ts` or
     `lib/activity.ts`
   - A hook test for `useMoodData` (mock the Supabase client)
   - An API route test for `api/storage/sign` happy path
4. Add `"test": "vitest run"` to `apps/web/package.json`.
5. Update CI (`R-P1.3`) to run `npm test`.

More tests come over time (task R-P2.3). Goal here is: pipeline
works.

**Verify**

```bash
npm test
# All green
```

☐ Done

---

### R-P1.5 Wire Sentry  ✨ M

**Context**

`.env.example` mentions `SENTRY_DSN` but nothing is wired.
Production 5xxs are invisible.

**Change**

```bash
npm i @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

After the wizard:
- Confirm `SENTRY_DSN` is in Vercel env (not `NEXT_PUBLIC_SENTRY_DSN`
  unless intentional for client-side).
- Filter noise: add `beforeSend` to drop
  `ResizeObserver loop limit exceeded` and 4xx client errors.
- Replace the most-important `console.error` calls in API routes
  with `Sentry.captureException(err, { tags: { requestId } })`.

**Verify**

Temporarily throw in one API route and confirm the event shows up in
Sentry within a minute.

☐ Done

---

### R-P1.6 Rate-limit AI endpoints  ✨ M

**Context**

AI routes (OpenAI, Gemini, Whisper) have no per-user throttle. One
buggy client can burn the monthly AI budget.

**Change**

Use Upstash Redis + `@upstash/ratelimit`:

```typescript
// apps/web/lib/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const aiRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, "1 h"),
});
```

In each AI route:

```typescript
const { success } = await aiRateLimit.limit(`ai:${userId}`);
if (!success) return Response.json({ error: 'rate_limited' }, { status: 429 });
```

**Verify**

Hit the endpoint 21 times in an hour — 21st call returns 429.

☐ Done

---

### R-P1.7 Fix CORS  🔒 S

**Context**

`vercel.json:41-56` sets `Access-Control-Allow-Origin: *` on
`/api/(.*)`. Not directly exploitable (credentialed CORS requires
specific origin, not `*`), but wrong.

**Change**

Either:
- Remove the `headers` block for `/api/(.*)` entirely (let Next.js
  default same-origin), OR
- Set the origin to the known frontend:
  ```json
  { "key": "Access-Control-Allow-Origin", "value": "https://health.festinalente.dev" }
  ```

**Verify**

```bash
curl -i -H 'Origin: https://example.com' https://health.festinalente.dev/api/sync
# Expect: no Access-Control-Allow-Origin header (or the specific allowed origin)
```

☐ Done

---

### R-P1.8 Remove suspicious Vercel rewrite  🐛 S

**Context**

`vercel.json:81-84`:

```json
"rewrites": [
  { "source": "/((?!api|_next|_static|favicon.ico|sw.js|manifest.json|icons).*)",
    "destination": "/" }
]
```

This tries to rewrite every non-listed path to `/` — SPA fallback
behavior that conflicts with App Router SSR pages.

**Change**

Delete the `rewrites` block. Test dashboard, health, calendar pages
still load.

**Verify**

`curl -I https://health.festinalente.dev/dashboard` → 200, not 307.

☐ Done

---

### R-P1.9 Tighten security headers  🔒 M

**Context**

Missing CSP, HSTS, COOP, CORP.

**Change**

Add to `vercel.json` (or `next.config.ts` via `headers()`):

```json
{ "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
{ "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
{ "key": "Content-Security-Policy",
  "value": "default-src 'self'; connect-src 'self' *.supabase.co *.sentry.io; img-src 'self' data: blob: *.supabase.co; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'" }
```

Deploy and watch the Sentry/console for CSP violations for a day;
tighten `unsafe-inline` on `script-src` afterward (usually requires
Next.js nonce support).

**Verify**

`securityheaders.com` → at least A grade.

☐ Done

---

## Phase C — Multi-user (coordinate with `TODO-manual-supabase.md` Phase C)

### R-C1 Rewrite `ingest-hae` for per-user tokens  🚧 M

**Context**

Pairs with manual tasks `C1`, `C2`, `C3`. Run this between the
user's C3 and C4 — see the pause point in the manual file.

**Change**

In `supabase/functions/ingest-hae/index.ts`:

1. Replace the shared-key check with a token lookup:

   ```typescript
   const { data: tokenRow, error: tokenErr } = await supabase
     .from('hae_ingest_tokens')
     .select('user_id')
     .eq('token', token)
     .is('revoked_at', null)
     .maybeSingle();

   if (tokenErr || !tokenRow) {
     return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
   }

   const userId = tokenRow.user_id;

   // Fire-and-forget audit trail
   supabase.from('hae_ingest_tokens')
     .update({ last_used_at: new Date().toISOString() })
     .eq('token', token);
   ```

2. Include `user_id: userId` in every row inserted into
   `staging_hae_metrics`, `staging_hae_workouts`, `staging_hae_other`.

3. Remove the `HAE_API_KEY` env var reading. (Don't delete the
   secret in Supabase yet — wait until the new flow is confirmed
   working for a few HAE cycles.)

4. Deploy:
   ```bash
   supabase functions deploy ingest-hae
   ```

5. **Human does:** in HAE on iPhone, rotate the token in each
   automation's Authorization header. Run each once manually.

**Verify**

```sql
-- Recent staging rows should carry user_id:
SELECT user_id, COUNT(*) FROM staging_hae_metrics
WHERE received_at > NOW() - INTERVAL '30 min'
GROUP BY user_id;
-- Expect: 1 or more rows, user_id matches the token owner

-- Token last_used_at is updating:
SELECT label, last_used_at FROM hae_ingest_tokens;
```

Then let the user proceed with their C4 task.

1. Deployed `supabase functions deploy ingest-hae`
2. HAE on Iphone from Ben updated.
3. ran
    ```sql
    SELECT user_id, COUNT(*) FROM staging_hae_metrics                                                                                                                 
  WHERE received_at > NOW() - INTERVAL '30 min'                                                                                                                     
  GROUP BY user_id;  
    ```

Then:
```sql
SELECT label, last_used_at FROM hae_ingest_tokens;
```
| label                | last_used_at |
| -------------------- | ------------ |
| Primary iPhone (Ben) | null         |


☐ Done

---

## Phase P2 — Production-grade polish

### R-P2.1 Remove `any` escapes and regenerate Supabase types  🧹 M

**Context**

`apps/web/eslint.config.mjs:23-37` disables
`@typescript-eslint/no-explicit-any` for:
- `lib/database.ts`
- `app/(app)/insights/page.tsx`
- `app/api/ai/insights/route.ts` (~11 casts alone)

**Change**

1. Regenerate types:
   ```bash
   npx supabase gen types typescript --project-id sxawzzcpmiakltfjpzcn > apps/web/lib/database.types.ts
   ```
2. Wire them through:
   ```typescript
   // supabase-server.ts / supabase-browser.ts
   import type { Database } from './database.types';
   createClient<Database>(...)
   ```
3. Remove the three `no-explicit-any` exceptions in eslint config.
4. Fix the errors that surface — mostly in `api/ai/insights/route.ts`.

**Verify**

```bash
npm run lint
# Expect: 0 @typescript-eslint/no-explicit-any errors, or an explicit
# decision to keep any specific one with inline `// eslint-disable-next-line`
```

☐ Done

---

### R-P2.2 Implement profile page handlers (GDPR basics)  🧹 L

**Context**

`apps/web/app/(app)/profile/page.tsx` has four handlers that only
`console.log` and show a success toast. The user thinks data
saved/exported/deleted when nothing happened. Worse than no buttons.

**Change**

Per handler (lines 181 / 195 / 209 / 232):

1. **Save profile** — actually update `auth.users.user_metadata` or
   `user_preferences` as appropriate.
2. **Export data** — new server route at `/api/me/export`:
   - Reads all rows for `auth.uid()` from: `mood_entries`,
     `food_entries`, `insights`, `streaks`, `user_preferences`,
     `health_metrics_daily`, `health_metrics_body`,
     `exercise_events`, `state_of_mind`, `ecg_readings`,
     `heart_rate_notifications`, `sleep_events`.
   - Generates signed URLs (expiring) for the user's storage
     objects.
   - Returns a JSON blob, or emails a link (pick simpler first).
3. **Delete account** — new server route at `/api/me/delete`:
   - Uses service-role admin client to delete the auth.users row.
     FK cascades clean up most tables.
   - Also deletes all storage objects under `{user_id}/` in each
     bucket (FK cascade does NOT clean storage).
   - Logs out the client.

Or: remove the three unimplemented buttons until the work ships.
That's acceptable too — just stop lying to the user.

**Verify**

Export returns real data. Delete actually empties the user's
records. Both are idempotent (or respond 404 gracefully if already
done).

☐ Done

---

### R-P2.3 Expand test coverage to 60%  🧪 L

**Context**

R-P1.4 set up the pipeline. This task builds actual coverage.

**Change**

| Layer | Tool | Scope |
|---|---|---|
| Unit | vitest | All of `lib/` — range-utils, activity, date math, validations |
| Hooks | vitest + RTL | All 8 `hooks/use*Data.ts` — error/empty/happy paths |
| API routes | `next-test-api-route-handler` | Every route in `app/api/**`: 401 without session, 400 on bad input, 200 happy |
| Smoke E2E | Playwright | login → log mood → see on dashboard → log food → sign out |

Target 60% coverage reported by vitest. Block merges below it.

☐ Done

---

### R-P2.4 Remove duplicate voice-recorder  🧹 S

**Context**

`apps/web/components/upload/voice-recorder.tsx` (33 KB) and
`apps/web/components/upload/simple-voice-recorder.tsx` (2.7 KB)
co-exist. Only one is actually imported.

**Change**

```bash
rg -l "from.*upload/voice-recorder'" --type ts --type tsx
rg -l "from.*upload/simple-voice-recorder'" --type ts --type tsx
```

Delete whichever isn't imported. If both are imported in different
places, consolidate (pick one, migrate callers).

☐ Done

---

### R-P2.5 Remove scratch files and dead routes  🧹 S

**Context**

- `apps/web/exercise.md` — design notes living in app root
- `apps/web/app/(app)/design/page.tsx` — scratch UI shown to every
  authenticated user

**Change**

```bash
rm apps/web/exercise.md  # or move to docs/
rm -rf apps/web/app/\(app\)/design
```

Grep for imports of `design` — none should exist.

☐ Done

---

### R-P2.6 Frontend audit for legacy DB columns  🐛 M

**Context**

Pairs with manual tasks D1 and D2. Before the user drops columns,
confirm nothing in the frontend reads them.

**Change**

Grep for each candidate column name:

```bash
# from manual D1 / D2
for col in exercise_minutes total_energy_kcal average_heart_rate distance_km vo2max \
           avg_hr min_hr max_hr total_minutes move_minutes sheet_row_number \
           hr_zone_type trimp rpe; do
  echo "=== $col ===";
  rg --type ts --type tsx "\b$col\b" apps/web;
done
```

For each match:
- If it's a genuine read, either (a) migrate the code to the
  replacement column, or (b) flag the column as KEEP in the manual
  file.
- If it's a type definition or auto-generated type, fine — those
  regenerate after manual D1/D2.

Report findings back to the user in a summary comment on the manual
file.

☐ Done

---

### R-P2.7 Fix PWA cache invalidation  🧹 S

**Context**

`apps/web/public/sw.js:1` — `const CACHE_NAME = 'pulse-v1'`.
Deploys don't bust the cache. Users stuck on old assets forever.

**Change**

Either:
1. **Quick fix:** inject `NEXT_PUBLIC_BUILD_ID` at build time and
   interpolate it into `CACHE_NAME`. Requires a build-time
   preprocessor for `sw.js` (next.config.ts can do this via a
   webpack plugin or a build script).
2. **Proper fix:** adopt `@serwist/next` and let it handle cache
   versioning.

Option 2 is more work but removes a class of bugs.

**Verify**

Deploy, open DevTools → Application → Service Workers → confirm the
cache name changes per deploy.

☐ Done

---

### R-P2.8 Standardize product name  📝 S

**Context**

Name drift:
- `README.md:1` → "fl-moodtracker"
- `package.json:2` → "web"
- `vercel.json:3` → "sofi-wellness-web"
- `docs/*.md`, `apps/web/public/sw.js:1` → "Pulse"
- `apps/web/lib/auth-context.tsx:259` → `demo@pulse.app`

**Change**

Pick **Pulse** (most-used, matches URL-adjacent branding). Update:
- `README.md` title
- `vercel.json.name` → `pulse-web`
- `apps/web/package.json.name` → `pulse-web`
- `apps/web/public/sw.js` cache name base
- Demo email in `auth-context.tsx` (stays `pulse.app`)

**Verify**

```bash
rg -i 'fl-moodtracker|sofi-wellness' --type-not md
# Expect: no matches (or only acknowledged exceptions like git URL)
```

☐ Done

---

### R-P2.9 Dependency cleanup  📦 S

**Context**

- `apps/web/package.json:32` — `shadcn: ^4.2.0` is a CLI, belongs in
  devDependencies
- `@jridgewell/gen-mapping` — source-maps util, normally transitive

**Change**

```bash
cd apps/web
npm uninstall shadcn
npm install -D shadcn

# If nothing in app code imports @jridgewell/gen-mapping:
rg '@jridgewell/gen-mapping' --type ts --type tsx
# If no matches:
npm uninstall @jridgewell/gen-mapping
```

Also verify `radix-ui` v1.4.3 meta-package (vs per-primitive
`@radix-ui/react-*` imports). If bundle analyzer shows bloat,
migrate imports.

**Verify**

```bash
npm run build
# bundle size unchanged or smaller
```

☐ Done

---

### R-P2.10 Monorepo shape decision  📦 M

**Context**

`apps/web/` implies monorepo. No workspace config. Root
`package-lock.json` is a 93-byte stub.

**Change**

Decide (ask user):

**Option A — flatten:** move everything from `apps/web/` to root,
delete `apps/web/`, delete root `package-lock.json`. Simpler.

**Option B — embrace workspaces:** add `"workspaces": ["apps/*"]`
to root `package.json`, make root `package-lock.json` real. Useful
if a second app (e.g. mobile) is planned.

Without user input, default to A — it's easier to reverse if mobile
ever ships.

☐ Done

---

### R-P2.11 Prettier + lint-staged + husky  🧹 S

**Change**

```bash
cd apps/web
npm i -D prettier lint-staged husky
npx husky init
# Add to package.json:
# "lint-staged": { "*.{ts,tsx}": ["prettier --write", "eslint --fix"] }
# In .husky/pre-commit: npx lint-staged
```

Create `.prettierrc` and `.prettierignore`. Run `prettier --write .`
once to normalize; commit separately (huge diff).

☐ Done

---

### R-P2.12 Structured logging  ✨ M

**Context**

23+ raw `console.*` calls. Vercel collects them but correlation is
hard.

**Change**

1. Add `pino` (or Vercel's recommended logger).
2. Create `apps/web/lib/logger.ts` that attaches `request_id` per
   request (generated in middleware, forwarded via request headers
   or async context).
3. Replace `console.error` → `logger.error` in API routes.
4. `console.log` calls in helpful dev paths — wrap in
   `if (process.env.NODE_ENV !== 'production')`.

**Verify**

Vercel log output shows `{ level, time, requestId, message }`
structured output for each API call.

☐ Done

---

### R-P2.13 Env-var inventory doc  📝 S

**Context**

With no CI, secrets live in `.env.local` + Vercel dashboard. No
rotation policy.

**Change**

Add `docs/06-env-vars.md`:
- Every env var (name, scope, where it's set, what breaks if
  missing, rotation cadence, last rotated).
- Cross-link from operations runbook.

**Verify**

A new developer should be able to stand up a dev env from this doc
alone.

☐ Done

---

## Phase F — Follow-ups to manual work

### R-F1 Backfill migration files from live DB  🐛 S

**Context**

Pairs with manual `F3`. The user will run the snapshot queries in
F3; this task takes those outputs and commits them as a migration.

**Change**

Using outputs from manual F3:
1. Create
   `supabase/migrations/<timestamp>_sleep_events_snapshot.sql`
   with the CREATE TABLE / indexes / RLS policies for `sleep_events`.
2. Create
   `supabase/migrations/<timestamp>_sync_functions_snapshot.sql`
   with the current `sync_hae_to_production()` and
   `purge_old_staging_rows()` bodies.
3. Create
   `supabase/migrations/<timestamp>_cron_jobs.sql` with the
   `cron.schedule(...)` calls for the current jobs.

**Verify**

```bash
cd supabase
supabase db reset
# Should reproduce the live schema without errors
```

☐ Done

---

### R-F2 Alerting for stale HAE data  ✨ M

**Context**

Pairs with manual `F1` (which creates `v_hae_freshness`). This task
adds external alerting.

**Change**

Options:
- **Vercel Cron** calls `/api/admin/hae-freshness-check` hourly; the
  route queries the view and POSTs to a webhook (Discord, email) on
  STALE.
- **Supabase pg_cron + pgsql-http extension** to call a webhook
  directly — no frontend round-trip.

Stub a Discord webhook first; full email pipeline later.

☐ Done

---

## Phase P3 — Future enhancements

These aren't critical. Revisit after the foundation is boring.

### R-P3.1 Real demo mode  ✨ M

`signInDemo()` in `auth-context.tsx:252-298` builds a fake in-memory
session. API calls will fail. Replace with:

- A real demo user in Supabase Auth (seeded with realistic data via
  a script).
- Read-only RLS policies scoped to that user.
- A single "Sign in as demo" button that authenticates normally.

Or gate the current fake flow out of production builds.

### R-P3.2 Remove legacy HealthFit code paths  🧹 M

Audit the repo for anything referencing `sync-healthfit`,
`google_codenode`, HealthFit-specific column names. If HAE is now
the sole source of truth, delete the HealthFit Edge Function, its
config, and the backfill scripts.

### R-P3.3 Move Apple-Watch-specific logic behind an adapter  ✨ L

If a second data source (Fitbit, Garmin, manual entry) is ever
planned, the HAE-specific transformations in
`sync_hae_to_production()` and the `ingest-hae` Edge Function are a
tight coupling. Introduce a `HealthDataSource` interface and have
HAE be one implementation.

---

## Quick-win bundle (half a day)

In order: R-P0.1 → R-P0.4 → R-P0.3 → R-P0.5 → R-P0.2.
Everything that leaks credentials or personal data.

## Pre-production bundle (one sprint)

All of P0 plus R-P1.1, R-P1.3, R-P1.4, R-P1.5. Minimum bar:
auth enforced, CI running, errors tracked, one smoke test green.

## Multi-user launch bundle

R-C1 (here) + C1–C6 (manual file). Do in the order specified in
the manual file's pause points.
