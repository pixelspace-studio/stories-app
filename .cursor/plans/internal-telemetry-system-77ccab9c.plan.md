<!-- 77ccab9c-350b-4d8f-8dbb-e38f40831c7f a2c95d97-8f16-4949-8116-b678a6719f00 -->
# Internal Telemetry System Implementation Plan

## Overview

Create a self-hosted analytics system to track anonymous user behavior, usage patterns, business metrics, and crash reports while maintaining GDPR compliance. Backend will be in `analytics/` subdirectory of the same repo.

**Unified System:** Combines telemetry (usage analytics) + crash reporting in a single backend infrastructure for efficiency and cost optimization.

---

## Implementation Roadmap

### Phase 1: Documentation & Planning ✅ (Current Phase)

**Goal:** Complete technical specifications and privacy documentation

**Duration:** 1 hour

**Deliverables:**

- [x] `docs/TELEMETRY_SPEC.md` - Complete technical specification
- [x] `docs/PRIVACY_TELEMETRY.md` - User-facing privacy policy
- [x] Database schema design (events, crashes, user_stats)
- [x] API endpoint specifications
- [x] GDPR compliance checklist

**Success Criteria:**

- All documentation in English
- Clear data collection boundaries defined
- Cost analysis complete ($0-14/month)
- No conflicts with existing backend identified

---

### Phase 2: Backend Infrastructure 🔵 (Next)

**Goal:** Create analytics backend API on Render

**Duration:** 2-3 hours

**Deliverables:**

- [ ] `analytics/` directory structure
- [ ] `analytics/app.py` - Flask API with endpoints
- [ ] `analytics/database.py` - PostgreSQL connection
- [ ] `analytics/models.py` - Data validation
- [ ] `analytics/requirements.txt` - Dependencies
- [ ] `analytics/render.yaml` - Deployment config
- [ ] `analytics/migrations/001_initial_schema.sql` - DB setup

**API Endpoints:**

- `POST /track` - Receive telemetry events
- `POST /crash` - Receive crash reports
- `GET /stats` - Get aggregated statistics
- `GET /health` - Health check

**Success Criteria:**

- All endpoints return 200 OK
- PostgreSQL connection successful
- CORS configured for Stories app
- Environment variables documented

---

### Phase 3: Frontend Telemetry Client 🔵

**Goal:** Create client-side telemetry tracking

**Duration:** 1-2 hours

**Deliverables:**

- [ ] `frontend/components/TelemetryClient.js`
- [ ] UUID generation and persistence
- [ ] Event batching mechanism
- [ ] Crash detection and reporting
- [ ] Country detection from timezone
- [ ] Cost estimation calculator

**Events to Track:**

- `app_opened`
- `recording_started`
- `recording_completed`
- `transcription_completed`
- `transcription_failed`
- `feature_toggled`
- `retry_attempted`

**Success Criteria:**

- Events sent successfully to backend
- Batching works (sends every 30s or 10 events)
- Fails silently (no user interruption)
- Respects opt-out setting
- Crash reports always sent (even if telemetry off)

---

### Phase 4: UI Integration 🔵

**Goal:** Add telemetry settings and privacy notices

**Duration:** 1 hour

**Deliverables:**

- [ ] Settings toggle: "Share Anonymous Usage Data"
- [ ] Privacy notice text
- [ ] "Learn more" link/modal
- [ ] Backend config: `telemetry_enabled` setting
- [ ] Default: ON with first-run notice

**UI Location:**

- Settings panel (below API Key section)
- First-run modal (optional, can be added later)

**Success Criteria:**

- Toggle persists in config.json
- Clear privacy explanation visible
- Opt-out immediately stops event sending
- Crash reports continue even if opted-out

---

### Phase 5: Local Testing 🔵

**Goal:** Test complete flow end-to-end

**Duration:** 1 hour

**Deliverables:**

- [ ] Test event tracking locally
- [ ] Test opt-out flow
- [ ] Test crash reporting
- [ ] Verify no data leaks (transcriptions, API keys)
- [ ] Test with/without internet connection

**Test Scenarios:**

1. Fresh install → UUID generated → events sent
2. Toggle OFF → events stop → crash reports continue
3. Record audio → events tracked with correct properties
4. Simulate crash → crash report sent with stack trace
5. Offline mode → events queued → sent when online

**Success Criteria:**

- All events reach backend
- No PII in event data
- No UX interruption on failure
- Opt-out works immediately

---

### Phase 6: Render Deployment 🔵

**Goal:** Deploy analytics backend to production

**Duration:** 30 minutes

**Deliverables:**

- [ ] Create Render account (if needed)
- [ ] Create PostgreSQL database on Render
- [ ] Deploy Flask API to Render
- [ ] Run database migrations
- [ ] Configure environment variables
- [ ] Test production endpoints

**Render Setup:**

1. Connect GitHub repo to Render
2. Create PostgreSQL database (Free tier: 1GB)
3. Create Web Service (Free tier with sleep)
4. Point to `./analytics` subdirectory
5. Add `DATABASE_URL` environment variable
6. Deploy

**Success Criteria:**

- API accessible via HTTPS
- PostgreSQL connected and migrations run
- Health check returns 200 OK
- Can receive events from Stories app

---

### Phase 7: Dashboard & Monitoring 🔵

**Goal:** Create simple analytics dashboard

**Duration:** 1-2 hours

**Deliverables:**

- [ ] `analytics/static/dashboard.html`
- [ ] Basic authentication for dashboard
- [ ] Key metrics visualization:
        - Total users, active users (7d, 30d)
        - Total recordings, total minutes
        - Success rate, error rate
        - Crashes per day, crash-free rate
        - Cost estimates (total, per user)
        - Users by country (top 10)

**Dashboard Access:**

- URL: `https://stories-analytics.onrender.com/dashboard`
- Auth: Basic HTTP auth (username/password)
- Simple HTML + Chart.js (no framework)

**Success Criteria:**

- Dashboard loads and shows data
- Metrics update in real-time
- Mobile-responsive design
- Password protected

---

### Phase 8: Production Integration & Testing 🔵

**Goal:** Integrate with Stories app and monitor

**Duration:** 30 minutes

**Deliverables:**

- [ ] Update `frontend/app.js` to use TelemetryClient
- [ ] Add tracking calls to key events
- [ ] Test with production build
- [ ] Monitor first 24 hours of data
- [ ] Verify GDPR compliance

**Integration Points:**

```javascript
// In app.js
import TelemetryClient from './components/TelemetryClient.js';
const telemetry = new TelemetryClient();

// Track events
telemetry.track('app_opened');
telemetry.track('recording_completed', {
  audio_duration_seconds: 120,
  processing_time_seconds: 5.2,
  source: 'main_window',
  success: true,
  estimated_cost_usd: 0.012
});
```

**Success Criteria:**

- Events visible in dashboard within 1 minute
- No performance impact on app
- No crashes or errors
- Opt-out tested and working

---

### Phase 9: Documentation & Handoff ✅

**Goal:** Complete documentation for maintenance

**Duration:** 30 minutes

**Deliverables:**

- [ ] `analytics/README.md` - Setup and deployment guide
- [ ] API documentation (endpoints, params, responses)
- [ ] Dashboard user guide
- [ ] Troubleshooting guide
- [ ] Data retention policy document

**Success Criteria:**

- Anyone can deploy analytics backend from docs
- Clear instructions for adding new events
- Backup and recovery procedures documented

---

## Current Status: Phase 1-6 ✅ COMPLETE

✅ **Telemetry system fully deployed and functional:**
- Backend running on Render: https://stories-app-e9ya.onrender.com
- PostgreSQL database storing events (events, crashes, user_stats tables)
- Frontend tracking all events successfully (app_opened, recording, transcription)
- UUID-based anonymous user identification (localStorage)
- Opt-out toggle working in Settings
- Events batching and sending to production (30s or 10 events)
- Tested end-to-end successfully with real data
- CSP configured for localhost and Render
- Python 3.11 runtime for psycopg2 compatibility

**Next Steps:** Phase 7 (Analytics Dashboard) and Phase 8 (Production Integration)

---

## 1. Create Technical Specification Document

**File:** `docs/TELEMETRY_SPEC.md`

### Document Contents:

#### Architecture Overview

- Stories App (Electron) sends events via HTTPS
- Render Backend (Python Flask) receives and processes events
- Backend lives in `analytics/` subdirectory of same repo
- PostgreSQL (Render) stores event data
- Simple HTML/JS Dashboard for visualization

#### Dependencies Required

**Backend (create `analytics/requirements.txt`):**

```python
Flask==3.0.0
Flask-CORS==4.0.0
psycopg2-binary==2.9.9  # PostgreSQL driver
python-dateutil==2.8.2  # Date handling
gunicorn==21.2.0        # Production server for Render
```

**Frontend (add to `package.json`):**

```json
{
  "dependencies": {
    "uuid": "^9.0.1"  // For anonymous user ID generation
  }
}
```

**Note:** No conflicts with existing dependencies. The `analytics/` backend is completely independent from the `backend/` local server.

**Render Infrastructure:**

- Web Service (Flask API): Free tier or $7/month
- PostgreSQL Database: Free tier (1GB) or $7/month
- Total: $0-14/month

#### Data Collection (GDPR Compliant)

**What We Track (Anonymous):**

1. User Metrics:

      - Anonymous UUID (generated locally, never changes)
      - First seen date
      - Last active date
      - App version
      - Platform (macOS version)
      - Country (ISO code from timezone, e.g. "US", "MX", "ES")

2. Recording Metrics:

      - Recording completed count
      - Audio duration (seconds) - Length of recorded audio
      - Transcription processing time (seconds) - How long API takes to respond
      - Source (widget/main_window)
      - Success/failure status
      - Estimated OpenAI cost per transcription

3. Feature Usage:

      - Auto-paste enabled/disabled
      - Widget vs main window usage percentage
      - Dictionary usage count
      - Retry attempts count

4. Performance Metrics:

      - App startup time
      - Average transcription processing time
      - Error rate percentage

**What We NEVER Track (GDPR):**

- Transcription text content
- API keys
- User names or emails
- IP addresses (not stored)
- Device identifiers
- Exact location (only country)

#### Database Schema

```sql
-- events table (telemetry)
CREATE TABLE events (
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

CREATE INDEX idx_user_id ON events(user_id);
CREATE INDEX idx_event ON events(event);
CREATE INDEX idx_timestamp ON events(timestamp);
CREATE INDEX idx_app_version ON events(app_version);
CREATE INDEX idx_country ON events(country);

-- crashes table (crash reporting) ✨NEW
CREATE TABLE crashes (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    app_version VARCHAR(20) NOT NULL,
    os_version VARCHAR(50),
    crash_type VARCHAR(50) NOT NULL,    -- 'main_crash', 'renderer_crash', 'uncaught_error'
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    context JSONB,                       -- Additional context (memory, last actions, etc.)
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_crashes_user_id ON crashes(user_id);
CREATE INDEX idx_crashes_timestamp ON crashes(timestamp);
CREATE INDEX idx_crashes_app_version ON crashes(app_version);
CREATE INDEX idx_crashes_type ON crashes(crash_type);

-- user_stats table (aggregated daily)
CREATE TABLE user_stats (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    total_users INTEGER,
    active_users INTEGER,
    new_users INTEGER,
    total_recordings INTEGER,
    total_minutes DECIMAL,
    total_cost_usd DECIMAL,
    crash_count INTEGER,                 -- ✨NEW: Daily crash count
    crash_rate DECIMAL,                  -- ✨NEW: Crashes per active user
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### Events to Track

**Core Events:**

1. `app_opened` - User launches app
2. `recording_started` - Recording begins
3. `recording_completed` - Recording finished successfully
4. `transcription_completed` - Transcription finished
5. `transcription_failed` - Transcription error
6. `feature_toggled` - User enables/disables feature (auto-paste only)
7. `retry_attempted` - User retries failed transcription

**Properties for each event (JSON):**

```javascript
{
  audio_duration_seconds: number,           // Length of audio recorded
  processing_time_seconds: number,          // API response time
  source: "widget" | "main_window",
  success: boolean,
  error_type: string,
  feature: string,                          // "auto_paste" only
  enabled: boolean,
  estimated_cost_usd: number               // OpenAI cost estimation
}
```

**OpenAI Cost Estimation:**

- Based on audio duration
- Whisper pricing: $0.006 per minute
- Example: 5 min audio = $0.03

#### Business Metrics Dashboard

**Key Metrics to Display:**

1. User Growth:

      - Total users (all time)
      - Active users (7 days, 30 days)
      - New users this week/month
      - User retention rate (7-day, 30-day)
      - Users by country (top 10)

2. Usage Metrics:

      - Total recordings
      - Total hours transcribed
      - Average recordings per user
      - Average session duration
      - Daily/weekly active users trend

3. Feature Adoption:

      - Auto-paste adoption rate
      - Widget vs main window usage split
      - Dictionary usage rate
      - Retry feature usage

4. Performance & Quality:

      - Success rate percentage
      - Average transcription processing time
      - Error rate by type
      - App startup time average

5. Stability & Crashes: ✨NEW

                                                                                                                                                                                                                                                                                                                                                                                                - **Crash-free rate (%)** - % of users with no crashes
                                                                                                                                                                                                                                                                                                                                                                                                - **Crashes per day/week/month**
                                                                                                                                                                                                                                                                                                                                                                                                - **Crash rate** - crashes per active user
                                                                                                                                                                                                                                                                                                                                                                                                - **Top crash types** - most common errors
                                                                                                                                                                                                                                                                                                                                                                                                - **Crashes by app version** - identify problematic releases
                                                                                                                                                                                                                                                                                                                                                                                                - **Crashes by OS version** - platform-specific issues
                                                                                                                                                                                                                                                                                                                                                                                                - **Time to first crash** - stability after install

6. Business Intelligence:

      - **Total estimated OpenAI costs (all users, weekly, monthly)**
      - **Average cost per user per month**
      - User growth rate (week over week)
      - User engagement score (recordings/user/week)
      - Feature stickiness (% users who use feature weekly)
      - Churn indicators (users not seen in 30 days)

#### GDPR Compliance Checklist

**Requirements Met:**

- [x] Anonymous data only (no PII)
- [x] User-generated UUID (not device ID)
- [x] No transcription content stored
- [x] No API keys or credentials logged
- [x] Opt-out available in Settings
- [x] Clear privacy notice in Settings
- [x] Data retention policy (365 days)
- [x] User can request data deletion
- [x] Country from timezone (not GPS/IP)

**Settings UI Text:**

```
"Share Anonymous Usage Data"
Help improve Stories by sharing anonymous usage statistics.
We never collect your transcriptions, API keys, or personal information.
[Learn more about privacy]
```

#### Implementation Components

**Backend API (`analytics/` subdirectory):**

- `app.py` - Flask API with /track, /crash, and /stats endpoints
- `database.py` - PostgreSQL connection and queries
- `models.py` - Event and crash schema validation
- `aggregator.py` - Daily stats calculation (cron job)
- `dashboard.html` - Unified analytics + crash dashboard
- `render.yaml` - Render deployment config
- `requirements.txt` - Python dependencies
- `.env.example` - Environment variables template

**Frontend Client (`frontend/components/TelemetryClient.js`):**

- Generate/retrieve anonymous UUID
- Track events with properties
- Report crashes with stack traces (always-on, even if telemetry is off)
- Respect opt-out setting (for usage telemetry only)
- Fail silently (no UX interruption)
- Batch events for efficiency
- Detect country from timezone
- Calculate estimated OpenAI cost
- Catch uncaught exceptions and report automatically

**Settings Integration:**

- Toggle: "Share Anonymous Usage Data"
- Default: ON (with clear notice)
- Persists in backend config
- Privacy link/modal

**Important: No Conflicts**

- `analytics/` is completely independent from `backend/`
- Different Flask apps (different ports)
- Different requirements.txt files
- `analytics/` ONLY runs on Render (not locally)
- No shared code or dependencies
- Frontend only imports TelemetryClient.js (new file)

#### Deployment Steps

1. Push `analytics/` subdirectory to GitHub (same repo)
2. Connect GitHub repo to Render
3. Create PostgreSQL database on Render
4. Configure Render to deploy from `./analytics` subdirectory
5. Deploy Flask API (automatic from GitHub)
6. Run database migrations
7. Test API endpoints
8. Integrate TelemetryClient in Stories app
9. Test opt-out flow
10. Access dashboard at Render URL

**Render Configuration (`analytics/render.yaml`):**

```yaml
services:
 - type: web
    name: stories-analytics
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn app:app
    rootDir: ./analytics
```

#### Cost Analysis

**Render Free Tier (0-100 users):**

- Web Service: $0/month (sleeps after 15min inactivity)
- PostgreSQL: $0/month (1GB storage)
- Total: $0/month

**Render Paid (100+ users):**

- Web Service: $7/month (always active)
- PostgreSQL: $7/month (10GB storage)
- Total: $14/month

**Development Time:**

- Backend setup: 2-3 hours
- Frontend integration: 1-2 hours
- Dashboard: 1-2 hours
- Testing & deployment: 1 hour
- Total: 5-8 hours

#### Future Enhancements (Optional)

1. Metabase integration for advanced analytics
2. Email reports (weekly summary)
3. Alerts (error rate > 10%)
4. Cohort analysis
5. Funnel visualization
6. Export to CSV

## 2. Backend Structure (Same Repo)

**Create `analytics/` subdirectory in current repo**

```
stories-app/
├── backend/          # Existing local backend (Flask on 127.0.0.1:5001)
├── analytics/        # NEW: Analytics backend (Flask on Render)
│   ├── app.py
│   ├── database.py
│   ├── models.py
│   ├── config.py
│   ├── aggregator.py
│   ├── requirements.txt    # Independent from backend/
│   ├── render.yaml
│   ├── .env.example
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   ├── static/
│   │   └── dashboard.html
│   └── README.md
├── frontend/
│   └── components/
│       └── TelemetryClient.js  # NEW
├── electron/
└── docs/
```

**No Conflicts:**

- `backend/` runs locally (port 5001)
- `analytics/` runs on Render (port 80/443)
- Separate requirements.txt
- Separate Flask apps
- No shared modules

## 3. Privacy Policy Section

**Create `docs/PRIVACY_TELEMETRY.md`:**

- What data is collected (including country from timezone)
- How it's used
- How to opt-out
- Data retention policy
- Contact for data deletion requests

## Files to Create/Modify

### Create:

1. `docs/TELEMETRY_SPEC.md` - Complete technical specification
2. `docs/PRIVACY_TELEMETRY.md` - Privacy policy for telemetry
3. `analytics/` directory with all backend files (same repo)

### Modify (when implementation starts):

1. `package.json` - Add uuid dependency
2. `frontend/components/` - Add TelemetryClient.js
3. `electron/index.html` - Add telemetry toggle in Settings
4. `backend/config_manager.py` - Add telemetry_enabled config
5. `frontend/app.js` - Track events (app_opened, recording_completed, etc.)

## Success Criteria

- Comprehensive technical documentation in English
- GDPR compliance verified
- All dependencies identified
- Business metrics defined (including total cost and country)
- Zero PII collection
- Opt-out mechanism specified
- Cost analysis complete ($0-14/month)
- Backend in same repo under `analytics/` subdirectory
- No conflicts with existing backend
- Clear terminology: audio duration vs processing time
- Crash reporting integrated with telemetry system
- Unified dashboard for usage metrics and crash reports

### To-dos

- [ ] Create TELEMETRY_SPEC.md with complete technical specification
- [ ] Create PRIVACY_TELEMETRY.md for user-facing privacy policy
- [ ] Document all required dependencies (psycopg2, uuid, gunicorn)
- [ ] Define comprehensive business metrics beyond basic tracking
- [ ] Ensure GDPR compliance checklist is complete
- [ ] Add crash reporting endpoints and database schema
- [ ] Define crash reporting privacy policy (always-on vs opt-out)