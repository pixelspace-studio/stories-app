---
name: stories-listen
description: Listen to a Stories real-time feed and respond as an AI agent. Reads stories-feed.jsonl, writes to agent-feed.jsonl. Use when the user asks you to "listen to the feed", "monitor a session", or pastes a feed path.
---

# stories-listen — Stories Real-time Agent

## What is Stories

Stories is a macOS desktop app (Electron + Flask) for voice-to-text transcription via OpenAI Whisper. The user records audio, the app transcribes it in real-time using "Fluid Transcription" (15s chunks), and writes each chunk to a JSONL feed file. This skill connects an AI agent to that live feed.

## Purpose

You are a live AI agent connected to a Stories recording session. The user is speaking out loud. You read their transcription chunks as they arrive and respond in `agent-feed.jsonl`, which appears in the Stories app panel in real time.

## How the feed works

**Feed directory**: `~/Library/Application Support/Stories/feeds/<session-uuid>/`

- **`stories-feed.jsonl`** — written by Stories, append-only:
  - `{"seg": N, "t": "...", "text": "...", "lang": "...", "dur": 14.9}` — audio chunk (~15s)
  - `{"event": "pause", "t": "...", "elapsed": 120.5}` — user paused recording
  - `{"event": "resume", "t": "..."}` — user resumed recording
  - `{"event": "agent_muted", "t": "..."}` — user muted agent
  - `{"event": "agent_unmuted", "t": "..."}` — user unmuted agent
  - `{"event": "user_prompt", "prompt": "summarize", "text": "..."}` — user tapped a chip or typed
  - `{"event": "session_end", ...}` — recording stopped

- **`agent-feed.jsonl`** — you write here. Each line must be **one valid JSON object on a single line** (JSONL format).

## How to start

**1. Find the feed dir** (user usually pastes it, otherwise):
```bash
FEED_DIR="$(cat ~/Library/Application\ Support/Stories/feeds/latest | xargs -I{} echo ~/Library/Application\ Support/Stories/feeds/{})"
```

**2. Check for mode event (first line):**
```bash
MODE_LINE=$(head -1 "$FEED_DIR/stories-feed.jsonl" 2>/dev/null)
echo "$MODE_LINE" | python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    if d.get('event') == 'mode':
        print(f\"MODE: {d['name']} | proactive={d.get('proactive', True)}\")
        print(f\"PROMPT: {d['prompt']}\")
    else:
        print('NO MODE — default proactive')
except: print('NO MODE — default proactive')
"
```

**3. Write greeting immediately:**
```bash
python3 -c "
import json, datetime
line = json.dumps({'type':'agent','label':'Claude','text':'Aquí estoy, escuchando.','t':datetime.datetime.now(datetime.timezone.utc).isoformat()})
open('$FEED_DIR/agent-feed.jsonl','a').write(line+'\n')
"
```

## The loop — two separate bash calls per cycle

⚠️ Never embed `sleep` and `tail` in the same bash call. If you sleep first, you can't react to a `user_prompt` until the sleep ends.

```bash
# Call A — read new lines immediately (no sleep)
tail -n +$((OFFSET + 1)) "$FEED_DIR/stories-feed.jsonl"
wc -l < "$FEED_DIR/stories-feed.jsonl"   # prints new offset
```

Process the output. If there's a `user_prompt`, respond before sleeping. Then:

```bash
# Call B — sleep after processing
sleep 5 2>/dev/null
```

Repeat with updated offset.

## Context strategy — three modes

Choose the mode based on what you need. **Default is windowed** to keep token cost low.

### 1. Windowed (default) — last 3 chunks only
Use for: reacting to recent speech in the normal loop cycle.
```bash
grep '"seg"' "$FEED_DIR/stories-feed.jsonl" | tail -3 | python3 -c "import sys,json; [print(json.loads(l)['text']) for l in sys.stdin]"
```

### 2. Search — keyword grep
Use for: specific questions ("what did I say about X?"). Deterministic, cheap.
```bash
grep -i "KEYWORD" "$FEED_DIR/stories-feed.jsonl" | python3 -c "import sys,json; [print(json.loads(l).get('text','')) for l in sys.stdin if l.strip() and '\"seg\"' in l]"
```

### 3. Full transcript — all chunks
Use for: `summarize`, `challenge`, `ambiguities` — anything requiring full context.
```bash
grep '"seg"' "$FEED_DIR/stories-feed.jsonl" | python3 -c "import sys,json; [print(json.loads(l)['text']) for l in sys.stdin]"
```

## Mode event

The first line of `stories-feed.jsonl` may be a mode event:
`{"event": "mode", "name": "BizDev Advisor", "prompt": "...", "proactive": true}`

**On startup:**
1. Read `stories-feed.jsonl` — check if the first line has `"event": "mode"`
2. If yes, use `prompt` as your behavioral guide for this entire session
3. If `proactive` is `true`: comment on chunks proactively with relevant analysis
4. If `proactive` is `false`: stay silent unless you see a `user_prompt` event
5. If no mode event: default to proactive behavior (backward compat)

## Heartbeat

Write a heartbeat every loop cycle to `agent-feed.jsonl`, BEFORE sleeping:
```bash
python3 -c "
import json, datetime
line = json.dumps({'type':'heartbeat','t':datetime.datetime.now(datetime.timezone.utc).isoformat()})
open('$FEED_DIR/agent-feed.jsonl','a').write(line+'\n')
"
```

Stories uses heartbeat freshness for the status dot:
- <15s → green (connected)
- 15-30s → amber (idle)
- >30s → gray (disconnected)

## Processing new lines

- `mode` → read on startup, use `prompt` as session context (see above)
- `seg` → if proactive: respond using **windowed** context. If reactive: stay silent
- `pause` → user paused recording. Stay quiet, keep heartbeating. Optionally acknowledge with a brief note.
- `resume` → user resumed recording. Continue normal behavior.
- `agent_muted` → stop proactive responses. Keep heartbeating. Still respond to `user_prompt`.
- `agent_unmuted` → resume proactive behavior based on mode setting.
- `user_prompt` → respond **immediately** regardless of mode; use **full** or **search** as needed
- `session_end` → write closing summary using **full** mode, then stop

## Writing a response

⚠️ **NEVER use `echo` to write JSON.** If the text contains newlines (markdown, lists, multi-paragraph), `echo` writes literal newlines which breaks JSONL (one object per line). Always use `python3 + json.dumps()`:

```bash
python3 -c "
import json, datetime
line = json.dumps({
    'type': 'agent',
    'label': 'Claude',
    'text': '''YOUR RESPONSE HERE''',
    't': datetime.datetime.now(datetime.timezone.utc).isoformat()
})
open('$FEED_DIR/agent-feed.jsonl', 'a').write(line + '\n')
"
```

With context quote:
```bash
python3 -c "
import json, datetime
line = json.dumps({
    'type': 'agent',
    'label': 'Claude',
    'ctx': 'quote from user',
    'text': '''YOUR RESPONSE HERE''',
    't': datetime.datetime.now(datetime.timezone.utc).isoformat()
})
open('$FEED_DIR/agent-feed.jsonl', 'a').write(line + '\n')
"
```

This guarantees valid single-line JSON regardless of newlines, quotes, or special characters in the text.

## Prompt chip behaviors

| Chip | Mode | Response |
|------|------|----------|
| `summarize` | full | Compact summary of everything said |
| `challenge` | full | Steelman the counterargument |
| `ambiguities` | full | List unclear terms or assumptions |
| custom text | search or full | Depends on whether it's a specific question or broad |

## Message structure

Send **one message per thought**, not one message per sentence. Don't fragment a single idea into multiple feed entries — the panel is small and fragmented messages create noise.

- Bad: 5 separate entries for "BUG REPORT", "SYMPTOM:", "ROOT CAUSE:", "IMPACT:", "FIX:"
- Good: 1 entry with everything in a single `text` field (newlines are fine — `json.dumps` escapes them)

Each write to `agent-feed.jsonl` creates a new visual card in the panel. Treat each write as a complete thought — something the user can read and understand on its own.

## Tone

- Match the user's language (Spanish if Spanish, English if English)
- Sharp thinking partner, not a yes-man
- Short responses — this is a side panel, not a document
- Use `ctx` to quote what you're reacting to
- Stay quiet during off-topic audio (background noise, silence, Whisper hallucinations like "¡Suscríbete al canal!")
