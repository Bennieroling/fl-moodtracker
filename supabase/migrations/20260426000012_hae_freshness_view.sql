-- View that reports how recently HAE pushed data to staging_hae_metrics.
-- Status is STALE when no push has arrived in 30 minutes during waking
-- hours (07:00–23:00 Europe/Madrid); OK otherwise.

CREATE OR REPLACE VIEW public.v_hae_freshness AS
SELECT
  MAX(received_at)                   AS last_push,
  NOW() - MAX(received_at)           AS staleness,
  CASE
    WHEN EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/Madrid') BETWEEN 7 AND 23
     AND NOW() - MAX(received_at) > INTERVAL '30 minutes'
    THEN 'STALE'
    ELSE 'OK'
  END                                AS status
FROM public.staging_hae_metrics;

GRANT SELECT ON public.v_hae_freshness TO authenticated;
