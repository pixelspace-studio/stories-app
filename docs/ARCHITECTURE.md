# Stories v2 Architecture

> Part of **Stories v2 Planning**

Version: 0.1.0-draft

## Vision

Stories v2 is a multimodal, multi-track storytelling system. Users tell stories through any combination of inputs — voice, text, screen, video, gestures, drawings, sensors — captured simultaneously along a shared timeline. These raw stories are then transformed and delivered to consumers (humans, AI agents, robots, other systems) through multiple output channels.

Think of it as an Ableton Live arrangement: multiple tracks, each carrying a different type of media, entering and exiting over time. Some stories are simple (just voice), others are rich multi-track sessions.

## Core Principle: Tracks All the Way Down

The fundamental architectural insight: **everything is a track**. Raw inputs produce tracks. Transforms consume tracks and produce new tracks. Output channels read tracks. The core system only knows about stories, tracks, and data units.

```
Input Sources ──→ Tracks (raw) ──→ Transforms ──→ Tracks (transformed) ──→ Output Channels
```

This means:
- The core is minimal and uniform — it manages stories, tracks, and data units
- Inputs are plugins that produce tracks
- Transforms are plugins that consume tracks and produce tracks
- Outputs are interfaces that read tracks
- Adding a new input type, transform, or output channel never changes the core

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          STORIES v2                                 │
│                                                                     │
│  ┌──────────┐    ┌──────────┐    ┌─────────────┐    ┌───────────┐  │
│  │  INPUTS   │───→│   CORE   │───→│ TRANSFORMS  │───→│  OUTPUTS  │  │
│  │ (plugins) │    │          │    │  (plugins)  │    │(interfaces)│  │
│  └──────────┘    │ Stories  │    └─────────────┘    └───────────┘  │
│                  │ Tracks   │          │                   │        │
│                  │ Data Units│←─────────┘                   │        │
│                  │ Media    │                               │        │
│                  └──────────┘───────────────────────────────┘        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## The Pipeline

### 1. Input

An input source captures data from the user's spacetime and writes it into a track. Each input type has its own capture logic, but all converge to the same output: data units appended to a JSONL file, with optional media files on disk.

Supported inputs:

| Input              | Description                                        |
|-------------------|----------------------------------------------------|
| Voice             | Microphone audio, chunked during recording         |
| Text              | Keyboard-typed text                                |
| Spells            | Saved/reusable text templates and prompts          |
| Screen capture    | Screen recording or periodic screenshots           |
| Video (webcam)    | Camera video feed                                  |
| Photos            | Camera or screenshot still captures                |
| Interaction       | Keyboard, mouse, trackpad, game controller events  |
| Eye tracking      | Gaze position via Tobii, webcam SDK, etc.          |
| Gestures          | Hand/body gesture recognition                      |
| Hand drawing      | Freehand sketching (stylus, touch, mouse)          |
| WebSocket         | External data from sensors, robots, software agents|

All inputs, regardless of type, produce the same thing:
- A `track.json` manifest with `source: "input"` and the appropriate `input_type`
- A `data.jsonl` file with chronologically appended data units
- Optional binary files in `/media/`

### 2. Core

The core is deliberately minimal. It manages four things:

1. **Stories** — create, list, read, update `story.json`
2. **Tracks** — create, list, read `track.json` manifests within a story
3. **Data Units** — append to and read from `data.jsonl` files
4. **Media** — store and serve binary files from `/media/` directories

The core does not know or care about:
- What type of input produced a track
- What a transform does internally
- How an output channel delivers data

This separation is what keeps the system extensible. New input types, transforms, and output channels are added without touching the core.

### 3. Transforms

A transform reads data units from one or more source tracks and produces a new track with transformed data units. Transforms are plugins — the core does not contain transform logic.

#### Transform as a function

Conceptually, a transform is:

```
transform(source_tracks[], params) → new_track
```

The new track's `track.json` records its lineage:

```json
{
  "id": "voice-transcription-ccc333",
  "name": "Voice transcription",
  "type": "text",
  "created_at": "2026-03-31T10:00:00.000Z",
  "source": "transform",
  "transform": "transcription",
  "from_tracks": ["voice-raw-aaa111"],
  "params": {
    "model": "whisper-1",
    "language": "es"
  }
}
```

#### Transform graph

Transforms form a directed acyclic graph (DAG). A transform's output track can be the input to another transform.

```
voice-raw ──→ transcription ──→ voice-text ──→ semantic-analysis ──→ analysis
                                     │
screen-raw ──→ frame-extract ──→ screen-frames ──┘
```

There is no formal distinction between "basic" and "advanced" transforms. The difference is positional — some transforms tend to run first (close to raw data) and others run later (on already-transformed data). The system treats them uniformly.

#### Example transforms

| Transform          | Input track(s)       | Output track type | Description                                      |
|-------------------|---------------------|-------------------|--------------------------------------------------|
| `transcription`   | voice               | text              | Speech-to-text via Whisper or similar             |
| `frame-extract`   | screen / video      | screen            | Extract frames at N fps from video                |
| `downscale`       | screen              | screen            | Reduce image resolution/quality                   |
| `summarize`       | text                | text              | Summarize or restructure text content             |
| `semantic-analysis`| text + screen      | analysis          | AI-powered analysis combining multiple inputs     |
| `ocr`             | screen              | text              | Extract text from images                          |
| `sentiment`       | text                | analysis          | Sentiment/emotion analysis on text                |
| `object-detection`| screen / video      | analysis          | Detect and label objects in images                |
| `translate`       | text                | text              | Translate text to another language                |

#### Transform execution modes

Transforms can run in two modes:

- **Batch** — runs after the source track is complete. Reads all data units, processes, writes output track.
- **Streaming** — runs while the source track is still being written. Watches for new data units (tail-follow pattern on JSONL) and appends transformed units to the output track incrementally.

Streaming transforms enable the non-real-time streaming output model (see Outputs below).

### 4. Outputs

Output is not a separate concept in the data model — it is simply **reading tracks**. The different output channels are interfaces over the same operation: give me data units from these tracks.

#### Delivery modes

**Async** — the story is complete. Consumer reads tracks at their own pace.
- A human reviews a story later
- An AI agent processes a completed session
- An export tool generates a report

**Non-real-time streaming** — the story is being recorded. Data units are being appended in real time. Consumer reads tracks as they grow, with some delay (seconds to ~1 minute) due to capture, transform, and processing latency.
- An AI agent receives transcription chunks while the user is still talking
- A remote observer follows a field session with delay
- A monitoring system processes sensor data as it arrives

This is not real-time streaming (like live TV). The delay comes from chunked capture (e.g., 15-second audio chunks), transform processing time (e.g., Whisper transcription), and write latency. But it is streaming — consumers do not wait for the session to end.

The mechanism is simple: JSONL is append-only, so a consumer can tail-follow the file (or poll an API endpoint) for new lines.

#### Output interfaces

All interfaces expose the same underlying data. They differ in protocol, not in what they serve.

| Interface   | Protocol     | Use case                                          |
|------------|-------------|---------------------------------------------------|
| MCP Server | MCP         | AI agents (Claude, etc.) access stories as resources and use tools to query/interact |
| REST API   | HTTP        | Web clients, mobile apps, external services        |
| CLI        | stdin/stdout| Claude Code, scripts, automation pipelines         |
| WebSocket  | WS          | Real-time consumers that need push notifications of new data units |
| File system| Local disk  | Direct file access for local processing            |

#### Agent harness

For AI agent consumers, we provide a harness — a structured way for an agent to interact with a story. The harness exposes:

- **Available tracks** — what tracks exist, their types, their lineage
- **Read operations** — get data units from specific tracks, with filtering (by time range, type, dismissed status)
- **Subscribe operations** — follow a track in streaming mode, receive new units as they arrive
- **Context** — story metadata, track relationships, transform history

The harness is delivered through whichever output interface the agent uses (MCP, API, CLI). It is not a separate system — it is a set of conventions and operations layered on top of the standard track-reading interface.

## Data Flow: Complete Example

A user walks through a park, recording voice and video on their phone to document maintenance issues.

### Step 1: Input capture

Two input tracks are created simultaneously:

```
/stories/park-walk-xyz/
  story.json
  /tracks/
    /voice-raw-aaa/
      track.json    ← { source: "input", input_type: "microphone" }
      data.jsonl    ← voice chunks appended every ~15s
      /media/
        chunk-001.webm
        chunk-002.webm
        ...

    /video-raw-bbb/
      track.json    ← { source: "input", input_type: "webcam" }
      data.jsonl    ← video segments appended continuously
      /media/
        segment-001.webm
        segment-002.webm
        ...
```

### Step 2: Streaming transforms (running in parallel with capture)

As chunks arrive, transforms process them and produce new tracks:

```
    /voice-text-ccc/
      track.json    ← { source: "transform", transform: "transcription",
                         from_tracks: ["voice-raw-aaa"],
                         params: { model: "whisper-1" } }
      data.jsonl    ← text units appended as each voice chunk is transcribed

    /video-frames-ddd/
      track.json    ← { source: "transform", transform: "frame-extract",
                         from_tracks: ["video-raw-bbb"],
                         params: { fps: 1 } }
      data.jsonl    ← one screen unit per second
      /media/
        frame-0001.jpg
        frame-0002.jpg
        ...
```

### Step 3: Advanced transform (streaming, consuming transformed tracks)

An AI analysis transform reads the transcription and frames as they arrive:

```
    /maintenance-report-eee/
      track.json    ← { source: "transform", transform: "semantic-analysis",
                         from_tracks: ["voice-text-ccc", "video-frames-ddd"],
                         params: { prompt: "Identify maintenance issues..." } }
      data.jsonl    ← analysis units appended as the AI processes batches
```

### Step 4: Output

While the user is still walking:
- An AI agent subscribed via WebSocket receives analysis units as they are produced
- The agent starts building a maintenance task list before the walk ends

After the user finishes:
- The complete story is available via API for a web dashboard
- Another agent accesses it via MCP to generate a formal report
- The CLI is used to export the transcription as a markdown file

### Timeline visualization

```
Time ──────────────────────────────────────────────────────────→

voice-raw       ████████████████████████████████████████████████
video-raw       ████████████████████████████████████████████████
voice-text         ░░██████████████████████████████████████████░░   (delayed by ~15-30s)
video-frames       ░░██████████████████████████████████████████░░   (delayed by ~2-5s)
analysis              ░░░░░████████████████████████████████████░░░  (delayed by ~30-60s)
                                                                │
                                              user finishes ────┘
                                              agent already has ~95% processed
```

## Design Decisions

### 1. Tracks all the way down
Transforms produce tracks, not a different data structure. This means the core only deals with one data format. It eliminates the need for separate storage, querying, or serving logic for raw vs. transformed data.

### 2. No raw/transformed folder split
Raw and transformed tracks live side by side in `/tracks/`. The `source` field in `track.json` distinguishes them. This avoids duplicating the directory structure and keeps lineage simple (just track IDs, no path gymnastics).

### 3. Lineage via `from_tracks`
Each transform track declares its input tracks. This creates a traversable DAG — you can trace any piece of data back to its raw input. No separate lineage database needed.

### 4. No basic/advanced transform distinction
The system does not enforce transform levels. A "basic" transform (transcription) and an "advanced" transform (semantic analysis) are architecturally identical. The difference is only in what they do and where they sit in the DAG.

### 5. Streaming via JSONL append
Non-real-time streaming requires no special infrastructure. JSONL is append-only by design. Consumers tail-follow the file or poll an endpoint. Transforms in streaming mode do the same — watch source track, process new units, append to output track.

### 6. Output is just reading tracks
There is no separate "output" data model. Output interfaces (MCP, API, CLI, WebSocket) are views over tracks. This keeps the system simple and means any new output channel is just a new way to read the same data.

### 7. Inputs and transforms as plugins
The core does not contain input capture logic or transform logic. These are modules that use the core's track/data-unit API. Adding a new input type (e.g., LIDAR sensor) or a new transform (e.g., language translation) requires only writing the plugin — zero changes to the core.

## Glossary

| Term           | Definition                                                         |
|---------------|--------------------------------------------------------------------|
| **Story**     | A recorded session. Top-level container. Has a `story.json` manifest and contains tracks. |
| **Track**     | A timeline of data units of a single content type. Has a `track.json` manifest, a `data.jsonl` file, and optional `/media/`. |
| **Data Unit** | An atomic entry in a track's timeline. A single line in `data.jsonl`. |
| **Input**     | A plugin that captures data from a source (microphone, camera, keyboard, sensor) and writes it to a track. |
| **Transform** | A plugin that reads data units from one or more source tracks and produces a new track with transformed data. |
| **Manifest**  | The `track.json` file. Describes the track: what it is, where it came from, and how it was produced. |
| **Lineage**   | The chain of transforms from raw input to final output, encoded in `from_tracks` references. |
| **DAG**       | Directed Acyclic Graph — the dependency graph formed by tracks and their `from_tracks` relationships. |
| **Dismissed** | Soft-deleted. A data unit with `dismissed: true` is skipped by consumers but preserved on disk. |
| **Streaming** | Non-real-time streaming. Data units are consumed as they are appended, with some delay. Not live/real-time. |
