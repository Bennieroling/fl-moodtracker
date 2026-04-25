# Environment Variables

All variables required to run Pulse in development and production.

## Quick start

```bash
cp .env.example .env.local
# fill in real values — see table below
```

## Variable reference

| Variable                        | Scope           | Set in                | Required for                                                                        | What breaks if missing                   | Rotation                                                             |
| ------------------------------- | --------------- | --------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Client + Server | `.env.local`, Vercel  | App boot                                                                            | Hard crash on every page                 | On Supabase project recreation                                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | `.env.local`, Vercel  | Auth, RLS queries                                                                   | Hard crash on every page                 | Via Supabase Dashboard → Settings → API                              |
| `SUPABASE_SERVICE_ROLE_KEY`     | **Server only** | `.env.local`, Vercel  | Routes that bypass RLS (`/api/storage/sign`, `/api/sync`, ingest-hae Edge Function) | Those routes return 500                  | Via Supabase Dashboard → Settings → API — **never expose to client** |
| `OPENAI_API_KEY`                | Server only     | `.env.local`, Vercel  | AI text / vision / speech routes                                                    | Routes return 500 or fall back to Gemini | Quarterly or on suspected exposure                                   |
| `GEMINI_API_KEY`                | Server only     | `.env.local`, Vercel  | AI vision / speech fallback                                                         | Routes return 500 if OpenAI also fails   | Quarterly                                                            |
| `NEXT_PUBLIC_BUILD_ID`          | Build-time      | Vercel env (optional) | PWA service-worker cache busting                                                    | SW keeps stale cache name across deploys | Auto — falls back to `VERCEL_GIT_COMMIT_SHA`, then a timestamp       |

### Optional / future

| Variable                           | Purpose                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `MODEL_PROVIDER`                   | Override AI provider (`openai` or `gemini`). Not currently read by any route. |
| `POSTHOG_API_KEY` / `POSTHOG_HOST` | Analytics. Not wired up yet.                                                  |

## Adding a variable to Vercel

1. Dashboard → Project → Settings → Environment Variables
2. Add the key and value; select the environments it applies to (Production / Preview / Development)
3. Redeploy — variables are baked in at build time for `NEXT_PUBLIC_*` and injected at runtime for server-only vars

## Notes

- `NEXT_PUBLIC_*` vars are inlined into client JS bundles at build time. **Never put secrets in a `NEXT_PUBLIC_` var.**
- `SUPABASE_SERVICE_ROLE_KEY` bypasses Row-Level Security. Only ever read in server-side code (`lib/supabase-server.ts`, Edge Functions).
- `NEXT_PUBLIC_BUILD_ID` is set automatically by `next.config.ts`: it reads `NEXT_PUBLIC_BUILD_ID` → `VERCEL_GIT_COMMIT_SHA` → `Date.now()` in that order, so you don't need to set it manually on Vercel.

## See also

- `docs/05-operations-runbook.md` — deployment steps and key rotation procedure
- `.env.example` — template with placeholder values
