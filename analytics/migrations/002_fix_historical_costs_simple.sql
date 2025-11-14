-- Migration: Fix historical transcription costs
-- Description: Update cost_usd for transcription_completed events that have cost_usd = 0
--              but have duration_seconds available, calculating cost from duration
-- Date: 2025-11-13

-- Step 1: First, let's see how many records will be affected
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

-- Step 2: Update the records (run this after reviewing Step 1)
-- Note: PostgreSQL ROUND only takes one argument, so we use CAST to NUMERIC for precision
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

-- Step 3: Verify the update worked
SELECT 
    COUNT(*) as total_with_cost,
    SUM(
        COALESCE(
            (properties->>'cost_usd')::FLOAT,
            (properties->>'estimated_cost_usd')::FLOAT,
            0
        )
    ) as total_cost_sum
FROM events
WHERE event = 'transcription_completed'
  AND (
    (properties->>'cost_usd')::FLOAT > 0
    OR (properties->>'estimated_cost_usd')::FLOAT > 0
  );

