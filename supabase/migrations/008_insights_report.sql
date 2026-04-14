-- Add narrative report column to the insights table.
-- Kept nullable so existing rows remain valid; new generations populate it.
ALTER TABLE insights ADD COLUMN IF NOT EXISTS report_md TEXT;
