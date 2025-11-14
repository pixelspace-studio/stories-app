"""
Stories Analytics Backend
Flask API for telemetry and crash reporting
"""

import os
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from functools import wraps

# Import local modules
from database import (
    init_db, test_connection,
    insert_events, get_events, get_events_paginated, get_events_count,
    insert_crash, get_crashes,
    get_stats_summary, get_top_countries, get_daily_stats,
    cleanup_old_data, get_unique_users
)
from models import (
    validate_events_batch, validate_crash,
    validate_stats_query_params
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__, static_folder='dashboard', static_url_path='/dashboard')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key')

# Configure CORS
CORS(app, origins=os.environ.get('CORS_ORIGINS', '*').split(','))

# Initialize database on startup
try:
    init_db()
    if test_connection():
        logger.info("✅ Database connection successful")
    else:
        logger.error("❌ Database connection failed")
except Exception as e:
    logger.error(f"❌ Failed to initialize database: {e}")

# =============================================================================
# AUTHENTICATION
# =============================================================================

def requires_auth(f):
    """Decorator for routes that require Basic Auth"""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        
        username = os.environ.get('DASHBOARD_USERNAME', 'admin')
        password = os.environ.get('DASHBOARD_PASSWORD', 'admin')
        
        if not auth or auth.username != username or auth.password != password:
            return jsonify({
                'success': False,
                'error': 'Authentication required'
            }), 401
        
        return f(*args, **kwargs)
    
    return decorated

# =============================================================================
# PUBLIC ENDPOINTS
# =============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        db_healthy = test_connection()
        
        return jsonify({
            'status': 'healthy' if db_healthy else 'unhealthy',
            'database': 'connected' if db_healthy else 'disconnected',
            'version': '1.0.0',
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200 if db_healthy else 503
    
    except Exception as e:
        logger.error(f"❌ Health check failed: {e}")
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 503

@app.route('/track', methods=['POST'])
def track_events():
    """
    Receive and store telemetry events
    
    POST /track
    Body: {
        "events": [
            {
                "user_id": "uuid-v4",
                "event": "recording_completed",
                "timestamp": "2025-10-28T14:30:00Z",
                "properties": {...},
                "app_version": "0.9.51",
                "platform": "darwin-24.6.0",
                "country": "US"
            }
        ]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'events' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: events'
            }), 400
        
        # Validate events
        is_valid, errors, cleaned_events = validate_events_batch(data['events'])
        
        if not is_valid:
            return jsonify({
                'success': False,
                'error': 'Validation failed',
                'details': errors
            }), 400
        
        # Insert events into database
        count = insert_events(cleaned_events)
        
        logger.info(f"✅ Received {count} events")
        
        return jsonify({
            'success': True,
            'events_received': count,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
    
    except Exception as e:
        logger.error(f"❌ Error tracking events: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'details': str(e)
        }), 500

@app.route('/crash', methods=['POST'])
def report_crash():
    """
    Receive and store crash reports
    
    POST /crash
    Body: {
        "user_id": "uuid-v4",
        "app_version": "0.9.51",
        "os_version": "darwin-24.6.0",
        "crash_type": "uncaught_error",
        "error_message": "TypeError: ...",
        "stack_trace": "at functionName...",
        "context": {...},
        "timestamp": "2025-10-28T14:30:00Z"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'Missing request body'
            }), 400
        
        # Validate crash data
        is_valid, error, cleaned_crash = validate_crash(data)
        
        if not is_valid:
            return jsonify({
                'success': False,
                'error': 'Validation failed',
                'details': error
            }), 400
        
        # Insert crash into database
        crash_id = insert_crash(cleaned_crash)
        
        logger.warning(f"⚠️ Crash report received: {crash_id} - {cleaned_crash.get('crash_type')}")
        
        return jsonify({
            'success': True,
            'crash_id': crash_id,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
    
    except Exception as e:
        logger.error(f"❌ Error reporting crash: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'details': str(e)
        }), 500

# =============================================================================
# AUTHENTICATED ENDPOINTS (Dashboard & Stats)
# =============================================================================

@app.route('/stats', methods=['GET'])
@requires_auth
def get_stats():
    """
    Get aggregated statistics
    
    GET /stats?period=30d&group_by=day
    
    Query params:
    - period: 7d, 30d, 90d, all (default: 30d)
    - group_by: day, week, month (default: day)
    """
    try:
        # Validate query parameters
        is_valid, error, params = validate_stats_query_params(request.args)
        
        if not is_valid:
            return jsonify({
                'success': False,
                'error': error
            }), 400
        
        # Calculate days based on period
        period_days = {
            '7d': 7,
            '30d': 30,
            '90d': 90,
            'all': 36500  # ~100 years
        }
        days = period_days.get(params['period'], 30)
        
        # Get statistics
        summary = get_stats_summary(days=days)
        daily_stats = get_daily_stats(days=days)
        top_countries = get_top_countries(limit=10)
        
        return jsonify({
            'success': True,
            'period': params['period'],
            'summary': summary,
            'daily_stats': daily_stats,
            'top_countries': top_countries,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
    
    except Exception as e:
        logger.error(f"❌ Error getting stats: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'details': str(e)
        }), 500

@app.route('/events', methods=['GET'])
@requires_auth
def query_events():
    """
    Query events with pagination and date filters
    
    GET /events?user_id=xxx&user_ids=xxx,yyy,zzz&event_type=xxx&days=7&page=1&per_page=20
    
    Query params:
    - user_id: Filter by single user ID (legacy support)
    - user_ids: Filter by multiple user IDs (comma-separated)
    - event_type: Filter by event type  
    - days: Filter last N days (1, 7, 30, or 90) - default: 7
    - page: Page number (1-based) - default: 1
    - per_page: Results per page (max 100) - default: 20
    - start_date, end_date: Custom date range (optional, overrides days)
    """
    try:
        from datetime import datetime, timedelta
        
        user_id = request.args.get('user_id')
        user_ids_param = request.args.get('user_ids')
        event_type = request.args.get('event_type')
        
        # Parse user_ids if provided
        user_ids = None
        if user_ids_param:
            user_ids = [uid.strip() for uid in user_ids_param.split(',') if uid.strip()]
        
        # Pagination params
        page = max(1, int(request.args.get('page', 1)))
        per_page = min(100, int(request.args.get('per_page', 20)))
        
        # Date filtering
        days = request.args.get('days')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        # If days parameter provided, calculate start_date
        if days and not start_date:
            days_int = int(days)
            if days_int in [1, 7, 30, 90]:  # Allow 1 day (24 hours), 7, 30, or 90 days
                start_date = (datetime.utcnow() - timedelta(days=days_int)).isoformat() + 'Z'
        
        # Default to last 7 days if no date filters
        if not start_date and not end_date:
            start_date = (datetime.utcnow() - timedelta(days=7)).isoformat() + 'Z'
        
        # Duration filtering - support multiple ranges
        duration_ranges_param = request.args.get('duration_ranges')
        duration_ranges = None
        
        if duration_ranges_param:
            # Parse duration ranges (e.g., "0-60,60-300,300-600")
            try:
                ranges = [r.strip() for r in duration_ranges_param.split(',') if r.strip()]
                duration_ranges = []
                for range_str in ranges:
                    if '-' in range_str:
                        min_dur, max_dur = range_str.split('-')
                        duration_ranges.append((float(min_dur), float(max_dur)))
            except (ValueError, TypeError):
                duration_ranges = None
        
        # Calculate offset for pagination
        offset = (page - 1) * per_page
        
        # Get total count for pagination metadata
        total_count = get_events_count(
            user_id=user_id,
            user_ids=user_ids,
            event_type=event_type,
            start_date=start_date,
            end_date=end_date,
            duration_ranges=duration_ranges
        )
        
        # Get paginated events
        events = get_events_paginated(
            user_id=user_id,
            user_ids=user_ids,
            event_type=event_type,
            start_date=start_date,
            end_date=end_date,
            duration_ranges=duration_ranges,
            limit=per_page,
            offset=offset
        )
        
        # Ensure properties is properly serialized as dict (RealDictCursor returns dict, but ensure it's JSON-serializable)
        for event in events:
            if 'properties' in event and event['properties']:
                # If properties is already a dict, ensure it's JSON-serializable
                # RealDictCursor should return it as dict, but double-check
                if isinstance(event['properties'], str):
                    try:
                        event['properties'] = json.loads(event['properties'])
                    except (json.JSONDecodeError, TypeError):
                        event['properties'] = {}
                elif not isinstance(event['properties'], dict):
                    event['properties'] = {}
            else:
                event['properties'] = {}
        
        total_pages = (total_count + per_page - 1) // per_page  # Ceiling division
        
        return jsonify({
            'success': True,
            'events': events,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total_count': total_count,
                'total_pages': total_pages,
                'has_next': page < total_pages,
                'has_prev': page > 1
            }
        }), 200
    
    except Exception as e:
        logger.error(f"❌ Error querying events: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'details': str(e)
        }), 500

@app.route('/users', methods=['GET'])
@requires_auth
def get_users():
    """
    Get list of unique user IDs from events
    
    GET /users?days=7&event_type=transcription_completed
    
    Query params:
    - days: Number of days to look back (7, 30, or 90) - default: 7
    - event_type: Optional event type to filter by (e.g., 'transcription_completed')
    
    Returns:
        List of user IDs with metadata
    """
    try:
        # Get days parameter
        days = int(request.args.get('days', 7))
        
        # Validate days parameter
        if days not in [7, 30, 90]:
            days = 7  # Default to 7 if invalid
        
        # Get optional event_type parameter
        event_type = request.args.get('event_type')
        
        # Validate event_type if provided
        if event_type:
            from models import VALID_EVENTS
            if event_type not in VALID_EVENTS:
                return jsonify({
                    'success': False,
                    'error': f'Invalid event_type. Must be one of: {", ".join(VALID_EVENTS)}'
                }), 400
        
        # Get optional duration_ranges parameter
        duration_ranges_param = request.args.get('duration_ranges')
        duration_ranges = None
        if duration_ranges_param:
            try:
                ranges = [r.strip() for r in duration_ranges_param.split(',') if r.strip()]
                duration_ranges = []
                for range_str in ranges:
                    if '-' in range_str:
                        min_dur, max_dur = range_str.split('-')
                        duration_ranges.append((float(min_dur), float(max_dur)))
            except (ValueError, TypeError):
                duration_ranges = None
        
        # Get unique users from database
        user_ids = get_unique_users(days=days, event_type=event_type, duration_ranges=duration_ranges)
        
        return jsonify({
            'success': True,
            'users': user_ids,
            'count': len(user_ids),
            'period_days': days,
            'event_type': event_type
        }), 200
    
    except Exception as e:
        logger.error(f"❌ Error getting users: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'details': str(e)
        }), 500

@app.route('/crashes', methods=['GET'])
@requires_auth
def query_crashes():
    """
    Query crashes (for debugging)
    
    GET /crashes?app_version=xxx&start_date=xxx&limit=100
    """
    try:
        app_version = request.args.get('app_version')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = int(request.args.get('limit', 100))
        
        crashes = get_crashes(
            app_version=app_version,
            start_date=start_date,
            end_date=end_date,
            limit=min(limit, 1000)  # Max 1000
        )
        
        return jsonify({
            'success': True,
            'crashes': crashes,
            'count': len(crashes)
        }), 200
    
    except Exception as e:
        logger.error(f"❌ Error querying crashes: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'details': str(e)
        }), 500

@app.route('/cleanup', methods=['POST'])
@requires_auth
def cleanup():
    """
    Manually trigger data cleanup (delete data older than 365 days)
    
    POST /cleanup
    """
    try:
        result = cleanup_old_data()
        
        logger.info(f"🧹 Cleanup completed: {result}")
        
        return jsonify({
            'success': True,
            'result': result,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
    
    except Exception as e:
        logger.error(f"❌ Error during cleanup: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'details': str(e)
        }), 500

# =============================================================================
# ERROR HANDLERS
# =============================================================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({
        'success': False,
        'error': 'Method not allowed'
    }), 405

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"❌ Internal server error: {error}")
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

# =============================================================================
# ROOT ENDPOINT
# =============================================================================

@app.route('/', methods=['GET'])
def root():
    """Root endpoint - Serve dashboard or API info"""
    # If request accepts HTML, serve dashboard
    if 'text/html' in request.headers.get('Accept', ''):
        from flask import send_from_directory
        return send_from_directory('dashboard', 'index.html')
    
    # Otherwise, return API information (JSON)
    return jsonify({
        'name': 'Stories Analytics API',
        'version': '1.0.0',
        'endpoints': {
            'health': 'GET /health',
            'track': 'POST /track',
            'crash': 'POST /crash',
            'stats': 'GET /stats (requires auth)',
            'events': 'GET /events (requires auth)',
            'crashes': 'GET /crashes (requires auth)',
            'cleanup': 'POST /cleanup (requires auth)'
        },
        'documentation': 'https://github.com/pixelspace-studio/stories-app/blob/main/docs/TELEMETRY_SPEC.md'
    }), 200

# =============================================================================
# MAIN
# =============================================================================

if __name__ == '__main__':
    # Development server
    port = int(os.environ.get('PORT', 5000))
    app.run(
        host='0.0.0.0',
        port=port,
        debug=os.environ.get('FLASK_ENV') != 'production'
    )

