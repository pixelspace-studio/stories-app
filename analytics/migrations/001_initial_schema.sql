-- Stories Analytics - Initial Database Schema
-- Version: 1.0
-- Date: 2025-10-28

-- ============================================================================
-- EVENTS TABLE (Telemetry)
-- ============================================================================

CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    event VARCHAR(100) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    properties JSONB,
    app_version VARCHAR(20),
    platform VARCHAR(50),
    country VARCHAR(2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_app_version ON events(app_version);
CREATE INDEX IF NOT EXISTS idx_events_country ON events(country);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);

-- ============================================================================
-- CRASHES TABLE (Crash Reporting)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crashes (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    app_version VARCHAR(20) NOT NULL,
    os_version VARCHAR(50),
    crash_type VARCHAR(50) NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    context JSONB,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_crashes_user_id ON crashes(user_id);
CREATE INDEX IF NOT EXISTS idx_crashes_timestamp ON crashes(timestamp);
CREATE INDEX IF NOT EXISTS idx_crashes_app_version ON crashes(app_version);
CREATE INDEX IF NOT EXISTS idx_crashes_type ON crashes(crash_type);
CREATE INDEX IF NOT EXISTS idx_crashes_created_at ON crashes(created_at);

-- ============================================================================
-- USER_STATS TABLE (Aggregated Daily Statistics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_stats (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    total_users INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    total_recordings INTEGER DEFAULT 0,
    total_minutes DECIMAL(10, 2) DEFAULT 0,
    total_cost_usd DECIMAL(10, 4) DEFAULT 0,
    crash_count INTEGER DEFAULT 0,
    crash_rate DECIMAL(5, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for date queries
CREATE INDEX IF NOT EXISTS idx_user_stats_date ON user_stats(date);

-- ============================================================================
-- VIEWS (For common queries)
-- ============================================================================

-- Active users in last 7 days
CREATE OR REPLACE VIEW active_users_7d AS
SELECT COUNT(DISTINCT user_id) as count
FROM events
WHERE timestamp >= NOW() - INTERVAL '7 days';

-- Active users in last 30 days
CREATE OR REPLACE VIEW active_users_30d AS
SELECT COUNT(DISTINCT user_id) as count
FROM events
WHERE timestamp >= NOW() - INTERVAL '30 days';

-- Total users (all time)
CREATE OR REPLACE VIEW total_users AS
SELECT COUNT(DISTINCT user_id) as count
FROM events;

-- Success rate (last 30 days)
CREATE OR REPLACE VIEW success_rate_30d AS
SELECT 
    COUNT(*) FILTER (WHERE properties->>'success' = 'true') * 100.0 / NULLIF(COUNT(*), 0) as percentage
FROM events
WHERE event = 'recording_completed'
  AND timestamp >= NOW() - INTERVAL '30 days';

-- ============================================================================
-- FUNCTIONS (For data retention)
-- ============================================================================

-- Function to delete old events (retention policy: 365 days)
CREATE OR REPLACE FUNCTION cleanup_old_events() RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM events
    WHERE created_at < NOW() - INTERVAL '365 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to delete old crashes (retention policy: 365 days)
CREATE OR REPLACE FUNCTION cleanup_old_crashes() RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM crashes
    WHERE created_at < NOW() - INTERVAL '365 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert placeholder for today's stats
INSERT INTO user_stats (date, total_users, active_users, new_users)
VALUES (CURRENT_DATE, 0, 0, 0)
ON CONFLICT (date) DO NOTHING;

-- ============================================================================
-- PERMISSIONS (if needed for specific users)
-- ============================================================================

-- GRANT SELECT, INSERT ON events TO analytics_app;
-- GRANT SELECT, INSERT ON crashes TO analytics_app;
-- GRANT ALL ON user_stats TO analytics_app;

-- ============================================================================
-- COMPLETE
-- ============================================================================

-- Verify tables
SELECT 'Schema created successfully!' as status;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

