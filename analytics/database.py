"""
Database connection and query utilities for Stories Analytics
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from psycopg2.pool import SimpleConnectionPool
from contextlib import contextmanager
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

# Database connection pool
pool = None

# Excluded users (test accounts) - can be set via environment variable
# Format: EXCLUDED_USER_IDS=user_id_1,user_id_2,another_id
def get_excluded_users():
    """Get list of excluded user IDs from environment variable"""
    try:
        excluded = os.environ.get('EXCLUDED_USER_IDS', '')
        if not excluded or excluded.strip() == '':
            return []
        return [uid.strip() for uid in excluded.split(',') if uid.strip()]
    except Exception as e:
        logger.warning(f"Error parsing EXCLUDED_USER_IDS: {e}")
        return []

EXCLUDED_USER_IDS = get_excluded_users()

def get_user_exclusion_clause():
    """
    Get SQL WHERE clause to exclude test users
    Returns: tuple (where_clause, params_dict)
    """
    if not EXCLUDED_USER_IDS or len(EXCLUDED_USER_IDS) == 0:
        return "", {}
    
    try:
        # Build exclusion clause that matches partial user_ids (first 8 chars)
        # user_id starts with any of the excluded IDs
        # Use parameterized approach to avoid SQL injection
        conditions = []
        for uid in EXCLUDED_USER_IDS:
            # Escape single quotes and validate format
            if uid and len(uid) >= 4 and uid.replace('-', '').replace('_', '').isalnum():
                conditions.append(f"user_id NOT LIKE '{uid}%'")
        
        if not conditions:
            return "", {}
        
        where_clause = f"AND ({' AND '.join(conditions)})"
        return where_clause, {}
    except Exception as e:
        logger.error(f"Error building exclusion clause: {e}")
        return "", {}

def init_db():
    """Initialize database connection pool"""
    global pool
    
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise ValueError("DATABASE_URL environment variable not set")
    
    # Create connection pool (min 1, max 10 connections)
    pool = SimpleConnectionPool(
        minconn=1,
        maxconn=10,
        dsn=database_url
    )
    
    logger.info("✅ Database connection pool initialized")
    return pool

@contextmanager
def get_db_connection():
    """Get a database connection from the pool"""
    if pool is None:
        init_db()
    
    conn = pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"❌ Database error: {e}")
        raise
    finally:
        pool.putconn(conn)

def test_connection():
    """Test database connection"""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT 1')
                result = cur.fetchone()
                return result[0] == 1
    except Exception as e:
        logger.error(f"❌ Connection test failed: {e}")
        return False

# =============================================================================
# EVENT QUERIES
# =============================================================================

def insert_events(events):
    """
    Insert multiple events
    
    Args:
        events: List of event dictionaries
        
    Returns:
        Number of events inserted
    """
    if not events:
        return 0
    
    query = """
        INSERT INTO events (
            user_id, event, timestamp, properties,
            app_version, platform, country
        ) VALUES (
            %(user_id)s, %(event)s, %(timestamp)s, %(properties)s,
            %(app_version)s, %(platform)s, %(country)s
        )
    """
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Prepare events for insertion
                for event in events:
                    # Convert properties dict to JSON
                    if 'properties' in event and event['properties']:
                        event['properties'] = Json(event['properties'])
                    else:
                        event['properties'] = None
                
                # Execute batch insert
                cur.executemany(query, events)
                return len(events)
    except Exception as e:
        logger.error(f"❌ Error inserting events: {e}")
        raise

def get_events(user_id=None, event_type=None, start_date=None, end_date=None, limit=100):
    """
    Query events with filters (legacy function, kept for compatibility)
    
    Args:
        user_id: Filter by user ID
        event_type: Filter by event type
        start_date: Filter by start date
        end_date: Filter by end date
        limit: Maximum number of results
        
    Returns:
        List of events
    """
    query = "SELECT * FROM events WHERE 1=1"
    params = {}
    
    if user_id:
        query += " AND user_id = %(user_id)s"
        params['user_id'] = user_id
    
    if event_type:
        query += " AND event = %(event_type)s"
        params['event_type'] = event_type
    
    if start_date:
        query += " AND timestamp >= %(start_date)s"
        params['start_date'] = start_date
    
    if end_date:
        query += " AND timestamp <= %(end_date)s"
        params['end_date'] = end_date
    
    query += " ORDER BY timestamp DESC LIMIT %(limit)s"
    params['limit'] = limit
    
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                return cur.fetchall()
    except Exception as e:
        logger.error(f"❌ Error querying events: {e}")
        raise

def get_events_paginated(user_id=None, user_ids=None, event_type=None, start_date=None, end_date=None, min_duration=None, max_duration=None, duration_ranges=None, limit=20, offset=0):
    """
    Query events with pagination support
    
    Args:
        user_id: Filter by single user ID (legacy support)
        user_ids: Filter by list of user IDs
        event_type: Filter by event type
        start_date: Filter by start date
        end_date: Filter by end date
        min_duration: Minimum duration in seconds (filters on duration_seconds or audio_duration_seconds)
        max_duration: Maximum duration in seconds (filters on duration_seconds or audio_duration_seconds)
        limit: Maximum number of results per page
        offset: Number of results to skip
        
    Returns:
        List of events
    """
    query = "SELECT * FROM events WHERE 1=1"
    params = {}
    
    if user_id:
        query += " AND user_id = %(user_id)s"
        params['user_id'] = user_id
    elif user_ids and len(user_ids) > 0:
        # Filter by multiple user IDs
        query += " AND user_id = ANY(%(user_ids)s)"
        params['user_ids'] = user_ids
    
    if event_type:
        query += " AND event = %(event_type)s"
        params['event_type'] = event_type
    
    if start_date:
        query += " AND timestamp >= %(start_date)s"
        params['start_date'] = start_date
    
    if end_date:
        query += " AND timestamp <= %(end_date)s"
        params['end_date'] = end_date
    
    # Duration filter - support multiple ranges or single min/max
    # Use COALESCE to prefer duration_seconds, fallback to audio_duration_seconds
    if duration_ranges and len(duration_ranges) > 0:
        # Multiple ranges - use OR conditions
        range_conditions = []
        for i, (min_dur, max_dur) in enumerate(duration_ranges):
            param_min = f'duration_min_{i}'
            param_max = f'duration_max_{i}'
            range_conditions.append(f"""(
                COALESCE(
                    (properties->>'duration_seconds')::FLOAT,
                    (properties->>'audio_duration_seconds')::FLOAT,
                    0
                ) >= %({param_min})s
                AND COALESCE(
                    (properties->>'duration_seconds')::FLOAT,
                    (properties->>'audio_duration_seconds')::FLOAT,
                    999999
                ) <= %({param_max})s
            )""")
            params[param_min] = min_dur
            params[param_max] = max_dur
        
        if range_conditions:
            query += " AND (" + " OR ".join(range_conditions) + ")"
    elif min_duration is not None or max_duration is not None:
        # Single range (legacy support)
        if min_duration is not None:
            query += """ AND COALESCE(
                (properties->>'duration_seconds')::FLOAT,
                (properties->>'audio_duration_seconds')::FLOAT,
                0
            ) >= %(min_duration)s"""
            params['min_duration'] = min_duration
        
        if max_duration is not None:
            query += """ AND COALESCE(
                (properties->>'duration_seconds')::FLOAT,
                (properties->>'audio_duration_seconds')::FLOAT,
                999999
            ) <= %(max_duration)s"""
            params['max_duration'] = max_duration
    
    query += " ORDER BY timestamp DESC LIMIT %(limit)s OFFSET %(offset)s"
    params['limit'] = limit
    params['offset'] = offset
    
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                return cur.fetchall()
    except Exception as e:
        logger.error(f"❌ Error querying events: {e}")
        raise

def get_events_count(user_id=None, user_ids=None, event_type=None, start_date=None, end_date=None, min_duration=None, max_duration=None, duration_ranges=None):
    """
    Get total count of events matching filters
    
    Args:
        user_id: Filter by single user ID (legacy support)
        user_ids: Filter by list of user IDs
        event_type: Filter by event type
        start_date: Filter by start date
        end_date: Filter by end date
        min_duration: Minimum duration in seconds (filters on duration_seconds or audio_duration_seconds)
        max_duration: Maximum duration in seconds (filters on duration_seconds or audio_duration_seconds)
        
    Returns:
        Total count of matching events
    """
    query = "SELECT COUNT(*) FROM events WHERE 1=1"
    params = {}
    
    if user_id:
        query += " AND user_id = %(user_id)s"
        params['user_id'] = user_id
    elif user_ids and len(user_ids) > 0:
        # Filter by multiple user IDs
        query += " AND user_id = ANY(%(user_ids)s)"
        params['user_ids'] = user_ids
    
    if event_type:
        query += " AND event = %(event_type)s"
        params['event_type'] = event_type
    
    if start_date:
        query += " AND timestamp >= %(start_date)s"
        params['start_date'] = start_date
    
    if end_date:
        query += " AND timestamp <= %(end_date)s"
        params['end_date'] = end_date
    
    # Duration filter - support multiple ranges or single min/max
    # Use COALESCE to prefer duration_seconds, fallback to audio_duration_seconds
    if duration_ranges and len(duration_ranges) > 0:
        # Multiple ranges - use OR conditions
        range_conditions = []
        for i, (min_dur, max_dur) in enumerate(duration_ranges):
            param_min = f'duration_min_{i}'
            param_max = f'duration_max_{i}'
            range_conditions.append(f"""(
                COALESCE(
                    (properties->>'duration_seconds')::FLOAT,
                    (properties->>'audio_duration_seconds')::FLOAT,
                    0
                ) >= %({param_min})s
                AND COALESCE(
                    (properties->>'duration_seconds')::FLOAT,
                    (properties->>'audio_duration_seconds')::FLOAT,
                    999999
                ) <= %({param_max})s
            )""")
            params[param_min] = min_dur
            params[param_max] = max_dur
        
        if range_conditions:
            query += " AND (" + " OR ".join(range_conditions) + ")"
    elif min_duration is not None or max_duration is not None:
        # Single range (legacy support)
        if min_duration is not None:
            query += """ AND COALESCE(
                (properties->>'duration_seconds')::FLOAT,
                (properties->>'audio_duration_seconds')::FLOAT,
                0
            ) >= %(min_duration)s"""
            params['min_duration'] = min_duration
        
        if max_duration is not None:
            query += """ AND COALESCE(
                (properties->>'duration_seconds')::FLOAT,
                (properties->>'audio_duration_seconds')::FLOAT,
                999999
            ) <= %(max_duration)s"""
            params['max_duration'] = max_duration
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                return cur.fetchone()[0]
    except Exception as e:
        logger.error(f"❌ Error counting events: {e}")
        raise

def get_unique_users(days=7, event_type=None, duration_ranges=None):
    """
    Get list of unique user IDs from events in the specified time period
    
    Args:
        days: Number of days to look back (default: 7)
        event_type: Optional event type to filter by (e.g., 'transcription_completed')
        duration_ranges: Optional list of (min_duration, max_duration) tuples to filter by
        
    Returns:
        List of user ID strings
    """
    # Use PostgreSQL NOW() to be consistent with stats queries
    query = f"""
        SELECT DISTINCT user_id 
        FROM events 
        WHERE timestamp >= NOW() - INTERVAL '{days} days'
    """
    
    params = {}
    
    # Add event type filter if provided
    if event_type:
        query += " AND event = %(event_type)s"
        params['event_type'] = event_type
    
    # Add duration filters if provided
    if duration_ranges and len(duration_ranges) > 0:
        range_conditions = []
        for i, (min_dur, max_dur) in enumerate(duration_ranges):
            param_min = f'duration_min_{i}'
            param_max = f'duration_max_{i}'
            range_conditions.append(f"""(
                COALESCE(
                    (properties->>'duration_seconds')::FLOAT,
                    (properties->>'audio_duration_seconds')::FLOAT,
                    0
                ) >= %({param_min})s
                AND COALESCE(
                    (properties->>'duration_seconds')::FLOAT,
                    (properties->>'audio_duration_seconds')::FLOAT,
                    999999
                ) <= %({param_max})s
            )""")
            params[param_min] = min_dur
            params[param_max] = max_dur
        if range_conditions:
            query += " AND (" + " OR ".join(range_conditions) + ")"
    
    query += " ORDER BY user_id"
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                # Return list of user_id strings
                return [row[0] for row in cur.fetchall()]
    except Exception as e:
        logger.error(f"❌ Error getting unique users: {e}")
        raise

# =============================================================================
# CRASH QUERIES
# =============================================================================

def insert_crash(crash_data):
    """
    Insert a crash report
    
    Args:
        crash_data: Crash report dictionary
        
    Returns:
        Crash ID
    """
    query = """
        INSERT INTO crashes (
            user_id, app_version, os_version, crash_type,
            error_message, stack_trace, context, timestamp
        ) VALUES (
            %(user_id)s, %(app_version)s, %(os_version)s, %(crash_type)s,
            %(error_message)s, %(stack_trace)s, %(context)s, %(timestamp)s
        ) RETURNING id
    """
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Convert context dict to JSON
                if 'context' in crash_data and crash_data['context']:
                    crash_data['context'] = Json(crash_data['context'])
                else:
                    crash_data['context'] = None
                
                cur.execute(query, crash_data)
                crash_id = cur.fetchone()[0]
                return crash_id
    except Exception as e:
        logger.error(f"❌ Error inserting crash: {e}")
        raise

def get_crashes(start_date=None, end_date=None, app_version=None, limit=100):
    """
    Query crashes with filters
    
    Args:
        start_date: Filter by start date
        end_date: Filter by end date
        app_version: Filter by app version
        limit: Maximum number of results
        
    Returns:
        List of crashes
    """
    query = "SELECT * FROM crashes WHERE 1=1"
    params = {}
    
    if start_date:
        query += " AND timestamp >= %(start_date)s"
        params['start_date'] = start_date
    
    if end_date:
        query += " AND timestamp <= %(end_date)s"
        params['end_date'] = end_date
    
    if app_version:
        query += " AND app_version = %(app_version)s"
        params['app_version'] = app_version
    
    query += " ORDER BY timestamp DESC LIMIT %(limit)s"
    params['limit'] = limit
    
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                return cur.fetchall()
    except Exception as e:
        logger.error(f"❌ Error querying crashes: {e}")
        raise

# =============================================================================
# STATISTICS QUERIES
# =============================================================================

def get_stats_summary(days=30):
    """
    Get aggregated statistics summary
    
    Args:
        days: Number of days to look back
        
    Returns:
        Statistics dictionary
    """
    start_date = datetime.now() - timedelta(days=days)
    
    query = """
        WITH stats AS (
            SELECT
                COUNT(DISTINCT user_id) as total_users,
                COUNT(*) as total_events,
                COUNT(*) FILTER (WHERE event = 'app_opened') as app_opened_count,
                COUNT(*) FILTER (WHERE event = 'recording_started') as recording_started_count,
                COUNT(*) FILTER (WHERE event = 'recording_completed') as recording_completed_count,
                COUNT(*) FILTER (WHERE event = 'transcription_completed') as transcription_completed_count,
                COUNT(*) FILTER (WHERE event = 'transcription_failed') as transcription_failed_count,
                SUM((properties->>'duration_seconds')::FLOAT) / 60.0 as total_minutes,
                SUM(
                    COALESCE(
                        (properties->>'cost_usd')::FLOAT,
                        (properties->>'estimated_cost_usd')::FLOAT,
                        0
                    )
                ) as total_cost
            FROM events
            WHERE timestamp >= %(start_date)s
        ),
        active_7d AS (
            SELECT COUNT(DISTINCT user_id) as count
            FROM events
            WHERE timestamp >= NOW() - INTERVAL '7 days'
        ),
        active_30d AS (
            SELECT COUNT(DISTINCT user_id) as count
            FROM events
            WHERE timestamp >= NOW() - INTERVAL '30 days'
        ),
        crash_stats AS (
            SELECT COUNT(*) as total_crashes
            FROM crashes
            WHERE timestamp >= %(start_date)s
        )
        SELECT
            stats.*,
            active_7d.count as active_users_7d,
            active_30d.count as active_users_30d,
            crash_stats.total_crashes,
            CASE 
                WHEN active_30d.count > 0 
                THEN (crash_stats.total_crashes::FLOAT / active_30d.count::FLOAT)
                ELSE 0 
            END as crash_rate
        FROM stats, active_7d, active_30d, crash_stats
    """
    
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, {'start_date': start_date})
                result = cur.fetchone()
                
                # Calculate success rate
                successful_recordings = result['transcription_completed_count'] or 0
                failed_recordings = result['transcription_failed_count'] or 0
                total_recordings = successful_recordings + failed_recordings
                
                success_rate = 0
                if total_recordings > 0:
                    success_rate = (successful_recordings / total_recordings) * 100
                
                # Format result
                return {
                    'total_users': result['total_users'] or 0,
                    'active_users_7d': result['active_users_7d'] or 0,
                    'active_users_30d': result['active_users_30d'] or 0,
                    'total_events': result['total_events'] or 0,
                    'app_opened_count': result['app_opened_count'] or 0,
                    'recording_started_count': result['recording_started_count'] or 0,
                    'recording_completed_count': result['recording_completed_count'] or 0,
                    'transcription_completed_count': result['transcription_completed_count'] or 0,
                    'transcription_failed_count': result['transcription_failed_count'] or 0,
                    'total_hours_transcribed': round(float(result['total_minutes'] or 0) / 60, 2),
                    'total_cost_usd': float(result['total_cost'] or 0),  # Don't round - let frontend decide
                    'total_crashes': result['total_crashes'] or 0,
                    'crash_rate': round(float(result['crash_rate'] or 0), 3),
                    'crash_free_rate': round(100 - (float(result['crash_rate'] or 0) * 100), 1),
                    # Add fields for Events chart and Success Rate
                    'total_recordings': total_recordings,
                    'successful_recordings': successful_recordings,
                    'total_errors': failed_recordings,
                    'success_rate': round(success_rate, 1)
                }
    except Exception as e:
        logger.error(f"❌ Error getting stats summary: {e}")
        raise

def get_top_countries(limit=10):
    """Get top countries by user count"""
    query = """
        SELECT 
            country,
            COUNT(DISTINCT user_id) as user_count,
            COUNT(DISTINCT user_id) * 100.0 / (SELECT COUNT(DISTINCT user_id) FROM events) as percentage
        FROM events
        WHERE country IS NOT NULL
        GROUP BY country
        ORDER BY user_count DESC
        LIMIT %(limit)s
    """
    
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, {'limit': limit})
                results = cur.fetchall()
                
                return [{
                    'country': row['country'],
                    'users': row['user_count'],
                    'percentage': round(float(row['percentage'] or 0), 1)
                } for row in results]
    except Exception as e:
        logger.error(f"❌ Error getting top countries: {e}")
        raise

def get_daily_stats(days=30):
    """Get daily statistics for the last N days"""
    start_date = datetime.now() - timedelta(days=days)
    
    query = """
        SELECT
            DATE(timestamp) as date,
            COUNT(DISTINCT user_id) as active_users,
            COUNT(*) FILTER (WHERE event = 'app_opened') as app_opened_count,
            COUNT(*) FILTER (WHERE event = 'recording_started') as recording_started_count,
            COUNT(*) FILTER (WHERE event = 'recording_completed') as recording_completed_count,
            COUNT(*) FILTER (WHERE event = 'transcription_completed') as transcription_completed_count,
            COUNT(*) FILTER (WHERE event = 'transcription_failed') as transcription_failed_count,
            SUM((properties->>'duration_seconds')::FLOAT) / 60.0 as minutes_transcribed,
            SUM(
                COALESCE(
                    (properties->>'cost_usd')::FLOAT,
                    (properties->>'estimated_cost_usd')::FLOAT,
                    0
                )
            ) as cost_usd
        FROM events
        WHERE timestamp >= %(start_date)s
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
    """
    
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, {'start_date': start_date})
                results = cur.fetchall()
                
                return [{
                    'date': row['date'].isoformat(),
                    'active_users': row['active_users'] or 0,
                    'app_opened_count': row['app_opened_count'] or 0,
                    'recording_started_count': row['recording_started_count'] or 0,
                    'recording_completed_count': row['recording_completed_count'] or 0,
                    'transcription_completed_count': row['transcription_completed_count'] or 0,
                    'transcription_failed_count': row['transcription_failed_count'] or 0,
                    'minutes_transcribed': round(float(row['minutes_transcribed'] or 0), 1),
                    'cost_usd': float(row['cost_usd'] or 0),  # Don't round - let frontend decide
                    'recordings': row['transcription_completed_count'] or 0  # For timeline chart
                } for row in results]
    except Exception as e:
        logger.error(f"❌ Error getting daily stats: {e}")
        raise

# =============================================================================
# DATA CLEANUP
# =============================================================================

def cleanup_old_data():
    """Delete data older than 365 days (GDPR retention policy)"""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Cleanup events
                cur.execute("SELECT cleanup_old_events()")
                events_deleted = cur.fetchone()[0]
                
                # Cleanup crashes
                cur.execute("SELECT cleanup_old_crashes()")
                crashes_deleted = cur.fetchone()[0]
                
                logger.info(f"🧹 Cleaned up {events_deleted} old events and {crashes_deleted} old crashes")
                
                return {
                    'events_deleted': events_deleted,
                    'crashes_deleted': crashes_deleted
                }
    except Exception as e:
        logger.error(f"❌ Error cleaning up old data: {e}")
        raise

