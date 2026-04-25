  One improvement landed now: apps/web/lib/rate-limit.ts now emits a production-only console.warn when Upstash env vars are missing, so thesilent fail-open becomes visible in
  Vercel logs. TODO updated at R-P1.6. Typecheck + tests still green.

  What I need from you to close the remaining ☐ items:

  1. Vercel env vars (Production + Preview unless noted):
    - SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN (same value OK) — enable Sentry capture
    - UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN — enable throttling (mark sensitive)
    - Optional (Production build only, for readable stack traces): SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN
  2. GitHub: enable branch protection on main requiring the CI status check
  3. Redeploy

  Once that's done, ping me and I'll run the post-deploy curl checks + trigger a test Sentry event + 21-request rate-limit check, then flipthe remaining ☐ → ☒ in the TODO.

✻ Worked for 6m 37s

※ recap: Goal is working through Phase P0/P1 of docs/TODO-agent-repo.md; P0 and P1 code are verified done and a rate-limit log fix landed. Next: you set Sentry + Upstash env vars
  in Vercel and enable branch protection on main. (disable recaps in /config)
