# Story Format Spec

> Part of **Stories v2 Planning**

Version: 0.1.0-draft

## Overview

A **Story** is a recorded session that captures multimodal input over time. Each Story contains one or more **Tracks**, and each Track contains a timeline of **Data Units** — atomic entries that represent a single piece of captured input.

Stories are stored as local files on disk. Binary media (audio, video, images) lives alongside the data as files, referenced by path.

See also: [ARCHITECTURE.md](ARCHITECTURE.md) for the system-level architecture, pipeline, transforms, and output model.

## Directory Structure

```
/stories/
  /[story-name-uuid]/
    story.json
    /tracks/
      /[track-name-uuid]/
        track.json
        data.jsonl
        /media/
          [filename-uuid.ext]
          ...
      /[track-name-uuid]/
        track.json
        data.jsonl
        /media/
          ...
```

## story.json

Top-level metadata for the Story.

```json
{
  "id": "uuid",
  "name": "Story name",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "tracks": [
    "track-name-uuid",
    "track-name-uuid"
  ]
}
```

| Field        | Type     | Required | Description                          |
|-------------|----------|----------|--------------------------------------|
| `id`        | string   | yes      | UUID for this story                  |
| `name`      | string   | yes      | Human-readable story name            |
| `created_at`| string   | yes      | ISO-8601 timestamp                   |
| `updated_at`| string   | yes      | ISO-8601 timestamp, updated on change|
| `tracks`    | string[] | yes      | Ordered list of track directory names|

## track.json

Manifest for a single Track within a Story. Describes what the track is, where it came from, and how it was produced.

```json
{
  "id": "uuid",
  "name": "Voice recording",
  "type": "voice",
  "created_at": "ISO-8601",
  "author": "uuid",

  "source": "input",
  "input_type": "microphone"
}
```

| Field        | Type     | Required | Description                              |
|-------------|----------|----------|------------------------------------------|
| `id`        | string   | yes      | UUID for this track                      |
| `name`      | string   | yes      | Human-readable track name                |
| `type`      | string   | yes      | Content type of units in this track (see Track Types) |
| `created_at`| string   | yes      | ISO-8601 timestamp                       |
| `author`    | string   | no       | UUID of the author/source of this track  |
| `source`    | string   | yes      | `"input"` or `"transform"` — how this track was produced |
| `input_type`| string   | conditional | Required when `source: "input"`. The input device/channel (see Input Types) |
| `transform` | string   | conditional | Required when `source: "transform"`. The transform identifier |
| `from_tracks`| string[]| conditional | Required when `source: "transform"`. Track IDs used as input |
| `params`    | object   | no       | Transform parameters (model, options, config) |

## data.jsonl

A JSONL file (one JSON object per line) containing the timeline of Data Units for the track. Units are appended chronologically.

### Data Unit

```json
{"timestamp": "ISO-8601", "type": "text", "data": "Hello world"}
```

| Field       | Type   | Required | Description                                      |
|------------|--------|----------|--------------------------------------------------|
| `timestamp`| string | yes      | ISO-8601 timestamp of when this unit was captured |
| `type`     | string | yes      | Unit type (see Data Unit Types below)             |
| `data`     | any    | yes      | Payload — string, number, boolean, array, or object |
| `author`   | string | no       | UUID of the author, if different from track author |
| `dismissed`| boolean| no       | Soft-delete flag. Omitted = false. When `true`, consumers should skip this unit |

### Soft-delete

Data Units are append-only and immutable once written. To "delete" a unit, set `dismissed: true`. This preserves the original data for undo and audit purposes. Consumers filter dismissed units: `!unit.dismissed`.

## Track Types

A Track's `type` field describes the **content type** of the Data Units it contains. This is independent of how the track was produced — a `text` track could come from keyboard input or from a transcription transform.

| Track Type    | Description                                      |
|--------------|--------------------------------------------------|
| `voice`      | Audio data (speech, ambient, radio, etc.)        |
| `text`       | Text content (typed, transcribed, generated)     |
| `spell`      | Saved/reusable text inputs (templates, prompts)  |
| `screen`     | Screen capture (screenshots or screen recording) |
| `video`      | Camera/webcam video                              |
| `interaction`| Input device events (keyboard, mouse, joystick, eye-tracking) |
| `gesture`    | Gesture recognition input                        |
| `drawing`    | Freehand drawing / sketching                     |
| `websocket`  | External data received via WebSocket (sensors, robots, agents) |
| `analysis`   | Structured output from semantic/AI transforms    |

## Input Types

When `source: "input"`, the `input_type` field describes the device or channel that produced the track.

| Input Type     | Description                                    |
|---------------|------------------------------------------------|
| `microphone`  | System microphone                              |
| `radio`       | Radio/walkie-talkie input                      |
| `keyboard`    | Typed text input                               |
| `screen`      | Screen capture/recording                       |
| `webcam`      | Camera/webcam                                  |
| `camera`      | Photo capture                                  |
| `mouse`       | Mouse/trackpad events                          |
| `joystick`    | Game controller / joystick                     |
| `eye-tracking`| Eye tracking device or SDK                     |
| `gesture`     | Gesture recognition (hand/body tracking)       |
| `drawing`     | Freehand drawing input (stylus, touch, mouse)  |
| `websocket`   | External WebSocket connection                  |

## Data Unit Types & Shapes

### voice

```json
{
  "timestamp": "...",
  "type": "voice",
  "data": {
    "file": "media/recording-abc123.webm",
    "duration": 4.2,
    "source": "microphone"
  }
}
```

- `data.file` — relative path to audio file in `/media/`
- `data.duration` — duration in seconds
- `data.source` — input source: `"microphone"`, `"radio"`, `"system"`, etc.

### text

```json
{
  "timestamp": "...",
  "type": "text",
  "data": "Any string, including **markdown** and complex content"
}
```

- `data` — string. May contain markdown, code, or plain text.

### spell

```json
{
  "timestamp": "...",
  "type": "spell",
  "data": {
    "name": "Fix function",
    "body": "Refactor to use async/await and add error handling"
  }
}
```

- `data.name` — short label for the spell
- `data.body` — the full text content

### screen

```json
{
  "timestamp": "...",
  "type": "screen",
  "data": {
    "file": "media/screen-def456.png",
    "resolution": [1920, 1080]
  }
}
```

- `data.file` — relative path to image or video in `/media/`
- `data.resolution` — `[width, height]` in pixels

### video

```json
{
  "timestamp": "...",
  "type": "video",
  "data": {
    "file": "media/cam-ghi789.webm",
    "duration": 12.5
  }
}
```

- `data.file` — relative path to video file in `/media/`
- `data.duration` — duration in seconds

### interaction

```json
{
  "timestamp": "...",
  "type": "interaction",
  "data": {
    "device": "mouse",
    "events": [
      {"t": 0, "action": "click", "x": 120, "y": 340},
      {"t": 50, "action": "move", "x": 125, "y": 342}
    ]
  }
}
```

- `data.device` — `"keyboard"`, `"mouse"`, `"joystick"`, `"eye-tracking"`, etc.
- `data.events` — array of events batched within this unit
- `data.events[].t` — relative time offset in ms from the unit's `timestamp`

Interaction units are batched to avoid per-event overhead. A single unit may contain many events within a time window.

### gesture

```json
{
  "timestamp": "...",
  "type": "gesture",
  "data": {
    "gesture": "swipe-right",
    "confidence": 0.92,
    "landmarks": [[0.5, 0.3], [0.6, 0.2]]
  }
}
```

- `data.gesture` — recognized gesture name
- `data.confidence` — recognition confidence (0-1)
- `data.landmarks` — optional, array of `[x, y]` normalized coordinates

### drawing

```json
{
  "timestamp": "...",
  "type": "drawing",
  "data": {
    "strokes": [
      {
        "points": [[0, 0], [10, 5], [20, 3]],
        "pressure": [0.5, 0.8, 0.3],
        "color": "#ff0000",
        "width": 2
      }
    ],
    "file": "media/drawing-jkl012.png"
  }
}
```

- `data.strokes` — vector stroke data for re-rendering
- `data.strokes[].points` — array of `[x, y]` coordinates
- `data.strokes[].pressure` — per-point pressure values (0-1)
- `data.file` — optional, rasterized export in `/media/`

## Media Files

Binary files (audio, video, images, exported drawings) are stored in the track's `/media/` directory. They are referenced from Data Units by relative path (`media/filename.ext`).

File naming convention: `[descriptive-name]-[short-uuid].[ext]`

Examples:
- `recording-a1b2c3.webm`
- `screen-d4e5f6.png`
- `cam-g7h8i9.webm`
- `drawing-j0k1l2.png`

## Design Decisions

1. **JSONL over JSON for data units** — Tracks are append-only during recording. JSONL supports real-time append without read-parse-rewrite. Reading the full timeline is trivial: `lines.map(JSON.parse)`.

2. **Soft-delete over rewrite** — Setting `dismissed: true` is an append operation. No file rewrite needed. Preserves history for undo. Full compaction (rewriting without dismissed units) can be done offline if needed.

3. **Media as files, not inline** — Binary data is referenced by path, not embedded. Keeps JSONL lines small and readable. Media files can be large and are better served from disk.

4. **Flexible `data` field** — The `data` field accepts any JSON type. The `type` field provides semantic meaning so consumers know how to interpret it. This keeps the format extensible without schema changes.

5. **Batched interaction events** — High-frequency inputs (mouse, keyboard) are grouped into batches within a single Data Unit using relative timestamps (`t`), rather than one unit per event. This keeps file sizes manageable.

6. **Author at both track and unit level** — Track-level `author` is the default. Unit-level `author` overrides it, supporting collaborative tracks where multiple authors contribute.
