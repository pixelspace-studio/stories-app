-- ============================================================================
-- RESET TELEMETRY DATABASE - DEVELOPMENT ONLY
-- ============================================================================
-- WARNING: This will DELETE ALL telemetry data!
-- Use only for development/testing, never in production with real user data.
--
-- Usage:
--   psql $DATABASE_URL -f scripts/reset_database.sql
-- ============================================================================

\echo '========================================='
\echo '⚠️  DATABASE RESET STARTING'
\echo '========================================='
\echo ''

-- Step 1: Drop all views
\echo 'Step 1/4: Dropping views...'
DROP VIEW IF EXISTS active_users_7d CASCADE;
DROP VIEW IF EXISTS active_users_30d CASCADE;
DROP VIEW IF EXISTS total_users CASCADE;
DROP VIEW IF EXISTS success_rate_30d CASCADE;
\echo '✅ Views dropped'
\echo ''

-- Step 2: Drop all tables
\echo 'Step 2/4: Dropping tables...'
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS crashes CASCADE;
DROP TABLE IF EXISTS user_stats CASCADE;
\echo '✅ Tables dropped'
\echo ''

-- Step 3: Drop all functions
\echo 'Step 3/4: Dropping functions...'
DROP FUNCTION IF EXISTS cleanup_old_events() CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_crashes() CASCADE;
\echo '✅ Functions dropped'
\echo ''

-- Step 4: Verify cleanup
\echo 'Step 4/4: Verifying cleanup...'
SELECT 
    COUNT(*) as remaining_tables 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
  AND table_name IN ('events', 'crashes', 'user_stats');

\echo ''
\echo '========================================='
\echo '✅ DATABASE RESET COMPLETE'
\echo '========================================='
\echo ''
\echo 'Next steps:'
\echo '1. Run: psql $DATABASE_URL -f migrations/001_initial_schema.sql'
\echo '2. Run: psql $DATABASE_URL -f migrations/002_add_composite_indexes.sql'
\echo '3. Verify dashboard is empty'
\echo ''

