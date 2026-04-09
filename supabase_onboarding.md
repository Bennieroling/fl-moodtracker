# Supabase Onboarding for HealthFit Sync

Follow these steps in order.

## 1. Collect required values
1. Open your two Google Sheet URLs and copy the IDs:
- `HEALTH_SHEET_ID` from `Health_Metrics_v5`
- `WORKOUTS_SHEET_ID` from `Workouts_v5`
2. In Supabase Dashboard, open `Authentication -> Users`, copy your user UUID as `SYNC_USER_ID`.
3. In Supabase Dashboard, open `Settings -> API` and copy:
- Project URL (`SUPABASE_URL`)
- Project reference (`<PROJECT_REF>`)

## 2. Configure Google service account
1. In Google Cloud Console, enable `Google Sheets API`.
2. Create a Service Account and download JSON key.
3. Share both sheets with the service account email as `Viewer`.

## 3. Set Supabase Edge Function secrets
In Supabase Dashboard go to `Settings -> Edge Functions -> Secrets`, add:
1. `GOOGLE_SERVICE_ACCOUNT_JSON` = full JSON key file contents
2. `HEALTH_SHEET_ID` = sheet id from step 1
3. `WORKOUTS_SHEET_ID` = sheet id from step 1
4. `SYNC_USER_ID` = auth user UUID from step 1

## 4. Run SQL migrations in SQL Editor
Run each file in this order:
1. `supabase/migrations/002_health_metrics_daily_columns.sql`
2. `supabase/migrations/003_exercise_events.sql`
3. `supabase/migrations/004_health_metrics_body.sql`
4. `supabase/migrations/005_sync_log.sql`
5. `supabase/migrations/006_v_daily_activity_view.sql`

## 5. Deploy edge function
From project root:
```bash
supabase functions deploy sync-healthfit
```

## 6. Manual test run
Use your project ref and service role key:
```bash
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/sync-healthfit \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## 7. Verify data
In SQL Editor run:
```sql
select * from sync_log order by run_at desc limit 20;
select * from health_metrics_daily order by date desc limit 20;
select * from health_metrics_body order by date desc limit 20;
select * from exercise_events order by started_at desc limit 20;
```

## 8. Configure daily cron job (06:00 UTC)
Run once in SQL Editor:
```sql
SELECT cron.schedule(
  'sync-healthfit-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-healthfit',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## 9. Optional one-time historical backfill
1. Install deps:
```bash
pip install pandas openpyxl supabase
```
2. Export env vars:
```bash
export SUPABASE_URL="https://<PROJECT_REF>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<SUPABASE_SERVICE_ROLE_KEY>"
export SYNC_USER_ID="<SYNC_USER_ID>"
```
3. Run:
```bash
python scripts/backfill_historical.py --input-dir /path/to/old/xlsx/files
```
