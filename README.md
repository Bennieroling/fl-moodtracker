# Pulse

Health tracking app built with Next.js and Supabase.

The current system ingests Apple Health data exported by Health Auto Export
(HAE), stores and transforms it in Supabase, and serves it to a web frontend.
The repository contains the web app, database migrations, and legacy Supabase
functions from earlier iterations.

## What is in this repo

- root app files (`app/`, `components/`, `lib/`, `package.json`) — Next.js web app
- `supabase/migrations` — database schema and migration history
- `supabase/functions` — Supabase Edge Functions and shared helpers
- `scripts` — one-off utilities
- `docs` — canonical technical documentation

## Current architecture

The documented backend flow is:

1. HAE posts JSON payloads to a Supabase Edge Function.
2. Raw payloads land in staging tables.
3. Scheduled database functions promote staging rows into typed production tables.
4. The web app reads production tables and views through Supabase.

See the docs below for the accurate, maintained description.

## Documentation

Start here:

- [Architecture](./docs/01-architecture.md)
- [Database schema](./docs/02-database-schema.md)
- [Functions and cron](./docs/03-functions-and-cron.md)
- [Edge functions](./docs/04-edge-functions.md)
- [Operations runbook](./docs/05-operations-runbook.md)
- [Backlog](./docs/TODO-backlog.md)

## Local development

### Prerequisites

- Node.js 20+
- npm
- Supabase project and credentials

### Install

```bash
npm install
```

### Environment variables

The web app expects these variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
```

Notes:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required for
  the app to boot.
- AI keys are only needed for AI-backed routes and features.
- Some older planning notes may reference previous env naming conventions.
  Treat the root app code as the source of truth.

### Run the web app

```bash
npm run dev
```

The default Next.js dev URL is usually `http://localhost:3000`.

### Useful commands

```bash
npm run lint
npm run build
```

## Database

Schema changes live in:

- [`supabase/migrations`](./supabase/migrations)

If you are working on the database layer, use the migration files and the docs
as the authoritative repo state. Some behavior in the live database may still
need to be backfilled into migrations; see the backlog.

## Important caveats

- This repo still contains legacy code and historical artifacts from earlier
  product directions.
- `docs/` is the maintained reference set; older root-level planning notes may
  be stale.

## Deployment

The web app is configured for Vercel via `vercel.json`.

At a minimum, production requires the same Supabase and AI environment variables
used locally. The security headers and API route limits are also defined in
`vercel.json`.

## Contributing

When making structural changes:

1. Update code.
2. Update migrations if the database contract changed.
3. Update the relevant file in `docs/` if the architecture or operations changed.

## Status

This README is intended to be the repo entry point.

For implementation details, operational procedures, and current known issues,
use the files in `docs/`.
