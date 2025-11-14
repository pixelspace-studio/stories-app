-- ============================================================================
-- CLEAR TELEMETRY DATA - Keep structure, delete all data
-- ============================================================================
-- This deletes all events and crashes but keeps tables, indexes, and views
--
-- Usage:
--   psql $DATABASE_URL -f scripts/clear_data.sql
-- ============================================================================

\echo '========================================='
\echo '🗑️  CLEARING ALL TELEMETRY DATA'
\echo '========================================='
\echo ''

-- Count current data
\echo 'Current data:'
SELECT 
    'events' as table_name,
    COUNT(*) as records
FROM events
UNION ALL
SELECT 
    'crashes' as table_name,
    COUNT(*) as records
FROM crashes
UNION ALL
SELECT 
    'user_stats' as table_name,
    COUNT(*) as records
FROM user_stats;

\echo ''
\echo 'Deleting all data...'

-- Delete all data
DELETE FROM events;
DELETE FROM crashes;
DELETE FROM user_stats;

\echo ''
\echo '✅ Data cleared!'
\echo ''

-- Verify cleanup
\echo 'After cleanup:'
SELECT 
    'events' as table_name,
    COUNT(*) as records
FROM events
UNION ALL
SELECT 
    'crashes' as table_name,
    COUNT(*) as records
FROM crashes
UNION ALL
SELECT 
    'user_stats' as table_name,
    COUNT(*) as records
FROM user_stats;

\echo ''
\echo '========================================='
\echo '✅ CLEANUP COMPLETE'
\echo '========================================='
\echo ''
\echo 'Structure maintained:'
\echo '- ✅ Tables still exist'
\echo '- ✅ Indexes still exist'
\echo '- ✅ Views still exist'
\echo ''
\echo 'Next: Open Stories app and record something!'
\echo ''

