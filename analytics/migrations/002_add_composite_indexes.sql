-- Stories Analytics - Composite Indexes for Performance
-- Version: 1.1
-- Date: 2025-11-04
-- Purpose: Improve query performance for paginated queries with date filters

-- ============================================================================
-- COMPOSITE INDEXES FOR EVENTS TABLE
-- ============================================================================

-- Composite index for event_type + timestamp queries (most common dashboard query)
-- This index speeds up queries like: WHERE event = 'transcription_completed' AND timestamp >= 'date'
CREATE INDEX IF NOT EXISTS idx_events_type_timestamp ON events(event, timestamp DESC);

-- Composite index for user_id + timestamp queries
-- Useful for user-specific history and activity tracking
CREATE INDEX IF NOT EXISTS idx_events_user_timestamp ON events(user_id, timestamp DESC);

-- ============================================================================
-- COMPOSITE INDEXES FOR CRASHES TABLE
-- ============================================================================

-- Composite index for crash_type + timestamp queries
CREATE INDEX IF NOT EXISTS idx_crashes_type_timestamp ON crashes(crash_type, timestamp DESC);

-- ============================================================================
-- PERFORMANCE NOTES
-- ============================================================================

-- These composite indexes will significantly improve:
-- 1. Dashboard "Recent Recordings" queries (event + date filter)
-- 2. User-specific event history
-- 3. Date-range filtered queries with pagination
--
-- Expected performance improvement: 10-100x faster on large datasets (10K+ events)
--
-- Index usage examples:
-- - SELECT * FROM events WHERE event = 'transcription_completed' AND timestamp >= '2025-10-01' ORDER BY timestamp DESC LIMIT 20;
--   → Uses idx_events_type_timestamp
--
-- - SELECT * FROM events WHERE user_id = 'abc123' AND timestamp >= '2025-10-01' ORDER BY timestamp DESC;
--   → Uses idx_events_user_timestamp

-- ============================================================================
-- VERIFY INDEXES
-- ============================================================================

SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('events', 'crashes')
ORDER BY tablename, indexname;

SELECT 'Composite indexes created successfully!' as status;

