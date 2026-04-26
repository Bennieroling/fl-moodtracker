-- Persist onboarding completion on user_preferences so it survives across devices.
-- Previously the dashboard read a localStorage flag, which forced users through
-- onboarding again on every new browser/device.

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_preferred_method TEXT
    CHECK (onboarding_preferred_method IN ('photo','voice','text','manual')),
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
