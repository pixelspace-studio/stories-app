# Stories v2 Technology Stack

> Part of **Stories v2 Planning**

Version: 0.1.0-draft

## Overview

Stories v2 is a multimodal storytelling platform that runs as native apps (desktop, tablet, phone), a web app, and exposes APIs for external consumers (AI agents, CLI, third-party clients). The stack is designed around three principles:

1. **Local-first** — capture and processing happen on the user's device whenever possible, minimizing server costs and enabling offline use
2. **Uniform core** — the same data model (stories, tracks, data units) is used everywhere, from local storage to cloud to API
3. **Plugin architecture** — inputs, transforms, and output channels are modules, not core

## Native Applications — Tauri v2

**Choice: Tauri v2** over Electron.

| Aspect          | Tauri v2                        | Electron                       |
|----------------|--------------------------------|--------------------------------|
| Bundle size    | ~5-10 MB                       | ~120+ MB                       |
| Backend        | Rust (native performance)      | Node.js                        |
| Platforms      | Desktop + mobile (iOS/Android) | Desktop only (need CapacitorJS for mobile) |
| WebView        | System webview                 | Bundled Chromium               |
| Memory usage   | Lower                          | Higher                         |

### Trade-off: system webview

Tauri uses the OS webview instead of bundling Chromium:
- macOS / iOS → WebKit (Safari)
- Windows → WebView2 (Chromium/Edge)
- Linux → WebKitGTK (WebKit)
- Android → Android WebView (Chromium)

This means two rendering engines (WebKit + Chromium) instead of one. With Vanilla JS and standard CSS, the differences are manageable. Avoiding framework-specific browser quirks keeps this risk low.

### Why Tauri wins for Stories

The Rust backend in Tauri is the decisive factor. Stories captures and processes media in real time — audio chunking, video-to-frame extraction, image compression, JSONL writing. These are exactly the workloads where Rust outperforms Node.js by orders of magnitude. With Tauri, this performance-critical code runs natively via IPC, not through an HTTP localhost hack.

### Plugin ecosystem

Tauri's plugin ecosystem is smaller than Electron's, but for most input types (webcam, microphone, screen capture, gamepad, file system) the work is done in the web layer using standard browser APIs and JavaScript libraries:

- **MediaDevices API** — microphone, webcam
- **Screen Capture API** — screen sharing/recording
- **Gamepad API** — game controllers (Xbox, PlayStation, etc.)
- **Canvas API** — drawing, sketching
- **WebSocket API** — external sensors, agents

For capabilities that require native access beyond the webview (e.g., global hotkeys, system tray, file system), Tauri provides built-in plugins. Custom Tauri plugins in Rust can be written for anything else.

Eye tracking, gesture recognition, and similar advanced inputs would use JavaScript SDKs (e.g., TensorFlow.js for hand tracking via webcam) or Rust-side integrations with native SDKs (e.g., Tobii).

## Frontend — Vanilla JS + Web Components

**No frameworks.** No React, Vue, Svelte, or Angular.

The frontend uses native **Web Components** for structure and encapsulation. Web Components are a browser standard — no build step required, no dependencies, no framework lock-in.

```js
class StoryTrack extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="track">...</div>`;
  }
}
customElements.define('story-track', StoryTrack);
```

```html
<story-timeline>
  <story-track type="voice" name="Microphone"></story-track>
  <story-track type="screen" name="Screen capture"></story-track>
</story-timeline>
```

### Shared frontend across platforms

The same Vanilla JS + Web Components frontend runs in:
- Tauri desktop app (macOS, Windows, Linux)
- Tauri mobile app (iOS, Android)
- Web app (hosted, any browser)

Platform-specific features are handled via:
- **Feature detection** — check if an API is available before using it
- **Platform-specific components** — components that only render on certain platforms (e.g., a mobile-optimized capture UI)
- **Tauri IPC bridge** — for native capabilities not available in the webview

The goal is ~60-75% shared UI with ~25-40% platform-specific experiences. Mobile users capturing stories outdoors have different needs than desktop users doing detailed editing.

## Backend — FastAPI (Python) + Rust Modules

### FastAPI

The primary backend framework. Handles:
- REST API (stories, tracks, data units, users)
- WebSocket connections (streaming output, real-time notifications)
- Transform orchestration (queueing, monitoring)
- AI provider integration
- Auth, billing, admin

### Rust modules via PyO3

[PyO3](https://pyo3.rs/) allows writing Rust code that is callable from Python as native modules — no subprocess, no FFI overhead, no serialization. Python calls Rust functions as if they were Python functions.

```python
from stories_core import extract_frames, chunk_audio, compress_image

# These are Rust functions, called from Python seamlessly
frames = extract_frames(video_path, fps=1)
chunks = chunk_audio(audio_path, chunk_duration=15.0)
compressed = compress_image(image_path, quality=80)
```

Candidates for Rust modules:
- Video frame extraction
- Audio chunking and processing
- Image compression and resizing
- High-throughput JSONL read/write
- WebSocket server for high-concurrency streaming

Everything else (API routes, transform orchestration, AI API calls, business logic) stays in Python where development speed matters more than execution speed.

### Local processing philosophy

Heavy media processing happens on the **client** (Tauri/Rust), not the server:

```
Client (Tauri + Rust)                    Server (FastAPI)
──────────────────                       ────────────────
Record video                             Receive data units (small JSON)
Extract frames locally (Rust)      →     Receive processed media (compressed JPGs)
Chunk audio locally (Rust)         →     Store in cloud
Compress images locally (Rust)           Run AI transforms
Write local JSONL                        Serve API
Sync when connected               →     
```

This saves server costs, reduces bandwidth, and enables offline use. The server receives already-processed data — never raw video streams.

## Database — PostgreSQL (unified)

A single PostgreSQL instance with extensions for all data needs:

### PostgreSQL core
- Users, accounts, billing
- Story and track metadata
- Transform job history
- Application state

### pgvector extension
- Semantic search over transcriptions
- Image embeddings for visual search
- Hybrid search combining vector similarity with keyword matching

### Apache AGE extension
- [Apache AGE](https://age.apache.org/) — "A Graph Extension" for PostgreSQL
- Open source (Apache 2.0 license), completely free
- Adds graph database capabilities with Cypher query language (same as Neo4j)
- Use cases: story lineage graphs, knowledge graphs, relationship mapping between entities mentioned across stories
- Part of the Apache Software Foundation (same org as Apache HTTP Server, Kafka, Spark, etc.)

### tsvector (built-in)
- Full-text search over transcriptions and text content
- Built into PostgreSQL, no extension needed
- Supports language-aware stemming, ranking, highlighting

### Search strategy: hybrid

Combine all three for powerful search:
- **tsvector** — keyword/full-text search ("find stories mentioning park maintenance")
- **pgvector** — semantic search ("find stories similar to this one")
- **Apache AGE** — graph traversal ("find all stories connected to this location/person/topic")

This is often called **hybrid search**. Results from multiple search methods are combined and ranked. When feeding results to AI for analysis, this becomes **RAG** (Retrieval-Augmented Generation).

## Local Storage — SQLite + File System

For offline/local-first operation, the client stores data locally:

### File system
- Story directories with the standard structure (`story.json`, tracks, `data.jsonl`, `/media/`)
- This is the canonical local format — same structure described in STORY-FORMAT-SPEC.md
- Works on all platforms (desktop, mobile, web via Origin Private File System)

### SQLite
- Local metadata index (fast queries without parsing JSONL)
- Sync queue (tracks pending upload, sync status, conflict resolution)
- Local settings and preferences
- Search index for local stories

### Sync strategy

```
LOCAL (device)                          CLOUD (server)
──────────────                          ──────────────
SQLite ◄──────── sync metadata ────────► PostgreSQL
File system ◄─── sync media ───────────► Cloud Storage
JSONL files ◄─── sync data units ──────► PostgreSQL + Cloud Storage
```

- **Baseline assumption**: connected to internet. Sync happens continuously.
- **Offline mode**: fully functional for capture and local transforms. Everything queues for sync.
- **Sync granularity**: data units and media files sync individually (not whole tracks at once), enabling progressive upload during and after capture.
- **Conflict resolution**: append-only JSONL means conflicts are rare. Last-write-wins for metadata. Dismissed flags are additive (never conflict).

## Job Queue — Dramatiq + Redis

For server-side transform execution:

### Dramatiq
- Modern Python task queue (alternative to Celery)
- Simpler configuration, fewer historical gotchas
- Built-in retries, rate limiting, priority queues
- Workers can be Python or delegate to Rust

### Redis
- Message broker for Dramatiq (job queue backbone)
- Pub/sub for real-time notifications ("new data units in track X")
- Cache for frequently accessed data (active story metadata, user sessions)

### Worker architecture

```
                    ┌─── Python worker ─── AI API call (transcription, analysis)
                    │
Dramatiq + Redis ───┼─── Python worker ─── Light processing (text transforms)
                    │
                    └─── Python worker ─── Rust module via PyO3 (frame extraction, etc.)
```

All workers are Python processes. Performance-critical work within a worker calls Rust via PyO3. The queue does not need to know about Rust — it just dispatches to Python workers.

## Cloud Storage — Google Cloud Storage

**Choice: Google Cloud Storage (GCS)** for media files in the cloud.

- Reliable, well-established
- Good SDK support (Python, JS, Rust)
- Multiple storage classes (Standard, Nearline, Coldline) for cost optimization
- Egress costs exist but are manageable at moderate scale

**Note on egress**: "Egress" is outbound data transfer — when a user or server downloads a file from cloud storage. Most providers (AWS S3, GCS) charge per GB of egress. This cost matters at scale with heavy media download. Mitigation strategies:
- Process media on-device when possible (reduces cloud downloads)
- Use CDN caching for frequently accessed media
- Use Nearline/Coldline storage classes for archived stories
- Consider Backblaze B2 (S3-compatible, significantly cheaper egress) as an alternative if costs become significant

Other cloud storage options to evaluate:
- **Backblaze B2** — S3-compatible, very cheap egress, good for media-heavy workloads
- **AWS S3** — industry standard, higher egress costs
- **Google Cloud CDN** — can be paired with GCS for faster delivery

## AI Providers

Three providers, each with specific strengths:

| Provider   | Primary use in Stories                                      |
|-----------|-------------------------------------------------------------|
| **OpenAI**    | Whisper (speech-to-text transcription), text embeddings     |
| **Anthropic** | Semantic analysis, long-context reasoning, structured output, agent harness |
| **Google**    | Gemini multimodal (native video/audio/image understanding, large context windows) |

### Adapter pattern

Transforms are not coupled to a specific AI provider. An adapter layer allows swapping providers:

```python
class TranscriptionTransform(Transform):
    def __init__(self, provider="openai"):
        self.engine = get_engine(provider)  # openai, google, or future local model

    def execute(self, source_track):
        for unit in source_track.read():
            text = self.engine.transcribe(unit.data.file)
            self.output_track.append({"type": "text", "data": text})
```

### Future: local models

The adapter pattern enables future use of local/on-device AI models. When viable, a transform can use `provider: "local"` to run inference on-device instead of calling a cloud API. No architectural changes needed — just a new engine implementation.

## Authentication & Payments

### Authentication — Auth0
- Industry standard, handles OAuth, SSO, MFA
- SDKs for all platforms (web, iOS, Android, desktop)
- Manages user sessions, tokens, permissions

### Payments — Stripe + Numeral
- **Stripe** — payment processing (subscriptions, one-time payments)
- **Numeral** — international tax compliance, withholding, invoicing

Other options to evaluate for merchant-of-record (handling international taxes automatically):
- **Paddle** — merchant of record, handles VAT/sales tax globally
- **Lemon Squeezy** — similar to Paddle, simpler setup, good for SaaS

## Platform Matrix

| Feature / Capability        | Desktop (Tauri) | Mobile (Tauri) | Web App    |
|----------------------------|----------------|---------------|------------|
| Voice capture              | yes            | yes           | yes        |
| Text input                 | yes            | yes           | yes        |
| Screen capture             | yes            | limited       | limited    |
| Webcam/camera              | yes            | yes           | yes        |
| Photos                     | yes            | yes (native)  | yes        |
| Game controller            | yes            | no            | yes        |
| Eye tracking               | yes            | no            | no         |
| Gesture recognition        | yes            | yes           | yes        |
| Hand drawing               | yes            | yes (touch)   | yes        |
| WebSocket input            | yes            | yes           | yes        |
| Local Rust processing      | yes            | yes           | no         |
| Offline capture            | yes            | yes           | limited    |
| File system storage        | yes            | yes           | OPFS       |
| SQLite local               | yes            | yes           | no (IndexedDB) |

## Stack Summary

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENTS                                                    │
│                                                             │
│  Tauri v2 ─── Desktop (macOS, Windows, Linux)               │
│           ─── Mobile (iOS, Android)                         │
│  Web App ─── Hosted (any browser)                           │
│  Future  ─── VR, AR glasses, custom clients via API         │
│                                                             │
│  Frontend: Vanilla JS + Web Components                      │
│  Local processing: Rust (via Tauri) for media               │
│  Local storage: SQLite + file system                        │
├─────────────────────────────────────────────────────────────┤
│  API LAYER                                                  │
│                                                             │
│  FastAPI ─── REST API + WebSocket                           │
│  MCP Server ─── AI agent access                             │
│  CLI ─── Automation, Claude Code, scripts                   │
├─────────────────────────────────────────────────────────────┤
│  PROCESSING                                                 │
│                                                             │
│  Dramatiq + Redis ─── Job queue for server-side transforms  │
│  Rust modules (PyO3) ─── Performance-critical processing    │
│  AI adapters ─── OpenAI, Anthropic, Google (swappable)      │
├─────────────────────────────────────────────────────────────┤
│  DATA                                                       │
│                                                             │
│  PostgreSQL ─── metadata, users, billing, search            │
│  pgvector ─── semantic/vector search                        │
│  Apache AGE ─── graph relationships                         │
│  tsvector ─── full-text search (built-in)                   │
│  Google Cloud Storage ─── media files (cloud)               │
│  Redis ─── job queue broker, pub/sub, cache                 │
├─────────────────────────────────────────────────────────────┤
│  SERVICES                                                   │
│                                                             │
│  Auth0 ─── Authentication                                   │
│  Stripe ─── Payments                                        │
│  Numeral ─── Tax compliance                                 │
└─────────────────────────────────────────────────────────────┘
```

## Key Architectural Decisions

### 1. Tauri v2 over Electron
Rust backend enables native-performance media processing. Single framework covers desktop + mobile. Smaller bundles. Trade-off: system webview differences (manageable with Vanilla JS).

### 2. Local-first processing
Heavy media work (video → frames, audio chunking, image compression) runs on-device via Rust. Server receives processed data only. Saves cost, bandwidth, and enables offline use.

### 3. Single database (PostgreSQL + extensions)
One database for relational, vector, graph, and full-text search. No separate Neo4j, Elasticsearch, or Pinecone instances to manage. Apache AGE and pgvector are free, open-source extensions.

### 4. Vanilla JS + Web Components
No framework dependency. Browser-native component model. Same code runs in Tauri webview and web browser. No build step required (though one can be added for optimization).

### 5. Dramatiq over Celery
Modern, simpler, less configuration. Same Redis broker. Workers call Rust via PyO3 for heavy lifting.

### 6. AI provider adapter pattern
Transforms are not coupled to providers. Enables swapping between OpenAI, Anthropic, Google, and future local models without changing transform logic.

### 7. Sync strategy
Local-first with progressive sync. SQLite + filesystem locally, PostgreSQL + GCS in the cloud. Append-only JSONL makes conflict resolution simple.
