-- 0002_output_bytes.sql
-- Adds output_bytes: the total size of the packaged output tree in the R2 output
-- bucket. The worker already sums these bytes while uploading (uploadOutputTree),
-- so this is persisted at write time, no R2 LIST needed to report storage usage.
--
-- Backfill note: rows that became 'ready' before this column existed will have
-- output_bytes = NULL and are counted as 0 in the storage total until reprocessed.
-- Developer-run (Claude never executes migrations).

ALTER TABLE videos ADD COLUMN IF NOT EXISTS output_bytes bigint;
