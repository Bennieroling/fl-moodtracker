psql "postgresql://postgres.sxawzzcpmiakltfjpzcn:yKqoaTZWM1Qtf3gnwqNU@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" \
  -f /Users/benvandijk/fl-moodtracker/temp/fix_calculate_weekly_metrics.sql





postgresql://postgres:yKqoaTZWM1Qtf3gnwqNU@db.sxawzzcpmiakltfjpzcn.supabase.co:5432/postgres

psql "postgresql://postgres:yKqoaTZWM1Qtf3gnwqNU@db.sxawzzcpmiakltfjpzcn.supabase.co:5432/postgres" \
  -f /Users/benvandijk/fl-moodtracker/temp/fix_calculate_weekly_metrics.sql


  psql "postgresql://postgres.sxawzzcpmiakltfjpzcn:yKqoaTZWM1Qtf3gnwqNU@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" \
    -f /Users/benvandijk/fl-moodtracker/temp/fix_calculate_weekly_metrics.sql

tt6X6HZunBF3ddwWxKJ5

psql "postgresql://postgres.sxawzzcpmiakltfjpzcn:tt6X6HZunBF3ddwWxKJ5@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" \
     -f /Users/benvandijk/fl-moodtracker/temp/c4_sync_hae_multi_user.sql

psql "postgresql://postgres.sxawzzcpmiakltfjpzcn:YOUR_PASSWORD@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" \
  -c "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated') ORDER BY grantee, table_name, privilege_type;"
      grantee    |        table_name        | privilege_type 
---------------+--------------------------+----------------
 anon          | keep_alive               | INSERT
 authenticated | ecg_readings             | SELECT
 authenticated | exercise_events          | SELECT
 authenticated | food_entries             | DELETE
 authenticated | food_entries             | INSERT
 authenticated | food_entries             | SELECT
 authenticated | food_entries             | UPDATE
 authenticated | health_metrics_body      | SELECT
 authenticated | health_metrics_daily     | SELECT
 authenticated | heart_rate_notifications | SELECT
 authenticated | insights                 | DELETE
 authenticated | insights                 | INSERT
 authenticated | insights                 | SELECT
 authenticated | insights                 | UPDATE
 authenticated | mood_entries             | DELETE
 authenticated | mood_entries             | INSERT
 authenticated | mood_entries             | SELECT
 authenticated | mood_entries             | UPDATE
 authenticated | sleep_events             | SELECT
 authenticated | state_of_mind            | SELECT
 authenticated | streaks                  | DELETE
 authenticated | streaks                  | INSERT
 authenticated | streaks                  | SELECT
 authenticated | streaks                  | UPDATE
 authenticated | user_preferences         | DELETE
 authenticated | user_preferences         | INSERT
 authenticated | user_preferences         | SELECT
 authenticated | user_preferences         | UPDATE
 authenticated | workout_routes           | SELECT
(29 rows)



psql "postgresql://postgres.sxawzzcpmiakltfjpzcn:yKqoaTZWM1Qtf3gnwqNU@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" \
  -c "SELECT table_name FROM information_schema.views WHERE table_schema = 'public';"

    table_name    
------------------
 v_day_summary
 v_daily_activity
(2 rows)


psql "postgresql://postgres.sxawzzcpmiakltfjpzcn:yKqoaTZWM1Qtf3gnwqNU@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" \
  -c "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated') AND table_name IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public') ORDER BY grantee, table_name;"
 grantee | table_name | privilege_type 
---------+------------+----------------
(0 rows)


psql "postgresql://postgres.sxawzzcpmiakltfjpzcn:yKqoaTZWM1Qtf3gnwqNU@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" \
  -c "GRANT SELECT ON v_daily_activity, v_day_summary TO authenticated;"
  GRANT

psql "postgresql://postgres.sxawzzcpmiakltfjpzcn:yKqoaTZWM1Qtf3gnwqNU@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" \
  -c "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' AND table_type IN ('BASE TABLE','VIEW') ORDER BY table_type, table_name;"
          table_name        | table_type 
--------------------------+------------
 ecg_readings             | BASE TABLE
 exercise_daily           | BASE TABLE
 exercise_events          | BASE TABLE
 food_entries             | BASE TABLE
 health_metrics_body      | BASE TABLE
 health_metrics_daily     | BASE TABLE
 heart_rate_notifications | BASE TABLE
 insights                 | BASE TABLE
 keep_alive               | BASE TABLE
 knowledge_documents      | BASE TABLE
 mood_entries             | BASE TABLE
 sleep_events             | BASE TABLE
 staging_hae_metrics      | BASE TABLE
 staging_hae_other        | BASE TABLE
 staging_hae_workouts     | BASE TABLE
 state_of_mind            | BASE TABLE
 streaks                  | BASE TABLE
 sync_log                 | BASE TABLE
 user_preferences         | BASE TABLE
 workout_routes           | BASE TABLE
 v_daily_activity         | VIEW
 v_day_summary            | VIEW
(22 rows)



psql "postgresql://postgres.sxawzzcpmiakltfjpzcn:yKqoaTZWM1Qtf3gnwqNU@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" \
  -f /Users/benvandijk/fl-moodtracker/temp/fix_recalc_streaks.sql



  curl -i -X POST https://sxawzzcpmiakltfjpzcn.supabase.co/functions/v1/ingest-hae \
  -H "Authorization: Bearer 9b7816324407b7e9e3132dc6909f48c238e553fad8e3f06503aa4304cbe42990" \
  -H "Content-Type: application/json" \
  -d '{"data":{"metrics":[],"workouts":[]}}'


  Bearer 7b215661f912dc1fe1e5563e0b772ebbfa1b42e1557dcdede2989d9ac8fad1f9



  curl -i -X POST https://sxawzzcpmiakltfjpzcn.supabase.co/functions/v1/ingest-hae \
  -H "Authorization: Bearer 7b215661f912dc1fe1e5563e0b772ebbfa1b42e1557dcdede2989d9ac8fad1f9" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "metrics": [
        {
          "name": "step_count",
          "units": "count",
          "data": [
            {"date": "2099-01-01 00:00:00 +0000", "qty": 42}
          ]
        }
      ]
    }
  }'