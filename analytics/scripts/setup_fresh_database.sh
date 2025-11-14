#!/bin/bash
# ============================================================================
# SETUP FRESH TELEMETRY DATABASE
# ============================================================================
# This script:
# 1. Cleans existing database
# 2. Runs all migrations
# 3. Verifies setup
#
# Usage:
#   export DATABASE_URL="postgresql://..."
#   bash scripts/setup_fresh_database.sh
# ============================================================================

set -e  # Exit on error

echo "========================================="
echo "🚀 FRESH DATABASE SETUP"
echo "========================================="
echo ""

# Check DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable not set"
    echo ""
    echo "Set it with:"
    echo "  export DATABASE_URL='postgresql://user:pass@host/database'"
    exit 1
fi

echo "✅ DATABASE_URL is set"
echo ""

# Step 1: Reset database
echo "Step 1/3: Resetting database..."
psql "$DATABASE_URL" -f scripts/reset_database.sql
echo ""

# Step 2: Run initial schema
echo "Step 2/3: Creating schema..."
psql "$DATABASE_URL" -f migrations/001_initial_schema.sql
echo ""

# Step 3: Add composite indexes
echo "Step 3/3: Adding performance indexes..."
psql "$DATABASE_URL" -f migrations/002_add_composite_indexes.sql
echo ""

# Verify setup
echo "========================================="
echo "✅ VERIFICATION"
echo "========================================="
echo ""

psql "$DATABASE_URL" -c "
SELECT 
    'Tables' as type,
    COUNT(*) as count
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
UNION ALL
SELECT 
    'Indexes' as type,
    COUNT(*) as count
FROM pg_indexes 
WHERE schemaname = 'public'
UNION ALL
SELECT 
    'Views' as type,
    COUNT(*) as count
FROM information_schema.views 
WHERE table_schema = 'public'
ORDER BY type;
"

echo ""
echo "========================================="
echo "✅ SETUP COMPLETE!"
echo "========================================="
echo ""
echo "📊 Dashboard: https://stories-analytics.onrender.com/dashboard"
echo "🧪 Test: Open Stories app and record something"
echo ""

