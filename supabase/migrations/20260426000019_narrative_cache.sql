-- Phase 3 of docs/PRODUCTION_PLAN.md — Narrative cache.
-- Stores AI-generated narratives keyed by (user, cache_key). The /api/ai/
-- what-changed route returns from this table on cache hit and only calls
-- the LLM on miss. Cache key encodes the window + window start, e.g.
-- "what-changed:7d:2026-04-20".

CREATE TABLE IF NOT EXISTS public.narrative_cache (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key    text NOT NULL,
  narrative    text NOT NULL,
  inputs       jsonb NOT NULL,
  model        text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'narrative_cache_user_key_unique'
      AND conrelid = 'public.narrative_cache'::regclass
  ) THEN
    ALTER TABLE public.narrative_cache
      ADD CONSTRAINT narrative_cache_user_key_unique
      UNIQUE (user_id, cache_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS narrative_cache_user_generated_idx
  ON public.narrative_cache (user_id, generated_at DESC);

ALTER TABLE public.narrative_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'narrative_cache'
      AND policyname = 'Users read own narrative cache'
  ) THEN
    CREATE POLICY "Users read own narrative cache" ON public.narrative_cache
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'narrative_cache'
      AND policyname = 'Users insert own narrative cache'
  ) THEN
    CREATE POLICY "Users insert own narrative cache" ON public.narrative_cache
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'narrative_cache'
      AND policyname = 'Users update own narrative cache'
  ) THEN
    CREATE POLICY "Users update own narrative cache" ON public.narrative_cache
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.narrative_cache TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.narrative_cache_id_seq TO authenticated;
