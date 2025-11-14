"""
Data validation models for Stories Analytics
"""

from datetime import datetime
import re

# Valid event types
VALID_EVENTS = {
    'app_opened',
    'recording_started',
    'recording_completed',
    'transcription_completed',
    'transcription_failed',
    'feature_toggled',
    'retry_attempted'
}

# Valid crash types
VALID_CRASH_TYPES = {
    'main_crash',
    'renderer_crash',
    'uncaught_error',
    'unhandled_rejection'
}

# Valid country codes (ISO 3166-1 alpha-2)
# Just a subset of common ones for validation
VALID_COUNTRIES = {
    'US', 'MX', 'CA', 'GB', 'ES', 'FR', 'DE', 'IT', 'BR', 'AR',
    'CL', 'CO', 'PE', 'JP', 'CN', 'IN', 'AU', 'NZ', 'RU', 'UA',
    'PL', 'NL', 'BE', 'SE', 'NO', 'DK', 'FI', 'PT', 'GR', 'TR'
}

# UUID v4 regex pattern
UUID_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    re.IGNORECASE
)

def validate_uuid(user_id):
    """Validate UUID format"""
    if not user_id or not isinstance(user_id, str):
        return False
    return bool(UUID_PATTERN.match(user_id))

def validate_timestamp(timestamp_str):
    """Validate and parse ISO 8601 timestamp"""
    if not timestamp_str:
        return None
    
    try:
        # Try parsing ISO 8601 format
        return datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
    except (ValueError, AttributeError):
        return None

def validate_event(event_data):
    """
    Validate event data
    
    Args:
        event_data: Event dictionary
        
    Returns:
        (is_valid, error_message, cleaned_data)
    """
    errors = []
    
    # Required fields
    if 'user_id' not in event_data:
        errors.append("Missing required field: user_id")
    elif not validate_uuid(event_data['user_id']):
        errors.append("Invalid user_id format (must be UUID v4)")
    
    if 'event' not in event_data:
        errors.append("Missing required field: event")
    elif event_data['event'] not in VALID_EVENTS:
        errors.append(f"Invalid event type: {event_data['event']}")
    
    if 'timestamp' not in event_data:
        errors.append("Missing required field: timestamp")
    else:
        parsed_timestamp = validate_timestamp(event_data['timestamp'])
        if not parsed_timestamp:
            errors.append("Invalid timestamp format (must be ISO 8601)")
        else:
            event_data['timestamp'] = parsed_timestamp
    
    # Optional fields with validation
    if 'app_version' in event_data:
        if not isinstance(event_data['app_version'], str):
            errors.append("app_version must be a string")
        elif len(event_data['app_version']) > 20:
            errors.append("app_version too long (max 20 characters)")
    
    if 'platform' in event_data:
        if not isinstance(event_data['platform'], str):
            errors.append("platform must be a string")
        elif len(event_data['platform']) > 50:
            errors.append("platform too long (max 50 characters)")
    
    if 'country' in event_data:
        if event_data['country'] and event_data['country'] not in VALID_COUNTRIES:
            # Don't reject, just warn (allow any 2-letter code)
            if len(event_data['country']) != 2:
                errors.append("country must be 2-letter ISO code")
    
    if 'properties' in event_data:
        if not isinstance(event_data['properties'], dict):
            errors.append("properties must be a dictionary")
        else:
            # Validate specific properties based on event type
            props = event_data['properties']
            
            if event_data.get('event') == 'recording_completed':
                if 'audio_duration_seconds' in props:
                    if not isinstance(props['audio_duration_seconds'], (int, float)):
                        errors.append("audio_duration_seconds must be a number")
                    elif props['audio_duration_seconds'] < 0:
                        errors.append("audio_duration_seconds cannot be negative")
                
                if 'processing_time_seconds' in props:
                    if not isinstance(props['processing_time_seconds'], (int, float)):
                        errors.append("processing_time_seconds must be a number")
                    elif props['processing_time_seconds'] < 0:
                        errors.append("processing_time_seconds cannot be negative")
                
                if 'estimated_cost_usd' in props:
                    if not isinstance(props['estimated_cost_usd'], (int, float)):
                        errors.append("estimated_cost_usd must be a number")
                    elif props['estimated_cost_usd'] < 0:
                        errors.append("estimated_cost_usd cannot be negative")
            
            if event_data.get('event') == 'feature_toggled':
                if 'feature' not in props:
                    errors.append("feature_toggled event must have 'feature' property")
                if 'enabled' not in props:
                    errors.append("feature_toggled event must have 'enabled' property")
    
    if errors:
        return False, "; ".join(errors), None
    
    return True, None, event_data

def validate_events_batch(events):
    """
    Validate multiple events
    
    Args:
        events: List of event dictionaries
        
    Returns:
        (is_valid, error_messages, cleaned_events)
    """
    if not isinstance(events, list):
        return False, ["events must be a list"], None
    
    if len(events) == 0:
        return False, ["events list cannot be empty"], None
    
    if len(events) > 50:
        return False, ["events batch too large (max 50 events)"], None
    
    cleaned_events = []
    errors = []
    
    for i, event in enumerate(events):
        is_valid, error_msg, cleaned_event = validate_event(event)
        if is_valid:
            cleaned_events.append(cleaned_event)
        else:
            errors.append(f"Event {i}: {error_msg}")
    
    if errors:
        return False, errors, None
    
    return True, None, cleaned_events

def validate_crash(crash_data):
    """
    Validate crash report data
    
    Args:
        crash_data: Crash report dictionary
        
    Returns:
        (is_valid, error_message, cleaned_data)
    """
    errors = []
    
    # Required fields
    if 'user_id' not in crash_data:
        errors.append("Missing required field: user_id")
    elif not validate_uuid(crash_data['user_id']):
        errors.append("Invalid user_id format (must be UUID v4)")
    
    if 'app_version' not in crash_data:
        errors.append("Missing required field: app_version")
    elif not isinstance(crash_data['app_version'], str):
        errors.append("app_version must be a string")
    elif len(crash_data['app_version']) > 20:
        errors.append("app_version too long (max 20 characters)")
    
    if 'crash_type' not in crash_data:
        errors.append("Missing required field: crash_type")
    elif crash_data['crash_type'] not in VALID_CRASH_TYPES:
        errors.append(f"Invalid crash type: {crash_data['crash_type']}")
    
    if 'error_message' not in crash_data:
        errors.append("Missing required field: error_message")
    elif not isinstance(crash_data['error_message'], str):
        errors.append("error_message must be a string")
    elif len(crash_data['error_message']) > 5000:
        errors.append("error_message too long (max 5000 characters)")
    
    if 'timestamp' not in crash_data:
        errors.append("Missing required field: timestamp")
    else:
        parsed_timestamp = validate_timestamp(crash_data['timestamp'])
        if not parsed_timestamp:
            errors.append("Invalid timestamp format (must be ISO 8601)")
        else:
            crash_data['timestamp'] = parsed_timestamp
    
    # Optional fields
    if 'os_version' in crash_data:
        if not isinstance(crash_data['os_version'], str):
            errors.append("os_version must be a string")
        elif len(crash_data['os_version']) > 50:
            errors.append("os_version too long (max 50 characters)")
    
    if 'stack_trace' in crash_data:
        if not isinstance(crash_data['stack_trace'], str):
            errors.append("stack_trace must be a string")
        elif len(crash_data['stack_trace']) > 50000:
            errors.append("stack_trace too long (max 50,000 characters)")
    
    if 'context' in crash_data:
        if not isinstance(crash_data['context'], dict):
            errors.append("context must be a dictionary")
    
    if errors:
        return False, "; ".join(errors), None
    
    return True, None, crash_data

def sanitize_string(value, max_length=None):
    """Sanitize string input"""
    if not isinstance(value, str):
        return str(value)
    
    # Remove null bytes
    value = value.replace('\x00', '')
    
    # Trim whitespace
    value = value.strip()
    
    # Truncate if needed
    if max_length and len(value) > max_length:
        value = value[:max_length]
    
    return value

def validate_stats_query_params(params):
    """
    Validate query parameters for stats endpoint
    
    Args:
        params: Query parameters dictionary
        
    Returns:
        (is_valid, error_message, cleaned_params)
    """
    errors = []
    cleaned = {}
    
    # Period validation
    if 'period' in params:
        valid_periods = ['7d', '30d', '90d', 'all']
        if params['period'] not in valid_periods:
            errors.append(f"Invalid period (must be one of: {', '.join(valid_periods)})")
        else:
            cleaned['period'] = params['period']
    else:
        cleaned['period'] = '30d'  # Default
    
    # Group by validation
    if 'group_by' in params:
        valid_groups = ['day', 'week', 'month']
        if params['group_by'] not in valid_groups:
            errors.append(f"Invalid group_by (must be one of: {', '.join(valid_groups)})")
        else:
            cleaned['group_by'] = params['group_by']
    else:
        cleaned['group_by'] = 'day'  # Default
    
    if errors:
        return False, "; ".join(errors), None
    
    return True, None, cleaned

