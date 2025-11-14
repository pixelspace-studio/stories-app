# Stories Analytics Backend

Self-hosted telemetry and crash reporting API for Stories App.

## Overview

- **Framework:** Flask (Python 3.11+)
- **Database:** PostgreSQL 15+
- **Hosting:** Render.com
- **Cost:** $0-14/month

## Features

- ✅ Anonymous telemetry event tracking
- ✅ Crash report collection
- ✅ Aggregated statistics API
- ✅ GDPR compliant (365-day retention)
- ✅ Basic authentication for dashboard
- ✅ CORS enabled for Stories App

## Directory Structure

```
analytics/
├── app.py              # Flask API application
├── database.py         # PostgreSQL connection & queries
├── models.py           # Data validation
├── requirements.txt    # Python dependencies
├── render.yaml         # Render deployment config
├── env.example         # Environment variables template
├── migrations/
│   └── 001_initial_schema.sql
├── static/
│   └── dashboard.html  # (coming in Phase 7)
└── README.md          # This file
```

## Local Development

### Prerequisites

- Python 3.11+
- PostgreSQL 15+ (or Docker)

### Setup

1. **Create virtual environment:**
   ```bash
   cd analytics
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Setup PostgreSQL:**
   
   **Option A: Docker**
   ```bash
   docker run --name stories-analytics-db \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=stories_analytics \
     -p 5432:5432 \
     -d postgres:15
   ```
   
   **Option B: Local PostgreSQL**
   ```bash
   createdb stories_analytics
   ```

4. **Set environment variables:**
   ```bash
   cp env.example .env
   # Edit .env with your database URL
   ```
   
   Example `.env`:
   ```
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/stories_analytics
   DASHBOARD_USERNAME=admin
   DASHBOARD_PASSWORD=admin
   FLASK_ENV=development
   SECRET_KEY=dev-secret-key
   CORS_ORIGINS=*
   ```

5. **Run migrations:**
   ```bash
   psql $DATABASE_URL -f migrations/001_initial_schema.sql
   ```

6. **Start development server:**
   ```bash
   python app.py
   ```
   
   Server will be available at: `http://localhost:5000`

### Testing

**Health check:**
```bash
curl http://localhost:5000/health
```

**Track event:**
```bash
curl -X POST http://localhost:5000/track \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "user_id": "550e8400-e29b-41d4-a716-446655440000",
        "event": "app_opened",
        "timestamp": "2025-10-28T14:30:00Z",
        "app_version": "0.9.51",
        "platform": "darwin-24.6.0",
        "country": "US"
      }
    ]
  }'
```

**Report crash:**
```bash
curl -X POST http://localhost:5000/crash \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "app_version": "0.9.51",
    "os_version": "darwin-24.6.0",
    "crash_type": "uncaught_error",
    "error_message": "TypeError: Cannot read property",
    "stack_trace": "at app.js:123:45",
    "timestamp": "2025-10-28T14:30:00Z"
  }'
```

**Get stats (requires auth):**
```bash
curl http://localhost:5000/stats?period=30d \
  -u admin:admin
```

## 🚀 Deployment

### How Telemetry Works

This is a **standard Flask API** that can run on any server that supports Python and PostgreSQL:

- **Backend:** Flask application (`app.py`)
- **Database:** PostgreSQL (any version 12+)
- **Hosting:** Any platform that supports Python apps (cloud or self-hosted)
- **No vendor lock-in:** Pure Python/Flask, works anywhere

**Architecture:**
```
Stories App (Electron)
    ↓ HTTPS
Flask API (app.py)
    ↓
PostgreSQL Database
    ↓
Dashboard (HTML/JS)
```

**Key components:**
- `app.py` - Main Flask application
- `database.py` - PostgreSQL queries
- `dashboard/` - Static HTML dashboard
- `migrations/` - Database schema

### For Pixelspace (Production)

Currently deployed on Render.com with manual deploy:

1. Push changes to GitHub
2. Manual deploy from hosting dashboard
3. Frequency: ~1-2 times/month (backend is stable)

---

### For Self-Hosting

> **Note:** This analytics backend is **optional**. GitHub Releases of Stories do **NOT** include telemetry by default.

If you want to collect your own usage data, you can deploy this backend to any server.

#### Requirements

- Python 3.8+ 
- PostgreSQL 12+
- Any hosting platform or your own server

#### Option 1: Cloud Platform (Heroku, Render, Railway, etc.)

Most cloud platforms follow a similar pattern:

1. **Create PostgreSQL database**
   - Get connection string (DATABASE_URL)
   - Format: `postgresql://user:password@host:5432/dbname`

2. **Deploy Flask app**
   - Root directory: `./analytics`
   - Python version: 3.8+
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 60`

3. **Set environment variables:**
   ```bash
   DATABASE_URL=postgresql://user:password@host:5432/dbname
   DASHBOARD_USERNAME=admin
   DASHBOARD_PASSWORD=<your-strong-password>
   SECRET_KEY=<random-string-min-32-chars>
   FLASK_ENV=production
   CORS_ORIGINS=*
   ```

4. **Run migrations:**
   - Connect to your database
   - Execute SQL files in `migrations/` folder

5. **Test deployment:**
   ```bash
   curl https://your-app.platform.com/health
   # Should return: {"status":"healthy"}
   ```

**Example: Render.com** (tested and working, free tier available)
- Create PostgreSQL database on Render
- Create Web Service from GitHub repo
- Set environment variables
- Deploy automatically handles migrations
- See `render.yaml` for configuration example

#### Option 2: Your Own Server

```bash
# 1. Clone repo (if not already)
git clone https://github.com/pixelspace-studio/stories-app
cd stories-app/analytics

# 2. Install PostgreSQL
# macOS:
brew install postgresql@15
brew services start postgresql@15

# Ubuntu/Debian:
sudo apt install postgresql postgresql-contrib

# 3. Create database
sudo -u postgres createdb stories_analytics
sudo -u postgres createuser stories_admin
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE stories_analytics TO stories_admin;"

# 4. Set environment variables
export DATABASE_URL="postgresql://stories_admin:password@localhost:5432/stories_analytics"
export DASHBOARD_USERNAME="admin"
export DASHBOARD_PASSWORD="your-password"
export SECRET_KEY="your-secret-key"
export FLASK_ENV="production"
export CORS_ORIGINS="*"

# 5. Install dependencies
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 6. Run migrations
psql $DATABASE_URL -f migrations/001_initial_schema.sql
psql $DATABASE_URL -f migrations/002_add_composite_indexes.sql

# 7. Start server (development)
python app.py

# Or use gunicorn (production)
gunicorn app:app --bind 0.0.0.0:5000 --workers 2 --timeout 60
```

---

### Configuring Stories App to Use Your Backend

To use your own analytics backend:

1. **Copy the telemetry config template:**
   ```bash
   cp telemetry.config.example.js telemetry.config.js
   ```

2. **Edit `telemetry.config.js`:**
   ```javascript
   module.exports = {
     apiUrl: 'https://YOUR-SERVER.com', // Your backend URL
     debug: false  // Set to true for debugging
   };
   ```
   
   **Note:** `telemetry.config.js` is gitignored - your URL stays private.

3. **Build with telemetry enabled:**
   ```bash
   npm run make:internal
   ```
   
   This will:
   - Create the `.telemetry-enabled` flag
   - Copy your config into the build
   - Enable telemetry with YOUR backend URL

4. **Distribute your build**
   - The config is bundled in the app
   - Data goes to YOUR server
   - Users can still opt-out in Settings

5. **Monitor your dashboard:**
   - Visit: `https://YOUR-SERVER.com/dashboard`
   - Login with your credentials

---

### 📊 Viewing Analytics Dashboard

Once deployed, access your dashboard:
- **URL:** `https://your-server.com/dashboard`
- **Login:** Username and password from your environment variables
- **Features:** Real-time metrics, user stats, event logs, crash reports

---

### 🔒 Privacy & Transparency

**Important Notes:**

1. **GitHub Releases have NO telemetry**
   - Downloads from GitHub Releases are completely private
   - No tracking, no data collection
   - Privacy-first by default

2. **Telemetry is opt-in for developers**
   - Only if you build with `npm run make:internal`
   - Only if you configure your own backend
   - Full control over what data you collect

3. **The code is open and auditable**
   - All telemetry logic is in this repository
   - You can see exactly what data is collected
   - You control where data is sent

**What this backend collects (if enabled):**
- ✅ Anonymous UUID (no PII)
- ✅ App version, OS version
- ✅ Usage events (recording started, transcription completed)
- ✅ Crash reports (error messages, stack traces)
- ❌ NO transcription text
- ❌ NO audio files
- ❌ NO API keys
- ❌ NO personal information

See full telemetry details: [docs/TELEMETRY.md](../docs/TELEMETRY.md)

## API Documentation

### Public Endpoints

#### GET /health
Health check endpoint (no auth required).

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "version": "1.0.0",
  "timestamp": "2025-10-28T14:30:00Z"
}
```

#### POST /track
Track telemetry events (no auth required).

**Request:**
```json
{
  "events": [
    {
      "user_id": "uuid-v4",
      "event": "recording_completed",
      "timestamp": "ISO 8601",
      "properties": { ... },
      "app_version": "0.9.51",
      "platform": "darwin-24.6.0",
      "country": "US"
    }
  ]
}
```

**Valid Events:**
- `app_opened`
- `recording_started`
- `recording_completed`
- `transcription_completed`
- `transcription_failed`
- `feature_toggled`
- `retry_attempted`

#### POST /crash
Report application crash (no auth required).

**Request:**
```json
{
  "user_id": "uuid-v4",
  "app_version": "0.9.51",
  "os_version": "darwin-24.6.0",
  "crash_type": "uncaught_error",
  "error_message": "Error message",
  "stack_trace": "Stack trace...",
  "context": { ... },
  "timestamp": "ISO 8601"
}
```

**Valid Crash Types:**
- `main_crash`
- `renderer_crash`
- `uncaught_error`
- `unhandled_rejection`

### Authenticated Endpoints

Require HTTP Basic Auth with `DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD`.

#### GET /stats
Get aggregated statistics.

**Query Parameters:**
- `period`: `7d`, `30d`, `90d`, `all` (default: `30d`)
- `group_by`: `day`, `week`, `month` (default: `day`)

**Response:**
```json
{
  "success": true,
  "period": "30d",
  "summary": {
    "total_users": 1250,
    "active_users_7d": 420,
    "active_users_30d": 850,
    "total_recordings": 15600,
    "total_hours_transcribed": 312.5,
    "total_cost_usd": 112.50,
    "success_rate": 98.2,
    "crash_free_rate": 99.1
  },
  "daily_stats": [ ... ],
  "top_countries": [ ... ]
}
```

#### GET /events
Query events (for debugging).

**Query Parameters:**
- `user_id`: Filter by user ID
- `event_type`: Filter by event type
- `start_date`: ISO 8601 date
- `end_date`: ISO 8601 date
- `limit`: Max results (default: 100, max: 1000)

#### GET /crashes
Query crashes (for debugging).

**Query Parameters:**
- `app_version`: Filter by app version
- `start_date`: ISO 8601 date
- `end_date`: ISO 8601 date
- `limit`: Max results (default: 100, max: 1000)

#### POST /cleanup
Trigger manual data cleanup (deletes data > 365 days old).

## Data Retention

- **Events:** 365 days (automatic cleanup)
- **Crashes:** 365 days (automatic cleanup)
- **Aggregated Stats:** Indefinite (no PII)

To manually trigger cleanup:
```bash
curl -X POST https://stories-analytics.onrender.com/cleanup \
  -u admin:admin
```

## Monitoring

### Health Checks

Render automatically monitors `/health` endpoint every 5 minutes.

### Logs

View logs in Render Dashboard:
- Web Service → Logs
- Filter by: Error, Warning, Info

### Alerts

Configure alerts in Render Dashboard:
- High error rate
- High response time
- Database connection failures

## Security

- ✅ HTTPS enforced (Render default)
- ✅ Basic Auth for sensitive endpoints
- ✅ CORS configured for Stories App
- ✅ SQL injection protection (parameterized queries)
- ✅ Input validation on all endpoints
- ✅ Rate limiting (planned)

## Troubleshooting

### Database connection fails

**Check DATABASE_URL:**
```bash
echo $DATABASE_URL
```

**Test connection:**
```bash
psql $DATABASE_URL -c "SELECT 1"
```

### Migrations not running

**Run manually:**
```bash
psql $DATABASE_URL -f migrations/001_initial_schema.sql
```

### Events not appearing

**Check validation:**
```bash
# Enable debug mode
FLASK_ENV=development python app.py
```

**Query events:**
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM events"
```

### High memory usage

**Increase workers:**
```bash
# In render.yaml or Render Dashboard
gunicorn app:app --workers 4 --timeout 60
```

## Cost Optimization

### Free Tier (0-100 users)
- Web Service: Free (sleeps after 15 min)
- Database: Free (1GB storage)
- **Total: $0/month**

### Paid Tier (100+ users)
- Web Service: $7/month (always on)
- Database: $7/month (10GB storage)
- **Total: $14/month**

### Tips to Stay Free
1. Keep database under 1GB (auto-cleanup helps)
2. Accept 30s cold start from sleep
3. Ping health endpoint every 10 min to prevent sleep

## Support

- **Technical Docs:** `/docs/TELEMETRY_SPEC.md`
- **Privacy Policy:** `/docs/PRIVACY_TELEMETRY.md`
- **GitHub Issues:** https://github.com/Floristeady/stories-app/issues
- **Email:** support@pixelspace.com

## License

MIT License - Same as Stories App

---

**Version:** 1.0  
**Last Updated:** October 28, 2025

