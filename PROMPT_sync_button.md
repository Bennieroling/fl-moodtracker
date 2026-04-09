# Task: Add a "Sync Now" Button to the Profile Page

## Context

This is a Next.js app (App Router) in a monorepo at `apps/web/`. It uses Supabase for auth and data. There is a deployed Supabase Edge Function called `sync-healthfit` that syncs health data from Google Sheets into Supabase. It runs on a cron every 30 minutes, but we also want the user to be able to trigger it manually from the UI.

## What to build

Add a "Sync Now" button on the **profile page** (`apps/web/app/(app)/profile/page.tsx`) that:

1. Calls the `sync-healthfit` Edge Function
2. Shows a loading/spinner state while syncing
3. Shows a success message with how many rows were synced (per category)
4. Shows an error message if the sync fails
5. Disables the button for 60 seconds after a successful sync (to prevent spam)

## Architecture

### API Route (server-side)

Create a new API route at `apps/web/app/api/sync/route.ts` that:

- Accepts POST requests
- Verifies the user is authenticated via Supabase session
- Calls the Edge Function using the service role key (server-side only, never exposed to client)
- Returns the Edge Function response to the client

```typescript
// apps/web/app/api/sync/route.ts
//
// Environment variables needed (already in .env.local):
//   NEXT_PUBLIC_SUPABASE_URL — the Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — the service role key (NOT the anon key)
//
// The Edge Function URL is:
//   {NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-healthfit
//
// Call it with:
//   Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
//   Content-Type: application/json
//   Body: {}
//
// The Edge Function returns JSON like:
// {
//   "ok": true,
//   "results": [
//     { "sheetName": "health_metrics", "rowsFetched": 49, "rowsUpserted": 3, "error": null, "durationMs": 614 },
//     { "sheetName": "body", "rowsFetched": 3, "rowsUpserted": 0, "error": null, "durationMs": 754 },
//     { "sheetName": "workouts", "rowsFetched": 4, "rowsUpserted": 1, "error": null, "durationMs": 413 }
//   ]
// }
```

### Client-side button

Add to the profile page (`apps/web/app/(app)/profile/page.tsx`):

- A button labeled "Sync Now" with a refresh/sync icon
- On click: POST to `/api/sync`
- While loading: show spinner, disable button, text changes to "Syncing..."
- On success: show toast or inline message like "Synced: 3 health metrics, 0 body, 1 workout"
- On error: show toast or inline message with the error
- After success: disable button for 60 seconds with countdown text like "Sync again in 45s"

## Files to create/modify

1. **CREATE** `apps/web/app/api/sync/route.ts` — the API route
2. **MODIFY** `apps/web/app/(app)/profile/page.tsx` — add the sync button

## Constraints

- Use the existing toast system from `apps/web/hooks/use-toast.ts` and `apps/web/components/ui/toast.tsx` for notifications
- Use the existing Button component from `apps/web/components/ui/button.tsx`
- Use the existing Supabase client from `apps/web/lib/supabase-server.ts` for auth verification in the API route
- Match the existing design patterns and styling in the app (Tailwind, shadcn/ui components)
- The `SUPABASE_SERVICE_ROLE_KEY` must NEVER be exposed to the client — it stays in the API route only
- Check `apps/web/.env.example` and `apps/web/.env.local` to see which env vars are already available

## Do NOT

- Do not modify the Edge Function itself
- Do not add new npm dependencies
- Do not create a separate page for syncing — it goes on the existing profile page
- Do not hardcode any URLs or keys — use environment variables
