# Stories v2 — Product Vision

> Part of **Stories v2 Planning**

Version: 0.1.0-draft

## What is Stories?

Stories is a multimodal storytelling platform. It lets people tell stories through any combination of media — voice, text, video, drawings, gestures, screen sharing, sensor data — captured simultaneously along a shared timeline.

Think of it as an **Ableton Live arrangement for human expression**: multiple tracks, each carrying a different type of media, entering and exiting over time. The system captures these stories, transforms them into useful forms, and delivers them to consumers — other humans, AI agents, robots, or any software system.

## The Spectrum of Stories

Not every story is complex. Stories range from dead simple to richly layered:

**Simple** — A user speaks into their phone while walking. One track: voice. Output: a transcription. Done.

**Medium** — A user walks through a park with their phone, narrating what they see while recording video. Two tracks: voice + video. Transforms produce a transcription and a sequence of still frames. An AI agent receives both and generates a maintenance report.

**Complex** — A team collaborates on a design session. One person sketches on a tablet (drawing track), another describes the concept verbally (voice track), a third shares their screen showing reference material (screen track), and sensor data from a smart whiteboard streams in via WebSocket. Multiple transforms run: transcription, frame extraction, OCR on the whiteboard, semantic analysis combining everything. The result is a structured design brief with visual references.

The architecture is the same for all of these. The only difference is the number of tracks.

## Input Channels

Users tell stories through one or more of these channels simultaneously. Each active channel becomes a track in the story's timeline.

### Voice
The most natural and common input. User speaks, audio is captured in chunks (e.g., 15-second segments), each chunk becomes a data unit. Works with any microphone — built-in, headset, radio, bone conduction headphones.

**Key scenario**: Hands-free storytelling. User is walking, meditating, doing chores, exercising — voice is the primary or only input available.

### Text
Typed input via keyboard. May include plain text, markdown, code, structured content. Each submission or segment becomes a data unit.

**Key scenario**: Precise, edited input. User is at a desk writing detailed instructions, code snippets, or structured notes.

### Spells
Saved text templates and prompts that can be triggered during a session. A spell is a reusable text input with a name and body.

**Key scenario**: Repeated instructions. A user has a set of standard prompts or templates they use across multiple stories ("Analyze this for accessibility issues", "Generate a task list from what I described").

### Screen Capture
Screen recording or periodic screenshots from the user's computer or phone. Can be continuous video or time-lapse stills.

**Key scenario**: Demonstrating software, reviewing designs, showing a workflow. The screen content tells part of the story that voice alone cannot.

### Video (Webcam / Camera)
Live video from a webcam or phone camera. Captures the user's physical environment or the user themselves.

**Key scenario**: The park walk — user records what they see while narrating. Also: remote presence, physical prototyping, showing a physical space.

### Photos
Still image capture from camera or screenshot. Individual images as data units, not continuous video.

**Key scenario**: Quick visual documentation. "Here's a photo of the thing I'm describing."

### Interaction
Captures input device events — keyboard strokes, mouse movements, trackpad gestures, game controller buttons, joystick positions. Events are batched into data units for efficiency.

**Key scenario**: Recording how a user interacts with software for UX analysis, or mapping controller inputs in Pixelspace Soar (see [SOAR.md](SOAR.md)).

### Eye Tracking
Gaze position data from hardware (Tobii) or software (webcam-based SDKs). Tracks where the user is looking over time.

**Key scenario**: Attention analysis on designs or interfaces. Understanding what the user focuses on while telling a story.

### Gestures
Hand and body gesture recognition via camera or sensors. Captures recognized gestures (swipe, point, wave) with confidence scores.

**Key scenario**: Hands-free interaction, physical expression capture, sign language, spatial description ("it's about this big").

### Hand Drawing
Freehand sketching via stylus, touch, or mouse. Captures stroke data (points, pressure, color) and optionally rendered images.

**Key scenario**: Visual thinking. Quick sketches, diagrams, annotations on screenshots, spatial explanations that words cannot convey.

### WebSocket (External Data)
Data received from external sources via WebSocket connections — IoT sensors, robots, software agents, other AI systems, smart devices.

**Key scenario**: Environmental storytelling. Sensors in a space send temperature, light, sound, motion data while a human narrates. A robot's telemetry streams alongside a controller operator's voice. An AI agent sends its observations as part of a collaborative story.

## Transforms

Raw input tracks are often not directly useful for their final purpose. Transforms convert raw data into more consumable forms. See [ARCHITECTURE.md](ARCHITECTURE.md) for technical details.

### From the user's perspective

The user does not think in terms of "transforms." They think: "I recorded my voice, and now I have a transcription." Or: "I recorded video, and now I have a set of annotated screenshots." Transforms happen automatically based on the story configuration or on demand when the user requests a specific output.

### Basic transforms (close to raw data)

These are almost always applied. They convert raw media into more accessible formats:

| What the user did        | What they get                              |
|-------------------------|-------------------------------------------|
| Spoke into microphone   | Text transcription of their words          |
| Recorded video          | Sequence of still frames (1 per second)    |
| Shared their screen     | Periodic screenshots                       |
| Drew a sketch           | Rendered image of the drawing              |

### Advanced transforms (semantic processing)

These extract meaning, structure, or intelligence from the data:

| Input                          | Output                                          |
|-------------------------------|------------------------------------------------|
| Transcription + frames        | Structured analysis (maintenance report, task list, summary) |
| Multiple text tracks          | Synthesized summary across speakers             |
| Drawing + voice description   | Annotated design brief                          |
| Sensor data + voice           | Correlated event log with human context         |
| Any combination               | Knowledge graph entries, entity extraction, sentiment |

### Transform philosophy

- Transforms are **optional** — a user may want only raw data
- Transforms are **configurable** — which ones run, with what parameters
- Transforms are **incremental** — they can run while recording is still in progress (streaming mode)
- The user sees the **result**, not the pipeline

## Output & Delivery

Once captured and transformed, stories are consumed by different entities through different modes and interfaces.

### Who consumes stories?

- **The user themselves** — reviewing, editing, exporting their own stories
- **Other humans** — team members, collaborators, audiences
- **AI agents** — Claude, GPT, Gemini, custom agents that process stories for analysis, tasks, or conversation
- **Software systems** — dashboards, CMS, project management tools, automation pipelines
- **Robots / IoT** — systems that act on story content (e.g., a maintenance robot receiving a task list)

### Delivery modes

**Async** — the story is complete. The consumer accesses it when ready. Like reading an email — the content is there, waiting.

- User reviews yesterday's stories on their laptop
- AI agent processes a batch of completed stories overnight
- Team lead reviews the week's field reports

**Non-real-time streaming** — the story is being told right now. Data arrives with some delay (seconds to about a minute) but continuously. Like following a live blog — not instant, but ongoing.

- AI agent receives transcription chunks while the user is still speaking in the park
- Remote team member follows a field session with slight delay
- Monitoring system processes sensor data as it streams in

The delay comes from: chunked capture (e.g., 15-second audio chunks), transform processing (e.g., Whisper transcription takes time), and write/sync latency. This is not real-time streaming like live TV. It is **near-live** with a deliberate trade-off: we accept delay in exchange for transformed, structured, useful data rather than raw streams.

### Output interfaces

| Interface    | Who uses it                     | Mode            |
|-------------|--------------------------------|-----------------|
| **Web app**     | Humans (browser)               | Async           |
| **Native app**  | Humans (desktop/mobile)        | Async + streaming |
| **REST API**    | Any software client            | Async           |
| **WebSocket**   | Real-time consumers            | Streaming       |
| **MCP Server**  | AI agents (Claude, etc.)       | Async + streaming |
| **CLI**         | Developers, scripts, Claude Code| Async           |
| **File system** | Local tools, direct access     | Async           |

### Agent harness

AI agents are first-class consumers of stories. The agent harness provides a structured way for agents to:

- Discover available stories and tracks
- Read data units with filtering (by time, type, dismissed status)
- Subscribe to active tracks and receive new data units as they arrive
- Understand track lineage (what transforms produced what)
- Act on story content (generate reports, create tasks, ask follow-up questions)

The harness is not a separate system — it is a set of conventions exposed through MCP, API, or CLI. An AI agent using Claude Code's MCP integration, for example, sees stories as resources and uses tools to query and interact with them.

## Platform Experiences

Stories runs on desktop, tablet, phone, and web. The experience adapts to each platform — it is not simply a responsive layout scaled to fit.

### Desktop (macOS, Windows, Linux)

The power station. Full multi-track timeline view (the "Ableton" view). Best for:
- Complex multi-track stories with editing
- Screen sharing and recording
- Extended work sessions at a desk
- Detailed review and analysis of past stories

### Tablet (iPad, Android tablet)

The sketchpad. Touch-optimized for drawing and visual input. Best for:
- Hand drawing and sketching
- Reviewing stories visually
- Portable capture with a larger screen than phone
- Annotation of images and screenshots

### Phone (iOS, Android)

The field recorder. Optimized for capture on the go. Best for:
- Voice stories while walking, commuting, exercising
- Quick photo/video capture in the field
- Paired with game controller for hands-free operation (see [SOAR.md](SOAR.md))
- The park walk scenario: voice + camera + controller

### Web

The universal viewer. Accessible from any browser, no install. Best for:
- Reviewing and sharing stories
- Lightweight text input
- Team dashboards and analytics
- Public or shared story access

### Platform-specific vs shared

Roughly 60-75% of functionality is shared across all platforms. The remaining 25-40% is platform-specific:

- **Phone-specific**: optimized outdoor capture flow, controller pairing, auditory menus for screenless use
- **Desktop-specific**: full timeline editor, multi-monitor support, system audio capture, advanced screen recording
- **Tablet-specific**: pressure-sensitive drawing, split-screen capture + review
- **Web-specific**: sharing/embedding, public story pages, team analytics dashboard

## User Scenarios

### Solo voice story
1. User opens Stories on phone
2. Presses record (or uses controller button)
3. Speaks freely for 5 minutes
4. Stops recording
5. Transcription is available within seconds of stopping
6. User reviews, optionally runs "summarize" transform
7. Done — story is synced to cloud

### Park maintenance walk
1. User puts phone in pocket, pairs Xbox controller, puts on bone conduction headphones
2. Presses controller button to start story with voice + video
3. Walks through the park, narrating issues while phone camera records
4. Controller buttons: pause/resume, mark important moment, stop
5. Auditory feedback confirms actions ("Recording paused", "Marker added")
6. Meanwhile, streaming transforms run: voice → transcription, video → frames
7. AI agent receives transformed data progressively via MCP
8. User finishes 38-minute walk
9. By the time they check their phone, the AI has already produced a maintenance task list with photo evidence

### Team design session
1. Three team members join a shared story session
2. Person A: voice track (describing the concept)
3. Person B: drawing track (sketching on tablet)
4. Person C: screen track (sharing reference designs)
5. All tracks record simultaneously with independent start/stop
6. After session, transforms run: transcription, frame extraction, OCR
7. Advanced transform combines everything into a structured design brief
8. Brief is available via API for the team's project management tool

### Meditation with AI
1. User sits in lotus position with controller in hands and bone conduction headphones
2. Starts a voice story via controller
3. Speaks stream of consciousness for 20 minutes
4. AI agent listens via streaming, processes thoughts in real time
5. When user finishes, agent has organized the stream into themes and insights
6. User reviews on phone or desktop later

## Collaboration — Multi-Author Stories

Stories are not limited to a single person. Multiple authors — humans and/or AI agents — can contribute to a story.

### Who can tell stories?

Any entity can be a storyteller:
- A single human (the most common case)
- Multiple humans in a collaborative session
- An AI agent contributing analysis, responses, or observations
- A sensor, robot, or software system sending data via WebSocket
- Any combination of the above

This creates all communication patterns:
- **One-to-one** — one human tells a story for one AI agent
- **One-to-many** — one human tells a story consumed by multiple agents or people
- **Many-to-one** — a team tells a story together for a single consumer
- **Many-to-many** — multiple authors, multiple consumers
- All of these apply equally to humans and digital agents on either side

### Two models for multi-author stories

**Model 1: Separate stories, coordinated by time**

Each author tells their own story independently. Stories happen to overlap in time. To view them together, you align by timestamp. No special setup needed — each person is the owner of their own story.

This is the default and simplest model. It works well when authors are loosely coupled (e.g., field workers reporting from different locations during the same period).

**Model 2: Merged story**

Tracks from multiple stories are combined into a new, unified story. This is a transform operation — a "merge transform" that takes N stories as input and produces one story as output. The merged story's `story.json` includes `from_stories` for lineage.

```json
{
  "id": "merged-story-uuid",
  "name": "Team design session — merged",
  "created_at": "...",
  "from_stories": ["story-uuid-a", "story-uuid-b", "story-uuid-c"],
  "tracks": ["...all tracks from all source stories..."]
}
```

This is powerful when you want an AI agent to process a collaborative session as a single coherent input — all tracks on one timeline.

**Both models coexist.** They are not mutually exclusive. Separate stories can be viewed in coordination, and they can also be merged when needed.

### Clock synchronization

When coordinating or merging stories from multiple devices, timestamps must be aligned. Different devices may have slightly different clocks (clock drift).

- **Sync check**: when clients join a collaborative session, each requests the server time. If the offset exceeds 1 second, a `clock_offset` field is recorded in `track.json` to compensate when coordinating or merging.
- **Manual adjustment**: if automated sync is insufficient, the user can manually nudge a track's time alignment.
- **Append-only safety**: since data units are append-only, clock drift does not corrupt data — it only affects ordering when viewing multiple tracks together. Worst case, events appear slightly out of order, which can be corrected after the fact.

## Relationship to Other Pixelspace Products

### Pixelspace Soar
Remote controller SDK that enables hands-free, screen-free interaction with digital products. Stories is a primary consumer of Soar for hands-free story capture. See [SOAR.md](SOAR.md).

### Integration pattern
Stories exposes a clean API that any Pixelspace product (or third-party product) can use to create and consume stories. Soar provides controller input that any Pixelspace product can use for hands-free interaction. Together, they enable a workflow where a user with a controller and headphones can interact with AI agents through stories without touching a screen.
