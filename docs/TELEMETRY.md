# Telemetry System - Stories App

**Last Updated:** November 4, 2025  
**Status:** ✅ Active (v0.9.7+)

---

## 📊 Overview

Stories includes a **self-hosted, privacy-first telemetry system** to understand how users interact with the app and identify opportunities for improvement.

### Why Telemetry?

- **Improve Product:** Understand which features users love and which need work
- **Monitor Stability:** Track crash rates and error patterns
- **Estimate Costs:** Monitor OpenAI API usage for financial planning
- **Prioritize Features:** Data-driven decisions on what to build next

### Key Principles

1. ✅ **Privacy First** - Zero PII, no transcriptions, no API keys
2. ✅ **Anonymous** - UUID-based identification only
3. ✅ **Opt-out Available** - Usage telemetry can be disabled
4. ✅ **Crash Reports Always On** - Critical for stability (cannot opt-out)
5. ✅ **Fail Silently** - Never interrupts user experience
6. ✅ **Self-Hosted** - Full control over data (Render.com + PostgreSQL)

---

## 📦 What Data We Capture

### ✅ **Usage Events (Opt-out Available)**

Users can disable this in Settings → "Share Anonymous Usage Data"

**Events tracked:**

| Event | Data Captured | Example |
|-------|---------------|---------|
| `app_opened` | App version, OS version, language | `v0.9.7, macOS 14.1, en` |
| `recording_started` | Source (main/widget), duration | `widget, 45s` |
| `transcription_completed` | Duration, success/failure | `2.3s, success` |
| `transcription_failed` | Error type (no details) | `network_timeout` |
| `feature_used` | Feature name | `auto_paste`, `custom_dictionary` |
| `settings_changed` | Setting key (no value) | `auto_paste_enabled` |

**What we DON'T capture:**
- ❌ Transcription text content
- ❌ Audio files
- ❌ API keys
- ❌ User names, emails, or any PII
- ❌ File paths or system information beyond OS version

---

### 🔴 **Crash Reports (Always On)**

Cannot be disabled - critical for app stability.

**Data captured on crash:**

| Field | Description | Example |
|-------|-------------|---------|
| `error_message` | Error type | `TypeError: Cannot read property...` |
| `stack_trace` | Code location | `at processRecording (app.js:234)` |
| `app_version` | Version number | `v0.9.7` |
| `os_version` | macOS version | `macOS 14.1` |
| `timestamp` | When it happened | `2025-11-04T10:30:15Z` |
| `user_id` | Anonymous UUID | `a1b2c3d4-...` |

**Scrubbed data:**
- File paths sanitized (no usernames)
- API keys removed
- No transcription content

---

## 🏗️ How It Works

### Architecture

```
┌─────────────────┐
│  Stories App    │
│  (Electron)     │
│                 │
│  TelemetryClient│
└────────┬────────┘
         │ HTTPS
         ↓
┌─────────────────┐
│ Analytics API   │
│ (Flask/Python)  │
│ Render.com      │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  PostgreSQL DB  │
│  (Events/Crashes│
└─────────────────┘
         │
         ↓
┌─────────────────┐
│   Dashboard     │
│   (HTML/JS)     │
└─────────────────┘
```

### Data Flow

1. **User Action** → App sends event to `TelemetryClient.js`
2. **Client Batches** → Events batched (10 events or 30 seconds)
3. **Send to API** → HTTPS POST to `https://stories-analytics.onrender.com/api/events/batch`
4. **Store in DB** → PostgreSQL stores events with timestamps
5. **View Dashboard** → Aggregated stats viewable at `/dashboard`

### Opt-out Mechanism

Users can toggle "Share Anonymous Usage Data" in Settings:
- **ON** (default): Usage events sent
- **OFF**: Only crash reports sent (critical for stability)

---

## 📁 System Files

### Frontend (Stories App)

**`frontend/components/TelemetryClient.js`**
- Main telemetry client
- Batches events before sending
- Handles opt-out logic
- Fails silently on errors

**Key functions:**
```javascript
TelemetryClient.trackEvent(eventType, properties)
TelemetryClient.trackCrash(error, context)
TelemetryClient.init(userId, telemetryEnabled)
```

**Usage in app:**
```javascript
// Track feature usage
TelemetryClient.trackEvent('feature_used', {
  feature: 'auto_paste'
});

// Track recording
TelemetryClient.trackEvent('recording_started', {
  source: 'widget',
  duration: 45
});
```

---

### Backend (Analytics API)

Located in `/analytics/` directory:

**`analytics/app.py`**
- Flask API server
- Endpoints for events, crashes, stats
- Basic authentication for dashboard
- CORS enabled for Stories app

**Key endpoints:**
```
POST   /api/events/batch              # Batch insert events
POST   /api/crashes                   # Report crash
GET    /api/stats?period=30d          # Aggregated stats (7d, 30d, 90d)
GET    /api/events?days=30&page=1     # Paginated events (NEW in v0.9.7)
GET    /dashboard                     # View dashboard (auth required)
```

**`analytics/database.py`**
- PostgreSQL connection management
- Query functions (insert, aggregate, cleanup)
- Automatic 365-day data retention

**`analytics/models.py`**
- Data validation schemas
- Input sanitization
- Privacy checks (no PII in events)

**`analytics/migrations/001_initial_schema.sql`**
- Database schema
- Tables: `events`, `crashes`, `user_stats`
- Basic indexes for performance

**`analytics/migrations/002_add_composite_indexes.sql`** *(NEW in v0.9.7)*
- Composite indexes for pagination queries
- `idx_events_type_timestamp` - 10-100x faster for filtered queries
- `idx_events_user_timestamp` - User-specific history
- `idx_crashes_type_timestamp` - Crash filtering

---

### Configuration

**`analytics/env.example`**
Template for environment variables:
```bash
DATABASE_URL=postgresql://...
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=change-this
SECRET_KEY=change-this-secret
CORS_ORIGINS=*
```

**`analytics/render.yaml`**
Deployment configuration for Render.com:
- Web service (Flask API)
- PostgreSQL database
- Auto-deploy from main branch

---

## 🔒 Privacy & Compliance

### GDPR Compliance

- ✅ **Data Minimization**: Only essential anonymous data
- ✅ **Purpose Limitation**: Data used only for app improvement
- ✅ **Storage Limitation**: 365-day automatic deletion
- ✅ **Transparency**: Clear disclosure in Settings
- ✅ **User Control**: Opt-out available
- ✅ **Security**: HTTPS only, encrypted at rest

### Anonymous User ID

- Generated on first launch: `crypto.randomUUID()`
- Stored locally: `~/Library/Application Support/Stories/config.json`
- Cannot be traced back to individual
- Used only for aggregation (e.g., "user X recorded 5 times today")

### Data Retention

- **Events**: 365 days, then auto-deleted
- **Crashes**: 365 days, then auto-deleted
- **Aggregated Stats**: Kept indefinitely (no PII)

### User Rights

Users can:
- Disable usage telemetry (Settings → toggle OFF)
- Request data deletion (contact support)
- View what data is collected (this document)

---

## 👨‍💻 For Developers

### Adding New Events

1. **Choose event name** (use snake_case):
   ```javascript
   'recording_started'
   'transcription_completed'
   'feature_used'
   ```

2. **Track in app code:**
   ```javascript
   TelemetryClient.trackEvent('new_event_name', {
     property1: 'value1',
     property2: 123
   });
   ```

3. **Verify no PII:**
   - ❌ No transcription text
   - ❌ No file paths with usernames
   - ❌ No API keys
   - ✅ Only anonymous metrics

### Testing Locally

1. **Run analytics backend locally:**
   ```bash
   cd analytics
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   
   # Set DATABASE_URL to local PostgreSQL
   export DATABASE_URL="postgresql://localhost/stories_analytics"
   
   python app.py
   ```

2. **Point app to local backend:**
   ```javascript
   // In TelemetryClient.js
   const API_URL = 'http://localhost:5000';
   ```

3. **Test event sending:**
   - Open Stories app
   - Perform actions (record, transcribe, change settings)
   - Check backend logs for received events
   - Query database: `SELECT * FROM events ORDER BY created_at DESC LIMIT 10;`

### Viewing Dashboard

**Production:**
```
https://stories-analytics.onrender.com/dashboard
Username: admin
Password: (from env vars)
```

**Local:**
```
http://localhost:5000/dashboard
Username: admin  
Password: admin
```

**Dashboard Features (v0.9.7):**
- 📊 Summary cards: Total Users, Active Users (7d), Success Rate, Estimated Cost
- 📈 Timeline chart: Events over time (7d/30d selector)
- 🥧 Events by type: Pie chart of event distribution
- 📋 **Recent Recordings**: Paginated table with date filters (7d/30d/90d)
  - 20 results per page
  - Filter by user
  - Shows: Date, User ID, Duration, Cost, Platform
- ❌ **Recent Errors**: Paginated table with date filters
  - 20 results per page
  - Shows: Date, User ID, Error Type, Message, Platform

### Database Management

**🗑️ Clear All Data (Development Only)**

If you need to clear all telemetry data but keep the database structure:

**Option 1: Using TablePlus (Recommended - Visual)**

1. **Connect to database:**
   - Open TablePlus
   - Create new PostgreSQL connection
   - Use `DATABASE_URL` from Render.com
   - Or enter credentials manually

2. **View current data:**
   ```sql
   SELECT 'events' as table_name, COUNT(*) as records FROM events
   UNION ALL
   SELECT 'crashes', COUNT(*) FROM crashes
   UNION ALL  
   SELECT 'user_stats', COUNT(*) FROM user_stats;
   ```

3. **Clear all data (keeps structure):**
   ```sql
   DELETE FROM events;
   DELETE FROM crashes;
   DELETE FROM user_stats;
   ```

4. **Verify cleanup:**
   ```sql
   SELECT 'events' as table_name, COUNT(*) as records FROM events
   UNION ALL
   SELECT 'crashes', COUNT(*) FROM crashes
   UNION ALL
   SELECT 'user_stats', COUNT(*) FROM user_stats;
   ```
   Should show 0 records for all tables.

**Option 2: Using psql CLI**

```bash
# Using the provided script
cd analytics
psql $DATABASE_URL -f scripts/clear_data.sql
```

**Option 3: Using Render Dashboard**

1. Go to https://dashboard.render.com
2. Open your PostgreSQL database
3. Click "Shell" or "Console" tab
4. Run the SQL commands from Option 1

**⚠️ WARNING:** This deletes ALL telemetry data. Only use in development!

---

**🔄 Full Reset (Drop & Recreate Everything)**

If you need to completely reset the database structure:

```sql
-- Drop all tables
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS crashes CASCADE;
DROP TABLE IF EXISTS user_stats CASCADE;

-- Drop views
DROP VIEW IF EXISTS active_users_7d CASCADE;
DROP VIEW IF EXISTS active_users_30d CASCADE;
DROP VIEW IF EXISTS total_users CASCADE;
DROP VIEW IF EXISTS success_rate_30d CASCADE;

-- Re-run migrations
\i migrations/001_initial_schema.sql
\i migrations/002_add_composite_indexes.sql
```

Or use the automated script:
```bash
cd analytics
bash scripts/setup_fresh_database.sh
```

---

### Database Queries

**Most used features:**
```sql
SELECT 
  properties->>'feature' as feature,
  COUNT(*) as usage_count
FROM events
WHERE event_type = 'feature_used'
GROUP BY feature
ORDER BY usage_count DESC;
```

**Daily active users:**
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(DISTINCT user_id) as active_users
FROM events
WHERE event_type = 'app_opened'
GROUP BY date
ORDER BY date DESC;
```

**Crash-free rate:**
```sql
SELECT 
  (1 - (crashes::float / total_events)) * 100 as crash_free_rate
FROM (
  SELECT 
    COUNT(*) FILTER (WHERE event_type = 'app_crashed') as crashes,
    COUNT(*) as total_events
  FROM events
  WHERE created_at > NOW() - INTERVAL '30 days'
) stats;
```

---

## 🚀 Deployment

**Backend hosted on:** [Render.com](https://render.com)  
**Database:** PostgreSQL 15 (Render managed)  
**Cost:** $0-14/month (free tier + minimal usage)

### Deployment Process

1. **Push to main branch:**
   ```bash
   git push origin main
   ```

2. **Render auto-deploys:**
   - Detects changes to `/analytics/`
   - Builds Flask app
   - Runs migrations
   - Restarts service

3. **Verify deployment:**
   ```bash
   curl https://stories-analytics.onrender.com/health
   # Expected: {"status": "healthy"}
   ```

### Monitoring

- **Uptime:** Render dashboard shows service status
- **Logs:** `render logs` command or dashboard
- **Database:** Check connection count, query performance

---

## 📈 Metrics We Track

### Product Metrics

- **Daily/Monthly Active Users (DAU/MAU)**
- **Recording frequency** (recordings per user per day)
- **Feature adoption** (% users using auto-paste, dictionary, etc.)
- **Retention** (users returning after 1 day, 7 days, 30 days)
- **Widget vs Main Window** usage ratio

### Performance Metrics

- **Transcription success rate** (%)
- **Average transcription time** (seconds)
- **Error types and frequency**
- **App startup time** (future)

### Business Metrics

- **OpenAI API usage** (estimated costs)
- **Recording duration distribution** (short vs long)
- **Platform distribution** (macOS versions, Intel vs M1)

### Stability Metrics

- **Crash-free rate** (%)
- **Crashes per day**
- **Most common error types**
- **Crashes by app version**

---

## 🛠️ Troubleshooting

### Events Not Showing in Dashboard

1. **Check telemetry enabled:**
   - Settings → "Share Anonymous Usage Data" = ON

2. **Check network:**
   ```bash
   curl -X POST https://stories-analytics.onrender.com/api/events/batch \
     -H "Content-Type: application/json" \
     -d '{"user_id":"test","events":[{"event_type":"test","timestamp":"2025-11-04T10:00:00Z"}]}'
   ```

3. **Check app logs:**
   ```bash
   tail -f ~/Library/Application\ Support/Stories/main.log | grep -i telemetry
   ```

4. **Check backend logs:**
   - Render dashboard → Stories Analytics → Logs

### Crashes Not Reported

- Crashes always send (cannot opt-out)
- Check if app is actually crashing or just showing errors
- Verify crash handler in `electron/main.js`

### Dashboard Not Loading

- **401 Unauthorized:** Check username/password
- **502 Bad Gateway:** Backend might be asleep (Render free tier)
  - Visit `/health` endpoint to wake it up
  - Wait 30-60 seconds for cold start

---

## 📝 Changelog

### v0.9.7 (November 2025)
- ✅ **Dashboard pagination** - 20 results per page for Recordings & Errors
- ✅ **Date filters** - Last 7/30/90 days (no "All" to prevent performance issues)
- ✅ **Performance optimization** - Composite indexes for 10-100x faster queries
- ✅ **User filter** - Filter recordings by specific user
- ✅ **Pagination metadata** - Shows "1-20 of 87 results", page numbers
- ✅ **Migration system** - `002_add_composite_indexes.sql`

### v0.9.6 (October 2025)
- ✅ Initial telemetry system implementation
- ✅ Anonymous usage events
- ✅ Crash reporting
- ✅ Opt-out mechanism in Settings
- ✅ Self-hosted on Render.com
- ✅ Basic dashboard

### Future Improvements
- 🔍 Better error grouping
- 📧 Alert notifications for critical crashes
- 📈 Real-time metrics
- 🎯 Funnel analysis
- 🔐 User authentication for dashboard (beyond basic auth)

---

## 🤝 Contributing

When adding telemetry events:

1. **Ask: "Is this essential?"** - Only track what helps improve the product
2. **Privacy check** - Ensure no PII in event properties
3. **Document it** - Update this file with new events
4. **Test locally** - Verify events appear in dashboard
5. **Monitor production** - Check dashboard after deployment

---

## 📞 Support

**Questions?** Contact: [support email]  
**Issues?** GitHub Issues: [repo link]  
**Privacy concerns?** Email: [privacy email]

---

*This telemetry system helps us make Stories better for everyone while respecting your privacy. Thank you for helping improve the app! 🙏*

