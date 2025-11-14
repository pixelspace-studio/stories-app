-- Migration: Fix historical transcription costs
-- Description: Update cost_usd for transcription_completed events that have cost_usd = 0
--              but have duration_seconds available, calculating cost from duration
-- Date: 2025-11-13

-- Calculate and update cost_usd for events with cost_usd = 0 but duration > 0
-- Formula: cost_usd = (duration_seconds / 60.0) * 0.006
UPDATE events
SET properties = jsonb_set(
    properties,
    '{cost_usd}',
    to_jsonb(
        ROUND(
            (COALESCE(
                (properties->>'duration_seconds')::FLOAT,
                (properties->>'audio_duration_seconds')::FLOAT,
                0
            ) / 60.0) * 0.006,
            6
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

-- Show summary of updated records
SELECT 
    COUNT(*) as total_updated,
    SUM(
        COALESCE(
            (properties->>'duration_seconds')::FLOAT,
            (properties->>'audio_duration_seconds')::FLOAT,
            0
        ) / 60.0 * 0.006
    ) as total_cost_calculated
FROM events
WHERE event = 'transcription_completed'
  AND (
    (properties->>'cost_usd')::FLOAT > 0
    OR (properties->>'estimated_cost_usd')::FLOAT > 0
  );

