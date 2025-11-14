-- Migration: Fix historical transcription costs (SAFE VERSION WITH TRANSACTION)
-- Description: Update cost_usd for transcription_completed events that have cost_usd = 0
--              but have duration_seconds available, calculating cost from duration
-- Date: 2025-11-13
-- 
-- IMPORTANT: This script uses a transaction - if something goes wrong, 
--            you can ROLLBACK and nothing will be changed!

-- Step 1: First, let's see how many records will be affected (this is safe, read-only)
SELECT 
    COUNT(*) as records_to_update,
    SUM(
        COALESCE(
            (properties->>'duration_seconds')::FLOAT,
            (properties->>'audio_duration_seconds')::FLOAT,
            0
        ) / 60.0 * 0.006
    ) as total_cost_to_calculate
FROM events
WHERE event = 'transcription_completed'
  AND (
    (properties->>'cost_usd')::FLOAT = 0 
    OR properties->>'cost_usd' IS NULL
    OR properties->>'cost_usd' = ''
  )
  AND (
    (properties->>'duration_seconds')::FLOAT > 0
    OR (properties->>'audio_duration_seconds')::FLOAT > 0
  );

-- Step 2: Start a transaction (this allows you to ROLLBACK if needed)
BEGIN;

-- Step 3: Update the records (inside transaction - can be rolled back)
UPDATE events
SET properties = jsonb_set(
    properties,
    '{cost_usd}',
    to_jsonb(
        CAST(
            (COALESCE(
                (properties->>'duration_seconds')::FLOAT,
                (properties->>'audio_duration_seconds')::FLOAT,
                0
            ) / 60.0) * 0.006
            AS NUMERIC(10, 6)
        )
    )
)
WHERE event = 'transcription_completed'
  AND (
    (properties->>'cost_usd')::FLOAT = 0 
    OR properties->>'cost_usd' IS NULL
    OR properties->>'cost_usd' = ''
  )
  AND (
    (properties->>'duration_seconds')::FLOAT > 0
    OR (properties->>'audio_duration_seconds')::FLOAT > 0
  );

-- Step 4: Verify the update (check a few sample records)
SELECT 
    id,
    timestamp,
    properties->>'duration_seconds' as duration,
    properties->>'cost_usd' as cost_usd,
    (properties->>'duration_seconds')::FLOAT / 60.0 * 0.006 as calculated_cost
FROM events
WHERE event = 'transcription_completed'
  AND (properties->>'cost_usd')::FLOAT > 0
ORDER BY timestamp DESC
LIMIT 10;

-- Step 5: If everything looks good, COMMIT the transaction
--         If something looks wrong, run ROLLBACK; instead
COMMIT;

-- Alternative: If you want to undo the changes, run this instead of COMMIT:
-- ROLLBACK;

