#!/usr/bin/env python3
"""
Script to check what's actually stored in the database for transcription_completed events
"""
import os
import sys
import json
from database import get_db_connection
from psycopg2.extras import RealDictCursor

def check_recent_events():
    """Check the last 10 transcription_completed events"""
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT 
                        id,
                        user_id,
                        event,
                        timestamp,
                        properties,
                        properties->>'cost_usd' as cost_usd,
                        properties->>'estimated_cost_usd' as estimated_cost_usd,
                        properties->>'duration_seconds' as duration_seconds
                    FROM events 
                    WHERE event = 'transcription_completed'
                    ORDER BY timestamp DESC
                    LIMIT 10
                """)
                rows = cur.fetchall()
                
                print("=" * 80)
                print(f"Found {len(rows)} recent transcription_completed events")
                print("=" * 80)
                
                for i, row in enumerate(rows, 1):
                    print(f"\n--- Event {i} ---")
                    print(f"ID: {row['id']}")
                    print(f"User: {row['user_id'][:8]}...")
                    print(f"Timestamp: {row['timestamp']}")
                    print(f"Properties type: {type(row['properties'])}")
                    print(f"Properties value: {row['properties']}")
                    print(f"cost_usd (direct): {row['cost_usd']}")
                    print(f"estimated_cost_usd (direct): {row['estimated_cost_usd']}")
                    print(f"duration_seconds: {row['duration_seconds']}")
                    
                    # Try to parse properties if it's a string
                    props = row['properties']
                    if isinstance(props, str):
                        try:
                            props = json.loads(props)
                            print(f"Parsed properties: {json.dumps(props, indent=2)}")
                        except:
                            print("Could not parse properties as JSON")
                    elif isinstance(props, dict):
                        print(f"Properties dict: {json.dumps(props, indent=2)}")
                    
                    print("-" * 80)
                    
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    check_recent_events()

